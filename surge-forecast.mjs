import { afterCostReturn } from "./investment-evidence.mjs";

const WEEK_MS = 7 * 86400000;
export const SURGE_FORECAST_VERSION = 2;
export const SURGE_FORECAST_HISTORY_WEEKS = 156;
export const SURGE_FORECAST_HORIZON_WEEKS = 13;

function quantile(values, ratio, presorted = false) {
  const sorted = presorted ? values : values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  return sorted[lower] + ((sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower));
}

function dateKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function weeklyPrices(series, today, current, weeks = SURGE_FORECAST_HISTORY_WEEKS) {
  const asOfMs = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(asOfMs)) return { dates: [], prices: [] };
  const points = (series || [])
    .filter((point) => point?.date && point.date <= today && Number(point.close) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const dates = [];
  const prices = [];
  let index = 0;
  let latest = null;
  for (let week = 0; week <= weeks; week += 1) {
    const time = asOfMs - ((weeks - week) * WEEK_MS);
    const date = dateKey(time);
    dates.push(date);
    while (index < points.length && points[index].date <= date) latest = points[index++];
    const age = latest ? (time - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86400000 : Infinity;
    prices.push(age <= 10 ? Number(latest.close) : null);
  }
  if (Number.isFinite(Number(current)) && Number(current) > 0) prices[weeks] = Number(current);
  return { dates, prices };
}

export function buildThreeMonthSurgeForecast({ series = [], current = null, today = "", thresholdPct = 10, roundTripFeePct = 0, capitalGainTaxPct = 0 } = {}) {
  const latestDate = series.filter((point) => point?.date <= today && Number(point.close) > 0)
    .reduce((latest, point) => point.date > latest ? point.date : latest, "");
  const quoteAgeDays = (Date.parse(today) - Date.parse(latestDate)) / 86400000;
  if (!Number.isFinite(quoteAgeDays) || quoteAgeDays > 10
    || !Number.isFinite(roundTripFeePct) || roundTripFeePct < 0
    || !Number.isFinite(capitalGainTaxPct) || capitalGainTaxPct < 0 || capitalGainTaxPct > 100) return null;
  const grid = weeklyPrices(series, today, current);
  const prices = grid.prices;
  const currentPrice = Number(current) > 0 ? Number(current) : prices.at(-1);
  if (!(currentPrice > 0) || prices.length !== SURGE_FORECAST_HISTORY_WEEKS + 1) return null;

  const blocks = [];
  for (let start = 0; start <= prices.length - SURGE_FORECAST_HORIZON_WEEKS - 1; start += 1) {
    const window = prices.slice(start, start + SURGE_FORECAST_HORIZON_WEEKS + 1);
    if (window.every((value) => Number.isFinite(value) && value > 0)) {
      blocks.push(window.slice(1).map((value, index) => Math.log(value / window[index])));
    }
  }
  const observedWeeks = prices.filter((value) => Number.isFinite(value) && value > 0).length - 1;
  if (observedWeeks < 100 || blocks.length < 52) return null;

  // Enumerate each observed window once: resampling identical blocks adds no information.
  const count = blocks.length;
  const samples = Array.from({ length: SURGE_FORECAST_HORIZON_WEEKS }, () => []);
  const netReturns = [];
  let reachedThreshold = 0;
  let endedBelow = 0;
  let fellBelow = 0;
  for (const block of blocks) {
    let value = currentPrice;
    let reached = false;
    let fell = false;
    for (let week = 0; week < SURGE_FORECAST_HORIZON_WEEKS; week += 1) {
      value *= Math.exp(block[week]);
      samples[week].push(value);
      if (value >= currentPrice * (1 + thresholdPct / 100)) reached = true;
      if (value <= currentPrice * 0.9) fell = true;
    }
    if (reached) reachedThreshold += 1;
    if (value <= currentPrice * 0.9) endedBelow += 1;
    if (fell) fellBelow += 1;
    netReturns.push(afterCostReturn((value / currentPrice - 1) * 100, roundTripFeePct, capitalGainTaxPct));
  }

  samples.forEach((sample, index) => { samples[index] = sample.filter(Number.isFinite).sort((a, b) => a - b); });
  const medianValues = samples.map((sample) => quantile(sample, 0.5, true));
  const terminalMedian = medianValues.at(-1);
  netReturns.sort((a, b) => a - b);
  const netExpectedReturnPct = netReturns.reduce((sum, value) => sum + value, 0) / count;
  const tailCount = Math.max(1, Math.ceil(count * 0.1));
  const netTailReturnPct = netReturns.slice(0, tailCount).reduce((sum, value) => sum + value, 0) / tailCount;
  const future = Array.from({ length: SURGE_FORECAST_HORIZON_WEEKS }, (_, index) => ({
    date: dateKey(new Date(`${today}T00:00:00Z`).getTime() + ((index + 1) * WEEK_MS)),
    value: medianValues[index],
    low: quantile(samples[index], 0.1, true),
    high: quantile(samples[index], 0.9, true),
    pathCount: count,
  }));
  const chartStart = Math.max(0, grid.dates.length - 13);
  const actual = grid.dates.slice(chartStart).map((date, index) => ({
    date,
    value: grid.prices[chartStart + index],
  })).filter((point) => Number.isFinite(point.value));

  return {
    currentPrice,
    modelVersion: SURGE_FORECAST_VERSION,
    quoteDate: latestDate,
    today,
    endDate: future.at(-1).date,
    actual,
    forecast: [{ date: today, value: currentPrice, low: currentPrice, high: currentPrice, pathCount: count }, ...future],
    surgeProbabilityPct: (reachedThreshold / count) * 100,
    downsideProbabilityPct: (endedBelow / count) * 100,
    drawdownProbabilityPct: (fellBelow / count) * 100,
    netLossProbabilityPct: (netReturns.filter((value) => value < 0).length / count) * 100,
    netExpectedReturnPct,
    netMedianReturnPct: quantile(netReturns, 0.5, true),
    netTailReturnPct,
    roundTripFeePct,
    capitalGainTaxPct,
    riskRewardScore: netExpectedReturnPct / Math.max(1, -netTailReturnPct),
    medianReturnPct: ((terminalMedian / currentPrice) - 1) * 100,
    terminalLow: quantile(samples.at(-1), 0.1, true),
    terminalMedian,
    terminalHigh: quantile(samples.at(-1), 0.9, true),
    observedWeeks,
    pathCount: count,
  };
}
