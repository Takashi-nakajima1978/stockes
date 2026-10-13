import test from "node:test";
import assert from "node:assert/strict";
import { collectNisaStockPurchases, savingsNisaAllowance } from "../public/savings-calculation.mjs";

const context = { available: true, purchases: [], growthAnnualLimit: 2400000 };
const monthly = (id, amount, type = "nisa-tsumitate", provider = "rakuten") => ({ id, provider, accountType: type, recurring: true, schedule: [{ month: "2026-01", amount }] });
const bucket = (result, type = "nisa-tsumitate", year = result.year) => result.years.get(year).buckets.get(type);

test("NISA totals use monthly overrides and calendar years, not NAV values or inferred opening principal", () => {
  const plan = { ...monthly("fund", 5000), currentValue: 9000000, currentPrincipal: 8000000, openingPrincipal: 7000000, schedule: [{ month: "2026-03", amount: 5000 }, { month: "2026-10", amount: 100000 }] };
  const before = JSON.stringify(plan);
  const result = savingsNisaAllowance([plan], context, "2026-10-13");
  assert.equal(bucket(result).planned, 335000);
  assert.equal(bucket(result).used, 35000);
  assert.equal(bucket(result).pending, 300000);
  assert.equal(bucket(result).remaining, 865000);
  assert.equal(bucket(result).remainingNow, 1165000);
  assert.equal(bucket(result, "nisa-tsumitate", 2027).planned, 1200000);
  assert.equal(bucket(result, "nisa-tsumitate", 2027).remaining, 0);
  assert.equal(bucket(result, "nisa-tsumitate", 2027).excess, 0);
  assert.equal(JSON.stringify(plan), before);
});

test("funds share one annual allowance and first excess month is visible", () => {
  const result = savingsNisaAllowance([monthly("a", 70000), monthly("b", 40000)], context, "2026-10-13");
  const current = bucket(result);
  assert.equal(current.planned, 1320000);
  assert.equal(current.used, 990000);
  assert.equal(current.remainingNow, 210000);
  assert.equal(current.remaining, 0);
  assert.equal(current.excess, 120000);
  assert.equal(current.firstExcessMonth, "2026-11");
  assert.equal(result.years.get(2026).perPlan.get("a"), 840000);
});

test("growth savings share the limit with Japanese NISA stock purchases even after sale", () => {
  const stock = { holding: false, positions: [{ purchaseDate: "2026-06-15", purchasePrice: 20000, quantity: 100, accountType: "nisa" }], sales: [{ sellDate: "2026-07-01", quantity: 100, sellPrice: 21000 }] };
  const purchases = collectNisaStockPurchases([stock]);
  const result = savingsNisaAllowance([monthly("fund", 40000, "nisa-growth")], { ...context, ...purchases }, "2026-10-13");
  const growth = bucket(result, "nisa-growth");
  assert.equal(growth.stockPlanned, 2000000);
  assert.equal(growth.planned, 2480000);
  assert.equal(growth.used, 2360000);
  assert.equal(growth.remainingNow, 40000);
  assert.equal(growth.excess, 80000);
  assert.equal(growth.firstExcessMonth, "2026-11");
});

test("taxable, unknown and iDeCo plans never consume NISA allowances", () => {
  const result = savingsNisaAllowance([
    monthly("tax", 1000000, "taxable"), monthly("unknown", 1000000, "unspecified"),
    monthly("ideco", 1000000, "nisa-tsumitate", "ideco"), monthly("nisa", 10000),
  ], context, "2026-10-13");
  assert.equal(bucket(result).planned, 120000);
  assert.equal(bucket(result, "nisa-growth").planned, 0);
  assert.equal(result.years.get(2026).perPlan.size, 1);
});

test("one-off settings stop when recurring is off and do not fabricate next year's contributions", () => {
  const plan = { ...monthly("fund", 100000), recurring: false, schedule: [{ month: "2026-01", amount: 100000 }, { month: "2026-06", amount: 50000 }] };
  const result = savingsNisaAllowance([plan], context, "2026-10-13");
  assert.equal(bucket(result).planned, 150000);
  assert.equal(bucket(result).used, 150000);
  assert.equal(bucket(result, "nisa-tsumitate", 2027).planned, 0);
});

