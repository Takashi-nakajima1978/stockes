import { buildSavingsContributionHistory, buildSavingsValuationHistory, scheduledContribution, savingsCurrentMonthBooked, savingsPurchaseSchedule } from "./public/savings-calculation.mjs";

export const SAVINGS_FORECAST_VERSION = "savings-12th-purchase-window-v3";
const DAY = 86400000;
const time = (date) => Date.parse(`${date}T00:00:00Z`);
const dateKey = (value) => new Date(value).toISOString().slice(0, 10);
const quantile = (sorted, fraction) => {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
};

export function savingsForecastFromDate(plan, today) {
  const date = new Date(time(today));
  const year = date.getUTCFullYear() - 3;
  const month = date.getUTCMonth();
  const first = savingsPurchaseSchedule(plan).map((row) => `${row.month}-01`).sort()[0];
  const historyStart = dateKey(Date.UTC(year, month, Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
  return first && first < historyStart ? first : historyStart;
}

export function buildSavingsForecast(plan, series, today) {
  const now = time(today);
  const quotes = [...new Map(series.filter((p) => p.date <= today && Number.isFinite(p.close) && p.close > 0)
    .map((p) => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const latest = quotes.at(-1);
  if (!latest || now - time(latest.date) > 14 * DAY) return { error: "基準価額が古いため、1年予測を作成できません。再取得してください。" };
  const month = today.slice(0, 7);
  const monthStart = new Date(time(`${month}-01`));
  const includeCurrent = savingsCurrentMonthBooked(plan, today);
  const through = includeCurrent ? month : dateKey(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 0))).slice(0, 7);
  const history = buildSavingsContributionHistory(plan, through, month);
  const valuation = buildSavingsValuationHistory(history, quotes, { ...plan, currentValueDate: plan.currentValueDate || today, today });
  if ((!valuation.rows.length && valuation.status !== "no_holdings") || valuation.unpricedMonths.length) {
    return { error: "現在評価額・元本・積立月の基準価額を確認してください。履歴が揃うまで予測を保留します。" };
  }

  const weekly = [];
  let index = 0;
  let observed = null;
  for (let week = 0; week <= 156; week += 1) {
    const at = now - (156 - week) * 7 * DAY;
    while (index < quotes.length && time(quotes[index].date) <= at) observed = quotes[index++];
    weekly.push(observed && at - time(observed.date) <= 10 * DAY ? observed.close : null);
  }
  // Keep whole historical years intact; do not invent week-to-week movements or bridge missing quotes.
  const windows = [];
  for (let start = 0; start + 52 < weekly.length; start += 1) {
    const values = weekly.slice(start, start + 53);
    if (values.every((value) => value > 0)) windows.push(values.map((value) => value / values[0]));
  }
  if (windows.length < 26) return { error: "1年予測に必要な基準価額の履歴が不足しています（連続1年の比較期間が26通り以上必要）。" };
  const futureYear = monthStart.getUTCFullYear() + 1;
  const end = Date.UTC(futureYear, monthStart.getUTCMonth(), Math.min(Number(today.slice(8)), new Date(Date.UTC(futureYear, monthStart.getUTCMonth() + 1, 0)).getUTCDate()));
  const endDate = dateKey(end);
  const dates = new Set([today, endDate]);
  for (let at = now + 7 * DAY; at < end; at += 7 * DAY) dates.add(dateKey(at));
  const cashflows = [];
  const purchaseSchedule = savingsPurchaseSchedule(plan);
  for (let offset = 0; offset <= 12; offset += 1) {
    const key = dateKey(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + offset, 1)).slice(0, 7);
    const purchaseDate = time(`${key}-12`);
    const at = Math.max(now + DAY, purchaseDate);
    if (at > end) continue;
    dates.add(dateKey(at));
    if (offset === 0 && includeCurrent) continue;
    const amount = scheduledContribution(purchaseSchedule, key, Boolean(plan.recurring));
    if (amount > 0) cashflows.push({ date: dateKey(at), month: key, amount });
  }
  const orderedDates = [...dates].sort();
  const amounts = new Map(cashflows.map((flow) => [flow.date, flow.amount]));
  const originValue = valuation.latestValue ?? 0;
  const baseline = [originValue];
  let deposits = 0;
  const totals = orderedDates.map((date) => { deposits += amounts.get(date) || 0; return deposits; });
  for (let i = 1; i < orderedDates.length; i += 1) baseline.push(originValue + totals[i]);
  const paths = windows.map((window) => {
    let units = originValue / latest.close;
    return orderedDates.map((date) => {
      const position = (time(date) - now) / (end - now) * 52;
      const week = Math.min(51, Math.floor(position));
      const fraction = position - week;
      const nav = latest.close * window[week] * Math.pow(window[week + 1] / window[week], fraction);
      units += (amounts.get(date) || 0) / nav;
      return { nav, value: units * nav };
    });
  });
  paths.sort((a, b) => a.at(-1).nav - b.at(-1).nav);
  const representative = paths[Math.floor((paths.length - 1) / 2)];
  const navForecast = [];
  const forecast = orderedDates.map((date, i) => {
    const navs = paths.map((p) => p[i].nav).sort((a, b) => a - b);
    const values = paths.map((p) => p[i].value).sort((a, b) => a - b);
    navForecast.push({ date, value: representative[i].nav, low: quantile(navs, 0.1), high: quantile(navs, 0.9) });
    return { date, value: representative[i].value, low: quantile(values, 0.1), high: quantile(values, 0.9),
      contributions: totals[i], baseline: baseline[i], gain: representative[i].value - baseline[i] };
  });
  return {
    version: SAVINGS_FORECAST_VERSION, today, endDate, sourceDate: latest.date, originValue,
    pathCount: paths.length, navForecast, forecast, cashflows,
    baseline: orderedDates.map((date, i) => ({ date, value: baseline[i] })),
    monthly: forecast.filter((p) => p.date === endDate || cashflows.some((flow) => flow.date === p.date)
      || new Date(time(p.date) + DAY).getUTCDate() === 1),
  };
}
