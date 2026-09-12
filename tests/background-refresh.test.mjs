import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rename, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createSingleFlight, dividendEventSeasonality, isBuyReversalPending, preserveNewerPrices } from "../refresh-control.mjs";

const serverSource = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

function loadFunction(source, name, globals) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.notEqual(start, -1);
  const end = source.indexOf("\n}", start) + 2;
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

test("Japan discovery EDINET review is not capped to top candidates", () => {
  const discoverStart = serverSource.indexOf("async function discoverStocks");
  const discoverEnd = serverSource.indexOf("function discoveryUniverseStats", discoverStart);
  const discoverBody = serverSource.slice(discoverStart, discoverEnd);
  const refreshStart = serverSource.indexOf("async function refreshDiscoveryFinancials");
  const refreshEnd = serverSource.indexOf("function applyDiscoveryFinancialAdjustment", refreshStart);
  const refreshBody = serverSource.slice(refreshStart, refreshEnd);
  assert.doesNotMatch(discoverBody, /DISCOVERY_FINANCIAL_REVIEW_LIMIT|slice\(0,\s*48\)/);
  assert.doesNotMatch(refreshBody, /DISCOVERY_FINANCIAL_REVIEW_LIMIT|slice\(0,\s*48\)/);
  assert.ok(discoverBody.indexOf("refreshDiscoveryFinancials(pricedCandidates") < discoverBody.indexOf("const prelimPool = scored"));
  assert.match(discoverBody, /const shortlist = uniqueBy\(rawShortlist/);
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