test("future amount changes and a lower configured growth cap are respected", () => {
  const plan = { ...monthly("fund", 100000, "nisa-growth"), schedule: [{ month: "2026-01", amount: 100000 }, { month: "2027-02", amount: 200000 }] };
  const result = savingsNisaAllowance([plan], { ...context, growthAnnualLimit: 1800000 }, "2026-10-13");
  assert.equal(bucket(result, "nisa-growth").limit, 1800000);
  assert.equal(bucket(result, "nisa-growth", 2027).planned, 2300000);
  assert.equal(bucket(result, "nisa-growth", 2027).excess, 500000);
  assert.equal(bucket(result, "nisa-growth", 2027).firstExcessMonth, "2027-10");
  assert.equal(bucket(savingsNisaAllowance([plan], { ...context, growthAnnualLimit: 9999999 }, "2026-10-13"), "nisa-growth").limit, 2400000);
});

test("snapshot month inclusion changes booked amount, not full-year plans", () => {
  const plan = { ...monthly("fund", 100000), currentValueDate: "2026-10-13", currentMonthIncluded: true };
  const result = savingsNisaAllowance([plan], context, "2026-10-13");
  assert.equal(bucket(result).used, 1000000);
  assert.equal(bucket(result).planned, 1200000);
  assert.equal(bucket(savingsNisaAllowance([{ ...plan, currentValueDate: "2026-10-30" }], context, "2026-10-13")).used, 900000);
  assert.equal(bucket(savingsNisaAllowance([{ ...plan, currentMonthIncluded: false }], context, "2026-10-13")).used, 900000);
});

test("new years reset the annual limit and do not carry unused allowance or old stock purchases forward", () => {
  const plan = { ...monthly("fund", 100000), schedule: [{ month: "2026-10", amount: 100000 }] };
  const result = savingsNisaAllowance([plan], { ...context, purchases: [{ date: "2026-04-01", amount: 2300000 }] }, "2027-01-01");
  assert.equal(result.year, 2027);
  assert.equal(bucket(result).planned, 1200000);
  assert.equal(bucket(result).used, 0);
  assert.equal(bucket(result).limit, 1200000);
  assert.equal(bucket(result, "nisa-growth").planned, 0);
});

test("unknown purchase dates are flagged, duplicates are summed and pre-2024 NISA is excluded", () => {
  const result = collectNisaStockPurchases([
    { positions: [{ accountType: "nisa", purchaseDate: "2026-04-01", purchasePrice: 1000, quantity: 100 }, { accountType: "nisa", purchaseDate: "2026-04-01", purchasePrice: 1500, quantity: 100 }, { accountType: "nisa", purchaseDate: "", purchasePrice: 2000, quantity: 100 }, { accountType: "nisa", purchaseDate: "2026-02-31", purchasePrice: 2000, quantity: 100 }, { accountType: "nisa", purchaseDate: "2023-04-01", purchasePrice: 3000, quantity: 100 }, { accountType: "taxable", purchaseDate: "2026-04-01", purchasePrice: 99999, quantity: 100 }] },
  ]);
  assert.deepEqual(result.purchases, [{ date: "2026-04-01", amount: 250000 }]);
  assert.equal(result.undatedCount, 2);
  const allowance = savingsNisaAllowance([], { available: false, ...result }, "2026-10-13");
  assert.equal(allowance.stockDataAvailable, false);
  assert.equal(allowance.undatedCount, 2);
});

test("bank conflicts are detected per year without blocking legitimate year-to-year bank changes", () => {
  const rakuten = { ...monthly("a", 10000), recurring: false };
  const sbi = { ...monthly("b", 10000, "nisa-growth", "sbi"), schedule: [{ month: "2027-01", amount: 10000 }] };
  const separated = savingsNisaAllowance([rakuten, sbi], context, "2026-10-13");
  assert.equal(separated.years.get(2026).providerConflict, false);
  assert.equal(separated.years.get(2027).providerConflict, false);
  const conflict = savingsNisaAllowance([{ ...rakuten, recurring: true }, sbi], context, "2026-10-13");
  assert.equal(conflict.years.get(2027).providerConflict, true);
});
