import test from "node:test";
import assert from "node:assert/strict";
import { buildThreeMonthSurgeForecast, SURGE_FORECAST_HORIZON_WEEKS } from "../surge-forecast.mjs";

const dayMs = 86400000;
const weekMs = 7 * dayMs;

function sampleHistory(weeks = 156) {
  const today = "2026-10-11";
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const changes = [0.025, -0.018, 0.042, -0.031, 0.012, 0.055, -0.047, 0.008, 0.021, -0.011, 0.034, -0.026];
  let close = 100;
  const series = Array.from({ length: weeks + 1 }, (_, index) => {
    const point = { date: new Date(todayMs - ((weeks - index) * weekMs)).toISOString().slice(0, 10), close };
    close *= Math.exp(changes[index % changes.length]);
    return point;
  });
  return { today, current: series.at(-1).close, series };
}

test("three-month surge forecast samples 3-year weekly history and builds a dated range", () => {
  const input = sampleHistory();
  const first = buildThreeMonthSurgeForecast({ symbol: "7203.T", ...input, pathCount: 1000 });
  const second = buildThreeMonthSurgeForecast({ symbol: "7203.T", ...input, pathCount: 1000 });

  assert.ok(first);
  assert.deepEqual(first, second);
  assert.equal(first.observedWeeks, 156);
  assert.equal(first.pathCount, 144, "resampling the same historical windows cannot inflate the evidence count");
  assert.equal(first.actual.length, 13);
  assert.equal(SURGE_FORECAST_HORIZON_WEEKS, 13);
  assert.equal(first.forecast.length, 14);
  assert.equal(first.forecast[0].date, input.today);
  assert.equal(first.forecast.at(-1).date, "2027-01-10");
  assert.ok(first.surgeProbabilityPct >= 0 && first.surgeProbabilityPct <= 100);
  assert.ok(first.downsideProbabilityPct >= 0 && first.downsideProbabilityPct <= 100);
  assert.ok(first.terminalLow <= first.terminalMedian && first.terminalMedian <= first.terminalHigh);
  assert.ok(first.forecast.slice(1).every((point) => point.low <= point.value && point.value <= point.high));
});

test("surge figures enumerate all windows without lottery noise and account for costs", () => {
  const input = sampleHistory();
  const first = buildThreeMonthSurgeForecast({ ...input, symbol: "A", pathCount: 1000 });
  const second = buildThreeMonthSurgeForecast({ ...input, symbol: "B", pathCount: 5000 });
  assert.deepEqual(first, second);
  const paid = buildThreeMonthSurgeForecast({ ...input, roundTripFeePct: 20, capitalGainTaxPct: 20 });
  assert.ok(paid.netExpectedReturnPct < first.netExpectedReturnPct);
  assert.ok(paid.netLossProbabilityPct >= first.netLossProbabilityPct);
  assert.ok(paid.netTailReturnPct <= paid.netExpectedReturnPct);
  assert.ok(paid.drawdownProbabilityPct >= paid.downsideProbabilityPct);
  assert.deepEqual(paid.forecast, first.forecast, "price paths are not after-tax cash values");
});

test("stale prices and future observations cannot make a valid surge candidate", () => {
  const input = sampleHistory();
  assert.equal(buildThreeMonthSurgeForecast({ ...input, today: "2026-11-01" }), null);
  assert.equal(buildThreeMonthSurgeForecast({ ...input, roundTripFeePct: NaN }), null);
  const first = buildThreeMonthSurgeForecast(input);
  const future = buildThreeMonthSurgeForecast({ ...input, series: [...input.series, { date: "2026-12-01", close: 999999 }] });
  assert.deepEqual(first, future);
});

test("three-month surge forecast excludes symbols without enough contiguous history", () => {
  const input = sampleHistory(90);
  assert.equal(buildThreeMonthSurgeForecast({ symbol: "SHORT", ...input }), null);
});
