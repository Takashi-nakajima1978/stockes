import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { parseEdinetXbrl, analyzeEdinetReports, EDINET_ANALYSIS_VERSION, edinetScoreAdjustment } from "../edinet-financials.mjs";
import { selectEdinetDocuments, createEdinetDirectory, isFinancialEdinetDocument } from "../edinet-documents.mjs";
import { createDataStore } from "../data-store.mjs";

const now = new Date("2026-10-15T00:00:00Z");
const document = { docID: "S100TEST", edinetCode: "E00001", submitDateTime: "2026-06-25 09:00", docTypeCode: "120" };
const context = (id, start, end, dimension = "", entity = "E00001-000") => `<x:context id="${id}"><x:entity><x:identifier scheme="http://disclosure.edinet-fsa.go.jp/">${entity}</x:identifier></x:entity><x:period>${start ? `<x:startDate>${start}</x:startDate><x:endDate>${end}</x:endDate>` : `<x:instant>${end}</x:instant>`}</x:period>${dimension ? `<x:scenario>${dimension}</x:scenario>` : ""}</x:context>`;
const fact = (name, ctx, value, unit = "yen", attrs = "") => `<j:${name} contextRef="${ctx}" unitRef="${unit}" ${attrs}>${value}</j:${name}>`;
const xml = body => `<x:xbrl xmlns:x="http://www.xbrl.org/2003/instance" xmlns:j="http://disclosure.edinet-fsa.go.jp/taxonomy/jppfs/2025-11-01/jppfs_cor" xmlns:d="http://xbrl.org/2006/xbrldi" xmlns:i="http://www.xbrl.org/2003/iso4217" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><x:unit id="yen"><x:measure>i:JPY</x:measure></x:unit><x:unit id="dollar"><x:measure>i:USD</x:measure></x:unit><x:unit id="pure"><x:measure>x:pure</x:measure></x:unit>${body}</x:xbrl>`;
function annualReport(extra = "", doc = document) {
  let body = "";
  for (const [end, revenue, income, cf] of [[2024, 80, 8, 10], [2025, 100, 10, 12], [2026, 120, 15, 18]]) {
    body += context(`r${end}`, `${end - 1}-04-01`, `${end}-03-31`) + context(`b${end}`, "", `${end}-03-31`);
    body += fact("NetSales", `r${end}`, revenue * 1000000, "yen", 'decimals="-6"');
    body += fact("OperatingIncome", `r${end}`, income * 1000000) + fact("NetIncomeLoss", `r${end}`, income * 800000);
    body += fact("NetCashProvidedByUsedInOperatingActivities", `r${end}`, cf * 1000000);
    body += fact("NetCashProvidedByUsedInInvestingActivities", `r${end}`, -5000000);
    body += fact("CashAndCashEquivalents", `b${end}`, 50000000) + fact("NetAssets", `b${end}`, 60000000) + fact("Assets", `b${end}`, 100000000);
  }
  return parseEdinetXbrl(xml(body + fact("AccountingStandardsDEI", "r2026", "Japan GAAP", "") + extra), doc, "XBRL/PublicDoc/main.xbrl");
}

test("EDINET resolves real issuer suffix, dates and JPY units, not context-name or decimals heuristics", () => {
  const report = annualReport(fact("InterestBearingDebt", "b2026", 20000000));
  const result = analyzeEdinetReports([report], now);
  assert.equal(result.edinet.status, "verified");
  assert.equal(result.netSales, 120000000);
  assert.equal(result.netCash, 30000000);
  assert.equal(result.operatingCashFlowYears, 3);
  assert.equal(result.edinet.analysis.revenueGrowthPct, 20);
  assert.equal(result.edinet.analysis.operatingIncomeGrowthPct, 50);
  assert.equal(result.edinet.analysis.operatingMarginPct, 12.5);
  assert.ok(Math.abs(result.edinet.analysis.operatingMarginChangePt - 2.5) < 1e-10);
  assert.equal(result.edinet.analysis.operatingAndInvestingCashFlow, 13000000);
  assert.equal(result.edinet.periods[0].sources.netSales.contextId, "r2026");
  assert.equal(result.edinet.periods[0].sources.netSales.docID, document.docID);
  assert.equal(edinetScoreAdjustment(result.edinet).score, 4);
});

