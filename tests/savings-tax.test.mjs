import test from "node:test";
import assert from "node:assert/strict";
import { buildSavingsContributionHistory, buildSavingsValuationHistory, buildSavingsTaxComparison, savingsAccountType } from "../public/savings-calculation.mjs";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
const history = buildSavingsContributionHistory({ recurring: true, schedule: [{ month: "2026-03", amount: 10000 }] }, "2026-04");
const series = [{ date: "2026-03-02", close: 10000 }, { date: "2026-04-06", close: 12000 }];

test("savings account types preserve NISA choices and never guess legacy account taxation", () => {
  for (const provider of ["rakuten", "sbi"]) {
    for (const accountType of ["nisa-tsumitate", "nisa-growth", "taxable"]) {
      assert.equal(savingsAccountType({ provider, accountType }), accountType);
    }
    assert.equal(savingsAccountType({ provider }), "unspecified");
    assert.equal(savingsAccountType({ provider, accountType: "ideco" }), "unspecified");
  }
  assert.equal(savingsAccountType({ provider: "ideco", accountType: "nisa-growth" }), "ideco");
});

test("NISA and taxable accounts compare the same gain, with tax charged only to gains", () => {
  const result = buildSavingsValuationHistory(history, series, { balanceBasis: "opening", openingValue: 80000, openingPrincipal: 80000 });
  const comparison = buildSavingsTaxComparison(result, { accountType: "taxable" });
  assert.equal(comparison.basis, "total");
  assert.equal(comparison.complete, true);
  near(comparison.baseAmount, 100000);
  near(comparison.grossGain, 18000);
  near(comparison.gainPct, 18);
  near(comparison.tax, 3656.7);
  near(comparison.taxableGain, 14343.3);
  near(comparison.nisaProceeds, 118000);
  near(comparison.taxableProceeds, 114343.3);
});

test("period-only growth does not pretend inferred market value is a taxable acquisition cost", () => {
  const result = buildSavingsValuationHistory(history, series, { balanceBasis: "opening", openingValue: 80000 });
  const comparison = buildSavingsTaxComparison(result);
  assert.equal(comparison.basis, "period");
  near(comparison.grossGain, 18000);
  near(comparison.baseAmount, 100000);
  near(comparison.tax, 3656.7);
  assert.equal(comparison.nisaProceeds, null);
  assert.equal(comparison.taxableProceeds, null);
});

test("contributions-only holdings have a known acquisition cost without an opening balance", () => {
  const comparison = buildSavingsTaxComparison(buildSavingsValuationHistory(history, series));
  assert.equal(comparison.basis, "total");
  near(comparison.baseAmount, 20000);
  near(comparison.grossGain, 2000);
  near(comparison.tax, 406.3);
  near(comparison.taxableGain, 1593.7);
});

test("losses generate no negative tax or fictitious tax refunds", () => {
  const result = buildSavingsValuationHistory(history, [series[0], { date: "2026-04-06", close: 8000 }], { balanceBasis: "opening", openingValue: 80000, openingPrincipal: 80000 });
  const comparison = buildSavingsTaxComparison(result, { accountType: "nisa-tsumitate" });
  near(comparison.grossGain, -18000);
  assert.equal(comparison.tax, 0);
  near(comparison.taxableGain, -18000);
  near(comparison.nisaGain, -18000);
  near(comparison.gainPct, -18);
});

test("missing NAV data disables tax comparison and zero principal has no invented percentage", () => {
  assert.equal(buildSavingsTaxComparison({ latestValue: null }).available, false);
  assert.equal(buildSavingsTaxComparison({}).available, false);
  const result = buildSavingsValuationHistory(history, series, { balanceBasis: "opening", openingValue: 80000 });
  const incomplete = buildSavingsTaxComparison({ ...result, unpricedMonths: ["2026-04"] });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.tax, null);
  assert.equal(incomplete.taxableGain, null);
  assert.equal(incomplete.taxableProceeds, null);
  const zero = buildSavingsValuationHistory({ rows: [] }, series, { balanceBasis: "opening", openingValue: 10000, openingPrincipal: 0 });
  const comparison = buildSavingsTaxComparison(zero);
  assert.equal(comparison.basis, "total");
  near(comparison.grossGain, 12000);
  assert.equal(comparison.gainPct, null);
  assert.equal(comparison.taxableGainPct, null);
});

test("iDeCo retains gross performance but has no NISA or taxable payout comparison", () => {
  const comparison = buildSavingsTaxComparison(buildSavingsValuationHistory(history, series), { provider: "ideco" });
  assert.equal(comparison.accountType, "ideco");
  assert.equal(comparison.grossGain, 2000);
  assert.equal(comparison.gainPct, 10);
  for (const field of ["tax", "nisaGain", "taxableGain", "taxableGainPct", "nisaProceeds", "taxableProceeds"]) assert.equal(comparison[field], null);
});
