const MANAGED_STOCK_LIMIT = 50;
const VIEW_KEYS = new Set(["analysis", "performance", "stocks", "us", "crypto", "ideas", "settings"]);
const VIEW_STORAGE_KEY = "stockSignalActiveView";
const NISA_GROWTH_ANNUAL_LIMIT_YEN = 2400000;
const NISA_GROWTH_LIFETIME_LIMIT_YEN = 12000000;
const loadedDataSections = new Set();
const pendingDataLoads = new Map();
const JP_DISCOVERY_NAME_BY_SYMBOL = {
  "5842.T": "インテグラル",
};
const JP_DISCOVERY_SECTOR_BY_SYMBOL = {
  "5842.T": "金融",
};

const state = {
  stocks: [],
  stocksLoaded: false,
  stockLoadError: "",
  analyses: {},
  usStocks: [],
  usAnalyses: {},
  usSummary: null,
  cacheVersions: { jp: "", us: "", crypto: "" },
  cryptoHolding: null,
  cryptoAnalysis: null,
  suggestions: [],
  successfulCandidates: [],
  underperformingCandidates: [],
  underperformingCandidateCount: 0,
  excludedCandidates: [],
  sectorEvidence: [],
  sourceSummary: null,
  discoveryMode: "general",
  candidatePerformance: null,
  analysisJob: null,
  usAnalysisJob: null,
  discoveryJob: null,
  discoveryGeneratedAt: "",
  diagnostics: null,
  settings: null,
  selected: null,
  usSelected: null,
  view: preferredView(),
  performanceMarket: "jp",
  ideaView: "candidates",
  cryptoView: "btc",
  jpUnheldExpanded: false,
  settingsTab: "search",
  running: false,
  jpRefreshing: false,
  usRefreshing: false,
  cryptoRefreshing: false,
};

const actionLabels = {
  BUY: "買い候補",
  HOLD: "保有継続",
  SELL: "見直し候補",
  WATCH: "要確認",
};

const actionClasses = {
  BUY: "buy",
  HOLD: "hold",
  SELL: "sell",
  WATCH: "watch",
};

const chartState = {
  series: [],
  tradeMarkers: [],
  price: {},
  points: [],
  plot: null,
  hoverIndex: null,
};
const forecastSeriesCache = new Map();
const forecastSeriesRequests = new Map();
let forecastChartObserver = null;

const reorderState = {
  symbol: "",
  moved: false,
};

const DETAIL_FORM_EDIT_HOLD_MS = 8000;
let detailFormEditHoldUntil = 0;
let stockLookupSequence = 0;

const els = {
  viewButtons: [...document.querySelectorAll("[data-view-target]")],
  viewPanels: [...document.querySelectorAll("[data-view]")],
  ideaTabButtons: [...document.querySelectorAll("[data-idea-tab]")],
  ideaPanels: [...document.querySelectorAll("[data-idea-panel]")],
  settingsTabButtons: [...document.querySelectorAll("[data-settings-tab]")],
  settingsPanels: [...document.querySelectorAll("[data-settings-panel]")],
  googleStatus: document.getElementById("googleStatus"),
  lmStatus: document.getElementById("lmStatus"),
  jpMarketStatus: document.getElementById("jpMarketStatus"),
  usMarketStatus: document.getElementById("usMarketStatus"),
  stockForm: document.getElementById("stockForm"),
  stockName: document.getElementById("stockName"),
  stockSymbol: document.getElementById("stockSymbol"),
  stockLookupStatus: document.getElementById("stockLookupStatus"),
  stockSector: document.getElementById("stockSector"),
  stockPurchaseDate: document.getElementById("stockPurchaseDate"),
  stockPurchasePrice: document.getElementById("stockPurchasePrice"),
  stockQuantity: document.getElementById("stockQuantity"),
  stockAccountType: document.getElementById("stockAccountType"),
  stockMinimumHoldQuantity: document.getElementById("stockMinimumHoldQuantity"),
  stockTargetBuyPrice: document.getElementById("stockTargetBuyPrice"),
  stockCount: document.getElementById("stockCount"),
  stockProgress: document.getElementById("stockProgress"),
  analyzeButton: document.getElementById("analyzeButton"),
  usAnalyzeButton: document.getElementById("usAnalyzeButton"),
  profitSummary: document.querySelector('[data-view="analysis"] .profit-summary'),
  usProfitSummary: document.querySelector('[data-view="us"] .us-profit-summary'),
  performanceTabs: [...document.querySelectorAll("[data-performance-market]")],
  performanceCurrent: document.getElementById("performanceCurrent"),
  performanceCurrentNote: document.getElementById("performanceCurrentNote"),
  performanceForecast: document.getElementById("performanceForecast"),
  performanceForecastNote: document.getElementById("performanceForecastNote"),
  performanceDividend: document.getElementById("performanceDividend"),
  performanceUpdatedAt: document.getElementById("performanceUpdatedAt"),
  performanceChartTitle: document.getElementById("performanceChartTitle"),
  performanceChart: document.getElementById("performanceChart"),
  performanceChartPanel: document.getElementById("performanceChartPanel"),
  performanceEmpty: document.getElementById("performanceEmpty"),
  usStockForm: document.getElementById("usStockForm"),
  usStockName: document.getElementById("usStockName"),
  usStockSymbol: document.getElementById("usStockSymbol"),
  usStockMarket: document.getElementById("usStockMarket"),
  usStockPurchaseDate: document.getElementById("usStockPurchaseDate"),
  usStockPurchasePrice: document.getElementById("usStockPurchasePrice"),
  usStockQuantity: document.getElementById("usStockQuantity"),
  usProfitAmount: document.getElementById("usProfitAmount"),
  usProfitPct: document.getElementById("usProfitPct"),
  usRealizedPnlTotal: document.getElementById("usRealizedPnlTotal"),
  usDividendIncomeTotal: document.getElementById("usDividendIncomeTotal"),
  usDividendReceivedTotal: document.getElementById("usDividendReceivedTotal"),
  usDividendReceivedTiming: document.getElementById("usDividendReceivedTiming"),
  usInvestedTotal: document.getElementById("usInvestedTotal"),
  usMarketTotal: document.getElementById("usMarketTotal"),
  usWinCount: document.getElementById("usWinCount"),
  usLossCount: document.getElementById("usLossCount"),
  usLastRun: document.getElementById("usLastRun"),
  usStockTable: document.getElementById("usStockTable"),
  usSelectedSymbol: document.getElementById("usSelectedSymbol"),
  usDetail: document.getElementById("usDetail"),
  cryptoAnalyzeButton: document.getElementById("cryptoAnalyzeButton"),
  cryptoProfitSummary: document.querySelector('[data-view="crypto"] .crypto-profit-summary'),
  fxProfitSummary: document.querySelector('[data-crypto-panel="fx"] .fx-rate-summary'),
  cryptoTabButtons: [...document.querySelectorAll("[data-crypto-tab]")],
  cryptoPanels: [...document.querySelectorAll("[data-crypto-panel]")],
  cryptoLastRun: document.getElementById("cryptoLastRun"),
  btcJpyPrice: document.getElementById("btcJpyPrice"),
  usdJpyRate: document.getElementById("usdJpyRate"),
  usdJpyChange: document.getElementById("usdJpyChange"),
  eurJpyRate: document.getElementById("eurJpyRate"),
  eurJpyChange: document.getElementById("eurJpyChange"),
  cryptoQuantity: document.getElementById("cryptoQuantity"),
  cryptoPnlJpy: document.getElementById("cryptoPnlJpy"),
  cryptoPnlJpyPct: document.getElementById("cryptoPnlJpyPct"),
  cryptoDetail: document.getElementById("cryptoDetail"),
  fxDetail: document.getElementById("fxDetail"),
  discoverButton: document.getElementById("discoverButton"),
  discoverNisaButton: document.getElementById("discoverNisaButton"),
  websiteLimit: document.getElementById("websiteLimit"),
  depthLimit: document.getElementById("depthLimit"),
  pagesPerSite: document.getElementById("pagesPerSite"),
  profitAmount: document.getElementById("profitAmount"),
  profitPct: document.getElementById("profitPct"),
  totalReturnAmount: document.getElementById("totalReturnAmount"),
  totalReturnPct: document.getElementById("totalReturnPct"),
  realizedPnlTotal: document.getElementById("realizedPnlTotal"),
  dividendReceivedTotal: document.getElementById("dividendReceivedTotal"),
  dividendReceivedTiming: document.getElementById("dividendReceivedTiming"),
  investedTotal: document.getElementById("investedTotal"),
  marketTotal: document.getElementById("marketTotal"),
  dividendIncomeTotal: document.getElementById("dividendIncomeTotal"),
  profitableCount: document.getElementById("profitableCount"),
  lossCount: document.getElementById("lossCount"),
  nisaRemainingTotal: document.getElementById("nisaRemainingTotal"),
  nisaAllowanceUsage: document.getElementById("nisaAllowanceUsage"),
  lastRun: document.getElementById("lastRun"),
  stockTable: document.getElementById("stockTable"),
  watchlistHoldingCount: document.getElementById("watchlistHoldingCount"),
  recentHoldingWatchlist: document.getElementById("recentHoldingWatchlist"),
  recentHoldingStockCount: document.getElementById("recentHoldingStockCount"),
  recentHoldingStockTable: document.getElementById("recentHoldingStockTable"),
  unheldWatchlist: document.getElementById("unheldWatchlist"),
  unheldStockCount: document.getElementById("unheldStockCount"),
  unheldStockTable: document.getElementById("unheldStockTable"),
  manageStockTable: document.getElementById("manageStockTable"),
  selectedSymbol: document.getElementById("selectedSymbol"),
  decisionDetail: document.getElementById("decisionDetail"),
  evidenceList: document.getElementById("evidenceList"),
  researchProgress: document.getElementById("researchProgress"),
  candidateProgress: document.getElementById("candidateProgress"),
  candidateList: document.getElementById("candidateList"),
  peCandidateList: document.getElementById("peCandidateList"),
  suggestionSource: document.getElementById("suggestionSource"),
  candidateSavedAt: document.getElementById("candidateSavedAt"),
  candidatePerformance: document.getElementById("candidatePerformance"),
  candidateLearningSummary: document.getElementById("candidateLearningSummary"),
  successfulCandidateList: document.getElementById("successfulCandidateList"),
  successfulCandidateCount: document.getElementById("successfulCandidateCount"),
  underperformingCandidateList: document.getElementById("underperformingCandidateList"),
  underperformingCandidateCount: document.getElementById("underperformingCandidateCount"),
  excludedCandidateCount: document.getElementById("excludedCandidateCount"),
  excludedCandidateList: document.getElementById("excludedCandidateList"),
  sectorEvidenceList: document.getElementById("sectorEvidenceList"),
  settingsForm: document.getElementById("settingsForm"),
  settingsSearchProvider: document.getElementById("settingsSearchProvider"),
  settingsSearxngUrl: document.getElementById("settingsSearxngUrl"),
  settingsSearxngEngines: document.getElementById("settingsSearxngEngines"),
  settingsGoogleApiKey: document.getElementById("settingsGoogleApiKey"),
  settingsGoogleCseId: document.getElementById("settingsGoogleCseId"),
  settingsGoogleSearchUrl: document.getElementById("settingsGoogleSearchUrl"),
  settingsLmStudioUrl: document.getElementById("settingsLmStudioUrl"),
  settingsLmStudioTimeoutMs: document.getElementById("settingsLmStudioTimeoutMs"),
  settingsUnitSize: document.getElementById("settingsUnitSize"),
  settingsUnitBudget: document.getElementById("settingsUnitBudget"),
  settingsUnitBudgetUnlimited: document.getElementById("settingsUnitBudgetUnlimited"),
  settingsDailyDiscoveryEnabled: document.getElementById("settingsDailyDiscoveryEnabled"),
  settingsDailyDiscoveryHour: document.getElementById("settingsDailyDiscoveryHour"),
  settingsHourlyRefreshEnabled: document.getElementById("settingsHourlyRefreshEnabled"),
  settingsMarketHoursOnlyRefresh: document.getElementById("settingsMarketHoursOnlyRefresh"),
  settingsTdnetDisclosureEnabled: document.getElementById("settingsTdnetDisclosureEnabled"),
  settingsTdnetDisclosureLookbackDays: document.getElementById("settingsTdnetDisclosureLookbackDays"),
  settingsTdnetDisclosureUseLmStudio: document.getElementById("settingsTdnetDisclosureUseLmStudio"),
  settingsGrowthExitEnabled: document.getElementById("settingsGrowthExitEnabled"),
  settingsTrailingStopPct: document.getElementById("settingsTrailingStopPct"),
  settingsOnkabuProfitPct: document.getElementById("settingsOnkabuProfitPct"),
  settingsShareholderMonitorEnabled: document.getElementById("settingsShareholderMonitorEnabled"),
  settingsShareholderUseLmStudio: document.getElementById("settingsShareholderUseLmStudio"),
  settingsShareholderChangeThresholdPct: document.getElementById("settingsShareholderChangeThresholdPct"),
  settingsEdinetApiKey: document.getElementById("settingsEdinetApiKey"),
  settingsRakutenAccountMemo: document.getElementById("settingsRakutenAccountMemo"),
  settingsRevolutAccountMemo: document.getElementById("settingsRevolutAccountMemo"),
  settingsNotificationsEnabled: document.getElementById("settingsNotificationsEnabled"),
  settingsDefaultJpAccountType: document.getElementById("settingsDefaultJpAccountType"),
  settingsJpTaxableTradeFeeYen: document.getElementById("settingsJpTaxableTradeFeeYen"),
  settingsJpNisaTradeFeeYen: document.getElementById("settingsJpNisaTradeFeeYen"),
  settingsNisaAnnualLimitYen: document.getElementById("settingsNisaAnnualLimitYen"),
  settingsJpCapitalGainTaxPct: document.getElementById("settingsJpCapitalGainTaxPct"),
  settingsUsTradeFeeUsd: document.getElementById("settingsUsTradeFeeUsd"),
  settingsUsCapitalGainTaxPct: document.getElementById("settingsUsCapitalGainTaxPct"),
  settingsNotificationMinNetEdgeYen: document.getElementById("settingsNotificationMinNetEdgeYen"),
  settingsNotificationMinConfidence: document.getElementById("settingsNotificationMinConfidence"),
  settingsTeamsWebhookUrl: document.getElementById("settingsTeamsWebhookUrl"),
  settingsGraphChatId: document.getElementById("settingsGraphChatId"),
  settingsGraphTenantId: document.getElementById("settingsGraphTenantId"),
  settingsGraphClientId: document.getElementById("settingsGraphClientId"),
  settingsGraphClientSecret: document.getElementById("settingsGraphClientSecret"),
  settingsGraphAccessToken: document.getElementById("settingsGraphAccessToken"),
  settingsSearchStatus: document.getElementById("settingsSearchStatus"),
  settingsLmStatus: document.getElementById("settingsLmStatus"),
  settingsDisclosureStatus: document.getElementById("settingsDisclosureStatus"),
  settingsShareholderStatus: document.getElementById("settingsShareholderStatus"),
  settingsFinancialStatus: document.getElementById("settingsFinancialStatus"),
  diagnosticsButton: document.getElementById("diagnosticsButton"),
  disclosureCheckButton: document.getElementById("disclosureCheckButton"),
  shareholderCheckButton: document.getElementById("shareholderCheckButton"),
  financialCheckButton: document.getElementById("financialCheckButton"),
  testNotificationButton: document.getElementById("testNotificationButton"),
  diagnosticsStatus: document.getElementById("diagnosticsStatus"),
  diagnosticsList: document.getElementById("diagnosticsList"),
  chart: document.getElementById("priceChart"),
  chartTooltip: document.getElementById("chartTooltip"),
  chartTiming: document.getElementById("chartTiming"),
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    signal: !options.method || options.method === "GET" ? AbortSignal.timeout(20000) : undefined,
    headers: { "content-type": "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function yen(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: value >= 1000 ? 0 : 1,
  }).format(value);
}

function usd(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

function moneyByCurrency(value, currency = "JPY") {
  return currency === "USD" ? usd(value) : yen(value);
}

function compactUsd(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function largeYen(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(2)}兆円`;
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}億円`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}万円`;
  return yen(value);
}

function shareCount(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}億株`;
  if (abs >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ja-JP")}万株`;
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}株`;
}

function multipleText(value) {
  return Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 1 : 2)}倍` : "-";
}

function fxRate(value) {
  if (!Number.isFinite(value)) return "-";
  return `¥${value.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}`;
}

function btcAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 8 })} BTC`;
}

function pct(value) {
  if (!Number.isFinite(value)) return "-";
  const text = `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  const cls = value >= 0 ? "metric-pos" : "metric-neg";
  return `<span class="${cls}">${text}</span>`;
}

function clampInput(input) {
  const min = Number(input.min || 1);
  const max = Number(input.max || 20);
  const value = Number(input.value || min);
  input.value = String(Math.max(min, Math.min(max, value)));
  return Number(input.value);
}

function setStatus(el, ok, text) {
  if (!el) return;
  el.classList.toggle("ok", ok === true);
  el.classList.toggle("bad", ok === false);
  el.textContent = text;
}

function searchStatusText(search = {}, options = {}) {
  if (!search.ok) return "未接続";
  const provider = options.provider ? `${search.provider || "検索"} ` : "";
  const checked = Number.isFinite(search.resultCount) ? `（確認${search.resultCount}件）` : "";
  const engines = search.engines ? ` / ${search.engines}` : "";
  return `${provider}接続OK${checked}${engines}`;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

async function loadStatus() {
  try {
    const status = await request("/api/status");
    const search = status.searchEngine || status.googleSearch || {};
    setStatus(els.googleStatus, search.ok, searchStatusText(search, { provider: true }));
    setStatus(els.lmStatus, status.lmStudio.ok, status.lmStudio.ok ? status.lmStudio.model || "接続中" : "未接続");
    applyMarketStatus(status.markets);
    setStatus(els.settingsSearchStatus, search.ok, searchStatusText(search));
    setStatus(els.settingsLmStatus, status.lmStudio.ok, status.lmStudio.ok ? "接続中" : "未接続");
    if (status.settings) applySettings(status.settings);
  } catch {
    setStatus(els.googleStatus, false, "未接続");
    setStatus(els.lmStatus, false, "未接続");
    applyMarketStatus(null);
  }
}

function applyMarketStatus(markets) {
  const jpOpen = markets?.jp?.open === true;
  const usOpen = markets?.us?.open === true;
  setStatus(els.jpMarketStatus, jpOpen, markets?.jp ? (jpOpen ? "開場中" : "休場中") : "確認不可");
  setStatus(els.usMarketStatus, usOpen, markets?.us ? (usOpen ? "開場中" : "休場中") : "確認不可");
}

async function loadSettings() {
  const payload = await request("/api/settings");
  applySettings(payload.settings);
}

function applySettings(settings = {}) {
  state.settings = settings;
  if (els.settingsSearchProvider) els.settingsSearchProvider.value = settings.searchProvider || "searxng";
  if (els.settingsSearxngUrl) els.settingsSearxngUrl.value = settings.searxngUrl || "http://127.0.0.1:8081/search";
  if (els.settingsSearxngEngines) els.settingsSearxngEngines.value = settings.searxngEngines || "bing";
  if (els.settingsGoogleCseId) els.settingsGoogleCseId.value = settings.googleCseId || "";
  if (els.settingsGoogleSearchUrl) els.settingsGoogleSearchUrl.value = settings.googleSearchUrl || "https://www.googleapis.com/customsearch/v1";
  if (els.settingsLmStudioUrl) els.settingsLmStudioUrl.value = settings.lmStudioUrl || "http://127.0.0.1:1234/v1";
  if (els.settingsLmStudioTimeoutMs) els.settingsLmStudioTimeoutMs.value = settings.lmStudioTimeoutMs || 180000;
  if (els.settingsUnitSize) els.settingsUnitSize.value = settings.unitSize || 100;
  if (els.settingsUnitBudget) els.settingsUnitBudget.value = settings.unitBudget || 300000;
  if (els.settingsUnitBudgetUnlimited) els.settingsUnitBudgetUnlimited.checked = settings.unitBudgetUnlimited === true;
  if (els.settingsUnitBudget) els.settingsUnitBudget.disabled = settings.unitBudgetUnlimited === true;
  if (els.websiteLimit) els.websiteLimit.value = settings.websiteLimit || 10;
  if (els.depthLimit) els.depthLimit.value = settings.depthLimit || 2;
  if (els.pagesPerSite) els.pagesPerSite.value = settings.pagesPerSite || 2;
  if (els.settingsDailyDiscoveryEnabled) els.settingsDailyDiscoveryEnabled.checked = settings.dailyDiscoveryEnabled !== false;
  if (els.settingsDailyDiscoveryHour) els.settingsDailyDiscoveryHour.value = Number.isFinite(settings.dailyDiscoveryHour) ? settings.dailyDiscoveryHour : 7;
  if (els.settingsHourlyRefreshEnabled) els.settingsHourlyRefreshEnabled.checked = settings.hourlyRefreshEnabled !== false;
  if (els.settingsMarketHoursOnlyRefresh) els.settingsMarketHoursOnlyRefresh.checked = settings.marketHoursOnlyRefresh !== false;
  if (els.settingsTdnetDisclosureEnabled) els.settingsTdnetDisclosureEnabled.checked = settings.tdnetDisclosureEnabled !== false;
  if (els.settingsTdnetDisclosureLookbackDays) els.settingsTdnetDisclosureLookbackDays.value = Number.isFinite(settings.tdnetDisclosureLookbackDays) ? settings.tdnetDisclosureLookbackDays : 3;
  if (els.settingsTdnetDisclosureUseLmStudio) els.settingsTdnetDisclosureUseLmStudio.checked = settings.tdnetDisclosureUseLmStudio !== false;
  if (els.settingsDisclosureStatus) {
    setStatus(els.settingsDisclosureStatus, settings.tdnetDisclosureEnabled !== false, settings.tdnetDisclosureEnabled !== false ? "監視中" : "停止中");
  }
  if (els.settingsGrowthExitEnabled) els.settingsGrowthExitEnabled.checked = settings.growthExitEnabled !== false;
  if (els.settingsTrailingStopPct) els.settingsTrailingStopPct.value = Number.isFinite(settings.trailingStopPct) ? settings.trailingStopPct : 25;
  if (els.settingsOnkabuProfitPct) els.settingsOnkabuProfitPct.value = Number.isFinite(settings.onkabuProfitPct) ? settings.onkabuProfitPct : 100;
  if (els.settingsShareholderMonitorEnabled) els.settingsShareholderMonitorEnabled.checked = settings.shareholderMonitorEnabled !== false;
  if (els.settingsShareholderUseLmStudio) els.settingsShareholderUseLmStudio.checked = settings.shareholderUseLmStudio !== false;
  if (els.settingsShareholderChangeThresholdPct) els.settingsShareholderChangeThresholdPct.value = Number.isFinite(settings.shareholderChangeThresholdPct) ? settings.shareholderChangeThresholdPct : 2;
  if (els.settingsShareholderStatus) {
    setStatus(els.settingsShareholderStatus, settings.shareholderMonitorEnabled !== false, settings.shareholderMonitorEnabled !== false ? "監視中" : "停止中");
  }
  if (els.settingsFinancialStatus) {
    setStatus(els.settingsFinancialStatus, settings.hasEdinetApiKey === true, settings.hasEdinetApiKey ? "キー保存済み" : "未設定");
  }
  if (els.settingsEdinetApiKey) {
    els.settingsEdinetApiKey.placeholder = settings.hasEdinetApiKey ? "保存済み。変更時だけ入力" : "EDINET APIキー";
  }
  if (els.settingsRakutenAccountMemo) els.settingsRakutenAccountMemo.value = settings.rakutenAccountMemo || "";
  if (els.settingsRevolutAccountMemo) els.settingsRevolutAccountMemo.value = settings.revolutAccountMemo || "";
  if (els.settingsNotificationsEnabled) els.settingsNotificationsEnabled.checked = settings.notificationsEnabled === true;
  if (els.settingsDefaultJpAccountType) els.settingsDefaultJpAccountType.value = normalizeAccountType(settings.defaultJpAccountType || "taxable");
  if (els.stockAccountType) els.stockAccountType.value = normalizeAccountType(settings.defaultJpAccountType || "taxable");
  if (els.settingsJpTaxableTradeFeeYen) els.settingsJpTaxableTradeFeeYen.value = settings.jpTaxableTradeFeeYen || 0;
  if (els.settingsJpNisaTradeFeeYen) els.settingsJpNisaTradeFeeYen.value = settings.jpNisaTradeFeeYen || 0;
  if (els.settingsNisaAnnualLimitYen) els.settingsNisaAnnualLimitYen.value = normalizedNisaAnnualLimitYen(settings.nisaAnnualLimitYen);
  if (els.settingsJpCapitalGainTaxPct) els.settingsJpCapitalGainTaxPct.value = Number.isFinite(settings.jpCapitalGainTaxPct) ? settings.jpCapitalGainTaxPct : 20.315;
  if (els.settingsUsTradeFeeUsd) els.settingsUsTradeFeeUsd.value = Number.isFinite(settings.usTradeFeeUsd) ? settings.usTradeFeeUsd : 0;
  if (els.settingsUsCapitalGainTaxPct) els.settingsUsCapitalGainTaxPct.value = Number.isFinite(settings.usCapitalGainTaxPct) ? settings.usCapitalGainTaxPct : 0;
  if (els.settingsNotificationMinNetEdgeYen) els.settingsNotificationMinNetEdgeYen.value = Number.isFinite(settings.notificationMinNetEdgeYen) ? settings.notificationMinNetEdgeYen : 5000;
  if (els.settingsNotificationMinConfidence) els.settingsNotificationMinConfidence.value = settings.notificationMinConfidence || 78;
  if (els.settingsTeamsWebhookUrl) els.settingsTeamsWebhookUrl.placeholder = settings.hasTeamsWebhookUrl ? "保存済み。変更時だけ入力" : "Workflowsで作ったWebhook URL";
  if (els.settingsGraphChatId) els.settingsGraphChatId.value = settings.graphChatId || "";
  if (els.settingsGraphTenantId) els.settingsGraphTenantId.value = settings.graphTenantId || "";
  if (els.settingsGraphClientId) els.settingsGraphClientId.value = settings.graphClientId || "";
  if (els.settingsGraphClientSecret) els.settingsGraphClientSecret.placeholder = settings.hasGraphClientSecret ? "保存済み。変更時だけ入力" : "必要な場合だけ";
  if (els.settingsGraphAccessToken) els.settingsGraphAccessToken.placeholder = settings.hasGraphAccessToken ? "保存済み。変更時だけ入力" : "Graph APIを使う場合だけ";
  if (els.settingsGoogleApiKey) els.settingsGoogleApiKey.placeholder = settings.hasGoogleApiKey ? "保存済み。変更時だけ入力" : "Googleを使う場合に入力";
}

async function loadStocks(cachedPayload = null) {
  const payload = cachedPayload || await request("/api/stocks");
  state.stocks = payload.stocks || [];
  state.stocksLoaded = true;
  state.stockLoadError = "";
  if (!state.selected && state.stocks.length) state.selected = state.stocks[0].symbol;
  renderCurrentDataView();
}

async function loadUsStocks() {
  const payload = await request("/api/us-stocks");
  state.usStocks = payload.stocks || [];
  if (!state.usSelected && state.usStocks.length) state.usSelected = state.usStocks[0].symbol;
  if (state.view === "us") renderUs();
}

async function loadAnalysisCache(background = false, cachedPayload = null) {
  const payload = cachedPayload || await request("/api/analysis");
  if (background && payload.cacheVersion && state.cacheVersions.jp === payload.cacheVersion) return;
  if (payload.cacheVersion) state.cacheVersions.jp = payload.cacheVersion;
  const currentSymbols = new Set(state.stocks.map((stock) => stock.symbol));
  state.analyses = Object.fromEntries((payload.analyses || [])
    .filter((item) => currentSymbols.has(item.symbol))
    .map((item) => [item.symbol, item]));
  state.sectorEvidence = payload.sectorEvidence || [];
  if (payload.generatedAt) {
    els.lastRun.textContent = `保存済み ${new Date(payload.generatedAt).toLocaleString("ja-JP")}`;
    els.researchProgress.textContent = payload.fastRefresh
      ? "保存済み 価格更新"
      : payload.usedLmStudio ? "保存済み LM Studio分析" : "保存済みルール分析";
  }
  if (background) {
    if (state.view === "analysis") {
      renderTable();
      renderProfitSummary();
      if (!isDetailFormEditing() && !document.activeElement?.closest("form")) renderSelection();
    } else if (state.view === "performance") {
      renderPerformance();
    }
    return;
  }
  renderCurrentDataView();
}

async function loadUsAnalysisCache(background = false) {
  const payload = await request("/api/us-analysis");
  if (background && payload.cacheVersion && state.cacheVersions.us === payload.cacheVersion) return;
  if (payload.cacheVersion) state.cacheVersions.us = payload.cacheVersion;
  applyUsAnalysisPayload(payload);
  if (state.view === "us" && (!background || (!isDetailFormEditing() && !document.activeElement?.closest("form")))) renderUs();
  else if (state.view === "performance" && (!background || !isDetailFormEditing())) renderPerformance();
}

async function loadCrypto(background = false) {
  const payload = await request("/api/crypto");
  if (background && payload.cacheVersion && state.cacheVersions.crypto === payload.cacheVersion) return;
  if (payload.cacheVersion) state.cacheVersions.crypto = payload.cacheVersion;
  applyCryptoPayload(payload);
  if (state.view === "crypto" && (!background || (!isDetailFormEditing() && !document.activeElement?.closest("form")))) renderCrypto();
}

let backgroundCacheLoading = false;

async function syncBackgroundPrices() {
  if (document.hidden || backgroundCacheLoading) return;
  backgroundCacheLoading = true;
  try {
    const payload = await request("/api/cache-versions");
    const versions = payload.versions || {};
    const refreshes = [];
    if (loadedDataSections.has("jp") && versions.jp && versions.jp !== state.cacheVersions.jp) refreshes.push(loadAnalysisCache(true));
    if (loadedDataSections.has("us") && versions.us && versions.us !== state.cacheVersions.us) refreshes.push(loadUsAnalysisCache(true));
    if (loadedDataSections.has("crypto") && versions.crypto && versions.crypto !== state.cacheVersions.crypto) refreshes.push(loadCrypto(true));
    await Promise.allSettled(refreshes);
  } finally {
    backgroundCacheLoading = false;
  }
}

function renderCurrentDataView() {
  if (state.view === "analysis") {
    renderTable();
    renderProfitSummary();
    renderSelection();
    renderAnalysisJob();
  } else if (state.view === "stocks") {
    renderTable();
  } else if (state.view === "us") {
    renderUs();
  } else if (state.view === "performance") {
    renderPerformance();
  } else if (state.view === "crypto") {
    renderCrypto();
  } else if (state.view === "ideas") {
    renderCandidateList();
    renderSectorEvidence();
    renderDiscoveryJob();
  }
}

function ensureDataSection(key, loader) {
  if (loadedDataSections.has(key)) return Promise.resolve();
  if (pendingDataLoads.has(key)) return pendingDataLoads.get(key);
  const task = (async () => {
    try {
      await loader();
      loadedDataSections.add(key);
    } finally {
      pendingDataLoads.delete(key);
    }
  })();
  pendingDataLoads.set(key, task);
  return task;
}

function ensureViewData(view) {
  if (view === "analysis" || view === "stocks") {
    return ensureDataSection("jp", async () => {
      const stocksTask = request("/api/stocks").then(loadStocks);
      const analysisTask = request("/api/analysis").then(async (payload) => {
        await stocksTask;
        await loadAnalysisCache(false, payload);
      });
      await Promise.all([stocksTask, analysisTask, loadAnalysisJob()]);
    });
  }
  if (view === "us") {
    return ensureDataSection("us", async () => {
      await Promise.all([loadUsStocks(), loadUsAnalysisCache(), loadUsAnalysisJob()]);
    });
  }
  if (view === "performance") {
    return Promise.all([ensureViewData("stocks"), ensureViewData("us")]).then(() => renderPerformance());
  }
  if (view === "crypto") return ensureDataSection("crypto", () => loadCrypto());
  if (view === "ideas") return ensureDataSection("ideas", () => loadDiscoveryCache());
  return Promise.resolve();
}

function applyUsAnalysisPayload(payload = {}) {
  if (Array.isArray(payload.analyses)) {
    state.usAnalyses = Object.fromEntries(payload.analyses.map((item) => [item.symbol, item]));
  }
  if (payload.summary) state.usSummary = payload.summary;
  if (payload.generatedAt && els.usLastRun) {
    els.usLastRun.textContent = payload.fastRefresh
      ? `保存済み 価格更新 ${new Date(payload.generatedAt).toLocaleString("ja-JP")}`
      : `保存済み ${new Date(payload.generatedAt).toLocaleString("ja-JP")}`;
  }
}

function applyCryptoPayload(payload = {}) {
  if (payload.holding) state.cryptoHolding = payload.holding;
  if (payload.analysis) state.cryptoAnalysis = mergeCryptoAnalysis(state.cryptoAnalysis, payload.analysis);
  else if (payload.generatedAt || payload.btcUsd || payload.btcJpy || payload.usdJpy) {
    state.cryptoAnalysis = mergeCryptoAnalysis(state.cryptoAnalysis, payload);
  }
  const generatedAt = state.cryptoAnalysis?.generatedAt;
  if (generatedAt && els.cryptoLastRun) {
    els.cryptoLastRun.textContent = `保存済み ${new Date(generatedAt).toLocaleString("ja-JP")}`;
  }
}

function mergeCryptoAnalysis(previous = null, next = {}) {
  const base = previous || {};
  return {
    ...base,
    ...next,
    btcUsd: next.btcUsd || base.btcUsd,
    btcJpy: next.btcJpy || base.btcJpy,
    usdJpy: next.usdJpy || base.usdJpy,
    position: next.position || base.position,
    timing: next.timing || base.timing,
  };
}

async function loadAnalysisJob() {
  const payload = await request("/api/analysis-job").catch(() => null);
  if (!payload) return;
  state.analysisJob = payload.job || null;
  if (payload.result) applyAnalysisPayload(payload.result, false);
  renderAnalysisJob();
  if (state.analysisJob?.running) {
    state.jpRefreshing = true;
    renderProfitSummary();
    void pollAnalysisJob()
    .then((result) => {
      applyAnalysisPayload(result);
      state.jpRefreshing = false;
      renderCurrentDataView();
    })
    .catch((error) => {
      toast(error.message);
      els.researchProgress.textContent = "失敗";
      state.jpRefreshing = false;
      renderProfitSummary();
    });
  }
}

async function loadUsAnalysisJob() {
  const payload = await request("/api/us-analysis-job").catch(() => null);
  if (!payload) return;
  state.usAnalysisJob = payload.job || null;
  if (payload.result) applyUsAnalysisPayload(payload.result);
  renderUsAnalysisJob();
  if (state.usAnalysisJob?.running) {
    state.usRefreshing = true;
    renderUsSummary();
    void pollUsAnalysisJob()
    .then((result) => {
      applyUsAnalysisPayload(result);
      state.usRefreshing = false;
      if (state.view === "us") renderUs();
    })
    .catch((error) => {
      toast(error.message);
      if (els.usLastRun) els.usLastRun.textContent = "失敗";
      state.usRefreshing = false;
      renderUsSummary();
    });
  }
}

async function loadDiscoveryCache() {
  const payload = await request("/api/discovery");
  state.suggestions = sanitizeDiscoverySuggestions(payload.suggestions || []);
  state.successfulCandidates = payload.successfulCandidates || [];
  state.underperformingCandidates = payload.underperformingCandidates || [];
  state.underperformingCandidateCount = payload.underperformingCandidateCount || 0;
  state.excludedCandidates = payload.excludedCandidates || [];
  state.sourceSummary = payload.sourceSummary || null;
  state.candidatePerformance = payload.candidatePerformance || payload.sourceSummary?.performance || null;
  state.discoveryJob = payload.job || null;
  state.discoveryMode = payload.job?.running
    ? payload.job.mode || payload.sourceSummary?.discoveryMode || "general"
    : payload.sourceSummary?.discoveryMode || "general";
  state.discoveryGeneratedAt = payload.generatedAt || "";
  renderDiscoveryJob();
  if (state.discoveryJob?.running) void pollDiscoveryJob();
  if (state.view === "ideas") {
    renderCandidateList();
    renderSectorEvidence();
  }
}

function render() {
  safeRender("ナビゲーション", renderNavigation);
  safeRender("候補タブ", renderIdeaTabs);
  safeRender("設定タブ", renderSettingsTabs);
  safeRender("銘柄一覧", renderTable);
  safeRender("損益サマリー", renderProfitSummary);
  safeRender("Decision", renderSelection);
  safeRender("候補一覧", renderCandidateList);
  safeRender("業種Evidence", renderSectorEvidence);
  safeRender("候補検索ジョブ", renderDiscoveryJob);
  safeRender("分析ジョブ", renderAnalysisJob);
  safeRender("米国株分析ジョブ", renderUsAnalysisJob);
  safeRender("米国株", renderUs);
  safeRender("BTC・為替", renderCrypto);
}

function noteDetailFormEdit() {
  detailFormEditHoldUntil = Date.now() + DETAIL_FORM_EDIT_HOLD_MS;
}

function clearDetailFormEdit() {
  detailFormEditHoldUntil = 0;
}

function activeDetailForm() {
  return document.activeElement?.closest?.("#positionForm, #usPositionForm, #cryptoPositionForm, .position-form") || null;
}

function isDetailFormEditing() {
  return Boolean(activeDetailForm()) || Date.now() < detailFormEditHoldUntil;
}

function attachDetailFormEditGuard(form) {
  if (!form) return;
  ["pointerdown", "touchstart", "focusin", "input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, noteDetailFormEdit, { passive: true });
  });
}

function safeRender(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`${label}の描画に失敗しました`, error);
  }
}

function setView(view) {
  const nextView = VIEW_KEYS.has(view) ? view : "analysis";
  state.view = nextView;
  rememberView(nextView);
  renderNavigation();
  renderIdeaTabs();
  renderSettingsTabs();
  if (nextView === "analysis") renderSelection();
  if (nextView === "performance") renderPerformance();
  if (nextView === "us") renderUs();
  if (nextView === "crypto") renderCrypto();
  if (nextView === "ideas") {
    renderCandidateList();
    renderSectorEvidence();
    renderDiscoveryJob();
  }
  void safeLoad("画面データ", () => ensureViewData(nextView));
}

function preferredView() {
  try {
    const view = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEW_KEYS.has(view) ? view : "analysis";
  } catch {
    return "analysis";
  }
}

function rememberView(view) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // iPhoneのプライベート設定などで保存できない場合は、その場の表示だけ維持します。
  }
}

function renderIdeaTabs() {
  els.ideaTabButtons.forEach((button) => {
    const active = button.dataset.ideaTab === state.ideaView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  els.ideaPanels.forEach((panel) => {
    panel.hidden = panel.dataset.ideaPanel !== state.ideaView;
  });
}

function renderSettingsTabs() {
  els.settingsTabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTab === state.settingsTab);
  });
  els.settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== state.settingsTab;
  });
}

function renderNavigation() {
  els.viewPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.view === state.view);
  });
  els.viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === state.view);
  });
}

function renderTable() {
  els.stockCount.textContent = String(state.stocks.length);
  els.stockProgress.value = state.stocks.length;
  const holdings = state.stocks.filter((stock) => stock.holding);
  const unheld = state.stocks.filter((stock) => !stock.holding);
  const recentHolding = unheld.filter((stock) => hasRecentHoldingHistory(stock));
  const recentSymbols = new Set(recentHolding.map((stock) => stock.symbol));
  const unheldCandidates = unheld.filter((stock) => !recentSymbols.has(stock.symbol));

  if (els.watchlistHoldingCount) els.watchlistHoldingCount.textContent = `${holdings.length}銘柄`;
  if (els.recentHoldingStockCount) els.recentHoldingStockCount.textContent = `${recentHolding.length}銘柄`;
  if (els.unheldStockCount) els.unheldStockCount.textContent = `${unheldCandidates.length}銘柄`;

  if (els.stockTable) {
    els.stockTable.innerHTML = holdings.length
      ? holdings.map((stock) => stockRow(stock, true)).join("")
      : state.stocksLoaded
        ? '<tr><td colspan="8" class="watchlist-empty">保有中の銘柄はありません。</td></tr>'
        : emptyStockRow(8);
    attachTableEvents(els.stockTable);
  }

  if (els.recentHoldingWatchlist) els.recentHoldingWatchlist.hidden = !recentHolding.length;
  if (els.recentHoldingStockTable) {
    els.recentHoldingStockTable.innerHTML = recentHolding.length
      ? recentHolding.map((stock) => stockRow(stock, true)).join("")
      : "";
    attachTableEvents(els.recentHoldingStockTable);
  }

  if (els.unheldStockTable) {
    els.unheldStockTable.innerHTML = unheldCandidates.length
      ? unheldCandidates.map((stock) => stockRow(stock, true)).join("")
      : state.stocksLoaded
        ? '<tr><td colspan="8" class="watchlist-empty">未保有の銘柄はありません。</td></tr>'
        : emptyStockRow(8);
    attachTableEvents(els.unheldStockTable);
  }

  if (els.unheldWatchlist) {
    els.unheldWatchlist.ontoggle = () => {
      state.jpUnheldExpanded = els.unheldWatchlist.open;
    };
    els.unheldWatchlist.open = state.jpUnheldExpanded;
  }

  if (els.manageStockTable) {
    els.manageStockTable.innerHTML = state.stocks.length
      ? state.stocks.map((stock) => stockRow(stock, false)).join("")
      : emptyStockRow(10);
    attachTableEvents(els.manageStockTable);
  }
}

function hasRecentHoldingHistory(stock, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(today);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const earliest = dateKey(cutoff);
  const latest = dateKey(today);
  const dates = [
    stock.purchaseDate,
    ...(Array.isArray(stock.positions) ? stock.positions.map((lot) => lot.purchaseDate) : []),
    ...(Array.isArray(stock.sales) ? stock.sales.map((lot) => lot.sellDate || lot.saleDate) : []),
  ];
  return dates.some((value) => {
    const date = String(value || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= earliest && date <= latest;
  });
}

function emptyStockRow(colspan) {
  const message = state.stockLoadError
    || (state.stocksLoaded ? "銘柄を追加してください。" : "銘柄を読み込み中です。");
  return `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function stockRow(stock, compact) {
  const analysis = state.analyses[stock.symbol];
  const position = positionMetrics(stock, analysis?.price);
  const action = analysis?.action || "WATCH";
  const confidence = Number.isFinite(analysis?.confidence) ? `${Math.round(analysis.confidence)}%` : "-";
  const selected = state.selected === stock.symbol ? "selected" : "";
  const nameCell = `
    <td>
      <div class="stock-name-row">
        <button type="button" class="drag-handle" draggable="true" data-drag-handle aria-label="${escapeAttr(stock.name)}の順番を移動" title="ドラッグで順番を変更">≡</button>
        <div class="stock-name">
          <strong>${escapeHtml(stock.name)}</strong>
          <span>${symbolLinkHtml(stock.symbol, "jp")}${stock.holding ? " / 保有" : ""}</span>
        </div>
      </div>
    </td>
  `;
  const sectorCell = `<td>${sectorBadge(stock.sector || "その他")}</td>`;

  if (compact) {
    return `
      <tr data-symbol="${stock.symbol}" class="${selected}">
        ${nameCell}
        ${sectorCell}
        <td>${yen(analysis?.price?.current)}</td>
        <td>${averagePriceCell(position, yen)}</td>
        <td>${holdingQuantityCell(stock, position)}</td>
        <td>${positionPnl(position, true)}</td>
        <td>${dividendCell(position, analysis?.price)}</td>
        <td><span class="badge ${actionClasses[action] || "watch"}">${actionLabels[action] || "要確認"}</span></td>
      </tr>
    `;
  }

  return `
    <tr data-symbol="${stock.symbol}" class="${selected}">
      ${nameCell}
      ${sectorCell}
      <td>${yen(analysis?.price?.current)}</td>
      <td>${averagePriceCell(position, yen)}</td>
      <td>${positionPnl(position)}</td>
      <td>${dividendCell(position, analysis?.price)}</td>
      <td>${pct(analysis?.price?.return1y)}</td>
      <td>${pct(analysis?.price?.return3y)}</td>
      <td><span class="badge ${actionClasses[action] || "watch"}">${actionLabels[action] || "要確認"}</span></td>
      <td><button type="button" class="icon" data-remove="${stock.symbol}" aria-label="${stock.name}を削除">×</button></td>
    </tr>
  `;
}

function sectorBadge(sector) {
  return `<span class="sector-badge">${escapeHtml(sector || "その他")}</span>`;
}

function dividendCell(position, price = {}, formatter = yen) {
  const yieldPct = positionDividendYieldPct(position);
  const yieldText = Number.isFinite(yieldPct) ? `${yieldPct.toFixed(1)}%` : "-";
  const incomeText = Number.isFinite(position?.annualDividendEstimate) ? formatter(position.annualDividendEstimate) : "";
  const timingText = dividendTimingSummary(price);
  if (yieldText === "-" && !incomeText && !timingText) return "-";
  return `
    <span class="dividend-cell">
      <strong title="年間配当目安 ÷ 保有中の取得原価">${yieldText}</strong>
      ${incomeText ? `<small>${incomeText}/年</small>` : ""}
      ${timingText ? `<small>${escapeHtml(timingText)}</small>` : ""}
    </span>
  `;
}

function positionDividendYieldPct(position = {}) {
  const annualDividend = position?.annualDividendEstimate;
  const acquisitionCost = position?.invested;
  if (!Number.isFinite(annualDividend) || annualDividend < 0 || !Number.isFinite(acquisitionCost) || acquisitionCost <= 0) return null;
  return (annualDividend / acquisitionCost) * 100;
}

function positionDividendYieldText(position = {}) {
  const yieldPct = positionDividendYieldPct(position);
  return Number.isFinite(yieldPct) ? `${yieldPct.toFixed(1)}%` : "-";
}

function dividendPerShareText(price = {}, position = {}, formatter = yen) {
  const direct = annualDividendPerShare(price);
  const derived = Number.isFinite(position?.annualDividendEstimate) && Number.isFinite(position?.quantity) && position.quantity > 0
    ? position.annualDividendEstimate / position.quantity
    : null;
  const amount = Number.isFinite(direct) ? direct : derived;
  const source = price?.dividendAnnualSource ? ` ${price.dividendAnnualSource}` : "";
  return Number.isFinite(amount) ? `${formatter(amount)}/株${escapeHtml(source)}` : "-";
}

function annualDividendPerShare(price = {}) {
  const amount = finiteOrNull(
    price?.dividendPerShareAnnual
    ?? price?.dividendPerShareForward
    ?? price?.dividendPerShareTtm,
  );
  return amount && amount > 0 ? amount : null;
}

function annualDividendText(position = {}, formatter = yen) {
  return Number.isFinite(position?.annualDividendEstimate) ? `${formatter(position.annualDividendEstimate)}/年` : "-";
}

function averagePriceCell(position = {}, formatter = yen) {
  const showSell = Number.isFinite(position.averageSellPrice);
  return `
    <span class="avg-price-cell">
      <span><em>取得</em><strong>${formatter(position.purchasePrice)}</strong></span>
      ${showSell ? `<span><em>売却</em><strong>${formatter(position.averageSellPrice)}</strong></span>` : ""}
    </span>
  `;
}

function holdingQuantityCell(stock, position = {}) {
  if (!stock?.holding) return "-";
  return Number.isFinite(position?.quantity) ? shareCount(position.quantity) : "保有";
}

function attachTableEvents(table) {
  attachReorderEvents(table);
  table.querySelectorAll("tr[data-symbol]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-remove], [data-drag-handle], [data-symbol-link]")) return;
      if (reorderState.moved) return;
      state.selected = row.dataset.symbol;
      state.view = "analysis";
      render();
    });
  });

  table.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const symbol = button.dataset.remove;
      try {
        await request(`/api/stocks/${encodeURIComponent(symbol)}`, { method: "DELETE" });
        delete state.analyses[symbol];
        if (state.selected === symbol) state.selected = null;
        await loadStocks();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function attachReorderEvents(table, options = {}) {
  const rowSelector = options.rowSelector || "tr[data-symbol]";
  const handleSelector = options.handleSelector || "[data-drag-handle]";
  const symbolFromRow = options.symbolFromRow || ((row) => row.dataset.symbol);
  const move = options.move || moveStock;
  const save = options.save || saveStockOrder;
  const reload = options.reload || loadStocks;
  table.querySelectorAll(handleSelector).forEach((handle) => {
    handle.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    handle.addEventListener("dragstart", (event) => {
      const row = event.target.closest(rowSelector);
      if (!row) return;
      reorderState.symbol = symbolFromRow(row);
      reorderState.moved = false;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", reorderState.symbol);
      row.classList.add("dragging");
    });
  });

  table.querySelectorAll(rowSelector).forEach((row) => {
    row.addEventListener("dragover", (event) => {
      const targetSymbol = symbolFromRow(row);
      if (!reorderState.symbol || reorderState.symbol === targetSymbol) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", async (event) => {
      const targetSymbol = symbolFromRow(row);
      if (!reorderState.symbol || reorderState.symbol === targetSymbol) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      const moved = move(reorderState.symbol, targetSymbol, insertAfter);
      reorderState.moved = moved;
      clearDragClasses();
      if (!moved) return;
      render();
      try {
        await save();
        render();
      } catch (error) {
        toast(error.message);
        await reload();
      } finally {
        reorderState.symbol = "";
        setTimeout(() => { reorderState.moved = false; }, 100);
      }
    });
    row.addEventListener("dragend", () => {
      clearDragClasses();
      reorderState.symbol = "";
      setTimeout(() => { reorderState.moved = false; }, 100);
    });
  });
}

function moveStock(sourceSymbol, targetSymbol, insertAfter = false) {
  return moveStockInList(state.stocks, sourceSymbol, targetSymbol, insertAfter);
}

function moveUsStock(sourceSymbol, targetSymbol, insertAfter = false) {
  return moveStockInList(state.usStocks, sourceSymbol, targetSymbol, insertAfter);
}

function moveStockInList(list, sourceSymbol, targetSymbol, insertAfter = false) {
  const from = list.findIndex((stock) => stock.symbol === sourceSymbol);
  const to = list.findIndex((stock) => stock.symbol === targetSymbol);
  if (from < 0 || to < 0 || from === to) return false;
  const [item] = list.splice(from, 1);
  let nextIndex = list.findIndex((stock) => stock.symbol === targetSymbol);
  if (nextIndex < 0) return false;
  if (insertAfter) nextIndex += 1;
  list.splice(nextIndex, 0, item);
  return true;
}

async function saveStockOrder() {
  const result = await request("/api/stocks/reorder", {
    method: "POST",
    body: JSON.stringify({ symbols: state.stocks.map((stock) => stock.symbol) }),
  });
  state.stocks = result.stocks || state.stocks;
  toast("表示順を保存しました。");
}

async function saveUsStockOrder() {
  const result = await request("/api/us-stocks/reorder", {
    method: "POST",
    body: JSON.stringify({ symbols: state.usStocks.map((stock) => stock.symbol) }),
  });
  state.usStocks = result.stocks || state.usStocks;
  if (!state.usStocks.some((stock) => stock.symbol === state.usSelected)) {
    state.usSelected = state.usStocks[0]?.symbol || null;
  }
  toast("米国株の表示順を保存しました。");
}

function clearDragClasses() {
  document.querySelectorAll(".dragging, .drag-over").forEach((node) => {
    node.classList.remove("dragging", "drag-over");
  });
}

function renderProfitSummary() {
  const summary = portfolioSummary();
  setRefreshingSummary(els.profitSummary, state.jpRefreshing, "更新中。表示中の数字は前回保存値");
  setMoneySummary(els.profitAmount, summary.pnlAmount, "profit-big");
  if (els.profitPct) {
    els.profitPct.innerHTML = Number.isFinite(summary.pnlPct)
      ? `${pct(summary.pnlPct)} / ${summary.count}銘柄`
      : "購入情報と分析が必要";
  }
  setMoneySummary(els.totalReturnAmount, summary.totalReturnAmount, "profit-big");
  if (els.realizedPnlTotal) setMoneySummary(els.realizedPnlTotal, summary.realizedPnlAmount, "profit-big");
  if (els.totalReturnPct) {
    els.totalReturnPct.innerHTML = Number.isFinite(summary.totalReturnPct)
      ? `${pct(summary.totalReturnPct)} / 配当込み`
      : "購入日・株数・配当データが必要";
  }
  if (els.dividendReceivedTotal) els.dividendReceivedTotal.textContent = yen(summary.dividendReceived);
  if (els.dividendReceivedTiming) {
    els.dividendReceivedTiming.textContent = nextDividendPaymentLabel(state.stocks, state.analyses);
  }
  if (els.investedTotal) els.investedTotal.textContent = yen(summary.invested);
  if (els.marketTotal) els.marketTotal.textContent = yen(summary.marketValue);
  if (els.dividendIncomeTotal) els.dividendIncomeTotal.textContent = yen(summary.annualDividendEstimate);
  if (els.nisaRemainingTotal) els.nisaRemainingTotal.textContent = yen(summary.nisaRemaining);
  if (els.nisaAllowanceUsage) {
    const restoringText = summary.nisaRestoringNextYear > 0
      ? `・来年復活 ${yen(summary.nisaRestoringNextYear)}`
      : "";
    els.nisaAllowanceUsage.textContent = `${summary.nisaYear}年 ${yen(summary.nisaUsed)} / ${yen(summary.nisaLimit)}・生涯 ${yen(summary.nisaLifetimeUsed)} / ${yen(summary.nisaLifetimeLimit)}${restoringText}`;
  }
  if (els.profitableCount) els.profitableCount.textContent = String(summary.winCount);
  if (els.lossCount) els.lossCount.textContent = String(summary.lossCount);
}

function renderUs() {
  renderUsSummary();
  renderUsTable();
  renderUsDetail();
}

function renderUsSummary() {
  const summary = usSummaryFromState();
  setRefreshingSummary(els.usProfitSummary, state.usRefreshing, "更新中。表示中の数字は前回保存値");
  const totalAmount = Number.isFinite(summary.totalReturnAmount) ? summary.totalReturnAmount : summary.pnlAmount;
  const totalPct = Number.isFinite(summary.totalReturnPct) ? summary.totalReturnPct : summary.pnlPct;
  setMoneySummary(els.usProfitAmount, totalAmount, "profit-big", usd);
  if (els.usProfitPct) {
    els.usProfitPct.innerHTML = Number.isFinite(totalPct)
      ? `<span class="${totalPct >= 0 ? "metric-pos" : "metric-neg"}">${signedPct(totalPct)}</span> / 配当込み`
      : "更新待ち";
  }
  if (els.usRealizedPnlTotal) setMoneySummary(els.usRealizedPnlTotal, summary.realizedPnlAmount, "profit-big", usd);
  if (els.usDividendIncomeTotal) els.usDividendIncomeTotal.textContent = usd(summary.annualDividendEstimate);
  if (els.usDividendReceivedTotal) els.usDividendReceivedTotal.textContent = usd(summary.dividendReceived);
  if (els.usDividendReceivedTiming) {
    els.usDividendReceivedTiming.textContent = nextDividendPaymentLabel(state.usStocks, state.usAnalyses);
  }
  setMoneySummary(els.usInvestedTotal, summary.invested, "profit-big", usd);
  setMoneySummary(els.usMarketTotal, summary.marketValue, "profit-big", usd);
  if (els.usWinCount) els.usWinCount.textContent = String(summary.winCount || 0);
  if (els.usLossCount) els.usLossCount.textContent = String(summary.lossCount || 0);
}

function renderPerformance() {
  if (!els.performanceChart) return;
  const isUs = state.performanceMarket === "us";
  const stocks = isUs ? state.usStocks : state.stocks;
  const analyses = isUs ? state.usAnalyses : state.analyses;
  const currency = isUs ? "USD" : "JPY";
  const timeline = portfolioPerformanceTimeline(stocks, analyses);
  els.performanceTabs.forEach((button) => {
    const active = button.dataset.performanceMarket === state.performanceMarket;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (els.performanceChartPanel) {
    els.performanceChartPanel.setAttribute("aria-labelledby", isUs ? "performanceUsTab" : "performanceJpTab");
  }
  if (els.performanceChartTitle) els.performanceChartTitle.textContent = `${isUs ? "米国株" : "日本株"} 配当込み損益`;
  if (els.performanceChart) {
    els.performanceChart.setAttribute("aria-label", `過去1年から今後1年の${isUs ? "米国株" : "日本株"}配当込み損益グラフ`);
  }
  if (els.performanceCurrent) els.performanceCurrent.textContent = moneyByCurrency(timeline.currentTotal, currency);
  if (els.performanceCurrentNote) els.performanceCurrentNote.textContent = `${timeline.stockCount}銘柄・売却済み損益と受取配当を含む`;
  if (els.performanceForecast) els.performanceForecast.textContent = moneyByCurrency(timeline.forecastTotal, currency);
  if (els.performanceForecastNote) {
    if (Number.isFinite(timeline.forecastLow) && Number.isFinite(timeline.forecastHigh)) {
      const range = `${moneyByCurrency(timeline.forecastLow, currency)}〜${moneyByCurrency(timeline.forecastHigh, currency)}`;
      const volatility = Number.isFinite(timeline.annualizedVolatilityPct)
        ? ` / 年率変動率 ${timeline.annualizedVolatilityPct.toFixed(1)}%`
        : "";
      const excluded = timeline.rateUnavailableCount ? ` / 履歴不足 ${timeline.rateUnavailableCount}銘柄は価格変動対象外` : "";
      els.performanceForecastNote.textContent = `10〜90%参考幅 ${range}${volatility}${excluded}`;
    } else {
      els.performanceForecastNote.textContent = timeline.stockCount
        ? `価格履歴不足のため変動幅を試算できません${timeline.rateUnavailableCount ? `（対象外 ${timeline.rateUnavailableCount}銘柄）` : ""}`
        : "保有データがありません";
    }
  }
  if (els.performanceDividend) els.performanceDividend.textContent = moneyByCurrency(timeline.annualDividend, currency);
  if (els.performanceUpdatedAt) {
    els.performanceUpdatedAt.textContent = timeline.stockCount ? "保存済み価格・配当データ" : "損益データなし";
  }
  if (els.performanceEmpty) {
    els.performanceEmpty.hidden = timeline.stockCount > 0;
    els.performanceEmpty.textContent = isUs
      ? "米国株の購入・売却データがありません。保有を入力すると推移を表示します。"
      : "日本株の購入・売却データがありません。保有を入力すると推移を表示します。";
  }
  drawDatedLineChart(els.performanceChart, timeline.actual, timeline.forecast, {
    currency,
    startDate: timeline.startDate,
    today: timeline.today,
    endDate: timeline.endDate,
    includeZero: true,
  });
}

function renderUsTable() {
  if (!els.usStockTable) return;
  if (!state.usStocks.length) {
    els.usStockTable.innerHTML = "<tr><td colspan=\"10\">米国株はまだありません。</td></tr>";
    return;
  }
  els.usStockTable.innerHTML = state.usStocks.map((stock) => {
    const analysis = state.usAnalyses[stock.symbol];
    const position = positionMetrics(stock, analysis?.price);
    const fundamentals = analysis?.fundamentals || {};
    const selected = state.usSelected === stock.symbol ? "selected" : "";
    const openHolding = hasOpenPosition(stock, position);
    return `
      <tr class="${selected}" data-us-symbol="${escapeAttr(stock.symbol)}">
        <td>
          <div class="stock-name-row">
            <button type="button" class="drag-handle" draggable="true" data-us-drag-handle aria-label="${escapeAttr(stock.name)}の順番を移動" title="ドラッグで順番を変更">≡</button>
            <span class="stock-name">
              <strong>${escapeHtml(stock.name)}</strong>
              <span>${symbolLinkHtml(stock.symbol, "us")} / ${escapeHtml(stock.market || "NYSE")}${openHolding ? " / 保有" : ""}</span>
            </span>
          </div>
        </td>
        <td>${usd(analysis?.price?.current)}</td>
        <td>${multipleText(fundamentals.trailingPe)}</td>
        <td>${pct(fundamentals.revenueGrowthPct)}</td>
        <td>${averagePriceCell(position, usd)}</td>
        <td>${shareCount(position.quantity)}</td>
        <td>${positionPnlUsd(position)}</td>
        <td>${dividendCell(position, analysis?.price, usd)}</td>
        <td>${usStanceBadge(analysis?.ai, stock, position)}</td>
        <td><button type="button" class="icon" data-remove-us="${escapeAttr(stock.symbol)}" aria-label="${escapeAttr(stock.name)}を削除">×</button></td>
      </tr>
    `;
  }).join("");
  attachReorderEvents(els.usStockTable, {
    rowSelector: "tr[data-us-symbol]",
    handleSelector: "[data-us-drag-handle]",
    symbolFromRow: (row) => row.dataset.usSymbol,
    move: moveUsStock,
    save: saveUsStockOrder,
    reload: loadUsStocks,
  });
  els.usStockTable.querySelectorAll("[data-us-symbol]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, [data-symbol-link]")) return;
      state.usSelected = row.dataset.usSymbol;
      renderUs();
    });
  });
  els.usStockTable.querySelectorAll("[data-remove-us]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const payload = await request(`/api/us-stocks/${encodeURIComponent(button.dataset.removeUs)}`, { method: "DELETE" });
        state.usStocks = payload.stocks || [];
        state.usSummary = null;
        if (!state.usStocks.some((stock) => stock.symbol === state.usSelected)) {
          state.usSelected = state.usStocks[0]?.symbol || null;
        }
        toast("米国株から削除しました。");
        renderUs();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderUsDetail() {
  if (!els.usDetail) return;
  const stock = state.usStocks.find((item) => item.symbol === state.usSelected);
  if (!stock) {
    if (els.usSelectedSymbol) els.usSelectedSymbol.textContent = "未選択";
    els.usDetail.innerHTML = "<p>米国株を追加すると、ここに保有入力と損益が出ます。</p>";
    return;
  }
  const analysis = state.usAnalyses[stock.symbol];
  const position = positionMetrics(stock, analysis?.price);
  const fundamentals = analysis?.fundamentals || {};
  const ai = analysis?.ai || null;
  if (els.usSelectedSymbol) els.usSelectedSymbol.innerHTML = symbolLinkHtml(stock.symbol, "us");
  const good = (ai?.good || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const risks = (ai?.risks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const evidence = (analysis?.evidence || []).map((item) => `
    <article class="evidence-item">
      <div>
        <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(usEvidenceTitleText(item))}</a>
        <p>${escapeHtml(evidenceMetaText(item))}</p>
      </div>
      <p>${escapeHtml(usEvidenceSummaryText(item))}</p>
      ${item.articleText ? `<details class="evidence-fulltext"><summary>取得本文（最大1,800字）</summary><p>${escapeHtml(item.articleText)}</p></details>` : ""}
      <span>${escapeHtml(usEvidenceTranslationLabel(item))}</span>
    </article>
  `).join("");
  const businessProfileSources = (analysis?.evidence || [])
    .filter((item) => item.kind === "business_profile" && item.url)
    .slice(0, 3);
  els.usDetail.innerHTML = `
    ${usPositionEditor(stock, position, analysis?.price)}
    ${usFinancialCard(fundamentals)}
    <section class="decision-card">
      <div>
        <h4>3年チャート</h4>
        <span>${escapeHtml(stock.symbol)}</span>
      </div>
      <div class="chart-frame embedded-chart">
        <canvas data-us-price-chart aria-label="${escapeAttr(stock.name)}の3年チャート"></canvas>
        <div class="chart-tooltip" data-us-chart-tooltip hidden></div>
      </div>
      <div class="chart-timing" data-us-chart-timing hidden></div>
    </section>
    <section class="decision-card">
      <div>
        <h4>AI確認</h4>
        ${usStanceBadge(ai)}
      </div>
      <section class="business-overview"><strong>事業概要</strong><p>${escapeHtml(ai?.businessOverviewJa || "年次報告書・公式IRから事業内容を確認できる資料が不足しています。")}</p><div>${businessProfileSources.map((item) => `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source || item.title || "会社資料")}</a>`).join("")}</div></section>
      <p>${escapeHtml(ai?.summaryJa || "米国株を更新すると、英語記事を日本語要約して保有確認を表示します。")}</p>
      ${marketJudgmentHtml(ai?.marketViewJa, ai?.marketImpact, ai?.marketConfidence, analysis?.researchStats?.marketPerspectives || 0)}
      <div class="metrics-row">
        <span><strong>現在値</strong>${usd(analysis?.price?.current)}</span>
        <span><strong>損益</strong>${positionPnlUsd(position)}</span>
        <span><strong>受取配当</strong>${usd(position.dividendReceived)}</span>
        <span><strong>取得額配当利回り</strong>${positionDividendYieldText(position)}</span>
        <span><strong>1株配当</strong>${dividendPerShareText(analysis?.price || {}, position, usd)}</span>
        <span><strong>年間配当目安</strong>${annualDividendText(position, usd)}</span>
        <span><strong>配当時期</strong>${escapeHtml(dividendTimingDetail(analysis?.price || {}, usd))}</span>
        <span><strong>直近45日のニュース・見解</strong>${Number(analysis?.researchStats?.marketPerspectives || 0)}件</span>
        <span><strong>1か月</strong>${pct(analysis?.price?.return1m)}</span>
        <span><strong>1年</strong>${pct(analysis?.price?.return1y)}</span>
      </div>
      ${exitPlanHtml(analysis?.exitPlan)}
      ${technicalEntryHtml(analysis?.price || {}, usd)}
      ${shareholderInfoHtml(analysis?.shareholders)}
      <div class="reason-columns">
        <section>
          <h4>良い材料</h4>
          <ul class="reason-list">${good || "<li>更新後に表示します</li>"}</ul>
        </section>
        <section>
          <h4>注意点</h4>
          <ul class="risk-list">${risks || "<li>更新後に表示します</li>"}</ul>
        </section>
      </div>
      ${stockForecastChartHtml(stock.symbol, "us")}
    </section>
    <section class="evidence-list us-evidence-list">
      ${evidence || "<article class=\"evidence-item\"><p>英語記事の日本語要約は、更新後に表示します。</p></article>"}
    </section>
  `;
  attachUsPositionForm(stock.symbol);
  renderEmbeddedPriceChart(els.usDetail, analysis?.price?.series || [], usd, chartTradeMarkers(stock), analysis?.price || {});
  renderStockForecastCharts(els.usDetail);
}

function renderCrypto() {
  renderCryptoSummary();
  renderCryptoTabs();
  renderCryptoDetail();
}

function renderCryptoSummary() {
  const analysis = state.cryptoAnalysis || {};
  const position = analysis.position || cryptoPositionFallback(state.cryptoHolding || {});
  setRefreshingSummary(els.cryptoProfitSummary, state.cryptoRefreshing, "更新中。表示中の数字は前回保存値");
  setRefreshingSummary(els.fxProfitSummary, state.cryptoRefreshing, "更新中。表示中の数字は前回保存値");
  if (els.btcJpyPrice) els.btcJpyPrice.textContent = yen(analysis.btcJpy?.current);
  if (els.usdJpyRate) els.usdJpyRate.textContent = fxRate(analysis.usdJpy?.current);
  if (els.usdJpyChange) els.usdJpyChange.textContent = `1カ月 ${signedPct(analysis.usdJpy?.return1m)}`;
  if (els.eurJpyRate) els.eurJpyRate.textContent = fxRate(analysis.eurJpy?.current);
  if (els.eurJpyChange) els.eurJpyChange.textContent = `1カ月 ${signedPct(analysis.eurJpy?.return1m)}`;
  if (els.cryptoQuantity) els.cryptoQuantity.textContent = btcAmount(position.quantity);
  setMoneySummary(els.cryptoPnlJpy, position.pnlAmountJpy, "profit-big", yen);
  if (els.cryptoPnlJpyPct) {
    els.cryptoPnlJpyPct.innerHTML = Number.isFinite(position.pnlPctJpy)
      ? `${pct(position.pnlPctJpy)}${position.jpyEstimated ? " / 円換算概算" : ""}`
      : "購入・売却入力後に計算";
  }
}

function renderCryptoTabs() {
  els.cryptoTabButtons.forEach((button) => {
    const selected = button.dataset.cryptoTab === state.cryptoView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  els.cryptoPanels.forEach((panel) => {
    panel.hidden = panel.dataset.cryptoPanel !== state.cryptoView;
  });
}

function renderCryptoDetail() {
  if (state.cryptoView === "fx") {
    renderFxDetail();
    return;
  }
  if (!els.cryptoDetail) return;
  const holding = state.cryptoHolding || { holding: false, positions: [], sales: [] };
  const analysis = state.cryptoAnalysis || null;
  const position = analysis?.position || cryptoPositionFallback(holding);
  const generated = analysis?.generatedAt
    ? `更新 ${new Date(analysis.generatedAt).toLocaleString("ja-JP")}`
    : "未更新";
  if (els.cryptoLastRun) els.cryptoLastRun.textContent = generated;
  els.cryptoDetail.innerHTML = `
    <section class="decision-card crypto-chart-jpy">
        <div>
          <h4>3年チャート JPY</h4>
          <span>BTC/JPY（BTC/USDを円換算）</span>
        </div>
        <div class="chart-frame embedded-chart">
          <canvas data-us-price-chart aria-label="Bitcoin円換算価格の3年チャート"></canvas>
          <div class="chart-tooltip" data-us-chart-tooltip hidden></div>
        </div>
    </section>
    ${cryptoTimingHtml(analysis)}
    <details class="crypto-technicals-disclosure">
      <summary>テクニカル詳細を表示</summary>
      ${technicalEntryHtml(analysis?.btcJpy || {}, yen)}
    </details>
    <details class="crypto-position-disclosure">
      <summary>BTCの保有・売却履歴を編集</summary>
      ${cryptoPositionEditor(holding, position, analysis)}
    </details>
  `;
  attachCryptoPositionForm();
  renderEmbeddedPriceChart(els.cryptoDetail.querySelector(".crypto-chart-jpy"), analysis?.btcJpy?.series || [], yen);
}

function renderFxDetail() {
  if (!els.fxDetail) return;
  const analysis = state.cryptoAnalysis || null;
  const usdTiming = analysis?.fxTiming?.usdJpy || analysis?.fxTiming || null;
  const eurTiming = analysis?.fxTiming?.eurJpy || null;
  els.fxDetail.innerHTML = `
    <section class="fx-pairs-grid">
      ${fxPairHtml("USD/JPY", "米ドル", analysis?.usdJpy, usdTiming, "usd-jpy")}
      ${fxPairHtml("EUR/JPY", "ユーロ", analysis?.eurJpy, eurTiming, "eur-jpy")}
    </section>
  `;
  renderEmbeddedPriceChart(els.fxDetail.querySelector(".fx-chart-usd-jpy"), analysis?.usdJpy?.series || [], yen);
  renderEmbeddedPriceChart(els.fxDetail.querySelector(".fx-chart-eur-jpy"), analysis?.eurJpy?.series || [], yen);
}

function fxPairHtml(pair, currencyName, price, timing, chartClass) {
  return `
    <section class="fx-pair-section">
      <article class="decision-card fx-chart-${chartClass}">
        <div class="fx-pair-heading">
          <h4>${pair}</h4>
          <strong>${fxRate(price?.current)}</strong>
        </div>
        <div class="chart-frame embedded-chart">
          <canvas data-us-price-chart aria-label="${pair}の3年チャート"></canvas>
          <div class="chart-tooltip" data-us-chart-tooltip hidden></div>
        </div>
      </article>
      ${fxTimingHtml(currencyName, timing)}
    </section>
  `;
}

function cryptoTimingHtml(analysis) {
  const timing = analysis?.timing?.jpy;
  if (!timing) {
    return `
      <section class="crypto-timing-cards">
        <article class="decision-card">
          <div><h4>買うタイミング</h4><span>更新待ち</span></div>
          <p>BTCを更新すると、過去3年と直近1年から買うタイミングを出します。</p>
        </article>
        <article class="decision-card">
          <div><h4>売るタイミング</h4><span>更新待ち</span></div>
          <p>BTCを更新すると、利益確定・見直しの目安を出します。</p>
        </article>
      </section>
    `;
  }
  return `
    <section class="crypto-timing-cards">
      ${cryptoTimingCard("買うタイミング", timing.buy, "buy")}
      ${cryptoTimingCard("売るタイミング", timing.sell, "sell")}
    </section>
  `;
}

function cryptoTimingCard(title, plan = {}, kind = "buy") {
  const checks = [...new Set(plan.checks || [])]
    .filter(Boolean)
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join("");
  const lineLabel = kind === "buy" ? "目安" : "売り場";
  const subLine = kind === "buy"
    ? `<span><strong>深い押し目</strong>${yen(plan.deepLine)}</span>`
    : `<span><strong>確認ライン</strong>${yen(plan.stopLine)}</span>`;
  return `
    <article class="decision-card crypto-timing-card ${kind}">
      <div>
        <h4>${escapeHtml(title)}</h4>
        <span class="entry-grade ${kind === "buy" ? "good" : "watch"}">${escapeHtml(plan.label || "確認")}</span>
      </div>
      <p>${escapeHtml(plan.summary || "")}</p>
      <div class="timing-grid">
        <span><strong>${lineLabel}（円）</strong>${yen(plan.line)}</span>
        ${subLine}
        <span><strong>今との差</strong>${Number.isFinite(plan.currentGapPct) ? signedPct(plan.currentGapPct) : "-"}</span>
      </div>
      <div class="buy-plan-checks">${checks}</div>
    </article>
  `;
}

function fxTimingHtml(currencyName, timing) {
  if (!timing) {
    return `<p class="fx-timing-empty">${currencyName}の為替データは取得できませんでした。</p>`;
  }
  return `
    <section class="crypto-timing-cards fx-timing-cards">
      ${fxTimingCard(`${currencyName}を買う目安`, timing.buy, "buy", currencyName)}
      ${fxTimingCard("円に戻す目安", timing.sell, "sell", currencyName)}
    </section>
  `;
}

function fxTimingCard(title, plan = {}, kind = "buy", currencyName = "米ドル") {
  const checks = (plan.checks || [])
    .filter(Boolean)
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join("");
  const lineLabel = kind === "buy" ? `${currencyName}買い目安` : `${currencyName}売り目安`;
  const secondLabel = kind === "buy" ? "深い円高" : "確認ライン";
  const secondValue = kind === "buy" ? plan.deepLine : plan.stopLine;
  return `
    <article class="decision-card crypto-timing-card fx ${kind}">
      <div>
        <h4>${escapeHtml(title)}</h4>
        <span class="entry-grade ${kind === "buy" ? "good" : "watch"}">${escapeHtml(plan.label || "確認")}</span>
      </div>
      <p>${escapeHtml(plan.summary || "")}</p>
      <div class="timing-grid">
        <span><strong>${lineLabel}</strong>${fxRate(plan.line)}</span>
        <span><strong>${secondLabel}</strong>${fxRate(secondValue)}</span>
        <span><strong>今との差</strong>${Number.isFinite(plan.currentGapPct) ? signedPct(plan.currentGapPct) : "-"}</span>
      </div>
      <div class="buy-plan-checks">${checks}</div>
    </article>
  `;
}

function cryptoPositionEditor(holding, position = {}, analysis = null) {
  const lots = position.positions?.length ? position.positions : cryptoPositionLots(holding);
  const displayLots = lots.length ? lots : [{ purchaseDate: "", purchasePriceUsd: null, purchasePriceJpy: null, quantity: null }];
  const sales = position.sales?.length ? position.sales : cryptoSaleLots(holding);
  const displaySales = sales.length ? sales : [{ sellDate: "", sellPriceUsd: null, sellPriceJpy: null, quantity: null }];
  const estimateNote = position.jpyEstimated || position.usdEstimated
    ? `<p class="crypto-position-note">未入力の通貨は、直近のUSD/JPY ${fxRate(analysis?.usdJpy?.current)} で概算しています。</p>`
    : "";
  return `
    <form id="cryptoPositionForm" class="position-form crypto-position-form">
      <div class="position-form-title">
        <strong>BTC 保有・売却情報</strong>
        <label class="checkbox-line">
          <input name="holding" type="checkbox" ${holding.holding ? "checked" : ""}>
          <span>保有中</span>
        </label>
      </div>
      <div class="position-lots" aria-label="BTC購入明細">
        <div class="lot-section-title buy">購入明細</div>
        <div class="crypto-lot-head">
          <span>購入日</span>
          <span>購入単価 USD</span>
          <span>購入単価 JPY</span>
          <span>数量 BTC</span>
          <span></span>
        </div>
        <div class="crypto-lot-list">
          ${displayLots.map((lot) => cryptoLotRow(lot)).join("")}
        </div>
        <button type="button" class="secondary add-lot" data-add-crypto-lot>明細を追加</button>
      </div>
      <div class="position-lots sale-lots" aria-label="BTC売却明細">
        <div class="lot-section-title">売却明細</div>
        <div class="crypto-lot-head">
          <span>売却日</span>
          <span>売却単価 USD</span>
          <span>売却単価 JPY</span>
          <span>数量 BTC</span>
          <span></span>
        </div>
        <div class="crypto-sale-list">
          ${displaySales.map((lot) => cryptoSaleRow(lot)).join("")}
        </div>
        <button type="button" class="secondary add-lot" data-add-crypto-sale>売却明細を追加</button>
      </div>
      <div class="position-stats">
        <span><strong>平均取得 USD</strong>${usd(position.purchasePriceUsd)}</span>
        <span><strong>平均取得 JPY</strong>${yen(position.purchasePriceJpy)}</span>
        <span><strong>残BTC</strong>${btcAmount(position.quantity)}</span>
        <span><strong>売却済み</strong>${btcAmount(position.soldQuantity)}</span>
        <span><strong>ドル損益</strong>${cryptoPnl(position.pnlAmountUsd, position.pnlPctUsd, usd)}</span>
        <span><strong>円損益</strong>${cryptoPnl(position.pnlAmountJpy, position.pnlPctJpy, yen)}</span>
        <span><strong>評価額 USD</strong>${usd(position.marketValueUsd)}</span>
        <span><strong>評価額 JPY</strong>${yen(position.marketValueJpy)}</span>
        <span><strong>確定 USD</strong>${usd(position.realizedPnlUsd)}</span>
        <span><strong>確定 JPY</strong>${yen(position.realizedPnlJpy)}</span>
      </div>
      ${estimateNote}
      <button type="submit">保存して更新</button>
    </form>
  `;
}

function cryptoLotRow(lot = {}) {
  return `
    <div class="crypto-lot-row">
      <label>
        <span>購入日</span>
        <input name="purchaseDate" type="date" value="${escapeAttr(lot.purchaseDate || "")}">
      </label>
      <label>
        <span>購入単価 USD</span>
        <input name="purchasePriceUsd" type="number" min="0" step="0.01" value="${numberValue(lot.purchasePriceUsd)}">
      </label>
      <label>
        <span>購入単価 JPY</span>
        <input name="purchasePriceJpy" type="number" min="0" step="1" value="${numberValue(lot.purchasePriceJpy)}">
      </label>
      <label>
        <span>数量 BTC</span>
        <input name="quantity" type="number" min="0" step="0.00000001" value="${numberValue(lot.quantity)}">
      </label>
      <button type="button" class="icon lot-remove" data-remove-crypto-lot aria-label="BTC購入明細を削除">×</button>
    </div>
  `;
}

function cryptoSaleRow(lot = {}) {
  return `
    <div class="crypto-lot-row crypto-sale-row">
      <label>
        <span>売却日</span>
        <input name="sellDate" type="date" value="${escapeAttr(lot.sellDate || "")}">
      </label>
      <label>
        <span>売却単価 USD</span>
        <input name="sellPriceUsd" type="number" min="0" step="0.01" value="${numberValue(lot.sellPriceUsd)}">
      </label>
      <label>
        <span>売却単価 JPY</span>
        <input name="sellPriceJpy" type="number" min="0" step="1" value="${numberValue(lot.sellPriceJpy)}">
      </label>
      <label>
        <span>数量 BTC</span>
        <input name="sellQuantity" type="number" min="0" step="0.00000001" value="${numberValue(lot.quantity)}">
      </label>
      <button type="button" class="icon lot-remove" data-remove-crypto-sale aria-label="BTC売却明細を削除">×</button>
    </div>
  `;
}

function attachCryptoPositionForm() {
  const form = document.getElementById("cryptoPositionForm");
  if (!form) return;
  attachDetailFormEditGuard(form);
  form.querySelector("[data-add-crypto-lot]")?.addEventListener("click", () => {
    form.querySelector(".crypto-lot-list")?.insertAdjacentHTML("beforeend", cryptoLotRow());
  });
  form.querySelector("[data-add-crypto-sale]")?.addEventListener("click", () => {
    form.querySelector(".crypto-sale-list")?.insertAdjacentHTML("beforeend", cryptoSaleRow());
  });
  form.addEventListener("click", (event) => {
    const saleButton = event.target.closest("[data-remove-crypto-sale]");
    if (saleButton) {
      clearOrRemoveCryptoRow(form, saleButton, ".crypto-sale-row", ["sellDate", "sellPriceUsd", "sellPriceJpy", "sellQuantity"]);
      return;
    }
    const lotButton = event.target.closest("[data-remove-crypto-lot]");
    if (!lotButton) return;
    clearOrRemoveCryptoRow(form, lotButton, ".crypto-lot-list .crypto-lot-row", ["purchaseDate", "purchasePriceUsd", "purchasePriceJpy", "quantity"]);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const originalText = submit?.textContent || "保存";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "保存・更新中";
    }
    try {
      const payload = {
        holding: form.elements.holding.checked,
        positions: readCryptoLotRows(form),
        sales: readCryptoSaleRows(form),
      };
      const saved = await request("/api/crypto", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      applyCryptoPayload(saved);
      toast("BTCの保有情報を保存しました。");
      clearDetailFormEdit();
      await analyzeCrypto({ source: "save" });
    } catch (error) {
      toast(error.message);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalText;
      }
    }
  });
}

function clearOrRemoveCryptoRow(form, button, selector, fieldNames = []) {
  const rows = [...form.querySelectorAll(selector)];
  if (rows.length <= 1) {
    fieldNames.forEach((name) => {
      const input = rows[0]?.querySelector(`[name="${name}"]`);
      if (input) input.value = "";
    });
    return;
  }
  button.closest(".crypto-lot-row")?.remove();
}

function usFinancialCard(fundamentals = {}) {
  const fields = [
    ["時価総額", compactUsd(fundamentals.marketCap)],
    ["売上", compactUsd(fundamentals.revenue)],
    ["純利益", compactUsd(fundamentals.netIncome)],
    ["営業利益", compactUsd(fundamentals.operatingIncome)],
    ["売上成長", signedPct(fundamentals.revenueGrowthPct)],
    ["純利益率", plainPct(fundamentals.profitMarginPct)],
    ["営業利益率", plainPct(fundamentals.operatingMarginPct)],
    ["ROE", plainPct(fundamentals.returnOnEquityPct)],
    ["PER", multipleText(fundamentals.trailingPe)],
    ["予想PER", multipleText(fundamentals.forwardPe)],
    ["EPS", usd(fundamentals.trailingEps)],
    ["予想EPS", usd(fundamentals.forwardEps)],
    ["PBR", multipleText(fundamentals.priceToBook)],
    ["PEG", numberText(fundamentals.pegRatio)],
    ["現金", compactUsd(fundamentals.totalCash)],
    ["総負債", compactUsd(fundamentals.totalDebt ?? fundamentals.totalLiabilities)],
    ["自己資本", compactUsd(fundamentals.equity)],
    ["負債/自己資本", plainPct(fundamentals.debtToEquityPct)],
    ["流動比率", numberText(fundamentals.currentRatio)],
    ["発行株式", compactNumber(fundamentals.sharesOutstanding)],
    ["開示期末", fundamentals.periodEnd ? formatDate(fundamentals.periodEnd) : "-"],
    ["次回決算", fundamentals.nextEarningsDate ? formatDate(fundamentals.nextEarningsDate) : "-"],
  ];
  const hasData = fields.some(([, value]) => value !== "-");
  const fetchedDate = String(fundamentals.fetchedAt || "").slice(0, 10);
  const sourceText = fundamentals.source
    ? `${fundamentals.source}${fetchedDate ? ` / ${formatDate(fetchedDate)}` : ""}`
    : "未取得";
  return `
    <section class="decision-card financial-card">
      <div>
        <h4>財務サマリー</h4>
        <span>${escapeHtml(sourceText)}</span>
      </div>
      ${hasData
        ? `<div class="financial-grid">
          ${fields.map(([label, value]) => `
            <span>
              <strong>${escapeHtml(label)}</strong>
              ${value}
            </span>
          `).join("")}
        </div>`
        : "<p>米国株を更新すると、取得できた財務情報をここに表示します。</p>"}
    </section>
  `;
}

function nextDividendPaymentLabel(stocks = [], analyses = {}, today = new Date()) {
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const nextDate = (stocks || []).reduce((earliest, stock) => {
    const price = analyses?.[stock.symbol]?.price;
    const position = positionMetrics(stock, price);
    if (!hasOpenPosition(stock, position)) return earliest;
    const paymentDate = dividendDate(price?.dividendPaymentDate);
    if (!paymentDate || paymentDate < todayKey) return earliest;
    return !earliest || paymentDate < earliest ? paymentDate : earliest;
  }, "");
  if (!nextDate) return "次回受領予定：日付データ未取得";
  const year = Number(nextDate.slice(0, 4));
  const month = Number(nextDate.slice(5, 7));
  const day = Number(nextDate.slice(8, 10));
  const dateLabel = year === today.getFullYear()
    ? `${month}月${day}日`
    : `${year}年${month}月${day}日`;
  return `次回受領予定：${dateLabel}`;
}

function portfolioSummary() {
  const summary = state.stocks.reduce((summary, stock) => {
    const analysis = state.analyses[stock.symbol];
    const position = positionMetrics(stock, analysis?.price);
    const hasPositionResult = Number.isFinite(position.grossInvested)
      || Number.isFinite(position.invested)
      || Number.isFinite(position.pnlAmount);
    const hasRecordedSales = Number.isFinite(position.soldQuantity) && position.soldQuantity > 0;
    const hasTrackedOpenPosition = stock.holding && Number.isFinite(position.quantity) && position.quantity > 0;
    if ((!hasTrackedOpenPosition && !hasRecordedSales) || !hasPositionResult) return summary;
    summary.invested += Number.isFinite(position.invested) ? position.invested : 0;
    summary.grossInvested += Number.isFinite(position.grossInvested)
      ? position.grossInvested
      : Number.isFinite(position.invested)
      ? position.invested
      : 0;
    summary.marketValue += Number.isFinite(position.marketValue) ? position.marketValue : 0;
    summary.pnlAmount += Number.isFinite(position.pnlAmount) ? position.pnlAmount : 0;
    summary.realizedPnlAmount += Number.isFinite(position.realizedPnlAmount) ? position.realizedPnlAmount : 0;
    summary.unrealizedPnlAmount += Number.isFinite(position.unrealizedPnlAmount) ? position.unrealizedPnlAmount : 0;
    summary.dividendReceived += Number.isFinite(position.dividendReceived) ? position.dividendReceived : 0;
    summary.annualDividendEstimate += Number.isFinite(position.annualDividendEstimate) ? position.annualDividendEstimate : 0;
    summary.totalReturnAmount += Number.isFinite(position.totalReturnAmount)
      ? position.totalReturnAmount
      : Number.isFinite(position.pnlAmount)
      ? position.pnlAmount
      : 0;
    summary.count += 1;
    const resultAmount = Number.isFinite(position.totalReturnAmount) ? position.totalReturnAmount : position.pnlAmount;
    if (hasTrackedOpenPosition && Number.isFinite(resultAmount) && resultAmount > 0) summary.winCount += 1;
    if (hasTrackedOpenPosition && Number.isFinite(resultAmount) && resultAmount < 0) summary.lossCount += 1;
    summary.pnlPct = summary.grossInvested > 0 ? (summary.pnlAmount / summary.grossInvested) * 100 : null;
    summary.totalReturnPct = summary.grossInvested > 0 ? (summary.totalReturnAmount / summary.grossInvested) * 100 : null;
    return summary;
  }, {
    invested: 0,
    grossInvested: 0,
    marketValue: 0,
    pnlAmount: 0,
    realizedPnlAmount: 0,
    unrealizedPnlAmount: 0,
    pnlPct: null,
    dividendReceived: 0,
    annualDividendEstimate: 0,
    totalReturnAmount: 0,
    totalReturnPct: null,
    count: 0,
    winCount: 0,
    lossCount: 0,
  });
  return {
    ...summary,
    ...nisaAllowanceSummary(),
  };
}

function nisaAllowanceSummary(year = new Date().getFullYear()) {
  const limit = nisaAnnualLimitYen();
  const lifetimeLimit = NISA_GROWTH_LIFETIME_LIMIT_YEN;
  const yearStart = `${year}-01-01`;
  const nextYearStart = `${year + 1}-01-01`;
  let used = 0;
  let lifetimeBookValue = 0;
  let restoredBookValue = 0;
  let restoringNextYear = 0;
  state.stocks.forEach((stock) => {
    const lots = positionLots(stock);
    const sales = saleLots(stock);
    lots.forEach((lot) => {
      if (normalizeAccountType(lot.accountType) !== "nisa") return;
      const bookValue = lot.purchasePrice * lot.quantity;
      lifetimeBookValue += bookValue;
      const purchaseYear = Number(String(lot.purchaseDate || "").slice(0, 4));
      if (Number.isFinite(purchaseYear) && purchaseYear > 0 && purchaseYear !== year) return;
      used += bookValue;
    });
    nisaSaleBookValues(lots, sales).forEach((sale) => {
      if (sale.sellDate && sale.sellDate < yearStart) restoredBookValue += sale.bookValue;
      if (sale.sellDate && sale.sellDate >= yearStart && sale.sellDate < nextYearStart) {
        restoringNextYear += sale.bookValue;
      }
    });
  });
  const lifetimeUsed = Math.max(0, lifetimeBookValue - restoredBookValue);
  const yearRemaining = Math.max(0, limit - used);
  const lifetimeRemaining = Math.max(0, lifetimeLimit - lifetimeUsed);
  return {
    nisaYear: year,
    nisaLimit: limit,
    nisaUsed: used,
    nisaLifetimeLimit: lifetimeLimit,
    nisaLifetimeUsed: lifetimeUsed,
    nisaYearRemaining: yearRemaining,
    nisaLifetimeRemaining: lifetimeRemaining,
    nisaRestoringNextYear: restoringNextYear,
    nisaRemaining: Math.min(yearRemaining, lifetimeRemaining),
  };
}

function nisaSaleBookValues(lots = [], sales = []) {
  if (!lots.length || !sales.length) return [];
  const remainingLots = lots.map((lot) => ({ ...lot }));
  const soldBookValues = [];
  sales.forEach((sale) => {
    let saleLeft = sale.quantity;
    for (const lot of remainingLots) {
      if (saleLeft <= 0) break;
      if (!lot.quantity) continue;
      const take = Math.min(lot.quantity, saleLeft);
      lot.quantity = Math.max(0, lot.quantity - take);
      saleLeft -= take;
      if (normalizeAccountType(lot.accountType) !== "nisa") continue;
      soldBookValues.push({
        sellDate: sale.sellDate || "",
        bookValue: take * lot.purchasePrice,
      });
    }
  });
  return soldBookValues;
}

function nisaAnnualLimitYen() {
  return normalizedNisaAnnualLimitYen(state.settings?.nisaAnnualLimitYen);
}

function normalizedNisaAnnualLimitYen(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return NISA_GROWTH_ANNUAL_LIMIT_YEN;
  return Math.max(0, Math.min(amount, NISA_GROWTH_ANNUAL_LIMIT_YEN));
}

function usSummaryFromState() {
  return state.usStocks.reduce((summary, stock) => {
    const analysis = state.usAnalyses[stock.symbol];
    const position = positionMetrics(stock, analysis?.price);
    const hasPositionResult = Number.isFinite(position.grossInvested)
      || Number.isFinite(position.invested)
      || Number.isFinite(position.pnlAmount);
    const hasRecordedSales = Number.isFinite(position.soldQuantity) && position.soldQuantity > 0;
    const hasTrackedOpenPosition = stock.holding && Number.isFinite(position.quantity) && position.quantity > 0;
    if ((!hasTrackedOpenPosition && !hasRecordedSales) || !hasPositionResult) return summary;
    summary.invested += Number.isFinite(position.invested) ? position.invested : 0;
    summary.grossInvested += Number.isFinite(position.grossInvested)
      ? position.grossInvested
      : Number.isFinite(position.invested)
      ? position.invested
      : 0;
    summary.marketValue += Number.isFinite(position.marketValue) ? position.marketValue : 0;
    summary.pnlAmount += Number.isFinite(position.pnlAmount) ? position.pnlAmount : 0;
    summary.realizedPnlAmount += Number.isFinite(position.realizedPnlAmount) ? position.realizedPnlAmount : 0;
    summary.unrealizedPnlAmount += Number.isFinite(position.unrealizedPnlAmount) ? position.unrealizedPnlAmount : 0;
    summary.dividendReceived += Number.isFinite(position.dividendReceived) ? position.dividendReceived : 0;
    summary.annualDividendEstimate += Number.isFinite(position.annualDividendEstimate) ? position.annualDividendEstimate : 0;
    summary.totalReturnAmount += Number.isFinite(position.totalReturnAmount)
      ? position.totalReturnAmount
      : Number.isFinite(position.pnlAmount)
      ? position.pnlAmount
      : 0;
    const resultAmount = Number.isFinite(position.totalReturnAmount) ? position.totalReturnAmount : position.pnlAmount;
    const currentlyHeld = hasOpenPosition(stock, position);
    summary.winCount += currentlyHeld && Number.isFinite(resultAmount) && resultAmount > 0 ? 1 : 0;
    summary.lossCount += currentlyHeld && Number.isFinite(resultAmount) && resultAmount < 0 ? 1 : 0;
    summary.pnlPct = summary.grossInvested > 0 ? (summary.pnlAmount / summary.grossInvested) * 100 : null;
    summary.totalReturnPct = summary.grossInvested > 0 ? (summary.totalReturnAmount / summary.grossInvested) * 100 : null;
    return summary;
  }, {
    invested: 0,
    grossInvested: 0,
    marketValue: 0,
    pnlAmount: 0,
    realizedPnlAmount: 0,
    unrealizedPnlAmount: 0,
    pnlPct: null,
    dividendReceived: 0,
    annualDividendEstimate: 0,
    totalReturnAmount: 0,
    totalReturnPct: null,
    winCount: 0,
    lossCount: 0,
  });
}

function hasOpenPosition(stock = {}, position = {}) {
  if (Number.isFinite(position.quantity) && position.quantity > 0) return true;
  if (
    Number.isFinite(position.grossQuantity)
    && position.grossQuantity > 0
    && Number.isFinite(position.soldQuantity)
  ) {
    return position.grossQuantity > position.soldQuantity;
  }
  return Boolean(stock.holding);
}

function hasClosedPosition(position = {}) {
  return Number.isFinite(position.grossQuantity)
    && position.grossQuantity > 0
    && Number.isFinite(position.soldQuantity)
    && position.soldQuantity >= position.grossQuantity;
}

function positionPnlUsd(position = {}) {
  const amount = Number.isFinite(position.totalReturnAmount) ? position.totalReturnAmount : position.pnlAmount;
  const ratio = Number.isFinite(position.totalReturnPct) ? position.totalReturnPct : position.pnlPct;
  if (!Number.isFinite(ratio) && !Number.isFinite(amount)) return "-";
  const main = Number.isFinite(amount)
    ? `<span class="pnl-main ${amount >= 0 ? "metric-pos" : "metric-neg"}">${usd(amount)}</span>`
    : pct(ratio);
  const sub = `${Number.isFinite(ratio) ? `<small>${signedPct(ratio)}</small>` : ""}${position.dividendReceived > 0 ? `<small>配当 ${usd(position.dividendReceived)}</small>` : ""}`;
  return `<span class="pnl-cell">${main}${sub}</span>`;
}

function usStanceBadge(ai = null, stock = {}, position = {}) {
  if (!hasOpenPosition(stock, position) && hasClosedPosition(position)) {
    return "<span class=\"badge watch\">売却済み</span>";
  }
  const stance = ai?.stance || "DATA_NEEDED";
  const label = {
    HOLD: "保有確認",
    REVIEW: "確認",
    EXIT_WATCH: "強め注意",
    DATA_NEEDED: "未確認",
  }[stance] || "確認";
  const cls = stance === "EXIT_WATCH" ? "sell" : stance === "HOLD" ? "hold" : stance === "REVIEW" ? "watch" : "watch";
  return `<span class="badge ${cls}">${label}</span>`;
}

function usPositionEditor(stock, position, price = {}) {
  const metrics = position || positionMetrics(stock);
  const lots = metrics.lots?.length ? metrics.lots : positionLots(stock);
  const displayLots = lots.length ? lots : [{ purchaseDate: "", purchasePrice: null, quantity: null }];
  const sales = metrics.sales?.length ? metrics.sales : saleLots(stock);
  const displaySales = sales.length ? sales : [{ sellDate: "", sellPrice: null, quantity: null }];
  return `
    <form id="usPositionForm" class="position-form">
      <div class="position-form-title">
        <strong>保有・売却情報 USD</strong>
        <label class="checkbox-line">
          <input name="holding" type="checkbox" ${stock.holding ? "checked" : ""}>
          <span>保有中</span>
        </label>
      </div>
      <div class="position-lots" aria-label="米国株購入明細">
        <div class="lot-section-title buy">購入明細</div>
        <div class="lot-head">
          <span>購入日</span>
          <span>購入単価 USD</span>
          <span>株数</span>
          <span></span>
        </div>
        <div class="lot-list">
          ${displayLots.map((lot) => lotRow(lot)).join("")}
        </div>
        <button type="button" class="secondary add-lot" data-add-lot>明細を追加</button>
      </div>
      <div class="position-lots sale-lots" aria-label="米国株売却明細">
        <div class="lot-section-title">売却明細</div>
        <div class="lot-head">
          <span>売却日</span>
          <span>売却単価 USD</span>
          <span>株数</span>
          <span></span>
        </div>
        <div class="sale-list">
          ${displaySales.map((lot) => saleRow(lot)).join("")}
        </div>
        <button type="button" class="secondary add-lot" data-add-sale>売却明細を追加</button>
      </div>
      <div class="position-stats">
        <span><strong>取引口座</strong>Revolut USA / USD</span>
        <span><strong>平均取得</strong>${usd(metrics.purchasePrice)}</span>
        <span><strong>平均売却</strong>${usd(metrics.averageSellPrice)}</span>
        <span><strong>残株数</strong>${shareCount(metrics.quantity)}</span>
        <span><strong>売却済み</strong>${shareCount(metrics.soldQuantity)}</span>
        <span><strong>配当込み損益</strong>${positionPnlUsd(metrics)}</span>
        <span><strong>株価損益</strong>${usd(metrics.pnlAmount)}</span>
        <span><strong>確定損益</strong>${usd(metrics.realizedPnlAmount)}</span>
        <span><strong>含み損益</strong>${usd(metrics.unrealizedPnlAmount)}</span>
        <span><strong>受取配当</strong>${usd(metrics.dividendReceived)}</span>
        <span><strong>1株配当</strong>${dividendPerShareText(price || {}, metrics, usd)}</span>
        <span><strong>年間配当目安</strong>${usd(metrics.annualDividendEstimate)}</span>
        <span><strong>取得額配当利回り</strong>${positionDividendYieldText(metrics)}</span>
        <span><strong>配当時期</strong>${escapeHtml(dividendTimingDetail(price || {}, usd))}</span>
        <span><strong>残り元本</strong>${usd(metrics.invested)}</span>
        <span><strong>評価額</strong>${usd(metrics.marketValue)}</span>
      </div>
      ${metrics.unmatchedSaleQuantity > 0 ? `<p class="unmatched-sale-warning">売却明細のうち${shareCount(metrics.unmatchedSaleQuantity)}は購入明細に割り当てられていません。購入明細の日付・株数を確認してください。</p>` : ""}
      ${priceReservationEditor(stock, usd, "予約価格 USD")}
      <button type="submit">保存</button>
    </form>
  `;
}

function attachUsPositionForm(symbol) {
  const form = document.getElementById("usPositionForm");
  if (!form) return;
  attachDetailFormEditGuard(form);
  form.querySelector("[data-add-lot]")?.addEventListener("click", () => {
    const list = form.querySelector(".lot-list");
    list.insertAdjacentHTML("beforeend", lotRow({ purchaseDate: "", purchasePrice: null, quantity: null }));
  });
  form.querySelector("[data-add-sale]")?.addEventListener("click", () => {
    const list = form.querySelector(".sale-list");
    list.insertAdjacentHTML("beforeend", saleRow({ sellDate: "", sellPrice: null, quantity: null }));
  });
  attachPriceReservationControls(form);
  form.addEventListener("click", (event) => {
    const saleButton = event.target.closest("[data-remove-sale]");
    if (saleButton) {
      clearOrRemoveSaleRow(form, saleButton);
      return;
    }
    const button = event.target.closest("[data-remove-lot]");
    if (!button) return;
    const rows = [...form.querySelectorAll(".lot-list .lot-row")];
    if (rows.length <= 1) {
      rows[0].querySelector('[name="purchaseDate"]').value = "";
      rows[0].querySelector('[name="purchasePrice"]').value = "";
      rows[0].querySelector('[name="quantity"]').value = "";
      return;
    }
    button.closest(".lot-row").remove();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        holding: form.elements.holding.checked,
        positions: readLotRows(form),
        sales: readSaleRows(form),
        priceReservation: readPriceReservation(form),
      };
      const result = await request(`/api/us-stocks/${encodeURIComponent(symbol)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      state.usStocks = result.stocks || [];
      state.usSummary = null;
      toast("米国株の保有情報を保存しました。");
      clearDetailFormEdit();
      renderUs();
    } catch (error) {
      toast(error.message);
    }
  });
}

function setMoneySummary(element, value, className = "", formatter = yen) {
  if (!element) return;
  element.classList.remove("metric-pos", "metric-neg", className);
  if (!Number.isFinite(value)) {
    element.textContent = "-";
    return;
  }
  element.textContent = formatter(value);
  element.classList.add(value >= 0 ? "metric-pos" : "metric-neg");
  if (className) element.classList.add(className);
}

function setRefreshingSummary(element, active, label) {
  if (!element) return;
  element.classList.toggle("is-refreshing", Boolean(active));
  if (active) {
    element.dataset.refreshLabel = label;
    element.setAttribute("aria-busy", "true");
  } else {
    delete element.dataset.refreshLabel;
    element.removeAttribute("aria-busy");
  }
}

function progressWithPrevious(message, previousText = "") {
  const previous = String(previousText || "").trim();
  if (!previous || previous === "未更新" || previous === "未分析") return message;
  return `${message} / ${previous}`;
}

function renderSelection() {
  const stock = state.stocks.find((item) => item.symbol === state.selected);
  const analysis = stock ? state.analyses[stock.symbol] : null;
  els.selectedSymbol.innerHTML = stock ? symbolLinkHtml(stock.symbol, "jp") : "未選択";

  const price = analysis?.price || {};
  drawChart(price.series || [], stock ? chartTradeMarkers(stock) : [], price);
  renderChartTiming(price);

  if (!stock) {
    els.decisionDetail.innerHTML = "<p>銘柄を追加してください。</p>";
    els.evidenceList.innerHTML = "";
    return;
  }

  if (!analysis) {
    els.decisionDetail.innerHTML = `
      ${positionEditor(stock, null, null)}
      <p>${escapeHtml(stock.name)}は未分析です。</p>
      ${stockForecastChartHtml(stock.symbol, "jp")}
    `;
    attachPositionForm(stock.symbol);
    renderStockForecastCharts(els.decisionDetail);
    els.evidenceList.innerHTML = "<article class=\"evidence-item\"><p>分析を実行すると根拠リンクを保存して表示します。</p></article>";
    return;
  }

  const action = analysis.action || "WATCH";
  const position = positionMetrics(stock, price);
  els.decisionDetail.innerHTML = `
    ${positionEditor(stock, position, analysis)}
    ${chartMessageHtml(price)}
    ${jpAiConfirmationHtml(stock, analysis, position)}
    ${financialInfoHtml(analysis.financials, analysis.price)}
    ${shareholderInfoHtml(analysis.shareholders)}
  `;
  attachPositionForm(stock.symbol);
  renderStockForecastCharts(els.decisionDetail);

  const evidence = analysis.evidence || [];
  const evidenceHtml = evidence.map((item) => `
    <article class="evidence-item">
      <div>
        <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.source || "source")}</a>
        <p>${escapeHtml(evidenceMetaText(item))}</p>
      </div>
      <p>${escapeHtml(item.summaryJa || item.snippet || "")}</p>
      ${item.articleText ? `<details class="evidence-fulltext"><summary>取得本文（最大1,800字）</summary><p>${escapeHtml(item.articleText)}</p></details>` : ""}
      <span>${escapeHtml(item.translationMethod === "lm_studio" ? "日本語要約" : item.kind || "web")}</span>
    </article>
  `).join("") || "<article class=\"evidence-item\"><p>根拠リンクはまだありません。</p></article>";
  els.evidenceList.innerHTML = `${evidenceSummaryHtml(stock, analysis, position)}${evidenceHtml}`;
}

function jpAiConfirmationHtml(stock = {}, analysis = {}, position = {}) {
  const action = analysis.action || "WATCH";
  const price = analysis.price || {};
  const reasons = (analysis.reasons || []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const risks = (analysis.risks || []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const confidence = Number.isFinite(analysis.confidence) ? ` ${Math.round(analysis.confidence)}%` : "";
  const badgeClass = actionClasses[action] || "watch";
  const summary = analysis.thesis || actionExplanation(action, stock, position);
  const industryProfile = analysis.industryProfile || {};
  return `
    <section class="decision-card jp-ai-confirmation">
      <div>
        <h4>AI確認</h4>
        <span class="badge ${badgeClass}">${escapeHtml(actionLabels[action] || "要確認")}${confidence}</span>
      </div>
      <p>${escapeHtml(summary)}</p>
      <div class="metrics-row">
        <span><strong>現在値</strong>${yen(price.current)}</span>
        <span><strong>配当込み損益</strong>${positionPnl(position)}</span>
        <span><strong>平均取得</strong>${yen(position.purchasePrice)}</span>
        <span><strong>平均売却</strong>${yen(position.averageSellPrice)}</span>
        <span><strong>残株数</strong>${shareCount(position.quantity)}</span>
        <span><strong>受取配当</strong>${yen(position.dividendReceived)}</span>
        <span><strong>取得額配当利回り</strong>${positionDividendYieldText(position)}</span>
        <span><strong>1株配当</strong>${dividendPerShareText(price, position, yen)}</span>
        <span><strong>年間配当目安</strong>${annualDividendText(position, yen)}</span>
        <span><strong>配当時期</strong>${escapeHtml(dividendTimingDetail(price, yen))}</span>
        <span><strong>1か月</strong>${pct(price.return1m)}</span>
        <span><strong>1年</strong>${pct(price.return1y)}</span>
        <span><strong>3年</strong>${pct(price.return3y)}</span>
        <span><strong>業種</strong>${escapeHtml(industryProfile.sector || stock.sector || "その他")}</span>
        <span><strong>為替影響</strong>${escapeHtml(industryFxShortText(industryProfile))}</span>
        <span><strong>銘柄コード</strong>${symbolLinkHtml(stock.symbol, "jp")}</span>
      </div>
      ${industryProfileHtml(industryProfile)}
      ${marketJudgmentHtml(analysis.marketView, analysis.marketImpact, analysis.marketConfidence, analysis.researchStats?.marketPerspectives || 0)}
      ${riskChecksHtml(analysis.riskChecks)}
      ${exitPlanHtml(analysis.exitPlan)}
      ${technicalEntryHtml(price, yen)}
      <div class="reason-columns">
        <section>
          <h4>良い材料</h4>
          <ul class="reason-list">${reasons || "<li>更新後に表示します</li>"}</ul>
        </section>
        <section>
          <h4>注意点</h4>
          <ul class="risk-list">${risks || "<li>更新後に表示します</li>"}</ul>
        </section>
      </div>
      ${stockForecastChartHtml(stock.symbol, "jp")}
    </section>
  `;
}

function industryFxShortText(profile = {}) {
  const fx = profile.fxImpact || {};
  const ratio = Number.isFinite(profile.overseasSalesRatio) ? ` / 海外${ratioPct(profile.overseasSalesRatio)}` : "";
  return `${fx.label || "未評価"}${ratio}`;
}

function industryProfileHtml(profile = {}) {
  if (!profile || (!profile.sector && !profile.summary)) return "";
  const fx = profile.fxImpact || {};
  const fxLevel = fx.level === "negative" ? "high" : fx.level === "positive" ? "low" : "medium";
  const drivers = (profile.drivers || []).slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const risks = (profile.risks || []).slice(0, 3).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  return `
    <section class="risk-checks industry-profile" aria-label="業種・為替">
      <div class="risk-check-title">
        <strong>業種・為替</strong>
        <span>${escapeHtml(profile.source || "推定")} / Evidence ${Number(profile.evidenceCount || 0)}</span>
      </div>
      <div class="risk-check-grid">
        <article class="risk-check medium">
          <div>
            <strong>${escapeHtml(profile.sector || "その他")}</strong>
            <span>${escapeHtml(profile.cyclicality || "確認")}</span>
          </div>
          <p>${escapeHtml(profile.summary || "業種情報を確認します。")}</p>
          <div class="entry-points">${drivers}${risks}</div>
        </article>
        <article class="risk-check ${fxLevel}">
          <div>
            <strong>為替影響</strong>
            <span>${escapeHtml(fx.label || "未評価")}</span>
          </div>
          <p>${escapeHtml(fx.summary || "海外売上比率または業種特性から確認します。")}</p>
          ${ruleGuideHtml({
            standard: "海外売上比率が高い会社は円安が追い風になりやすく、円高は逆風になりやすいです。輸入コストが重い会社は逆になることがあります。",
            impact: "追い風なら保有・買いの補助材料、逆風なら買い急がず決算への影響を確認します。",
          })}
        </article>
      </div>
    </section>
  `;
}

function riskChecksHtml(checks = []) {
  if (!Array.isArray(checks) || !checks.length) return "";
  return `
    <section class="risk-checks" aria-label="プロ確認">
      <div class="risk-check-title">
        <strong>プロ確認</strong>
        <span>業種・需給・配当まで確認</span>
      </div>
      <div class="risk-check-grid">
        ${checks.map((check) => `
          <article class="risk-check ${riskLevelClass(check.level)}">
            <div>
              <strong>${escapeHtml(check.label || "確認")}</strong>
              <span>${escapeHtml(check.status || riskLevelText(check.level))}</span>
            </div>
            <p>${escapeHtml(check.summary || "確認材料が不足しています。")}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function technicalEntryHtml(price = {}, formatter = yen) {
  const entry = price.technicalEntry || {};
  const regime = price.regime || {};
  const hasAny = Number.isFinite(entry.score)
    || Number.isFinite(price.atrPct)
    || Number.isFinite(price.rsi14)
    || Boolean(entry.summary || regime.summary);
  if (!hasAny) return "";
  const signals = (entry.signals || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const risks = (entry.risks || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const status = entry.ready ? "反転あり" : Number(entry.score || 0) >= 55 ? "反転待ち" : "待つ";
  const level = entry.ready ? "low" : Number(entry.score || 0) >= 55 ? "medium" : "high";
  return `
    <section class="risk-checks technical-entry" aria-label="反転確認">
      <div class="risk-check-title">
        <strong>買い反転確認</strong>
        <span>${escapeHtml(status)}${Number.isFinite(entry.score) ? ` ${Math.round(entry.score)}` : ""}</span>
      </div>
      <div class="risk-check-grid">
        <article class="risk-check ${riskLevelClass(level)}">
          <div>
            <strong>エントリー条件</strong>
            <span>${entry.ready ? "入口候補" : "未確定"}</span>
          </div>
          <p>${escapeHtml(entry.summary || "買い場ライン、5日線、RSI、ローソク足の反転を確認します。")}</p>
          ${ruleGuideHtml({
            standard: "買い場ライン付近で、5日線・RSI・ローソク足のどれかに反転サインが出ると入口候補です。",
            impact: "ラインから遠い時は追わず、反転が出るまで待つ判断にします。",
          })}
          <div class="entry-points">${signals}${risks}</div>
        </article>
        <article class="risk-check ${Number.isFinite(price.atrPct) && price.atrPct >= 6 ? "medium" : "low"}">
          <div>
            <strong>ATR調整</strong>
            <span>${Number.isFinite(price.atrPct) ? `${price.atrPct.toFixed(1)}%` : "未取得"}</span>
          </div>
          <p>買い場 ${formatter(entry.buyLine)} / 荒い時の指値 ${formatter(entry.atrAdjustedBuyLine)}</p>
          ${ruleGuideHtml({
            standard: "ATRは1日の値動きの大きさです。2-4%は通常、6%以上は荒い値動きとして見ます。",
            impact: "荒い時は買い場ラインを少し下げ、急落に巻き込まれにくい指値にします。",
          })}
        </article>
        <article class="risk-check ${price.sma5CrossUp || price.rsiCross30 ? "low" : "medium"}">
          <div>
            <strong>5日線・RSI</strong>
            <span>${price.sma5CrossUp || price.rsiCross30 ? "反転あり" : "待ち"}</span>
          </div>
          <p>5日線 ${formatter(price.sma5)} / RSI ${Number.isFinite(price.rsi14) ? price.rsi14.toFixed(1) : "-"}</p>
          ${ruleGuideHtml({
            standard: "RSIは30未満なら売られすぎ、70超なら過熱気味です。5日線上抜けは短期反転の確認に使います。",
            impact: "RSIが30を上回り直す、または5日線を上抜けるまでは、安く見えても待ちます。",
          })}
        </article>
        <article class="risk-check ${candlestickLevel(price.candlestickSignal)}">
          <div>
            <strong>ローソク足</strong>
            <span>${escapeHtml(price.candlestickSignal?.label || "未確認")}</span>
          </div>
          <p>${escapeHtml(price.candlestickSignal?.summary || "明けの明星、ピンバー、つつみ線、赤三兵、黒三兵などを買い/売りで分けて確認します。")}</p>
          ${ruleGuideHtml({
            standard: "買い足は下落後の反転、売り足は上昇後の失速として扱います。単独では決めず、買い場ライン・移動平均・大引けと合わせます。",
            impact: "買い足なら入口候補の補助材料、売り足なら買い急ぎを避ける材料にします。",
          })}
        </article>
        <article class="risk-check ${maCrossLevel(price.maCrossSignal)}">
          <div>
            <strong>ゴールデンクロス</strong>
            <span>${escapeHtml(price.maCrossSignal?.label || "未確認")}</span>
          </div>
          <p>${escapeHtml(price.maCrossSignal?.summary || "短期線が長期線を上抜けたかを確認します。")}</p>
          ${ruleGuideHtml({
            standard: "日本株は25日/75日、米国株や暗号資産は50日/200日も見ます。短期線が長期線を上抜けると買いが戻り始めたサインです。",
            impact: "買い場近くでゴールデンクロスが出ると入口候補に近づき、デッドクロスなら反転待ちにします。",
          })}
        </article>
        <article class="risk-check ${closeStrengthLevel(price.closeStrength)}">
          <div>
            <strong>大引けの強さ</strong>
            <span>${escapeHtml(price.closeStrength?.label || "未確認")}</span>
          </div>
          <p>${escapeHtml(closeStrengthText(price.closeStrength))}</p>
          ${ruleGuideHtml({
            standard: "終値が日中高値に近いほど、引けまで買いが残った可能性があります。25%以下なら引け味は弱めです。",
            impact: "強い大引けは反転確認の補助材料、弱い大引けは翌営業日の確認待ちにします。",
          })}
        </article>
        <article class="risk-check ${regime.panicPullbackPct >= 55 ? "medium" : "low"}">
          <div>
            <strong>レジーム(HMM風)</strong>
            <span>${escapeHtml(regime.label || "未判定")}</span>
          </div>
          <p>${escapeHtml(regime.summary || "日次リターン、20日ボラ、ATR、移動平均乖離から状態を推定します。")}</p>
          ${ruleGuideHtml({
            standard: "安定上昇、調整・下落、横ばいのどれに近いかを確率で見ます。",
            impact: "調整・下落が強い時は、価格だけで買わず反転確認を優先します。",
          })}
        </article>
      </div>
    </section>
  `;
}

function maCrossLevel(signal = null) {
  const score = Number(signal?.score);
  if (!Number.isFinite(score)) return "medium";
  if (score >= 6) return "low";
  if (score < 0) return "high";
  return "medium";
}

function candlestickLevel(signal = null) {
  if (signal?.side === "buy") return "low";
  if (signal?.side === "sell") return "high";
  return "medium";
}

function closeStrengthLevel(signal = null) {
  const score = Number(signal?.score);
  if (!Number.isFinite(score)) return "medium";
  if (score >= 4) return "low";
  if (score < 0) return "high";
  return "medium";
}

function closeStrengthText(signal = null) {
  if (!signal) return "終値が日中の高値側で終わったかを確認します。";
  const position = Number.isFinite(signal.closePositionPct)
    ? `終値位置 ${Math.round(signal.closePositionPct)}%。`
    : "";
  return `${position}${signal.summary || ""}`.trim();
}

function financialInfoHtml(info = null, price = {}) {
  if (!info) return "";
  const displayInfo = normalizedFinancialDisplayInfo(info, price);
  const statusText = info.status === "ok"
    ? "取得済み"
    : info.status === "partial"
    ? "一部取得"
    : info.status === "missing_key"
    ? "APIキー未設定"
    : info.status === "not_found"
    ? "未取得"
    : "確認";
  const criteria = (displayInfo.criteria || []).map((item) => `
    <article class="risk-check ${financialCriterionClass(item.status)}">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(financialCriterionText(item.status))}</span>
      </div>
      <p>${escapeHtml(item.summary || "未評価")}</p>
      ${financialCriterionGuideHtml(item)}
    </article>
  `).join("");
  const warnings = (displayInfo.warnings || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const missing = (displayInfo.missingMetrics || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const insights = (displayInfo.insights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const yahooLink = displayInfo.symbol ? symbolLinkHtml(displayInfo.symbol, "jp") : "";
  return `
    <section class="risk-checks financial-info" aria-label="財務情報">
      <div class="risk-check-title">
        <strong>財務情報</strong>
        <span>${yahooLink ? `${yahooLink} / ` : ""}${escapeHtml(statusText)}${displayInfo.checkedAt ? ` ${new Date(displayInfo.checkedAt).toLocaleString("ja-JP")}` : ""}</span>
      </div>
      <div class="metric-strip financial-metrics" aria-label="EDINET財務指標">
        <span><strong>株価</strong>${yen(displayInfo.currentPrice)}</span>
        <span><strong>発行済株式数</strong>${shareCount(displayInfo.sharesOutstanding)}</span>
        <span><strong>時価総額</strong>${largeYen(displayInfo.marketCap)}</span>
        <span><strong>ネットキャッシュ比率</strong>${Number.isFinite(displayInfo.netCashRatio) ? `${(displayInfo.netCashRatio * 100).toFixed(1)}%` : "-"}</span>
        <span><strong>ネットキャッシュ</strong>${largeYen(displayInfo.netCash)}</span>
        <span><strong>海外売上比率</strong>${ratioPct(displayInfo.overseasSalesRatio)}</span>
        <span><strong>EV/EBITDA</strong>${multipleText(displayInfo.evEbitda)}</span>
        <span><strong>PBR</strong>${multipleText(displayInfo.pbr)}</span>
        <span><strong>PER</strong>${multipleText(displayInfo.per)}</span>
        <span><strong>営業CF</strong>${largeYen(displayInfo.operatingCashFlow)}</span>
      </div>
      ${criteria ? `<div class="risk-check-grid">${criteria}</div>` : ""}
      ${insights ? `<div class="financial-insights"><strong>決算書から分かること</strong><ul>${insights}</ul></div>` : ""}
      ${displayInfo.documentTitle || displayInfo.docID ? `<p class="settings-help">確認元 ${escapeHtml(displayInfo.documentTitle || "EDINET書類")} ${escapeHtml(displayInfo.docID || "")}</p>` : ""}
      ${missing ? `<div class="entry-points financial-missing"><strong>不足材料</strong>${missing}</div>` : ""}
      ${warnings ? `<div class="entry-points">${warnings}</div>` : ""}
    </section>
  `;
}

function normalizedFinancialDisplayInfo(info = {}, price = {}) {
  const currentPrice = finiteOrNull(info.currentPrice);
  const marketPrice = finiteOrNull(price.current);
  const sharesOutstanding = finiteOrNull(info.sharesOutstanding);
  const marketCap = finiteOrNull(info.marketCap);
  const impliedPrice = marketCap && sharesOutstanding ? marketCap / sharesOutstanding : null;
  const warnings = [...(info.warnings || [])];
  if (Number.isFinite(marketPrice) && !isFinancialDisplayPriceConsistent(currentPrice, marketPrice)) {
    return {
      ...info,
      currentPrice: marketPrice,
      warnings: [...new Set([...warnings, "株価を価格データで補正"].filter(Boolean))],
    };
  }
  if (Number.isFinite(impliedPrice) && !isFinancialDisplayPriceConsistent(currentPrice, impliedPrice)) {
    return {
      ...info,
      currentPrice: impliedPrice,
      warnings: [...new Set([...warnings, "株価を時価総額÷発行済株式数で補正"].filter(Boolean))],
    };
  }
  return info;
}

function isFinancialDisplayPriceConsistent(price, impliedPrice) {
  if (!Number.isFinite(price)) return false;
  if (!Number.isFinite(impliedPrice) || impliedPrice <= 0) return true;
  const ratio = price / impliedPrice;
  return ratio >= 0.65 && ratio <= 1.35;
}

function financialCriterionClass(status = "") {
  if (status === "pass") return "low";
  if (status === "watch" || status === "unknown") return "medium";
  return "high";
}

function financialCriterionText(status = "") {
  if (status === "pass") return "合格";
  if (status === "watch") return "確認";
  if (status === "fail") return "外れる";
  return "未取得";
}

function ruleGuideHtml(guide = {}) {
  const standard = guide?.standard || "";
  const impact = guide?.impact || "";
  if (!standard && !impact) return "";
  return `
    <div class="rule-guide">
      ${standard ? `<span><strong>目安</strong>${escapeHtml(standard)}</span>` : ""}
      ${impact ? `<span><strong>買う時</strong>${escapeHtml(impact)}</span>` : ""}
    </div>
  `;
}

function financialCriterionGuideHtml(item = {}) {
  const guides = {
    market_cap: {
      standard: "50億-500億円は中小型PEの中心、500億-3000億円は大型PEでも対象になり得る範囲、3000億-1兆円は大型・特殊案件として見ます。",
      impact: "規模が大きいほど直接の買収・MBO・株主変化が必要です。通常の株として買う判断とは分けて見ます。",
    },
    net_cash: {
      standard: "ネットキャッシュ比率は50%以上なら強い、30-50%は確認、0%未満は弱い条件です。",
      impact: "現金が厚いほど買収後に資金回収しやすいため、PE候補として加点します。",
    },
    ev_ebitda: {
      standard: "EV/EBITDAは6倍以下、またはPER12倍以下を割安の目安にします。PER20倍超は慎重に見ます。",
      impact: "利益に対して安いほど買いやすさは上がります。高い場合は高い価格で買ってしまうリスクを重く見ます。",
    },
    pbr: {
      standard: "PBRは1.0倍未満なら純資産と比べて安め、0.8倍以下なら強め。1.2倍超は資産面の割安感は弱めです。",
      impact: "PBRだけでは買いません。低PBRに加えて、事業の現金創出や株主還元余地を確認します。",
    },
    operating_cf: {
      standard: "営業CFは3期以上プラスなら安定、直近期だけプラスなら確認中、マイナスなら大きな注意点です。",
      impact: "本業で現金を生む会社ほど、長期保有やPE候補として見やすくなります。",
    },
  };
  return ruleGuideHtml(guides[item.key] || null);
}

function exitPlanHtml(plan = {}) {
  if (!plan || !plan.highWaterPrice) return "";
  const currency = plan.currency || "JPY";
  const growth = plan.growthExit || {};
  const onkabu = plan.onkabu || {};
  const discipline = plan.discipline || {};
  const aiForecast = sellForecastCardHtml(plan.aiSellForecast, currency);
  const cards = [
    {
      label: "ファンダ崩壊",
      level: growth.level === "exit_alert" ? "high" : growth.level === "watch" ? "medium" : "low",
      status: growth.level === "exit_alert" ? "売りアラート" : growth.level === "watch" ? "確認" : "正常",
      summary: growth.reason || "成長ストーリー崩壊は未検出です。",
      guide: {
        standard: "30日以内の下方修正、ガイダンス未達、需要・粗利・受注の悪化、減配などを異常として見ます。",
        impact: "株価だけで売らず、買った理由そのものが崩れた時だけ売却候補にします。",
      },
    },
    {
      label: "高値トレーリング",
      level: plan.trailingTriggered ? "high" : plan.alertLevel === "watch" ? "medium" : "low",
      status: plan.trailingTriggered ? "通知対象" : plan.trailingBelowLine ? "通知なし" : `${plan.trailingStopPct || 25}%`,
      summary: plan.trailingSuppressedReason || `最高値 ${moneyByCurrency(plan.highWaterPrice, currency)}${plan.highWaterDate ? ` (${plan.highWaterDate})` : ""}、確認ライン ${moneyByCurrency(plan.trailingStopPrice, currency)}。現在は高値から ${signedPctText(plan.drawdownFromHighPct)}。`,
      guide: {
        standard: `最高値から${plan.trailingStopPct || 25}%下を確認ラインにします。成長株の20-30%下落は通常でも起きます。`,
        impact: "確認ラインを割ったら、利益確定か保有理由の見直しを行います。損益とファンダ崩壊も合わせて判断します。",
      },
    },
    {
      label: "恩株化",
      level: onkabu.triggered ? "medium" : onkabu.achieved ? "low" : "low",
      status: onkabu.triggered ? "部分利益確定候補" : onkabu.achieved ? "達成" : `+${onkabu.profitPct || 100}%`,
      summary: onkabu.summary || "+100%到達時に元本分の部分利益確定を検討します。",
      guide: {
        standard: `含み益が+${onkabu.profitPct || 100}%に届いたら、半分売って元本回収する目安です。`,
        impact: "元本を回収した後は、残りを長期で持ちやすくなります。",
      },
    },
    {
      label: "10のルール",
      level: disciplineLevel(discipline),
      status: discipline.action || "判定待ち",
      summary: discipline.summary || "取得単価からの損益率で、買い増し・保有・一部売却・全売却の目安を出します。",
      guide: {
        standard: "-5%は何もしない、-15%は10%買い増し候補、-25%は25%買い増し候補。+5%/+15%は保有、+25%から段階的に一部売却、+100%で全売却を検討します。",
        impact: "感情で動かず、売買量を先に決めるための目安です。買い増しは業績や悪材料が崩れていない場合だけ確認します。",
      },
      extra: disciplineRuleBadges(discipline),
    },
  ];
  const alerts = (plan.alerts || []).map((alert) => `
    <article class="risk-check high">
      <div>
        <strong>${escapeHtml(alert.label || "出口")}</strong>
        <span>${escapeHtml(alert.action || "要確認")}</span>
      </div>
      <p>${escapeHtml(alert.summary || "")}</p>
      ${alertPointsHtml(alert.points)}
    </article>
  `).join("");
  return `
    <section class="risk-checks exit-plan" aria-label="出口ルール">
      <div class="risk-check-title">
        <strong>出口ルール</strong>
        <span>${escapeHtml(exitPlanStatusText(plan.alertLevel))}</span>
      </div>
      <div class="risk-check-grid">
        ${cards.map((card) => `
          <article class="risk-check ${riskLevelClass(card.level)}">
            <div>
              <strong>${escapeHtml(card.label)}</strong>
            <span>${escapeHtml(card.status)}</span>
          </div>
          <p>${escapeHtml(card.summary)}</p>
          ${ruleGuideHtml(card.guide)}
          ${card.extra || ""}
        </article>
      `).join("")}
        ${aiForecast}
        ${alerts}
      </div>
    </section>
  `;
}

function sellForecastCardHtml(forecast = null, currency = "JPY") {
  if (!forecast || (!forecast.horizon && !forecast.reason && !Number.isFinite(forecast.targetPrice))) return "";
  const confidence = Number.isFinite(forecast.confidence) ? `${Math.round(forecast.confidence)}%` : "確認";
  const catalysts = (forecast.catalysts || []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `
    <article class="risk-check medium sell-forecast-card">
      <div>
        <strong>AI売却目安</strong>
        <span>${escapeHtml(forecast.horizon || confidence)}</span>
      </div>
      <p>${escapeHtml(forecast.timing || forecast.reason || "ニュースと過去の値動きから、売却を検討する時期と価格を見ます。")}</p>
      ${ruleGuideHtml({
        standard: "決算、主要ニュース、5日線やRSIの失速、過去レンジを見て1-6か月の目安を出します。",
        impact: "信頼度が低い時は売買指示ではなく、次の決算やニュースを待つ確認メモとして扱います。",
      })}
      <div class="forecast-lines">
        <span><strong>利益確定候補</strong>${moneyByCurrency(forecast.targetPrice, currency)}</span>
        <span><strong>見直し</strong>${moneyByCurrency(forecast.reviewPrice, currency)}</span>
        <span><strong>信頼度</strong>${escapeHtml(confidence)}</span>
      </div>
      ${forecast.reason ? `<p>${escapeHtml(forecast.reason)}</p>` : ""}
      ${catalysts ? `<ul class="compact-list">${catalysts}</ul>` : ""}
    </article>
  `;
}

function alertPointsHtml(points = []) {
  if (!Array.isArray(points) || !points.length) return "";
  return `
    <ul class="compact-list">
      ${points.slice(0, 8).map((point) => `<li>${linkifyPlainText(point)}</li>`).join("")}
    </ul>
  `;
}

function exitPlanStatusText(level = "") {
  if (level === "exit_alert") return "売る理由あり";
  if (level === "partial_profit") return "恩株化候補";
  if (level === "watch") return "接近中";
  return "保有継続";
}

function disciplineLevel(plan = {}) {
  if (plan.kind === "sell") return Number(plan.sellPct || 0) >= 100 ? "high" : "medium";
  if (plan.kind === "buy_more") return "medium";
  if (plan.kind === "wait") return "medium";
  return "low";
}

function disciplineRuleBadges(plan = {}) {
  const values = [
    Number.isFinite(plan.returnPct) ? `現在 ${signedPct(plan.returnPct)}` : "",
    plan.label || "",
    plan.suggestedBuyQuantity ? `買い増し ${shareCount(plan.suggestedBuyQuantity)}` : "",
    plan.suggestedSellQuantity ? `売却 ${shareCount(plan.suggestedSellQuantity)}` : "",
  ].filter(Boolean);
  if (!values.length) return "";
  return `<div class="entry-points">${values.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function shareholderInfoHtml(info = null) {
  if (!info) return "";
  const change = Number.isFinite(info.changePct)
    ? `${info.changePct > 0 ? "+" : ""}${info.changePct.toFixed(1)}pt`
    : "-";
  const changeLevel = info.changeAlert ? "high" : Number.isFinite(info.changePct) && Math.abs(info.changePct) >= 1 ? "medium" : "low";
  const holders = (info.majorHolders || []).slice(0, 6).map((holder) => `
    <article class="risk-check low">
      <div>
        <strong>${escapeHtml(holder.name)}</strong>
        <span>${escapeHtml(holder.type || "株主")}</span>
      </div>
      <p>${Number.isFinite(holder.pct) ? `${holder.pct.toFixed(1)}%` : "比率未取得"}</p>
    </article>
  `).join("");
  const sources = (info.evidence || []).slice(0, 3).map((item) => `
    <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source || item.title || "確認元")}</a>
  `).join(" ");
  return `
    <section class="risk-checks shareholder-info" aria-label="株主情報">
      <div class="risk-check-title">
        <strong>株主情報</strong>
        <span>${info.checkedAt ? `確認 ${new Date(info.checkedAt).toLocaleString("ja-JP")}` : "未確認"}</span>
      </div>
      <div class="risk-check-grid">
        <article class="risk-check ${Number.isFinite(info.institutionalOwnershipPct) ? "low" : "medium"}">
          <div>
            <strong>機関投資家</strong>
            <span>${Number.isFinite(info.institutionalOwnershipPct) ? `${info.institutionalOwnershipPct.toFixed(1)}%` : "未取得"}</span>
          </div>
          <p>${escapeHtml(info.summaryJa || "株主情報を確認中です。")}</p>
        </article>
        <article class="risk-check ${riskLevelClass(changeLevel)}">
          <div>
            <strong>前回比</strong>
            <span>${escapeHtml(change)}</span>
          </div>
          <p>${Number.isFinite(info.previousInstitutionalOwnershipPct) ? `前回 ${info.previousInstitutionalOwnershipPct.toFixed(1)}%。${info.changeAlert ? "通知対象の変化です。" : "通知しきい値未満です。"}` : "初回取得または前回比率なし。"}</p>
        </article>
        <article class="risk-check low">
          <div>
            <strong>外国人/外国法人</strong>
            <span>${Number.isFinite(info.foreignOwnershipPct) ? `${info.foreignOwnershipPct.toFixed(1)}%` : "未取得"}</span>
          </div>
          <p>${info.asOfDate ? `基準日 ${escapeHtml(info.asOfDate)}` : "基準日は確認元に依存します。"}</p>
        </article>
        ${holders}
      </div>
      ${sources ? `<p class="settings-help">確認元 ${sources}</p>` : ""}
    </section>
  `;
}

function signedPctText(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function chartTradeMarkers(stock = {}) {
  const buys = positionLots(stock).map((lot) => ({
    type: "buy",
    date: lot.purchaseDate,
    price: lot.purchasePrice,
    quantity: lot.quantity,
  }));
  const sells = saleLots(stock).map((lot) => ({
    type: "sell",
    date: lot.sellDate,
    price: lot.sellPrice,
    quantity: lot.quantity,
  }));
  return [...buys, ...sells]
    .filter((marker) => /^\d{4}-\d{2}-\d{2}$/.test(marker.date || ""))
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

function resolveChartTradeMarkers(series = [], tradeMarkers = []) {
  if (!series.length || !tradeMarkers.length) return [];
  const firstTime = dateToTime(series[0].date);
  const lastTime = dateToTime(series.at(-1).date);
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) return [];
  const stackByKey = new Map();
  return tradeMarkers
    .map((marker) => {
      const targetTime = dateToTime(marker.date);
      if (!Number.isFinite(targetTime) || targetTime < firstTime || targetTime > lastTime) return null;
      const index = chartIndexOnOrAfter(series, marker.date);
      const point = series[index];
      if (!point) return null;
      const price = finiteOrNull(marker.price) || point.close;
      const key = `${point.date}:${marker.type}`;
      const stack = stackByKey.get(key) || 0;
      stackByKey.set(key, stack + 1);
      return {
        ...marker,
        date: point.date,
        inputDate: marker.date,
        price,
        index,
        stack,
      };
    })
    .filter(Boolean);
}

function chartIndexOnOrAfter(series = [], date = "") {
  let fallback = series.length - 1;
  for (let index = 0; index < series.length; index += 1) {
    if (series[index].date >= date) return index;
    fallback = index;
  }
  return fallback;
}

function drawChartTradeMarkers(context, markers = [], x, y, options = {}) {
  if (!markers.length) return;
  const formatter = options.formatter || yen;
  context.save();
  context.font = "11px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  markers.forEach((marker) => {
    const px = x(marker.index);
    const baseY = y(marker.price);
    const offset = Math.min(18, marker.stack * 8);
    const py = clampNumber(
      marker.type === "sell" ? baseY - offset : baseY + offset,
      options.top + 12,
      options.bottom - 12,
    );
    const fill = marker.type === "sell" ? "#b33a42" : "#08785f";
    const label = marker.type === "sell" ? "売" : "買";
    context.strokeStyle = marker.type === "sell" ? "rgba(179,58,66,0.28)" : "rgba(8,120,95,0.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(px, options.top);
    context.lineTo(px, options.bottom);
    context.stroke();
    context.fillStyle = fill;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2.5;
    context.beginPath();
    if (marker.type === "sell") {
      context.moveTo(px, py + 9);
      context.lineTo(px - 8, py - 6);
      context.lineTo(px + 8, py - 6);
    } else {
      context.moveTo(px, py - 9);
      context.lineTo(px - 8, py + 6);
      context.lineTo(px + 8, py + 6);
    }
    context.closePath();
    context.fill();
    context.stroke();
    const labelY = marker.type === "sell" ? py - 17 : py + 17;
    const text = `${label} ${formatter(marker.price)}`;
    const textWidth = context.measureText(text).width + 12;
    const left = clampNumber(px - textWidth / 2, options.left + 2, options.right - textWidth - 2);
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.strokeStyle = marker.type === "sell" ? "rgba(179,58,66,0.35)" : "rgba(8,120,95,0.35)";
    roundRectPath(context, left, labelY - 9, textWidth, 18, 8);
    context.fill();
    context.stroke();
    context.fillStyle = fill;
    context.fillText(text, left + textWidth / 2, labelY);
  });
  context.restore();
}

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawChart(series, tradeMarkers = chartState.tradeMarkers || [], price = chartState.price || {}) {
  const canvas = els.chart;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = Number.parseFloat(getComputedStyle(canvas).height) || 230;
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(cssHeight * dpr);
  context.scale(dpr, dpr);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const pad = { top: 22, right: 18, bottom: 28, left: 56 };
  const cleanSeries = cleanChartSeries(series);
  chartState.price = price || {};
  const markers = resolveChartTradeMarkers(cleanSeries, tradeMarkers);
  const values = [...cleanSeries.map((point) => point.close), ...markers.map((marker) => marker.price)];
  chartState.series = cleanSeries;
  chartState.tradeMarkers = tradeMarkers;
  chartState.points = [];
  chartState.plot = null;
  if (values.length < 2) {
    context.fillStyle = "#667277";
    context.font = "13px system-ui";
    context.fillText("価格データなし", pad.left, 46);
    hideChartTooltip();
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index) => pad.left + (index / (cleanSeries.length - 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - ((value - min) / span)) * (height - pad.top - pad.bottom);
  chartState.plot = {
    left: pad.left,
    right: width - pad.right,
    top: pad.top,
    bottom: height - pad.bottom,
  };

  context.strokeStyle = "#dbe2e4";
  context.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const gy = pad.top + (i / 3) * (height - pad.top - pad.bottom);
    context.beginPath();
    context.moveTo(pad.left, gy);
    context.lineTo(width - pad.right, gy);
    context.stroke();
  }

  const timing = buyTimingFromSeries(
    cleanSeries,
    yen,
    chartState.price.dividendEvents || [],
    chartState.price.dividendNextAmount,
    chartState.price.dividendNextDate,
    chartState.price.dividendNextDateSource,
  );
  if (timing?.buyLine) {
    const buyY = y(timing.buyLine);
    context.fillStyle = "rgba(11, 107, 88, 0.08)";
    context.fillRect(pad.left, buyY, width - pad.left - pad.right, Math.max(0, height - pad.bottom - buyY));
    context.strokeStyle = "rgba(11, 107, 88, 0.35)";
    context.setLineDash([5, 5]);
    context.beginPath();
    context.moveTo(pad.left, buyY);
    context.lineTo(width - pad.right, buyY);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#0b6b58";
    context.font = "11px system-ui";
    context.fillText(timing.dividendAdjustment1y > 0 ? "配当落ち調整後" : "1年の買い場", Math.max(pad.left + 4, width - 112), Math.max(pad.top + 12, buyY - 6));
  }
  if (timing?.sellLine) {
    const sellY = y(timing.sellLine);
    context.strokeStyle = "rgba(171, 58, 64, 0.38)";
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(pad.left, sellY);
    context.lineTo(width - pad.right, sellY);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#ab3a40";
    context.font = "11px system-ui";
    context.fillText("売り場ライン", Math.max(pad.left + 4, width - 112), Math.max(pad.top + 12, sellY - 6));
  }

  context.strokeStyle = "#0b6b58";
  context.lineWidth = 2.5;
  context.beginPath();
  cleanSeries.forEach((point, index) => {
    const px = x(index);
    const py = y(point.close);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.stroke();
  drawChartTradeMarkers(context, markers, x, y, {
    top: pad.top,
    bottom: height - pad.bottom,
    left: pad.left,
    right: width - pad.right,
    formatter: yen,
  });

  context.fillStyle = "#1a2428";
  context.font = "12px system-ui";
  context.fillText("3年", pad.left, 16);
  context.fillText(yen(max), 10, pad.top + 4);
  context.fillText(yen(min), 10, height - pad.bottom + 4);

  chartState.points = cleanSeries.map((point, index) => ({
    index,
    point,
    x: x(index),
    y: y(point.close),
  }));

  if (Number.isFinite(chartState.hoverIndex)) {
    const hovered = chartState.points[chartState.hoverIndex];
    if (hovered) {
      context.strokeStyle = "rgba(26, 36, 40, 0.35)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(hovered.x, pad.top);
      context.lineTo(hovered.x, height - pad.bottom);
      context.stroke();
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#0b6b58";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(hovered.x, hovered.y, 4.5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      positionChartTooltip(hovered);
    }
  }
}

function updateChartHover(event) {
  if (!chartState.points.length || !chartState.plot) return;
  const rect = els.chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const plot = chartState.plot;
  if (x < plot.left || x > plot.right || y < plot.top - 12 || y > plot.bottom + 12) {
    clearChartHover();
    return;
  }
  let nearest = chartState.points[0];
  let best = Math.abs(nearest.x - x);
  for (const point of chartState.points) {
    const distance = Math.abs(point.x - x);
    if (distance < best) {
      nearest = point;
      best = distance;
    }
  }
  if (nearest.index === chartState.hoverIndex) {
    positionChartTooltip(nearest);
    return;
  }
  chartState.hoverIndex = nearest.index;
  drawChart(chartState.series, chartState.tradeMarkers);
}

function clearChartHover() {
  if (!Number.isFinite(chartState.hoverIndex)) return;
  chartState.hoverIndex = null;
  hideChartTooltip();
  drawChart(chartState.series, chartState.tradeMarkers);
}

function positionChartTooltip(point) {
  const tooltip = els.chartTooltip;
  if (!tooltip || !els.chart) return;
  const rect = els.chart.getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.innerHTML = `
    <strong>${escapeHtml(formatDate(point.point.date))}</strong>
    <span>${yen(point.point.close)}</span>
  `;
  const width = tooltip.offsetWidth || 120;
  const left = Math.min(Math.max(point.x, width / 2 + 6), rect.width - width / 2 - 6);
  const top = Math.max(12, point.y - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideChartTooltip() {
  if (els.chartTooltip) els.chartTooltip.hidden = true;
}

function renderEmbeddedPriceChart(root, series = [], formatter = yen, tradeMarkers = [], price = {}) {
  const canvas = root?.querySelector("[data-us-price-chart]");
  const tooltip = root?.querySelector("[data-us-chart-tooltip]");
  const timingNode = root?.querySelector("[data-us-chart-timing]");
  if (!canvas) return;
  const frame = canvas.closest(".chart-frame") || canvas;
  const state = { series: [], points: [], plot: null, hoverIndex: null };

  const draw = () => {
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 120) return;
    const dpr = window.devicePixelRatio || 1;
    const cssHeight = Number.parseFloat(getComputedStyle(canvas).height) || 230;
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.floor(cssHeight * dpr);
    context.scale(dpr, dpr);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    const pad = { top: 22, right: 18, bottom: 28, left: 64 };
    const cleanSeries = cleanChartSeries(series);
    state.series = cleanSeries;
    state.points = [];
    state.plot = null;
    if (cleanSeries.length < 2) {
      context.fillStyle = "#667277";
      context.font = "13px system-ui";
      context.fillText("価格データなし", pad.left, 46);
      if (tooltip) tooltip.hidden = true;
      renderEmbeddedChartTiming(timingNode, null, formatter);
      return;
    }
    const markers = resolveChartTradeMarkers(cleanSeries, tradeMarkers);
    const values = [...cleanSeries.map((point) => point.close), ...markers.map((marker) => marker.price)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (index) => pad.left + (index / (cleanSeries.length - 1)) * (width - pad.left - pad.right);
    const y = (value) => pad.top + (1 - ((value - min) / span)) * (height - pad.top - pad.bottom);
    state.plot = { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom };

    context.strokeStyle = "#dbe2e4";
    context.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const gy = pad.top + (i / 3) * (height - pad.top - pad.bottom);
      context.beginPath();
      context.moveTo(pad.left, gy);
      context.lineTo(width - pad.right, gy);
      context.stroke();
    }

    const timing = buyTimingFromSeries(
      cleanSeries,
      formatter,
      price.dividendEvents || [],
      price.dividendNextAmount,
      price.dividendNextDate,
      price.dividendNextDateSource,
    );
    if (timing?.buyLine) {
      const buyY = y(timing.buyLine);
      context.fillStyle = "rgba(11, 107, 88, 0.08)";
      context.fillRect(pad.left, buyY, width - pad.left - pad.right, Math.max(0, height - pad.bottom - buyY));
      context.strokeStyle = "rgba(11, 107, 88, 0.35)";
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(pad.left, buyY);
      context.lineTo(width - pad.right, buyY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#0b6b58";
      context.font = "11px system-ui";
      context.fillText(timing.dividendAdjustment1y > 0 ? "配当落ち調整後" : "1年の買い場", Math.max(pad.left + 4, width - 112), Math.max(pad.top + 12, buyY - 6));
    }
    if (timing?.sellLine) {
      const sellY = y(timing.sellLine);
      context.strokeStyle = "rgba(171, 58, 64, 0.38)";
      context.setLineDash([6, 5]);
      context.beginPath();
      context.moveTo(pad.left, sellY);
      context.lineTo(width - pad.right, sellY);
      context.stroke();
      context.setLineDash([]);
    }

    context.strokeStyle = "#0b6b58";
    context.lineWidth = 2.5;
    context.beginPath();
    cleanSeries.forEach((point, index) => {
      const px = x(index);
      const py = y(point.close);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.stroke();
    drawChartTradeMarkers(context, markers, x, y, {
      top: pad.top,
      bottom: height - pad.bottom,
      left: pad.left,
      right: width - pad.right,
      formatter,
    });
    context.fillStyle = "#1a2428";
    context.font = "12px system-ui";
    context.fillText("3年", pad.left, 16);
    context.fillText(formatter(max), 8, pad.top + 4);
    context.fillText(formatter(min), 8, height - pad.bottom + 4);
    state.points = cleanSeries.map((point, index) => ({ index, point, x: x(index), y: y(point.close) }));

    if (Number.isFinite(state.hoverIndex)) {
      const hovered = state.points[state.hoverIndex];
      if (hovered) {
        context.strokeStyle = "rgba(26, 36, 40, 0.35)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(hovered.x, pad.top);
        context.lineTo(hovered.x, height - pad.bottom);
        context.stroke();
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#0b6b58";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(hovered.x, hovered.y, 4.5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        positionEmbeddedTooltip(canvas, tooltip, hovered, formatter);
      }
    }
    renderEmbeddedChartTiming(timingNode, timing, formatter);
  };

  canvas.addEventListener("mousemove", (event) => {
    if (!state.points.length || !state.plot) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < state.plot.left || px > state.plot.right || py < state.plot.top - 12 || py > state.plot.bottom + 12) {
      state.hoverIndex = null;
      if (tooltip) tooltip.hidden = true;
      draw();
      return;
    }
    let nearest = state.points[0];
    let best = Math.abs(nearest.x - px);
    for (const point of state.points) {
      const distance = Math.abs(point.x - px);
      if (distance < best) {
        nearest = point;
        best = distance;
      }
    }
    state.hoverIndex = nearest.index;
    draw();
  });
  canvas.addEventListener("mouseleave", () => {
    state.hoverIndex = null;
    if (tooltip) tooltip.hidden = true;
    draw();
  });
  requestAnimationFrame(draw);
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => requestAnimationFrame(draw));
    observer.observe(frame);
  } else {
    window.addEventListener("resize", draw, { passive: true });
  }
}

function positionEmbeddedTooltip(canvas, tooltip, point, formatter) {
  if (!tooltip || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.innerHTML = `
    <strong>${escapeHtml(formatDate(point.point.date))}</strong>
    <span>${formatter(point.point.close)}</span>
  `;
  const width = tooltip.offsetWidth || 120;
  const left = Math.min(Math.max(point.x, width / 2 + 6), rect.width - width / 2 - 6);
  const top = Math.max(12, point.y - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function renderEmbeddedChartTiming(node, timing, formatter) {
  if (!node) return;
  if (!timing) {
    node.hidden = true;
    node.innerHTML = "";
    return;
  }
  node.hidden = false;
  node.className = `chart-timing ${timing.statusClass}`;
  const periods = timing.periods.length
    ? timing.periods.map((period) => `<span>${escapeHtml(period.label)}</span>`).join("")
    : timing.months.map((month) => `<span>${escapeHtml(month)}</span>`).join("");
  node.innerHTML = `
    <div>
      <strong>1年の買い時</strong>
      <span>${escapeHtml(timing.status)}</span>
    </div>
    <p>${escapeHtml(timing.summary)}</p>
    <div class="timing-grid">
      <span><strong>買い場ライン</strong>${formatter(timing.buyLine)}</span>
      ${timing.buyLineAfterNextDividend ? `<span><strong>次回配当落ち後の参考ライン</strong>${formatter(timing.buyLineAfterNextDividend)}</span>` : ""}
      ${timing.dividendAdjustment1y > 0 ? `<span><strong>過去1年の配当落ち調整</strong>-${formatter(timing.dividendAdjustment1y)}</span>` : ""}
      <span><strong>売り場ライン</strong>${formatter(timing.sellLine)}</span>
      <span><strong>最安日</strong>${escapeHtml(formatDate(timing.low.date))} ${formatter(timing.low.close)}</span>
      <span><strong>今との差</strong>${signedPct(timing.currentGapFromBuyLine)}</span>
      <span><strong>安かった時期</strong>${periods || "<em>-</em>"}</span>
    </div>
  `;
}

function renderChartTiming(price) {
  if (!els.chartTiming) return;
  const timing = buyTimingFromSeries(
    price?.series || [],
    yen,
    price?.dividendEvents || [],
    price?.dividendNextAmount,
    price?.dividendNextDate,
    price?.dividendNextDateSource,
  );
  if (!timing) {
    els.chartTiming.hidden = true;
    els.chartTiming.innerHTML = "";
    return;
  }
  els.chartTiming.hidden = false;
  els.chartTiming.className = `chart-timing ${timing.statusClass}`;
  const periods = timing.periods.length
    ? timing.periods.map((period) => `<span>${escapeHtml(period.label)}</span>`).join("")
    : timing.months.map((month) => `<span>${escapeHtml(month)}</span>`).join("");
  els.chartTiming.innerHTML = `
    <div>
      <strong>1年の買い時</strong>
      <span>${escapeHtml(timing.status)}</span>
    </div>
    <p>${escapeHtml(timing.summary)}</p>
    <div class="timing-grid">
      <span><strong>買い場ライン（配当落ち調整後）</strong>${yen(timing.buyLine)}</span>
      ${timing.buyLineAfterNextDividend ? `<span><strong>次回配当落ち後の参考ライン</strong>${yen(timing.buyLineAfterNextDividend)}</span>` : ""}
      ${timing.dividendAdjustment1y > 0 ? `<span><strong>過去1年の配当落ち調整</strong>-${yen(timing.dividendAdjustment1y)}</span>` : ""}
      <span><strong>売り場ライン</strong>${yen(timing.sellLine)}</span>
      <span><strong>最安日</strong>${escapeHtml(formatDate(timing.low.date))} ${yen(timing.low.close)}</span>
      <span><strong>今との差</strong>${signedPct(timing.currentGapFromBuyLine)}</span>
      <span><strong>安かった時期</strong>${periods || "<em>-</em>"}</span>
    </div>
  `;
}

function buyTimingFromSeries(series = [], formatter = yen, dividendEvents = [], nextDividendAmount = null, nextDividendDate = "", nextDividendDateSource = "") {
  const clean = cleanChartSeries(series)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length < 40) return null;
  const latest = clean[clean.length - 1];
  const latestTime = dateToTime(latest.date);
  if (!Number.isFinite(latestTime)) return null;
  const oneYearRaw = clean.filter((point) => {
    const time = dateToTime(point.date);
    return Number.isFinite(time) && latestTime - time <= 366 * 86400000;
  });
  if (oneYearRaw.length < 40) return null;

  const events = (dividendEvents || [])
    .map((event) => ({ date: String(event?.date || "").slice(0, 10), amount: Number(event?.amount) }))
    .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date) && Number.isFinite(event.amount) && event.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const oneYear = oneYearRaw.map((point) => {
    const adjustment = events
      .filter((event) => event.date > point.date && event.date <= latest.date)
      .reduce((sum, event) => sum + event.amount, 0);
    return { ...point, close: Math.max(0.01, point.close - adjustment), dividendAdjustment: adjustment };
  });

  const closes = oneYear.map((point) => point.close).sort((a, b) => a - b);
  const buyLine = quantile(closes, 0.25);
  const deepLine = quantile(closes, 0.15);
  const sellLine = quantile(closes, 0.75);
  const median = quantile(closes, 0.5);
  const lowAdjusted = oneYear.reduce((best, point) => (point.close < best.close ? point : best), oneYear[0]);
  const low = oneYearRaw.find((point) => point.date === lowAdjusted.date) || lowAdjusted;
  const cheapPoints = oneYear.filter((point) => point.close <= buyLine);
  const periods = cheapPeriods(cheapPoints);
  const months = cheapMonths(oneYear, buyLine);
  const currentGapFromBuyLine = buyLine ? ((latest.close - buyLine) / buyLine) * 100 : null;
  const return1m = oneYear.length > 21 ? ((oneYear.at(-1).close - oneYear[oneYear.length - 22].close) / oneYear[oneYear.length - 22].close) * 100 : null;

  let status = "押し目待ち";
  let statusClass = "wait";
  let phrase = "今は過去1年の買い場ラインより高く、無理に追わず押し目待ちです。";
  if (latest.close <= deepLine * 1.02) {
    status = "かなり安い側";
    statusClass = "good";
    phrase = "今は過去1年のかなり安い側にいます。落ちている理由と反発の兆しを確認したい位置です。";
  } else if (latest.close <= buyLine * 1.03) {
    status = "買い場に近い";
    statusClass = "good";
    phrase = "今は過去1年の安い側に近く、買いたい価格に届きやすい位置です。";
  } else if (latest.close <= median) {
    status = "少し待つ";
    statusClass = "ok";
    phrase = "今は過去1年の真ん中より少し安い側です。買い場ラインまで待つと入りやすくなります。";
  }
  if (Number.isFinite(return1m) && return1m < -8 && latest.close <= buyLine * 1.06) {
    status = "反発確認";
    statusClass = "watch";
    phrase = "安い側まで来ていますが、直近の下げが強いので、下げ止まりを見てから入りたい位置です。";
  }

  const periodText = periods.length
    ? periods.map((period) => period.label).join("、")
    : months.join("、");
  const dividendAdjustment1y = events
    .filter((event) => event.date > oneYearRaw[0].date && event.date <= latest.date)
    .reduce((sum, event) => sum + event.amount, 0);
  const buyLineAfterNextDividend = Number(nextDividendAmount) > 0
    ? Math.max(0.01, buyLine - Number(nextDividendAmount))
    : null;
  const nextDateText = nextDividendDate
    ? `次回${nextDividendDateSource === "データ取得済み予定" ? "取得予定" : "推定"}配当落ち${formatDate(nextDividendDate)}`
    : "次回配当落ち日未確認";
  const summary = `過去1年では ${periodText || "安値圏"} が買いやすい時期でした。${phrase} 目安は ${formatter(buyLine)} 以下、直近は ${formatter(latest.close)} です。${dividendAdjustment1y > 0 ? ` 過去配当${formatter(dividendAdjustment1y)}を調整済み。` : ""}${buyLineAfterNextDividend ? ` ${nextDateText}後の参考ラインは${formatter(buyLineAfterNextDividend)}です。` : ""}`;
  return {
    buyLine,
    buyLineRaw: quantile(oneYearRaw.map((point) => point.close).sort((a, b) => a - b), 0.25),
    buyLineAfterNextDividend,
    dividendAdjustment1y,
    deepLine,
    sellLine,
    low,
    latest,
    periods,
    months,
    currentGapFromBuyLine,
    status,
    statusClass,
    summary,
  };
}

function cheapPeriods(points = []) {
  if (!points.length) return [];
  const clusters = [];
  let current = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    const gap = previous ? (dateToTime(point.date) - dateToTime(previous.date)) / 86400000 : 0;
    if (!previous || gap <= 10) current.push(point);
    else {
      clusters.push(current);
      current = [point];
    }
  }
  if (current.length) clusters.push(current);
  return clusters
    .map((cluster) => {
      const low = cluster.reduce((best, point) => (point.close < best.close ? point : best), cluster[0]);
      return {
        start: cluster[0],
        end: cluster[cluster.length - 1],
        low,
        count: cluster.length,
        label: periodLabel(cluster[0].date, cluster[cluster.length - 1].date),
      };
    })
    .sort((a, b) => a.low.close - b.low.close || b.count - a.count)
    .slice(0, 3)
    .sort((a, b) => a.start.date.localeCompare(b.start.date));
}

function cheapMonths(series = [], buyLine = null) {
  const groups = new Map();
  for (const point of series) {
    const key = String(new Date(`${point.date}T00:00:00`).getMonth() + 1);
    const group = groups.get(key) || { month: Number(key), closes: [], cheapCount: 0 };
    group.closes.push(point.close);
    if (buyLine && point.close <= buyLine) group.cheapCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      average: averageNumbers(group.closes),
    }))
    .sort((a, b) => b.cheapCount - a.cheapCount || a.average - b.average)
    .slice(0, 3)
    .map((group) => `${group.month}月`);
}

function periodLabel(start, end) {
  if (!start || !end || start === end) return formatMonthDay(start);
  return `${formatMonthDay(start)}-${formatMonthDay(end)}`;
}

function formatDate(value = "") {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function cleanChartSeries(series = []) {
  const byDate = new Map();
  for (const point of series || []) {
    const date = String(point?.date || "").slice(0, 10);
    const close = Number(point?.close);
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    byDate.set(date, { date, close });
  }
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 5) return sorted;
  return sorted.filter((point, index, points) => !isSuspiciousChartPoint(point, index, points));
}

function isSuspiciousChartPoint(point, index, points = []) {
  const neighbors = [
    ...points.slice(Math.max(0, index - 8), index),
    ...points.slice(index + 1, index + 9),
  ].map((item) => item.close).filter(Number.isFinite);
  if (neighbors.length < 4) return false;
  const localMedian = quantile(neighbors, 0.5);
  if (!localMedian) return false;
  const previous = Number(points[index - 1]?.close);
  const next = Number(points[index + 1]?.close);
  const hasPrevious = Number.isFinite(previous) && previous > 0;
  const hasNext = Number.isFinite(next) && next > 0;
  const isolatedLow = point.close < localMedian * 0.55
    && ((hasPrevious && previous > point.close * 1.8) || (hasNext && next > point.close * 1.8))
    && (!hasPrevious || !hasNext || Math.abs(previous - next) / localMedian < 0.25);
  const isolatedHigh = point.close > localMedian * 1.8
    && ((hasPrevious && previous * 1.8 < point.close) || (hasNext && next * 1.8 < point.close))
    && (!hasPrevious || !hasNext || Math.abs(previous - next) / localMedian < 0.25);
  if (point.close < localMedian * 0.25) {
    return Boolean((hasPrevious && previous > point.close * 2.8)
      || (hasNext && next > point.close * 2.8));
  }
  if (point.close > localMedian * 4) {
    return Boolean((hasPrevious && previous * 2.8 < point.close)
      || (hasNext && next * 2.8 < point.close));
  }
  if (isolatedLow || isolatedHigh) return true;
  return false;
}

function dividendTiming(price = {}) {
  const events = dividendEvents(price);
  const nextDate = String(price?.dividendNextDate || "").slice(0, 10);
  const nextDateLabel = dividendNextDateLabel(nextDate);
  if (!events.length) {
    return nextDateLabel ? { latest: null, months: [], nextLabel: nextDateLabel, nextDate } : null;
  }
  const latest = events.at(-1);
  const monthCounts = new Map();
  events.slice(-12).forEach((event) => {
    const month = Number(event.date.slice(5, 7));
    if (month >= 1 && month <= 12) monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
  });
  const months = [...monthCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 4)
    .map(([month]) => month)
    .sort((a, b) => a - b);
  return {
    latest,
    months,
    nextDate: nextDateLabel ? nextDate : "",
    nextLabel: nextDateLabel || nextDividendLabel(months, latest.date),
  };
}

function dividendEvents(price = {}) {
  const events = Array.isArray(price?.dividendEvents) ? price.dividendEvents : [];
  const normalized = events
    .map((item) => ({
      date: String(item?.date || "").slice(0, 10),
      amount: Number(item?.amount),
    }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.amount) && item.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!normalized.length && price?.dividendLastDate) {
    const amount = Number(price.dividendLastAmount);
    return [{
      date: String(price.dividendLastDate).slice(0, 10),
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    }].filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  }
  return normalized;
}

function nextDividendLabel(months = [], latestDate = "") {
  if (!months.length) return "";
  const now = new Date();
  const latestTime = dateToTime(latestDate) || 0;
  const baseTime = Math.max(now.getTime(), latestTime);
  const base = new Date(baseTime);
  const baseYear = base.getFullYear();
  for (let year = baseYear; year <= baseYear + 2; year += 1) {
    for (const month of months) {
      const candidate = new Date(year, month - 1, 15);
      if (candidate.getTime() > baseTime + 7 * 86400000) {
        return year === now.getFullYear() ? `${month}月頃` : `${year}/${month}頃`;
      }
    }
  }
  return `${months.map(monthLabel).join("・")}頃`;
}

function dividendNextDateLabel(value = "") {
  const time = dateToTime(value);
  if (!Number.isFinite(time)) return "";
  if (time < Date.now() - 14 * 86400000) return "";
  return formatDate(value);
}

function dividendTimingSummary(price = {}) {
  const timing = dividendTiming(price);
  if (!timing) return "";
  return timing.nextLabel ? `次 ${timing.nextLabel}` : `直近 ${formatMonthDay(timing.latest?.date)}`;
}

function dividendTimingDetail(price = {}, formatter = yen) {
  const timing = dividendTiming(price);
  const frequency = price.dividendFrequencyText || "";
  const caution = price.dividendBuyCaution ? "配当落ち間近・新規買い待ち" : "";
  const nextAmount = Number.isFinite(Number(price.dividendNextAmount)) && Number(price.dividendNextAmount) > 0
    ? `次回予想 ${formatter(Number(price.dividendNextAmount))}/株`
    : "次回配当額未確認";
  if (!timing) return [frequency, caution].filter(Boolean).join(" / ") || "-";
  const amount = Number.isFinite(timing.latest?.amount) ? formatter(timing.latest.amount) : "";
  const latest = timing.latest ? `直近 ${formatDate(timing.latest.date)}${amount ? ` ${amount}` : ""}` : "";
  const source = price.dividendNextDateSource === "データ取得済み予定" ? "取得予定" : "推定";
  const next = timing.nextLabel ? `次回${source} ${timing.nextLabel}` : "";
  const months = timing.months.length ? ` / 実績月 ${timing.months.map(monthLabel).join("・")}` : "";
  return [frequency, latest, next, timing.nextLabel ? nextAmount : "", caution].filter(Boolean).join(" / ") + months || "-";
}

function monthLabel(month) {
  return `${month}月`;
}

function evidenceMetaText(item = {}) {
  const kind = item.evidenceClass === "investor_opinion" || item.topic === "investor_commentary"
    ? "投資家コメント・未確認"
    : item.evidenceClass === "analyst_opinion" || item.topic === "analyst_view"
    ? "アナリスト見解"
    : item.evidenceClass === "reported_news" || item.topic === "recent_news"
    ? "報道・ニュース"
    : item.kind === "business_profile" || item.topic === "business_profile"
    ? "会社資料"
    : item.kind === "sector" || item.topic === "sector"
    ? "業界情報"
    : "";
  return [
    item.source || "",
    item.publishedDate ? formatDate(item.publishedDate) : "",
    kind,
    item.contentStatus === "article_excerpt" ? "記事本文の冒頭を取得" : item.contentStatus === "snippet_only" ? "検索抜粋のみ" : "",
  ].filter(Boolean).join(" / ");
}

function marketJudgmentHtml(view, impact, confidence, count = 0) {
  const impactLabel = {
    positive: "追い風",
    negative: "懸念材料",
    mixed: "強弱あり",
    neutral: "影響は限定的",
    unknown: "影響未評価",
  }[impact || "unknown"];
  const summary = view || (count
    ? "直近情報は取得しましたが、AIによる市場見解の整理は未完了です。下の出典を確認してください。"
    : "直近45日以内に日付を確認できる情報はありません。日付不明の投稿は判断材料に使っていません。");
  return `
    <section class="market-judgment">
      <div><strong>直近ニュース・市場見解の判断</strong><span>${escapeHtml(impactLabel)}${Number(confidence) > 0 ? ` / 信頼度 ${Math.round(Number(confidence))}%` : ""}</span></div>
      <p>${escapeHtml(summary)}</p>
      <small>${Number(count)}件の直近情報を確認。掲示板コメントだけで売買判断を変更しない設計です。</small>
    </section>
  `;
}

function usEvidenceTitleText(item = {}) {
  if ((item.translationMethod === "lm_studio" || item.translationMethod === "source_ja") && item.titleJa) return item.titleJa;
  return item.title || item.source || "source";
}

function usEvidenceSummaryText(item = {}) {
  if ((item.translationMethod === "lm_studio" || item.translationMethod === "source_ja") && item.summaryJa) return item.summaryJa;
  return item.translationError || "LM Studioで再分析すると日本語要約を作ります。";
}

function usEvidenceTranslationLabel(item = {}) {
  if (item.translationMethod === "lm_studio") return "日本語要約";
  if (item.translationMethod === "source_ja") return "日本語原文";
  return "未翻訳";
}

function formatMonthDay(value = "") {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dateToTime(value = "") {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function quantile(sortedValues = [], ratio = 0.5) {
  const values = sortedValues.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const position = (values.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

function averageNumbers(values = []) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function actionExplanation(action, stock, position) {
  if (action === "BUY") return "買い候補です。ただし今すぐ成行で買う意味ではなく、買いたい価格と税金・手数料を引いた損益目安を確認してから入る候補です。";
  if (action === "HOLD") return stock.holding ? "保有継続です。今すぐ動く理由は弱く、次の決算や価格水準を待つ位置です。" : "まだ買い急がず、候補として様子を見る位置です。";
  if (action === "SELL") {
    return position.sellableQuantity > 0
      ? "見直し候補です。即売りではなく、保有理由・業績・配当をもう一度確認する位置です。"
      : "見直し候補ですが、今すぐ動くほどの根拠ではありません。";
  }
  return "要確認です。材料不足、株価位置、業種リスクなどを確認してから動く位置です。";
}

function chartMessageHtml(price = {}) {
  const notes = [];
  if (isHighChaseChart(price)) notes.push("大きく上がった後の高い位置なので、新規買いは押し目待ちです。");
  if (isNoUpsideChart(price)) notes.push("3年チャートでは上値が重く、買い増しには向きにくい形です。");
  if (Number.isFinite(price.distanceFromLow3y) && price.distanceFromLow3y <= 18 && price.trend3y !== "DOWN") {
    notes.push("3年レンジでは安い側なので、損切りより反発確認の場面です。");
  }
  if (!notes.length) return "";
  return `<div class="chart-note">${notes.map((note) => `<span>${escapeHtml(note)}</span>`).join("")}</div>`;
}

function evidenceSummaryHtml(stock, analysis, position) {
  const evidence = analysis.evidence || [];
  const reasons = (analysis.reasons || []).slice(0, 2);
  const risks = (analysis.risks || []).slice(0, 2);
  const sources = [...new Set(evidence.map((item) => item.source).filter(Boolean))].slice(0, 5);
  const businessSources = (analysis.businessOverviewSources || [])
    .filter((item) => item.url)
    .map((item) => `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source || item.title || "会社資料")}</a>`)
    .join("");
  return `
    <article class="evidence-summary">
      <div>
        <strong>${escapeHtml(stock.name)}の要約</strong>
        <p>${escapeHtml(analysis.thesis || "保存済み分析をもとに整理しています。")}</p>
      </div>
      <section class="business-overview"><strong>事業概要</strong><p>${escapeHtml(analysis.businessOverview || "年次報告書・IR資料からの事業概要は未取得です。銘柄を更新すると、会社資料を優先して確認します。")}</p><div>${businessSources || ""}</div></section>
      <div class="evidence-summary-grid">
        <span><strong>配当込み損益</strong>${positionPnl(position, true)}</span>
        <span><strong>取得額配当利回り</strong>${positionDividendYieldText(position)}</span>
        <span><strong>1株配当</strong>${dividendPerShareText(analysis.price || {}, position, yen)}</span>
        <span><strong>年間配当目安</strong>${annualDividendText(position, yen)}</span>
        <span><strong>直近45日のニュース・見解</strong>${Number(analysis.researchStats?.marketPerspectives || 0)}件</span>
        <span><strong>検索件数</strong>${analysis.researchStats?.searched ?? evidence.length}</span>
      </div>
      <div class="summary-points">
        ${reasons.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        ${risks.map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="source-chips">${sources.map((source) => `<span>${escapeHtml(source)}</span>`).join("") || "<span>根拠リンクなし</span>"}</div>
    </article>
  `;
}

async function analyze(options = {}) {
  if (state.running) return;
  state.running = true;
  state.jpRefreshing = true;
  renderProfitSummary();
  els.analyzeButton.disabled = true;
  els.discoverButton.disabled = true;
  if (els.discoverNisaButton) els.discoverNisaButton.disabled = true;
  const originalText = els.analyzeButton.textContent;
  els.analyzeButton.textContent = "更新中";
  els.researchProgress.textContent = options.source === "reload" ? "ブラウザ更新で価格を確認中" : "価格を更新中";

  try {
    const body = {
      manual: true,
      force: true,
      websiteLimit: clampInput(els.websiteLimit),
      depthLimit: clampInput(els.depthLimit),
      pagesPerSite: clampInput(els.pagesPerSite),
    };
    let priceUpdated = false;
    try {
      const quickPayload = await request("/api/analyze", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ ...body, quick: true }),
      });
      applyAnalysisPayload(quickPayload, false);
      els.researchProgress.textContent = "価格更新済み。AI分析を続行中";
      priceUpdated = true;
      renderCurrentDataView();
    } catch (quickError) {
      console.warn("価格だけの高速更新に失敗しました", quickError);
      els.researchProgress.textContent = "価格更新に時間がかかっています。AI分析へ進みます";
    }
    const payload = await request("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ ...body, reuseFreshPrices: priceUpdated }),
    });
    state.analysisJob = payload.job || null;
    renderAnalysisJob();
    const result = payload.analyses ? payload : await pollAnalysisJob();
    applyAnalysisPayload(result);
    renderCurrentDataView();
  } catch (error) {
    toast(error.message);
    els.researchProgress.textContent = "失敗";
  } finally {
    state.running = false;
    state.jpRefreshing = false;
    els.analyzeButton.disabled = false;
    els.discoverButton.disabled = false;
    if (els.discoverNisaButton) els.discoverNisaButton.disabled = false;
    els.analyzeButton.textContent = originalText;
    renderProfitSummary();
  }
}

async function analyzeUs(options = {}) {
  if (!els.usAnalyzeButton) return;
  els.usAnalyzeButton.disabled = true;
  state.usRefreshing = true;
  const originalText = els.usAnalyzeButton.textContent;
  const previousStatus = els.usLastRun?.textContent || "";
  els.usAnalyzeButton.textContent = "更新中";
  if (els.usLastRun) {
    els.usLastRun.textContent = progressWithPrevious(
      options.source === "reload" ? "ブラウザ更新で価格確認中" : "価格更新中",
      previousStatus,
    );
  }
  renderUs();
  try {
    const body = { manual: true, force: true, websiteLimit: clampInput(els.websiteLimit) };
    let priceUpdated = false;
    try {
      const quickPayload = await request("/api/us-analyze", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ ...body, quick: true }),
      });
      applyUsAnalysisPayload(quickPayload);
      if (els.usLastRun) {
        els.usLastRun.textContent = `価格更新済み。AI分析中 ${new Date(quickPayload.generatedAt).toLocaleString("ja-JP")}`;
      }
      priceUpdated = true;
      renderUs();
    } catch (quickError) {
      console.warn("米国株の価格だけの高速更新に失敗しました", quickError);
      if (els.usLastRun) els.usLastRun.textContent = progressWithPrevious("価格更新に時間がかかっています", previousStatus);
    }
    const payload = await request("/api/us-analyze", {
      method: "POST",
      body: JSON.stringify({ ...body, reuseFreshPrices: priceUpdated }),
    });
    state.usAnalysisJob = payload.job || null;
    renderUsAnalysisJob();
    const result = payload.analyses ? payload : await pollUsAnalysisJob();
    applyUsAnalysisPayload(result);
    if (els.usLastRun) {
      els.usLastRun.textContent = result.usedLmStudio
        ? `更新済み AI ${new Date(result.generatedAt).toLocaleString("ja-JP")}`
        : `更新済み ${new Date(result.generatedAt).toLocaleString("ja-JP")}`;
    }
    if (result.warnings?.length) toast(result.warnings.join(" / "));
    renderUs();
  } catch (error) {
    toast(error.message);
    if (els.usLastRun) els.usLastRun.textContent = progressWithPrevious("更新失敗", previousStatus);
  } finally {
    state.usRefreshing = false;
    els.usAnalyzeButton.disabled = false;
    els.usAnalyzeButton.textContent = originalText;
    renderUsSummary();
  }
}

async function analyzeCrypto(options = {}) {
  if (!els.cryptoAnalyzeButton) return;
  els.cryptoAnalyzeButton.disabled = true;
  state.cryptoRefreshing = true;
  const originalText = els.cryptoAnalyzeButton.textContent;
  const previousStatus = els.cryptoLastRun?.textContent || "";
  els.cryptoAnalyzeButton.textContent = "更新中";
  if (els.cryptoLastRun) {
    els.cryptoLastRun.textContent = progressWithPrevious(
      options.source === "reload" ? "ブラウザ更新中" : "更新中",
      previousStatus,
    );
  }
  renderCrypto();
  try {
    const payload = await request("/api/crypto-analyze", {
      method: "POST",
      body: JSON.stringify({ manual: true, force: true }),
    });
    applyCryptoPayload(payload);
    if (els.cryptoLastRun) {
      els.cryptoLastRun.textContent = `更新済み ${new Date(payload.generatedAt).toLocaleString("ja-JP")}`;
    }
    renderCrypto();
  } catch (error) {
    toast(error.message);
    if (els.cryptoLastRun) els.cryptoLastRun.textContent = progressWithPrevious("更新失敗", previousStatus);
  } finally {
    state.cryptoRefreshing = false;
    els.cryptoAnalyzeButton.disabled = false;
    els.cryptoAnalyzeButton.textContent = originalText;
    renderCryptoSummary();
  }
}

async function pollAnalysisJob() {
  for (let i = 0; i < 360; i += 1) {
    const payload = await request("/api/analysis-job").catch(() => null);
    if (!payload) throw new Error("一括分析の進み具合を確認できませんでした。");
    state.analysisJob = payload.job || state.analysisJob;
    renderAnalysisJob();
    if (payload.result) return payload.result;
    if (state.analysisJob?.error) throw new Error(state.analysisJob.error);
    await sleep(2500);
  }
  throw new Error("一括分析が長引いています。保存済み結果を確認してください。");
}

async function pollUsAnalysisJob() {
  for (let i = 0; i < 360; i += 1) {
    const payload = await request("/api/us-analysis-job").catch(() => null);
    if (!payload) throw new Error("米国株分析の進み具合を確認できませんでした。");
    state.usAnalysisJob = payload.job || state.usAnalysisJob;
    renderUsAnalysisJob();
    if (payload.result) return payload.result;
    if (state.usAnalysisJob?.error) throw new Error(state.usAnalysisJob.error);
    await sleep(2500);
  }
  throw new Error("米国株分析が長引いています。保存済み結果を確認してください。");
}

function applyAnalysisPayload(payload, notifyWarnings = true) {
  if (Array.isArray(payload.analyses)) {
    state.analyses = Object.fromEntries(payload.analyses.map((item) => [item.symbol, item]));
  }
  if (Array.isArray(payload.sectorEvidence)) state.sectorEvidence = payload.sectorEvidence;
  if (payload.generatedAt) els.lastRun.textContent = new Date(payload.generatedAt).toLocaleString("ja-JP");
  els.researchProgress.textContent = payload.fastRefresh
    ? "価格更新済み"
    : payload.usedLmStudio ? "更新済み LM Studio分析" : "更新済み ルール分析";
  if (notifyWarnings && payload.warnings?.length) toast(payload.warnings.join(" / "));
}

function renderAnalysisJob() {
  const job = state.analysisJob;
  if (!job) return;
  if (!job.running) {
    if (job.error) els.researchProgress.textContent = `失敗: ${job.error}`;
    return;
  }
  const total = Number(job.total || 0);
  const checked = Number(job.checked || 0);
  const aiTotal = Number(job.aiTotal || 0);
  const aiDone = Number(job.aiDone || 0);
  const aiCurrent = Number(job.aiCurrent || 0);
  const details = [];
  if (total) details.push(`${Math.min(checked, total)}/${total}銘柄`);
  if (aiTotal) {
    const aiText = aiCurrent && aiDone < aiTotal
      ? `AI ${Math.min(aiCurrent, aiTotal)}/${aiTotal} 生成中`
      : `AI ${Math.min(aiDone, aiTotal)}/${aiTotal}`;
    details.push(aiText);
  }
  els.researchProgress.textContent = `${job.phase || "進行中"} ${details.join(" / ")}`.trim();
}

function renderUsAnalysisJob() {
  const job = state.usAnalysisJob;
  if (!els.usLastRun || !job) return;
  if (!job.running) {
    if (job.error) els.usLastRun.textContent = `失敗: ${job.error}`;
    return;
  }
  const total = Number(job.total || 0);
  const checked = Number(job.checked || 0);
  const aiTotal = Number(job.aiTotal || 0);
  const aiDone = Number(job.aiDone || 0);
  const aiCurrent = Number(job.aiCurrent || 0);
  const details = [];
  if (total) details.push(`${Math.min(checked, total)}/${total}銘柄`);
  if (aiTotal) {
    const aiText = aiCurrent && aiDone < aiTotal
      ? `AI ${Math.min(aiCurrent, aiTotal)}/${aiTotal} 生成中`
      : `AI ${Math.min(aiDone, aiTotal)}/${aiTotal}`;
    details.push(aiText);
  }
  els.usLastRun.textContent = `${job.phase || "進行中"} ${details.join(" / ")}`.trim();
}

async function discover(mode = "general") {
  if (state.running) return;
  setView("ideas");
  state.discoveryMode = mode;
  if (state.sourceSummary?.discoveryMode !== mode) {
    state.suggestions = [];
    state.sourceSummary = {
      discoveryMode: mode,
      searchCount: 0,
      message: mode === "nisa" ? "日本株のNISA適性を検索しています。" : "候補を検索しています。",
    };
    renderCandidateList();
  }
  for (const button of [els.discoverButton, els.discoverNisaButton].filter(Boolean)) button.disabled = true;
  els.candidateProgress.textContent = mode === "nisa" ? "日本株のNISA候補を検索中" : "裏で開始中";
  try {
    const payload = await request("/api/discover", {
      method: "POST",
      body: JSON.stringify({
        mode,
        websiteLimit: clampInput(els.websiteLimit),
        unitSize: valueOrNull(els.settingsUnitSize?.value) || 100,
        unitBudget: valueOrNull(els.settingsUnitBudget?.value) || 300000,
        unitBudgetUnlimited: els.settingsUnitBudgetUnlimited?.checked === true,
      }),
    });
    const added = payload.added || [];
    const resultMode = payload.sourceSummary?.discoveryMode || "general";
    state.suggestions = resultMode === mode ? sanitizeDiscoverySuggestions(payload.suggestions || []) : [];
    state.excludedCandidates = payload.excludedCandidates || state.excludedCandidates;
    state.sourceSummary = resultMode === mode
      ? payload.sourceSummary
      : { ...(payload.sourceSummary || {}), discoveryMode: mode, searchCount: 0 };
    state.candidatePerformance = payload.candidatePerformance || payload.sourceSummary?.performance || state.candidatePerformance;
    state.discoveryJob = payload.job || null;
    state.discoveryGeneratedAt = payload.generatedAt || "";
    state.successfulCandidates = payload.successfulCandidates || state.successfulCandidates;
    state.underperformingCandidates = payload.underperformingCandidates || state.underperformingCandidates;
    state.underperformingCandidateCount = payload.underperformingCandidateCount ?? state.underperformingCandidateCount;
    state.stocks = payload.stocks || state.stocks;
    if (!state.selected && state.stocks.length) state.selected = state.stocks[0].symbol;
    if (added.length) toast(`${added.map((item) => item.name).join("、")}を追加しました。`);
    else toast(payload.message || "候補検索を裏で開始しました。");
    renderDiscoveryJob();
    renderTable();
    renderCandidateList();
    renderSectorEvidence();
    if (payload.job?.running && payload.job.mode && payload.job.mode !== mode) {
      els.candidateProgress.textContent = `${payload.job.mode === "nisa" ? "NISA候補" : "通常候補"}の検索が進行中です。完了後にもう一度検索してください。`;
    } else if (payload.job?.running) {
      void pollDiscoveryJob();
    }
  } catch (error) {
    toast(error.message);
    els.candidateProgress.textContent = "失敗";
  } finally {
    for (const button of [els.discoverButton, els.discoverNisaButton].filter(Boolean)) button.disabled = false;
  }
}

async function pollDiscoveryJob() {
  for (let i = 0; i < 720; i += 1) {
    const payload = await request("/api/discovery").catch(() => null);
    if (!payload) return;
    const requestedMode = state.discoveryMode || "general";
    const jobMode = payload.job?.mode || "general";
    const resultMode = payload.sourceSummary?.discoveryMode || "general";
    if (jobMode !== requestedMode) {
      state.discoveryJob = payload.job || state.discoveryJob;
      els.candidateProgress.textContent = `${jobMode === "nisa" ? "NISA候補" : "通常候補"}の検索が進行中です。完了後にもう一度検索してください。`;
      renderCandidateList();
      return;
    }
    if (resultMode === requestedMode) {
      state.suggestions = sanitizeDiscoverySuggestions(payload.suggestions || state.suggestions);
      state.sourceSummary = payload.sourceSummary || state.sourceSummary;
      state.discoveryGeneratedAt = payload.generatedAt || state.discoveryGeneratedAt;
    }
    state.successfulCandidates = payload.successfulCandidates || state.successfulCandidates;
    state.underperformingCandidates = payload.underperformingCandidates || state.underperformingCandidates;
    state.underperformingCandidateCount = payload.underperformingCandidateCount ?? state.underperformingCandidateCount;
    state.excludedCandidates = payload.excludedCandidates || state.excludedCandidates;
    state.candidatePerformance = payload.candidatePerformance || payload.sourceSummary?.performance || state.candidatePerformance;
    state.discoveryJob = payload.job || state.discoveryJob;
    renderDiscoveryJob();
    renderCandidateList();
    if (!state.discoveryJob?.running) return;
    await sleep(5000);
  }
}

function renderDiscoveryJob() {
  if (!els.candidateProgress) return;
  const job = state.discoveryJob;
  if (job?.running) {
    const total = Number(job.total || 0);
    const checked = Number(job.checked || 0);
    const searched = Number(job.searched || 0);
    const countText = total ? `${Math.min(total, checked + searched)}/${total}` : "";
    els.candidateProgress.textContent = `${job.phase || "進行中"} ${countText}`.trim();
    return;
  }
  if (job?.error) {
    if (/searchCandidates is not defined/.test(job.error || "") && state.sourceSummary?.settingsChanged) {
      els.candidateProgress.textContent = "候補を検索してください";
      return;
    }
    els.candidateProgress.textContent = `失敗: ${job.error}`;
    return;
  }
  if (state.discoveryGeneratedAt) {
    els.candidateProgress.textContent = "保存済み候補";
    return;
  }
  els.candidateProgress.textContent = "未検索";
}

async function runDiagnostics() {
  if (!els.diagnosticsButton) return;
  els.diagnosticsButton.disabled = true;
  if (els.diagnosticsStatus) els.diagnosticsStatus.textContent = "確認中";
  try {
    const payload = await request("/api/search-diagnostics");
    state.diagnostics = payload;
    renderDiagnostics();
  } catch (error) {
    if (els.diagnosticsStatus) els.diagnosticsStatus.textContent = "失敗";
    if (els.diagnosticsList) els.diagnosticsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  } finally {
    els.diagnosticsButton.disabled = false;
  }
}

async function testNotification() {
  if (!els.testNotificationButton) return;
  els.testNotificationButton.disabled = true;
  try {
    await request("/api/test-notification", { method: "POST" });
    toast("Teamsへテスト通知を送信しました。");
  } catch (error) {
    toast(error.message);
  } finally {
    els.testNotificationButton.disabled = false;
  }
}

async function checkDisclosures() {
  if (!els.disclosureCheckButton) return;
  const originalText = els.disclosureCheckButton.textContent;
  els.disclosureCheckButton.disabled = true;
  els.disclosureCheckButton.textContent = "確認中";
  if (els.settingsDisclosureStatus) els.settingsDisclosureStatus.textContent = "確認中";
  try {
    const payload = await request("/api/disclosures/check", {
      method: "POST",
      body: JSON.stringify({ notify: true }),
    });
    const count = payload.important?.length || 0;
    if (els.settingsDisclosureStatus) {
      setStatus(els.settingsDisclosureStatus, true, `確認済み ${count}件`);
    }
    toast(count ? `重大開示 ${count}件を確認しました。` : "通知対象の重大開示はありません。");
  } catch (error) {
    if (els.settingsDisclosureStatus) setStatus(els.settingsDisclosureStatus, false, "失敗");
    toast(error.message);
  } finally {
    els.disclosureCheckButton.disabled = false;
    els.disclosureCheckButton.textContent = originalText;
  }
}

async function checkShareholders() {
  if (!els.shareholderCheckButton) return;
  const originalText = els.shareholderCheckButton.textContent;
  els.shareholderCheckButton.disabled = true;
  els.shareholderCheckButton.textContent = "確認中";
  if (els.settingsShareholderStatus) els.settingsShareholderStatus.textContent = "確認中";
  try {
    const payload = await request("/api/shareholders/check", {
      method: "POST",
      body: JSON.stringify({ notify: true }),
    });
    const changedCount = payload.changed?.length || 0;
    if (els.settingsShareholderStatus) {
      setStatus(els.settingsShareholderStatus, true, `確認済み ${changedCount}件`);
    }
    await Promise.all([loadAnalysisCache(), loadUsAnalysisCache()]);
    toast(changedCount ? `株主構成の変化 ${changedCount}件を確認しました。` : "通知対象の株主構成変化はありません。");
  } catch (error) {
    if (els.settingsShareholderStatus) setStatus(els.settingsShareholderStatus, false, "失敗");
    toast(error.message);
  } finally {
    els.shareholderCheckButton.disabled = false;
    els.shareholderCheckButton.textContent = originalText;
  }
}

async function checkFinancials() {
  if (!els.financialCheckButton) return;
  const originalText = els.financialCheckButton.textContent;
  els.financialCheckButton.disabled = true;
  els.financialCheckButton.textContent = "確認中";
  if (els.settingsFinancialStatus) els.settingsFinancialStatus.textContent = "確認中";
  try {
    const payload = await request("/api/financials/check", { method: "POST" });
    const count = payload.checkedCount || payload.items?.length || 0;
    const okCount = (payload.items || []).filter((item) => item.status === "ok" || item.status === "partial").length;
    if (els.settingsFinancialStatus) {
      setStatus(els.settingsFinancialStatus, okCount > 0, okCount ? `取得 ${okCount}/${count}` : "未取得");
    }
    await loadAnalysisCache();
    toast(payload.message || (okCount ? `財務情報を${okCount}件更新しました。` : "財務情報を取得できませんでした。"));
  } catch (error) {
    if (els.settingsFinancialStatus) setStatus(els.settingsFinancialStatus, false, "失敗");
    toast(error.message);
  } finally {
    els.financialCheckButton.disabled = false;
    els.financialCheckButton.textContent = originalText;
  }
}

function renderDiagnostics() {
  if (!els.diagnosticsList || !state.diagnostics) return;
  const data = state.diagnostics;
  if (els.diagnosticsStatus) {
    setStatus(els.diagnosticsStatus, data.ok, data.ok ? `検索できます${data.engines ? ` / ${data.engines}` : ""}` : "要確認");
  }
  const checks = (data.checks || []).map((check) => `
    <article class="diagnostics-item">
      <div>
        <strong>${escapeHtml(check.label)}</strong>
        <span class="${check.ok ? "metric-pos" : "metric-neg"}">${check.ok ? `${check.resultCount}件` : "0件"}</span>
      </div>
      <p>${escapeHtml(check.note || "")}</p>
      ${diagnosticExamplesHtml(check.examples || [])}
    </article>
  `).join("");
  const stopped = (data.stopped || []).map((item) => `
    <span>${escapeHtml(item.engine)}: ${escapeHtml(simpleSearchReason(item.reason))}</span>
  `).join("");
  els.diagnosticsList.innerHTML = `
    ${checks || "<p>診断結果がありません。</p>"}
    <div class="diagnostics-stopped">
      <strong>止まっている検索元</strong>
      <div>${stopped || "<span>目立つ停止はありません</span>"}</div>
    </div>
  `;
}

function diagnosticExamplesHtml(examples) {
  if (!examples.length) return "";
  return `
    <div class="diagnostics-examples">
      ${examples.map((item) => `
        <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source || item.title || "結果")}</a>
      `).join("")}
    </div>
  `;
}

function simpleSearchReason(reason = "") {
  const text = String(reason);
  if (/captcha/i.test(text)) return "画像確認で停止";
  if (/timeout/i.test(text)) return "時間切れ";
  if (/too many|429/i.test(text)) return "回数制限";
  if (/http error/i.test(text)) return "接続エラー";
  return text || "停止";
}

function polishJapaneseText(value = "") {
  let text = String(value ?? "");
  const replacements = [
    ["割安放置の根拠があります", "割安に見える材料があります"],
    ["割安放置の根拠", "割安に見える材料"],
    ["買収妙味", "買収対象として見られやすい条件"],
    ["割安放置", "割安のまま見過ごされている"],
    ["PEの中小型狙い", "PEが対象にしやすい中小型株"],
    ["PE狙い", "PE候補"],
    ["PE買収マッチ", "PE候補チェック"],
    ["買収阻害リスク", "買収されにくい要因"],
    ["株主還元・統治余地", "株主還元・経営改善の余地"],
    ["回収倍率は強くない", "買収後に投資回収しやすい水準とは言い切れません"],
    ["資産割安ではない", "純資産と比べた割安感は強くありません"],
    ["大型すぎて買収資金のハードルが高い", "規模が大きく、買収に必要な資金が重くなりやすい"],
    ["小さすぎてPEの手間に見合いにくい", "規模が小さく、PEの案件としては優先されにくい"],
    ["高値づかみ", "高い価格で買ってしまう"],
    ["先回り初動", "早めに入る条件"],
    ["先回り条件", "早めに入る条件"],
    ["決算書からの示唆", "決算書から分かること"],
    ["時価総額50億-500億円", "時価総額50億-3000億円中心"],
    ["時価総額は50億-500億円の範囲", "時価総額は50億-3000億円を中心とする範囲"],
    ["利確", "利益確定"],
  ];
  for (const [from, to] of replacements) {
    text = text.replaceAll(from, to);
  }
  return text;
}

function escapeHtml(value = "") {
  return rawEscapeHtml(polishJapaneseText(value));
}

function rawEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value = "") {
  return rawEscapeHtml(value).replaceAll("`", "&#96;");
}

function linkifyPlainText(value = "") {
  const text = String(value);
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (!urlMatch) return escapeHtml(text);
  const url = urlMatch[0].replace(/[)、。]+$/, "");
  const before = text.slice(0, urlMatch.index);
  const after = text.slice((urlMatch.index || 0) + urlMatch[0].length);
  return `${escapeHtml(before)}<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>${escapeHtml(after)}`;
}

function symbolLinkHtml(symbol = "", target = "jp") {
  const text = String(symbol || "").trim();
  if (!text) return "-";
  const url = yahooSymbolUrl(text, target);
  const label = target === "us" ? "Yahoo Stockで開く" : "Yahoo株で開く";
  return `<a class="symbol-link" data-symbol-link href="${escapeAttr(url)}" target="_blank" rel="noreferrer" title="${escapeAttr(label)}" aria-label="${escapeAttr(`${text}を${label}`)}">${escapeHtml(text)}</a>`;
}

function yahooSymbolUrl(symbol = "", target = "jp") {
  const clean = String(symbol || "").trim().toUpperCase();
  if (target === "us") return `https://finance.yahoo.com/quote/${encodeURIComponent(clean.replace(/\.T$/, ""))}`;
  const yahooSymbol = clean.endsWith(".T") ? clean : `${clean}.T`;
  return `https://finance.yahoo.co.jp/quote/${encodeURIComponent(yahooSymbol)}`;
}

function trendLabel(value) {
  if (value === "UP") return "上向き";
  if (value === "DOWN") return "下向き";
  if (value === "SIDEWAYS") return "横ばい";
  return "-";
}

function signedPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function plainPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function ratioPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function numberText(value) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

function compactNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ja-JP", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function currentGapText(value) {
  if (!Number.isFinite(value)) return "今の株価との比較は未確認です";
  if (value < 0) return `今の株価より${Math.abs(value).toFixed(1)}%安い価格です`;
  if (value > 0) return `今の株価より${value.toFixed(1)}%高い価格です`;
  return "今の株価とほぼ同じ価格です";
}

function rangePositionText(value) {
  if (!Number.isFinite(value)) return "位置がまだ分かりません";
  if (value <= 25) return `かなり安い側、安値から${value.toFixed(0)}%あたり`;
  if (value <= 50) return `安い側、安値から${value.toFixed(0)}%あたり`;
  if (value <= 75) return `中間より少し高い側、安値から${value.toFixed(0)}%あたり`;
  return `高い側、安値から${value.toFixed(0)}%あたり`;
}

function trendGapBadge(value) {
  if (!Number.isFinite(value)) return "-";
  if (value < 0) return `<span class="metric-pos">${Math.abs(value).toFixed(1)}%安い</span>`;
  if (value > 0) return `<span class="${value > 15 ? "metric-neg" : "metric-pos"}">${value.toFixed(1)}%高い</span>`;
  return "同じ";
}

function buyTimingBadge(price = {}) {
  const gap = Number(price.distanceFromBuyLine1y);
  if (!Number.isFinite(gap)) return "-";
  if (price.buyTiming1y === "DEEP") return `<span class="metric-pos">大きく下回る</span>`;
  if (price.buyTiming1y === "UNDER") return `<span class="metric-pos">${Math.abs(gap).toFixed(1)}%安い</span>`;
  if (price.buyTiming1y === "NEAR") return `<span class="metric-pos">近い</span>`;
  if (gap > 18) return `<span class="metric-neg">${gap.toFixed(1)}%高い</span>`;
  return `${gap.toFixed(1)}%高い`;
}

function riskLevelClass(level = "") {
  if (level === "high") return "high";
  if (level === "low") return "low";
  return "medium";
}

function riskLevelText(level = "") {
  if (level === "high") return "要注意";
  if (level === "low") return "良好";
  return "確認";
}

function trendGapText(value) {
  if (!Number.isFinite(value)) return "まだ比べられません";
  if (value < 0) return `${Math.abs(value).toFixed(1)}%安いです`;
  if (value > 0) return `${value.toFixed(1)}%高いです`;
  return "ほぼ同じです";
}

function isHighChaseChart(price = {}) {
  const strongRun = Number.isFinite(price.return3y) && price.return3y >= 100;
  const farFromTrend = Number.isFinite(price.distanceFromTrend3y) && price.distanceFromTrend3y >= 12;
  const farFromLow = Number.isFinite(price.distanceFromLow3y) && price.distanceFromLow3y >= 120;
  const notDeepPullback = !Number.isFinite(price.distanceFromHigh3y) || price.distanceFromHigh3y > -35;
  return (strongRun && notDeepPullback && (farFromTrend || farFromLow)) || isExtendedRunChart(price);
}

function isExtendedRunChart(price = {}) {
  const return3y = price.return3y;
  const return1y = price.return1y;
  const return3m = price.return3m;
  const distanceFromHigh3y = price.distanceFromHigh3y;
  const distanceFromBuyLine1y = price.distanceFromBuyLine1y;
  const deepReset = (Number.isFinite(distanceFromHigh3y) && distanceFromHigh3y <= -45)
    || (Number.isFinite(return1y) && return1y <= -30);
  if (deepReset) return false;
  if (Number.isFinite(return3y) && return3y >= 300) return true;
  if (Number.isFinite(return3y) && return3y >= 220 && Number.isFinite(return3m) && return3m >= 5) return true;
  return Number.isFinite(return3y)
    && return3y >= 180
    && Number.isFinite(distanceFromBuyLine1y)
    && distanceFromBuyLine1y <= 6
    && (!Number.isFinite(return1y) || return1y > -20);
}

function isNoUpsideChart(price = {}) {
  const nearUpperRange = Number.isFinite(price.distanceFromHigh3y) && price.distanceFromHigh3y > -12;
  const notCheapVsTrend = !Number.isFinite(price.distanceFromTrend3y) || price.distanceFromTrend3y > -3;
  const weakLongTrend = price.trend3y !== "UP" || (Number.isFinite(price.annualizedReturn3y) && price.annualizedReturn3y < 5);
  const reboundAlready = Number.isFinite(price.return3m) && price.return3m > 10;
  const shortOverLongNotEnough = Number.isFinite(price.sma50) && Number.isFinite(price.sma200) && price.sma50 <= price.sma200 * 1.03;
  return nearUpperRange && notCheapVsTrend && weakLongTrend && (reboundAlready || shortOverLongNotEnough);
}

function positionMetrics(stock, price = {}) {
  const lots = positionLots(stock);
  const sales = saleLots(stock);
  const lotState = positionLotState(lots, sales);
  const grossQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const grossInvested = lots.reduce((sum, lot) => sum + (lot.purchasePrice * lot.quantity), 0);
  const soldQuantity = lotState.soldQuantity;
  const remainingQuantity = lotState.remainingQuantity;
  const remainingInvested = remainingQuantity > 0 ? lotState.remainingInvested : null;
  const purchasePrice = remainingQuantity && remainingInvested
    ? remainingInvested / remainingQuantity
    : grossQuantity > 0 ? grossInvested / grossQuantity : null;
  const realizedProceeds = lotState.realizedProceeds || null;
  const realizedCost = lotState.realizedCost || 0;
  const averageSellPrice = soldQuantity > 0 ? lotState.realizedProceeds / soldQuantity : null;
  const realizedPnlAmount = Number.isFinite(realizedProceeds) && realizedProceeds
    ? realizedProceeds - realizedCost
    : soldQuantity && purchasePrice ? -realizedCost : null;
  const current = finiteOrNull(price?.current);
  const firstPurchaseDate = lotState.remainingLots[0]?.purchaseDate || lots[0]?.purchaseDate || "";
  const holdingDays = firstPurchaseDate ? daysSince(firstPurchaseDate) : null;
  const unrealizedPnlAmount = purchasePrice && current && remainingQuantity ? (current - purchasePrice) * remainingQuantity : null;
  const unrealizedPnlPct = purchasePrice && current && remainingQuantity ? ((current - purchasePrice) / purchasePrice) * 100 : null;
  const pnlParts = [realizedPnlAmount, unrealizedPnlAmount].filter(Number.isFinite);
  const pnlAmount = pnlParts.length ? pnlParts.reduce((sum, value) => sum + value, 0) : null;
  const pnlPct = grossInvested && Number.isFinite(pnlAmount) ? (pnlAmount / grossInvested) * 100 : null;
  const marketValue = current && remainingQuantity ? current * remainingQuantity : null;
  const dividendReceived = dividendsForPositionHistory(lots, sales, price?.dividendEvents || [], {
    symbol: stock.symbol,
    market: stock.market,
  });
  const annualPerShare = annualDividendPerShare(price);
  const annualDividendEstimate = annualPerShare && remainingQuantity
    ? annualPerShare * remainingQuantity
    : null;
  const totalReturnAmount = Number.isFinite(pnlAmount)
    ? pnlAmount + (Number.isFinite(dividendReceived) ? dividendReceived : 0)
    : null;
  const totalReturnPct = grossInvested && Number.isFinite(totalReturnAmount) ? (totalReturnAmount / grossInvested) * 100 : null;
  const minimumHoldQuantity = finiteOrZero(stock.minimumHoldQuantity);
  const sellableQuantity = Math.max(0, remainingQuantity - minimumHoldQuantity);
  return {
    lots,
    sales,
    remainingLots: lotState.remainingLots,
    unmatchedSaleQuantity: lotState.unmatchedSaleQuantity,
    purchasePrice,
    quantity: remainingQuantity || null,
    grossQuantity: grossQuantity || null,
    soldQuantity: soldQuantity || null,
    current,
    holdingDays,
    pnlPct,
    pnlAmount,
    realizedPnlAmount,
    unrealizedPnlAmount,
    unrealizedPnlPct,
    realizedProceeds: realizedProceeds || null,
    averageSellPrice,
    invested: remainingInvested || null,
    grossInvested: grossInvested || null,
    marketValue,
    firstPurchaseDate,
    dividendReceived,
    annualDividendEstimate,
    totalReturnAmount,
    totalReturnPct,
    minimumHoldQuantity,
    sellableQuantity,
  };
}

function positionLotState(positions = [], sales = []) {
  const remainingLots = positions.map((lot) => ({ ...lot }));
  let soldQuantity = 0;
  let realizedCost = 0;
  let realizedProceeds = 0;
  let unmatchedSaleQuantity = 0;

  for (const sale of sales) {
    let saleLeft = sale.quantity;
    for (const lot of remainingLots) {
      if (saleLeft <= 0) break;
      if (sale.sellDate && lot.purchaseDate && lot.purchaseDate > sale.sellDate) continue;
      if (!lot.quantity) continue;
      const take = Math.min(lot.quantity, saleLeft);
      lot.quantity = Math.max(0, lot.quantity - take);
      soldQuantity += take;
      saleLeft -= take;
      realizedCost += take * lot.purchasePrice;
      realizedProceeds += take * sale.sellPrice;
    }
    unmatchedSaleQuantity += saleLeft;
  }

  const openLots = remainingLots
    .filter((lot) => lot.quantity > 0.000001)
    .map((lot) => ({ ...lot, quantity: Math.round(lot.quantity * 1000000) / 1000000 }));
  const remainingQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const remainingInvested = openLots.reduce((sum, lot) => sum + (lot.purchasePrice * lot.quantity), 0);
  return {
    remainingLots: openLots,
    soldQuantity: Math.round(soldQuantity * 1000000) / 1000000,
    remainingQuantity: Math.round(remainingQuantity * 1000000) / 1000000,
    remainingInvested,
    realizedCost,
    realizedProceeds,
    unmatchedSaleQuantity: Math.round(unmatchedSaleQuantity * 1000000) / 1000000,
  };
}

function dividendsForPositionHistory(lots, sales, dividendEvents = [], context = {}) {
  const market = dividendMarket(context);
  return dividendEvents.reduce((sum, event) => {
    const entitlement = dividendEntitlementEvent(event, market);
    if (!entitlement) return sum;
    const cutoffTime = dividendDateTime(entitlement.cutoffDate);
    const amount = Number(entitlement.amount);
    if (!Number.isFinite(cutoffTime) || !Number.isFinite(amount)) return sum;
    const bought = lots.reduce((qty, lot) => {
      const time = dividendDateTime(lot.purchaseDate) ?? -Infinity;
      return Number.isFinite(time) && time <= cutoffTime ? qty + lot.quantity : qty;
    }, 0);
    const sold = sales.reduce((qty, lot) => {
      const time = dividendDateTime(lot.sellDate) ?? Infinity;
      return Number.isFinite(time) && time <= cutoffTime ? qty + lot.quantity : qty;
    }, 0);
    return sum + (Math.max(0, bought - sold) * amount);
  }, 0);
}

function dividendEntitlementEvent(event = {}, market = "JP") {
  const amount = Number(event.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const eventDate = dividendDate(event.date);
  const explicitExDate = dividendDate(event.exDividendDate || event.exDate);
  const recordDate = dividendDate(event.recordDate);
  const role = String(event.dateRole || event.role || "").toLowerCase();
  const isJapan = market === "JP";

  if (recordDate || role.includes("record")) {
    const basisDate = recordDate || eventDate;
    if (!basisDate) return null;
    return {
      amount,
      basis: "record_date",
      basisDate,
      cutoffDate: shiftBusinessDays(basisDate, isJapan ? -2 : -1),
    };
  }

  if (!explicitExDate && isJapan && eventDate && isCalendarMonthEnd(eventDate)) {
    return {
      amount,
      basis: "estimated_record_date",
      basisDate: eventDate,
      cutoffDate: shiftBusinessDays(eventDate, -2),
    };
  }

  const exDate = explicitExDate || eventDate;
  if (!exDate) return null;
  return {
    amount,
    basis: explicitExDate ? "ex_dividend_date" : "event_ex_dividend_date",
    basisDate: exDate,
    cutoffDate: shiftBusinessDays(exDate, -1),
  };
}

function dividendMarket(context = {}) {
  const symbol = String(context.symbol || "").toUpperCase();
  const market = String(context.market || "").toUpperCase();
  if (symbol.endsWith(".T") || market.includes("東") || market === "JP") return "JP";
  return "US";
}

function performanceAnnualizedReturn(series = [], asOfDate = "") {
  const points = series
    .filter((point) => point?.date && Number.isFinite(Number(point.close)) && Number(point.close) > 0 && point.date <= asOfDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = points.at(-1);
  if (!latest) return null;
  const asOf = new Date(`${asOfDate}T00:00:00Z`).getTime();
  const target = asOf - (365 * 86400000);
  const baseline = points.filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() <= target).at(-1);
  if (!baseline) return null;
  const elapsedDays = (new Date(`${latest.date}T00:00:00Z`).getTime() - new Date(`${baseline.date}T00:00:00Z`).getTime()) / 86400000;
  if (elapsedDays < 300) return null;
  return ((Number(latest.close) / Number(baseline.close)) ** (365 / elapsedDays)) - 1;
}

function weeklyPriceGrid(series = [], asOfDate = "", currentPrice = null) {
  const asOfMs = new Date(`${asOfDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(asOfMs)) return { dates: [], prices: [] };
  const points = (series || [])
    .filter((point) => point?.date && point.date <= asOfDate && Number(point.close) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const dates = [];
  const prices = [];
  let index = 0;
  let latest = null;
  for (let week = 0; week <= 52; week += 1) {
    const time = asOfMs - ((52 - week) * 7 * 86400000);
    const date = new Date(time).toISOString().slice(0, 10);
    dates.push(date);
    while (index < points.length && points[index].date <= date) {
      latest = points[index];
      index += 1;
    }
    const ageDays = latest ? (time - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86400000 : Infinity;
    prices.push(ageDays <= 10 ? Number(latest.close) : null);
  }
  if (Number.isFinite(Number(currentPrice)) && Number(currentPrice) > 0) prices[52] = Number(currentPrice);
  return { dates, prices };
}

function calendarYearOffset(date = "", years = 0) {
  const source = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(source.getTime())) return "";
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const day = Math.min(source.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function weeklyReturnStatistics(returns = []) {
  const values = returns.filter(Number.isFinite);
  if (values.length < 26) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length - 1);
  const logReturn = values.reduce((sum, value) => sum + value, 0) * (52 / values.length);
  return {
    observations: values.length,
    annualizedReturnPct: (Math.exp(logReturn) - 1) * 100,
    annualizedVolatilityPct: Math.sqrt(variance * 52) * 100,
  };
}

function seededForecastRandom(seed = "") {
  let state = 2166136261;
  for (const character of String(seed)) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }
  if (!state) state = 1;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function forecastQuantile(values = [], quantile = 0.5) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + ((sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction);
}

function forecastMonthDates(today = "") {
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(todayMs)) return [];
  const dates = [];
  const day = new Date(todayMs).getUTCDate();
  for (let month = 0; month <= 12; month += 1) {
    const date = new Date(todayMs);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + month);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    dates.push(month === 0 ? today : date.toISOString().slice(0, 10));
  }
  return dates;
}

function bootstrapForecast(returnVectors = [], currentValues = [], baselineValue = 0, annualDividend = 0, dates = [], seed = "") {
  const rows = returnVectors.filter((row) => Array.isArray(row)
    && row.length === currentValues.length && row.every(Number.isFinite));
  if (rows.length < 26 || !currentValues.length || dates.length !== 13) return [];
  const random = seededForecastRandom(seed);
  const samples = dates.map(() => []);
  const pathCount = 1000;
  const blockWeeks = 4;
  const blockStarts = rows.length - blockWeeks + 1;
  const dateTimes = dates.map((date) => new Date(`${date}T00:00:00Z`).getTime());

  // Resampling the same four-week blocks for every holding retains short-term clustering and co-movement.
  for (let path = 0; path < pathCount; path += 1) {
    const multipliers = currentValues.map(() => 1);
    let week = 0;
    let blockStart = 0;
    for (let month = 0; month <= 12; month += 1) {
      const targetWeek = Math.round((month * 52) / 12);
      while (week < targetWeek) {
        if (week % blockWeeks === 0) blockStart = Math.floor(random() * blockStarts);
        const returns = rows[blockStart + (week % blockWeeks)];
        for (let holding = 0; holding < multipliers.length; holding += 1) {
          multipliers[holding] *= Math.exp(returns[holding]);
        }
        week += 1;
      }
      const marketValue = currentValues.reduce((sum, amount, holding) => sum + (amount * multipliers[holding]), 0);
      const years = Math.max(0, dateTimes[month] - dateTimes[0]) / (365 * 86400000);
      samples[month].push(baselineValue + marketValue + (annualDividend * years));
    }
  }

  return dates.map((date, index) => ({
    date,
    low: forecastQuantile(samples[index], 0.1),
    value: forecastQuantile(samples[index], 0.5),
    high: forecastQuantile(samples[index], 0.9),
    pathCount,
  }));
}

function portfolioPerformanceTimeline(stocks = [], analyses = {}, nowValue = new Date()) {
  const now = new Date(nowValue);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = new Date(todayMs).toISOString().slice(0, 10);
  const startDate = calendarYearOffset(today, -1);
  const endDate = calendarYearOffset(today, 1);
  const entries = stocks.map((stock) => ({ stock, analysis: analyses[stock.symbol], price: analyses[stock.symbol]?.price || {} }))
    .filter(({ stock }) => positionLots(stock).length || saleLots(stock).length);
  const actualDates = [];
  for (let time = new Date(`${startDate}T00:00:00Z`).getTime(); time < todayMs; time += 7 * 86400000) {
    actualDates.push(new Date(time).toISOString().slice(0, 10));
  }
  actualDates.push(today);

  const actual = actualDates.map((date) => {
    let total = 0;
    let incomplete = false;
    for (const { stock, price } of entries) {
      const allLots = positionLots(stock);
      const allSales = saleLots(stock);
      const current = date === today;
      const lots = current ? allLots : allLots.filter((lot) => lot.purchaseDate && lot.purchaseDate <= date);
      const sales = current ? allSales : allSales.filter((sale) => sale.sellDate && sale.sellDate <= date);
      if (!lots.length && !sales.length) continue;
      const historicalPrice = current
        ? Number(price.current) > 0 ? Number(price.current) : null
        : (price.series || []).filter((point) => point.date <= date).at(-1)?.close || null;
      const lotState = positionLotState(lots, sales);
      if (lotState.remainingQuantity > 0 && !(Number(historicalPrice) > 0)) {
        incomplete = true;
        continue;
      }
      const events = (price.dividendEvents || []).filter((event) => event.date <= date);
      const metrics = positionMetrics(
        { ...stock, positions: lots, sales },
        { ...price, current: historicalPrice, dividendEvents: events },
      );
      if (Number.isFinite(metrics.totalReturnAmount)) total += metrics.totalReturnAmount;
      else if (lots.length || sales.length) incomplete = true;
    }
    return { date, value: incomplete ? null : total };
  });

  let currentTotal = 0;
  let currentIncomplete = false;
  let annualDividend = 0;
  const forecastStocks = [];
  for (const { stock, price } of entries) {
    const currentPrice = Number(price.current) > 0
      ? Number(price.current)
      : (price.series || []).at(-1)?.close || null;
    const metrics = positionMetrics(stock, { ...price, current: currentPrice });
    if (Number.isFinite(metrics.totalReturnAmount)) currentTotal += metrics.totalReturnAmount;
    else currentIncomplete = true;
    const quantity = Number(metrics.quantity) || 0;
    const annualPerShare = annualDividendPerShare(price) || 0;
    const dividend = annualPerShare * quantity;
    annualDividend += dividend;
    const grid = quantity > 0 && currentPrice > 0
      ? weeklyPriceGrid(price.series || [], today, currentPrice)
      : null;
    forecastStocks.push({ currentPrice, quantity, dividend, weeklyPrices: grid?.prices || [] });
  }
  const activeStocks = forecastStocks.filter((item) => item.quantity > 0 && item.currentPrice > 0);
  const eligibleStocks = activeStocks.filter((item) => item.weeklyPrices.filter(Number.isFinite).length >= 45);
  const returnVectors = [];
  const portfolioReturns = [];
  for (let week = 1; week <= 52; week += 1) {
    const vector = [];
    let previousValue = 0;
    let currentValue = 0;
    for (const item of eligibleStocks) {
      const previousPrice = item.weeklyPrices[week - 1];
      const weekPrice = item.weeklyPrices[week];
      if (!(previousPrice > 0) || !(weekPrice > 0)) {
        vector.length = 0;
        break;
      }
      vector.push(Math.log(weekPrice / previousPrice));
      previousValue += previousPrice * item.quantity;
      currentValue += weekPrice * item.quantity;
    }
    if (vector.length === eligibleStocks.length && vector.length) {
      returnVectors.push(vector);
      portfolioReturns.push(Math.log(currentValue / previousValue));
    }
  }
  const modelReady = eligibleStocks.length > 0 && returnVectors.length >= 26;
  const modeledValues = modelReady ? eligibleStocks.map((item) => item.currentPrice * item.quantity) : [];
  const modeledMarketValue = modeledValues.reduce((sum, value) => sum + value, 0);
  const stats = modelReady ? weeklyReturnStatistics(portfolioReturns) : null;
  const rateUnavailableCount = activeStocks.length - (modelReady ? eligibleStocks.length : 0);
  const forecast = currentIncomplete
    ? []
    : activeStocks.length
      ? modelReady
        ? bootstrapForecast(
          returnVectors,
          modeledValues,
          currentTotal - modeledMarketValue,
          annualDividend,
          forecastMonthDates(today),
          `portfolio:${stocks.map((stock) => stock.symbol).sort().join(",")}:${today}`,
        )
        : []
      : entries.length
        ? forecastMonthDates(today).map((date) => ({ date, value: currentTotal, low: currentTotal, high: currentTotal, pathCount: 0 }))
        : [];
  const forecastEnd = forecast.at(-1);

  return {
    startDate,
    today,
    endDate,
    actual,
    forecast,
    currentTotal: currentIncomplete ? null : currentTotal,
    forecastTotal: currentIncomplete ? null : forecastEnd?.value ?? null,
    forecastLow: currentIncomplete ? null : forecastEnd?.low ?? null,
    forecastHigh: currentIncomplete ? null : forecastEnd?.high ?? null,
    annualDividend,
    rateUnavailableCount,
    annualizedReturnPct: stats?.annualizedReturnPct ?? null,
    annualizedVolatilityPct: stats?.annualizedVolatilityPct ?? null,
    stockCount: entries.length,
  };
}

function stockForecastChartHtml(symbol, market = "jp") {
  const title = `${market === "us" ? "米国株" : "日本株"} ${symbol}の株価推移`;
  return `
    <section class="stock-forecast" data-stock-forecast data-forecast-symbol="${escapeAttr(symbol)}" data-forecast-market="${market}">
      <div class="stock-forecast-heading"><strong>株価推移・1年後の変動幅</strong><span>中央値 / 10〜90%参考幅・配当別</span></div>
      <div class="stock-forecast-chart-wrap"><canvas data-stock-forecast-chart role="img" aria-label="${escapeAttr(title)}"></canvas></div>
      <p class="stock-forecast-note" data-forecast-note>価格履歴を読み込み中</p>
    </section>
  `;
}

function renderStockForecastCharts(root) {
  if (!root) return;
  const charts = [...root.querySelectorAll("[data-stock-forecast-chart]")];
  if (typeof IntersectionObserver === "function") {
    if (!forecastChartObserver) {
      forecastChartObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          forecastChartObserver.unobserve(entry.target);
          void loadStockForecastChart(entry.target);
        });
      }, { rootMargin: "160px 0px" });
    }
    charts.forEach((canvas) => {
      if (canvas.dataset.forecastReady !== "true" && canvas.dataset.forecastObserved !== "true") {
        canvas.dataset.forecastObserved = "true";
        forecastChartObserver.observe(canvas);
      }
    });
    return;
  }
  charts.forEach((canvas) => void loadStockForecastChart(canvas));
}

function redrawVisibleStockForecastCharts(root) {
  root?.querySelectorAll("[data-stock-forecast-chart]").forEach((canvas) => {
    if (canvas.dataset.forecastReady !== "true" || !canvas.getClientRects().length) return;
    canvas.dataset.forecastReady = "false";
    void loadStockForecastChart(canvas);
  });
}

async function loadStockForecastChart(canvas) {
  if (!canvas || canvas.dataset.forecastReady === "true") return;
  canvas.dataset.forecastReady = "true";
  const shell = canvas.closest("[data-stock-forecast]");
  const symbol = shell?.dataset.forecastSymbol || "";
  const market = shell?.dataset.forecastMarket || "jp";
  const note = shell?.querySelector("[data-forecast-note]");
  const currency = market === "us" ? "USD" : "JPY";
  const analysis = market === "us" ? state.usAnalyses[symbol] : state.analyses[symbol];
  const candidate = state.suggestions.find((item) => item.symbol === symbol && candidateTarget(item) === market);
  const price = analysis?.price || candidate?.price || {};
  let series = Array.isArray(price.series) ? price.series : [];
  const cacheKey = `${market}:${symbol}`;
  if (series.length < 2) {
    if (forecastSeriesCache.has(cacheKey)) {
      series = forecastSeriesCache.get(cacheKey);
    } else {
      try {
        let requestTask = forecastSeriesRequests.get(cacheKey);
        if (!requestTask) {
          requestTask = request(`/api/price-series?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbol)}`);
          forecastSeriesRequests.set(cacheKey, requestTask);
        }
        const result = await requestTask;
        forecastSeriesRequests.delete(cacheKey);
        series = Array.isArray(result.series) ? result.series : [];
        forecastSeriesCache.set(cacheKey, series);
        price.current = result.current || price.current;
      } catch {
        forecastSeriesRequests.delete(cacheKey);
        canvas.dataset.forecastReady = "false";
        if (note) note.textContent = "価格履歴を取得できませんでした。時間をおいて再表示してください。";
        return;
      }
    }
  }
  const current = Number(price.current) > 0 ? Number(price.current) : Number(series.at(-1)?.close);
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = new Date(todayMs).toISOString().slice(0, 10);
  const startDate = calendarYearOffset(today, -1);
  const endDate = calendarYearOffset(today, 1);
  const actual = series
    .filter((point) => point.date >= startDate && point.date <= today && Number(point.close) > 0)
    .map((point) => ({ date: point.date, value: Number(point.close) }));
  if (current > 0 && actual.at(-1)?.date !== today) actual.push({ date: today, value: current });
  const grid = weeklyPriceGrid(series, today, current);
  const weeklyReturns = [];
  for (let week = 1; week < grid.prices.length; week += 1) {
    const previous = grid.prices[week - 1];
    const next = grid.prices[week];
    if (previous > 0 && next > 0) weeklyReturns.push([Math.log(next / previous)]);
  }
  const stats = weeklyReturnStatistics(weeklyReturns.map((row) => row[0]));
  const forecast = current > 0 && stats
    ? bootstrapForecast(weeklyReturns, [current], 0, 0, forecastMonthDates(today), `${market}:${symbol}:${today}`)
    : [];
  drawDatedLineChart(canvas, actual, forecast, {
    currency,
    startDate,
    today,
    endDate,
    includeZero: false,
  });
  if (note) {
    const yearEnd = forecast.at(-1);
    note.textContent = !stats || !yearEnd
      ? "過去1年の価格履歴が不足しているため、変動幅を試算できません。"
      : `過去1年 ${stats.annualizedReturnPct >= 0 ? "+" : ""}${stats.annualizedReturnPct.toFixed(1)}% / 年率変動率 ${stats.annualizedVolatilityPct.toFixed(1)}% / 1年後参考幅 ${moneyByCurrency(yearEnd.low, currency)}〜${moneyByCurrency(yearEnd.high, currency)}（週次変動の4週ブロック再抽出・1,000経路）`;
  }
}

function drawDatedLineChart(canvas, actual = [], forecast = [], options = {}) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(280, Math.floor(rect.width || canvas.parentElement?.clientWidth || 600));
  const height = Math.max(180, Math.floor(rect.height || 250));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const startMs = new Date(`${options.startDate}T00:00:00Z`).getTime();
  const todayMs = new Date(`${options.today}T00:00:00Z`).getTime();
  const endMs = new Date(`${options.endDate}T00:00:00Z`).getTime();
  const inRange = (items) => items.filter((point) => Number.isFinite(point.value)
    && point.date >= options.startDate && point.date <= options.endDate);
  const actualPoints = inRange(actual);
  const forecastPoints = inRange(forecast);
  const values = [
    ...actualPoints.map((point) => point.value),
    ...forecastPoints.flatMap((point) => [point.low, point.value, point.high]),
  ].filter(Number.isFinite);
  if (options.includeZero) values.push(0);
  if (!values.length) {
    context.fillStyle = "#667277";
    context.font = "13px system-ui";
    context.fillText("損益・価格データがありません", 18, 32);
    return;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(Math.abs(high) * 0.08, 1);
  const min = low - (spread * 0.1);
  const max = high + (spread * 0.1);
  const pad = { top: 18, right: 18, bottom: 30, left: 92 };
  const plotWidth = Math.max(20, width - pad.left - pad.right);
  const plotHeight = Math.max(20, height - pad.top - pad.bottom);
  const x = (date) => pad.left + ((new Date(`${date}T00:00:00Z`).getTime() - startMs) / (endMs - startMs)) * plotWidth;
  const y = (value) => pad.top + ((max - value) / (max - min)) * plotHeight;
  const formatter = new Intl.NumberFormat(options.currency === "USD" ? "en-US" : "ja-JP", {
    style: "currency",
    currency: options.currency || "JPY",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  context.font = "11px system-ui";
  context.textAlign = "right";
  for (let index = 0; index <= 4; index += 1) {
    const value = max - ((max - min) * index / 4);
    const py = y(value);
    context.strokeStyle = options.includeZero && Math.abs(value) < spread / 10 ? "#c0ccd0" : "#e5eaec";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(pad.left, py);
    context.lineTo(width - pad.right, py);
    context.stroke();
    context.fillStyle = "#667277";
    context.fillText(formatter.format(value), pad.left - 8, py + 4);
  }
  const bandPoints = forecastPoints.filter((point) => Number.isFinite(point.low) && Number.isFinite(point.high));
  if (bandPoints.length > 1) {
    context.beginPath();
    bandPoints.forEach((point, index) => {
      const px = x(point.date);
      const py = y(point.high);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    [...bandPoints].reverse().forEach((point) => context.lineTo(x(point.date), y(point.low)));
    context.closePath();
    context.fillStyle = "rgba(189, 105, 39, 0.14)";
    context.fill();
  }
  const todayX = x(options.today);
  context.strokeStyle = "#155c9a";
  context.setLineDash([3, 4]);
  context.beginPath();
  context.moveTo(todayX, pad.top);
  context.lineTo(todayX, height - pad.bottom);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "#155c9a";
  context.textAlign = "center";
  context.fillText("今日", todayX, pad.top + 11);

  const drawLine = (points, color, dashed) => {
    context.strokeStyle = color;
    context.lineWidth = 2.4;
    context.setLineDash(dashed ? [5, 5] : []);
    context.beginPath();
    let started = false;
    points.forEach((point) => {
      if (!Number.isFinite(point.value)) {
        started = false;
        return;
      }
      if (!started) {
        context.moveTo(x(point.date), y(point.value));
        started = true;
      } else {
        context.lineTo(x(point.date), y(point.value));
      }
    });
    context.stroke();
    context.setLineDash([]);
  };
  drawLine(actualPoints, "#0b6b58", false);
  drawLine(forecastPoints, "#bd6927", true);
  const tickDates = [startMs, startMs + (endMs - startMs) * 0.25, todayMs, startMs + (endMs - startMs) * 0.75, endMs];
  context.fillStyle = "#667277";
  context.textAlign = "center";
  tickDates.forEach((time) => {
    const date = new Date(time);
    const label = `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
    context.fillText(label, pad.left + ((time - startMs) / (endMs - startMs)) * plotWidth, height - 8);
  });
}

function dividendDate(value = "") {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : text;
}

function dividendDateTime(value = "") {
  const ymd = dividendDate(value);
  if (!ymd) return null;
  const time = new Date(`${ymd}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : null;
}

function shiftBusinessDays(value = "", offset = 0) {
  const ymd = dividendDate(value);
  if (!ymd) return "";
  const date = new Date(`${ymd}T00:00:00Z`);
  const direction = offset >= 0 ? 1 : -1;
  let remaining = Math.abs(offset);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function isCalendarMonthEnd(value = "") {
  const ymd = dividendDate(value);
  if (!ymd) return false;
  const date = new Date(`${ymd}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return date.getUTCDate() === lastDay;
}

function positionPnl(position, compact = false) {
  const amount = Number.isFinite(position.totalReturnAmount) ? position.totalReturnAmount : position.pnlAmount;
  const ratio = Number.isFinite(position.totalReturnPct) ? position.totalReturnPct : position.pnlPct;
  if (!Number.isFinite(ratio) && !Number.isFinite(amount)) return "-";
  const main = Number.isFinite(amount)
    ? `<span class="pnl-main ${amount >= 0 ? "metric-pos" : "metric-neg"}">${yen(amount)}</span>`
    : pct(ratio);
  const sub = compact
    ? Number.isFinite(ratio) ? `<small>${signedPct(ratio)}</small>` : ""
    : `${Number.isFinite(ratio) ? `<small>${signedPct(ratio)}</small>` : ""}${position.dividendReceived > 0 ? `<small>配当 ${yen(position.dividendReceived)}</small>` : ""}`;
  return `<span class="pnl-cell">${main}${sub}</span>`;
}

function positionEditor(stock, position, analysis) {
  const metrics = position || positionMetrics(stock);
  const lots = metrics.lots.length ? metrics.lots : [{ purchaseDate: "", purchasePrice: null, quantity: null }];
  const sales = metrics.sales?.length ? metrics.sales : saleLots(stock);
  const displaySales = sales.length ? sales : [{ sellDate: "", sellPrice: null, quantity: null }];
  const entry = effectiveEntryValue(stock, analysis?.price || {}, analysis?.entryValue);
  return `
    <form id="positionForm" class="position-form">
      <div class="position-form-title">
        <strong>保有・売却情報</strong>
        <label class="checkbox-line">
          <input name="holding" type="checkbox" ${stock.holding ? "checked" : ""}>
          <span>保有中</span>
        </label>
      </div>
      <div class="position-lots" aria-label="購入明細">
        <div class="lot-section-title buy">購入明細</div>
        <div class="lot-head has-account">
          <span>購入日</span>
          <span>口座</span>
          <span>購入単価</span>
          <span>株数</span>
          <span></span>
        </div>
        <div class="lot-list">
        ${lots.map((lot) => lotRow(lot, { accountType: true })).join("")}
        </div>
        <button type="button" class="secondary add-lot" data-add-lot>明細を追加</button>
      </div>
      <div class="position-lots sale-lots" aria-label="売却明細">
        <div class="lot-section-title">売却明細</div>
        <div class="lot-head">
          <span>売却日</span>
          <span>売却単価</span>
          <span>株数</span>
          <span></span>
        </div>
        <div class="sale-list">
        ${displaySales.map((lot) => saleRow(lot)).join("")}
        </div>
        <button type="button" class="secondary add-lot" data-add-sale>売却明細を追加</button>
      </div>
      <div class="entry-value">
        <label>
          <span>買いたい価格</span>
          <input name="targetBuyPrice" type="number" min="0" step="0.1" value="${numberValue(stock.targetBuyPrice)}" placeholder="例: 2500">
        </label>
        <label>
          <span>必ず残す株数</span>
          <input name="minimumHoldQuantity" type="number" min="0" step="1" value="${numberValue(metrics.minimumHoldQuantity)}" placeholder="例: 100">
        </label>
        ${entryValueHtml(entry)}
      </div>
      <div class="position-stats">
        <span><strong>平均取得</strong>${yen(metrics.purchasePrice)}</span>
        <span><strong>平均売却</strong>${yen(metrics.averageSellPrice)}</span>
        <span><strong>残株数</strong>${shareCount(metrics.quantity)}</span>
        <span><strong>売却済み</strong>${shareCount(metrics.soldQuantity)}</span>
        <span><strong>配当込み損益</strong>${positionPnl(metrics)}</span>
        <span><strong>確定損益</strong>${yen(metrics.realizedPnlAmount)}</span>
        <span><strong>含み損益</strong>${yen(metrics.unrealizedPnlAmount)}</span>
        <span><strong>残り元本</strong>${yen(metrics.invested)}</span>
        <span><strong>評価額</strong>${yen(metrics.marketValue)}</span>
        <span><strong>1株配当</strong>${dividendPerShareText(analysis?.price || {}, metrics, yen)}</span>
        <span><strong>年間配当目安</strong>${yen(metrics.annualDividendEstimate)}</span>
        <span><strong>配当時期</strong>${escapeHtml(dividendTimingDetail(analysis?.price || {}, yen))}</span>
        <span><strong>残す株数</strong>${metrics.minimumHoldQuantity ? `${metrics.minimumHoldQuantity.toLocaleString("ja-JP")}株` : "-"}</span>
        <span><strong>判定対象</strong>${metrics.sellableQuantity ? `${metrics.sellableQuantity.toLocaleString("ja-JP")}株` : "-"}</span>
      </div>
      ${metrics.unmatchedSaleQuantity > 0 ? `<p class="unmatched-sale-warning">売却明細のうち${shareCount(metrics.unmatchedSaleQuantity)}は購入明細に割り当てられていません。購入明細の日付・株数を確認してください。</p>` : ""}
      ${priceReservationEditor(stock, yen, "予約価格")}
      ${jpAccountRecommendationHtml(stock, analysis, metrics)}
      <button type="submit">保存</button>
    </form>
  `;
}

function attachPositionForm(symbol) {
  const form = document.getElementById("positionForm");
  if (!form) return;
  attachDetailFormEditGuard(form);
  form.querySelector("[data-add-lot]")?.addEventListener("click", () => {
    const list = form.querySelector(".lot-list");
    list.insertAdjacentHTML("beforeend", lotRow({ purchaseDate: "", purchasePrice: null, quantity: null, accountType: defaultJpAccountType() }, { accountType: true }));
  });
  form.querySelector("[data-add-sale]")?.addEventListener("click", () => {
    const list = form.querySelector(".sale-list");
    list.insertAdjacentHTML("beforeend", saleRow({ sellDate: "", sellPrice: null, quantity: null }));
  });
  attachPriceReservationControls(form);

  form.addEventListener("click", (event) => {
    const saleButton = event.target.closest("[data-remove-sale]");
    if (saleButton) {
      clearOrRemoveSaleRow(form, saleButton);
      return;
    }
    const button = event.target.closest("[data-remove-lot]");
    if (!button) return;
    const rows = [...form.querySelectorAll(".lot-list .lot-row")];
    if (rows.length <= 1) {
      rows[0].querySelector('[name="purchaseDate"]').value = "";
      rows[0].querySelector('[name="purchasePrice"]').value = "";
      rows[0].querySelector('[name="quantity"]').value = "";
      const accountType = rows[0].querySelector('[name="accountType"]');
      if (accountType) accountType.value = defaultJpAccountType();
      return;
    }
    button.closest(".lot-row").remove();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        holding: form.elements.holding.checked,
        positions: readLotRows(form),
        sales: readSaleRows(form),
        targetBuyPrice: valueOrNull(form.elements.targetBuyPrice.value),
        minimumHoldQuantity: valueOrZero(form.elements.minimumHoldQuantity.value),
        priceReservation: readPriceReservation(form),
      };
      const result = await request(`/api/stocks/${encodeURIComponent(symbol)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      state.stocks = result.stocks;
      toast("保有情報を保存しました。分析更新で損益・配当・判定に反映されます。");
      clearDetailFormEdit();
      render();
    } catch (error) {
      toast(error.message);
    }
  });
}

function effectiveEntryValue(stock, price = {}, serverEntry = null) {
  const target = finiteOrNull(stock.targetBuyPrice);
  if (serverEntry && Number(serverEntry.targetBuyPrice) === Number(target)) return serverEntry;
  return entryValue(target, price);
}

function entryValue(targetBuyPrice, price = {}) {
  const target = finiteOrNull(targetBuyPrice);
  if (!target) {
    return {
      targetBuyPrice: null,
      grade: "未入力",
      score: null,
      summary: "買いたい価格を入れると、3年トレンドと現在値から評価します。",
      reasons: [],
      risks: [],
    };
  }

  if (!Number.isFinite(price.current) || !Number.isFinite(price.high3y) || !Number.isFinite(price.low3y)) {
    return {
      targetBuyPrice: target,
      grade: "分析待ち",
      score: null,
      summary: "一括分析後に、3年データに照らして評価します。",
      reasons: [],
      risks: [],
    };
  }

  let score = 50;
  const reasons = [];
  const risks = [];
  const currentGap = ((target - price.current) / price.current) * 100;
  const rangeSpan = price.high3y - price.low3y;
  const rangePosition = rangeSpan > 0 ? ((target - price.low3y) / rangeSpan) * 100 : null;

  if (currentGap <= -8) {
    score += 14;
    reasons.push(`今の株価より${Math.abs(currentGap).toFixed(1)}%安く買える`);
  } else if (currentGap <= -3) {
    score += 8;
    reasons.push("今の株価より少し安い");
  } else if (currentGap > 6) {
    score -= 14;
    risks.push(`今の株価より${currentGap.toFixed(1)}%高い`);
  } else if (currentGap > 0) {
    score -= 5;
    risks.push("今の株価より高い");
  }

  if (Number.isFinite(rangePosition)) {
    if (rangePosition <= 35) {
      score += 15;
      reasons.push("過去3年で見ると安い側");
    } else if (rangePosition <= 60) {
      score += 6;
      reasons.push("過去3年で見ると高すぎない");
    } else if (rangePosition >= 85) {
      score -= 17;
      risks.push("過去3年の高値に近い");
    } else if (rangePosition >= 72) {
      score -= 8;
      risks.push("過去3年で見るとやや高い");
    }
  }

  if (price.trend3y === "UP") {
    score += 8;
    reasons.push("3年の株価の流れは上向き");
  } else if (price.trend3y === "DOWN") {
    score -= 14;
    risks.push("3年の株価の流れは下向き");
  }

  if (Number.isFinite(price.sma200)) {
    if (target <= price.sma200) score += 7;
    else if (target > price.sma200 * 1.12) score -= 7;
  }

  if (Number.isFinite(price.maxDrawdown3y) && price.maxDrawdown3y < -50) score -= 8;
  if (Number.isFinite(price.volatility) && price.volatility > 55) score -= 9;
  const targetTrendGap = Number.isFinite(price.trendPrice3y)
    ? ((target - price.trendPrice3y) / price.trendPrice3y) * 100
    : null;
  if (Number.isFinite(targetTrendGap)) {
    if (targetTrendGap <= -8) {
      score += 10;
      reasons.push("3年の流れから見た目安価格より安い");
    } else if (targetTrendGap <= 5) {
      score += 5;
      reasons.push("3年の流れから見た目安価格に近い");
    } else if (targetTrendGap > 15) {
      score -= 13;
      risks.push("3年の流れから見た目安価格より高い");
    } else if (targetTrendGap > 5) {
      score -= 6;
      risks.push("3年の流れから見た目安価格より少し高い");
    }
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const grade = bounded >= 75 ? "買いやすい" : bounded >= 60 ? "悪くない" : bounded >= 45 ? "慎重に検討" : "見送り";
  const trendText = Number.isFinite(targetTrendGap)
    ? `3年の流れから見た目安価格 ${yen(price.trendPrice3y)} と比べると${trendGapText(targetTrendGap)}。`
    : "";
  return {
    targetBuyPrice: target,
    grade,
    score: bounded,
    summary: `買いたい価格 ${yen(target)} は、${currentGapText(currentGap)}。過去3年では${rangePositionText(rangePosition)}です。${trendText}`,
    reasons: [...new Set(reasons)].slice(0, 4),
    risks: [...new Set(risks)].slice(0, 4),
  };
}

function entryValueHtml(entry) {
  const gradeClass = entryGradeClass(entry.grade);
  const reasons = (entry.reasons || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const risks = (entry.risks || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  return `
    <div class="entry-evaluation">
      <div class="entry-evaluation-title">
        <strong>買値評価</strong>
        <span class="entry-grade ${gradeClass}">${escapeHtml(entry.grade || "未評価")}${Number.isFinite(entry.score) ? ` ${entry.score}` : ""}</span>
      </div>
      <p>${escapeHtml(entry.summary || "")}</p>
      <div class="entry-points">${reasons}${risks}</div>
    </div>
  `;
}

function entryGradeClass(grade = "") {
  if (grade.includes("買いやすい")) return "good";
  if (grade.includes("悪くない")) return "ok";
  if (grade.includes("慎重")) return "watch";
  if (grade.includes("見送り")) return "bad";
  return "";
}

function renderCandidateList() {
  if (!els.candidateList) return;
  state.suggestions = sanitizeDiscoverySuggestions(state.suggestions);
  renderExcludedCandidates();
  renderCandidatePerformance();
  renderSuccessfulCandidateList();
  if (els.candidateSavedAt) {
    els.candidateSavedAt.textContent = state.discoveryGeneratedAt
      ? `前回検索 ${new Date(state.discoveryGeneratedAt).toLocaleString("ja-JP")}`
      : "前回候補は自動保存されます。";
  }
  if (state.sourceSummary) {
    const source = state.sourceSummary;
    const nisaMode = source.discoveryMode === "nisa";
    const budgetText = source.unitBudgetUnlimited
      ? `${source.unitSize || 100}株・予算上限なし`
      : `${source.unitSize || 100}株で${yen(source.unitBudget || 300000)}くらい`;
    const usBudgetText = nisaMode ? "対象外（日本株のみ）" : `${source.usUnitSize || 1}株で${usd(source.usUnitBudget || 2000)}くらい`;
    const totalPool = source.candidatePool || source.candidateLimit || 0;
    const jpPool = Number.isFinite(source.jpCandidatePool) ? source.jpCandidatePool : totalPool;
    const usPool = nisaMode ? 0 : Number.isFinite(source.usCandidatePool) ? source.usCandidatePool : 0;
    const poolText = `採点対象は日本${jpPool}件・米国${usPool}件、合計${totalPool}件です。`;
    const discoveredText = Number.isFinite(source.jpDiscoveredCount) || Number.isFinite(source.usDiscoveredCount)
      ? `検索結果から拾えた銘柄は日本${source.jpDiscoveredCount || 0}件・米国${source.usDiscoveredCount || 0}件です。`
      : `検索結果から銘柄コードとして拾えたのは${source.discoveredCount || 0}件です。`;
    const usUniverseText = !nisaMode && source.usUniverseTotal
      ? `米国候補元は${source.usUniverseTotal}件で、保有中${source.usExistingCount || 0}件・非表示${source.usExcludedCount || 0}件・除外業種${source.usAvoidedBusinessCount || 0}件を外しています。`
      : "";
    const discoveryText = nisaMode
      ? `NISA検索は日本株だけを対象にしています。検索抽出だけでなく日本株一覧も採点します。`
      : `${discoveredText}${usUniverseText}検索抽出が少なくても、銘柄一覧は別で全件採点しています。`;
    const aiText = source.usedDiscoveryAi ? "最後にLM Studioで上位候補を再点検しています。" : "LM Studio再点検は未実行です。";
    const aiWarningText = source.discoveryAiWarning ? `AI再点検メモ: ${source.discoveryAiWarning}。` : "";
    const edinetWarningText = source.edinetDiscoveryWarnings?.length
      ? `注意: ${source.edinetDiscoveryWarnings.slice(0, 2).join(" / ")}。`
      : "";
    const edinetText = source.edinetDiscoveryEnabled
      ? `日本株${source.edinetDiscoveryChecked || 0}件をEDINET財務で確認してから選別しています。`
      : `候補探しのEDINET財務選別は未実行です。${edinetWarningText}`;
    const jpStage = source.stageStats?.jp || null;
    const stageText = jpStage
      ? nisaMode
        ? `日本株は価格確認${jpStage.priceChecked || 0}件、会社・財務確認${jpStage.financialPass || 0}件、NISA適性候補${jpStage.shown || 0}件です。`
        : `日本株は価格確認${jpStage.priceChecked || 0}件、買い場条件${jpStage.buyArea || 0}件、EDINET後${jpStage.financialPass || 0}件、最終表示${jpStage.shown || 0}件です。`
      : "";
    const seasonalText = source.incomeSeasonalityUsed
      ? `配当・株主優待の権利前需給も加味します。権利前だけ買い目安の許容幅を最大${source.seasonalBuyPremiumPct || 2}%まで広げます。`
      : "";
    const positionText = source.searchPositionUsed ? "検索順位に出る業績・割安材料も採点しています。" : "";
    const strictText = !nisaMode && source.strictBuyTarget ? "買い目安以下のものだけ表示します。" : "";
    const avoidText = source.avoidedBusiness ? `${source.avoidedBusiness}。` : "";
    const peSourceText = source.peLearningSources?.length ? "日本M&AセンターのTOB/MBO実例も参照します。" : "";
    const peText = source.peCriteria?.length
      ? `PE買収狙いは日本株だけを別レポートで見ます。${source.peCriteria.join("・")}を重視します。${peSourceText}`
      : "";
    const earlyText = "買い場以下・反発初動・短期非過熱に加えて、ゴールデンクロスと大引けの強さも見ます。";
    const learnText = source.performance?.evaluated
      ? `過去候補は${source.performance.evaluated}件判定済み、+10%到達率${Math.round((source.performance.hitRate || 0) * 100)}%です。`
      : "";
    const briefText = source.marketBrief?.summary ? ` 市場メモ: ${source.marketBrief.summary}` : "";
    const countText = Number.isFinite(source.suggestionCount)
      ? `表示候補は${source.suggestionCount}件です。`
      : `表示候補は${state.suggestions.length}件です。`;
    const excludedText = source.excludedCount ? `非表示は${source.excludedCount}件です。` : "";
    const engineText = source.engines ? `使用エンジンは${source.engines}です。` : "";
    els.suggestionSource.textContent = source.settingsChanged
      ? `${source.message || "調査条件または採点ルールが変わりました。候補を探すで現在の条件に合わせて作り直してください。"}現在の日本株条件は${budgetText}、米国株条件は${usBudgetText}です。${earlyText}候補は自動追加されません。`
      : source.searchCount > 0
      ? nisaMode
        ? `${source.provider}で${source.searchCount}件を確認しました。${engineText}${discoveryText}${poolText}${stageText}${countText}${excludedText}長期の事業・財務・値動き・配当から適性を採点します。年内の成長投資枠は最大240万円ですが、残り枠は口座情報と連携していないため別途確認してください。損失は課税口座の利益と損益通算できない点にも注意が必要です。${edinetText}${aiText}${aiWarningText}適性評価であり購入指示ではありません。${briefText}`
        : `${source.provider}で${source.searchCount}件確認しました。${engineText}${discoveryText}${poolText}${stageText}${countText}${excludedText}日本株条件は${budgetText}、米国株条件は${usBudgetText}、価格は${source.priceSource}です。${strictText}${earlyText}${avoidText}${positionText}${edinetText}${seasonalText}${peText}${learnText}${aiText}${aiWarningText}候補は自動追加されません。${briefText}`
      : nisaMode
        ? `${source.message || "NISA向け候補を検索しています。"}${discoveryText}${stageText}${edinetText}年内の成長投資枠は最大240万円です。残り枠は証券口座で確認してください。`
        : `${source.provider}は接続済みですが、今回は検索結果が0件でした。${engineText}${poolText}${stageText}日本株条件は${budgetText}、米国株条件は${usBudgetText}、価格は${source.priceSource}です。${strictText}${earlyText}${edinetText}${seasonalText}${countText}${excludedText}`;
  }
  const nisaMode = state.sourceSummary?.discoveryMode === "nisa";
  const { peItems, stockItems } = splitDiscoveryCandidates(state.suggestions, nisaMode);
  els.candidateList.classList.toggle("empty-state", !stockItems.length);
  els.candidateList.innerHTML = candidateReportsHtml(stockItems);
  renderStockForecastCharts(els.candidateList);
  if (els.peCandidateList) {
    els.peCandidateList.classList.toggle("empty-state", nisaMode || !peItems.length);
    els.peCandidateList.innerHTML = nisaMode
      ? '<p class="report-empty">NISA向き候補の検索ではPE候補を扱いません。通常の「候補を検索」を実行してください。</p>'
      : peCandidateReportsHtml(peItems);
    renderStockForecastCharts(els.peCandidateList);
  }
  attachSuggestionButtons();
}

function candidateReportsHtml(items = []) {
  const cleanItems = sanitizeDiscoverySuggestions(items);
  if (state.sourceSummary?.discoveryMode === "nisa") {
    return reportSectionHtml({
      title: "NISA向きの日本株候補",
      count: cleanItems.length,
      description: "短期の買いシグナルとは分け、事業・財務の継続性、株価の振れ幅、配当の持続性、現在の価格水準から長期保有との相性を評価します。NISA適性は利益を保証するものではありません。",
      empty: "適性条件を満たす候補はまだありません。候補検索の件数と財務データの取得状況を上の説明で確認してください。",
      items: cleanItems.sort(sortNisaSuggestionItems),
    });
  }
  return reportSectionHtml({
    title: "株として買う候補",
    count: cleanItems.length,
    description: "買い場ライン、3年目安、業績材料、配当・株主優待の権利前、短期の過熱感で見ます。PE候補とは別の通常候補です。",
    empty: "通常の株候補はありません。",
    items: cleanItems.sort(sortStockReportItems),
  });
}

function splitDiscoveryCandidates(items = [], nisaMode = false) {
  const cleanItems = sanitizeDiscoverySuggestions(items);
  if (nisaMode) return { peItems: [], stockItems: cleanItems.sort(sortNisaSuggestionItems) };
  return {
    peItems: cleanItems.filter((item) => candidateTarget(item) === "jp" && isPeReportItem(item)).sort(sortPeReportItems),
    stockItems: cleanItems.filter((item) => candidateTarget(item) !== "jp" || !isPeReportItem(item)).sort(sortStockReportItems),
  };
}

function peCandidateReportsHtml(items = []) {
  const cleanItems = sanitizeDiscoverySuggestions(items);
  return reportSectionHtml({
    title: "PEが買いそうな候補",
    count: cleanItems.length,
    description: "日本株を対象に、時価総額、ネットキャッシュ、EV/EBITDA、PBR、営業CF、決算後の失望売り、株主還元余地などから買収適性を見ます。",
    empty: "今の条件では、PE候補として根拠が強い銘柄はありません。",
    items: cleanItems.sort(sortPeReportItems),
  });
}

function sanitizeDiscoverySuggestions(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map(normalizeDiscoverySuggestionName)
    .filter((item) => item?.symbol && isCleanDiscoveryCandidateName(item))
    .filter((item) => {
      const key = `${candidateTarget(item)}:${item.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeDiscoverySuggestionName(item = {}) {
  if (!item?.symbol || candidateTarget(item) === "us") return item;
  const symbol = String(item.symbol || "").trim().toUpperCase();
  const name = JP_DISCOVERY_NAME_BY_SYMBOL[symbol];
  if (!name || isLikelyDisplayCandidateName(item.name || "")) return item;
  return {
    ...item,
    name,
    sector: item.sector && item.sector !== "検索発掘" ? item.sector : JP_DISCOVERY_SECTOR_BY_SYMBOL[symbol] || item.sector,
  };
}

function isCleanDiscoveryCandidateName(item = {}) {
  if (candidateTarget(item) === "us") return Boolean(String(item.name || item.symbol || "").trim());
  return isLikelyDisplayCandidateName(item.name || "");
}

function isLikelyDisplayCandidateName(name = "") {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 28) return false;
  if (/^\d+$/.test(text)) return false;
  if (/[。！？]/.test(text)) return false;
  if (/日本株|銘柄|ランキング|一覧|決算|ニュース|速報|上方修正|最高益|増配|割安|株価|市場|特集|材料|今期|前期|本日|今日/.test(text)) return false;
  if (/(?:TOB|MBO|公開買付|非公開化|買収)$/.test(text)) return false;
  if (/(?:主たる目的|所有を主たる目的|目的として|設立された会社|公開買付者|対象者|買付予定|応募契約|賛同表明|上場廃止|完全子会社|普通株式|本公開買付|本件|当社|同社|同氏|取締役会|するため|しており|される|された|について|により|として|および|及び|又は|または)/.test(text)) return false;
  if (/(?:を|に|が|は|へ|で|から|まで|として|について).{0,12}(?:目的|設立|取得|所有|保有|応募|賛同|実施|予定|発表|公開買付|TOB|MBO)/.test(text)) return false;
  if ((text.match(/[0-9０-９]/g) || []).length > 2) return false;
  return true;
}

function reportSectionHtml({ title, count, description, empty, items }) {
  const body = items.length
    ? items.map((item, index) => suggestionItem(item, index)).join("")
    : `<p class="report-empty">${escapeHtml(empty)}</p>`;
  return `
    <section class="candidate-report">
      <header>
        <div>
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(description)}</p>
        </div>
        <span>${count}件</span>
      </header>
      <div class="candidate-report-list">
        ${body}
      </div>
    </section>
  `;
}

function isPeReportItem(item = {}) {
  if (item.reportBucket === "pe") return true;
  const peScore = Number(item.peSignal?.matchScore || 0);
  if (peScore < 45) return false;
  if (item.peSignal?.reportEligible === false) return false;
  const keys = new Set((item.peSignal?.criteria || []).map((criterion) => criterion.key));
  return peScore >= 55
    || keys.has("shareholder")
    || keys.has("restructuring")
    || (keys.has("undervalued") && (keys.has("cashflow") || keys.has("debt_capacity")));
}

function sortPeReportItems(a, b) {
  return (b.pePriorityScore || 0) - (a.pePriorityScore || 0)
    || (b.priorityScore || 0) - (a.priorityScore || 0)
    || (b.businessValueScore || 0) - (a.businessValueScore || 0)
    || String(a.symbol || "").localeCompare(String(b.symbol || ""));
}

function sortStockReportItems(a, b) {
  return (b.businessValueScore || 0) - (a.businessValueScore || 0)
    || (b.priorityScore || 0) - (a.priorityScore || 0)
    || String(a.symbol || "").localeCompare(String(b.symbol || ""));
}

function renderCandidatePerformance() {
  if (!els.candidatePerformance) return;
  const performance = {
    ...(state.sourceSummary?.performance || {}),
    ...(state.candidatePerformance || {}),
  };
  const learning = state.sourceSummary?.candidateLearning || {};
  if (els.candidateLearningSummary) {
    const aiCount = Number(learning.analyzedSignals || Object.keys(performance.aiWeights || {}).length);
    const evaluated = Number(learning.evaluatedSymbols || performance.learningBaseline?.evaluated || performance.evaluated || 0);
    const validationCount = Number(learning.validationSymbols || performance.validationBaseline?.evaluated || 0);
    const horizon = Number(learning.horizonTradingDays || performance.learningValidation?.horizonTradingDays || 20);
    const summary = learning.summary || performance.aiLearningSummary || (performance.total
      ? "過去の勝ち負けと条件別実績を候補スコアに反映します。"
      : "紹介後の結果が蓄積されると、勝ち負けの条件を候補スコアに反映します。");
    const method = learning.method || performance.aiLearningStatus;
    const status = !performance.total
      ? "判定履歴待ち"
      : method === "waiting"
      ? `検証データ蓄積中（${horizon}営業日評価、学習${evaluated}・後続検証${validationCount}銘柄）`
      : method === "applied"
      ? `AI分析を${aiCount}条件に反映（${horizon}営業日評価、学習${evaluated}・後続検証${validationCount}銘柄）`
      : method === "reviewed"
      ? `AI分析済み・再現条件なし（${horizon}営業日評価、学習${evaluated}・後続検証${validationCount}銘柄）`
      : `時系列検証済み条件を統計補正（${horizon}営業日評価、学習${evaluated}・後続検証${validationCount}銘柄）`;
    els.candidateLearningSummary.textContent = `${status}。${summary}`;
    els.candidateLearningSummary.hidden = false;
  }
  if (!performance?.total) {
    els.candidatePerformance.innerHTML = `
      <span><strong>候補実績</strong>まだ蓄積中</span>
      <span><strong>判定済み</strong>0件</span>
      <span><strong>学習反映</strong>履歴が増えたら自動</span>
    `;
    return;
  }
  const hitRate = Number.isFinite(performance.hitRate) ? `${Math.round(performance.hitRate * 100)}%` : "-";
  const avg = Number.isFinite(performance.avgReturnPct) ? signedPct(performance.avgReturnPct) : "-";
  const peRate = Number.isFinite(performance.peLike?.hitRate) ? `${Math.round(performance.peLike.hitRate * 100)}%` : "-";
  const forecast = performance.forecastValidation || {};
  const forecastSummary = forecast.evaluated < 10
    ? `${forecast.evaluated}件・蓄積中`
    : `${forecast.evaluated}件 / 上昇 ${Math.round(forecast.predictedRatePct)}%→${Math.round(forecast.actualRatePct)}%・下落 ${forecast.downsideEvaluated >= 10 ? `${Math.round(forecast.downsidePredictedRatePct)}%→${Math.round(forecast.downsideActualRatePct)}%` : "蓄積中"}`;
  els.candidatePerformance.innerHTML = `
    <span><strong>保存候補</strong>${performance.total}件</span>
    <span><strong>判定済み</strong>${performance.evaluated || 0}件</span>
    <span><strong>+10%到達率</strong>${hitRate}</span>
    <span><strong>平均</strong>${avg}</span>
    <span><strong>PE系</strong>${peRate}</span>
    ${forecast.evaluated ? `<span><strong>予測照合</strong>${forecastSummary}</span>` : ""}
  `;
}

function renderSuccessfulCandidateList() {
  if (!els.successfulCandidateList || !els.underperformingCandidateList) return;
  const items = Array.isArray(state.successfulCandidates) ? state.successfulCandidates : [];
  const declines = Array.isArray(state.underperformingCandidates) ? state.underperformingCandidates : [];
  const total = (state.candidatePerformance || state.sourceSummary?.performance)?.hits;
  if (els.successfulCandidateCount) {
    els.successfulCandidateCount.textContent = `${Number.isFinite(total) ? total : items.length}件`;
  }
  if (els.underperformingCandidateCount) {
    els.underperformingCandidateCount.textContent = `${state.underperformingCandidateCount || declines.length}件`;
  }
  els.successfulCandidateList.innerHTML = items.length ? items.map((item) => {
    const currency = candidateTarget(item) === "us" ? usd : yen;
    const gainPct = Number(item.maxReturnPct);
    const entryPrice = Number(item.entryPrice);
    const peakPrice = Number(item.maxPrice) || (entryPrice * (1 + gainPct / 100));
    const currentPct = Number.isFinite(item.latestReturnPct) ? signedPct(item.latestReturnPct) : "-";
    const symbol = symbolLinkHtml(item.symbol, candidateTarget(item));
    const introDate = item.generatedAt ? new Date(item.generatedAt).toLocaleDateString("ja-JP") : "日付不明";
    const peakDate = item.maxDate ? new Date(`${item.maxDate}T00:00:00`).toLocaleDateString("ja-JP") : "記録日不明";
    return `
      <article class="candidate-success-item">
        <div class="candidate-success-heading">
          <div><strong>${escapeHtml(item.name || item.symbol)}</strong><small>${symbol} ・ 紹介 ${escapeHtml(introDate)}</small></div>
          <strong class="candidate-success-return">${signedPct(gainPct)}</strong>
        </div>
        <p>紹介価格 ${currency(entryPrice)} → 到達高値 ${currency(peakPrice)}</p>
        <small>最高値 ${escapeHtml(peakDate)} ・ ${Number(item.elapsedTradingDays || 0)}営業日後 ・ ${escapeHtml(item.latestDate || "")}終値 ${currentPct}</small>
      </article>
    `;
  }).join("") : '<p class="candidate-result-empty">紹介後に+10%へ到達した候補はまだありません。</p>';

  els.underperformingCandidateList.innerHTML = declines.length ? declines.map((item) => {
    const currency = candidateTarget(item) === "us" ? usd : yen;
    const entryPrice = Number(item.entryPrice);
    const latestPrice = Number(item.latestPrice) || (entryPrice * (1 + Number(item.latestReturnPct || 0) / 100));
    const currentPct = signedPct(item.latestReturnPct);
    const peakPct = Number.isFinite(item.maxReturnPct) ? signedPct(item.maxReturnPct) : "-";
    const symbol = symbolLinkHtml(item.symbol, candidateTarget(item));
    const introDate = item.generatedAt ? new Date(item.generatedAt).toLocaleDateString("ja-JP") : "日付不明";
    return `
      <article class="candidate-success-item candidate-underperforming-item">
        <div class="candidate-success-heading">
          <div><strong>${escapeHtml(item.name || item.symbol)}</strong><small>${symbol} ・ 紹介 ${escapeHtml(introDate)}</small></div>
          <strong class="candidate-underperforming-return">${currentPct}</strong>
        </div>
        <p>紹介価格 ${currency(entryPrice)} → 判定終値 ${currency(latestPrice)}</p>
        <small>判定日 ${escapeHtml(item.latestDate || "日付不明")} ・ 紹介後の最高到達 ${peakPct}</small>
      </article>
    `;
  }).join("") : '<p class="candidate-result-empty">紹介価格を下回っている候補はありません。</p>';
  els.successfulCandidateList.classList.toggle("empty-state", !items.length);
  els.underperformingCandidateList.classList.toggle("empty-state", !declines.length);
}

function renderExcludedCandidates() {
  const excluded = state.excludedCandidates || [];
  if (els.excludedCandidateCount) els.excludedCandidateCount.textContent = `${excluded.length}件`;
  if (!els.excludedCandidateList) return;
  if (!excluded.length) {
    els.excludedCandidateList.innerHTML = "<p>まだありません。</p>";
    return;
  }
  els.excludedCandidateList.innerHTML = excluded.map((item) => `
    <span class="excluded-chip">
      <strong>${escapeHtml(item.name || item.symbol)}</strong>
      <small>${symbolLinkHtml(item.symbol, candidateTarget(item))}</small>
      <button type="button" data-restore-suggestion="${escapeAttr(item.symbol)}" aria-label="${escapeAttr(item.name || item.symbol)}を候補に戻す">戻す</button>
    </span>
  `).join("");
  attachExcludedButtons();
}

function renderSectorEvidence() {
  if (!els.sectorEvidenceList) return;
  const groups = state.sectorEvidence || [];
  if (!groups.length) {
    els.sectorEvidenceList.classList.add("empty-state");
    els.sectorEvidenceList.innerHTML = "<p>一括分析を実行すると、業種Evidenceを保存してここに表示します。</p>";
    return;
  }
  els.sectorEvidenceList.classList.remove("empty-state");
  els.sectorEvidenceList.innerHTML = groups.map((group) => `
    <article class="sector-evidence-group">
      <div class="sector-evidence-head">
        <strong>${escapeHtml(group.sector || "その他")}</strong>
        <span>${escapeHtml((group.symbols || []).join(" / "))}</span>
      </div>
      <div class="sector-evidence-items">
        ${(group.items || []).map((item) => `
          <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">
            <strong>${escapeHtml(item.title || item.source || "source")}</strong>
            <small>${escapeHtml(item.source || "")}</small>
            <span>${escapeHtml(item.snippet || "")}</span>
          </a>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function suggestionItem(item, index) {
  const reasons = (item.reasons || []).map((text) => `<span>${escapeHtml(text)}</span>`).join("");
  const risks = (item.risks || []).map((text) => `<span class="risk">${escapeHtml(text)}</span>`).join("");
  const price = item.price || {};
  const process = item.process || {};
  const currency = candidateCurrency(item);
  const money = (value) => candidateMoney(value, currency);
  const target = candidateTarget(item);
  const evidence = (item.businessEvidence || []).map((source) => `
    <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.source || source.title || "source")}</a>
  `).join("");
  const exists = target === "us"
    ? state.usStocks.some((stock) => stock.symbol === item.symbol)
    : state.stocks.some((stock) => stock.symbol === item.symbol);
  const full = target === "us" ? state.usStocks.length >= 40 : state.stocks.length >= MANAGED_STOCK_LIMIT;
  const disabled = exists || full ? "disabled" : "";
  const buttonText = exists ? "追加済み" : full ? "管理枠満了" : target === "us" ? "米国株に追加" : "日本株に追加";
  const marketLabel = target === "us" ? "米国株" : "日本株";
  const businessOverview = item.businessOverview || item.aiReview?.businessOverview || "";
  const profileSources = (item.businessOverviewEvidence || []).filter((source) => source.url).slice(0, 2);
  const nisaFit = item.nisaFit;
  return `
    <article class="suggestion-item">
      <div class="suggestion-head">
        <div>
          <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
          <span>${symbolLinkHtml(item.symbol, target)} / ${escapeHtml(marketLabel)} / ${escapeHtml(item.sector || "その他")} / ${escapeHtml(item.evidenceQuality || item.discoverySource || "価格中心")}</span>
        </div>
        <div class="suggestion-actions">
          ${suggestionScoreHtml(item)}
          <button type="button" class="secondary" data-add-suggestion="${escapeAttr(item.symbol)}" ${disabled}>${buttonText}</button>
          <button type="button" class="secondary subtle-danger" data-hide-suggestion="${escapeAttr(item.symbol)}">出さない</button>
        </div>
      </div>
      <div class="suggestion-metrics">
        <span><strong>価格</strong>${money(price.current)}</span>
        <span><strong>${Number.isFinite(item.unitSize) ? item.unitSize : target === "us" ? 1 : 100}株</strong>${money(price.unitAmount)}</span>
        <span><strong>3年目安</strong>${trendGapBadge(price.distanceFromTrend3y)}</span>
        <span><strong>1年買い場</strong>${buyTimingBadge(price)}</span>
        <span><strong>3カ月</strong>${pct(price.return3m)}</span>
        <span><strong>1年</strong>${pct(price.return1y)}</span>
        <span><strong>3年</strong>${pct(price.return3y)}</span>
        <span><strong>市場配当利回り</strong>${Number.isFinite(price.dividendYield) ? `${price.dividendYield.toFixed(1)}%` : "-"}</span>
        <span><strong>配当/優待</strong>${incomeSeasonalityBadge(item.incomeSeasonality)}</span>
        <span><strong>需給経験則</strong>${technicalExperienceBadge(price)}</span>
        <span><strong>検索順位</strong>${item.searchPosition?.rank ? `${item.searchPosition.rank}位` : "-"}</span>
      </div>
      ${upsideOutlookHtml(item.upsideOutlook)}
      ${nisaFit ? `<section class="nisa-fit"><strong>NISA適性 ${escapeHtml(nisaFit.label)} ${Math.round(nisaFit.score)}点</strong><span>データ充足度 ${Math.round(nisaFit.confidence || 0)}%${(nisaFit.reasons || []).length ? ` / ${(nisaFit.reasons || []).slice(0, 2).map(escapeHtml).join("・")}` : ""}</span>${(nisaFit.risks || []).length ? `<small>${(nisaFit.risks || []).slice(0, 2).map(escapeHtml).join("・")}</small>` : ""}${(nisaFit.missingData || []).map((text) => `<small>${escapeHtml(text)}</small>`).join("")}</section>` : ""}
      <section class="business-overview"><strong>事業概要</strong><p>${escapeHtml(businessOverview || (target === "us" ? "米国企業の年次報告書・公式IRを根拠にした日本語要約は未取得です。" : "年次報告書・IR資料を根拠にした事業概要は未取得です。"))}</p><div>${profileSources.map((source) => `<a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.source || source.title || "会社資料")}</a>`).join("")}</div></section>
      ${marketPerspectiveHtml(item)}
      ${buyPlanHtml(item.buyPlan, item)}
      ${earlySignalHtml(item.earlySignal)}
      ${incomeSeasonalityHtml(item.incomeSeasonality)}
      ${sellPlanHtml(item.sellPlan, item)}
      ${target === "jp" ? peSignalHtml(item.peSignal) : ""}
      ${learningHtml(item.learning)}
      ${aiReviewHtml(item.aiReview)}
      ${processHtml(process)}
      <div class="suggestion-points">${reasons}${risks}</div>
      <div class="suggestion-evidence ${evidence ? "" : "muted"}"><strong>確認元</strong>${evidence || "<span>業績材料は未確認</span>"}</div>
    </article>
  `;
}

function sortNisaSuggestionItems(a = {}, b = {}) {
  return Number(b.nisaFit?.score || 0) - Number(a.nisaFit?.score || 0)
    || Number(b.nisaFit?.confidence || 0) - Number(a.nisaFit?.confidence || 0);
}

function suggestionScoreHtml(item = {}) {
  const target = candidateTarget(item);
  const valueScore = Number.isFinite(item.businessValueScore) ? item.businessValueScore : item.score || "-";
  const priority = Number.isFinite(item.priorityScore) ? item.priorityScore : null;
  const pePriority = Number.isFinite(item.pePriorityScore) ? item.pePriorityScore : null;
  const peScore = target === "jp" && Number.isFinite(item.peSignal?.matchScore) ? item.peSignal.matchScore : null;
  const earlyScore = Number.isFinite(item.earlySignal?.score) ? item.earlySignal.score : null;
  const earlyText = earlyScore === null
    ? ""
    : earlyScore >= 75
    ? ` / 先回り高 ${earlyScore}`
    : earlyScore >= 60
    ? ` / 初動 ${earlyScore}`
    : ` / 初動弱 ${earlyScore}`;
  const peLabel = peScore === null
    ? ""
    : peScore >= 70
    ? ` / PE優先 ${pePriority || peScore}`
    : peScore >= 45
    ? ` / PE確認 ${pePriority || peScore}`
    : ` / PE対象外 ${peScore}`;
  const priorityText = priority === null ? "" : ` / 株候補 ${priority}`;
  return `<span class="suggestion-score">${escapeHtml(item.rankLabel || "候補")} ${valueScore}${priorityText}${earlyText}${peLabel}</span>`;
}

function candidateTarget(item = {}) {
  if (item.targetCollection === "us" || item.currency === "USD" || item.price?.currency === "USD") return "us";
  return "jp";
}

function candidateCurrency(item = {}) {
  return candidateTarget(item) === "us" ? "USD" : "JPY";
}

function candidateMoney(value, currency = "JPY") {
  return currency === "USD" ? usd(value) : yen(value);
}

function sellPlanHtml(plan, item = {}) {
  if (!plan?.targetPrice && !plan?.stopPrice) return "";
  const money = (value) => candidateMoney(value, candidateCurrency(item));
  return `
    <div class="sell-plan">
      <span><strong>売り場ライン</strong>${money(plan.targetPrice)}</span>
      <span><strong>確認ライン</strong>${money(plan.stopPrice)}</span>
      <p>${escapeHtml(plan.summary || "")}</p>
      ${ruleGuideHtml({
        standard: "売り場ラインは過去レンジ上側や直近高値をもとにした利益確定の目安、確認ラインは下落理由を見直す目安です。",
        impact: "候補を買う前に、どこで利益を取り、どこで前提を見直すかを先に決めます。",
      })}
    </div>
  `;
}

function earlySignalHtml(signal) {
  if (!signal) return "";
  const criteria = (signal.criteria || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const risks = (signal.risks || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const cls = Number(signal.score || 0) >= 75 ? "good" : Number(signal.score || 0) >= 60 ? "ok" : Number(signal.score || 0) >= 45 ? "watch" : "weak";
  const title = signal.title || (Number(signal.score || 0) >= 45 ? "早めに入る条件" : "初動確認");
  return `
    <div class="early-signal ${cls}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(signal.label || "確認")} ${Number.isFinite(signal.score) ? signal.score : "-"}</span>
      </div>
      <p>${escapeHtml(signal.summary || "買い場と初動条件を確認します。")}</p>
      <div>${criteria}${risks}</div>
    </div>
  `;
}

function upsideOutlookHtml(outlook = null) {
  if (!outlook || typeof outlook !== "object") {
    return `
      <section class="upside-outlook unavailable" aria-label="上昇見込みの参考実績">
        <div class="upside-outlook-head"><strong>上昇見込みの参考実績</strong><span>比較データ未取得</span></div>
        <p>この候補の+10%到達率と一時下落率を表示するデータを受け取れていません。</p>
        <small>現在は過去の候補実績と比較できません。候補情報を更新してください。</small>
      </section>
    `;
  }
  const conditionTags = (outlook.conditions || []).map((condition) => {
    const direction = condition.deltaPct > 0 ? "良" : condition.deltaPct < 0 ? "注意" : "中立";
    const className = condition.deltaPct > 0 ? "positive" : condition.deltaPct < 0 ? "risk" : "neutral";
    return `<span class="${className}">${escapeHtml(condition.label)}: ${condition.ratePct}% (${condition.evaluated}件・${direction})</span>`;
  }).join("");
  if (outlook.status !== "reference") {
    const overall = Number.isFinite(outlook.baselineRatePct) ? `全体基準 ${outlook.baselineRatePct}%` : "全体基準 未算出";
    return `
      <section class="upside-outlook insufficient">
        <div class="upside-outlook-head"><strong>上昇見込みの参考実績</strong><span>データ蓄積中</span></div>
        <p>+10%到達の個別目安はまだ出せません。同じ市場の全体検証 ${outlook.validationSamples}/${outlook.requiredBaselineSamples}件、類似候補 ${outlook.peerCount}/${outlook.requiredPeerSamples}件。${overall}。</p>
        ${conditionTags ? `<div class="upside-outlook-conditions">${conditionTags}</div>` : ""}
        <small>候補点やAIの見解を、上昇確率として置き換えていません。</small>
      </section>
    `;
  }
  return `
    <section class="upside-outlook">
      <div class="upside-outlook-head"><strong>上昇見込みの参考実績</strong><span>20営業日 / 類似 ${outlook.peerCount}銘柄</span></div>
      <div class="upside-outlook-metrics">
        <span><strong>日足高値で+${outlook.targetPct}%到達</strong>${outlook.hitRatePct}% (${outlook.hitCount}/${outlook.peerCount})<small>参考幅 95%: ${outlook.intervalLowPct}〜${outlook.intervalHighPct}%</small></span>
        <span class="risk"><strong>一時 -${outlook.downsideThresholdPct}%以上下落</strong>${outlook.downsideRatePct}% (${outlook.downsideCount}/${outlook.peerCount})</span>
        <span><strong>全体基準</strong>${outlook.baselineRatePct}% (${outlook.validationSamples}銘柄)</span>
      </div>
      ${conditionTags ? `<div class="upside-outlook-conditions">${conditionTags}</div>` : ""}
      <small>同じ市場の候補を銘柄ごとに分けた後続期間の実績です。到達判定は20営業日以内の日足高値。将来の確率や利益を保証するものではありません。</small>
    </section>
  `;
}

function incomeSeasonalityBadge(signal = null) {
  if (!signal || (!signal.hasDividend && !signal.hasBenefit)) return "-";
  const parts = [signal.label || "確認"];
  if (Number.isFinite(signal.daysToNext)) parts.push(`${signal.daysToNext}日後`);
  else if (signal.nextDate) parts.push(formatDate(signal.nextDate));
  if (signal.hasBenefit) parts.push("優待");
  return escapeHtml(parts.join(" / "));
}

function technicalExperienceBadge(price = {}) {
  const parts = [];
  if (price.goldenCross || price.maCrossSignal?.score >= 6) parts.push("GC");
  else if (price.deadCross || price.maCrossSignal?.score < 0) parts.push("DC注意");
  if (price.closeStrength?.score >= 4) parts.push(price.closeStrength.label || "大引け強い");
  else if (price.closeStrength?.score < 0) parts.push("大引け弱い");
  return escapeHtml(parts.length ? parts.join(" / ") : "-");
}

function incomeSeasonalityHtml(signal = null) {
  if (!signal || (!signal.hasDividend && !signal.hasBenefit)) return "";
  const criteria = (signal.criteria || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const risks = (signal.risks || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const score = Number(signal.score || 0);
  const cls = signal.buyCaution ? "weak" : score >= 10 ? "good" : score > 0 ? "watch" : "weak";
  const next = signal.nextDate ? ` / 次回目安 ${formatDate(signal.nextDate)}` : "";
  const amount = Number.isFinite(signal.nextAmount) ? ` / 予想配当 ${yen(signal.nextAmount)}/株` : "";
  const frequency = signal.frequencyLabel ? ` / ${signal.frequencyLabel}` : "";
  return `
    <div class="early-signal income-seasonality ${cls}">
      <div>
        <strong>配当・優待タイミング</strong>
        <span>${escapeHtml(signal.label || "確認")}${escapeHtml(next)}${escapeHtml(amount)}${escapeHtml(frequency)}</span>
      </div>
      <p>${escapeHtml(signal.summary || "権利確定前後の買い需要と反落リスクを確認します。")}</p>
      <div>${criteria}${risks}</div>
    </div>
  `;
}

function peSignalHtml(signal) {
  if (!signal) return "";
  const criteria = (signal.criteria || []).map((item) => `<span>${escapeHtml(item.label)}</span>`).join("");
  const financialCriteria = (signal.financialCriteria || signal.financials?.criteria || []).map((item) => `
    <span class="${item.status === "fail" ? "risk" : ""}">${escapeHtml(item.label)}: ${escapeHtml(financialCriterionText(item.status))}</span>
  `).join("");
  const financials = signal.financials || {};
  const financialLine = signal.financials ? `
    <div class="pe-financial-line">
      <span><strong>時価総額</strong>${largeYen(financials.marketCap)}</span>
      <span><strong>ネットキャッシュ</strong>${Number.isFinite(financials.netCashRatio) ? `${(financials.netCashRatio * 100).toFixed(1)}%` : "-"}</span>
      <span><strong>EV/EBITDA</strong>${multipleText(financials.evEbitda)}</span>
      <span><strong>PBR</strong>${multipleText(financials.pbr)}</span>
      <span><strong>PER</strong>${multipleText(financials.per)}</span>
    </div>
  ` : "";
  const financialInsights = (financials.insights || []).slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const financialMissing = (financials.missingMetrics || []).slice(0, 3).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const risks = (signal.risks || []).map((item) => `<span class="risk">${escapeHtml(item)}</span>`).join("");
  const tendencies = (signal.tendencies || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const evidence = (signal.evidence || []).map((item) => `
    <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source || item.title || "source")}</a>
  `).join("");
  const score = Number(signal.matchScore || 0);
  const cls = score >= 70 ? "strong" : score >= 45 ? "watch" : "weak";
  const warning = score < 45
    ? `<p class="pe-warning">PE候補としては優先しません。安定収益や業種だけでは、買収候補としての根拠が足りません。</p>`
    : "";
  return `
    <div class="pe-signal ${cls}">
      <div>
        <strong>PE候補チェック</strong>
        <span>${escapeHtml(signal.label || "確認")} ${Number.isFinite(signal.matchScore) ? signal.matchScore : "-"}</span>
      </div>
      <p>${escapeHtml(signal.summary || "")}</p>
      ${warning}
      ${financialLine}
      ${financialInsights ? `<div class="pe-financial-insights">${financialInsights}</div>` : ""}
      <div>${financialCriteria}${criteria}${risks}</div>
      ${financialMissing ? `<div class="pe-financial-insights">${financialMissing}</div>` : ""}
      ${tendencies ? `<div class="pe-tendencies">${tendencies}</div>` : ""}
      ${evidence ? `<div class="pe-evidence">${evidence}</div>` : ""}
    </div>
  `;
}

function learningHtml(learning) {
  if (!learning?.adjustment) return "";
  const reasons = (learning.reasons || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  return `
    <div class="learning-signal">
      <strong>${learning.aiAssisted ? "AI分析を含む候補成績" : "候補成績を反映"} ${learning.adjustment > 0 ? "+" : ""}${learning.adjustment}</strong>
      ${reasons}
    </div>
  `;
}

function aiReviewHtml(review) {
  if (!review?.summary) return "";
  const positives = (review.positives || []).map((text) => `<span>${escapeHtml(text)}</span>`).join("");
  const risks = (review.risks || []).map((text) => `<span class="risk">${escapeHtml(text)}</span>`).join("");
  const adjustment = Number.isFinite(review.adjustment)
    ? `${review.adjustment > 0 ? "+" : ""}${review.adjustment}`
    : "0";
  return `
    <div class="ai-review">
      <div>
        <strong>LM Studio再点検</strong>
        <span>${escapeHtml(adjustment)}</span>
      </div>
      <p>${escapeHtml(review.summary)}</p>
      <div>${positives}${risks}</div>
    </div>
  `;
}

function marketPerspectiveHtml(item = {}) {
  const evidence = (item.marketEvidence || []).slice(0, 4);
  const review = item.aiReview || {};
  const impactLabel = {
    positive: "追い風の見方",
    negative: "懸念の見方",
    mixed: "見方が分かれる",
    neutral: "判断への影響は限定的",
    unknown: "AI整理なし",
  }[review.marketImpact || "unknown"];
  const summary = review.marketView
    || (evidence.length ? "直近情報を取得しました。AI確認が未完了のため、出典を開いて内容を確認してください。"
      : "45日以内の日付を確認できるニュース・見解はありません。日付不明の投稿は判断材料に使っていません。");
  const sources = evidence.map((source) => `
    <div class="market-perspective-source">
      <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(source.title || source.source || "記事を確認")}</strong>
        <small>${escapeHtml(evidenceMetaText(source) || "公開日不明")}</small>
        <span>${escapeHtml(source.snippet || "記事本文の要約は検索結果にありません。リンク先で確認してください。")}</span>
      </a>
      ${source.articleText ? `<details><summary>取得本文（最大1,800字）を確認</summary><p>${escapeHtml(source.articleText)}</p></details>` : ""}
    </div>
  `).join("");
  return `
    <section class="market-perspective">
      <div class="market-perspective-head">
        <strong>直近の報道・市場の見方</strong>
        <span>${escapeHtml(impactLabel)}${review.marketConfidence ? ` / 信頼度 ${Number(review.marketConfidence)}%` : ""}</span>
      </div>
      <p>${escapeHtml(summary)}</p>
      ${sources ? `<div class="market-perspective-list">${sources}</div>` : ""}
      <small>会社発表・報道と、アナリスト見解・掲示板コメントは分けて扱います。コメントだけで買い判定は変えません。</small>
    </section>
  `;
}

function buyPlanHtml(plan, item = {}) {
  if (!plan) return "";
  const checks = (plan.checks || []).map((text) => `<span>${escapeHtml(text)}</span>`).join("");
  const currency = candidateCurrency(item);
  const unitLabel = candidateTarget(item) === "us" ? "1株" : "1単元";
  const money = (value) => candidateMoney(value, currency);
  const gap = buyPlanGap(plan, item);
  return `
    <div class="buy-plan">
      <div>
        <strong>買い目安</strong>
        <p>${escapeHtml(gap.text || plan.summary || "")}</p>
      </div>
      <div class="buy-plan-price">
        <span class="${gap.ok === false ? "is-over" : ""}">${escapeHtml(gap.label || plan.stance || "検討")}</span>
        <strong>${money(plan.maxBuyPrice)}</strong>
        <small>${Number.isFinite(plan.unitAmountAtMax) ? `${money(plan.unitAmountAtMax)} / ${unitLabel}` : ""}</small>
      </div>
      <div class="buy-plan-checks">${checks}</div>
    </div>
  `;
}

function buyPlanGap(plan = {}, item = {}) {
  const current = Number(item.price?.current);
  const target = Number(plan.maxBuyPrice);
  if (!Number.isFinite(current) || !Number.isFinite(target) || current <= 0 || target <= 0) {
    return { ok: null, label: plan.stance || "検討", text: "" };
  }
  const currency = candidateCurrency(item);
  const diff = target - current;
  const pctDiff = (diff / current) * 100;
  const pctText = Number.isFinite(pctDiff) ? `（${pctDiff >= 0 ? "+" : ""}${pctDiff.toFixed(1)}%）` : "";
  if (Math.abs(diff) < 0.05) {
    return {
      ok: true,
      label: "入口OK",
      text: `今は買い目安とほぼ同じ価格です${pctText}。業績・配当・悪材料まで確認して検討します。`,
    };
  }
  const amountText = candidateMoney(Math.abs(diff), currency);
  if (diff > 0) {
    return {
      ok: true,
      label: "入口OK",
      text: `今は買い目安より${amountText}安いので入口条件は満たしています${pctText}。業績・配当・悪材料まで確認して検討します。`,
    };
  }
  return {
    ok: false,
    label: "目安超え",
    text: `今は買い目安より${amountText}高いので、追わずに待つ水準です${pctText}。`,
  };
}

function processHtml(process) {
  const stages = process?.stages || [];
  if (!stages.length) return "";
  return `
    <div class="process-grid" aria-label="発掘プロセス">
      ${stages.map((stage) => `
        <span class="${processStageClass(stage.status)}">
          <strong>${escapeHtml(stage.label)} ${stage.score}/${stage.max}</strong>
          <em>${escapeHtml(stage.status)}</em>
          <small>${escapeHtml(stage.note || "")}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function processStageClass(status = "") {
  if (status === "合格") return "process-stage pass";
  if (status === "確認") return "process-stage check";
  return "process-stage weak";
}

function attachSuggestionButtons() {
  const candidateButtons = (selector) => [els.candidateList, els.peCandidateList]
    .filter(Boolean)
    .flatMap((container) => [...container.querySelectorAll(selector)]);
  candidateButtons("[data-add-suggestion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const suggestion = state.suggestions.find((item) => item.symbol === button.dataset.addSuggestion);
      if (!suggestion) return;
      const target = candidateTarget(suggestion);
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "追加・分析中";
      try {
        const payload = await request(target === "us" ? "/api/us-stocks" : "/api/stocks", {
          method: "POST",
          body: JSON.stringify({
            analyze: true,
            name: suggestion.name,
            symbol: suggestion.symbol,
            market: suggestion.market,
            sector: suggestion.sector,
            notes: suggestion.notes,
            holding: false,
            websiteLimit: clampInput(els.websiteLimit),
            depthLimit: clampInput(els.depthLimit),
            pagesPerSite: clampInput(els.pagesPerSite),
          }),
        });
        if (target === "us") {
          state.usStocks = payload.stocks || state.usStocks;
          state.usSelected = suggestion.symbol;
          if (payload.analysisCache) applyUsAnalysisPayload(payload.analysisCache);
          setView("us");
          toast(payload.analysisError
            ? `${suggestion.name}を米国株に追加しました。分析は失敗しました: ${payload.analysisError}`
            : `${suggestion.name}を米国株に追加して分析しました。`);
        } else {
          state.stocks = payload.stocks || state.stocks;
          state.selected = suggestion.symbol;
          if (payload.analysisCache) applyAnalysisPayload(payload.analysisCache, false);
          setView("analysis");
          toast(payload.analysisError
            ? `${suggestion.name}を日本株に追加しました。分析は失敗しました: ${payload.analysisError}`
            : `${suggestion.name}を日本株に追加して分析しました。`);
        }
        render();
      } catch (error) {
        toast(error.message);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  });
  candidateButtons("[data-hide-suggestion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const suggestion = state.suggestions.find((item) => item.symbol === button.dataset.hideSuggestion);
      if (!suggestion) return;
      try {
        const payload = await request("/api/excluded-candidates", {
          method: "POST",
          body: JSON.stringify({
            symbol: suggestion.symbol,
            name: suggestion.name,
            sector: suggestion.sector,
            market: suggestion.market,
            currency: suggestion.currency || suggestion.price?.currency,
          }),
        });
        state.suggestions = sanitizeDiscoverySuggestions(payload.suggestions || state.suggestions.filter((item) => item.symbol !== suggestion.symbol));
        state.excludedCandidates = payload.excludedCandidates || state.excludedCandidates;
        state.sourceSummary = payload.sourceSummary || state.sourceSummary;
        toast(`${suggestion.name}を候補から外しました。`);
        renderCandidateList();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function attachExcludedButtons() {
  els.excludedCandidateList?.querySelectorAll("[data-restore-suggestion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const symbol = button.dataset.restoreSuggestion;
      try {
        const payload = await request(`/api/excluded-candidates/${encodeURIComponent(symbol)}`, {
          method: "DELETE",
        });
        state.excludedCandidates = payload.excludedCandidates || [];
        toast("候補に戻しました。次回検索から表示されます。");
        renderCandidateList();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function normalizeAccountType(value) {
  return String(value || "").toLowerCase() === "nisa" ? "nisa" : "taxable";
}

function defaultJpAccountType() {
  return normalizeAccountType(state.settings?.defaultJpAccountType || "taxable");
}

function accountTypeLabel(value) {
  return normalizeAccountType(value) === "nisa" ? "NISA" : "一般/特定";
}

function accountTypeOptions(value) {
  const current = normalizeAccountType(value);
  return ["taxable", "nisa"]
    .map((type) => `<option value="${type}" ${current === type ? "selected" : ""}>${accountTypeLabel(type)}</option>`)
    .join("");
}

function positionLots(stock) {
  const source = Array.isArray(stock.positions) && stock.positions.length
    ? stock.positions
    : [{
      purchaseDate: stock.purchaseDate,
      purchasePrice: stock.purchasePrice,
      quantity: stock.quantity,
      accountType: stock.accountType,
    }];
  return source
    .map((lot) => ({
      purchaseDate: String(lot.purchaseDate || ""),
      purchasePrice: finiteOrNull(lot.purchasePrice),
      quantity: finiteOrNull(lot.quantity),
      accountType: normalizeAccountType(lot.accountType || stock.accountType || defaultJpAccountType()),
    }))
    .filter((lot) => lot.purchasePrice && lot.quantity)
    .sort((a, b) => (a.purchaseDate || "9999-99-99").localeCompare(b.purchaseDate || "9999-99-99"));
}

function saleLots(stock) {
  const source = Array.isArray(stock.sales) ? stock.sales : [];
  return source
    .map((lot) => ({
      sellDate: String(lot.sellDate || lot.saleDate || ""),
      sellPrice: finiteOrNull(lot.sellPrice || lot.salePrice),
      quantity: finiteOrNull(lot.quantity),
    }))
    .filter((lot) => lot.sellPrice && lot.quantity)
    .sort((a, b) => (a.sellDate || "9999-99-99").localeCompare(b.sellDate || "9999-99-99"));
}

function cryptoPositionLots(holding = {}) {
  const source = Array.isArray(holding.positions) ? holding.positions : [];
  return source
    .map((lot) => ({
      purchaseDate: String(lot.purchaseDate || ""),
      purchasePriceUsd: finiteOrNull(lot.purchasePriceUsd),
      purchasePriceJpy: finiteOrNull(lot.purchasePriceJpy),
      quantity: finiteOrNull(lot.quantity),
    }))
    .filter((lot) => lot.quantity && (lot.purchasePriceUsd || lot.purchasePriceJpy))
    .sort((a, b) => (a.purchaseDate || "9999-99-99").localeCompare(b.purchaseDate || "9999-99-99"));
}

function cryptoSaleLots(holding = {}) {
  const source = Array.isArray(holding.sales) ? holding.sales : [];
  return source
    .map((lot) => ({
      sellDate: String(lot.sellDate || lot.saleDate || ""),
      sellPriceUsd: finiteOrNull(lot.sellPriceUsd || lot.salePriceUsd),
      sellPriceJpy: finiteOrNull(lot.sellPriceJpy || lot.salePriceJpy),
      quantity: finiteOrNull(lot.quantity),
    }))
    .filter((lot) => lot.quantity && (lot.sellPriceUsd || lot.sellPriceJpy))
    .sort((a, b) => (a.sellDate || "9999-99-99").localeCompare(b.sellDate || "9999-99-99"));
}

function cryptoPositionFallback(holding = {}) {
  const positions = cryptoPositionLots(holding);
  const sales = cryptoSaleLots(holding);
  const grossQuantity = positions.reduce((sum, lot) => sum + lot.quantity, 0);
  const soldQuantity = Math.min(sales.reduce((sum, lot) => sum + lot.quantity, 0), grossQuantity);
  const quantity = Math.max(0, grossQuantity - soldQuantity);
  const grossInvestedUsd = positions.reduce((sum, lot) => sum + ((lot.purchasePriceUsd || 0) * lot.quantity), 0);
  const grossInvestedJpy = positions.reduce((sum, lot) => sum + ((lot.purchasePriceJpy || 0) * lot.quantity), 0);
  return {
    positions,
    sales,
    purchasePriceUsd: grossQuantity && grossInvestedUsd ? grossInvestedUsd / grossQuantity : null,
    purchasePriceJpy: grossQuantity && grossInvestedJpy ? grossInvestedJpy / grossQuantity : null,
    quantity: quantity || null,
    grossQuantity: grossQuantity || null,
    soldQuantity: soldQuantity || null,
    grossInvestedUsd: grossInvestedUsd || null,
    grossInvestedJpy: grossInvestedJpy || null,
  };
}

function cryptoPnl(amount, ratio, formatter) {
  if (!Number.isFinite(amount) && !Number.isFinite(ratio)) return "-";
  const main = Number.isFinite(amount)
    ? `<span class="pnl-main ${amount >= 0 ? "metric-pos" : "metric-neg"}">${formatter(amount)}</span>`
    : pct(ratio);
  const sub = Number.isFinite(ratio) ? `<small>${signedPct(ratio)}</small>` : "";
  return `<span class="pnl-cell">${main}${sub}</span>`;
}

function lotRow(lot, options = {}) {
  const showAccount = options.accountType === true;
  return `
    <div class="lot-row${showAccount ? " has-account" : ""}">
      <label>
        <span>購入日</span>
        <input name="purchaseDate" type="date" value="${escapeAttr(lot.purchaseDate || "")}">
      </label>
      ${showAccount ? `
      <label>
        <span>口座</span>
        <select name="accountType">${accountTypeOptions(lot.accountType || defaultJpAccountType())}</select>
      </label>` : ""}
      <label>
        <span>購入単価</span>
        <input name="purchasePrice" type="number" min="0" step="0.01" value="${numberValue(lot.purchasePrice)}">
      </label>
      <label>
        <span>株数</span>
        <input name="quantity" type="number" min="0" step="0.0001" value="${numberValue(lot.quantity)}">
      </label>
      <button type="button" class="icon lot-remove" data-remove-lot aria-label="明細を削除">×</button>
    </div>
  `;
}

function saleRow(lot) {
  return `
    <div class="lot-row sale-row">
      <label>
        <span>売却日</span>
        <input name="sellDate" type="date" value="${escapeAttr(lot.sellDate || "")}">
      </label>
      <label>
        <span>売却単価</span>
        <input name="sellPrice" type="number" min="0" step="0.01" value="${numberValue(lot.sellPrice)}">
      </label>
      <label>
        <span>株数</span>
        <input name="sellQuantity" type="number" min="0" step="0.0001" value="${numberValue(lot.quantity)}">
      </label>
      <button type="button" class="icon lot-remove" data-remove-sale aria-label="売却明細を削除">×</button>
    </div>
  `;
}

function readLotRows(form) {
  return [...form.querySelectorAll(".lot-row")]
    .filter((row) => !row.classList.contains("sale-row"))
    .map((row) => {
      const accountType = row.querySelector('[name="accountType"]')?.value;
      return {
        purchaseDate: row.querySelector('[name="purchaseDate"]').value,
        purchasePrice: valueOrNull(row.querySelector('[name="purchasePrice"]').value),
        quantity: valueOrNull(row.querySelector('[name="quantity"]').value),
        ...(accountType ? { accountType: normalizeAccountType(accountType) } : {}),
      };
    })
    .filter((lot) => lot.purchasePrice && lot.quantity)
    .sort((a, b) => (a.purchaseDate || "9999-99-99").localeCompare(b.purchaseDate || "9999-99-99"));
}

function readSaleRows(form) {
  return [...form.querySelectorAll(".sale-row")]
    .map((row) => ({
      sellDate: row.querySelector('[name="sellDate"]').value,
      sellPrice: valueOrNull(row.querySelector('[name="sellPrice"]').value),
      quantity: valueOrNull(row.querySelector('[name="sellQuantity"]').value),
    }))
    .filter((lot) => lot.sellPrice && lot.quantity)
    .sort((a, b) => (a.sellDate || "9999-99-99").localeCompare(b.sellDate || "9999-99-99"));
}

function priceReservationEditor(stock, formatter = yen, priceLabel = "予約価格") {
  const reservation = priceReservationValue(stock);
  return `
    <div class="price-reservation" aria-label="価格予約">
      <div class="reservation-title">
        <strong>価格予約</strong>
        <span>証券口座で入れた指値や予約注文を控える欄です。</span>
      </div>
      <div class="reservation-grid">
        <label>
          <span>種類</span>
          <select name="reservationSide">
            ${reservationSideOptions(reservation.side)}
          </select>
        </label>
        <label>
          <span>${escapeHtml(priceLabel)}</span>
          <input name="reservationPrice" type="number" min="0" step="0.01" value="${numberValue(reservation.price)}" placeholder="例: 2500">
        </label>
        <label>
          <span>株数</span>
          <input name="reservationQuantity" type="number" min="0" step="0.0001" value="${numberValue(reservation.quantity)}" placeholder="例: 100">
        </label>
        <div class="reservation-expiry-field">
          <label>
          <span>期限</span>
          <input name="reservationExpiresAt" type="date" value="${escapeAttr(reservation.expiresAt)}">
          </label>
          <button type="button" class="secondary reservation-clear-button" data-clear-reservation-expiry aria-label="価格予約の期限を消す">期限を消す</button>
        </div>
        <label class="reservation-note">
          <span>メモ</span>
          <input name="reservationNote" type="text" maxlength="80" value="${escapeAttr(reservation.note)}" placeholder="例: 決算後に見直し">
        </label>
      </div>
      <div class="reservation-summary">
        <strong>現在の予約</strong>
        <span>${escapeHtml(priceReservationSummary(reservation, formatter))}</span>
      </div>
    </div>
  `;
}

function priceReservationValue(stock = {}) {
  const source = stock.priceReservation || {};
  const side = ["buy", "sell"].includes(source.side) ? source.side : "";
  return {
    side,
    price: finiteOrNull(source.price),
    quantity: finiteOrNull(source.quantity),
    expiresAt: dateInputValue(source.expiresAt),
    note: String(source.note || "").trim().slice(0, 80),
  };
}

function reservationSideOptions(selected = "") {
  return [
    ["", "未設定"],
    ["buy", "買い予約"],
    ["sell", "売り予約"],
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function reservationSideLabel(value = "") {
  return value === "buy" ? "買い予約" : value === "sell" ? "売り予約" : "";
}

function priceReservationSummary(reservation, formatter = yen) {
  const parts = [];
  const side = reservationSideLabel(reservation.side);
  if (side) parts.push(side);
  if (Number.isFinite(reservation.price)) parts.push(formatter(reservation.price));
  if (Number.isFinite(reservation.quantity)) parts.push(shareCount(reservation.quantity));
  if (reservation.expiresAt) parts.push(`${reservation.expiresAt}まで`);
  if (reservation.note) parts.push(reservation.note);
  return parts.length ? parts.join(" / ") : "未入力";
}

function readPriceReservation(form) {
  if (!form.elements.reservationSide) return null;
  const side = ["buy", "sell"].includes(form.elements.reservationSide.value) ? form.elements.reservationSide.value : "";
  const reservation = {
    side,
    price: valueOrNull(form.elements.reservationPrice.value),
    quantity: valueOrNull(form.elements.reservationQuantity.value),
    expiresAt: dateInputValue(form.elements.reservationExpiresAt.value),
    note: String(form.elements.reservationNote.value || "").trim().slice(0, 80),
  };
  return reservation.side || reservation.price || reservation.quantity || reservation.expiresAt || reservation.note
    ? reservation
    : null;
}

function attachPriceReservationControls(form) {
  const clearExpiryButton = form.querySelector("[data-clear-reservation-expiry]");
  clearExpiryButton?.addEventListener("click", () => {
    const expiryInput = form.elements.reservationExpiresAt;
    if (!expiryInput) return;
    expiryInput.value = "";
    expiryInput.dispatchEvent(new Event("input", { bubbles: true }));
    expiryInput.focus();
  });
}

function jpAccountRecommendationHtml(stock = {}, analysis = {}, metrics = {}) {
  const recommendation = jpAccountRecommendation(stock, analysis, metrics);
  return `
    <div class="account-recommendation ${recommendation.level}">
      <div class="reservation-title">
        <strong>この買い注文の口座判断</strong>
        <span>${escapeHtml(recommendation.badge)}</span>
      </div>
      <p>${escapeHtml(recommendation.summary)}</p>
      <div class="recommendation-metrics">
        <span><strong>判定額</strong>${recommendation.orderAmount ? yen(recommendation.orderAmount) : "-"}</span>
        <span><strong>今年の残り枠</strong>${yen(recommendation.allowance.nisaYearRemaining)}</span>
        <span><strong>生涯の残り枠</strong>${yen(recommendation.allowance.nisaLifetimeRemaining)}</span>
        <span><strong>配当の非課税目安</strong>${yen(recommendation.dividendTaxSaving)}</span>
        <span><strong>値上がり益の非課税目安</strong>${yen(recommendation.capitalGainTaxSaving)}</span>
        <span><strong>NISA枠の使い方</strong>${escapeHtml(recommendation.fitText)}</span>
      </div>
      <div class="recommendation-reasons">
        ${recommendation.reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}
      </div>
    </div>
  `;
}

function jpAccountRecommendation(stock = {}, analysis = {}, metrics = {}) {
  const allowance = nisaAllowanceSummary();
  const reservation = priceReservationValue(stock);
  const targetPrice = finiteOrNull(stock.targetBuyPrice);
  const currentPrice = finiteOrNull(analysis?.price?.current);
  const unitPrice = reservation.side === "buy" && reservation.price
    ? reservation.price
    : targetPrice || currentPrice;
  const quantity = reservation.side === "buy" && reservation.quantity
    ? reservation.quantity
    : 100;
  const orderAmount = unitPrice && quantity ? unitPrice * quantity : null;
  const remaining = allowance.nisaRemaining;
  const exitLevel = String(analysis?.exitPlan?.alertLevel || analysis?.growthExit?.level || analysis?.ai?.growthExit?.level || "").toLowerCase();
  const sellSoon = exitLevel === "exit_alert" || exitLevel === "watch";
  const sellReservation = reservation.side === "sell";
  const fitsNisa = Number.isFinite(orderAmount) && orderAmount > 0 && orderAmount <= remaining;
  const taxRate = clampPctValue(state.settings?.jpCapitalGainTaxPct ?? 20.315) / 100;
  const annualPerShare = annualDividendPerShare(analysis?.price || {});
  const annualDividend = annualPerShare && quantity
    ? annualPerShare * quantity
    : null;
  const dividendTaxSaving = Number.isFinite(annualDividend) ? annualDividend * taxRate : null;
  const expectedSellPrice = expectedJpSellPrice(stock, analysis, reservation);
  const expectedGain = expectedSellPrice && unitPrice && quantity
    ? Math.max(0, (expectedSellPrice - unitPrice) * quantity)
    : null;
  const capitalGainTaxSaving = Number.isFinite(expectedGain) ? expectedGain * taxRate : null;
  const expectedGainPct = expectedSellPrice && unitPrice
    ? ((expectedSellPrice - unitPrice) / unitPrice) * 100
    : null;
  const dividendYield = finiteOrNull(analysis?.price?.dividendYield);
  const action = String(analysis?.action || "").toUpperCase();
  const confidence = finiteOrNull(analysis?.confidence);
  const hasTaxBenefit = (Number.isFinite(dividendTaxSaving) && dividendTaxSaving >= 500)
    || (Number.isFinite(capitalGainTaxSaving) && capitalGainTaxSaving >= 500);
  const highConviction = action === "BUY" || (action === "HOLD" && Number.isFinite(confidence) && confidence >= 55);
  const reasons = [];
  if (!orderAmount) reasons.push("買う金額が未入力なので、口座はまだ決めません。");
  if (orderAmount && !fitsNisa) reasons.push(`この注文額は残りNISA枠${yen(remaining)}を超えます。`);
  if (fitsNisa) reasons.push("今年の成長投資枠と生涯枠の両方に収まります。");
  if (sellReservation) reasons.push("売り予約があるため、この追加購入にNISA枠は使いにくいです。");
  if (sellSoon) reasons.push("出口ルールが見直し寄りなので、NISA枠を使う前に保有理由を確認します。");
  if (action === "SELL") reasons.push("AI確認が見直し候補なので、NISAより一般/特定で様子を見る判断です。");
  if (Number.isFinite(dividendYield)) reasons.push(`配当利回り${dividendYield.toFixed(1)}%、年間配当の税メリット目安は${yen(dividendTaxSaving)}です。`);
  if (Number.isFinite(expectedGainPct)) reasons.push(`想定売却価格までの値上がり余地は${expectedGainPct.toFixed(1)}%、税メリット目安は${yen(capitalGainTaxSaving)}です。`);
  if (!Number.isFinite(expectedGainPct) && !dividendYield) reasons.push("配当や売却目安が弱く、NISA枠を使う根拠がまだ薄いです。");
  if (fitsNisa && !hasTaxBenefit) reasons.push("枠には収まりますが、非課税メリットがまだ小さいためNISAを急ぎません。");
  if (fitsNisa && hasTaxBenefit && !highConviction) reasons.push("税メリットはありますが、買いの確信度が不足しているためNISAは保留寄りです。");
  const recommendNisa = Boolean(fitsNisa && !sellSoon && !sellReservation && hasTaxBenefit && highConviction);
  const fitText = orderAmount && allowance.nisaRemaining
    ? `${Math.min(100, (orderAmount / allowance.nisaRemaining) * 100).toFixed(1)}%消費`
    : "-";
  if (!orderAmount) {
    return {
      level: "watch",
      badge: "未判定",
      summary: "買う価格と株数を入れてから、NISA枠を使う価値があるか判定します。",
      orderAmount,
      allowance,
      dividendTaxSaving,
      capitalGainTaxSaving,
      fitText,
      reasons,
    };
  }
  if (recommendNisa) {
    return {
      level: "good",
      badge: "NISA候補",
      summary: "この注文はNISA候補です。枠内に収まり、配当または値上がり益の非課税メリットが見込めます。",
      orderAmount,
      allowance,
      dividendTaxSaving,
      capitalGainTaxSaving,
      fitText,
      reasons,
    };
  }
  return {
    level: "watch",
    badge: "一般/特定を優先",
    summary: "この注文は一般/特定を優先します。NISA枠を使うには、保有期間・売却目安・税メリットをもう少し確認します。",
    orderAmount,
    allowance,
    dividendTaxSaving,
    capitalGainTaxSaving,
    fitText,
    reasons,
  };
}

function expectedJpSellPrice(stock = {}, analysis = {}, reservation = {}) {
  if (reservation.side === "sell" && Number.isFinite(reservation.price)) return reservation.price;
  const forecast = analysis?.exitPlan?.aiSellForecast || analysis?.sellForecast || analysis?.ai?.sellForecast || {};
  return finiteOrNull(forecast.targetPrice || forecast.reviewPrice);
}

function clampPctValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 20.315;
  return Math.max(0, Math.min(numeric, 60));
}

function dateInputValue(value = "") {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function readCryptoLotRows(form) {
  return [...form.querySelectorAll(".crypto-lot-list .crypto-lot-row")]
    .map((row) => ({
      purchaseDate: row.querySelector('[name="purchaseDate"]')?.value || "",
      purchasePriceUsd: valueOrNull(row.querySelector('[name="purchasePriceUsd"]')?.value),
      purchasePriceJpy: valueOrNull(row.querySelector('[name="purchasePriceJpy"]')?.value),
      quantity: valueOrNull(row.querySelector('[name="quantity"]')?.value),
    }))
    .filter((lot) => lot.quantity && (lot.purchasePriceUsd || lot.purchasePriceJpy))
    .sort((a, b) => (a.purchaseDate || "9999-99-99").localeCompare(b.purchaseDate || "9999-99-99"));
}

function readCryptoSaleRows(form) {
  return [...form.querySelectorAll(".crypto-sale-row")]
    .map((row) => ({
      sellDate: row.querySelector('[name="sellDate"]')?.value || "",
      sellPriceUsd: valueOrNull(row.querySelector('[name="sellPriceUsd"]')?.value),
      sellPriceJpy: valueOrNull(row.querySelector('[name="sellPriceJpy"]')?.value),
      quantity: valueOrNull(row.querySelector('[name="sellQuantity"]')?.value),
    }))
    .filter((lot) => lot.quantity && (lot.sellPriceUsd || lot.sellPriceJpy))
    .sort((a, b) => (a.sellDate || "9999-99-99").localeCompare(b.sellDate || "9999-99-99"));
}

function clearOrRemoveSaleRow(form, button) {
  const rows = [...form.querySelectorAll(".sale-row")];
  if (rows.length <= 1) {
    rows[0].querySelector('[name="sellDate"]').value = "";
    rows[0].querySelector('[name="sellPrice"]').value = "";
    rows[0].querySelector('[name="sellQuantity"]').value = "";
    return;
  }
  button.closest(".sale-row").remove();
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function valueOrNull(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function valueOrZero(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInput(input) {
  return input ? finiteNumber(input.value) : null;
}

function nonNegativeInput(input) {
  if (!input) return null;
  const number = Number(input.value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function roundDisplayPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10) / 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberValue(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? String(value) : "";
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return Math.max(0, Math.floor((now - date) / 86400000));
}

let stockLookupTimer = 0;

async function lookupManagedJapaneseStock() {
  const sequence = ++stockLookupSequence;
  const raw = String(els.stockSymbol?.value || "").trim().toUpperCase();
  const code = raw.match(/^\d{4}(?:\.T)?$/)?.[0];
  if (!code) {
    if (els.stockLookupStatus) els.stockLookupStatus.textContent = "日本株の4桁コードを入力してください。";
    return;
  }
  const symbol = code.endsWith(".T") ? code : `${code}.T`;
  if (els.stockLookupStatus) els.stockLookupStatus.textContent = "会社名と業種を確認しています…";
  try {
    const identity = await request(`/api/stocks/lookup?symbol=${encodeURIComponent(symbol)}`);
    if (sequence !== stockLookupSequence || symbol !== `${String(els.stockSymbol.value).trim().toUpperCase().replace(/\.T$/, "")}.T`) return;
    els.stockName.value = identity.name || "";
    els.stockSector.value = identity.sector || "";
    if (els.stockLookupStatus) {
      els.stockLookupStatus.textContent = `${identity.name || symbol}${identity.sector ? ` / ${identity.sector}` : ""}を取得しました。`;
    }
  } catch (error) {
    if (sequence !== stockLookupSequence) return;
    els.stockName.value = "";
    els.stockSector.value = "";
    if (els.stockLookupStatus) els.stockLookupStatus.textContent = `${error.message} コードだけで保存時にも再確認します。`;
  }
}

els.stockSymbol?.addEventListener("input", () => {
  window.clearTimeout(stockLookupTimer);
  els.stockName.value = "";
  els.stockSector.value = "";
  const raw = String(els.stockSymbol.value || "").trim();
  if (!/^\d{4}(?:\.T)?$/i.test(raw)) {
    stockLookupSequence += 1;
    if (els.stockLookupStatus) els.stockLookupStatus.textContent = "コードを入力すると会社名と業種を自動取得します。";
    return;
  }
  stockLookupTimer = window.setTimeout(() => void lookupManagedJapaneseStock(), 350);
});

els.stockSymbol?.addEventListener("change", () => {
  window.clearTimeout(stockLookupTimer);
  void lookupManagedJapaneseStock();
});

els.stockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/stocks", {
      method: "POST",
      body: JSON.stringify({
        name: els.stockName.value.trim(),
        symbol: els.stockSymbol.value.trim().toUpperCase(),
        sector: els.stockSector.value.trim(),
        purchaseDate: els.stockPurchaseDate.value,
        purchasePrice: valueOrNull(els.stockPurchasePrice.value),
        quantity: valueOrNull(els.stockQuantity.value),
        accountType: normalizeAccountType(els.stockAccountType?.value || defaultJpAccountType()),
        minimumHoldQuantity: valueOrZero(els.stockMinimumHoldQuantity.value),
        positions: readNewStockLot(),
        targetBuyPrice: valueOrNull(els.stockTargetBuyPrice.value),
      }),
    });
    els.stockForm.reset();
    if (els.stockAccountType) els.stockAccountType.value = defaultJpAccountType();
    await loadStocks();
  } catch (error) {
    toast(error.message);
  }
});

function readNewStockLot() {
  const purchaseDate = els.stockPurchaseDate.value;
  const purchasePrice = valueOrNull(els.stockPurchasePrice.value);
  const quantity = valueOrNull(els.stockQuantity.value);
  const accountType = normalizeAccountType(els.stockAccountType?.value || defaultJpAccountType());
  return purchasePrice && quantity ? [{ purchaseDate, purchasePrice, quantity, accountType }] : [];
}

els.usStockForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/us-stocks", {
      method: "POST",
      body: JSON.stringify({
        name: els.usStockName.value.trim(),
        symbol: els.usStockSymbol.value.trim().toUpperCase(),
        market: els.usStockMarket.value,
        purchaseDate: els.usStockPurchaseDate.value,
        purchasePrice: valueOrNull(els.usStockPurchasePrice.value),
        quantity: valueOrNull(els.usStockQuantity.value),
        positions: readNewUsStockLot(),
      }),
    });
    state.usStocks = payload.stocks || [];
    state.usSummary = null;
    state.usSelected = els.usStockSymbol?.value?.trim()?.toUpperCase() || state.usStocks[0]?.symbol || null;
    els.usStockForm.reset();
    toast("米国株を追加しました。");
    renderUs();
  } catch (error) {
    toast(error.message);
  }
});

function readNewUsStockLot() {
  const purchaseDate = els.usStockPurchaseDate.value;
  const purchasePrice = valueOrNull(els.usStockPurchasePrice.value);
  const quantity = valueOrNull(els.usStockQuantity.value);
  return purchasePrice && quantity ? [{ purchaseDate, purchasePrice, quantity }] : [];
}

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        searchProvider: els.settingsSearchProvider.value,
        searxngUrl: els.settingsSearxngUrl.value,
        searxngEngines: els.settingsSearxngEngines.value,
        googleApiKey: els.settingsGoogleApiKey.value,
        googleCseId: els.settingsGoogleCseId.value,
        googleSearchUrl: els.settingsGoogleSearchUrl.value,
        lmStudioUrl: els.settingsLmStudioUrl.value,
        lmStudioTimeoutMs: valueOrNull(els.settingsLmStudioTimeoutMs.value),
        unitSize: valueOrNull(els.settingsUnitSize.value),
        unitBudget: valueOrNull(els.settingsUnitBudget.value),
        unitBudgetUnlimited: els.settingsUnitBudgetUnlimited?.checked === true,
        websiteLimit: clampInput(els.websiteLimit),
        depthLimit: clampInput(els.depthLimit),
        pagesPerSite: clampInput(els.pagesPerSite),
        dailyDiscoveryEnabled: els.settingsDailyDiscoveryEnabled?.checked === true,
        dailyDiscoveryHour: valueOrZero(els.settingsDailyDiscoveryHour?.value),
        hourlyRefreshEnabled: els.settingsHourlyRefreshEnabled?.checked === true,
        marketHoursOnlyRefresh: els.settingsMarketHoursOnlyRefresh?.checked !== false,
        tdnetDisclosureEnabled: els.settingsTdnetDisclosureEnabled?.checked === true,
        tdnetDisclosureLookbackDays: valueOrZero(els.settingsTdnetDisclosureLookbackDays?.value),
        tdnetDisclosureUseLmStudio: els.settingsTdnetDisclosureUseLmStudio?.checked !== false,
        growthExitEnabled: els.settingsGrowthExitEnabled?.checked !== false,
        trailingStopPct: valueOrZero(els.settingsTrailingStopPct?.value),
        onkabuProfitPct: valueOrZero(els.settingsOnkabuProfitPct?.value),
        shareholderMonitorEnabled: els.settingsShareholderMonitorEnabled?.checked !== false,
        shareholderUseLmStudio: els.settingsShareholderUseLmStudio?.checked !== false,
        shareholderChangeThresholdPct: valueOrNull(els.settingsShareholderChangeThresholdPct?.value),
        edinetApiKey: els.settingsEdinetApiKey?.value || "",
        rakutenAccountMemo: els.settingsRakutenAccountMemo?.value || "",
        revolutAccountMemo: els.settingsRevolutAccountMemo?.value || "",
        notificationsEnabled: els.settingsNotificationsEnabled?.checked === true,
        defaultJpAccountType: normalizeAccountType(els.settingsDefaultJpAccountType?.value || "taxable"),
        jpTaxableTradeFeeYen: valueOrZero(els.settingsJpTaxableTradeFeeYen?.value),
        jpNisaTradeFeeYen: valueOrZero(els.settingsJpNisaTradeFeeYen?.value),
        nisaAnnualLimitYen: normalizedNisaAnnualLimitYen(els.settingsNisaAnnualLimitYen?.value),
        jpCapitalGainTaxPct: valueOrZero(els.settingsJpCapitalGainTaxPct?.value),
        usTradeFeeUsd: valueOrZero(els.settingsUsTradeFeeUsd?.value),
        usCapitalGainTaxPct: valueOrZero(els.settingsUsCapitalGainTaxPct?.value),
        notificationMinNetEdgeYen: valueOrZero(els.settingsNotificationMinNetEdgeYen?.value),
        notificationMinConfidence: valueOrNull(els.settingsNotificationMinConfidence?.value),
        teamsWebhookUrl: els.settingsTeamsWebhookUrl?.value || "",
        graphChatId: els.settingsGraphChatId?.value || "",
        graphTenantId: els.settingsGraphTenantId?.value || "",
        graphClientId: els.settingsGraphClientId?.value || "",
        graphClientSecret: els.settingsGraphClientSecret?.value || "",
        graphAccessToken: els.settingsGraphAccessToken?.value || "",
      }),
    });
    applySettings(payload.settings);
    if (payload.discoveryReset) {
      state.suggestions = sanitizeDiscoverySuggestions(payload.discovery?.suggestions || []);
      state.sourceSummary = payload.discovery?.sourceSummary || null;
      state.discoveryGeneratedAt = payload.discovery?.generatedAt || "";
      renderCandidateList();
    }
    els.settingsGoogleApiKey.value = "";
    if (els.settingsEdinetApiKey) els.settingsEdinetApiKey.value = "";
    if (els.settingsTeamsWebhookUrl) els.settingsTeamsWebhookUrl.value = "";
    if (els.settingsGraphClientSecret) els.settingsGraphClientSecret.value = "";
    if (els.settingsGraphAccessToken) els.settingsGraphAccessToken.value = "";
    if (payload.status?.searchEngine) {
      setStatus(els.googleStatus, payload.status.searchEngine.ok, searchStatusText(payload.status.searchEngine, { provider: true }));
      setStatus(els.settingsSearchStatus, payload.status.searchEngine.ok, searchStatusText(payload.status.searchEngine));
    }
    if (payload.status?.lmStudio) {
      setStatus(els.lmStatus, payload.status.lmStudio.ok, payload.status.lmStudio.ok ? payload.status.lmStudio.model || "接続中" : "未接続");
      setStatus(els.settingsLmStatus, payload.status.lmStudio.ok, payload.status.lmStudio.ok ? "接続中" : "未接続");
    }
    applyMarketStatus(payload.status?.markets);
    toast(payload.discoveryReset ? "設定を保存しました。候補条件が変わったので探し直してください。" : "設定を保存しました。");
  } catch (error) {
    toast(error.message);
  }
});

els.settingsUnitBudgetUnlimited?.addEventListener("change", () => {
  if (els.settingsUnitBudget) els.settingsUnitBudget.disabled = els.settingsUnitBudgetUnlimited.checked;
});

els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

els.ideaTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.ideaView = button.dataset.ideaTab || "candidates";
    renderIdeaTabs();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const currentIndex = els.ideaTabButtons.indexOf(button);
    const nextIndex = (currentIndex + direction + els.ideaTabButtons.length) % els.ideaTabButtons.length;
    const nextButton = els.ideaTabButtons[nextIndex];
    state.ideaView = nextButton.dataset.ideaTab || "candidates";
    renderIdeaTabs();
    nextButton.focus();
  });
});

els.settingsTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.settingsTab = button.dataset.settingsTab || "search";
    renderSettingsTabs();
  });
});

els.performanceTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.performanceMarket = button.dataset.performanceMarket === "us" ? "us" : "jp";
    renderPerformance();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const index = els.performanceTabs.indexOf(button);
    const next = els.performanceTabs[(index + direction + els.performanceTabs.length) % els.performanceTabs.length];
    state.performanceMarket = next.dataset.performanceMarket === "us" ? "us" : "jp";
    renderPerformance();
    next.focus();
  });
});

els.analyzeButton.addEventListener("click", analyze);
els.usAnalyzeButton?.addEventListener("click", analyzeUs);
els.cryptoAnalyzeButton?.addEventListener("click", analyzeCrypto);
els.cryptoTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.cryptoView = button.dataset.cryptoTab || "btc";
    renderCryptoTabs();
    renderCryptoDetail();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const index = els.cryptoTabButtons.indexOf(button);
    const next = els.cryptoTabButtons[(index + direction + els.cryptoTabButtons.length) % els.cryptoTabButtons.length];
    state.cryptoView = next.dataset.cryptoTab || "btc";
    renderCryptoTabs();
    renderCryptoDetail();
    next.focus();
  });
});
els.discoverButton.addEventListener("click", () => discover("general"));
els.discoverNisaButton?.addEventListener("click", () => discover("nisa"));
els.diagnosticsButton?.addEventListener("click", runDiagnostics);
els.disclosureCheckButton?.addEventListener("click", checkDisclosures);
els.shareholderCheckButton?.addEventListener("click", checkShareholders);
els.financialCheckButton?.addEventListener("click", checkFinancials);
els.testNotificationButton?.addEventListener("click", testNotification);
els.chart?.addEventListener("pointermove", updateChartHover);
els.chart?.addEventListener("pointerleave", clearChartHover);
window.addEventListener("resize", () => {
  if (isDetailFormEditing()) return;
  if (state.view === "analysis") {
    renderSelection();
    renderStockForecastCharts(els.decisionDetail);
  } else if (state.view === "us") {
    renderUsDetail();
  } else if (state.view === "performance") {
    renderPerformance();
  } else if (state.view === "ideas") {
    redrawVisibleStockForecastCharts(els.candidateList);
    redrawVisibleStockForecastCharts(els.peCandidateList);
  }
});

await loadInitialData();
void refreshAfterBrowserReload();
setInterval(() => {
  if (!document.hidden) void loadStatus();
}, 60000);
setInterval(syncBackgroundPrices, 15000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void syncBackgroundPrices();
});

async function loadInitialData() {
  renderNavigation();
  renderIdeaTabs();
  renderSettingsTabs();
  renderCurrentDataView();
  void safeLoad("設定", loadSettings);
  void safeLoad("接続状態", loadStatus);
  await safeLoad("表示データ", () => ensureViewData(state.view), (error) => {
    if (state.view === "analysis" || state.view === "stocks") {
      state.stocksLoaded = true;
      state.stockLoadError = `銘柄を読み込めませんでした。${error.message || ""}`.trim();
    }
    renderCurrentDataView();
  });
}

async function refreshAfterBrowserReload() {
  if (navigationType() !== "reload") return;
  if (state.view === "us") {
    await analyzeUs({ source: "reload" });
    return;
  }
  if (state.view === "crypto") {
    await analyzeCrypto({ source: "reload" });
    return;
  }
  if (state.view !== "analysis") return;
  await analyze({ source: "reload" });
}

function navigationType() {
  try {
    const entry = performance.getEntriesByType("navigation")?.[0];
    if (entry?.type) return entry.type;
    if (performance.navigation?.type === 1) return "reload";
  } catch {
    // 古いiOSブラウザではNavigation Timingが取れないことがあります。
  }
  return "";
}

async function safeLoad(label, fn, onError = null) {
  try {
    await fn();
    return true;
  } catch (error) {
    console.error(`${label}の読み込みに失敗しました`, error);
    if (onError) onError(error);
    else toast(`${label}の読み込みに失敗しました。`);
    return false;
  }
}
