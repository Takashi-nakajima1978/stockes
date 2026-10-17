import test from "node:test";
import assert from "node:assert/strict";
import { buildForecastReflection, buildPortfolioRiskAnalysis, buildValidatedConfidenceCalibration } from "../portfolio-insights.mjs";

function weeklySeries(start = "2024-01-01", count = 130, change = (index) => Math.sin(index / 5) * 0.01) {
  const points = [];
  let close = 100;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  for (let index = 0; index < count; index += 1) {
    close *= Math.exp(change(index));
    points.push({ date: new Date(startTime + index * 7 * 86400000).toISOString().slice(0, 10), close });
  }
  return points;
}

function record(symbol, issuedDate, sector, action, realizedReturnPct) {
  const originPrice = 100;
  const targetDate = new Date(Date.parse(`${issuedDate}T00:00:00Z`) + 90 * 86400000).toISOString().slice(0, 10);
  const outcomeDate = new Date(Date.parse(`${targetDate}T00:00:00Z`) + 1 * 86400000).toISOString().slice(0, 10);
  return {
    version: "decision-weekly-calibrated-v1", issuedDate, targetDate, originPrice,
    predicted: 110, low: 90, high: 120,
    context: { action, sector, confidence: 70 },
    outcome: { date: outcomeDate, price: originPrice * (1 + realizedReturnPct / 100), errorPct: 2, baselineErrorPct: 3, directionCorrect: true, covered: true },
  };
}

test("portfolio stress separates direct USD translation from historical Japanese FX sensitivity", () => {
  const fx = weeklySeries("2024-01-01", 130, (i) => 0.002 * Math.sin(i / 7) + 0.0005);
  const japan = weeklySeries("2024-01-01", 130, (i) => 0.9 * (0.002 * Math.sin(i / 7) + 0.0005) + 0.003 * Math.sin(i / 3));
  const us = weeklySeries("2024-01-01", 130, (i) => 0.01 * Math.sin(i / 4));
  const result = buildPortfolioRiskAnalysis({
    usdJpyRate: 150,
    usdJpyTarget: 140,
    equityShockPct: -20,
    additionalCashYen: 500000,
    usdJpySeries: fx,
    holdings: [
      { symbol: "9005.T", name: "Rail", market: "jp", sector: "運輸", currentPrice: 1000, quantity: 100, annualDividendPerShare: 30, series: japan },
      { symbol: "AAPL", name: "Apple", market: "us", sector: "Technology", currentPrice: 100, quantity: 10, annualDividendPerShare: 1, series: us },
    ],
  });
  const usRow = result.stress.items.find((item) => item.symbol === "AAPL");
  const jpRow = result.stress.items.find((item) => item.symbol === "9005.T");
  assert.equal(usRow.fxImpactPct, ((140 / 150) - 1) * 100);
  assert.ok(Number.isFinite(jpRow.fxBeta));
  assert.equal(result.scenario.equityShockPct, -20);
  assert.ok(result.stress.coveragePct > 99);
  assert.ok(result.correlation.observations >= 100);
  assert.ok(result.correlation.topPairs.length >= 1);
  assert.ok(result.rebalancing.unallocatedYen >= 0);
  assert.ok(result.rebalancing.items.every((item) => item.amount <= 175000));
  assert.match(result.stress.caveat, /因果効果ではなく/);
});

test("missing USDJPY history does not silently enter JPY portfolio correlation", () => {
  const stock = weeklySeries();
  const result = buildPortfolioRiskAnalysis({
    usdJpyRate: 150,
    holdings: [{ symbol: "AAPL", market: "us", currentPrice: 100, quantity: 10, series: stock }],
  });
  assert.equal(result.correlation.coverageCount, 0);
  assert.equal(result.correlation.observations, 0);
});

test("reflection compares independent realized forecasts to both forecast and unchanged-price baselines", () => {
  const history = { instruments: {
    "jp:9005.T": [
      record("9005.T", "2026-01-01", "運輸", "BUY", 5),
      record("9005.T", "2026-02-01", "運輸", "BUY", 5),
    ],
    "us:AAPL": [record("AAPL", "2026-07-01", "Technology", "HOLD", -2)],
    "us:MSFT": [record("MSFT", "2026-04-01", "Technology", "BUY", 3)],
  } };
  const threeMonths = buildForecastReflection(history, 3, new Date("2026-10-20T12:00:00Z"));
  const sixMonths = buildForecastReflection(history, 6, new Date("2026-10-20T12:00:00Z"));
  assert.equal(threeMonths.overall.evaluated, 1);
  assert.equal(sixMonths.overall.evaluated, 2);
  assert.ok(Math.abs(threeMonths.overall.meanRealizedReturnPct + 2) < 1e-9);
  assert.match(threeMonths.note, /AIの傾向分析は保留/);
});

test("reflection scores BUY and SELL recommendations separately from price-direction forecasts", () => {
  const history = { instruments: {
    "us:AAPL": [record("AAPL", "2026-07-01", "Technology", "BUY", -2)],
    "us:MSFT": [record("MSFT", "2026-07-02", "Technology", "BUY", 3)],
    "us:NVDA": [record("NVDA", "2026-07-03", "Technology", "BUY", -1)],
  } };
  const reflection = buildForecastReflection(history, 3, new Date("2026-10-20T12:00:00Z"));
  const buy = reflection.actions.find((item) => item.key === "BUY");
  assert.equal(buy.recommendationEvaluated, 3);
  assert.ok(Math.abs(buy.recommendationHitRatePct - 33.3333333333) < 1e-8);
});

test("confidence calibration only emits sector-action cautions that beat a chronological holdout", () => {
  const instruments = {};
  const start = Date.parse("2024-01-01T00:00:00Z");
  for (let index = 0; index < 20; index += 1) {
    const issuedDate = new Date(start + index * 14 * 86400000).toISOString().slice(0, 10);
    instruments[`jp:1${String(index).padStart(3, "0")}.T`] = [record(`1${String(index).padStart(3, "0")}.T`, issuedDate, "建設", "BUY", -8)];
    instruments[`jp:2${String(index).padStart(3, "0")}.T`] = [record(`2${String(index).padStart(3, "0")}.T`, issuedDate, "小売", "BUY", 4)];
  }
  const calibration = buildValidatedConfidenceCalibration({ instruments }, new Date("2026-10-20T00:00:00Z"));
  const rule = calibration.rules.find((item) => item.sector === "建設" && item.action === "BUY");
  assert.ok(rule);
  assert.ok(rule.confidencePenalty >= 2 && rule.confidencePenalty <= 8);
  assert.ok(rule.training.evaluated >= 8);
  assert.ok(rule.validation.evaluated >= 5);
  assert.ok(rule.validation.hitRatePct < rule.validation.baselineHitRatePct);
});
