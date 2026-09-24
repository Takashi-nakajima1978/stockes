import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rename, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createSingleFlight, dividendEventSeasonality, isBuyReversalPending, preserveNewerPrices } from "../refresh-control.mjs";

const serverSource = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const logoSource = await readFile(new URL("../public/stock-signal-logo.svg", import.meta.url), "utf8");

function loadFunction(source, name, globals) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.notEqual(start, -1);
  const end = source.indexOf("\n}", start) + 2;
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, globals);
}

function loadFunctionBlock(source, name, endName, globals = {}) {
  const start = source.search(new RegExp(`^function ${name}\\(`, "m"));
  assert.notEqual(start, -1);
  const end = source.search(new RegExp(`^function ${endName}\\(`, "m"));
  assert.ok(end > start);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, globals);
}

test("overlapping refreshes share work and can retry after a failure", async () => {
  const run = createSingleFlight();
  let release;
  let calls = 0;
  const task = () => { calls++; return new Promise((resolve) => { release = resolve; }); };
  const first = run("JP", task);
  const second = run("JP", task);
  await Promise.resolve();
  assert.equal(calls, 1);
  release(42);
  assert.equal(await first, 42);
  assert.equal(await second, 42);
  await assert.rejects(run("JP", () => { throw new Error("offline"); }));
  assert.equal(await run("JP", () => 43), 43);
});

test("late analysis retains newer prices and new research", () => {
  const newer = { symbol: "X", price: { current: 120, fetchedAt: "2026-09-10T01:05:00Z" }, position: { pnl: 20 }, exitPlan: { price: 110 } };
  const analysis = { symbol: "X", price: { current: 100, fetchedAt: "2026-09-10T01:00:00Z" }, thesis: "new research" };
  const [merged] = preserveNewerPrices([analysis], [newer]);
  assert.equal(merged.price.current, 120);
  assert.equal(merged.thesis, "new research");
  assert.deepEqual(merged.position, newer.position);
  assert.deepEqual(merged.exitPlan, newer.exitPlan);
  assert.equal(preserveNewerPrices([newer], [analysis])[0], newer);
});

test("buy signals near the buy line wait for a reversal confirmation", () => {
  assert.equal(isBuyReversalPending({
    current: 2515,
    buyLine1y: 2493,
    return1m: -13.9,
    rsi14: 12.7,
    technicalEntry: {
      ready: false,
      score: 60,
      buyLine: 2493,
    },
    regime: { panicPullbackPct: 46 },
  }), true);
  assert.equal(isBuyReversalPending({
    current: 2515,
    buyLine1y: 2493,
    return1m: -13.9,
    rsi14: 32,
    technicalEntry: {
      ready: true,
      score: 78,
      buyLine: 2493,
    },
    regime: { panicPullbackPct: 46 },
  }), false);
  assert.equal(isBuyReversalPending({
    current: 2700,
    buyLine1y: 2493,
    return1m: -13.9,
    rsi14: 12.7,
    technicalEntry: {
      ready: false,
      score: 60,
      buyLine: 2493,
    },
    regime: { panicPullbackPct: 46 },
  }), false);
});

test("dividend seasonality flags upcoming rights demand", () => {
  const signal = dividendEventSeasonality({
    dividendYield: 3.9,
    dividendEvents: [
      { date: "2025-03-31", amount: 60 },
      { date: "2025-09-30", amount: 50 },
      { date: "2026-03-31", amount: 73 },
    ],
  }, { today: "2026-09-12" });
  assert.equal(signal.label, "権利取り前");
  assert.equal(signal.nextDate, "2026-09-30");
  assert.equal(signal.daysToNext, 18);
  assert.ok(signal.score >= 10);
});

test("technical entry uses golden cross and closing strength experience rules", () => {
  assert.match(serverSource, /function movingAverageCrossSignal/);
  assert.match(serverSource, /function closingStrengthSignal/);
  assert.match(serverSource, /ゴールデンクロス/);
  assert.match(serverSource, /大引け強/);
  assert.match(appSource, /ゴールデンクロス/);
  assert.match(appSource, /大引けの強さ/);
  assert.match(appSource, /technicalExperienceBadge/);
});

