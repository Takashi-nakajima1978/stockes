import test from "node:test";
import assert from "node:assert/strict";
import { changedEdinetMaterialSymbols, earningsMaterialFingerprint, newEarningsPresentationSymbols, normalizeEarningsDebate, selectComparableEdinetReports, selectRelevantPdfPages, staleEarningsAnalysisSymbols } from "../earnings-analysis.mjs";

test("compares the newest distinct EDINET reporting periods and prefers the latest correction", () => {
  const reports = [
    { document: { docID: "S100OLD1", periodEnd: "2026-03-31", submitDateTime: "2026-05-01" }, narratives: [] },
    { document: { docID: "S100NEW1", periodEnd: "2026-06-30", submitDateTime: "2026-08-01" }, narratives: [] },
    { document: { docID: "S100NEW2", periodEnd: "2026-06-30", submitDateTime: "2026-08-04" }, narratives: [] },
  ];
  const result = selectComparableEdinetReports(reports);
  assert.equal(result.current.document.docID, "S100NEW2");
  assert.equal(result.previous.document.docID, "S100OLD1");
});

test("interim filings compare against the previous interim, not the intervening annual report", () => {
  const reports = [
    { document: { docID: "S100ANN1", docTypeCode: "120", periodEnd: "2026-03-31", submitDateTime: "2026-06-01" } },
    { document: { docID: "S100INT1", docTypeCode: "160", periodEnd: "2025-09-30", submitDateTime: "2025-11-01" } },
    { document: { docID: "S100INT2", docTypeCode: "160", periodEnd: "2026-09-30", submitDateTime: "2026-11-01" } },
  ];
  const result = selectComparableEdinetReports(reports);
  assert.equal(result.current.document.docID, "S100INT2");
  assert.equal(result.previous.document.docID, "S100INT1");
});

test("PDF page selection preserves relevant risk and segment pages within its limit", () => {
  const text = [
    "表紙 会社概要",
    "業績ハイライト 売上 成長 セグメント",
    "事業等のリスク 訴訟 規制 不確実",
    "中期計画",
    "設備投資 受注 地域別売上",
    "補足説明",
    "末尾",
  ].join("\f");
  const pages = selectRelevantPdfPages(text, { maxPages: 4, kind: "report" });
  assert.equal(pages.length, 4);
  assert.ok(pages.some((item) => item.page === 3));
  assert.ok(pages.some((item) => item.page === 5));
  assert.deepEqual(pages.map((item) => item.page), [...pages.map((item) => item.page)].sort((a, b) => a - b));
});

test("image-only PDFs still produce representative page numbers for local vision", () => {
  const pages = selectRelevantPdfPages("", { maxPages: 6, kind: "presentation", pageCount: 24 });
  assert.ok(pages.length >= 5 && pages.length <= 6);
  assert.ok(pages.some((item) => item.page === 1));
  assert.ok(pages.some((item) => item.page === 24));
  assert.ok(pages.some((item) => item.page >= 6 && item.page <= 18));
});

test("earnings analysis output is bounded and invalid actions are neutralized", () => {
  const result = normalizeEarningsDebate({
    narrativeComparison: { newlyAddedRisks: Array.from({ length: 20 }, (_, index) => "risk " + index) },
    debate: { judge: { action: "BUY NOW", score: 140, thesis: "x".repeat(3000) } },
  }, { symbol: "9005.T", companyName: "東急", model: "local-vlm" });
  assert.equal(result.symbol, "9005.T");
  assert.equal(result.debate.judge.action, "判断保留");
  assert.equal(result.debate.judge.score, 100);
  assert.equal(result.debate.judge.thesis.length, 1600);
  assert.equal(result.narrativeComparison.newlyAddedRisks.length, 8);
  assert.equal(normalizeEarningsDebate({ sources: { current: { url: "javascript:alert(1)" } } }).sources.current.url, undefined);
});

test("new or corrected EDINET filings are detected without treating first-time imports as updates", () => {
  const older = [{
    symbol: "9005.T",
    edinetReports: [{ document: { docID: "S100OLD1", periodEnd: "2026-03-31", submitDateTime: "2026-05-01" } }],
  }];
  const revised = [{
    symbol: "9005.T",
    edinetReports: [{ document: { docID: "S100NEW1", periodEnd: "2026-06-30", submitDateTime: "2026-08-01" } }],
  }];
  assert.deepEqual(changedEdinetMaterialSymbols([], revised), []);
  assert.deepEqual(changedEdinetMaterialSymbols(older, revised), ["9005.T"]);
  assert.deepEqual(changedEdinetMaterialSymbols(revised, revised), []);
});

test("new earnings presentations only trigger analysis for newly seen TDnet documents", () => {
  const previous = {
    generatedAt: "2026-10-16T08:00:00.000Z",
    recent: [{ id: "old", symbol: "9005.T", title: "決算説明資料" }],
  };
  const next = {
    generatedAt: "2026-10-17T08:00:00.000Z",
    recent: [
      { id: "old", symbol: "9005.T", title: "決算説明資料" },
      { id: "new", symbol: "9201.T", title: "決算説明資料" },
      { id: "other", symbol: "9201.T", title: "自己株式取得" },
    ],
  };
  assert.deepEqual(newEarningsPresentationSymbols(previous, next), ["9201.T"]);
  assert.deepEqual(newEarningsPresentationSymbols({}, next), []);
});

test("earnings material fingerprints change when the report or presentation changes", () => {
  const base = { current: { documentId: "S100NEW1", periodEnd: "2026-06-30" }, presentation: { id: "tdnet-1", url: "https://release.tdnet.info/a.pdf" } };
  assert.equal(earningsMaterialFingerprint(base), earningsMaterialFingerprint(base));
  assert.notEqual(earningsMaterialFingerprint(base), earningsMaterialFingerprint({ ...base, current: { ...base.current, documentId: "S100NEW2" } }));
  assert.notEqual(earningsMaterialFingerprint(base), earningsMaterialFingerprint({ ...base, presentation: { ...base.presentation, id: "tdnet-2" } }));
});

test("stale saved earnings reviews can be rediscovered after a restart", () => {
  const currentSources = { current: { documentId: "S100NEW2", periodEnd: "2026-06-30" } };
  const unchangedSources = { current: { documentId: "S100NEW1", periodEnd: "2026-03-31" } };
  const reviews = [
    { symbol: "9005.T", sourceFingerprint: earningsMaterialFingerprint(unchangedSources) },
    { symbol: "9201.T", sourceFingerprint: earningsMaterialFingerprint(unchangedSources) },
    { symbol: "ABC", sourceFingerprint: "old" },
  ];
  assert.deepEqual(staleEarningsAnalysisSymbols(reviews, {
    "9005.T": currentSources,
    "9201.T": unchangedSources,
    "9301.T": { current: null, presentation: null },
    ABC: currentSources,
  }), ["9005.T"]);
});
