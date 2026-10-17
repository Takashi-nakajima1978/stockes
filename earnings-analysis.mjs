const RISK_TERMS = ["リスク", "不確実", "懸念", "影響", "依存", "訴訟", "規制", "減損", "継続企業", "risk", "uncertainty"];
const PERFORMANCE_TERMS = ["セグメント", "売上", "営業利益", "成長", "設備投資", "受注", "地域別", "事業別", "revenue", "segment", "growth"];
export const EARNINGS_AUTO_MONITOR_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const EARNINGS_AUTO_MONITOR_RETRY_MS = 24 * 60 * 60 * 1000;

export function nextEarningsAutoMonitorAt(state = {}) {
  const lastAttemptAt = Date.parse(state.lastAttemptAt || "");
  const lastSuccessAt = Date.parse(state.lastSuccessAt || "");
  if (Number.isFinite(lastAttemptAt) && (!Number.isFinite(lastSuccessAt) || lastAttemptAt > lastSuccessAt)) {
    return new Date(lastAttemptAt + EARNINGS_AUTO_MONITOR_RETRY_MS).toISOString();
  }
  if (Number.isFinite(lastSuccessAt)) return new Date(lastSuccessAt + EARNINGS_AUTO_MONITOR_INTERVAL_MS).toISOString();
  return "";
}

export function isEarningsAutoMonitorDue(state = {}, now = Date.now()) {
  const nextAt = nextEarningsAutoMonitorAt(state);
  return !nextAt || Date.parse(nextAt) <= now;
}

export function shouldRefreshFinancialSnapshots({ force = false, generatedAt = "", items = [], symbols = [], currentVersion, reportSetVersion, now = Date.now() } = {}) {
  if (force) return true;
  const age = now - Date.parse(generatedAt);
  if (!Number.isFinite(age) || age < 0) return true;
  const bySymbol = new Map((items || []).map((item) => [item.symbol, item]));
  if ((symbols || []).some((symbol) => !bySymbol.has(symbol))) return true;
  const currentItems = (symbols || []).map((symbol) => bySymbol.get(symbol));
  const schemaCurrent = currentItems.every((item) => item.edinet?.version === currentVersion && item.edinetReportSetVersion === reportSetVersion);
  const retryAfterFailure = currentItems.some((item) => item.edinet?.status === "refresh_failed");
  if (!schemaCurrent && !retryAfterFailure) return true;
  return age >= (retryAfterFailure ? EARNINGS_AUTO_MONITOR_RETRY_MS : EARNINGS_AUTO_MONITOR_INTERVAL_MS);
}

export function selectComparableEdinetReports(reports = []) {
  const byPeriod = new Map();
  for (const report of reports) {
    const document = report?.document || {};
    const narratives = Array.isArray(report?.narratives) ? report.narratives : [];
    const periodEnd = document.periodEnd || narratives.map((item) => item.endDate).filter(Boolean).sort().at(-1) || "";
    if (!/^[A-Z0-9]{8}$/.test(document.docID || "") || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) continue;
    const current = byPeriod.get(periodEnd);
    if (!current || String(document.submitDateTime || "") > String(current.document.submitDateTime || "")) {
      byPeriod.set(periodEnd, { ...report, document: { ...document, periodEnd } });
    }
  }
  const ordered = [...byPeriod.values()].sort((a, b) => b.document.periodEnd.localeCompare(a.document.periodEnd));
  const current = ordered[0] || null;
  const reportClass = (item) => ["120", "130"].includes(item?.document?.docTypeCode)
    ? "annual"
    : ["140", "150", "160", "170"].includes(item?.document?.docTypeCode)
      ? "interim"
      : "unknown";
  const currentClass = reportClass(current);
  const previous = current && ordered.find((item) => item.document.periodEnd < current.document.periodEnd
    && (currentClass === "unknown" || reportClass(item) === currentClass));
  return { current, previous: previous || null };
}

export function earningsMaterialFingerprint(sources = {}) {
  const document = (source = {}) => {
    const item = source || {};
    return {
      id: validEdinetId(item.documentId) || edinetIdFromUrl(item.url),
      periodEnd: String(item.periodEnd || "").slice(0, 10),
      submittedAt: String(item.submittedAt || "").slice(0, 30),
    };
  };
  const presentation = sources.presentation || {};
  return JSON.stringify({
    current: document(sources.current),
    previous: document(sources.previous),
    presentation: {
      id: String(presentation.id || "").slice(0, 120),
      date: String(presentation.date || "").slice(0, 20),
      url: String(presentation.url || "").slice(0, 500),
    },
  });
}

