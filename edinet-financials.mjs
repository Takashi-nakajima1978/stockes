import { SaxesParser } from "saxes";

export const EDINET_ANALYSIS_VERSION = 2;
const INSTANCE = "http://www.xbrl.org/2003/instance";
const DIMENSIONS = "http://xbrl.org/2006/xbrldi";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const DAY = 86400000;
const definitions = {
  netSales: ["duration", "JPY", "NetSales", "RevenueIFRS", "Revenue", "RevenueSummaryOfBusinessResults", "NetSalesSummaryOfBusinessResults", "OperatingRevenue", "SalesRevenue"],
  operatingIncome: ["duration", "JPY", "OperatingIncome", "OperatingProfitLoss", "OperatingProfitIFRS", "ProfitLossFromOperatingActivitiesIFRS", "ProfitLossFromOperatingActivities"],
  netIncome: ["duration", "JPY", "ProfitLossAttributableToOwnersOfParent", "ProfitLossAttributableToOwnersOfParentIFRS", "ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults", "ProfitAttributableToOwnersOfParentSummaryOfBusinessResults", "NetIncomeLoss", "NetIncomeLossSummaryOfBusinessResults", "NetIncome", "ProfitLoss"],
  operatingCashFlow: ["duration", "JPY", "NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults", "CashFlowsFromUsedInOperatingActivitiesIFRS", "NetCashProvidedByUsedInOperatingActivitiesIFRS", "CashFlowsFromUsedInOperatingActivities", "CashFlowsFromOperatingActivities"],
  investingCashFlow: ["duration", "JPY", "NetCashProvidedByUsedInInvestingActivities", "NetCashProvidedByUsedInInvestingActivitiesSummaryOfBusinessResults", "CashFlowsFromUsedInInvestingActivitiesIFRS", "NetCashProvidedByUsedInInvestingActivitiesIFRS", "CashFlowsFromUsedInInvestingActivities"],
  financingCashFlow: ["duration", "JPY", "NetCashProvidedByUsedInFinancingActivities", "NetCashProvidedByUsedInFinancingActivitiesSummaryOfBusinessResults", "CashFlowsFromUsedInFinancingActivitiesIFRS", "NetCashProvidedByUsedInFinancingActivitiesIFRS"],
  depreciationAndAmortization: ["duration", "JPY", "DepreciationAndAmortization", "DepreciationAndAmortisationExpense", "Depreciation"],
  ebitda: ["duration", "JPY", "EBITDA"],
  cashAndEquivalents: ["instant", "JPY", "CashAndCashEquivalents", "CashAndCashEquivalentsIFRS", "CashAndCashEquivalentsIFRSSummaryOfBusinessResults", "CashAndCashEquivalentsAtEndOfPeriod", "CashAndCashEquivalentsAtEndOfPeriodSummaryOfBusinessResults", "CashAndCashEquivalentsAtEndOfPeriodIFRS", "CashAndDeposits"],
  shortTermSecurities: ["instant", "JPY", "ShortTermInvestmentSecurities", "SecuritiesCA", "MarketableSecurities"],
  interestBearingDebt: ["instant", "JPY", "InterestBearingDebt", "BondsAndBorrowings"],
  currentDebt: ["instant", "JPY", "BondsAndBorrowingsCL"],
  noncurrentDebt: ["instant", "JPY", "BondsAndBorrowingsNCL"],
  netAssets: ["instant", "JPY", "NetAssets", "NetAssetsSummaryOfBusinessResults", "EquityIFRS", "TotalEquityIFRS", "Equity"],
  totalAssets: ["instant", "JPY", "Assets", "TotalAssets", "TotalAssetsSummaryOfBusinessResults", "AssetsIFRS", "TotalAssetsIFRS"],
  sharesOutstanding: ["instant", "shares", "TotalNumberOfIssuedShares", "TotalNumberOfIssuedSharesSummaryOfBusinessResults", "TotalNumberOfIssuedSharesAsOfFiscalYearEndSummaryOfBusinessResults", "NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock", "IssuedSharesTotalNumberOfSharesEtc", "TotalNumberOfIssuedSharesIssuedSharesTotalNumberOfSharesEtc"],
  overseasSales: ["duration", "JPY", "OverseasSales", "ForeignSales", "InternationalSales", "OverseasRevenue", "RevenueFromExternalCustomersOutsideJapan", "NetSalesOutsideJapan"],
  overseasSalesRatio: ["duration", "pure", "OverseasSalesRatio", "RatioOfOverseasSales", "RatioOfOverseasSalesToNetSales", "ForeignSalesRatio"],
};
const narrativeNames = {
  BusinessRisksTextBlock: "事業リスク",
  ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock: "経営者による業績・資金収支の分析",
  ManagementDiscussionAndAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock: "経営者による業績・資金収支の分析",
  BusinessPolicyBusinessEnvironmentIssuesToAddressEtcTextBlock: "経営方針・課題",
  NotesRegardingGoingConcernTextBlock: "継続企業に関する注記",
};
const names = new Set([...Object.values(definitions).flatMap(value => value.slice(2)), ...Object.keys(narrativeNames), "AccountingStandardsDEI", "WhetherConsolidatedFinancialStatementsArePreparedDEI"]);
const localName = name => String(name || "").split(":").at(-1);
const text = value => String(value || "").replace(/\s+/g, " ").trim();
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : "";
const finite = value => typeof value === "number" && Number.isFinite(value);
const ratio = (numerator, denominator) => finite(numerator) && finite(denominator) && denominator > 0 ? numerator / denominator : null;
const periodKey = row => `${row.entity}|${row.scope}|${row.accountingStandard}|${row.startDate}|${row.endDate}`;
const annual = row => row.days >= 330 && row.days <= 380;

