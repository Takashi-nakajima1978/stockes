import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createDataStore } from "../data-store.mjs";
import { createForecastHistory, forecastPriceFromCache, settleForecasts, summarizeForecasts, DECISION_FORECAST_VERSION } from "../forecast-history.mjs";
import { SAVINGS_FORECAST_VERSION } from "../savings-forecast.mjs";

const input = (date = "2026-01-14", target = "2026-04-14", symbol = "9005.T", market = "jp") => ({
  symbol, market, version: DECISION_FORECAST_VERSION,
  forecast: [{ date, value: 100 }, { date: target, value: 110, low: 80, high: 140 }],
});
const price = (date = "2026-01-13", close = 100) => ({ current: 100, series: [{ date, close }] });
const record = (issuedDate = "2026-01-14", targetDate = "2026-04-14", predicted = 110) => ({
  version: DECISION_FORECAST_VERSION, issuedDate, targetDate, originPrice: 100,
  predicted, low: 90, high: 120,
});

async function harness(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "forecast-history-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = new Date("2026-01-14T12:00:00Z");
  const store = createDataStore(root);
  return { root, store, service: createForecastHistory(store, () => now), setDate: (value) => { now = new Date(value); } };
}

test("the first displayed forecast is immutable for the day and survives a service restart", async (t) => {
  const { store, service } = await harness(t);
  const first = await service.record(input(), price());
  assert.equal(first.saved, 1);
  assert.equal(first.evaluated, 0);
  assert.equal(first.confidencePct, null);
  assert.equal(first.nextTargetDate, "2026-04-14");
  const edited = input();
  edited.forecast[1].value = 120;
  await service.record(edited, price());
  const restarted = createForecastHistory(store, () => new Date("2026-01-14T13:00:00Z"));
  await restarted.record(edited, price());
  const history = await store.readJson("forecast-history.json");
  assert.equal(history.instruments["jp:9005.T"].length, 1);
  assert.equal(history.instruments["jp:9005.T"][0].predicted, 110);
});

test("forecast records preserve bounded decision context for later reflection", async (t) => {
  const { store, service } = await harness(t);
  await service.record({
    ...input(),
    context: { action: "BUY", confidence: 78, sector: "建設", trend3mPct: -12, volatilityPct: 42, priceRegime: "pullback", prompt: "ignored" },
  }, price());
  const history = await store.readJson("forecast-history.json");
  const saved = history.instruments["jp:9005.T"][0].context;
  assert.deepEqual(saved, {
    action: "BUY", confidence: 78, sector: "建設", trend3mPct: -12, volatilityPct: 42, priceRegime: "pullback",
  });
});

test("concurrent JP and US saves preserve both currencies' records", async (t) => {
  const { store, service } = await harness(t);
  await Promise.all([
    service.record(input(), price()),
    service.record(input("2026-01-14", "2026-04-14", "AAPL", "us"), price()),
    service.record(input(), price()),
  ]);
  const history = await store.readJson("forecast-history.json");
  assert.equal(Object.keys(history.instruments).length, 2);
  assert.equal(history.instruments["us:AAPL"].length, 1);
});

test("saved forecasts are scored against later closed-session prices, not reconstructed predictions", async (t) => {
  const h = await harness(t);
  await h.service.record(input(), price());
  h.setDate("2026-04-14T12:00:00Z");
  let review = await h.service.record(input("2026-04-14", "2026-07-14"), price("2026-04-14", 110));
  assert.equal(review.evaluated, 0, "same-day quotes are not confirmed outcomes");
  h.setDate("2026-04-15T12:00:00Z");
  review = await h.service.record(input("2026-04-15", "2026-07-15"), price("2026-04-14", 110));
  assert.equal(review.evaluated, 1);
  assert.equal(review.confidencePct, 100);
  assert.equal(review.directionAccuracyPct, 100);
  assert.equal(review.meanAbsoluteErrorPct, 0);
  assert.equal(review.intervalCoveragePct, 100);
  assert.ok(Math.abs(review.baselineErrorPct - 1000 / 110) < 1e-9);
  assert.equal(review.comparisons[0].predicted, 110);
});