test("segment, forecast, foreign-company, nonconsolidated, wrong-currency and nil values never contaminate consolidated totals", () => {
  const dimensions = ['<d:explicitMember dimension="j:BusinessSegmentsAxis">j:SegmentAMember</d:explicitMember>', '<d:explicitMember dimension="j:ForecastAxis">j:ForecastMember</d:explicitMember>', '<d:explicitMember dimension="j:ConsolidatedOrNonConsolidatedAxis">j:NonConsolidatedMember</d:explicitMember>'];
  let extra = dimensions.map((dimension, i) => context(`bad${i}`, "2025-04-01", "2026-03-31", dimension) + fact("NetSales", `bad${i}`, 999999999)).join("");
  extra += context("other", "2025-04-01", "2026-03-31", "", "E00002-000") + fact("NetSales", "other", 999999999);
  extra += fact("NetSales", "r2026", 777, "dollar") + fact("InterestBearingDebt", "b2026", "", "yen", 'xsi:nil="true"');
  const result = analyzeEdinetReports([annualReport(extra)], now);
  assert.equal(result.netSales, 120000000);
  assert.equal(result.netCash, null);
  assert.equal(result.interestBearingDebt, null);
  assert.match(result.edinet.warnings.join(" "), /ゼロとみなさず/);
});

test("standalone-only issuer is marked nonconsolidated and cannot be mixed with consolidated years", () => {
  const report = annualReport(fact("WhetherConsolidatedFinancialStatementsArePreparedDEI", "r2026", "false", ""));
  assert.equal(analyzeEdinetReports([report], now).edinet.scope, "nonconsolidated");
  const consolidated = annualReport();
  consolidated.periods = consolidated.periods.filter(row => row.endDate === "2026-03-31");
  const result = analyzeEdinetReports([report, consolidated], now);
  assert.equal(result.edinet.periods.length, 1);
  assert.equal(result.edinet.analysis.revenueGrowthPct, null);
});

test("conflicting duplicate facts are unavailable; partial debt components are not a zero total", () => {
  const conflict = analyzeEdinetReports([annualReport(fact("NetSales", "r2026", 999) + fact("BondsAndBorrowingsCL", "b2026", 1000000))], now);
  assert.equal(conflict.netSales, null);
  assert.equal(conflict.netCash, null);
  assert.equal(conflict.edinet.analysis.revenueGrowthPct, null);
  const complete = analyzeEdinetReports([annualReport(fact("BondsAndBorrowingsCL", "b2026", 1000000) + fact("BondsAndBorrowingsNCL", "b2026", 4000000))], now);
  assert.equal(complete.interestBearingDebt, 5000000);
  assert.equal(complete.netCash, 45000000);
  const negative = analyzeEdinetReports([annualReport(fact("InterestBearingDebt", "b2026", -5))], now);
  assert.equal(negative.netCash, null);
});

test("interim comparisons use actual XBRL dates and same-length prior period; annual income is not doubled", () => {
  let body = "";
  for (const [year, sales] of [[2025, 50], [2026, 55]]) {
    body += context(`half${year}`, `${year}-04-01`, `${year}-09-30`) + fact("NetSales", `half${year}`, sales) + fact("NetIncomeLoss", `half${year}`, 2);
  }
  const interim = parseEdinetXbrl(xml(body + fact("AccountingStandardsDEI", "half2026", "Japan GAAP", "")), { ...document, docID: "S100HALF", submitDateTime: "2026-11-10", periodEnd: "2027-03-31" });
  const result = analyzeEdinetReports([annualReport(), interim], new Date("2026-11-15"));
  assert.equal(result.edinet.latestPeriod.endDate, "2026-09-30");
  assert.equal(result.edinet.latestPeriod.annual, false);
  assert.equal(result.edinet.analysis.revenueGrowthPct, 10);
  assert.equal(result.annualNetIncome, 12000000);
  assert.equal(result.netIncome, 2);
  assert.equal(result.edinet.analysis.consecutivePositiveOperatingCfYears, 3);
});

