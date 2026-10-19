import test from "node:test";
import assert from "node:assert/strict";
import { buildSavingsContributionHistory, buildSavingsValuationHistory } from "../public/savings-calculation.mjs";

const plan = { recurring: true, schedule: [{ month: "2026-03", amount: 5000 }] };
const history = buildSavingsContributionHistory(plan, "2026-05");
const series = [
  { date: "2026-03-02", close: 10000 },
  { date: "2026-04-06", close: 20000 },
  { date: "2026-05-04", close: 15000 },
  { date: "2026-06-01", close: 18000 },
];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test("existing fund holdings are reconstructed in units, ending at the entered value", () => {
  const result = buildSavingsValuationHistory(history, series, { currentValue: 100000, currentValueDate: "2026-06-01" });
  const addedUnits = .5 + .25 + 1 / 3;
  const opening = (100000 / 18000 - addedUnits) * 10000;
  assert.equal(result.status, "reconstructed");
  near(result.latestValue, 100000);
  near(result.openingValue, opening);
  assert.notEqual(result.openingValue, 100000 - 15000, "cash subtraction ignores NAV changes");
  near(result.rows[0].value, opening + 5000);
  near(result.comparisonValue, opening + 15000);
  assert.equal(result.openingPrincipal, null);
  assert.equal(result.totalPnl, null, "inferred market value is not the acquisition cost");
  near(result.periodChange, 100000 - opening - 15000);
});

test("an entered starting balance includes all holdings and known cost enables total P/L", () => {
  const flat = series.map((point) => ({ ...point, close: 10000 }));
  const result = buildSavingsValuationHistory(history, flat, { balanceBasis: "opening", openingValue: 40000, openingPrincipal: 30000, currentValue: 999999 });
  assert.equal(result.status, "opening");
  near(result.rows[0].value, 45000);
  near(result.latestValue, 55000);
  near(result.totalPrincipal, 45000);
  near(result.totalPnl, 10000);
  near(result.periodChange, 0);
  assert.equal(result.comparisonLabel, "投資元本（開始前を含む）");
});

test("monthly contributions use the NAV observation closest to the 12th", () => {
  const contributions = buildSavingsContributionHistory({ recurring: false, schedule: [{ month: "2026-06", amount: 12000 }] }, "2026-06");
  const prices = [
    { date: "2026-06-04", close: 100 },
    { date: "2026-06-11", close: 200 },
    { date: "2026-06-19", close: 300 },
  ];
  const result = buildSavingsValuationHistory(contributions, prices);
  near(result.rows.find((point) => point.date === "2026-06-11").value, 12000);
  near(result.rows.find((point) => point.date === "2026-06-19").value, 18000);
});

test("equidistant NAV observations prefer the date before the 12th", () => {
  const contributions = buildSavingsContributionHistory({ recurring: false, schedule: [{ month: "2026-06", amount: 12000 }] }, "2026-06");
  const prices = [
    { date: "2026-06-05", close: 100 },
    { date: "2026-06-19", close: 200 },
  ];
  const result = buildSavingsValuationHistory(contributions, prices);
  near(result.rows.find((point) => point.date === "2026-06-05").value, 12000);
  near(result.rows.find((point) => point.date === "2026-06-19").value, 24000);
});

test("a prior-month snapshot does not double count the snapshot month's purchase later", () => {
  const contributions = { ...plan, schedule: [...plan.schedule, { month: "2026-10", amount: 10000 }] };
  const throughOctober = buildSavingsContributionHistory(contributions, "2026-10");
  const prices = Array.from({ length: 7 }, (_, i) => ({ date: `2026-${String(i + 3).padStart(2, "0")}-02`, close: 10000 }))
    .concat([{ date: "2026-10-06", close: 10000 }, { date: "2026-10-20", close: 11000 }]);
  const earlierSnapshot = { currentValue: 100000, currentValueDate: "2026-10-13", currentMonthIncluded: false };
  const result = buildSavingsValuationHistory(throughOctober, prices, earlierSnapshot);
  near(result.rows.find((point) => point.date === "2026-10-06").value, 100000);
  near(result.latestValue, 120000);
  near(result.openingValue, 65000);
  const included = buildSavingsValuationHistory(throughOctober, prices, { ...earlierSnapshot, currentMonthIncluded: true });
  near(included.rows.find((point) => point.date === "2026-10-06").value, 100000);
  near(included.latestValue, 110000);
  near(included.openingValue, 55000);
});