// Resolve periods, dimensions and units from the XML itself, never from context ID spelling.
export function parseEdinetXbrl(xml, document = {}, file = "", options = {}) {
  if (Buffer.byteLength(xml, "utf8") > 32 * 1024 * 1024) throw new Error("XBRL本文がサイズ上限を超えています");
  const contexts = new Map();
  const units = new Map();
  const raw = [];
  const stack = [];
  let context = null;
  let unit = null;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => { throw new Error("DOCTYPE付きXBRLは読み込みません"); });
  parser.on("opentag", node => {
    if (stack.length > 128) throw new Error("XBRLの階層が深すぎます");
    const attr = Object.fromEntries(Object.values(node.attributes).map(a => [a.name, a.value]));
    const nil = Object.values(node.attributes).some(a => a.uri === XSI && a.local === "nil" && /^(true|1)$/.test(a.value));
    stack.push({ ...node, ns: { ...stack.at(-1)?.ns, ...node.ns }, attr, nil, text: "" });
    if (node.uri === INSTANCE && node.local === "context") context = { id: attr.id, dimensions: [], entity: "", startDate: "", endDate: "" };
    if (node.uri === INSTANCE && node.local === "unit") unit = { id: attr.id, measures: [], divided: false };
    if (unit && node.uri === INSTANCE && node.local === "divide") unit.divided = true;
    if (context && node.uri === DIMENSIONS && node.local === "typedMember") context.unsupported = true;
  });
  const append = value => { const node = stack.at(-1); if (node && node.text.length < 16000) node.text += value.slice(0, 16000 - node.text.length); };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", () => {
    const node = stack.pop();
    const value = text(node.text);
    if (context) {
      if (node.uri === INSTANCE && node.local === "identifier") context.entity = value;
      if (node.uri === INSTANCE && node.local === "startDate") context.startDate = date(value);
      if (node.uri === INSTANCE && /^(endDate|instant)$/.test(node.local)) context.endDate = date(value);
      if (node.uri === DIMENSIONS && node.local === "explicitMember") context.dimensions.push({ axis: localName(node.attr.dimension), member: localName(value) });
      if (node.uri === INSTANCE && node.local === "context") {
        context.scope = "consolidated";
        for (const dimension of context.dimensions) {
          if (dimension.axis !== "ConsolidatedOrNonConsolidatedAxis" || !/^(NonConsolidatedMember|ConsolidatedMember)$/.test(dimension.member)) context.unsupported = true;
          if (dimension.member === "NonConsolidatedMember") context.scope = "nonconsolidated";
        }
        context.explicitScope = context.dimensions.length > 0;
        if (!context.unsupported && context.entity && context.endDate && (!context.startDate || context.startDate <= context.endDate)) contexts.set(context.id, context);
        context = null;
      }
    }
    if (unit) {
      if (node.uri === INSTANCE && node.local === "measure") {
        const [prefix, local] = value.includes(":") ? value.split(":") : ["", value];
        const uri = node.ns[prefix];
        unit.measures.push(uri === "http://www.xbrl.org/2003/iso4217" && local === "JPY" ? "JPY" : uri === INSTANCE && /^(pure|shares)$/.test(local) ? local : "unsupported");
      }
      if (node.uri === INSTANCE && node.local === "unit") {
        if (!unit.divided && unit.measures.length === 1) units.set(unit.id, unit.measures[0]);
        unit = null;
      }
    }
    if (node.attr.contextRef && names.has(node.local) && !node.nil) {
      raw.push({ name: node.local, namespace: node.uri, contextId: node.attr.contextRef, unitId: node.attr.unitRef, value, decimals: node.attr.decimals });
    }
    if (stack.at(-1)?.attr.contextRef) append(` ${value}`);
  });
  parser.write(xml).close();
  const warnings = [];
  const submitted = date(String(document.submitDateTime || "").slice(0, 10));
  const standard = raw.find(f => f.name === "AccountingStandardsDEI")?.value || "unknown";
  const standalone = /^(false|0)$/.test(raw.find(f => f.name === "WhetherConsolidatedFinancialStatementsArePreparedDEI")?.value || "");
  const accepted = raw.filter(f => contexts.has(f.contextId)).map(f => ({ ...f, ...contexts.get(f.contextId), unit: units.get(f.unitId) }))
    .filter(f => (!submitted || f.endDate <= submitted) && (!document.edinetCode || f.entity === document.edinetCode || f.entity === `${document.edinetCode}-000`))
    .map(f => standalone && !f.explicitScope ? { ...f, scope: "nonconsolidated" } : f);
  const primaryEntities = new Set(accepted.filter(f => definitions.netSales.includes(f.name) || definitions.totalAssets.includes(f.name)).map(f => f.entity));
  if (primaryEntities.size > 1) throw new Error("XBRLに複数の報告企業が含まれています");
  const numeric = accepted.filter(f => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(f.value))
    .map(f => ({ ...f, value: Number(f.value) })).filter(f => finite(f.value));
  const durations = new Map();
  for (const fact of numeric) {
    if (!fact.startDate || !Object.values(definitions).some(def => def[0] === "duration" && def.slice(2).includes(fact.name) && def[1] === fact.unit)) continue;
    const row = { entity: fact.entity, scope: fact.scope, accountingStandard: standard, startDate: fact.startDate, endDate: fact.endDate };
    durations.set(periodKey(row), row);
  }
  const periods = [...durations.values()].map(row => {
    const sources = {};
    const values = {};
    for (const [metric, [kind, expectedUnit, ...aliases]] of Object.entries(definitions)) {
      values[metric] = null;
      for (const alias of aliases) {
        const candidates = numeric.filter(f => f.name === alias && f.unit === expectedUnit && f.entity === row.entity && f.scope === row.scope && f.endDate === row.endDate && (kind === "instant" ? !f.startDate : f.startDate === row.startDate));
        if (!candidates.length) continue;
        const distinct = new Set(candidates.map(f => f.value));
        if (distinct.size !== 1) {
          warnings.push(`${row.endDate} ${metric}: 同じ期間の値が一致しないため除外`);
          break;
        }
        const selected = candidates[0];
        values[metric] = selected.value;
        sources[metric] = { docID: document.docID || "", file, concept: selected.name, namespace: selected.namespace, contextId: selected.contextId, unit: selected.unit };
        break;
      }
    }
    for (const metric of ["cashAndEquivalents", "interestBearingDebt", "currentDebt", "noncurrentDebt", "sharesOutstanding", "totalAssets"]) {
      if (values[metric] < 0) { values[metric] = null; warnings.push(`${row.endDate} ${metric}: 負の値を除外`); }
    }
    if (values.interestBearingDebt === null && finite(values.currentDebt) && finite(values.noncurrentDebt)) {
      values.interestBearingDebt = values.currentDebt + values.noncurrentDebt;
      sources.interestBearingDebt = { formula: "currentDebt + noncurrentDebt", inputs: [sources.currentDebt, sources.noncurrentDebt] };
    }
    if (values.overseasSalesRatio !== null && (values.overseasSalesRatio < 0 || values.overseasSalesRatio > 1)) values.overseasSalesRatio = null;
    if (values.overseasSalesRatio === null && finite(values.overseasSales) && values.overseasSales >= 0 && values.overseasSales <= values.netSales) {
      values.overseasSalesRatio = ratio(values.overseasSales, values.netSales);
      sources.overseasSalesRatio = { formula: "overseasSales / netSales" };
    }
    return { ...row, days: Math.round((Date.parse(row.endDate) - Date.parse(row.startDate)) / DAY) + 1, values, sources, docID: document.docID || "", submittedAt: document.submitDateTime || "" };
  }).sort((a, b) => b.endDate.localeCompare(a.endDate) || b.days - a.days).slice(0, 16);
  const narrativeLimit = Math.max(1500, Math.min(10000, Number(options.narrativeLimit) || 1500));
  const narratives = accepted.filter(f => narrativeNames[f.name]).map(f => ({
    label: narrativeNames[f.name], endDate: f.endDate, scope: f.scope, docID: document.docID || "", concept: f.name,
    text: text(f.value.replace(/<[^>]*>/g, " ")).slice(0, narrativeLimit),
  })).filter(f => f.text).sort((a, b) => b.endDate.localeCompare(a.endDate)).slice(0, 4);
  return { version: EDINET_ANALYSIS_VERSION, document, periods, narratives, warnings: [...new Set(warnings)].slice(0, 12) };
}