export function staleEarningsAnalysisSymbols(reviews = [], sourcesBySymbol = {}) {
  return [...new Set((reviews || [])
    .filter((review) => /^\d{4}\.T$/.test(review?.symbol || ""))
    .filter((review) => {
      const sources = sourcesBySymbol[review.symbol];
      if (!sources?.current?.documentId && !sources?.presentation?.id) return false;
      return review.sourceFingerprint !== earningsMaterialFingerprint(sources);
    })
    .map((review) => review.symbol))];
}

export function changedEdinetMaterialSymbols(previousItems = [], nextItems = []) {
  const identity = (item) => {
    const current = selectComparableEdinetReports(item?.edinetReports || []).current?.document;
    if (!current?.docID) return "";
    return [current.docID, current.periodEnd, current.submitDateTime, current.docInfoEditStatus, current.withdrawalStatus].join("|");
  };
  const previousBySymbol = new Map((previousItems || []).map((item) => [item.symbol, identity(item)]));
  return [...new Set((nextItems || [])
    .filter((item) => /^\d{4}\.T$/.test(item?.symbol || ""))
    .filter((item) => {
      const before = previousBySymbol.get(item.symbol);
      const after = identity(item);
      return Boolean(before && after && before !== after);
    })
    .map((item) => item.symbol))];
}

export function newEarningsPresentationSymbols(previous = {}, next = {}) {
  if (!previous.generatedAt) return [];
  const disclosures = (cache) => [...(cache.important || []), ...(cache.recent || [])];
  const oldIds = new Set(disclosures(previous).map((item) => item.id).filter(Boolean));
  const symbols = [];
  for (const item of disclosures(next)) {
    if (!item.id || oldIds.has(item.id) || !isEarningsPresentationTitle(item.title)) continue;
    const symbol = /^\d{4}\.T$/.test(item.symbol || "")
      ? item.symbol
      : `${String(item.code || "").slice(0, 4)}.T`;
    if (/^\d{4}\.T$/.test(symbol)) symbols.push(symbol);
  }
  return [...new Set(symbols)];
}

export function isEarningsPresentationTitle(title = "") {
  return /決算説明|決算補足|決算概要|業績説明|説明会資料|financial results presentation|earnings presentation/i.test(title);
}

export function selectRelevantPdfPages(pdfText = "", { maxPages = 8, kind = "report", pageCount = 0 } = {}) {
  const pages = String(pdfText).split("\f").map((text, index) => ({ page: index + 1, text: text.trim() }));
  const reportedPageCount = Math.max(0, Number(pageCount) || 0);
  while (pages.length > reportedPageCount && !pages.at(-1).text) pages.pop();
  if (!reportedPageCount) while (pages.length && !pages.at(-1).text) pages.pop();
  const boundedPageCount = Math.max(pages.length, Math.min(MAX_PDF_PAGE_SELECTION, reportedPageCount));
  for (let page = pages.length + 1; page <= boundedPageCount; page += 1) pages.push({ page, text: "" });
  if (!pages.length) return [];
  const terms = kind === "presentation" ? PERFORMANCE_TERMS : [...RISK_TERMS, ...PERFORMANCE_TERMS];
  const ranked = pages.map((item) => ({
    ...item,
    score: terms.reduce((score, term) => score + Math.min(4, item.text.toLowerCase().split(term.toLowerCase()).length - 1), 0),
  })).sort((a, b) => b.score - a.score || a.page - b.page);
  const selected = new Map();
  const add = (item) => { if (item && selected.size < maxPages) selected.set(item.page, item); };
  add(pages[0]);
  if (pages.length > 1) add(pages.at(-1));
  for (const item of ranked) if (item.score > 0) add(item);
  for (const fraction of [0.25, 0.5, 0.75]) add(pages[Math.round((pages.length - 1) * fraction)]);
  return [...selected.values()].sort((a, b) => a.page - b.page).slice(0, maxPages);
}

const MAX_PDF_PAGE_SELECTION = 400;