test("corrections replace original periods, complementary files merge, conflicts stay missing and years are unique", () => {
  const original = annualReport();
  const corrected = annualReport("", { ...document, docID: "S100CORR", submitDateTime: "2026-07-01", docTypeCode: "130" });
  corrected.periods = corrected.periods.filter(row => row.endDate === "2026-03-31");
  corrected.periods[0].values.netSales = 110000000;
  corrected.periods[0].values.netIncome = null;
  const result = analyzeEdinetReports([corrected, original], now);
  assert.equal(result.netSales, 110000000);
  assert.equal(result.netIncome, null);
  assert.equal(result.operatingCashFlowYears, 3);
  assert.equal(result.edinet.analysis.revenueGrowthPct, 10);
  const part = structuredClone(corrected.periods[0]);
  part.values = { ...Object.fromEntries(Object.keys(part.values).map(key => [key, null])), interestBearingDebt: 1234 };
  corrected.periods.push(part);
  assert.equal(analyzeEdinetReports([corrected, original], now).interestBearingDebt, 1234);
  const conflicting = structuredClone(part);
  conflicting.values.interestBearingDebt = 4321;
  corrected.periods.push(conflicting, part);
  assert.equal(analyzeEdinetReports([corrected, original], now).interestBearingDebt, null);
});

test("losses, year gaps, stale filings and missing margin comparisons cannot create optimistic scores", () => {
  const report = annualReport();
  report.periods.find(row => row.endDate === "2025-03-31").values.netIncome = -1;
  let result = analyzeEdinetReports([report], now);
  assert.equal(result.edinet.analysis.netIncomeGrowthPct, null);
  assert.equal(result.edinet.analysis.netIncomeTransition, "turned_profitable");
  result.edinet.analysis.operatingMarginChangePt = null;
  assert.equal(edinetScoreAdjustment(result.edinet).score, 0);
  report.periods = report.periods.filter(row => row.endDate !== "2025-03-31");
  assert.equal(analyzeEdinetReports([report], now).operatingCashFlowYears, 1);
  result = analyzeEdinetReports([report], new Date("2029-01-01"));
  assert.equal(result.edinet.status, "stale");
  assert.equal(edinetScoreAdjustment(result.edinet).score, 0);
  assert.equal(analyzeEdinetReports([], now).edinet.status, "unavailable");
});

test("filing text remains bounded source data and external entities or malformed XML are rejected", () => {
  const report = annualReport(fact("BusinessRisksTextBlock", "r2026", "&lt;p&gt;需要減少 &amp; 原材料高&lt;/p&gt;", ""));
  assert.equal(report.narratives[0].text, "需要減少 & 原材料高");
  assert.throws(() => parseEdinetXbrl('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>'), /DOCTYPE/);
  assert.throws(() => parseEdinetXbrl("<x><unclosed></x>"));
});

test("multimodal review can re-extract a longer narrative excerpt without changing normal cache size", () => {
  const longText = "事業リスクの変化。".repeat(900);
  const source = xml(context("risk", "2025-04-01", "2026-03-31") + fact("BusinessRisksTextBlock", "risk", longText, ""));
  assert.equal(parseEdinetXbrl(source, document, "risk.xbrl").narratives[0].text.length, 1500);
  assert.equal(parseEdinetXbrl(source, document, "risk.xbrl", { narrativeLimit: 8000 }).narratives[0].text.length, 8000);
});