export function analyzeEdinetReports(reports = [], now = new Date()) {
  const valid = reports.filter(report => report?.version === EDINET_ANALYSIS_VERSION);
  const byPeriod = new Map();
  const warnings = valid.flatMap(report => report.warnings || []);
  for (const report of [...valid].sort((a, b) => String(a.document?.submitDateTime).localeCompare(String(b.document?.submitDateTime)))) {
    const documentPeriods = new Map();
    for (const row of report.periods || []) {
      const key = periodKey(row);
      const existing = documentPeriods.get(key);
      if (!existing) { documentPeriods.set(key, { ...row, values: { ...row.values }, sources: { ...row.sources }, conflicts: new Set() }); continue; }
      for (const [metric, value] of Object.entries(row.values)) {
        if (!finite(value) || existing.conflicts.has(metric)) continue;
        if (finite(existing.values[metric]) && existing.values[metric] !== value) {
          existing.values[metric] = null;
          delete existing.sources[metric];
          existing.conflicts.add(metric);
          warnings.push(`${row.endDate} ${metric}: 同じ書類内の値が一致しないため除外`);
        } else {
          existing.values[metric] = value;
          existing.sources[metric] = row.sources[metric];
        }
      }
    }
    // Replace corrected periods as a whole; only merge complementary files of the same document.
    for (const [key, { conflicts, ...row }] of documentPeriods) byPeriod.set(key, row);
  }
  const all = [...byPeriod.values()].sort((a, b) => b.endDate.localeCompare(a.endDate) || b.days - a.days);
  const scope = all.some(row => row.scope === "consolidated") ? "consolidated" : "nonconsolidated";
  const periods = all.filter(row => row.scope === scope).slice(0, 8);
  const latest = periods[0] || null;
  const compatible = (a, b) => a.scope === b.scope && a.entity === b.entity && a.accountingStandard === b.accountingStandard && (a.accountingStandard !== "unknown" || a.docID === b.docID);
  const previous = latest && periods.find(row => compatible(latest, row) && Math.abs((Date.parse(latest.endDate) - Date.parse(row.endDate)) / DAY - 365) <= 7 && Math.abs(latest.days - row.days) <= 7);
  const change = key => previous && latest.values[key] !== null ? ratio(latest.values[key] - previous.values[key], previous.values[key]) : null;
  const values = latest?.values || {};
  const annualPeriods = periods.filter(row => annual(row) && (!latest || compatible(latest, row)));
  let cfYears = 0;
  for (const row of annualPeriods) {
    if (!(row.values.operatingCashFlow > 0)) break;
    if (cfYears && Math.abs((Date.parse(annualPeriods[cfYears - 1].endDate) - Date.parse(row.endDate)) / DAY - 365) > 7) break;
    cfYears++;
  }
  const stale = latest ? (now.getTime() - Date.parse(latest.endDate)) / DAY > 550 : false;
  if (stale) warnings.push("決算期間末から550日超経過しているため、候補評価への加点は保留");
  if (!previous && latest) warnings.push("同じ期間・会計基準の前年データが不足し、増減率は未算出");
  if (!finite(values.interestBearingDebt)) warnings.push("有利子負債の総額が未取得。ゼロとみなさずネットキャッシュを未算出");
  if (!latest) warnings.push("対象期間・単位・連結区分を確認できる財務数値がありません");
  const annualLatest = annualPeriods[0];
  const analysis = {
    revenueGrowthPct: finite(change("netSales")) ? change("netSales") * 100 : null,
    operatingIncomeGrowthPct: finite(change("operatingIncome")) ? change("operatingIncome") * 100 : null,
    netIncomeGrowthPct: finite(change("netIncome")) ? change("netIncome") * 100 : null,
    operatingMarginPct: finite(ratio(values.operatingIncome, values.netSales)) ? ratio(values.operatingIncome, values.netSales) * 100 : null,
    operatingMarginChangePt: previous && finite(ratio(previous.values.operatingIncome, previous.values.netSales)) && finite(ratio(values.operatingIncome, values.netSales)) ? (ratio(values.operatingIncome, values.netSales) - ratio(previous.values.operatingIncome, previous.values.netSales)) * 100 : null,
    operatingAndInvestingCashFlow: finite(values.operatingCashFlow) && finite(values.investingCashFlow) ? values.operatingCashFlow + values.investingCashFlow : null,
    cashConversionRatio: ratio(values.operatingCashFlow, values.netIncome),
    netAssetRatioPct: finite(ratio(values.netAssets, values.totalAssets)) ? ratio(values.netAssets, values.totalAssets) * 100 : null,
    comparisonPeriod: previous ? { startDate: previous.startDate, endDate: previous.endDate } : null,
    annualPeriods: annualPeriods.length,
    consecutivePositiveOperatingCfYears: cfYears,
    netIncomeTransition: previous && finite(values.netIncome) && finite(previous.values.netIncome) ? previous.values.netIncome <= 0 && values.netIncome > 0 ? "turned_profitable" : previous.values.netIncome >= 0 && values.netIncome < 0 ? "turned_loss" : "" : "",
  };
  const facts = Object.fromEntries(Object.keys(definitions).map(key => [key, finite(values[key]) ? values[key] : null]));
  facts.operatingCashFlowYears = cfYears;
  facts.netCash = finite(facts.cashAndEquivalents) && finite(facts.interestBearingDebt) ? facts.cashAndEquivalents - facts.interestBearingDebt : null;
  facts.overseasSalesSource = latest?.sources.overseasSales?.concept || latest?.sources.overseasSalesRatio?.concept || "";
  facts.annualNetIncome = annualLatest?.values.netIncome ?? null;
  facts.annualEbitda = annualLatest?.values.ebitda ?? (finite(annualLatest?.values.operatingIncome) && finite(annualLatest?.values.depreciationAndAmortization) ? annualLatest.values.operatingIncome + annualLatest.values.depreciationAndAmortization : null);
  return {
    ...facts,
    edinet: {
      version: EDINET_ANALYSIS_VERSION, status: latest ? stale ? "stale" : "verified" : "unavailable",
      scope, latestPeriod: latest ? { startDate: latest.startDate, endDate: latest.endDate, days: latest.days, annual: annual(latest), accountingStandard: latest.accountingStandard, docID: latest.docID } : null,
      periods, analysis,
      documents: valid.map(report => report.document),
      narratives: valid.flatMap(report => report.narratives || []).filter(item => !latest || item.scope === latest.scope && item.endDate === latest.endDate).slice(0, 4),
      warnings: [...new Set(warnings)].slice(0, 12),
      netCashDefinition: "現金同等物（または現預金）−有利子負債。有価証券は重複計上防止のため加算しない。",
    },
  };
}

