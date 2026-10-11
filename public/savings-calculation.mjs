export function scheduledContribution(schedule = [], month = "", recurring = false) {
  const entries = [...(Array.isArray(schedule) ? schedule : [])]
    .filter((item) => /^\d{4}-\d{2}$/.test(item?.month) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  const exact = entries.find((item) => item.month === month);
  if (exact) return Number(exact.amount);
  if (!recurring) return 0;
  const prior = entries.filter((item) => item.month <= month).at(-1);
  return prior ? Number(prior.amount) : 0;
}

export function buildSavingsForecast(plan = {}, series = [], options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const horizonMonths = Math.max(1, Math.min(120, Math.round(Number(options.months) || 120)));
  const initialValue = Math.max(0, Number(plan.currentValue) || 0);
  const monthEnds = new Map();
  for (const point of Array.isArray(series) ? series : []) {
    const month = String(point?.date || "").slice(0, 7);
    const close = Number(point?.close);
    if (/^\d{4}-\d{2}$/.test(month) && Number.isFinite(close) && close > 0) {
      const previous = monthEnds.get(month);
      if (!previous || String(point.date) > previous.date) monthEnds.set(month, { date: point.date, close });
    }
  }
  const monthPrices = [...monthEnds.entries()].sort(([a], [b]) => a.localeCompare(b));
  const returns = [];
  for (let index = 1; index < monthPrices.length; index += 1) {
    const [previousMonth, previous] = monthPrices[index - 1];
    const [month, current] = monthPrices[index];
    const elapsedMonths = (Number(month.slice(0, 4)) - Number(previousMonth.slice(0, 4))) * 12
      + Number(month.slice(5, 7)) - Number(previousMonth.slice(5, 7));
    if (elapsedMonths === 1) {
      const change = current.close / previous.close - 1;
      if (Number.isFinite(change) && change > -1) returns.push(change);
    }
  }
  if (returns.length < 6) {
    return {
      today,
      endDate: today,
      forecast: [{ date: today, value: initialValue, low: initialValue, high: initialValue, principal: initialValue }],
      forecastTotal: initialValue,
      forecastLow: initialValue,
      forecastHigh: initialValue,
      totalContributions: initialValue,
      sampleCount: returns.length,
      historyUnavailable: true,
    };
  }

  const currentMonth = today.slice(0, 7);
  const startYear = Number(currentMonth.slice(0, 4));
  const startMonth = Number(currentMonth.slice(5, 7)) - 1;
  const months = Array.from({ length: horizonMonths }, (_, index) => {
    const date = new Date(Date.UTC(startYear, startMonth + index + 1, 0));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      date: date.toISOString().slice(0, 10),
    };
  });
  const paths = Math.max(100, Math.min(1000, Math.round(Number(options.paths) || 1000)));
  let seed = 2166136261;
  for (const char of String(plan.symbol || plan.id || "savings")) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const valuesByMonth = months.map(() => []);
  const principalByMonth = [];
  let principal = initialValue;
  for (const month of months) {
    principal += scheduledContribution(plan.schedule, month.key, Boolean(plan.recurring));
    principalByMonth.push(principal);
  }
  for (let pathIndex = 0; pathIndex < paths; pathIndex += 1) {
    let value = initialValue;
    months.forEach((month, monthIndex) => {
      value += scheduledContribution(plan.schedule, month.key, Boolean(plan.recurring));
      const sampledReturn = returns[Math.floor(random() * returns.length)];
      value *= 1 + sampledReturn;
      valuesByMonth[monthIndex].push(value);
    });
  }
  const quantile = (values, fraction) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * fraction)];
  };
  const forecast = [{ date: today, value: initialValue, low: initialValue, high: initialValue, principal: initialValue }];
  months.forEach((month, index) => {
    forecast.push({
      date: month.date,
      value: quantile(valuesByMonth[index], 0.5),
      low: quantile(valuesByMonth[index], 0.1),
      high: quantile(valuesByMonth[index], 0.9),
      principal: principalByMonth[index],
    });
  });
  const final = forecast.at(-1);
  const firstPrice = monthPrices[0][1].close;
  const lastPrice = monthPrices.at(-1)[1].close;
  const years = Math.max(1 / 12, (monthPrices.length - 1) / 12);
  const historicalAnnualizedPct = ((lastPrice / firstPrice) ** (1 / years) - 1) * 100;
  return {
    today,
    endDate: final.date,
    forecast,
    forecastTotal: final.value,
    forecastLow: final.low,
    forecastHigh: final.high,
    totalContributions: final.principal,
    sampleCount: returns.length,
    historicalAnnualizedPct: Number.isFinite(historicalAnnualizedPct) ? historicalAnnualizedPct : null,
    historyUnavailable: false,
  };
}