const doc = (id, type, end, submit, extra = {}) => ({ docID: id, edinetCode: "E00001", secCode: "90050", docTypeCode: type, periodEnd: end, submitDateTime: submit, xbrlFlag: "1", withdrawalStatus: "0", disclosureStatus: "0", legalStatus: "1", ...extra });
test("document selection includes adjacent interim periods and corrections without promoting old filings", () => {
  const docs = [doc("S100OLD1", "120", "2025-03-31", "2025-06-20"), doc("S100NEW1", "120", "2026-03-31", "2026-06-20"), doc("S100COR1", "130", "", "2026-08-01", { parentDocID: "S100OLD1" }), doc("S100HAL0", "160", "2025-09-30", "2025-11-10"), doc("S100HAL1", "160", "2026-09-30", "2026-11-10")];
  assert.deepEqual(selectEdinetDocuments(docs, ["9005.T"]).get("9005.T").map(d => d.docID), ["S100NEW1", "S100HAL1", "S100HAL0", "S100COR1"]);
  assert.equal(isFinancialEdinetDocument({ ...docs[1], withdrawalStatus: "2" }), false);
  assert.equal(isFinancialEdinetDocument({ ...docs[1], disclosureStatus: "1" }), false);
  assert.equal(isFinancialEdinetDocument({ ...docs[1], xbrlFlag: "0" }), false);
  assert.equal(isFinancialEdinetDocument({ ...docs[1], legalStatus: "0" }), false);
  const withdrawn = [...docs, doc("S100WITH", "", "", "2026-12-01", { parentDocID: "S100NEW1", withdrawalStatus: "1" })];
  assert.equal(selectEdinetDocuments(withdrawn, ["9005.T"]).get("9005.T").some(d => d.docID === "S100NEW1"), false);
});

test("directory fetch is shared, rechecks today's list, and reuses historical date buckets", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "edinet-directory-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createDataStore(dir);
  let clock = now;
  let calls = 0;
  let fail = false;
  const load = createEdinetDirectory({ store, lookbackDays: 3, now: () => clock, fetchDay: async () => { calls++; if (fail) throw new Error("offline"); return [doc("S100NEW1", "120", "2026-03-31", "2026-06-20")]; } });
  await Promise.all([load(), load()]);
  assert.equal(calls, 3);
  await load();
  assert.equal(calls, 3);
  clock = new Date(now.getTime() + 31 * 60000);
  await load();
  assert.equal(calls, 4);
  const before = await store.readJson("edinet-directory.json");
  clock = new Date(now.getTime() + 2 * 86400000);
  fail = true;
  const unavailable = await load();
  assert.equal(calls, 6);
  assert.equal(unavailable.warnings.length, 2);
  assert.ok((await store.readJson("edinet-directory.json")).days["2026-10-15"]);
  fail = false;
  assert.ok((await load()).documents.length);
  assert.equal(calls, 8);
  assert.ok(before.days["2026-10-13"]);
});

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
function loadFunctions(names, globals = {}) {
  const blocks = names.map(name => { const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m")); assert.notEqual(start, -1, name); return source.slice(start, source.indexOf("\n}", start) + 2); }).join("\n");
  return vm.runInNewContext(`${blocks}\n({${names.join(",")}})`, { EDINET_ANALYSIS_VERSION, ...globals });
}

test("AI and display receive period evidence but not redundant raw report caches", async () => {
  const { normalizeFinancialSnapshot, compactFinancialForAi, attachFinancialsToAnalyses } = loadFunctions(["normalizeFinancialSnapshot", "compactFinancialForAi", "attachFinancialsToAnalyses"], {
    normalizeSymbol: s => s, cleanText: String, normalizeDate: s => s, numberOrNull: v => Number.isFinite(v) ? v : null,
    nullableNonNegativeNumber: v => Number.isFinite(v) && v >= 0 ? v : null, asStringArray: v => Array.isArray(v) ? v : [],
    normalizeFinancialCriteria: v => v || [], financialCriteriaScore: () => null, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  });
  const report = annualReport();
  const financials = { symbol: "9005.T", status: "ok", ...analyzeEdinetReports([report], now), edinetReports: [report] };
  assert.equal(normalizeFinancialSnapshot(financials, true).edinetReports.length, 1);
  assert.equal(normalizeFinancialSnapshot(financials).edinetReports, undefined);
  const ai = compactFinancialForAi(financials);
  assert.equal(ai.edinet.analysis.revenueGrowthPct, 20);
  assert.equal(ai.edinet.periods[0].sources.netSales.docID, document.docID);
  assert.equal(ai.edinetReports, undefined);
  const [analysis] = await attachFinancialsToAnalyses([{ symbol: "9005.T" }], { items: [financials] });
  assert.equal(analysis.financials.edinetReports, undefined);
  assert.equal(analysis.financials.edinet.periods.length, 3);
});