export function edinetInsights(edinet) {
  const a = edinet?.analysis;
  if (!a || !edinet.latestPeriod) return [];
  const result = [];
  const signed = value => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  if (finite(a.revenueGrowthPct)) result.push(`同じ長さの前年期間比で売上高${signed(a.revenueGrowthPct)}%。`);
  if (finite(a.operatingIncomeGrowthPct)) result.push(`営業利益は前年同期比${signed(a.operatingIncomeGrowthPct)}%。`);
  if (finite(a.operatingMarginPct)) result.push(`営業利益率${a.operatingMarginPct.toFixed(1)}%${finite(a.operatingMarginChangePt) ? `、前年同期から${signed(a.operatingMarginChangePt)}ポイント` : ""}。`);
  if (a.netIncomeTransition === "turned_loss") result.push("前年同期の黒字から赤字に転落しています。");
  if (a.netIncomeTransition === "turned_profitable") result.push("前年同期の赤字・ゼロ利益から黒字に転換。増益率には換算していません。");
  if (finite(a.cashConversionRatio) && a.cashConversionRatio < 0.5) result.push("営業CFが純利益の半分未満です。利益に現金収支が伴っているか確認が必要です。");
  return result;
}

export function edinetScoreAdjustment(edinet) {
  const a = edinet?.analysis;
  if (edinet?.status !== "verified" || !a) return { score: 0, reasons: [], risks: [] };
  let score = 0;
  const reasons = [];
  const risks = [];
  if ([a.revenueGrowthPct, a.operatingIncomeGrowthPct, a.operatingMarginChangePt, a.cashConversionRatio].every(finite) && a.revenueGrowthPct > 0 && a.operatingIncomeGrowthPct > 0 && a.operatingMarginChangePt >= 0 && a.cashConversionRatio >= 0.8) {
    score += 4;
    reasons.push("EDINETで前年同期比の増収増益・利益率維持と営業CFの裏付けを確認");
  }
  if (a.revenueGrowthPct < -10 || a.operatingIncomeGrowthPct < -20 || a.netIncomeTransition === "turned_loss") {
    score -= 6;
    risks.push("EDINETで減収・大幅減益または赤字転落を確認");
  }
  if (finite(a.cashConversionRatio) && a.cashConversionRatio < 0.5) {
    score -= 3;
    risks.push("営業CFが利益に追いついていない");
  }
  return { score, reasons, risks };
}