test("browser logo is wired to favicon and app brand", () => {
  assert.match(indexSource, /rel="icon" href="\/stock-signal-logo\.svg"/);
  assert.match(indexSource, /class="brand-logo"/);
  assert.match(logoSource, /viewBox="0 0 64 64"/);
  assert.match(logoSource, /#0b6b58/);
  assert.match(serverSource, /"\.svg": "image\/svg\+xml; charset=utf-8"/);
  assert.match(serverSource, /stock-signal-logo\.svg/);
});

test("day trade feature has simulation, candidates, and guarded Rakuten RSS bridge", () => {
  assert.match(indexSource, /data-view-target="daytrade"/);
  assert.match(indexSource, /data-view="daytrade"/);
  assert.match(indexSource, /dayTradeWatchlist/);
  assert.match(indexSource, /dayTradeStopMode/);
  assert.match(indexSource, /dayTradeChaseReference/);
  assert.match(indexSource, /dayTradeStartButton/);
  assert.match(indexSource, /dayTradeStopButton/);
  assert.match(indexSource, /dayTradeSimulation/);
  assert.match(indexSource, /dayTradeAutoEntryEnabled/);
  assert.match(indexSource, /dayTradeFollowPrice/);
  assert.match(indexSource, /dayTradeSelectAllButton/);
  assert.match(indexSource, /dayTradeClearSelectionButton/);
  assert.match(indexSource, /dayTradeAutopilotButton/);
  assert.match(indexSource, /dayTradeAutopilotStartButton/);
  assert.match(indexSource, /dayTradeTargetStocksPct/);
  assert.match(indexSource, /data-settings-tab="broker"/);
  assert.match(indexSource, /settingsRakutenRssBridgeUrl/);
  assert.match(indexSource, /settingsDayTradeStopYen/);
  assert.match(indexSource, /settingsDayTradeProfitYen/);
  assert.match(indexSource, /settingsDayTradeChaseYen/);
  assert.match(appSource, /\/api\/daytrade\/simulate/);
  assert.match(appSource, /\/api\/daytrade\/entry/);
  assert.match(appSource, /\/api\/daytrade\/simulation/);
  assert.match(appSource, /\/api\/daytrade\/autopilot/);
  assert.match(appSource, /\/api\/daytrade\/learning/);
  assert.match(appSource, /\/api\/daytrade\/runtime/);
  assert.match(appSource, /runDayTradeAutopilot/);
  assert.match(appSource, /loadDayTradeRuntimeState/);
  assert.match(appSource, /persistDayTradeRuntime/);
  assert.match(appSource, /resumeDayTradeSimulation/);
  assert.match(appSource, /recordDayTradeLearningFromMonitor/);
  assert.match(appSource, /dayTradeAdaptivePayload/);
  assert.match(appSource, /settingsDayTradeStopMode/);
  assert.match(appSource, /aiStateBadge/);
  assert.match(appSource, /autopilotPolicyHtml/);
  assert.match(appSource, /applyDayTradeAutoEntry/);
  assert.match(appSource, /pollDayTradeSimulationPrice/);
  assert.match(appSource, /dayTradeMultiSelected/);
  assert.match(appSource, /startDayTradeMultiMonitor/);
  assert.match(appSource, /pollDayTradeMultiSimulationPrices/);
  assert.match(appSource, /startDayTradeSimulation/);
  assert.match(appSource, /stopDayTradeSimulation/);
  assert.match(appSource, /\/api\/daytrade\/candidates/);
  assert.match(appSource, /\/api\/daytrade\/order/);
  assert.match(appSource, /\/api\/daytrade-watchlist/);
  assert.match(serverSource, /function buildDayTradePlan/);
  assert.match(serverSource, /function buildDayTradeEntryRecommendation/);
  assert.match(serverSource, /function buildDayTradeSimulation/);
  assert.match(serverSource, /function buildDayTradeAutopilot/);
  assert.match(serverSource, /DAY_TRADE_RUNTIME_PATH/);
  assert.match(serverSource, /function readDayTradeRuntime/);
  assert.match(serverSource, /function saveDayTradeRuntime/);
  assert.match(serverSource, /function normalizeDayTradeRuntime/);
  assert.match(serverSource, /function dayTradeAutopilotPolicy/);
  assert.match(serverSource, /function candidatePassesAutopilotPolicy/);
  assert.match(serverSource, /function dayTradeLearningOverview/);
  assert.match(serverSource, /function dayTradeAdaptiveRules/);
  assert.match(serverSource, /function dayTradeAiState/);
  assert.match(serverSource, /function dayTradeLearningScore/);
  assert.match(serverSource, /function recordDayTradeLearning/);
  assert.match(serverSource, /Stock 59% \/ Bonds 39% \/ Cash 2%/);
  assert.match(serverSource, /monitorMode: true/);
  assert.match(serverSource, /function dayTradeCandidates/);
  assert.match(serverSource, /function readDayTradeWatchlist/);
  assert.match(serverSource, /normalizeDayTradeOffsetMode/);
  assert.match(serverSource, /東証プライム値動き検索/);
  assert.match(serverSource, /RssStockOrder/);
  assert.match(serverSource, /confirm=true/);
  assert.match(serverSource, /rakutenOrderEnabled/);
});

test("Japan watchlist resolves sectors and shows FX/overseas sales context", () => {
  assert.match(serverSource, /const JP_SECTOR_BY_SYMBOL/);
  assert.match(serverSource, /"6804\.T": "電子部品"/);
  assert.match(serverSource, /"5930\.T": "金属製品"/);
  assert.match(serverSource, /"6506\.T": "FA"/);
  assert.match(serverSource, /"9020\.T": "鉄道"/);
  assert.match(serverSource, /"9936\.T": "外食"/);
  assert.match(serverSource, /const JP_SECTOR_NAME_ALIASES/);
  assert.match(serverSource, /"電気機器": "電機"/);
  assert.match(serverSource, /"その他金融業": "金融"/);
  assert.match(serverSource, /function buildIndustryProfile/);
  assert.match(serverSource, /function readUsdJpyContext/);
  assert.match(serverSource, /overseasSalesRatio/);
  assert.match(serverSource, /業種動向|業界動向/);
  assert.match(appSource, /業種・為替/);
  assert.match(appSource, /為替影響/);
  assert.match(appSource, /海外売上比率/);
});

test("Japan evidence search rejects product manuals that only contain ticker-like model numbers", () => {
  const start = serverSource.indexOf("function jpStockEvidenceQueries");
  const end = serverSource.indexOf("function buildDiscoveryProcess", start);
  assert.ok(start > 0 && end > start);
  const fns = vm.runInNewContext(`${serverSource.slice(start, end)}; ({ jpStockEvidenceQueries, jpStockFallbackEvidence, isJpStockSpecificEvidence, jpEvidenceHasCode })`, {
    JP_COMPANY_ALIASES_BY_SYMBOL: { "4755.T": ["楽天グループ", "楽天", "Rakuten Group", "Rakuten"] },
    normalizeUrl: (value = "") => String(value || ""),
    cleanText: (value = "") => String(value || "").replace(/\s+/g, " ").trim(),
    escapeRegExp: (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    uniqueText: (items = []) => [...new Set(items.filter(Boolean))],
    normalizeSymbol: (value = "") => {
      const symbol = String(value || "").trim().toUpperCase();
      if (!symbol) return "";
      return symbol.includes(".") ? symbol : `${symbol}.T`;
    },
    stockSector: () => "サービス",
  });
  const rakuten = { symbol: "4755.T", name: "楽天", market: "東証" };
  const manual = {
    title: "Canon : Manuals : TR4755i : Setup - Windows 11 in S mode",
    snippet: "キヤノンTR4755iのセットアップガイド。プリンター接続方法を解説。",
    url: "https://ij.manual.canon/ij/webmanual/TR4755i",
  };
  const yahoo = {
    title: "楽天グループ【4755.T】ニュース",
    snippet: "決算、業績、配当など株価材料を掲載。",
    url: "https://finance.yahoo.co.jp/quote/4755.T/news",
  };
  assert.equal(fns.jpEvidenceHasCode(manual, "4755"), false);
  assert.equal(fns.isJpStockSpecificEvidence(manual, rakuten), false);
  assert.equal(fns.isJpStockSpecificEvidence(yahoo, rakuten), true);
  assert.match(fns.jpStockEvidenceQueries(rakuten)[0].text, /楽天グループ/);
  assert.equal(JSON.stringify(fns.jpStockFallbackEvidence(rakuten).map((item) => item.url)), JSON.stringify([
    "https://kabutan.jp/stock/news?code=4755",
    "https://finance.yahoo.co.jp/quote/4755.T/news",
  ]));
  assert.match(serverSource, /function sanitizeJpAnalysisEvidence/);
  assert.match(serverSource, /const evidence = sanitizeJpAnalysisEvidence\(analysis\.evidence \|\| \[\], resolvedStock\)/);
});

test("LM prompts use English reasoning with Japanese output guardrails", () => {
  assert.match(serverSource, /LM_STRICT_JSON_INSTRUCTIONS/);
  assert.match(serverSource, /Use English for analysis, classification, scoring/);
  assert.match(serverSource, /Write every user-facing natural-language field in clear, natural Japanese/);
  assert.match(serverSource, /LM_STUDIO_STATUS_CACHE_MS/);
  assert.match(serverSource, /function rememberLmStudioOk/);
  assert.match(serverSource, /function recentLmStudioStatus/);
  assert.match(serverSource, /discoveryAiWarning/);
  assert.match(appSource, /AI再点検メモ/);
  assert.match(appSource, /searchCandidates is not defined/);
  assert.doesNotMatch(serverSource, /あなたは(日本株|米国株|株主構成|.*AI)/);
  assert.doesNotMatch(serverSource, /出力はJSONのみ|返答はこのJSONだけ/);
});

test("Japan discovery EDINET review is not capped to top candidates", () => {
  const discoverStart = serverSource.indexOf("async function discoverStocks");
  const discoverEnd = serverSource.indexOf("function discoveryUniverseStats", discoverStart);
  const discoverBody = serverSource.slice(discoverStart, discoverEnd);
  const refreshStart = serverSource.indexOf("async function refreshDiscoveryFinancials");
  const refreshEnd = serverSource.indexOf("function applyDiscoveryFinancialAdjustment", refreshStart);
  const refreshBody = serverSource.slice(refreshStart, refreshEnd);
  const partialStart = serverSource.indexOf("async function savePartialDiscovery");
  const partialEnd = serverSource.indexOf("async function readPrimeUniverse", partialStart);
  const partialBody = serverSource.slice(partialStart, partialEnd);
  assert.doesNotMatch(discoverBody, /DISCOVERY_FINANCIAL_REVIEW_LIMIT|slice\(0,\s*48\)/);
  assert.doesNotMatch(refreshBody, /DISCOVERY_FINANCIAL_REVIEW_LIMIT|slice\(0,\s*48\)/);
  assert.ok(discoverBody.indexOf("refreshDiscoveryFinancials(pricedCandidates") < discoverBody.indexOf("const prelimPool = scored"));
  assert.match(discoverBody, /const shortlist = uniqueBy\(rawShortlist/);
  assert.doesNotMatch(partialBody, /searchCandidates:\s*resolvedSearchCandidates/);
  assert.match(partialBody, /searchCandidates = \[\]/);
});

test("Japan watchlist decisions do not mark unconfirmed pullbacks as buy candidates", () => {
  const safety = loadFunction(serverSource, "decisionSafetyOverride", {
    positionMetrics: () => ({}),
    nullablePositiveNumber: (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    },
    formatYen: (value) => `¥${Number(value).toLocaleString("ja-JP")}`,
    formatSignedPercent: (value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`,
    isBuyReversalPending,
    isHighChaseChart: () => false,
    isNoUpsideChart: () => false,
  });
  const result = safety({ name: "ホシデン", holding: false }, {
    current: 2515,
    buyLine1y: 2493,
    return1m: -13.9,
    rsi14: 12.7,
    technicalEntry: { ready: false, score: 60, buyLine: 2493 },
    regime: { panicPullbackPct: 46 },
  }, "BUY", {});
  assert.equal(result.action, "WATCH");
  assert.equal(result.confidence, 64);
  assert.match(result.thesis, /反転待ち/);
});

test("Japan holding is not marked as a sell review without loss or exit evidence", () => {
  const safety = loadFunction(serverSource, "decisionSafetyOverride", {
    positionMetrics: () => ({}),
    nullablePositiveNumber: (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    },
    formatYen: (value) => `¥${Number(value).toLocaleString("ja-JP")}`,
    formatSignedPercent: (value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`,
    isBuyReversalPending: () => false,
    isHighChaseChart: () => false,
    isNoUpsideChart: () => false,
  });
  const result = safety({ name: "ゴールドウイン", holding: true }, {
    current: 2139,
    return1y: -11.9,
    return3y: -38.4,
    trend3y: "DOWN",
    sma50: 2100,
    sma200: 2500,
  }, "SELL", { totalReturnPct: 1.4, pnlPct: 1.4, quantity: 100 }, { growthExit: { level: "normal" } });
  assert.equal(result.action, "HOLD");
  assert.match(result.thesis, /見直し候補ではなく保有継続/);
});

test("US portfolio summary counts only open holdings and uses dividend-included result", () => {
  const hasOpenPosition = loadFunction(serverSource, "hasOpenPosition", {});
  const summaryForUs = loadFunction(serverSource, "usPortfolioSummary", { hasOpenPosition });
  const summary = summaryForUs([
    {
      symbol: "LOSS",
      holding: true,
      position: {
        grossInvested: 100,
        invested: 100,
        marketValue: 90,
        pnlAmount: -10,
        totalReturnAmount: -5,
        grossQuantity: 10,
        soldQuantity: 0,
        quantity: 10,
      },
    },
    {
      symbol: "SOLD",
      holding: true,
      position: {
        grossInvested: 100,
        invested: null,
        marketValue: null,
        pnlAmount: 20,
        totalReturnAmount: 20,
        grossQuantity: 10,
        soldQuantity: 10,
        quantity: null,
      },
    },
    {
      symbol: "DIVWIN",
      holding: true,
      position: {
        grossInvested: 100,
        invested: 100,
        marketValue: 95,
        pnlAmount: -5,
        dividendReceived: 8,
        totalReturnAmount: 3,
        grossQuantity: 10,
        soldQuantity: 0,
        quantity: 10,
      },
    },
  ]);
  assert.equal(summary.winCount, 1);
  assert.equal(summary.lossCount, 1);
  assert.equal(summary.grossInvested, 200);
  assert.match(appSource, /symbolLinkHtml\(stock\.symbol, "us"\).*保有/s);
  assert.match(appSource, /売却済み/);
});

test("detail pages show absolute dividend amounts without changing watchlist dividend cell", () => {
  assert.match(appSource, /function dividendPerShareText/);
  assert.match(appSource, /function annualDividendText/);
  assert.match(appSource, /function dividendCell[\s\S]*<strong>\$\{yieldText\}<\/strong>/);
  assert.match(indexSource, /id="dividendReceivedTotal"/);
  assert.match(indexSource, /id="usDividendReceivedTotal"/);
  assert.match(appSource, /dividendReceivedTotal: document\.getElementById\("dividendReceivedTotal"\)/);
  assert.match(appSource, /usDividendReceivedTotal: document\.getElementById\("usDividendReceivedTotal"\)/);
  assert.match(appSource, /els\.dividendReceivedTotal[\s\S]*summary\.dividendReceived/);
  assert.match(appSource, /els\.usDividendReceivedTotal[\s\S]*summary\.dividendReceived/);
  assert.match(appSource, /function jpAiConfirmationHtml[\s\S]*<strong>配当利回り<\/strong>[\s\S]*<strong>1株配当<\/strong>[\s\S]*<strong>年間配当目安<\/strong>/);
  assert.match(appSource, /function renderUsDetail[\s\S]*<strong>配当利回り<\/strong>[\s\S]*<strong>1株配当<\/strong>[\s\S]*<strong>年間配当目安<\/strong>/);
  assert.match(appSource, /function positionEditor[\s\S]*<strong>1株配当<\/strong>[\s\S]*<strong>年間配当目安<\/strong>/);
  assert.match(appSource, /function usPositionEditor[\s\S]*<strong>1株配当<\/strong>[\s\S]*<strong>年間配当目安<\/strong>/);
});

test("price charts show visible purchase and sale markers", () => {
  assert.match(appSource, /function chartTradeMarkers/);
  assert.match(appSource, /function drawChartTradeMarkers/);
  assert.match(appSource, /drawChart\(analysis\?\.price\?\.series \|\| \[\], stock \? chartTradeMarkers\(stock\) : \[\]\)/);
  assert.match(appSource, /renderEmbeddedPriceChart\(els\.usDetail, analysis\?\.price\?\.series \|\| \[\], usd, chartTradeMarkers\(stock\)\)/);
  assert.match(appSource, /const label = marker\.type === "sell" \? "売" : "買"/);
});

test("mobile position entry is not closed by keyboard resize or background refresh", () => {
  assert.match(appSource, /const DETAIL_FORM_EDIT_HOLD_MS = 8000/);
  assert.match(appSource, /function attachDetailFormEditGuard/);
  assert.match(appSource, /window\.addEventListener\("resize", \(\) => \{[\s\S]*if \(isDetailFormEditing\(\)\) return;[\s\S]*renderSelection\(\);[\s\S]*\}\)/);
  assert.match(appSource, /if \(!isDetailFormEditing\(\) && !document\.activeElement\?\.closest\("form"\)\) renderSelection\(\)/);
  assert.match(appSource, /function attachPositionForm\(symbol\)[\s\S]*attachDetailFormEditGuard\(form\)/);
  assert.match(appSource, /function attachUsPositionForm\(symbol\)[\s\S]*attachDetailFormEditGuard\(form\)/);
  assert.match(appSource, /function attachCryptoPositionForm\(\)[\s\S]*attachDetailFormEditGuard\(form\)/);
});

test("position forms persist price reservations and show NISA account guidance", () => {
  assert.match(appSource, /function priceReservationEditor/);
  assert.match(appSource, /name="reservationPrice"/);
  assert.match(appSource, /data-clear-reservation-expiry/);
  assert.match(appSource, /function readPriceReservation/);
  assert.match(appSource, /function attachPriceReservationControls/);
  assert.match(appSource, /expiryInput\.value = ""/);
  assert.match(appSource, /function attachPositionForm\(symbol\)[\s\S]*priceReservation: readPriceReservation\(form\)/);
  assert.match(appSource, /function attachUsPositionForm\(symbol\)[\s\S]*priceReservation: readPriceReservation\(form\)/);
  assert.match(appSource, /function attachPositionForm\(symbol\)[\s\S]*attachPriceReservationControls\(form\)/);
  assert.match(appSource, /function attachUsPositionForm\(symbol\)[\s\S]*attachPriceReservationControls\(form\)/);
  assert.match(appSource, /function jpAccountRecommendationHtml/);
  assert.match(appSource, /この買い注文の口座判断/);
  assert.match(appSource, /配当の非課税目安/);
  assert.match(appSource, /値上がり益の非課税目安/);
  assert.match(serverSource, /function normalizePriceReservation/);
  assert.match(serverSource, /function normalizeStock\(stock\)[\s\S]*priceReservation: normalizePriceReservation\(stock\.priceReservation\)/);
  assert.match(serverSource, /function normalizeUsStock\(stock\)[\s\S]*priceReservation: normalizePriceReservation\(stock\.priceReservation\)/);
});

test("dividend estimates prefer forecast annual dividend over stale trailing events", () => {
  const enrich = loadFunction(serverSource, "enrichPriceDividendForecast", {
    nullablePositiveNumber: (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    },
    projectedAnnualDividendFromEvents: () => null,
    normalizeYahooDividendYield: (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      return numeric <= 1 ? numeric * 100 : numeric;
    },
    normalizeDate: (value) => String(value || "").slice(0, 10),
  });
  const price = enrich(
    { current: 100, dividendPerShareTtm: 3, dividendYield: 3, dividendEvents: [{ date: "2024-08-07", amount: 0.5 }] },
    { forwardAnnualDividendRate: 5, dividendYield: 0.05, exDividendDate: "2026-09-30" },
  );
  assert.equal(price.dividendPerShareAnnual, 5);
  assert.equal(price.dividendPerShareForward, 5);
  assert.equal(price.dividendYield, 5);
  assert.equal(price.dividendAnnualSource, "会社予想");
  assert.equal(price.dividendNextDate, "2026-09-30");
  assert.match(serverSource, /const anchorTime = Date\.now\(\)/);
  assert.match(serverSource, /includeDividendForecast: true/);
  assert.match(appSource, /function annualDividendPerShare/);
});

test("dividend-included return uses rights/ex-dividend entitlement dates", () => {
  const serverDividends = loadFunctionBlock(serverSource, "dividendsForPositionHistory", "evaluateEntryPrice");
  const appDividends = loadFunctionBlock(appSource, "dividendsForPositionHistory", "positionPnl");
  for (const dividends of [serverDividends, appDividends]) {
    assert.equal(dividends(
      [{ purchaseDate: "2026-03-27", purchasePrice: 1000, quantity: 100 }],
      [],
      [{ date: "2026-03-31", amount: 30 }],
      { symbol: "9005.T" },
    ), 3000);
    assert.equal(dividends(
      [{ purchaseDate: "2026-03-30", purchasePrice: 1000, quantity: 100 }],
      [],
      [{ date: "2026-03-31", amount: 30 }],
      { symbol: "9005.T" },
    ), 0);
    assert.equal(dividends(
      [{ purchaseDate: "2026-03-20", purchasePrice: 1000, quantity: 100 }],
      [{ sellDate: "2026-03-27", sellPrice: 1000, quantity: 100 }],
      [{ date: "2026-03-31", amount: 30 }],
      { symbol: "9005.T" },
    ), 0);
    assert.equal(dividends(
      [{ purchaseDate: "2026-07-08", purchasePrice: 40, quantity: 10 }],
      [{ sellDate: "2026-07-09", sellPrice: 40, quantity: 10 }],
      [{ exDividendDate: "2026-07-09", amount: 1.5 }],
      { symbol: "NKE", market: "NYSE" },
    ), 15);
    assert.equal(dividends(
      [{ purchaseDate: "2026-07-09", purchasePrice: 40, quantity: 10 }],
      [],
      [{ exDividendDate: "2026-07-09", amount: 1.5 }],
      { symbol: "NKE", market: "NYSE" },
    ), 0);
  }
});

test("Kadoya-style PE take-private pattern is not filtered out as food", () => {
  const avoidPattern = (serverSource.match(/const DISCOVERY_AVOID_SECTOR_PATTERN = ([^\n]+);/) || [])[1] || "";
  assert.doesNotMatch(avoidPattern, /食品|食料品|consumer staples|packaged foods/);
  assert.match(serverSource, /"2612\.T": "食品"/);
  assert.match(serverSource, /かどや製油/);
  assert.match(serverSource, /brand_staple/);
  const searchPeSignal = loadFunction(serverSource, "searchPeSignal", {
    PE_CRITERIA: [
      { key: "cashflow", label: "安定キャッシュフロー", words: ["安定収益"], weight: 14 },
      { key: "shareholder", label: "株主変化", words: ["創業家", "大株主", "不応募"], weight: 20 },
      { key: "brand_staple", label: "老舗ブランド・生活必需品", words: ["ブランド", "食品", "海外展開", "原材料高"], weight: 10 },
      { key: "restructuring", label: "再編余地", words: ["TOB", "非公開化"], weight: 20 },
    ],
    PE_BUYER_WORDS: ["投資ファンド", "TOB", "株主"],
    PE_DIRECT_BUYER_WORDS: ["投資ファンド", "TOB", "非公開化"],
    PE_TAKE_PRIVATE_MOTIVE_WORDS: [],
    PE_PRIORITY_MIN_SCORE: 45,
    PE_STRONG_MIN_SCORE: 55,
    PE_RECENT_TENDENCIES: [],
    businessContextText: (value) => String(value || "").toLowerCase(),
    normalizeFinancialCriteria: (items) => items,
    financialCriteriaScore: () => 35,
    isHighChaseChart: () => false,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    hostOf: () => "source.test",
    normalizeFinancialSnapshot: (value) => value,
    uniqueText: (items) => [...new Set(items)],
    peSignalSummary: (_label, _criteria, _buyerHits, options = {}) => [
      ...(options.ownerDealHits?.length ? ["株主構造"] : []),
      ...(options.brandTakePrivateHits?.length ? ["かどや型材料"] : []),
    ].join("・"),
  });
  const signal = searchPeSignal(
    { symbol: "2612.T", name: "かどや製油", sector: "食品", notes: "老舗ブランド 創業家 大株主 不応募 安定収益 海外展開 原材料高" },
    [],
    [{ title: "投資ファンドがTOBで非公開化", snippet: "創業家と大株主が残り、ブランドを維持して海外展開を進める", url: "https://source.test/kadoya" }],
    { criteria: [
      { key: "market_cap", label: "時価総額", status: "pass", summary: "対象範囲" },
      { key: "operating_cf", label: "営業CF", status: "pass", summary: "プラス" },
      { key: "net_cash", label: "ネットキャッシュ", status: "unknown", summary: "未確認" },
      { key: "pbr", label: "PBR", status: "unknown", summary: "未確認" },
    ] },
  );
  assert.equal(signal.reportEligible, true);
  assert.ok(signal.matchScore >= 55);
  assert.match(signal.summary, /株主構造|かどや型材料/);
});

test("Nihon M&A Center TOB articles feed PE discovery learning", () => {
  assert.match(serverSource, /PE_DEAL_SOURCE_URLS[\s\S]*nihon-ma\.co\.jp\/news\/keyword\/takeoverbit/);
  assert.match(serverSource, /site:nihon-ma\.co\.jp\/news\/keyword\/takeoverbit/);
  assert.match(serverSource, /function fetchNihonMaPeNews/);
  assert.match(serverSource, /日本M&AセンターのTOB\/MBO実例/);
  assert.match(appSource, /日本M&AセンターのTOB\/MBO実例も参照/);

  const cleanTextForTest = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const cleanCandidateNameForTest = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const nihonMaTargetName = loadFunction(serverSource, "nihonMaTargetName", {
    cleanText: cleanTextForTest,
    cleanCandidateName: cleanCandidateNameForTest,
  });
  const normalizeSymbolForTest = (value = "") => {
    const symbol = String(value || "").trim().toUpperCase();
    return symbol.includes(".") ? symbol : `${symbol}.T`;
  };
  const hostOfForTest = (value = "") => {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const isNihonMaPublisherCandidate = loadFunction(serverSource, "isNihonMaPublisherCandidate", {
    cleanText: cleanTextForTest,
    hostOf: hostOfForTest,
  });
  const extractNihonMaNewsResults = loadFunction(serverSource, "extractNihonMaNewsResults", {
    URL,
    cleanText: cleanTextForTest,
    htmlToText: (value) => String(value || "").replace(/<[^>]+>/g, " "),
    cleanCandidateName: cleanCandidateNameForTest,
    nihonMaTargetName,
    normalizeSymbol: normalizeSymbolForTest,
    isNihonMaPublisherCandidate,
  });
  const rows = extractNihonMaNewsResults(
    '<a href="/news/20260914_2612-5/">インテグラル傘下のITG-G HDがかどや製油にTOBへ</a>',
    "https://www.nihon-ma.co.jp/news/",
    5,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /かどや製油/);
  assert.doesNotMatch(rows[0].title, /<2612>/);
  assert.match(rows[0].snippet, /公開買付|非公開化|投資ファンド/);
  assert.equal(extractNihonMaNewsResults(
    '<a href="/news/20260914_3395-1/">日本M&AセンターのTOB/MBO実例</a>',
    "https://www.nihon-ma.co.jp/news/",
    5,
  ).length, 0);

  const isDiscoverySourceOnlyCandidate = loadFunction(serverSource, "isDiscoverySourceOnlyCandidate", {
    cleanText: cleanTextForTest,
    isNihonMaPublisherCandidate,
  });
  const extractDiscoveryCandidates = loadFunctionBlock(serverSource, "extractDiscoveryCandidates", "resolveCandidateFromPrice", {
    cleanText: cleanTextForTest,
    normalizeSymbol: normalizeSymbolForTest,
    normalizeUsSymbol: (value = "") => String(value || "").trim().toUpperCase(),
    cleanTextForTest,
    uniqueBy: (items = [], keyFn) => {
      const seen = new Set();
      return items.filter((item) => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    US_TICKER_STOPWORDS: new Set(),
    isNihonMaPublisherCandidate,
    isDiscoverySourceOnlyCandidate,
  });
  assert.equal(extractDiscoveryCandidates(rows).length, 0);
  assert.equal(extractDiscoveryCandidates([{
    title: "ぴ所存を主たる目的として設立された会社<5842>",
    snippet: "公開買付者が対象者の普通株式を取得するために設立された会社です。",
    url: "https://www.nihon-ma.co.jp/news/20260914_5842-1/",
  }]).length, 0);
  assert.equal(extractDiscoveryCandidates([{
    title: "日本M&AセンターのTOB<3395>",
    snippet: "日本M&AセンターのTOB/MBO記事一覧",
    url: "https://www.nihon-ma.co.jp/news/20260914_3395-1/",
  }]).length, 0);
  assert.equal(extractDiscoveryCandidates([{
    title: "3395 日本M&AセンターのTOB",
    snippet: "日本M&AセンターのTOB/MBO記事一覧",
    url: "https://www.nihon-ma.co.jp/news/20260914_3395-1/",
  }]).length, 0);
  assert.equal(isDiscoverySourceOnlyCandidate({
    symbol: "3395.T",
    name: "日本M&AセンターのTOB",
    discoverySource: "検索結果",
    sourceEvidence: [{
      title: "3395 日本M&AセンターのTOB",
      snippet: "日本M&AセンターのTOB/MBO記事一覧",
      url: "https://www.nihon-ma.co.jp/news/20260914_3395-1/",
    }],
  }), true);
  const reconcileSearchCandidateNames = loadFunction(serverSource, "reconcileSearchCandidateNames", {
    normalizeDiscoverySymbol: normalizeSymbolForTest,
    jpCompanyNameForSymbol: (symbol) => symbol === "5842.T" ? "インテグラル" : "",
    JP_SECTOR_BY_SYMBOL: { "5842.T": "金融" },
  });
  const [resolved] = reconcileSearchCandidateNames([{
    symbol: "3395.T",
    name: "日本M&AセンターのTOB",
    market: "東証",
    sector: "検索発掘",
  }], [{
    symbol: "3395.T",
    name: "サンマルクホールディングス",
    market: "東証プライム",
    sector: "小売業",
  }]);
  assert.equal(resolved.name, "サンマルクホールディングス");
  assert.equal(resolved.sector, "小売業");
  assert.equal(resolved.officialNameResolved, true);
  const [growthResolved] = reconcileSearchCandidateNames([{
    symbol: "5842.T",
    name: "ぴ所有を主たる目的として設立された会社",
    market: "東証",
    sector: "検索発掘",
  }], []);
  assert.equal(growthResolved.name, "インテグラル");
  assert.equal(growthResolved.sector, "金融");
  const cleanCandidateName = loadFunction(serverSource, "cleanCandidateName", {
    cleanText: cleanTextForTest,
  });
  const isLikelyCandidateName = loadFunction(serverSource, "isLikelyCandidateName", {
    cleanText: cleanTextForTest,
  });
  assert.equal(isLikelyCandidateName("ぴ所存を主たる目的として設立された会社"), false);
  const resolveCandidateFromPrice = loadFunctionBlock(serverSource, "resolveCandidateFromPrice", "hasDiscoverySupport", {
    cleanText: cleanTextForTest,
    cleanCandidateName,
    isLikelyCandidateName,
    jpCompanyNameForSymbol: (symbol) => symbol === "5842.T" ? "インテグラル" : "",
    JP_SECTOR_BY_SYMBOL: { "5842.T": "金融" },
  });
  const officialResolved = resolveCandidateFromPrice({
    symbol: "3395.T",
    name: "サンマルクホールディングス",
    market: "東証プライム",
    sector: "小売業",
    discoverySource: "検索結果",
    officialNameResolved: true,
    sourceEvidence: [{
      title: "日本M&AセンターのTOB<3395>",
      snippet: "日本M&AセンターのTOB/MBO記事一覧",
      url: "https://www.nihon-ma.co.jp/news/20260914_3395-1/",
    }],
  }, {});
  assert.equal(officialResolved.name, "サンマルクホールディングス");
  const codeResolved = resolveCandidateFromPrice({
    symbol: "5842.T",
    name: "ぴ所有を主たる目的として設立された会社",
    market: "東証",
    sector: "検索発掘",
    discoverySource: "検索結果",
    sourceEvidence: [{
      title: "ぴ所有を主たる目的として設立された会社<5842>",
      snippet: "公開買付者が対象者の普通株式を取得するために設立された会社です。",
      url: "https://www.nihon-ma.co.jp/news/20260914_5842-1/",
    }],
  }, {});
  assert.equal(codeResolved.name, "インテグラル");
  assert.equal(codeResolved.sector, "金融");
  assert.match(serverSource, /filterDiscoveryResultByExclusions[\s\S]*filter\(hasCleanDiscoveryCandidateName\)/);

  const searchPeSignal = loadFunction(serverSource, "searchPeSignal", {
    PE_CRITERIA: [
      { key: "take_private_motive", label: "非公開化の理由が明確", words: ["中長期的な成長施策", "短期的な株価変動", "買付予定数の上限なし"], weight: 22 },
      { key: "restructuring", label: "再編余地", words: ["TOB", "MBO", "非公開化"], weight: 20 },
      { key: "cashflow", label: "安定キャッシュフロー", words: ["安定収益"], weight: 14 },
    ],
    PE_BUYER_WORDS: ["投資ファンド", "TOB", "MBO"],
    PE_DIRECT_BUYER_WORDS: ["投資ファンド", "TOB", "MBO", "非公開化", "ベイン"],
    PE_TAKE_PRIVATE_MOTIVE_WORDS: ["中長期的な成長施策", "短期的な株価変動", "買付予定数の上限なし"],
    PE_PRIORITY_MIN_SCORE: 45,
    PE_STRONG_MIN_SCORE: 55,
    PE_RECENT_TENDENCIES: [],
    businessContextText: (value) => String(value || "").toLowerCase(),
    normalizeFinancialCriteria: (items) => items,
    financialCriteriaScore: () => 45,
    isHighChaseChart: () => false,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    hostOf: (url) => new URL(url).hostname,
    normalizeFinancialSnapshot: (value) => value,
    uniqueText: (items) => [...new Set(items)],
    peSignalSummary: (_label, _criteria, _buyerHits, options = {}) => [
      ...(options.dealSourceHits?.length ? ["日本M&Aセンター"] : []),
      ...(options.takePrivateMotiveHits?.length ? ["非公開化理由"] : []),
    ].join("・"),
  });
  const signal = searchPeSignal(
    { symbol: "4413.T", name: "ボードルア", sector: "IT", notes: "安定収益 ITインフラ セキュリティ" },
    [],
    [{
      title: "ボードルア<4413>がMBOで非公開化へ 米ベインキャピタルがTOB",
      snippet: "中長期的な成長施策を迅速に実行するため。短期的な株価変動に左右されない体制へ。買付予定数の上限なし。",
      url: "https://www.nihon-ma.co.jp/news/20260819_4413-24/",
    }],
    { criteria: [
      { key: "market_cap", label: "時価総額", status: "pass", summary: "対象範囲" },
      { key: "operating_cf", label: "営業CF", status: "pass", summary: "プラス" },
      { key: "net_cash", label: "ネットキャッシュ", status: "watch", summary: "一定あり" },
      { key: "pbr", label: "PBR", status: "watch", summary: "確認" },
    ] },
  );
  assert.equal(signal.reportEligible, true);
  assert.ok(signal.matchScore >= 65);
  assert.match(signal.summary, /日本M&Aセンター|非公開化理由/);
});

test("discovery UI restores known company names in stale results", () => {
  const sanitizeDiscoverySuggestions = loadFunctionBlock(appSource, "sanitizeDiscoverySuggestions", "reportSectionHtml", {
    candidateTarget: (item = {}) => (item.currency === "USD" ? "us" : "jp"),
    JP_DISCOVERY_NAME_BY_SYMBOL: { "5842.T": "インテグラル" },
    JP_DISCOVERY_SECTOR_BY_SYMBOL: { "5842.T": "金融" },
  });
  const rows = sanitizeDiscoverySuggestions([
    { symbol: "5842.T", name: "ぴ所有を主たる目的として設立された会社", market: "東証", sector: "検索発掘" },
    { symbol: "2612.T", name: "かどや製油", market: "東証", sector: "食品" },
    { symbol: "IBM", name: "IBM", market: "NYSE", currency: "USD" },
  ]);
  assert.deepEqual(rows.map((item) => `${item.symbol}:${item.name}:${item.sector}`), [
    "5842.T:インテグラル:金融",
    "2612.T:かどや製油:食品",
    "IBM:IBM:undefined",
  ]);
  assert.match(appSource, /function sanitizeDiscoverySuggestions/);
  assert.match(appSource, /renderCandidateList\(\)[\s\S]*sanitizeDiscoverySuggestions\(state\.suggestions\)/);
});

test("slow Japan refresh does not delay US or crypto, or depend on AI job state", async () => {
  let finishJapan;
  const calls = [];
  const globals = {
    readSettings: async () => ({ hourlyRefreshEnabled: true, marketHoursOnlyRefresh: true }),
    isMarketOpen: () => true,
    priceRefreshAttempts: new Map(), PRICE_REFRESH_INTERVAL_MS: 300000,
    analysisJob: { running: true }, usAnalysisJob: { running: true },
    refreshWatchlistPrices: () => { calls.push("JP"); return new Promise((resolve) => { finishJapan = resolve; }); },
    refreshUsPrices: async () => { calls.push("US"); },
    analyzeCryptoHolding: async () => { calls.push("crypto"); },
    console,
  };
  const refresh = loadFunction(serverSource, "runScheduledPriceRefresh", globals);
  const pending = refresh();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["JP", "US", "crypto"]);
  finishJapan();
  await pending;
  await refresh();
  assert.equal(calls.length, 3);
});

test("automatic setting and market hours are respected; crypto continues on closed markets", async () => {
  let enabled = false;
  const calls = [];
  const refresh = loadFunction(serverSource, "runScheduledPriceRefresh", {
    readSettings: async () => ({ hourlyRefreshEnabled: enabled, marketHoursOnlyRefresh: true }),
    isMarketOpen: () => false,
    priceRefreshAttempts: new Map(), PRICE_REFRESH_INTERVAL_MS: 300000,
    refreshWatchlistPrices: async () => calls.push("JP"),
    refreshUsPrices: async () => calls.push("US"),
    analyzeCryptoHolding: async () => calls.push("crypto"), console,
  });
  await refresh();
  assert.equal(calls.length, 0);
  enabled = true;
  await refresh();
  assert.deepEqual(calls, ["crypto"]);
});

test("timeout covers a stalled response body after headers arrive", async () => {
  const fetchWithTimeout = loadFunction(serverSource, "fetchWithTimeout", {
    AbortController, setTimeout, clearTimeout,
    fetch: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      }),
    }),
  });
  await assert.rejects(fetchWithTimeout("https://example.test", { timeout: 20, parseJson: true }), /Timed out/);
});

test("browser synchronizes all cached prices once per cycle and resumes after failures", async () => {
  const calls = [];
  let release;
  const context = {
    document: { hidden: false }, backgroundCacheLoading: false,
    loadAnalysisCache: async () => { calls.push("JP"); throw new Error("offline"); },
    loadUsAnalysisCache: async () => { calls.push("US"); },
    loadCrypto: () => { calls.push("crypto"); return new Promise((resolve) => { release = resolve; }); },
  };
  const sync = loadFunction(appSource, "syncBackgroundPrices", context);
  const pending = sync();
  await sync();
  assert.deepEqual(calls, ["JP", "US", "crypto"]);
  release();
  await pending;
  assert.equal(context.backgroundCacheLoading, false);
  context.document.hidden = true;
  await sync();
  assert.equal(calls.length, 3);
});

test("concurrent cache saves produce valid JSON and preserve the newest price", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stock-refresh-test-"));
  try {
    const file = path.join(dir, "cache.json");
    const save = loadFunction(serverSource, "savePriceCache", {
      readFile, writeFile, mkdir, rename, path, cacheWrites: new Map(), preserveNewerPrices,
    });
    const quick = { analyses: [{ symbol: "X", price: { current: 120, fetchedAt: "2026-09-10T01:05:00Z" } }] };
    const full = { analyses: [{ symbol: "X", thesis: "updated", price: { current: 100, fetchedAt: "2026-09-10T01:00:00Z" } }] };
    await Promise.all([save(file, quick, () => quick), save(file, full, () => full)]);
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.analyses[0].price.current, 120);
    assert.equal(saved.analyses[0].thesis, "updated");
    assert.ok(saved.generatedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed crypto price fetch leaves the saved cache untouched", async () => {
  let writes = 0;
  const refresh = loadFunction(serverSource, "performCryptoRefresh", {
    readCryptoHolding: async () => ({}),
    fetchPriceHistory: async () => ({ current: null }),
    usablePrice: (price) => price.current > 0,
    saveCryptoAnalysisCache: async () => { writes++; },
  });
  await assert.rejects(refresh(), /前回の価格を保持/);
  assert.equal(writes, 0);
});