test("weekend horizons use the next session, while stale or future observations remain unscored", () => {
  const rows = [record("2026-01-18", "2026-04-18")];
  assert.equal(settleForecasts(rows, [{ date: "2026-04-17", close: 110 }, { date: "2026-04-20", close: 108 }], "2026-04-20"), false);
  assert.equal(settleForecasts(rows, [{ date: "2026-04-20", close: 108 }], "2026-04-21"), true);
  assert.equal(rows[0].outcome.date, "2026-04-20");
  const missing = [record()];
  assert.equal(settleForecasts(missing, [{ date: "2026-04-22", close: 110 }], "2026-04-23"), false);
  assert.equal(summarizeForecasts(missing, "2026-04-23").missingActual, 1);
  assert.equal(summarizeForecasts(missing, "2026-04-23").confidencePct, null);
});

test("scoring includes misses and removes overlapping windows and different model versions", () => {
  const rows = [
    record("2026-01-14", "2026-04-14", 105),
    record("2026-01-15", "2026-04-15", 100),
    record("2026-04-16", "2026-07-16", 130),
    { ...record("2025-10-01", "2026-01-01", 100), version: "old" },
  ];
  settleForecasts(rows, ["2026-01-01", "2026-04-14", "2026-04-15", "2026-07-16"].map((date) => ({ date, close: 100 })), "2026-07-17");
  const summary = summarizeForecasts(rows, "2026-07-17");
  assert.equal(summary.saved, 3);
  assert.equal(summary.evaluated, 2);
  assert.equal(summary.overlapping, 1);
  assert.equal(summary.successes, 1, "exactly 5% error qualifies, but a 30% miss does not");
  assert.equal(summary.confidencePct, 50);
  assert.equal(summary.meanAbsoluteErrorPct, 17.5);
  assert.equal(summary.directionAccuracyPct, 0);
  assert.equal(summary.baselineErrorPct, 0, "constant-price benchmark must not disappear");
  assert.equal(summary.comparisons[0].predicted, 130);
});

test("a saved outcome is never rewritten when later price history changes", () => {
  const rows = [record()];
  settleForecasts(rows, [{ date: "2026-04-14", close: 90 }], "2026-04-15");
  const first = JSON.stringify(rows);
  assert.equal(settleForecasts(rows, [{ date: "2026-04-14", close: 110 }], "2026-04-16"), false);
  assert.equal(JSON.stringify(rows), first);
});

test("backdated, stale, malformed or incompatible forecasts cannot enter the ledger", async (t) => {
  const { service } = await harness(t);
  await assert.rejects(service.record(input("2026-01-13"), price()), { statusCode: 409 });
  await assert.rejects(service.record(input(), price("2025-12-01")), { statusCode: 409 });
  await assert.rejects(service.record({ ...input(), version: "old" }, price()), { statusCode: 409 });
  await assert.rejects(service.record(input("2026-01-14", "2026-05-14"), price()), { statusCode: 409 });
  const invalid = input();
  invalid.forecast[1].value = null;
  await assert.rejects(service.record(invalid, price()), { statusCode: 409 });
  const mismatch = input();
  mismatch.forecast[0].value = 120;
  await assert.rejects(service.record(mismatch, price()), { statusCode: 409 });
});

test("corrupt existing history fails without overwriting the file", async (t) => {
  const { root, service } = await harness(t);
  const file = path.join(root, "forecast-history.json");
  await writeFile(file, "{broken", "utf8");
  await assert.rejects(service.record(input(), price()));
  assert.equal(await readFile(file, "utf8"), "{broken");
});

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
function loadFunction(name, globals = {}) {
  const start = appSource.indexOf(`function ${name}(`);
  return vm.runInNewContext(`${appSource.slice(start, appSource.indexOf("\n}", start) + 2)}; ${name}`, globals);
}
const label = loadFunction("forecastReliabilityText");
const html = loadFunction("forecastReliabilityHtml", { forecastReliabilityText: label, escapeHtml: (value) => String(value), formatDate: (value) => value });

test("zero outcomes are labeled as accumulating and retrospective tests never masquerade as saved forecasts", () => {
  const result = html({ evaluated: 6, directionAccuracyPct: 100, medianAbsoluteErrorPct: 2, intervalCoveragePct: 100 }, { ...summarizeForecasts([], "2026-01-14"), saved: 2, pending: 2, nextTargetDate: "2027-01-14" }, input().forecast, (value) => `JPY ${value}`, "", { compact: true });
  assert.match(result, /蓄積中/);
  assert.match(result, /保存予測 2件 \/ 実績比較 0件 \/ 期限待ち 2件・初回照合 2027-01-14/);
  assert.match(result, /当時の保存予測ではありません/);
  assert.match(result, /上記の信頼度には含めません/);
  assert.doesNotMatch(result, /信頼度 100%/);
});