function normalizeSources(sources = {}) {
  const clean = (source, allowedHosts) => {
    if (!source || typeof source !== "object") return null;
    let url = "";
    try {
      const parsed = new URL(String(source.url || ""));
      if (parsed.protocol === "https:" && allowedHosts.includes(parsed.hostname)) url = parsed.href;
    } catch {}
    return {
      title: String(source.title || "").slice(0, 160),
      date: String(source.date || "").slice(0, 20),
      periodEnd: String(source.periodEnd || "").slice(0, 10),
      ...(validEdinetId(source.documentId) ? { documentId: validEdinetId(source.documentId) } : {}),
      ...(source.submittedAt ? { submittedAt: String(source.submittedAt).slice(0, 30) } : {}),
      ...(source.id ? { id: String(source.id).slice(0, 120) } : {}),
      ...(url ? { url } : {}),
    };
  };
  return {
    current: clean(sources.current, ["disclosure2.edinet-fsa.go.jp"]),
    previous: clean(sources.previous, ["disclosure2.edinet-fsa.go.jp"]),
    presentation: clean(sources.presentation, ["release.tdnet.info", "www.release.tdnet.info"]),
  };
}

export function normalizeEarningsDebate(value = {}, metadata = {}) {
  const list = (items, max = 8) => (Array.isArray(items) ? items : []).slice(0, max).map((item) => {
    if (typeof item === "string") return item.trim().slice(0, 500);
    if (!item || typeof item !== "object") return "";
    return Object.fromEntries(["topic", "detail", "direction", "before", "after", "evidence", "impact", "value", "unit", "segment", "reason"].filter((key) => item[key] !== undefined).map((key) => [key, String(item[key]).slice(0, 700)]));
  }).filter((item) => typeof item === "string" ? item : Object.keys(item).length);
  const judge = value.debate?.judge && typeof value.debate.judge === "object" ? value.debate.judge : {};
  const actions = ["買い増し検討", "保有継続", "売却検討", "新規購入は見送り", "判断保留"];
  const sources = normalizeSources(metadata.sources || value.sources || {});
  return {
    symbol: String(metadata.symbol || value.symbol || "").slice(0, 16),
    companyName: String(metadata.companyName || value.companyName || "").slice(0, 120),
    generatedAt: String(metadata.generatedAt || value.generatedAt || ""),
    model: String(metadata.model || value.model || "").slice(0, 160),
    sources,
    sourceFingerprint: String(metadata.sourceFingerprint || value.sourceFingerprint || earningsMaterialFingerprint(sources)).slice(0, 2000),
    narrativeComparison: {
      newlyAddedRisks: list(value.narrativeComparison?.newlyAddedRisks),
      removedOrReducedRisks: list(value.narrativeComparison?.removedOrReducedRisks),
      wordingChanges: list(value.narrativeComparison?.wordingChanges),
      summary: String(value.narrativeComparison?.summary || "").slice(0, 1200),
    },
    vision: {
      status: ["analyzed", "unavailable", "no_document"].includes(value.vision?.status) ? value.vision.status : "unavailable",
      note: String(value.vision?.note || "").slice(0, 500),
      pagesAnalyzed: list(value.vision?.pagesAnalyzed, 16),
      segmentDrivers: list(value.vision?.segmentDrivers),
      extractedFigures: list(value.vision?.extractedFigures),
      uncertainties: list(value.vision?.uncertainties),
    },
    debate: {
      bull: {
        thesis: String(value.debate?.bull?.thesis || "").slice(0, 1200),
        positives: list(value.debate?.bull?.positives),
        challenges: list(value.debate?.bull?.challenges),
        evidence: list(value.debate?.bull?.evidence),
      },
      bear: {
        thesis: String(value.debate?.bear?.thesis || "").slice(0, 1200),
        negatives: list(value.debate?.bear?.negatives),
        counterpoints: list(value.debate?.bear?.counterpoints),
        missingEvidence: list(value.debate?.bear?.missingEvidence),
        evidence: list(value.debate?.bear?.evidence),
      },
      judge: {
        action: actions.includes(judge.action) ? judge.action : "判断保留",
        score: Number.isFinite(Number(judge.score)) ? Math.max(0, Math.min(100, Math.round(Number(judge.score)))) : null,
        thesis: String(judge.thesis || "").slice(0, 1600),
        bullCase: list(judge.bullCase),
        bearCase: list(judge.bearCase),
        keyChecks: list(judge.keyChecks),
        confidence: String(judge.confidence || "").slice(0, 300),
        caveat: String(judge.caveat || "").slice(0, 800),
      },
    },
    limitations: list(value.limitations, 8),
  };
}

function validEdinetId(value = "") {
  const id = String(value || "").toUpperCase();
  return /^[A-Z0-9]{8}$/.test(id) ? id : "";
}

function edinetIdFromUrl(value = "") {
  try { return validEdinetId(new URL(String(value)).searchParams.get("id")); } catch { return ""; }
}
