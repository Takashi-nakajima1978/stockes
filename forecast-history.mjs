import { createSerialQueue } from "./data-store.mjs";
import { SAVINGS_FORECAST_VERSION } from "./savings-forecast.mjs";

export const DECISION_FORECAST_VERSION = "decision-weekly-calibrated-v1";
const FILE = "forecast-history.json";
const DAY = 86400000;
const TOLERANCE_PCT = 5;
const INSTRUMENT_FIELDS = new Map([["crypto:BTC-JPY", "btcJpy"], ["fx:USD-JPY", "usdJpy"], ["fx:EUR-JPY", "eurJpy"]]);

export function forecastPriceFromCache(cache, market, symbol) {
  if (["jp", "us"].includes(market)) return cache.analyses?.find((analysis) => analysis.symbol === symbol)?.price;
  const field = INSTRUMENT_FIELDS.get(`${market}:${symbol}`);
  return field ? cache[field] : null;
}
const dateMs = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? Date.parse(`${date}T00:00:00Z`) : NaN;
const validDate = (date) => Number.isFinite(dateMs(date)) && new Date(dateMs(date)).toISOString().slice(0, 10) === date;
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function observations(series, today) {
  const byDate = new Map();
  for (const point of series || []) {
    if (validDate(point.date) && point.date < today && positive(point.close)) byDate.set(point.date, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function settleForecasts(records, series, today) {
  const prices = observations(series, today);
  let changed = false;
  for (const record of records) {
    if (record.outcome || record.targetDate >= today) continue;
    const actual = prices.find((point) => point.date >= record.targetDate);
    // A missing trading day may use the next session, never a stale pre-target quote.
    if (!actual || dateMs(actual.date) - dateMs(record.targetDate) > 7 * DAY) continue;
    record.outcome = {
      date: actual.date,
      price: actual.close,
      errorPct: Math.abs(record.predicted - actual.close) / actual.close * 100,
      baselineErrorPct: Math.abs(record.originPrice - actual.close) / actual.close * 100,
      directionCorrect: Math.sign(record.predicted - record.originPrice) === Math.sign(actual.close - record.originPrice),
      covered: actual.close >= record.low && actual.close <= record.high,
    };
    changed = true;
  }
  return changed;
}

export function summarizeForecasts(records, today, version = DECISION_FORECAST_VERSION) {
  const matching = records.filter((record) => record.version === version && record.issuedDate <= today)
    .sort((a, b) => a.issuedDate.localeCompare(b.issuedDate));
  const settled = matching.filter((record) => record.outcome?.date < today);
  const independent = [];
  for (const record of settled) {
    if (!independent.length || record.issuedDate > independent.at(-1).outcome.date) independent.push(record);
  }
  const count = independent.length;
  const successes = independent.filter((record) => record.outcome.errorPct <= TOLERANCE_PCT).length;
  const mean = (field) => count ? independent.reduce((sum, record) => sum + record.outcome[field], 0) / count : null;
  const future = matching.filter((record) => record.targetDate >= today);
  return {
    version,
    tolerancePct: TOLERANCE_PCT,
    saved: matching.length,
    evaluated: count,
    successes,
    confidencePct: count ? successes / count * 100 : null,
    directionAccuracyPct: count ? mean("directionCorrect") * 100 : null,
    meanAbsoluteErrorPct: mean("errorPct"),
    baselineErrorPct: mean("baselineErrorPct"),
    intervalCoveragePct: count ? mean("covered") * 100 : null,
    pending: future.length,
    missingActual: matching.length - settled.length - future.length,
    overlapping: settled.length - count,
    nextTargetDate: future[0]?.targetDate || "",
    comparisons: independent.slice(-12).reverse(),
  };
}

function snapshot(input, price, now) {
  const { market, symbol, version, forecast } = input;
  const fund = market === "fund";
  const today = fund ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now) : now.toISOString().slice(0, 10);
  if ((!["jp", "us", "fund"].includes(market) && !INSTRUMENT_FIELDS.has(`${market}:${symbol}`)) || typeof symbol !== "string" || !/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) {
    throw failure("予測の対象銘柄が正しくありません。");
  }
  if (version !== (fund ? SAVINGS_FORECAST_VERSION : DECISION_FORECAST_VERSION)) throw failure("予測の形式が更新されました。画面を再読み込みしてください。", 409);
  if (!Array.isArray(forecast) || forecast.length < 2 || forecast.length > (fund ? 70 : 20)) throw failure("予測データが不足しています。");
  const first = forecast[0];
  const terminal = forecast.at(-1);
  const horizonDays = (dateMs(terminal?.date) - dateMs(today)) / DAY;
  if (first?.date !== today || !validDate(terminal?.date) || horizonDays < (fund ? 365 : 89) || horizonDays > (fund ? 366 : 92)
      || ![first.value, terminal.value, terminal.low, terminal.high].every(positive)
      || terminal.low > terminal.value || terminal.value > terminal.high) {
    throw failure(`今日から${fund ? "1年" : "3か月"}先までの予測を保存してください。`, 409);
  }
  const prices = [...(price.series || [])].filter((point) => validDate(point.date) && point.date <= today && positive(point.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = prices.at(-1);
  const current = positive(price.current) ? price.current : latest?.close;
  if (!latest || dateMs(today) - dateMs(latest.date) > (fund ? 14 : 7) * DAY || !positive(current)) {
    throw failure("価格データが古いため、予測を保存できません。分析を更新してください。", 409);
  }
  if (Math.abs(first.value / current - 1) > 0.01) throw failure("現在値が更新されています。画面を再読み込みしてください。", 409);
  return {
    version, issuedDate: today, issuedAt: now.toISOString(), sourceDate: latest.date,
    originPrice: first.value, targetDate: terminal.date,
    predicted: terminal.value, low: terminal.low, high: terminal.high,
    context: sanitizeForecastContext(input.context),
  };
}

function sanitizeForecastContext(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const action = ["BUY", "HOLD", "SELL", "WATCH"].includes(String(source.action || "").toUpperCase())
    ? String(source.action).toUpperCase()
    : "";
  const sector = String(source.sector || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 60);
  const number = (input, minimum, maximum) => Number.isFinite(input) ? Math.max(minimum, Math.min(maximum, input)) : null;
  const context = {
    action,
    confidence: number(source.confidence, 0, 100),
    sector,
    trend3mPct: number(source.trend3mPct, -200, 500),
    volatilityPct: number(source.volatilityPct, 0, 500),
    priceRegime: String(source.priceRegime || "").slice(0, 40),
  };
  return Object.values(context).some((item) => item !== "" && item !== null) ? context : {};
}

export function createForecastHistory(store, now = () => new Date()) {
  const serial = createSerialQueue();
  return {
    record(input, price) {
      return serial(async () => {
        const current = snapshot(input, price, now());
        let history;
        try { history = await store.readJson(FILE); }
        catch (error) {
          if (error.code !== "ENOENT") throw error;
          history = { version: 1, instruments: {} };
        }
        if (history.version !== 1 || !history.instruments || typeof history.instruments !== "object" || Array.isArray(history.instruments)) {
          throw failure("予測履歴の形式を確認できません。保存済みデータは変更していません。", 500);
        }
        const key = `${input.market}:${input.symbol}`;
        const records = history.instruments[key] || [];
        if (!Array.isArray(records)) throw failure("予測履歴を読み込めません。", 500);
        let changed = settleForecasts(records, price.series, current.issuedDate);
        // Preserve the first forecast displayed each day, including forecasts that later miss.
        const existing = records.find((record) => record.issuedDate === current.issuedDate && record.version === current.version);
        if (!existing) { records.push(current); changed = true; }
        history.instruments[key] = records;
        if (changed) await store.write(FILE, JSON.stringify(history));
        return summarizeForecasts(records, current.issuedDate, current.version);
      });
    },
  };
}