test("confidence, sample count, misses, benchmark and tooltip are visible with real outcomes", () => {
  const rows = [record("2026-01-14", "2026-04-14", 130)];
  settleForecasts(rows, [{ date: "2026-04-14", close: 100 }], "2026-04-15");
  const summary = summarizeForecasts(rows, "2026-04-15");
  const result = html(null, summary, input().forecast, (value) => `$${value}`);
  assert.match(result, /信頼度 0%.*1件・少数データ/);
  assert.match(result, /価格一定の場合の誤差/);
  assert.match(result, /外れ/);
  assert.match(result, /\$130/);
  assert.match(result, /\$100/);
  const tooltip = loadFunction("chartPointTooltipHtml", { escapeHtml: String, formatDate: String });
  assert.match(tooltip({ kind: "forecast", date: "2026-04-14", value: 110, reliability: { text: label(summary) } }, String), /信頼度 0%/);
  assert.doesNotMatch(tooltip({ kind: "actual", date: "2026-04-14", value: 100, reliability: { text: label(summary) } }, String), /信頼度/);
});

test("a failed history request is distinct from zero evaluated forecasts", () => {
  const result = html(null, null, input().forecast, String, "保存できませんでした");
  assert.match(result, /信頼度：照合できません/);
  assert.match(result, /保存できませんでした/);
  assert.doesNotMatch(result, /信頼度：蓄積中|まだ比較できる実績がありません/);
});

test("client and persisted forecast model versions agree", () => {
  assert.ok(appSource.includes(`const DECISION_FORECAST_VERSION = "${DECISION_FORECAST_VERSION}";`));
});

test("BTC/JPY and both FX forecasts use distinct cached series and independent records", async (t) => {
  const { store, service } = await harness(t);
  const cache = { btcJpy: price(), usdJpy: price(), eurJpy: price() };
  for (const [market, symbol, field] of [["crypto", "BTC-JPY", "btcJpy"], ["fx", "USD-JPY", "usdJpy"], ["fx", "EUR-JPY", "eurJpy"]]) {
    assert.equal(forecastPriceFromCache(cache, market, symbol), cache[field]);
    await service.record(input("2026-01-14", "2026-04-14", symbol, market), cache[field]);
  }
  assert.equal(Object.keys((await store.readJson("forecast-history.json")).instruments).length, 3);
  assert.equal(forecastPriceFromCache(cache, "fx", "BTC-JPY"), null);
  await assert.rejects(service.record(input("2026-01-14", "2026-04-14", "BTC-JPY", "fx"), price()), { statusCode: 400 });
});

test("fund confidence uses only saved one-year predictions, with no mixing of three-month outcomes", async (t) => {
  const h = await harness(t);
  const fundInput = { ...input("2026-01-14", "2027-01-14", "03311065", "fund"), version: SAVINGS_FORECAST_VERSION };
  const first = await h.service.record(fundInput, price());
  assert.equal(first.confidencePct, null);
  assert.equal(first.version, SAVINGS_FORECAST_VERSION);
  await assert.rejects(h.service.record({ ...fundInput, version: DECISION_FORECAST_VERSION }, price()), { statusCode: 409 });
  await assert.rejects(h.service.record({ ...fundInput, forecast: input().forecast }, price()), { statusCode: 409 });
  h.setDate("2027-01-15T12:00:00Z");
  const next = { ...input("2027-01-15", "2028-01-15", "03311065", "fund"), version: SAVINGS_FORECAST_VERSION };
  const result = await h.service.record(next, price("2027-01-14", 100));
  assert.equal(result.evaluated, 1);
  assert.equal(result.confidencePct, 0);
  assert.equal(result.meanAbsoluteErrorPct, 10);
  const rendered = html(null, result, next.forecast, String, "", { savings: true, horizon: "1年先" });
  assert.match(rendered, /1年先・1件/);
  assert.match(rendered, /基準価額一定の場合/);
  assert.match(rendered, /評価額そのものの的中率ではありません/);
  assert.doesNotMatch(rendered, /3か月先/);
});

test("fund snapshots use Japan's calendar day even before UTC midnight", async (t) => {
  const h = await harness(t);
  h.setDate("2026-01-13T16:00:00Z");
  const review = await h.service.record({ ...input("2026-01-14", "2027-01-14", "03311065", "fund"), version: SAVINGS_FORECAST_VERSION }, price());
  assert.equal(review.saved, 1);
});