test("a fixed snapshot keeps gaining or losing with later NAV instead of reanchoring every refresh", () => {
  const input = { currentValue: 100000, currentValueDate: "2026-06-01" };
  const first = buildSavingsValuationHistory(history, series, input);
  const later = buildSavingsValuationHistory(history, [...series, { date: "2026-07-01", close: 19800 }], input);
  near(first.latestValue, 100000);
  near(later.latestValue, 110000);
  near(first.openingValue, later.openingValue);
});

test("missing prices and impossible balances do not invent initial holdings", () => {
  const missing = buildSavingsValuationHistory(history, series.filter((point) => point.date.slice(0, 7) !== "2026-04"), { currentValue: 100000 });
  assert.equal(missing.status, "missing_contribution_nav");
  assert.deepEqual(missing.rows, []);
  const negative = buildSavingsValuationHistory(history, series, { currentValue: 1000, currentValueDate: "2026-06-01" });
  assert.equal(negative.status, "inconsistent_balance");
  assert.equal(negative.latestValue, null);
  assert.equal(buildSavingsValuationHistory(history, series, { balanceBasis: "opening", openingValue: null }).status, "missing_opening_value");
  assert.equal(buildSavingsValuationHistory(history, series, { currentValue: 100000, currentValueDate: "2027-01-01", today: "2026-06-01" }).status, "future_anchor_date");
});

test("zero initial principal is explicit, while an empty initial principal stays unknown", () => {
  const zero = buildSavingsValuationHistory(history, series, { balanceBasis: "opening", openingValue: 10000, openingPrincipal: 0 });
  assert.equal(zero.openingPrincipal, 0);
  assert.ok(Number.isFinite(zero.totalPnl));
  const unknown = buildSavingsValuationHistory(history, series, { balanceBasis: "opening", openingValue: 10000, openingPrincipal: "" });
  assert.equal(unknown.openingPrincipal, null);
  assert.equal(unknown.totalPnl, null);
});

test("a brokerage contribution total reconciles current profit without rewriting historical contributions", () => {
  const input = { currentValue: 2467742, currentPrincipal: 2342597, openingPrincipal: 2103556, currentValueDate: "2026-10-13", today: "2026-10-13", currentMonthIncluded: false };
  const april = buildSavingsContributionHistory({ recurring: true, schedule: [{ month: "2026-04", amount: 37800 }] }, "2026-09");
  const prices = Array.from({ length: 7 }, (_, i) => ({ date: `2026-${String(i + 4).padStart(2, "0")}-05`, close: 10000 + i * 100 }));
  const result = buildSavingsValuationHistory(april, prices, input);
  assert.equal(april.rows.length, 6);
  near(april.total, 226800);
  near(result.latestValue, 2467742);
  near(result.totalPrincipal, 2342597);
  near(result.totalPnl, 125145);
  near(result.openingPrincipal, 2115797);
  near(result.principalDifference, 12241);
  assert.equal(input.openingPrincipal, 2103556);
  assert.equal(april.rows[0].month, "2026-04");
  const later = buildSavingsValuationHistory(buildSavingsContributionHistory({ recurring: true, schedule: [{ month: "2026-04", amount: 37800 }] }, "2026-10"), [...prices, { date: "2026-10-20", close: 11000 }], { ...input, today: "2026-11-01" });
  near(later.totalPrincipal, 2342597 + 37800);
  near(later.rows.find((row) => row.date === "2026-10-05").value, 2467742);
  near(later.principalDifference, 12241);
});

test("a snapshot principal cannot invent negative initial cost or work without required NAV quotes", () => {
  assert.equal(buildSavingsValuationHistory(history, series, { currentPrincipal: 1000, currentValue: 100000 }).status, "inconsistent_principal");
  assert.equal(buildSavingsValuationHistory(history, series, { currentPrincipal: 100000, currentValueDate: "2026-02-01" }).status, "missing_anchor_nav");
  assert.equal(buildSavingsValuationHistory(history, series, { currentPrincipal: 100000, currentValueDate: "2026-12-01", today: "2026-06-01" }).status, "future_anchor_date");
  const incomplete = buildSavingsValuationHistory(history, series.filter((point) => !point.date.startsWith("2026-04")), { currentPrincipal: 100000 });
  assert.equal(incomplete.status, "missing_contribution_nav");
  assert.equal(buildSavingsValuationHistory(history, series, { currentPrincipal: 100000 }).status, "missing_balance");
  assert.equal(buildSavingsValuationHistory(history, series, { openingPrincipal: 100000 }).status, "missing_balance");
});
