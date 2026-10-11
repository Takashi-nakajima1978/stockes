const WEEK_MS = 7 * 86400000;
const HISTORY_WEEKS = 156;
const FORECAST_WEEKS = 3;

function seededRandom(seed = "") {
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  if (!state) state = 1;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  return sorted[lower] + ((sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower));
}

function dateKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function weeklyPrices(series, today, current, weeks = HISTORY_WEEKS) {
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

export function buildThreeWeekSurgeForecast({ symbol = "", series = [], current = null, today = "", pathCount = 1000, thresholdPct = 10 } = {}) {
  const grid = weeklyPrices(series, today, current);
  const prices = grid.prices;
  const currentPrice = Number(current) > 0 ? Number(current) : prices.at(-1);
  if (!(currentPrice > 0) || prices.length !== HISTORY_WEEKS + 1) return null;

  const blocks = [];
  for (let start = 0; start <= prices.length - FORECAST_WEEKS - 1; start += 1) {
    const window = prices.slice(start, start + FORECAST_WEEKS + 1);
    if (window.every((value) => Number.isFinite(value) && value > 0)) {
      blocks.push(window.slice(1).map((value, index) => Math.log(value / window[index])));
    }
  }
  const observedWeeks = prices.filter((value) => Number.isFinite(value) && value > 0).length - 1;
  if (observedWeeks < 100 || blocks.length < 52) return null;

  const count = Math.max(200, Math.min(5000, Math.floor(Number(pathCount) || 1000)));
  const random = seededRandom(`${symbol}:${today}:three-week-surge`);
  const samples = Array.from({ length: FORECAST_WEEKS }, () => []);
  const paths = [];
  let reachedThreshold = 0;
  let endedBelow = 0;
  for (let pathIndex = 0; pathIndex < count; pathIndex += 1) {
    const block = blocks[Math.floor(random() * blocks.length)];
    let value = currentPrice;
    let reached = false;
    const path = [];
    for (let week = 0; week < FORECAST_WEEKS; week += 1) {
      value *= Math.exp(block[week]);
      path.push(value);
      samples[week].push(value);
      if (value >= currentPrice * (1 + thresholdPct / 100)) reached = true;
    }
    paths.push(path);
    if (reached) reachedThreshold += 1;
    if (value <= currentPrice * 0.9) endedBelow += 1;
  }

  const terminalMedian = quantile(samples.at(-1), 0.5);
  const representative = paths.reduce((best, path) => (
    Math.abs(path.at(-1) - terminalMedian) < Math.abs(best.at(-1) - terminalMedian) ? path : best
  ), paths[0]);
  const future = Array.from({ length: FORECAST_WEEKS }, (_, index) => ({
    date: dateKey(new Date(`${today}T00:00:00Z`).getTime() + ((index + 1) * WEEK_MS)),
    value: representative[index],
    low: quantile(samples[index], 0.1),
    high: quantile(samples[index], 0.9),
    pathCount: count,
  }));
  const chartStart = Math.max(0, grid.dates.length - 13);
  const actual = grid.dates.slice(chartStart).map((date, index) => ({
    date,
    value: grid.prices[chartStart + index],
  })).filter((point) => Number.isFinite(point.value));

  return {
    currentPrice,
    today,
    endDate: future.at(-1).date,
    actual,
    forecast: [{ date: today, value: currentPrice, low: currentPrice, high: currentPrice, pathCount: count }, ...future],
    surgeProbabilityPct: (reachedThreshold / count) * 100,
    downsideProbabilityPct: (endedBelow / count) * 100,
    medianReturnPct: ((terminalMedian / currentPrice) - 1) * 100,
    terminalLow: quantile(samples.at(-1), 0.1),
    terminalMedian,
    terminalHigh: quantile(samples.at(-1), 0.9),
    observedWeeks,
    pathCount: count,
  };
}
