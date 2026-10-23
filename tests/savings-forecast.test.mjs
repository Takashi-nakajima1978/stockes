import test from "node:test";
import assert from "node:assert/strict";
import { buildSavingsForecast, savingsForecastFromDate, SAVINGS_FORECAST_VERSION } from "../savings-forecast.mjs";

const DAY = 86400000;
const today = "2026-10-14";
function seriesFor(date = today, flat = false) {
  const end = Date.parse(date);
  return Array.from({ length: 161 }, (_, i) => ({
    date: new Date(end - (160 - i) * 7 * DAY).toISOString().slice(0, 10),
    close: flat ? 10000 : 10000 * Math.exp(i * 0.001 + Math.sin(i / 3) * 0.1 + Math.cos(i / 13) * 0.08),
  }));
}
const plan = {
  id: "test", symbol: "03311065", provider: "ideco", recurring: true,
  currentValue: 2467742, currentPrincipal: 2342597, currentValueDate: today,
  currentMonthIncluded: false, balanceBasis: "current",
  schedule: [{ month: "2026-04", amount: 37800 }],
};

test("one-year savings forecast preserves holdings, adds deposits and separates investment gains", () => {
  const result = buildSavingsForecast(plan, seriesFor(today, true), today);
  assert.equal(result.error, undefined);
  assert.equal(result.version, SAVINGS_FORECAST_VERSION);
  assert.equal(result.today, today);
  assert.equal(result.endDate, "2027-10-14");
  assert.ok(result.forecast.length >= 53);
  assert.equal(result.originValue, 2467742);
  assert.equal(result.cashflows.length, 13);
  assert.equal(result.cashflows[0].date, "2026-10-15");
  assert.equal(result.cashflows[1].date, "2026-11-12");
  const last = result.forecast.at(-1);
  assert.equal(last.contributions, 37800 * 13);
  assert.ok(Math.abs(last.value - (2467742 + 37800 * 13)) < 1e-8);
  assert.ok(Math.abs(last.gain) < 1e-8);
  assert.equal(result.baseline.at(-1).value, 2467742 + 37800 * 13);
  assert.equal(result.monthly.at(-1).date, result.endDate);
});

test("month-specific changes, included current month and non-recurring settings are respected", () => {
  const changed = { ...plan, currentMonthIncluded: true, schedule: [...plan.schedule, { month: "2027-01", amount: 100000 }] };
  const result = buildSavingsForecast(changed, seriesFor(today, true), today);
  assert.equal(result.cashflows[0].month, "2026-11");
  assert.equal(result.forecast[0].value, plan.currentValue);
  assert.equal(result.forecast.at(-1).contributions, 37800 * 2 + 100000 * 10);
  const stopped = buildSavingsForecast({ ...changed, recurring: false }, seriesFor(today, true), today);
  assert.deepEqual(stopped.cashflows, [{ date: "2027-01-12", month: "2027-01", amount: 100000 }]);
});

test("forecast paths vary weekly, are repeatable, and do not use future observations", () => {
  const series = seriesFor();
  const first = buildSavingsForecast(plan, series, today);
  assert.deepEqual(buildSavingsForecast(plan, series, today), first);
  assert.deepEqual(buildSavingsForecast(plan, [...series, { date: "2027-01-01", close: 1e12 }], today), first);
  const changes = first.navForecast.slice(1).map((p, i) => Math.sign(p.value - first.navForecast[i].value));
  assert.ok(changes.includes(1) && changes.includes(-1));
  assert.ok(first.forecast.at(-1).high > first.forecast.at(-1).low);
  assert.ok(first.forecast.every((p) => p.value > 0 && p.low <= p.high));
  assert.equal(first.forecast.at(-1).gain, first.forecast.at(-1).value - first.baseline.at(-1).value);
});

test("a purchase made around the 12th is included now and not forecast a second time", () => {
  const planBeforePurchase = { ...plan, currentValueDate: "2026-10-11", currentMonthIncluded: false };
  const result = buildSavingsForecast(planBeforePurchase, seriesFor("2026-10-19", true), "2026-10-19");
  assert.equal(result.cashflows[0].month, "2026-11");
  assert.equal(result.cashflows[0].date, "2026-11-12");
  assert.equal(result.cashflows.length, 12);
  assert.ok(result.originValue > plan.currentValue, "the current month's purchase is included in the starting valuation");
});

test("credit-card deposits are forecast for the month after the debit", () => {
  const cardPlan = { ...plan, provider: "rakuten", paymentMethod: "credit", schedule: [{ month: "2026-10", amount: 37800 }] };
  const result = buildSavingsForecast(cardPlan, seriesFor(today, true), today);
  assert.equal(result.version, "savings-12th-purchase-window-v3");
  assert.equal(result.cashflows[0].month, "2026-11");
  assert.equal(result.cashflows[0].date, "2026-11-12");
  assert.equal(result.cashflows.length, 12);
});

test("fund price forecast does not change when balances or monthly deposits change", () => {
  const first = buildSavingsForecast(plan, seriesFor(), today);
  const second = buildSavingsForecast({ ...plan, id: "other", currentValue: 4000000, currentMonthIncluded: true,
    schedule: [{ month: "2026-04", amount: 5000 }, { month: "2027-04", amount: 80000 }] }, seriesFor(), today);
  assert.deepEqual(first.navForecast, second.navForecast);
  assert.notEqual(first.forecast.at(-1).value, second.forecast.at(-1).value);
});

test("insufficient or stale NAV and inconsistent balances never produce a fabricated forecast", () => {
  assert.match(buildSavingsForecast(plan, seriesFor().slice(-52), today).error, /履歴が不足/);
  assert.match(buildSavingsForecast(plan, seriesFor().slice(0, -3), today).error, /古い/);
  assert.match(buildSavingsForecast({ ...plan, currentValue: 1 }, seriesFor(), today).error, /確認/);
  const sparse = seriesFor().filter((_, i) => i % 20 > 2);
  assert.match(buildSavingsForecast(plan, sparse, today).error, /履歴が不足/);
});

test("calendar years clamp leap days, and an unbooked purchase date never precedes the forecast origin", () => {
  const leap = "2024-02-29";
  const result = buildSavingsForecast({ ...plan, currentValueDate: leap, schedule: [{ month: "2023-04", amount: 5000 }] }, seriesFor(leap), leap);
  assert.equal(result.endDate, "2025-02-28");
  assert.equal(result.cashflows[0].date, "2024-03-01");
  assert.equal(result.cashflows[0].month, "2024-02");
  assert.equal(result.forecast[0].contributions, 0);
});

test("NAV acquisition includes three years independently of the registered savings start month", () => {
  assert.equal(savingsForecastFromDate(plan, today), "2023-10-14");
  assert.equal(savingsForecastFromDate({ schedule: [] }, "2024-02-29"), "2021-02-28");
  assert.equal(savingsForecastFromDate({ schedule: [{ month: "2020-01", amount: 1 }] }, today), "2020-01-01");
});
