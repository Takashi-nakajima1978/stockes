import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadLocalEnv(path.join(__dirname, ".env"));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const WATCHLIST_PATH = path.join(__dirname, "data", "watchlist.json");
const ANALYSIS_CACHE_PATH = path.join(__dirname, "data", "analysis-cache.json");
const DISCOVERY_CACHE_PATH = path.join(__dirname, "data", "discovery-cache.json");
const PRIME_UNIVERSE_PATH = path.join(__dirname, "data", "prime-universe.json");
const NOTIFICATION_LOG_PATH = path.join(__dirname, "data", "notification-log.json");
const EXCLUDED_CANDIDATES_PATH = path.join(__dirname, "data", "excluded-candidates.json");
const SETTINGS_PATH = path.join(__dirname, "data", "settings.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_MANAGED_STOCKS = 20;
const MAX_DISCOVERY_SUGGESTIONS = 100;
const AI_DISCOVERY_REVIEW_LIMIT = 24;
const defaultSettings = {
  searchProvider: process.env.SEARCH_PROVIDER || "searxng",
  searxngUrl: process.env.SEARXNG_URL || "http://127.0.0.1:8081/search",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  googleCseId: process.env.GOOGLE_CSE_ID || "",
  googleSearchUrl: process.env.GOOGLE_SEARCH_URL || "https://www.googleapis.com/customsearch/v1",
  lmStudioUrl: process.env.LM_STUDIO_URL || "http://127.0.0.1:1234/v1",
  lmStudioTimeoutMs: clamp(Number(process.env.LM_STUDIO_TIMEOUT_MS || 180000), 5000, 300000),
  unitSize: 100,
  unitBudget: Number(process.env.UNIT_BUDGET || 300000),
  dailyDiscoveryEnabled: true,
  dailyDiscoveryHour: 7,
  notificationsEnabled: false,
  notificationMinConfidence: 78,
  notificationMinNetEdgeYen: 5000,
  tradeFeeYen: 0,
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || "",
  graphAccessToken: process.env.GRAPH_ACCESS_TOKEN || "",
  graphTenantId: process.env.GRAPH_TENANT_ID || "",
  graphClientId: process.env.GRAPH_CLIENT_ID || "",
  graphClientSecret: process.env.GRAPH_CLIENT_SECRET || "",
  graphChatId: process.env.GRAPH_CHAT_ID || "",
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const actionLabels = {
  BUY: "買い候補",
  HOLD: "保有継続",
  SELL: "見直し候補",
  WATCH: "要確認",
};

const businessGoodWords = ["増収増益", "上方修正", "最高益", "過去最高益", "最高益更新", "営業益増", "営業利益増", "経常増益", "増益", "増収", "黒字転換", "増配", "配当増額", "自社株買い", "受注増", "受注高"];
const valueGoodWords = ["割安", "低per", "低pbr", "pbr1倍割れ", "pbr", "per", "配当利回り", "高配当", "出遅れ"];
const businessBadWords = ["下方修正", "減益", "赤字", "減配", "不祥事", "行政処分", "訴訟"];

let lmModelCache = { url: "", model: "" };
let primeUniverseCache = null;
let discoveryJob = null;
let dailyDiscoveryTimer = null;

const discoveryUniverse = [
  { symbol: "9433.T", name: "KDDI", market: "東証", sector: "通信", notes: "通信、金融、株主還元" },
  { symbol: "8058.T", name: "三菱商事", market: "東証", sector: "商社", notes: "総合商社、資源、非資源" },
  { symbol: "8031.T", name: "三井物産", market: "東証", sector: "商社", notes: "総合商社、資源、還元" },
  { symbol: "8001.T", name: "伊藤忠商事", market: "東証", sector: "商社", notes: "総合商社、非資源、生活消費" },
  { symbol: "8002.T", name: "丸紅", market: "東証", sector: "商社", notes: "総合商社、電力、食料" },
  { symbol: "4063.T", name: "信越化学工業", market: "東証", sector: "素材", notes: "半導体材料、塩ビ、高収益" },
  { symbol: "6981.T", name: "村田製作所", market: "東証", sector: "電子部品", notes: "電子部品、スマホ、自動車" },
  { symbol: "6762.T", name: "TDK", market: "東証", sector: "電子部品", notes: "電子部品、電池、磁気部品" },
  { symbol: "6861.T", name: "キーエンス", market: "東証", sector: "FA", notes: "FA、収益性、グローバル" },
  { symbol: "6273.T", name: "SMC", market: "東証", sector: "FA", notes: "空圧制御、FA、設備投資" },
  { symbol: "6503.T", name: "三菱電機", market: "東証", sector: "電機", notes: "FA、空調、防衛、電力" },
  { symbol: "7011.T", name: "三菱重工業", market: "東証", sector: "機械", notes: "防衛、エネルギー、航空宇宙" },
  { symbol: "7012.T", name: "川崎重工業", market: "東証", sector: "機械", notes: "防衛、航空、車両、エネルギー" },
  { symbol: "7013.T", name: "IHI", market: "東証", sector: "機械", notes: "航空エンジン、防衛、エネルギー" },
  { symbol: "6301.T", name: "小松製作所", market: "東証", sector: "機械", notes: "建機、鉱山機械、世界景気" },
  { symbol: "6367.T", name: "ダイキン工業", market: "東証", sector: "機械", notes: "空調、海外、環境規制" },
  { symbol: "4568.T", name: "第一三共", market: "東証", sector: "医薬品", notes: "医薬品、がん領域、研究開発" },
  { symbol: "4519.T", name: "中外製薬", market: "東証", sector: "医薬品", notes: "医薬品、抗体、ロシュ" },
  { symbol: "4502.T", name: "武田薬品", market: "東証", sector: "医薬品", notes: "医薬品、配当、海外" },
  { symbol: "4901.T", name: "富士フイルム", market: "東証", sector: "ヘルスケア", notes: "ヘルスケア、半導体材料、写真" },
  { symbol: "6098.T", name: "リクルート", market: "東証", sector: "サービス", notes: "人材、HRテック、海外" },
  { symbol: "4661.T", name: "オリエンタルランド", market: "東証", sector: "レジャー", notes: "テーマパーク、訪日、値上げ" },
  { symbol: "9613.T", name: "NTTデータ", market: "東証", sector: "IT", notes: "SI、公共、海外IT" },
  { symbol: "4704.T", name: "トレンドマイクロ", market: "東証", sector: "IT", notes: "サイバーセキュリティ、配当" },
  { symbol: "4689.T", name: "LINEヤフー", market: "東証", sector: "IT", notes: "ネット広告、コマース、金融" },
  { symbol: "8035.T", name: "東京エレクトロン", market: "東証", sector: "半導体", notes: "半導体製造装置、AI投資" },
  { symbol: "6857.T", name: "アドバンテスト", market: "東証", sector: "半導体", notes: "半導体テスター、AI半導体" },
  { symbol: "6723.T", name: "ルネサス", market: "東証", sector: "半導体", notes: "車載半導体、産業機器" },
  { symbol: "6146.T", name: "ディスコ", market: "東証", sector: "半導体", notes: "精密加工装置、半導体" },
  { symbol: "7735.T", name: "SCREEN", market: "東証", sector: "半導体", notes: "半導体洗浄装置" },
  { symbol: "8316.T", name: "三井住友FG", market: "東証", sector: "銀行", notes: "銀行、金利、株主還元" },
  { symbol: "8411.T", name: "みずほFG", market: "東証", sector: "銀行", notes: "銀行、金利、配当" },
  { symbol: "8591.T", name: "オリックス", market: "東証", sector: "金融", notes: "リース、投資、株主還元" },
  { symbol: "8766.T", name: "東京海上", market: "東証", sector: "保険", notes: "保険、海外利益、政策株売却" },
  { symbol: "8725.T", name: "MS&AD", market: "東証", sector: "保険", notes: "保険、株主還元、金利" },
  { symbol: "8630.T", name: "SOMPO", market: "東証", sector: "保険", notes: "保険、介護、株主還元" },
  { symbol: "2914.T", name: "日本たばこ産業", market: "東証", sector: "食品", notes: "高配当、海外、ディフェンシブ" },
  { symbol: "4452.T", name: "花王", market: "東証", sector: "生活用品", notes: "日用品、構造改革、ディフェンシブ" },
  { symbol: "4911.T", name: "資生堂", market: "東証", sector: "化粧品", notes: "化粧品、中国、インバウンド" },
  { symbol: "3382.T", name: "セブン&アイ", market: "東証", sector: "小売", notes: "コンビニ、再編、海外" },
  { symbol: "8267.T", name: "イオン", market: "東証", sector: "小売", notes: "小売、金融、生活防衛" },
  { symbol: "9843.T", name: "ニトリHD", market: "東証", sector: "小売", notes: "家具、小売、円高メリット" },
  { symbol: "8801.T", name: "三井不動産", market: "東証", sector: "不動産", notes: "不動産、再開発、金利" },
  { symbol: "8802.T", name: "三菱地所", market: "東証", sector: "不動産", notes: "丸の内、再開発、金利" },
  { symbol: "1925.T", name: "大和ハウス", market: "東証", sector: "建設", notes: "住宅、物流施設、賃貸" },
  { symbol: "1802.T", name: "大林組", market: "東証", sector: "建設", notes: "ゼネコン、インフラ、株主還元" },
  { symbol: "1605.T", name: "INPEX", market: "東証", sector: "資源", notes: "資源、原油、配当" },
  { symbol: "5020.T", name: "ENEOS", market: "東証", sector: "エネルギー", notes: "石油、資源、株主還元" },
  { symbol: "9503.T", name: "関西電力", market: "東証", sector: "電力", notes: "電力、原子力、料金" },
  { symbol: "9502.T", name: "中部電力", market: "東証", sector: "電力", notes: "電力、安定需要、燃料費" },
  { symbol: "7267.T", name: "ホンダ", market: "東証", sector: "自動車", notes: "自動車、二輪、株主還元" },
  { symbol: "7270.T", name: "SUBARU", market: "東証", sector: "自動車", notes: "自動車、北米、配当" },
  { symbol: "6902.T", name: "デンソー", market: "東証", sector: "自動車部品", notes: "自動車部品、電動化、半導体" },
  { symbol: "5108.T", name: "ブリヂストン", market: "東証", sector: "自動車部品", notes: "タイヤ、海外、原材料" },
];

const defaultWatchlist = [
  { symbol: "9005.T", name: "東急", market: "東証", holding: true, minimumHoldQuantity: 100, notes: "鉄道、不動産、生活サービス" },
  { symbol: "9201.T", name: "JAL", market: "東証", holding: true, minimumHoldQuantity: 100, notes: "航空、国際線、旅行需要" },
  { symbol: "9432.T", name: "NTT", market: "東証", holding: true, minimumHoldQuantity: 100, notes: "通信、配当、再編" },
  { symbol: "9434.T", name: "SoftBank", market: "東証", holding: true, minimumHoldQuantity: 100, notes: "通信、PayPay、配当" },
  { symbol: "7203.T", name: "トヨタ自動車", market: "東証", holding: false, notes: "自動車、為替、ハイブリッド" },
  { symbol: "6758.T", name: "ソニーグループ", market: "東証", holding: false, notes: "ゲーム、半導体、音楽、映画" },
  { symbol: "8306.T", name: "三菱UFJ", market: "東証", holding: false, notes: "銀行、金利、株主還元" },
  { symbol: "6501.T", name: "日立製作所", market: "東証", holding: false, notes: "IT、インフラ、構造改革" },
  { symbol: "7974.T", name: "任天堂", market: "東証", holding: false, notes: "ゲーム機、IP、為替" },
  { symbol: "9984.T", name: "SoftBank Group", market: "東証", holding: false, notes: "投資会社、AI、Arm" },
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/") return await serveFile(res, path.join(PUBLIC_DIR, "index.html"));
    if (url.pathname === "/favicon.ico") return empty(res, 204);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveFile(res, path.join(PUBLIC_DIR, sanitizePath(url.pathname)));
  } catch (error) {
    json(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Stock Signal is running at http://${HOST}:${PORT}`);
  scheduleDailyDiscovery();
});

async function handleApi(req, res, url) {
  if (url.pathname === "/api/status" && req.method === "GET") {
    return json(res, 200, await status());
  }

  if (url.pathname === "/api/settings" && req.method === "GET") {
    return json(res, 200, { settings: publicSettings(await readSettings()) });
  }

  if (url.pathname === "/api/settings" && req.method === "PATCH") {
    const body = await readJson(req);
    const settings = await saveSettings(applySettingsPatch(await readSettings(), body));
    lmModelCache = { url: "", model: "" };
    return json(res, 200, { settings: publicSettings(settings), status: await status() });
  }

  if (url.pathname === "/api/stocks" && req.method === "GET") {
    return json(res, 200, { stocks: await readWatchlist() });
  }

  if (url.pathname === "/api/analysis" && req.method === "GET") {
    return json(res, 200, await readAnalysisCache());
  }

  if (url.pathname === "/api/discovery" && req.method === "GET") {
    const excludedCandidates = await readExcludedCandidates();
    return json(res, 200, {
      ...filterDiscoveryResultByExclusions(await readDiscoveryCache(), excludedCandidates),
      excludedCandidates,
      job: discoveryJobSnapshot(),
    });
  }

  if (url.pathname === "/api/discovery-job" && req.method === "GET") {
    return json(res, 200, { job: discoveryJobSnapshot() });
  }

  if (url.pathname === "/api/excluded-candidates" && req.method === "GET") {
    return json(res, 200, { excludedCandidates: await readExcludedCandidates() });
  }

  if (url.pathname === "/api/excluded-candidates" && req.method === "POST") {
    const body = await readJson(req);
    const excludedCandidates = await addExcludedCandidate(body);
    const discovery = filterDiscoveryResultByExclusions(await readDiscoveryCache(), excludedCandidates);
    await saveDiscoveryCache(discovery);
    return json(res, 200, { excludedCandidates, ...discovery });
  }

  if (url.pathname.startsWith("/api/excluded-candidates/") && req.method === "DELETE") {
    const symbol = normalizeSymbol(decodeURIComponent(url.pathname.split("/").pop() || ""));
    const excludedCandidates = await removeExcludedCandidate(symbol);
    return json(res, 200, { excludedCandidates });
  }

  if (url.pathname === "/api/search-diagnostics" && req.method === "GET") {
    return json(res, 200, await searchDiagnostics());
  }

  if (url.pathname === "/api/test-notification" && req.method === "POST") {
    const settings = await readSettings();
    if (!settings.teamsWebhookUrl && !(settings.graphAccessToken && settings.graphChatId)) {
      return json(res, 400, { error: "Teams Webhook URLかGraph Chat ID + Access Tokenを保存してください。" });
    }
    await sendTeamsSignal(settings, {
      action: "通知テスト",
      symbol: "TEST",
      name: "Stock Signal",
      confidence: 100,
      netEdgeYen: 0,
      reason: "Teams通知の接続テストです。強く確認すべき候補だけを通知します。",
      points: ["この通知が届けば接続は完了です。"],
    });
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/api/stocks" && req.method === "POST") {
    const body = await readJson(req);
    const stocks = await readWatchlist();
    if (stocks.length >= MAX_MANAGED_STOCKS) return json(res, 400, { error: `管理できる銘柄は${MAX_MANAGED_STOCKS}件までです。` });
    const symbol = normalizeSymbol(body.symbol);
    const name = String(body.name || "").trim();
    if (!symbol || !name) return json(res, 400, { error: "銘柄名とコードを入力してください。" });
    if (stocks.some((stock) => stock.symbol === symbol)) return json(res, 400, { error: "同じ銘柄がすでにあります。" });
    stocks.push(normalizeStock({
      symbol,
      name,
      market: body.market || "東証",
      sector: body.sector,
      notes: body.notes,
      holding: Boolean(body.holding || body.purchaseDate || body.purchasePrice || body.quantity || body.positions?.length),
      purchaseDate: body.purchaseDate,
      purchasePrice: body.purchasePrice,
      quantity: body.quantity,
      positions: body.positions,
      minimumHoldQuantity: body.minimumHoldQuantity,
      targetBuyPrice: body.targetBuyPrice,
    }));
    await saveWatchlist(stocks);
    return json(res, 201, { stocks });
  }

  if (url.pathname.startsWith("/api/stocks/") && req.method === "PATCH") {
    const symbol = decodeURIComponent(url.pathname.split("/").pop() || "");
    const body = await readJson(req);
    const stocks = await readWatchlist();
    const index = stocks.findIndex((stock) => stock.symbol === symbol);
    if (index < 0) return json(res, 404, { error: "銘柄が見つかりません。" });
    stocks[index] = normalizeStock({
      ...stocks[index],
      holding: Boolean(body.holding),
      purchaseDate: body.purchaseDate,
      purchasePrice: body.purchasePrice,
      quantity: body.quantity,
      positions: body.positions,
      minimumHoldQuantity: body.minimumHoldQuantity,
      targetBuyPrice: body.targetBuyPrice,
    });
    await saveWatchlist(stocks);
    return json(res, 200, { stock: stocks[index], stocks });
  }

  if (url.pathname.startsWith("/api/stocks/") && req.method === "DELETE") {
    const symbol = decodeURIComponent(url.pathname.split("/").pop() || "");
    const stocks = (await readWatchlist()).filter((stock) => stock.symbol !== symbol);
    await saveWatchlist(stocks);
    return json(res, 200, { stocks });
  }

  if (url.pathname === "/api/analyze" && req.method === "POST") {
    const body = await readJson(req);
    return json(res, 200, await analyzeWatchlist(body));
  }

  if (url.pathname === "/api/discover" && req.method === "POST") {
    const body = await readJson(req);
    const job = startDiscoveryJob(body, "manual");
    const excludedCandidates = await readExcludedCandidates();
    return json(res, 202, {
      ...filterDiscoveryResultByExclusions(await readDiscoveryCache(), excludedCandidates),
      excludedCandidates,
      job,
      message: "候補検索を裏で開始しました。途中結果は自動保存されます。",
    });
  }

  return json(res, 404, { error: "Not found" });
}

async function analyzeWatchlist(options = {}) {
  const stocks = await readWatchlist();
  const websiteLimit = clamp(Number(options.websiteLimit || 10), 1, 20);
  const depthLimit = clamp(Number(options.depthLimit || 2), 1, 20);
  const pagesPerSite = clamp(Number(options.pagesPerSite || 2), 1, 20);
  const lmStatus = await checkLmStudio();
  const warnings = [];
  const systemWarnings = [];

  const rows = await mapLimit(stocks, 4, async (stock) => {
    const [price, research] = await Promise.all([
      fetchPriceHistory(stock.symbol),
      researchStock(stock, { websiteLimit, depthLimit, pagesPerSite }),
    ]);

    if (research.warning) warnings.push(`${stock.name}: ${research.warning}`);
    const fallback = ruleBasedDecision(stock, price, research);
    return { stock, price, research, fallback };
  });

  let aiBySymbol = new Map();
  if (lmStatus.ok && rows.length) {
    try {
      const decisions = await aiBatchDecisions(rows);
      aiBySymbol = new Map(decisions.map((decision) => [decision.symbol, decision]));
    } catch (error) {
      systemWarnings.push(`LM Studio: ${error.message || "分析が時間内に返りませんでした"}`);
    }
  }

  const analyses = rows.map(({ stock, price, research, fallback }) => {
    return normalizeDecision(stock, price, research, aiBySymbol.get(stock.symbol) || fallback);
  });

  const result = {
    generatedAt: new Date().toISOString(),
    usedLmStudio: aiBySymbol.size > 0,
    warnings: [...systemWarnings, ...new Set(warnings)].slice(0, 6),
    analyses,
  };
  await saveAnalysisCache(result);
  await notifyStrongAnalysisSignals(result.analyses).catch(() => {});
  return result;
}

function startDiscoveryJob(options = {}, reason = "manual") {
  if (discoveryJob?.running) return discoveryJobSnapshot();
  const job = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    running: true,
    reason,
    phase: reason === "daily" ? "日次候補検索を準備中" : "候補検索を準備中",
    checked: 0,
    total: 0,
    searched: 0,
    saved: 0,
    generatedAt: "",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: "",
  };
  discoveryJob = job;
  void discoverStocks({ ...options, fullScan: options.fullScan !== false }, job)
    .then((result) => {
      updateDiscoveryJob(job, {
        running: false,
        phase: "完了",
        saved: result.suggestions?.length || 0,
        generatedAt: result.generatedAt,
      });
    })
    .catch((error) => {
      updateDiscoveryJob(job, {
        running: false,
        phase: "失敗",
        error: error.message || "候補検索に失敗しました",
      });
    });
  return discoveryJobSnapshot();
}

function updateDiscoveryJob(job, patch = {}) {
  if (!job || discoveryJob?.id !== job.id) return;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function discoveryJobSnapshot() {
  if (!discoveryJob) {
    return {
      running: false,
      phase: "待機中",
      checked: 0,
      total: 0,
      searched: 0,
      saved: 0,
      generatedAt: "",
      startedAt: "",
      updatedAt: "",
      error: "",
    };
  }
  return { ...discoveryJob };
}

function scheduleDailyDiscovery() {
  if (dailyDiscoveryTimer) clearInterval(dailyDiscoveryTimer);
  setTimeout(runDailyDiscoveryIfDue, 12000);
  dailyDiscoveryTimer = setInterval(runDailyDiscoveryIfDue, 60 * 60 * 1000);
}

async function runDailyDiscoveryIfDue() {
  const settings = await readSettings();
  if (!settings.dailyDiscoveryEnabled || discoveryJob?.running) return;
  const now = new Date();
  const jstHour = Number(new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  }).format(now));
  if (jstHour < settings.dailyDiscoveryHour) return;
  const cache = await readDiscoveryCache();
  if (jstDate(cache.generatedAt) === jstDate(now.toISOString())) return;
  startDiscoveryJob({ websiteLimit: 20, fullScan: true }, "daily");
}

function jstDate(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function discoverStocks(options = {}, job = null) {
  const stocks = await readWatchlist();
  const settings = await readSettings();
  const excludedCandidates = await readExcludedCandidates();
  const existing = new Set(stocks.map((stock) => stock.symbol));
  const excluded = new Set(excludedCandidates.map((candidate) => candidate.symbol));
  const slots = Math.max(0, MAX_MANAGED_STOCKS - stocks.length);
  const websiteLimit = clamp(Number(options.websiteLimit || 20), 1, 20);
  const unitSize = clamp(Number(options.unitSize || settings.unitSize || 100), 1, 1000);
  const unitBudget = clamp(Number(options.unitBudget || settings.unitBudget || 300000), 10000, 10000000);
  const unitBudgetAllowance = unitBudget * 1.1;
  const fullScan = options.fullScan !== false;
  updateDiscoveryJob(job, { phase: "市場全体の材料を検索中" });
  const search = await discoverySearchResults(websiteLimit);
  const haystack = `${search.map((item) => `${item.title} ${item.snippet}`).join("\n")}`.toLowerCase();
  const sectorCounts = sectorCount(stocks);
  const searchCandidates = extractDiscoveryCandidates(search, existing, excluded);
  const primeUniverse = await readPrimeUniverse();
  updateDiscoveryJob(job, { phase: "LM Studioで市場トレンドを要約中" });
  const marketBrief = search.length
    ? await aiMarketTrendBrief(search, primeUniverse.length).catch(() => null)
    : null;
  const candidateUniverse = uniqueBy([...searchCandidates, ...primeUniverse, ...discoveryUniverse], (candidate) => candidate.symbol)
    .filter((candidate) => !existing.has(candidate.symbol) && !excluded.has(candidate.symbol));
  const candidateLimit = fullScan
    ? candidateUniverse.length
    : Math.min(
      Math.max(8, Number(options.candidateLimit || candidateUniverse.length || discoveryUniverse.length)),
      Math.max(8, candidateUniverse.length),
    );
  const candidates = candidateUniverse.slice(0, candidateLimit);
  updateDiscoveryJob(job, {
    phase: "全プライム銘柄の価格と3年傾向を確認中",
    checked: 0,
    total: candidates.length,
  });
  let checked = 0;
  const scored = await mapLimit(candidates, 8, async (candidate) => {
    const price = await fetchPriceHistory(candidate.symbol);
    const resolvedCandidate = resolveCandidateFromPrice(candidate, price);
    const scoredCandidate = scoreDiscoveryCandidate(resolvedCandidate, price, haystack, sectorCounts, { unitSize, unitBudget, unitBudgetAllowance });
    checked += 1;
    if (checked === candidates.length || checked % 25 === 0) {
      updateDiscoveryJob(job, { checked, phase: "全プライム銘柄の価格と3年傾向を確認中" });
    }
    return scoredCandidate;
  });
  const prelimPool = scored
    .filter((candidate) => candidate.nearBudget)
    .sort((a, b) => b.businessValueScore - a.businessValueScore || b.score - a.score || a.risks.length - b.risks.length || a.symbol.localeCompare(b.symbol));
  const shortlist = fullScan ? prelimPool : prelimPool.slice(0, 24);
  let individualSearchCount = 0;
  const enhancedSoFar = [];
  updateDiscoveryJob(job, {
    phase: "検索順位と事業材料を銘柄別に確認中",
    searched: 0,
    total: candidates.length + shortlist.length,
  });
  const enhanced = await mapLimit(shortlist, 3, async (candidate) => {
    const code = candidate.symbol.replace(".T", "");
    const results = (await searchGoogle(`${candidate.name} ${code} 株価 評価 レーティング 目標株価 決算短信 業績 増収増益 上方修正 増配 割安 PER PBR TDnet`, {
      limit: websiteLimit,
    }).catch(() => [])).map((item, index) => ({ ...item, rank: index + 1 }));
    const relevantResults = relevantSearchResults(candidate, uniqueBy([...(candidate.sourceEvidence || []), ...results], (item) => item.url));
    const positionSignal = searchPositionSignal(candidate, results, relevantResults);
    individualSearchCount += results.length;
    const enhancedCandidate = enhanceBusinessCandidate(candidate, relevantResults, positionSignal);
    enhancedSoFar.push(enhancedCandidate);
    if (enhancedSoFar.length % 20 === 0 || enhancedSoFar.length === shortlist.length) {
      updateDiscoveryJob(job, {
        searched: enhancedSoFar.length,
        phase: "検索順位と事業材料を銘柄別に確認中",
      });
      await savePartialDiscovery({
        stocks,
        search,
        suggestions: topDiscoverySuggestions(enhancedSoFar),
        searchCount: search.length + individualSearchCount,
        candidateLimit,
        unitSize,
        unitBudget,
        searchCandidates,
        candidateUniverse,
        usedDiscoveryAi: false,
      fullScan,
      marketBrief,
    });
    }
    return enhancedCandidate;
  });
  const supported = enhanced.filter(hasDiscoverySupport).filter((candidate) => candidate.evidenceQuality !== "悪材料あり");
  const viable = supported.filter((candidate) => candidate.businessValueScore >= 55);
  const fallbackPool = supported.length ? supported : enhanced.filter((candidate) => candidate.evidenceQuality !== "悪材料あり");
  const suggestionPool = viable.length ? viable : fallbackPool.filter((candidate) => candidate.businessValueScore >= 45);
  let suggestions = topDiscoverySuggestions(suggestionPool);
  let usedDiscoveryAi = false;
  try {
    updateDiscoveryJob(job, { phase: "LM Studioで上位候補を再点検中" });
    const aiReviewBySymbol = await aiDiscoveryReview(suggestions.slice(0, AI_DISCOVERY_REVIEW_LIMIT));
    if (aiReviewBySymbol.size) {
      usedDiscoveryAi = true;
      suggestions = suggestions
        .map((candidate) => applyDiscoveryAiReview(candidate, aiReviewBySymbol.get(candidate.symbol)))
        .sort((a, b) => b.businessValueScore - a.businessValueScore || b.score - a.score || a.risks.length - b.risks.length || a.symbol.localeCompare(b.symbol))
        .slice(0, MAX_DISCOVERY_SUGGESTIONS);
    }
  } catch {
    // Candidate discovery still works without the local model.
  }

  const added = options.autoAdd && slots > 0
    ? suggestions.slice(0, slots).map(candidateToStock)
    : [];
  const next = added.length ? [...stocks, ...added].slice(0, MAX_MANAGED_STOCKS) : stocks;
  if (added.length) await saveWatchlist(next);

  const result = {
    generatedAt: new Date().toISOString(),
    added,
    stocks: next,
    suggestions,
    evidence: search.slice(0, 5),
    sourceSummary: await searchSourceSummary(search.length + individualSearchCount, candidateLimit, {
      unitSize,
      unitBudget,
      discoveredCount: searchCandidates.length,
      candidatePool: candidateUniverse.length,
      usedDiscoveryAi,
      fullScan,
      searchPositionUsed: true,
      marketBrief,
    }),
    message: suggestions.length === 0
      ? "1単元の予算に合う候補が見つかりませんでした。"
      : slots > 0
      ? "候補を表示しました。必要な銘柄だけ追加してください。"
      : `${MAX_MANAGED_STOCKS}銘柄が埋まっているため、入れ替え候補として表示します。`,
  };
  await saveDiscoveryCache(result);
  await notifyStrongDiscoverySignals(suggestions).catch(() => {});
  return result;
}

function topDiscoverySuggestions(candidates = []) {
  return candidates
    .filter((candidate) => candidate && candidate.evidenceQuality !== "悪材料あり")
    .sort((a, b) => b.businessValueScore - a.businessValueScore || b.score - a.score || a.risks.length - b.risks.length || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_DISCOVERY_SUGGESTIONS);
}

async function savePartialDiscovery({
  stocks,
  search,
  suggestions,
  searchCount,
  candidateLimit,
  unitSize,
  unitBudget,
  searchCandidates,
  candidateUniverse,
  usedDiscoveryAi,
  fullScan,
  marketBrief,
}) {
  const result = {
    generatedAt: new Date().toISOString(),
    added: [],
    stocks,
    suggestions,
    evidence: search.slice(0, 5),
    sourceSummary: await searchSourceSummary(searchCount, candidateLimit, {
      unitSize,
      unitBudget,
      discoveredCount: searchCandidates.length,
      candidatePool: candidateUniverse.length,
      usedDiscoveryAi,
      fullScan,
      searchPositionUsed: true,
      marketBrief,
    }),
    message: "候補検索の途中結果です。完了後に上位候補が更新されます。",
  };
  await saveDiscoveryCache(result);
  updateDiscoveryJob(discoveryJob, { saved: suggestions.length, generatedAt: result.generatedAt });
}

async function readPrimeUniverse() {
  if (primeUniverseCache) return primeUniverseCache;
  try {
    const rows = JSON.parse(await readFile(PRIME_UNIVERSE_PATH, "utf8"));
    if (Array.isArray(rows) && rows.length) {
      primeUniverseCache = rows
        .map((row) => ({
          symbol: normalizeSymbol(row.symbol || row.code),
          name: String(row.name || "").trim(),
          market: row.market || "東証プライム",
          sector: String(row.sector || row.sector17 || "その他").trim(),
          sector17: String(row.sector17 || "").trim(),
          size: String(row.size || "").trim(),
          notes: row.notes || `東証プライム、${row.sector || "その他"}`,
        }))
        .filter((row) => row.symbol && row.name);
      return primeUniverseCache;
    }
  } catch {
    // Fall back to the curated seed list when the official file is absent.
  }
  primeUniverseCache = discoveryUniverse.map((item) => ({ ...item, market: "東証プライム" }));
  return primeUniverseCache;
}

async function discoverySearchResults(limit) {
  const year = new Date().getFullYear();
  const queries = [
    `株探 上方修正 増配 最高益 ${year} 日本株`,
    "site:kabutan.jp 上方修正 最高益 増配 銘柄",
    "日本株 決算短信 増収増益 上方修正 割安",
    "低PBR 増益 上方修正 日本株",
    "高配当 低PBR 上方修正 日本株",
  ];
  const perQueryLimit = Math.max(4, Math.ceil(limit / queries.length));
  const results = [];
  for (const query of queries) {
    const page = await searchGoogle(query, { limit: perQueryLimit }).catch(() => []);
    results.push(...page);
  }
  return uniqueBy(results, (item) => item.url).slice(0, limit);
}

function extractDiscoveryCandidates(searchResults, existing = new Set(), excluded = new Set()) {
  const found = new Map();
  const add = (code, rawName, item) => {
    const symbol = normalizeSymbol(code);
    const name = cleanCandidateName(rawName);
    if (!symbol || existing.has(symbol) || excluded.has(symbol) || !isLikelyCandidateName(name)) return;
    const previous = found.get(symbol);
    const evidence = {
      title: item.title,
      url: item.url,
      snippet: item.snippet,
    };
    if (previous) {
      previous.sourceEvidence = uniqueBy([...previous.sourceEvidence, evidence], (source) => source.url).slice(0, 4);
      return;
    }
    found.set(symbol, {
      symbol,
      name,
      market: "東証",
      sector: "検索発掘",
      notes: "検索結果から見つけた好材料候補",
      discoverySource: "検索結果",
      sourceEvidence: [evidence],
    });
  };

  for (const item of searchResults) {
    const text = cleanText(`${item.title} ${item.snippet}`);
    const patterns = [
      /([^<>＜＞\n]{2,42})[<＜]\s*(\d{4})\s*[>＞]/g,
      /([^（）()\n]{2,42})[（(]\s*(\d{4})\s*[）)]/g,
      /(?:^|[\s　])(\d{4})\s+([^【】\[\]<>＜＞\n]{2,34})/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text))) {
        if (pattern.source.startsWith("(?:^")) add(match[1], match[2], item);
        else add(match[2], match[1], item);
      }
    }
  }

  return [...found.values()].slice(0, 40);
}

function cleanCandidateName(value = "") {
  let text = cleanText(value)
    .replace(/^[|｜:：\s]+/, "")
    .replace(/.*[|｜:：]/, "")
    .replace(/^(株探|みんかぶ|ニュース|決算|速報|注目株|話題株|本日の|今日の)\s*/i, "")
    .trim();
  text = text.split(/---|--|－{2,}|[、，。／/【】\[\]「」]/)[0] || text;
  text = text
    .replace(/^(?:東証[ＰPＳSＧG]|東証プライム|東証スタンダード|東証グロース)\s*/i, "")
    .replace(/\s+(?:が|は|の)\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 24) text = text.slice(-24).trim();
  return text;
}

function isLikelyCandidateName(name = "") {
  const text = cleanText(name);
  if (text.length < 2 || text.length > 28) return false;
  if (/^\d+$/.test(text)) return false;
  if (/[。！？]/.test(text)) return false;
  if (/日本株|銘柄|ランキング|一覧|決算|ニュース|速報|上方修正|最高益|増配|割安|株価|市場|特集|材料|今期|前期|本日|今日/.test(text)) return false;
  if ((text.match(/[0-9０-９]/g) || []).length > 2) return false;
  return true;
}

function resolveCandidateFromPrice(candidate, price = {}) {
  if (!candidate.discoverySource) return candidate;
  const evidenceName = candidateNameFromEvidence(candidate);
  if (isLikelyCandidateName(evidenceName) && (evidenceName.length >= candidate.name.length || candidate.name.length < 4)) {
    return {
      ...candidate,
      name: evidenceName,
    };
  }
  if (isLikelyCandidateName(candidate.name) && containsJapanese(candidate.name)) return candidate;
  const priceName = cleanCandidateName(price.shortName || price.longName || "");
  if (!isLikelyCandidateName(priceName)) return candidate;
  if (/\b(CO|CORP|CORPORATION|LTD|LIMITED|HOLDINGS)\b/i.test(priceName) && containsJapanese(candidate.name)) return candidate;
  return {
    ...candidate,
    name: priceName,
  };
}

function candidateNameFromEvidence(candidate) {
  const code = candidate.symbol?.replace(".T", "");
  if (!code) return "";
  for (const item of candidate.sourceEvidence || []) {
    for (const raw of [item.title, item.snippet]) {
      const text = cleanText(raw || "");
      const direct = text.match(new RegExp(`([A-Za-z&.・ァ-ヶー一-龯０-９0-9]{2,28})\\s*[<＜]\\s*${code}\\s*[>＞]`));
      if (direct) {
        const name = cleanCandidateName(direct[1]);
        if (isLikelyCandidateName(name)) return name;
      }
      if (text.includes(code)) {
        const leading = cleanCandidateName(text.split(/---|--|－{2,}|[、，。]/)[0] || "");
        if (isLikelyCandidateName(leading)) return leading;
      }
    }
  }
  return "";
}

function containsJapanese(value = "") {
  return /[ぁ-んァ-ン一-龯]/.test(String(value));
}

function hasDiscoverySupport(candidate) {
  return Boolean(
    candidate.discoverySource
    || candidate.businessEvidence?.length
    || candidate.sourceEvidence?.length
    || candidate.evidenceQuality === "業績根拠あり",
  );
}

function scoreDiscoveryCandidate(candidate, price, haystack, sectorCounts, budget = {}) {
  let score = 50;
  const reasons = [];
  const risks = [];
  const unitSize = budget.unitSize || 100;
  const unitAmount = Number.isFinite(price.current) ? price.current * unitSize : null;
  const inBudget = Number.isFinite(unitAmount) && unitAmount <= budget.unitBudget;
  const nearBudget = Number.isFinite(unitAmount) && unitAmount <= budget.unitBudgetAllowance;
  const context = businessContextText(haystack);
  let businessScore = 0;
  let valueScore = 0;

  if (candidate.discoverySource) {
    score += 5;
    businessScore += 4;
    reasons.push("検索結果から発掘した銘柄");
  }

  if (!Number.isFinite(price.current)) {
    score -= 28;
    risks.push("価格データが取得できず、候補としての確度が低い");
  } else if (inBudget) {
    score += 10;
    valueScore += 10;
    reasons.push(`${unitSize}株で${formatYen(unitAmount)}。30万円目安で買える`);
  } else if (nearBudget) {
    score += 2;
    valueScore += 2;
    risks.push(`${unitSize}株で${formatYen(unitAmount)}。30万円を少し超える`);
  } else {
    score -= 30;
    risks.push(`${unitSize}株で${formatYen(unitAmount)}。30万円目安を超える`);
  }

  if (Number.isFinite(price.return3y)) {
    if (price.return3y >= 120) {
      score += 14;
      businessScore += 8;
      reasons.push("株価は3年で大きく伸びている");
      if (Number.isFinite(price.distanceFromHigh3y) && price.distanceFromHigh3y > -8) {
        score -= 4;
        risks.push("3年高値圏で過熱感を確認したい");
      }
    } else if (price.return3y >= 45) {
      score += 16;
      businessScore += 6;
      reasons.push("株価は3年でしっかり伸びている");
    } else if (price.return3y >= 15) {
      score += 8;
      businessScore += 3;
      reasons.push("株価は3年でプラスを保っている");
    } else if (price.return3y <= -20) {
      score -= 16;
      risks.push("株価は3年で弱く、事業好調だけでは買いにくい");
    }
  }

  if (Number.isFinite(price.trendSlope3y)) {
    if (price.trendSlope3y > 10) {
      score += 14;
      businessScore += 7;
      reasons.push("過去3年の株価の流れが上向き");
    } else if (price.trendSlope3y < -6) {
      score -= 14;
      risks.push("過去3年の株価の流れが下向き");
    }
  }

  if (Number.isFinite(price.distanceFromTrend3y)) {
    if (price.distanceFromTrend3y <= -8) {
      score += 12;
      valueScore += 14;
      reasons.push("3年の流れから見た目安価格より安い");
    } else if (price.distanceFromTrend3y <= 8) {
      score += 7;
      valueScore += 8;
      reasons.push("3年の流れから見た目安価格に近い");
    } else if (price.distanceFromTrend3y > 25) {
      score -= 12;
      risks.push("3年の流れから見た目安価格より高く、過熱に注意");
    }
  }

  if (Number.isFinite(price.dividendYield)) {
    if (price.dividendYield >= 4 && !isHighChaseChart(price)) {
      score += 8;
      valueScore += 9;
      reasons.push(`配当利回りが${price.dividendYield.toFixed(1)}%ある`);
    } else if (price.dividendYield >= 3) {
      score += 4;
      valueScore += 5;
      reasons.push(`配当利回りが${price.dividendYield.toFixed(1)}%ある`);
    }
    if (price.dividendYield >= 5.5 && (price.return1y < -10 || price.trend3y === "DOWN")) {
      score -= 6;
      risks.push("高配当だが株価下落で利回りが高く見えている可能性");
    }
  }

  if (Number.isFinite(price.dividendChangePct)) {
    if (price.dividendChangePct > 5) {
      score += 4;
      valueScore += 3;
      reasons.push("直近1年の配当が増えている");
    } else if (price.dividendChangePct < -5) {
      score -= 7;
      risks.push("直近1年の配当が減っている");
    }
  }

  const mentioned = context.includes(candidate.name.toLowerCase()) || context.includes(candidate.symbol.replace(".T", ""));
  const businessHits = businessGoodWords.filter((word) => context.includes(word.toLowerCase()));
  const valueHits = valueGoodWords.filter((word) => context.includes(word.toLowerCase()));
  const badHits = businessBadWords.filter((word) => context.includes(word.toLowerCase()));
  if (mentioned && businessHits.length) {
    const bonus = Math.min(12, businessHits.length * 3);
    score += bonus;
    businessScore += bonus;
    reasons.push("検索材料に好業績の言葉がある");
  }
  if (mentioned && valueHits.length) {
    const bonus = Math.min(10, valueHits.length * 2);
    score += bonus;
    valueScore += bonus;
    reasons.push("検索材料に割安の言葉がある");
  }
  if (mentioned && badHits.length) {
    const penalty = Math.min(16, badHits.length * 5);
    score -= penalty;
    risks.push("検索材料に業績悪化の言葉がある");
  }

  if (Number.isFinite(price.distanceFromLow3y) && price.distanceFromLow3y <= 18 && price.trend3y !== "DOWN") {
    score += 6;
    reasons.push("過去3年レンジの安い側で、損切りより反発確認の場面");
  }

  if (Number.isFinite(price.return1y)) {
    if (price.return1y > 18) {
      score += 8;
      reasons.push("1年の勢いもある");
    } else if (price.return1y < -15) {
      score -= 10;
      risks.push("1年では弱い");
    }
  }

  if (Number.isFinite(price.return3m)) {
    if (price.return3m > 6 && price.return3m < 28) {
      score += 7;
      reasons.push("直近3カ月も崩れていない");
    } else if (price.return3m >= 35) {
      score -= 6;
      risks.push("短期で上がりすぎており、押し目待ちも検討");
    } else if (price.return3m < -8) {
      score -= 9;
      risks.push("直近3カ月が弱い");
    }
  }

  if (Number.isFinite(price.maxDrawdown3y)) {
    if (price.maxDrawdown3y > -28) {
      score += 7;
      reasons.push("3年の最大下落が比較的小さい");
    } else if (price.maxDrawdown3y < -50) {
      score -= 10;
      risks.push("3年の最大下落が大きく、値動きが荒い");
    }
  }

  if (Number.isFinite(price.volatility)) {
    if (price.volatility < 28) {
      score += 5;
      reasons.push("値動きが比較的安定している");
    } else if (price.volatility > 55) {
      score -= 10;
      risks.push("ボラティリティが高く、建玉サイズに注意");
    } else if (price.volatility > 42) {
      score -= 4;
      risks.push("値動きがやや大きい");
    }
  }

  const sector = stockSector(candidate);
  const sectorHeld = sectorCounts.get(sector) || 0;
  if (sectorHeld === 0) {
    score += 8;
    reasons.push(`${sector}は既存リストに少なく、分散に効く`);
  } else if (sectorHeld >= 2) {
    score -= 7;
    risks.push(`${sector}が既存リストと重なりやすい`);
  }

  const hay = haystack.toLowerCase();
  if (hay.includes(candidate.name.toLowerCase()) || hay.includes(candidate.symbol.replace(".T", ""))) {
    score += 4;
    reasons.push("検索結果にも名前が出ている");
  }

  const process = buildDiscoveryProcess({
    candidate,
    price,
    unitSize,
    unitAmount,
    inBudget,
    nearBudget,
    sectorHeld,
    businessHits: mentioned ? businessHits : [],
    valueHits: mentioned ? valueHits : [],
    badHits: mentioned ? badHits : [],
  });
  const businessValueScore = process.totalScore;
  const buyPlan = candidateBuyPlan(price, { unitSize, unitBudget: budget.unitBudget, unitAmount, businessValueScore });

  return {
    ...candidate,
    sector,
    score: clamp(Math.round(score), 0, 100),
    businessValueScore,
    rankLabel: discoveryRankLabel(businessValueScore),
    process,
    reasons: uniqueText(reasons).slice(0, 4),
    risks: uniqueText(risks).slice(0, 3),
    evidenceQuality: candidate.discoverySource ? "検索から発掘" : "価格中心",
    unitSize,
    unitBudget: budget.unitBudget,
    unitAmount,
    inBudget,
    nearBudget,
    buyPlan,
    price: compactDiscoveryPrice(price, unitSize),
  };
}

function enhanceBusinessCandidate(candidate, results, positionSignal = null) {
  if (!results.length) {
    return {
      ...candidate,
      businessEvidence: [],
      searchPosition: positionSignal,
    };
  }
  const context = businessContextText(results.map((item) => `${item.title} ${item.snippet}`).join("\n"));
  const businessHits = businessGoodWords.filter((word) => context.includes(word.toLowerCase()));
  const valueHits = valueGoodWords.filter((word) => context.includes(word.toLowerCase()));
  const badHits = businessBadWords.filter((word) => context.includes(word.toLowerCase()));
  const materialResults = results.filter((item) => {
    const text = businessContextText(`${item.title} ${item.snippet}`);
    return [...businessGoodWords, ...valueGoodWords, ...businessBadWords].some((word) => text.includes(word.toLowerCase()));
  });
  const evidenceQuality = materialResults.length
    ? badHits.length && !businessHits.length && !valueHits.length
      ? "悪材料あり"
      : badHits.length
      ? "好悪混在"
      : "業績根拠あり"
    : results.length
    ? "関連検索のみ"
    : "根拠待ち";
  let score = candidate.score;
  let businessValueScore = candidate.businessValueScore;
  const reasons = [];
  const risks = [];

  if (businessHits.length) {
    const bonus = Math.min(15, businessHits.length * 4);
    score += bonus;
    businessValueScore += bonus * 2;
    candidate.process = boostProcessStage(candidate.process, "事業", Math.min(5, businessHits.length * 2), "個別検索で好業績材料あり");
    reasons.push("この銘柄の検索結果に好業績の材料がある");
  }

  if (valueHits.length) {
    const bonus = Math.min(12, valueHits.length * 3);
    score += bonus;
    businessValueScore += bonus * 2;
    candidate.process = boostProcessStage(candidate.process, "割安", Math.min(4, valueHits.length * 2), "個別検索で割安材料あり");
    reasons.push("この銘柄の検索結果に割安の材料がある");
  }

  if (badHits.length) {
    const penalty = Math.min(16, badHits.length * 5);
    score -= penalty;
    businessValueScore -= penalty * 2;
    candidate.process = boostProcessStage(candidate.process, "リスク", -Math.min(6, badHits.length * 2), "個別検索で悪材料あり");
    risks.push("この銘柄の検索結果に業績悪化の言葉がある");
  }

  if (positionSignal?.score) {
    score += positionSignal.score;
    businessValueScore += positionSignal.score;
    if (positionSignal.score > 0) {
      candidate.process = boostProcessStage(candidate.process, "事業", Math.min(4, Math.ceil(positionSignal.score / 2)), "検索上位に業績材料あり");
      reasons.push(positionSignal.summary);
    } else {
      candidate.process = boostProcessStage(candidate.process, "リスク", Math.max(-4, Math.floor(positionSignal.score / 2)), "検索上位の根拠が弱い");
      risks.push(positionSignal.summary);
    }
  }

  const process = finalizeDiscoveryProcess(candidate.process);
  const boundedBusinessValue = process.totalScore;
  const buyPlan = candidateBuyPlan(candidate.price || {}, {
    unitSize: candidate.unitSize,
    unitBudget: candidate.unitBudget,
    unitAmount: candidate.unitAmount,
    businessValueScore: boundedBusinessValue,
  });
  return {
    ...candidate,
    score: clamp(Math.round(score), 0, 100),
    businessValueScore: boundedBusinessValue,
    rankLabel: discoveryRankLabel(boundedBusinessValue),
    process,
    buyPlan,
    evidenceQuality,
    searchPosition: positionSignal,
    reasons: uniqueText([...candidate.reasons, ...reasons]).slice(0, 5),
    risks: uniqueText([...candidate.risks, ...risks]).slice(0, 4),
    businessEvidence: materialResults.slice(0, 3).map((item) => ({
      title: item.title,
      url: item.url,
      source: hostOf(item.url),
      snippet: item.snippet,
    })),
  };
}

async function aiDiscoveryReview(candidates) {
  if (!candidates.length) return new Map();
  const items = candidates.map((candidate) => ({
    symbol: candidate.symbol,
    name: candidate.name,
    score: candidate.businessValueScore,
    rankLabel: candidate.rankLabel,
    price: {
      current: candidate.price?.current,
      unitAmount: candidate.price?.unitAmount,
      return3m: candidate.price?.return3m,
      return1y: candidate.price?.return1y,
      return3y: candidate.price?.return3y,
      distanceFromTrend3y: candidate.price?.distanceFromTrend3y,
      maxDrawdown3y: candidate.price?.maxDrawdown3y,
      dividendYield: candidate.price?.dividendYield,
      dividendPerShareTtm: candidate.price?.dividendPerShareTtm,
    },
    searchPosition: candidate.searchPosition || null,
    buyPlan: {
      stance: candidate.buyPlan?.stance,
      maxBuyPrice: candidate.buyPlan?.maxBuyPrice,
    },
    process: (candidate.process?.stages || []).slice(0, 5).map((stage) => ({
      label: stage.label,
      score: stage.score,
      max: stage.max,
      status: stage.status,
      note: stage.note,
    })),
    reasons: (candidate.reasons || []).slice(0, 3),
    risks: (candidate.risks || []).slice(0, 3),
    evidence: discoveryEvidenceForAi(candidate),
  }));

  const prompt = [
    "あなたは日本株の候補発掘レビュー担当です。将来の利益を保証せず、根拠不足を厳しく扱ってください。",
    "目的は「事業として好調そうなのに、株価が高すぎず、1単元30万円前後で買いやすい候補」を上に残すことです。",
    "過去3年の流れに対する現在価格、配当利回り、検索順位に出る材料、短期の過熱、下落リスク、検索根拠の薄さを重視してください。",
    "adjustmentは-8から8の整数。根拠が薄い場合は0以下、悪材料や高値づかみ懸念が強い場合はマイナスにしてください。",
    "出力はJSONのみ。形式は {\"reviews\":[{\"symbol\":\"9433.T\",\"adjustment\":2,\"summary\":\"...\",\"positives\":[\"...\"],\"risks\":[\"...\"]}]}。",
    "",
    JSON.stringify({ candidates: items }),
  ].join("\n");

  const model = await getLmStudioModel();
  const content = await callLmStudioResponses(model, prompt, {
    instructions: "Return strict JSON only. Do not explain.",
    maxOutputTokens: 12000,
  }).catch(async (error) => {
    if (String(error.message || "").includes("404")) {
      return callLmStudioChat(model, prompt, {
        system: "Return strict JSON only. Do not explain.",
        maxTokens: 12000,
      });
    }
    throw error;
  });
  const parsed = parseJsonObject(content);
  const reviews = Array.isArray(parsed) ? parsed : parsed.reviews || parsed.rankings || [];
  const map = new Map();
  for (const review of reviews) {
    const symbol = normalizeSymbol(review?.symbol);
    if (!symbol) continue;
    map.set(symbol, {
      adjustment: clamp(Math.round(Number(review.adjustment ?? review.qualityAdjustment ?? 0)), -8, 8),
      summary: String(review.summary || review.thesis || "").slice(0, 220),
      positives: asStringArray(review.positives || review.reasons).slice(0, 3),
      risks: asStringArray(review.risks).slice(0, 3),
    });
  }
  return map;
}

async function aiMarketTrendBrief(searchResults = [], universeCount = 0) {
  const evidence = searchResults.slice(0, 20).map((item, index) => ({
    rank: index + 1,
    title: item.title,
    source: hostOf(item.url),
    snippet: cleanText(item.snippet || "").slice(0, 180),
  }));
  const prompt = [
    "日本株の候補探索のため、検索結果から今見るべき業績トレンドを短く整理してください。",
    "出力はJSONのみ。形式は {\"summary\":\"...\",\"themes\":[\"...\"],\"avoid\":[\"...\"],\"keywords\":[\"...\"]}。",
    "ユーザーはデイトレーダーではありません。数週間から数か月で持てる、事業好調だが株価が高すぎない候補を探します。",
    "",
    JSON.stringify({ universe: `東証プライム ${universeCount}銘柄`, evidence }),
  ].join("\n");
  const model = await getLmStudioModel();
  const content = await callLmStudioResponses(model, prompt, {
    instructions: "Return strict JSON only. Do not explain.",
    maxOutputTokens: 3000,
  }).catch(async (error) => {
    if (String(error.message || "").includes("404")) {
      return callLmStudioChat(model, prompt, {
        system: "Return strict JSON only. Do not explain.",
        maxTokens: 3000,
      });
    }
    throw error;
  });
  const parsed = parseJsonObject(content);
  return {
    summary: String(parsed.summary || "").slice(0, 240),
    themes: asStringArray(parsed.themes).slice(0, 5),
    avoid: asStringArray(parsed.avoid).slice(0, 4),
    keywords: asStringArray(parsed.keywords).slice(0, 8),
  };
}

function discoveryEvidenceForAi(candidate) {
  const evidence = [
    ...(candidate.businessEvidence || []),
    ...(candidate.sourceEvidence || []).map((item) => ({
      title: item.title,
      source: hostOf(item.url),
      snippet: item.snippet,
    })),
  ];
  return uniqueBy(evidence, (item) => `${item.source || ""}:${item.title || ""}`)
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      source: item.source,
      snippet: cleanText(item.snippet || "").slice(0, 140),
    }));
}

function applyDiscoveryAiReview(candidate, review) {
  if (!review) return candidate;
  const adjustment = clamp(Math.round(Number(review.adjustment || 0)), -8, 8);
  const businessValueScore = clamp(Math.round((candidate.businessValueScore || 0) + adjustment), 0, 100);
  const aiReview = {
    adjustment,
    summary: review.summary || "LM Studioで候補の根拠を再点検しました。",
    positives: review.positives || [],
    risks: review.risks || [],
  };
  return {
    ...candidate,
    score: clamp(Math.round((candidate.score || 0) + adjustment), 0, 100),
    businessValueScore,
    rankLabel: discoveryRankLabel(businessValueScore),
    evidenceQuality: `${candidate.evidenceQuality || "価格中心"}・AI確認`,
    aiReview,
    buyPlan: candidateBuyPlan(candidate.price || {}, {
      unitSize: candidate.unitSize,
      unitBudget: candidate.unitBudget,
      unitAmount: candidate.unitAmount,
      businessValueScore,
    }),
    reasons: uniqueText([...(candidate.reasons || []), ...aiReview.positives]).slice(0, 5),
    risks: uniqueText([...(candidate.risks || []), ...aiReview.risks]).slice(0, 4),
  };
}

function searchPositionSignal(candidate, allResults = [], relevantResults = []) {
  const ranked = relevantResults
    .map((item) => ({
      ...item,
      rank: Number(item.rank) || allResults.findIndex((result) => result.url === item.url) + 1 || null,
    }))
    .filter((item) => item.rank)
    .sort((a, b) => a.rank - b.rank);
  if (!ranked.length) {
    return {
      score: -4,
      rank: null,
      topSource: "",
      summary: "検索上位に銘柄固有の根拠が少ない",
    };
  }
  const top = ranked[0];
  const topText = businessContextText(`${top.title} ${top.snippet} ${top.url}`);
  const goodHits = businessGoodWords.filter((word) => topText.includes(word.toLowerCase()));
  const valueHits = valueGoodWords.filter((word) => topText.includes(word.toLowerCase()));
  const badHits = businessBadWords.filter((word) => topText.includes(word.toLowerCase()));
  const trusted = /tdnet|jpx|kabutan|nikkei|finance\.yahoo|irbank|buffett-code|minkabu|reuters|bloomberg|company|corp|co\.jp/i.test(top.url);
  let score = top.rank <= 3 ? 5 : top.rank <= 8 ? 2 : -1;
  if (trusted) score += 2;
  if (goodHits.length) score += Math.min(6, goodHits.length * 2);
  if (valueHits.length) score += Math.min(4, valueHits.length * 2);
  if (badHits.length) score -= Math.min(8, badHits.length * 3);
  const summary = badHits.length
    ? `検索${top.rank}位に注意材料あり`
    : goodHits.length || valueHits.length
    ? `検索${top.rank}位に業績・割安材料あり`
    : `検索${top.rank}位に関連情報あり`;
  return {
    score: clamp(score, -8, 12),
    rank: top.rank,
    topSource: hostOf(top.url),
    summary,
    positives: [...goodHits, ...valueHits].slice(0, 4),
    risks: badHits.slice(0, 3),
  };
}

function relevantSearchResults(candidate, results) {
  const code = candidate.symbol.replace(".T", "");
  const name = candidate.name.toLowerCase();
  const symbol = candidate.symbol.toLowerCase();
  return results.filter((item) => {
    const text = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
    return text.includes(code) || text.includes(symbol) || text.includes(name);
  });
}

function buildDiscoveryProcess({
  price,
  unitSize,
  unitAmount,
  inBudget,
  nearBudget,
  sectorHeld,
  businessHits,
  valueHits,
  badHits,
}) {
  let business = 0;
  let value = 0;
  let timing = 0;
  let risk = 0;
  let fit = 0;
  const notes = {
    business: [],
    value: [],
    timing: [],
    risk: [],
    fit: [],
  };

  if (Number.isFinite(price.return3y) && price.return3y >= 45) {
    business += 7;
    notes.business.push("3年で株価が伸びている");
  } else if (Number.isFinite(price.return3y) && price.return3y >= 15) {
    business += 4;
    notes.business.push("3年でプラスを維持");
  }
  if (price.trend3y === "UP") {
    business += 7;
    notes.business.push("3年の流れが上向き");
  }
  if (Number.isFinite(price.return1y) && price.return1y > 12) {
    business += 5;
    notes.business.push("1年の勢いもある");
  }
  if (businessHits.length) {
    business += Math.min(6, businessHits.length * 2);
    notes.business.push("好業績ワードあり");
  }

  if (inBudget) {
    value += 5;
    notes.value.push(`${unitSize}株で${formatYen(unitAmount)}`);
  } else if (nearBudget) {
    value += 2;
    notes.value.push("予算を少し超える");
  }
  if (Number.isFinite(price.distanceFromTrend3y)) {
    if (price.distanceFromTrend3y <= -8) {
      value += 12;
      notes.value.push("3年目安より安い");
    } else if (price.distanceFromTrend3y <= 8) {
      value += 8;
      notes.value.push("3年目安に近い");
    }
  }
  if (Number.isFinite(price.distanceFromHigh3y) && price.distanceFromHigh3y < -12) {
    value += 4;
    notes.value.push("3年高値から離れている");
  }
  if (Number.isFinite(price.dividendYield)) {
    if (price.dividendYield >= 4 && !isHighChaseChart(price)) {
      value += 6;
      notes.value.push(`配当利回り${price.dividendYield.toFixed(1)}%`);
    } else if (price.dividendYield >= 3) {
      value += 3;
      notes.value.push(`配当利回り${price.dividendYield.toFixed(1)}%`);
    }
  }
  if (valueHits.length) {
    value += Math.min(4, valueHits.length * 2);
    notes.value.push("割安ワードあり");
  }

  if (Number.isFinite(price.return3m)) {
    if (price.return3m >= -4 && price.return3m <= 18) {
      timing += 8;
      notes.timing.push("直近が過熱しすぎていない");
    } else if (price.return3m > 18 && price.return3m <= 35) {
      timing += 4;
      notes.timing.push("短期はやや強い");
    }
  }
  if (Number.isFinite(price.sma200) && Number.isFinite(price.current) && price.current >= price.sma200 * 0.95) {
    timing += 5;
    notes.timing.push("長めの平均価格を大きく下回っていない");
  }
  if (Number.isFinite(price.return1y) && price.return1y > 0) {
    timing += 4;
    notes.timing.push("1年ではプラス");
  }

  if (Number.isFinite(price.maxDrawdown3y)) {
    if (price.maxDrawdown3y > -35) {
      risk += 6;
      notes.risk.push("3年の大きな下落が比較的浅い");
    } else if (price.maxDrawdown3y > -50) {
      risk += 3;
      notes.risk.push("下落耐性は中程度");
    }
  }
  if (Number.isFinite(price.volatility)) {
    if (price.volatility < 35) {
      risk += 5;
      notes.risk.push("値動きが比較的おだやか");
    } else if (price.volatility < 50) {
      risk += 3;
      notes.risk.push("値動きは中程度");
    }
  }
  if (!badHits.length) {
    risk += 4;
    notes.risk.push("目立つ悪材料ワードなし");
  }

  if (sectorHeld === 0) {
    fit += 8;
    notes.fit.push("今のリストと業種が重なりにくい");
  } else if (sectorHeld === 1) {
    fit += 4;
    notes.fit.push("業種の重なりは少なめ");
  }
  if (inBudget) {
    fit += 5;
    notes.fit.push("資金を分散しやすい");
  }

  return finalizeDiscoveryProcess({
    stages: [
      processStage("事業", business, 25, notes.business),
      processStage("割安", value, 25, notes.value),
      processStage("買い時", timing, 20, notes.timing),
      processStage("リスク", risk, 15, notes.risk),
      processStage("相性", fit, 15, notes.fit),
    ],
  });
}

function processStage(label, score, max, notes) {
  const bounded = clamp(Math.round(score), 0, max);
  return {
    label,
    score: bounded,
    max,
    status: bounded >= max * 0.72 ? "合格" : bounded >= max * 0.45 ? "確認" : "弱い",
    note: notes[0] || "根拠待ち",
  };
}

function boostProcessStage(process, label, delta, note) {
  if (!process?.stages) return process;
  const stages = process.stages.map((stage) => {
    if (stage.label !== label) return stage;
    const score = clamp(stage.score + delta, 0, stage.max);
    return {
      ...stage,
      score,
      status: score >= stage.max * 0.72 ? "合格" : score >= stage.max * 0.45 ? "確認" : "弱い",
      note,
    };
  });
  return finalizeDiscoveryProcess({ stages });
}

function finalizeDiscoveryProcess(process) {
  const stages = process?.stages || [];
  const totalScore = clamp(Math.round(stages.reduce((sum, stage) => sum + stage.score, 0)), 0, 100);
  return {
    totalScore,
    verdict: totalScore >= 80 ? "重点調査" : totalScore >= 65 ? "候補" : "監視",
    stages,
  };
}

function discoveryRankLabel(score) {
  if (score >= 80) return "好調割安候補";
  if (score >= 65) return "検討候補";
  return "監視候補";
}

function candidateBuyPlan(price, options = {}) {
  const current = nullablePositiveNumber(price.current);
  if (!current) {
    return {
      stance: "価格待ち",
      maxBuyPrice: null,
      unitAmountAtMax: null,
      summary: "価格データが取れてから買い目安を出します。",
      checks: ["価格データ待ち"],
    };
  }

  const unitSize = options.unitSize || 100;
  const trendPrice = nullablePositiveNumber(price.trendPrice3y);
  const unitBudget = nullablePositiveNumber(options.unitBudget);
  const currentUnitAmount = current * unitSize;
  const nearTrendCap = trendPrice ? trendPrice * 1.02 : current * 0.98;
  const pullbackCap = Number.isFinite(price.return3m) && price.return3m > 18 ? current * 0.94 : current * 0.98;
  const budgetCap = unitBudget ? unitBudget / unitSize : current * 1.05;
  const maxBuyPrice = Math.max(1, Math.min(nearTrendCap, pullbackCap, budgetCap));
  const unitAmountAtMax = maxBuyPrice * unitSize;
  const checks = [];

  if (trendPrice) {
    const gap = ((current - trendPrice) / trendPrice) * 100;
    if (gap <= -8) checks.push("今の株価は3年目安より安い");
    else if (gap <= 8) checks.push("今の株価は3年目安に近い");
    else checks.push("今の株価は3年目安より高い");
  }

  if (unitBudget) {
    checks.push(currentUnitAmount <= unitBudget
      ? `${unitSize}株が予算内`
      : `${unitSize}株は予算超過`);
  }

  if (Number.isFinite(price.return3m)) {
    if (price.return3m >= 28) checks.push("短期で上がりすぎに注意");
    else if (price.return3m >= -5) checks.push("短期の値動きは許容範囲");
    else checks.push("直近は弱め");
  }

  const gapToMax = ((current - maxBuyPrice) / maxBuyPrice) * 100;
  const strongScore = Number(options.businessValueScore || 0) >= 65;
  let stance = "待つ";
  if (gapToMax <= 1 && strongScore) stance = "今すぐ検討";
  else if (gapToMax <= 7) stance = "指値で待つ";
  else stance = "押し目待ち";

  return {
    stance,
    maxBuyPrice: Math.round(maxBuyPrice * 10) / 10,
    unitAmountAtMax: Math.round(unitAmountAtMax),
    summary: `${formatYen(maxBuyPrice)}以下なら検討しやすい水準。現在値との差は${formatSignedPercent(((maxBuyPrice - current) / current) * 100)}です。`,
    checks: uniqueText(checks).slice(0, 4),
  };
}

function compactDiscoveryPrice(price, unitSize = 100) {
  return {
    current: price.current,
    unitAmount: Number.isFinite(price.current) ? price.current * unitSize : null,
    return3m: price.return3m,
    return1y: price.return1y,
    return3y: price.return3y,
    annualizedReturn3y: price.annualizedReturn3y,
    maxDrawdown3y: price.maxDrawdown3y,
    volatility: price.volatility,
    trend3y: price.trend3y,
    trendPrice3y: price.trendPrice3y,
    distanceFromTrend3y: price.distanceFromTrend3y,
    distanceFromHigh3y: price.distanceFromHigh3y,
    dividendPerShareTtm: price.dividendPerShareTtm,
    dividendYield: price.dividendYield,
    dividendChangePct: price.dividendChangePct,
    dividendLastDate: price.dividendLastDate,
    dividendLastAmount: price.dividendLastAmount,
  };
}

function candidateToStock(candidate) {
  return normalizeStock({
    symbol: candidate.symbol,
    name: candidate.name,
    market: candidate.market || "東証",
    sector: candidate.sector,
    holding: false,
    notes: candidate.notes || "",
  });
}

function sectorCount(stocks) {
  const counts = new Map();
  for (const stock of stocks) {
    const sector = stockSector(stock);
    counts.set(sector, (counts.get(sector) || 0) + 1);
  }
  return counts;
}

function stockSector(stock) {
  if (stock.sector) return stock.sector;
  const universe = discoveryUniverse.find((candidate) => candidate.symbol === stock.symbol);
  if (universe?.sector) return universe.sector;
  const known = {
    "9005.T": "鉄道",
    "9201.T": "航空",
    "9432.T": "通信",
    "9434.T": "通信",
    "7203.T": "自動車",
    "6758.T": "電機",
    "8306.T": "銀行",
    "6501.T": "電機",
    "7974.T": "ゲーム",
    "9984.T": "投資",
  };
  return known[stock.symbol] || "その他";
}

async function researchStock(stock, options) {
  const queries = [
    `${stock.name} ${stock.symbol.replace(".T", "")} 株価 決算 業績 ニュース 投資判断`,
    `${stock.name} ${stock.symbol.replace(".T", "")} 中期経営計画 配当 リスク`,
  ];
  const searchResults = [];
  const perQueryLimit = Math.max(5, Math.ceil(options.websiteLimit / queries.length));

  for (const query of queries) {
    const results = await searchGoogle(query, { limit: perQueryLimit }).catch(() => []);
    searchResults.push(...results);
  }

  const deduped = uniqueBy(searchResults, (item) => item.url).slice(0, options.websiteLimit);
  const crawled = [];
  const crawlTargets = deduped.slice(0, Math.min(3, deduped.length));
  for (const item of crawlTargets) {
    const sitePages = await crawlSite(item.url, options.depthLimit, options.pagesPerSite).catch(() => []);
    crawled.push(...sitePages);
  }

  return {
    queryCount: queries.length,
    searched: deduped.length,
    crawled: crawled.length,
    warning: deduped.length ? "" : googleSearchWarning(),
    evidence: [
      ...deduped.map((item) => ({
        title: item.title,
        url: item.url,
        source: hostOf(item.url),
        snippet: cleanText(item.snippet).slice(0, 260),
        kind: "search",
      })),
      ...crawled.map((item) => ({
        title: item.title,
        url: item.url,
        source: hostOf(item.url),
        snippet: cleanText(item.text).slice(0, 260),
        kind: `depth ${item.depth}`,
      })),
    ].slice(0, 30),
    contextText: [
      ...deduped.map((item) => `${item.title}\n${item.snippet}\n${item.url}`),
      ...crawled.map((item) => `${item.title}\n${item.text}\n${item.url}`),
    ].join("\n\n").slice(0, 28000),
  };
}

async function searchGoogle(query, { limit }) {
  const settings = await readSettings();
  if (settings.searchProvider === "searxng") {
    return searchSearxng(query, { limit, settings });
  }
  return searchGoogleCustom(query, { limit, settings });
}

async function searchSearxng(query, { limit, settings }) {
  if (!settings.searxngUrl) return [];
  const attempts = [
    { categories: "news", engines: "bing news", timeout: 18000 },
    { categories: "general", engines: "bing", timeout: 18000 },
  ];
  const results = [];
  const maxPages = limit > 10 ? 3 : 1;

  for (const attempt of attempts) {
    if (uniqueBy(results, (item) => item.url).length >= limit) break;
    for (let pageno = 1; pageno <= maxPages; pageno += 1) {
      if (uniqueBy(results, (item) => item.url).length >= limit) break;
      const pageResults = await fetchSearxngResults(query, {
        settings,
        categories: attempt.categories,
        engines: attempt.engines,
        timeout: attempt.timeout,
        pageno,
      }).catch(() => []);
      if (!pageResults.length) break;
      results.push(...pageResults);
    }
  }

  return uniqueBy(results, (item) => item.url).slice(0, limit);
}

async function fetchSearxngResults(query, { settings, categories, engines, timeout, pageno = 1 }) {
  const data = await fetchSearxngData(query, { settings, categories, engines, timeout, pageno });
  return (data.results || [])
    .filter((item) => item.url && /^https?:\/\//.test(item.url))
    .map((item) => ({
      title: cleanText(item.title || item.url),
      url: item.url,
      snippet: cleanText(item.content || item.snippet || ""),
    }));
}

async function fetchSearxngData(query, { settings, categories, engines, timeout, pageno = 1 }) {
  const url = new URL(settings.searxngUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "ja-JP");
  url.searchParams.set("safesearch", "0");
  url.searchParams.set("categories", categories);
  url.searchParams.set("pageno", String(pageno));
  if (engines) url.searchParams.set("engines", engines);
  const response = await fetchWithTimeout(url, {
    timeout,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`SearXNG returned ${response.status}`);
  return response.json();
}

async function searchGoogleCustom(query, { limit, settings }) {
  if (!settings.googleApiKey || !settings.googleCseId) return [];
  const results = [];
  for (let start = 1; results.length < limit && start <= 91; start += 10) {
    const url = new URL(settings.googleSearchUrl);
    url.searchParams.set("key", settings.googleApiKey);
    url.searchParams.set("cx", settings.googleCseId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(10, limit - results.length)));
    url.searchParams.set("start", String(start));
    url.searchParams.set("hl", "ja");
    url.searchParams.set("gl", "jp");
    url.searchParams.set("safe", "off");
    const response = await fetchWithTimeout(url, { timeout: 15000 });
    if (!response.ok) throw new Error(`Google Search returned ${response.status}`);
    const data = await response.json();
    const pageResults = (data.items || [])
      .filter((item) => item.link && /^https?:\/\//.test(item.link))
      .map((item) => ({
        title: cleanText(item.title || item.link),
        url: item.link,
        snippet: cleanText(item.snippet || ""),
      }));
    if (!pageResults.length) break;
    results.push(...pageResults);
  }
  return uniqueBy(results, (item) => item.url).slice(0, limit);
}

async function crawlSite(startUrl, depthLimit, pagesPerSite) {
  const start = new URL(startUrl);
  const seen = new Set();
  const queue = [{ url: start.href, depth: 1 }];
  const pages = [];

  while (queue.length && pages.length < pagesPerSite) {
    const current = queue.shift();
    if (!current || seen.has(current.url) || current.depth > depthLimit) continue;
    seen.add(current.url);

    const page = await fetchPageText(current.url).catch(() => null);
    if (!page) continue;
    pages.push({ ...page, url: current.url, depth: current.depth });

    if (current.depth >= depthLimit) continue;
    for (const href of extractLinks(page.html, current.url)) {
      if (queue.length > pagesPerSite * 3) break;
      const next = new URL(href);
      if (next.hostname !== start.hostname) continue;
      next.hash = "";
      if (!seen.has(next.href)) queue.push({ url: next.href, depth: current.depth + 1 });
    }
  }

  return pages;
}

async function fetchPageText(url) {
  const response = await fetchWithTimeout(url, {
    timeout: 9000,
    headers: {
      "user-agent": "Mozilla/5.0 local-stock-analysis",
      accept: "text/html,application/xhtml+xml",
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return null;
  const html = await response.text();
  const title = cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || url);
  const text = htmlToText(html).slice(0, 1800);
  return { title, text, html };
}

async function fetchPriceHistory(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "5y");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "dividends");
  const response = await fetchWithTimeout(url, { timeout: 12000 }).catch(() => null);
  if (!response?.ok) return emptyPrice();
  const data = await response.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) return emptyPrice();
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const closes = quote.close || [];
  const dividends = Object.values(result.events?.dividends || {})
    .map((item) => ({
      date: new Date(Number(item.date) * 1000).toISOString().slice(0, 10),
      amount: Number(item.amount),
    }))
    .filter((item) => item.date && Number.isFinite(item.amount) && item.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const series = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: Number(closes[index]),
    }))
    .filter((point) => Number.isFinite(point.close));
  return priceMetrics(series, {
    shortName: meta.shortName,
    longName: meta.longName,
    symbol: meta.symbol,
    dividends,
  });
}

function priceMetrics(series, meta = {}) {
  if (series.length < 2) return emptyPrice(series, meta);
  const current = last(series).close;
  const closes = series.map((point) => point.close);
  const series3y = series.slice(-756);
  const closes3y = series3y.map((point) => point.close);
  const high52 = Math.max(...closes.slice(-252));
  const low52 = Math.min(...closes.slice(-252));
  const high3y = Math.max(...closes3y);
  const low3y = Math.min(...closes3y);
  const sma50 = average(closes.slice(-50));
  const sma200 = average(closes.slice(-200));
  const volatility = annualizedVolatility(closes.slice(-252));
  const return3y = series.length > 500 ? returnFrom(series, Math.min(756, series.length - 1)) : null;
  const annualizedReturn3y = annualizedReturn(series3y);
  const trend = trendRegression(series3y);
  const trendSlope3y = trend.slope;
  const trendPrice3y = trend.currentPrice;
  const dividend = dividendMetrics(meta.dividends || [], current);
  return {
    current,
    return1m: returnFrom(series, 21),
    return3m: returnFrom(series, 63),
    return6m: returnFrom(series, 126),
    return1y: returnFrom(series, 252),
    return3y,
    annualizedReturn3y,
    high52,
    low52,
    high3y,
    low3y,
    distanceFromHigh52: high52 ? ((current - high52) / high52) * 100 : null,
    distanceFromLow52: low52 ? ((current - low52) / low52) * 100 : null,
    distanceFromHigh3y: high3y ? ((current - high3y) / high3y) * 100 : null,
    distanceFromLow3y: low3y ? ((current - low3y) / low3y) * 100 : null,
    maxDrawdown3y: maxDrawdown(closes3y),
    trendSlope3y,
    trendPrice3y,
    distanceFromTrend3y: trendPrice3y ? ((current - trendPrice3y) / trendPrice3y) * 100 : null,
    trend3y: trendSlope3y > 8 ? "UP" : trendSlope3y < -6 ? "DOWN" : "SIDEWAYS",
    sma50,
    sma200,
    volatility,
    shortName: cleanText(meta.shortName || ""),
    longName: cleanText(meta.longName || ""),
    yahooSymbol: cleanText(meta.symbol || ""),
    ...dividend,
    series: series3y,
  };
}

function dividendMetrics(dividends = [], current = null) {
  const sorted = dividends
    .map((item) => ({
      date: normalizeDate(item.date),
      amount: nullablePositiveNumber(item.amount),
    }))
    .filter((item) => item.date && item.amount)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1) || {};
  const anchorTime = latest.date
    ? new Date(`${latest.date}T00:00:00`).getTime()
    : Date.now();
  const oneYearMs = 366 * 86400000;
  const ttmStart = anchorTime - oneYearMs;
  const previousStart = anchorTime - (oneYearMs * 2);
  const ttm = dividendSum(sorted, ttmStart, anchorTime);
  const previousTtm = dividendSum(sorted, previousStart, ttmStart);
  return {
    dividendPerShareTtm: ttm || null,
    dividendYield: current && ttm ? (ttm / current) * 100 : null,
    dividendPreviousPerShareTtm: previousTtm || null,
    dividendChangePct: previousTtm ? ((ttm - previousTtm) / previousTtm) * 100 : null,
    dividendLastDate: latest.date || "",
    dividendLastAmount: latest.amount || null,
    dividendEvents: sorted.slice(-24),
  };
}

function dividendSum(dividends, fromTime, toTime) {
  return dividends.reduce((sum, item) => {
    const time = new Date(`${item.date}T00:00:00`).getTime();
    if (!Number.isFinite(time) || time <= fromTime || time > toTime) return sum;
    return sum + item.amount;
  }, 0);
}

function ruleBasedDecision(stock, price, research) {
  let score = 50;
  const reasons = [];
  const risks = [];
  const position = positionMetrics(stock, price);

  if (stock.holding && !position.purchasePrice) {
    risks.push("保有中だが購入単価が未入力のため、売却判断の精度が落ちる");
  }

  if (Number.isFinite(position.pnlPct)) {
    if (position.pnlPct >= 30) {
      score += 3;
      reasons.push(`取得単価比で${position.pnlPct.toFixed(1)}%の含み益がある`);
      if (Number.isFinite(price.return3m) && price.return3m < -5) {
        score -= 6;
        risks.push("含み益はあるが直近モメンタムが弱く、利益確定ラインの確認が必要");
      }
    } else if (position.pnlPct <= -20) {
      score -= 12;
      risks.push(`取得単価比で${Math.abs(position.pnlPct).toFixed(1)}%の含み損がある`);
      if (price.trend3y === "DOWN") {
        score -= 8;
        risks.push("含み損に加えて3年トレンドも下向き");
      }
    } else if (position.pnlPct <= -10) {
      score -= 6;
      risks.push(`取得単価比で${Math.abs(position.pnlPct).toFixed(1)}%の含み損がある`);
    }
  }

  if (Number.isFinite(position.holdingDays) && position.holdingDays < 30 && Number.isFinite(position.pnlPct) && position.pnlPct < 0) {
    risks.push("購入から日が浅く、短期ノイズと損切り基準を分けて確認する必要がある");
  }

  if (Number.isFinite(position.totalReturnPct)) {
    if (position.totalReturnPct > position.pnlPct && position.dividendReceived > 0) {
      reasons.push(`購入後の配当を${formatYen(position.dividendReceived)}受け取った計算で、実質損益を押し上げている`);
    }
    if (position.totalReturnPct <= -15) {
      risks.push(`配当込みでも${Math.abs(position.totalReturnPct).toFixed(1)}%の損失水準`);
    }
  }

  if (Number.isFinite(price.dividendYield)) {
    if (price.dividendYield >= 4 && !isHighChaseChart(price)) {
      score += 6;
      reasons.push(`配当利回りが${price.dividendYield.toFixed(1)}%あり、保有理由になる`);
    } else if (price.dividendYield >= 3) {
      score += 3;
      reasons.push(`配当利回りが${price.dividendYield.toFixed(1)}%ある`);
    }
    if (price.dividendYield >= 5.5 && (price.return1y < -10 || price.trend3y === "DOWN")) {
      risks.push("高配当でも株価下落による見かけの利回りか確認したい");
    }
  }

  if (Number.isFinite(price.dividendChangePct)) {
    if (price.dividendChangePct > 5) {
      score += 3;
      reasons.push("直近1年の配当が前の1年より増えている");
    } else if (price.dividendChangePct < -5) {
      score -= 6;
      risks.push("直近1年の配当が前の1年より減っている");
    }
  }

  if (Number.isFinite(price.return1y)) {
    if (price.return1y > 18) {
      score += 10;
      reasons.push("1年リターンが強く、中期の資金流入が確認できる");
    } else if (price.return1y < -15) {
      score -= 12;
      risks.push("1年リターンが弱く、下落トレンド継続の確認が必要");
    }
  }

  if (Number.isFinite(price.return3y)) {
    if (price.return3y > 120) {
      score += 2;
      reasons.push("3年リターンは強いが、上がりすぎ後の高値づかみに注意");
    } else if (price.return3y > 45) {
      score += 8;
      reasons.push("3年リターンが強く、長期の上昇傾向がある");
    } else if (price.return3y > 15) {
      score += 4;
      reasons.push("3年ではプラス圏を維持している");
    } else if (price.return3y < -20) {
      score -= 10;
      risks.push("3年リターンが弱く、長期の資金流出が続いている可能性がある");
    }
  }

  if (Number.isFinite(price.trendSlope3y)) {
    if (price.trendSlope3y > 8) {
      score += 6;
      reasons.push("過去3年の株価の流れが上向き");
    } else if (price.trendSlope3y < -6) {
      score -= 8;
      risks.push("過去3年の株価の流れが下向き");
    }
  }

  if (Number.isFinite(price.distanceFromTrend3y)) {
    if (price.distanceFromTrend3y <= -8) {
      score += 5;
      reasons.push("3年の流れから見た目安価格より安い");
    } else if (price.distanceFromTrend3y > 30) {
      score -= 16;
      risks.push("3年の流れから見た目安価格よりかなり高く、高値づかみに注意");
    } else if (price.distanceFromTrend3y > 18) {
      score -= 11;
      risks.push("3年の流れから見た目安価格より高く、買い急ぎに注意");
    }
  }

  if (isHighChaseChart(price)) {
    score -= 16;
    risks.push("グラフ上は大きく上がった後の高い位置で、今すぐ買う形ではない");
  }

  if (isNoUpsideChart(price)) {
    score -= 18;
    risks.push("グラフ上は上値が重く、ここから大きく上がる気配が弱い");
  }

  if (Number.isFinite(price.return3m)) {
    if (price.return3m > 8) {
      score += 8;
      reasons.push("直近3カ月のモメンタムが強い");
    } else if (price.return3m < -8) {
      score -= 8;
      risks.push("直近3カ月の価格推移が弱い");
    }
  }

  if (Number.isFinite(price.sma50) && Number.isFinite(price.sma200)) {
    if (price.sma50 > price.sma200) {
      score += 9;
      reasons.push("50日移動平均が200日移動平均を上回っている");
    } else {
      score -= 9;
      risks.push("50日移動平均が200日移動平均を下回っている");
    }
  }

  if (Number.isFinite(price.distanceFromHigh52) && price.distanceFromHigh52 > -8) {
    score += 5;
    reasons.push("52週高値に近く、需給は崩れていない");
  }

  if (Number.isFinite(price.distanceFromHigh3y)) {
    if (price.distanceFromHigh3y > -10) {
      score += 3;
      reasons.push("3年高値圏に近く、長期需給は保たれている");
    } else if (price.distanceFromHigh3y < -35) {
      score -= 6;
      risks.push("3年高値から大きく下落しており、戻り売りに注意");
    }
  }

  if (Number.isFinite(price.maxDrawdown3y) && price.maxDrawdown3y < -45) {
    score -= 6;
    risks.push("3年の最大下落率が大きく、損切り幅と建玉サイズの管理が必要");
  }

  if (Number.isFinite(price.volatility) && price.volatility > 38) {
    score -= 7;
    risks.push("価格変動が大きく、建玉サイズを落とすべき水準");
  }

  const context = research.contextText.toLowerCase();
  for (const word of ["増配", "自社株買い", "上方修正", "最高益", "営業益増"]) {
    if (context.includes(word.toLowerCase())) {
      score += 4;
      reasons.push(`${word}に関する材料が検索結果に含まれる`);
    }
  }
  for (const word of ["下方修正", "減益", "赤字", "不祥事", "行政処分", "訴訟"]) {
    if (context.includes(word.toLowerCase())) {
      score -= 5;
      risks.push(`${word}に関する材料が検索結果に含まれる`);
    }
  }

  const action = score >= 72 ? "BUY" : score >= 46 ? "HOLD" : score >= 26 ? "WATCH" : "SELL";
  const thesis = `${stock.name}は価格トレンド、検索材料、変動率を総合して${actionLabels[action]}判定。`;
  return {
    action,
    confidence: clamp(Math.round(Math.abs(score - 50) * 1.2 + 45), 35, 86),
    thesis,
    reasons: uniqueText(reasons).slice(0, 5),
    risks: uniqueText(risks).slice(0, 5),
  };
}

function isHighChaseChart(price = {}) {
  const strongRun = Number.isFinite(price.return3y) && price.return3y >= 100;
  const farFromTrend = Number.isFinite(price.distanceFromTrend3y) && price.distanceFromTrend3y >= 12;
  const farFromLow = Number.isFinite(price.distanceFromLow3y) && price.distanceFromLow3y >= 120;
  const notDeepPullback = !Number.isFinite(price.distanceFromHigh3y) || price.distanceFromHigh3y > -35;
  return strongRun && notDeepPullback && (farFromTrend || farFromLow);
}

function isNoUpsideChart(price = {}) {
  const nearUpperRange = Number.isFinite(price.distanceFromHigh3y) && price.distanceFromHigh3y > -12;
  const notCheapVsTrend = !Number.isFinite(price.distanceFromTrend3y) || price.distanceFromTrend3y > -3;
  const weakLongTrend = price.trend3y !== "UP" || (Number.isFinite(price.annualizedReturn3y) && price.annualizedReturn3y < 5);
  const reboundAlready = Number.isFinite(price.return3m) && price.return3m > 10;
  const shortOverLongNotEnough = Number.isFinite(price.sma50) && Number.isFinite(price.sma200) && price.sma50 <= price.sma200 * 1.03;
  return nearUpperRange && notCheapVsTrend && weakLongTrend && (reboundAlready || shortOverLongNotEnough);
}

async function aiBatchDecisions(rows) {
  const items = rows.map(({ stock, price, research, fallback }) => ({
    symbol: stock.symbol,
    name: stock.name,
    holding: Boolean(stock.holding),
    notes: stock.notes || "",
    position: positionMetrics(stock, price),
    price: compactPrice(price),
    ruleDecision: fallback,
    evidence: research.evidence.slice(0, 5).map((item) => ({
      title: item.title,
      source: item.source,
      snippet: item.snippet,
      kind: item.kind,
    })),
  }));

  const prompt = [
    "あなたは日本株のリサーチ補助AIです。将来利益を保証せず、売買判断の根拠とリスクを厳密に分けてください。",
    "出力はJSONのみ。形式は {\"decisions\":[{\"symbol\":\"9005.T\",\"action\":\"HOLD\",\"confidence\":55,\"thesis\":\"...\",\"reasons\":[\"...\"],\"risks\":[\"...\"]}]}。",
    "actionは BUY, HOLD, SELL, WATCH のいずれか。SELLは即時売却ではなく、数週間から数か月の保有理由を見直す意味です。confidenceは0-100。",
    "ユーザーはデイトレーダーではありません。短期ノイズだけで売買を促さず、根拠不足、材料が古い、検索結果が薄い場合はWATCHを優先してください。",
    "3年で大きく上がった後、現在値が3年の流れや安値から見て高い位置にある場合はBUYにせず、WATCHかHOLDにしてください。",
    "配当利回り、配当の増減、購入日以降の配当込み損益を見てください。高配当だけでBUYにせず、株価下落で利回りが高く見える可能性をリスクに入れてください。",
    "短期売買ではなく、3年の価格傾向、購入日、購入単価、株数、配当込み損益、直近モメンタム、悪材料、過熱感、保有継続可否を総合評価してください。",
    "",
    JSON.stringify({ stocks: items }),
  ].join("\n");

  const model = await getLmStudioModel();
  const content = await callLmStudioResponses(model, prompt).catch(async (error) => {
    if (String(error.message || "").includes("404")) return callLmStudioChat(model, prompt);
    throw error;
  });
  const parsed = parseJsonObject(content);
  const decisions = Array.isArray(parsed) ? parsed : parsed.decisions;
  if (!Array.isArray(decisions)) throw new Error("LM StudioのJSON形式が不正です");
  return decisions
    .filter((decision) => decision?.symbol)
    .map((decision) => ({
      symbol: String(decision.symbol).trim().toUpperCase(),
      action: decision.action,
      confidence: decision.confidence,
      thesis: decision.thesis,
      reasons: decision.reasons,
      risks: decision.risks,
    }));
}

async function callLmStudioResponses(model, prompt, options = {}) {
  const settings = await readSettings();
  const response = await fetchWithTimeout(`${settings.lmStudioUrl}/responses`, {
    timeout: settings.lmStudioTimeoutMs,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: prompt,
      instructions: options.instructions || "Return strict JSON only. Do not wrap the JSON in markdown fences.",
      reasoning: { effort: "low" },
      temperature: 0.2,
      max_output_tokens: options.maxOutputTokens || 4096,
    }),
  });
  if (!response.ok) throw new Error(`LM Studio responses returned ${response.status}`);
  const data = await response.json();
  const text = extractResponseText(data);
  if (!text) throw new Error("LM Studio responses output was empty");
  return text;
}

async function callLmStudioChat(model, prompt, options = {}) {
  const settings = await readSettings();
  const response = await fetchWithTimeout(`${settings.lmStudioUrl}/chat/completions`, {
    timeout: settings.lmStudioTimeoutMs,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: options.maxTokens || 4096,
      messages: [
        { role: "system", content: options.system || "Return strict JSON only. Do not wrap the JSON in markdown fences." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LM Studio returned ${response.status}`);
  const data = await response.json();
  const message = data?.choices?.[0]?.message || {};
  return message.content || message.reasoning_content || "";
}

async function getLmStudioModel() {
  const settings = await readSettings();
  if (lmModelCache.url === settings.lmStudioUrl && lmModelCache.model) return lmModelCache.model;
  const models = await fetchWithTimeout(`${settings.lmStudioUrl}/models`, { timeout: 5000 }).then((r) => r.json());
  lmModelCache = { url: settings.lmStudioUrl, model: models?.data?.[0]?.id || "" };
  if (!lmModelCache.model) throw new Error("LM Studio model not found");
  return lmModelCache.model;
}

function compactPrice(price) {
  return {
    current: price.current,
    return1m: price.return1m,
    return3m: price.return3m,
    return6m: price.return6m,
    return1y: price.return1y,
    return3y: price.return3y,
    annualizedReturn3y: price.annualizedReturn3y,
    distanceFromHigh52: price.distanceFromHigh52,
    distanceFromLow52: price.distanceFromLow52,
    distanceFromHigh3y: price.distanceFromHigh3y,
    maxDrawdown3y: price.maxDrawdown3y,
    trendSlope3y: price.trendSlope3y,
    trendPrice3y: price.trendPrice3y,
    distanceFromTrend3y: price.distanceFromTrend3y,
    trend3y: price.trend3y,
    sma50: price.sma50,
    sma200: price.sma200,
    volatility: price.volatility,
    dividendPerShareTtm: price.dividendPerShareTtm,
    dividendYield: price.dividendYield,
    dividendChangePct: price.dividendChangePct,
    dividendLastDate: price.dividendLastDate,
    dividendLastAmount: price.dividendLastAmount,
  };
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const output of data?.output || []) {
    if (output.type !== "message") continue;
    for (const content of output.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function normalizeDecision(stock, price, research, decision) {
  const initialAction = ["BUY", "HOLD", "SELL", "WATCH"].includes(decision.action) ? decision.action : "WATCH";
  const position = positionMetrics(stock, price);
  const safety = decisionSafetyOverride(stock, price, initialAction, position);
  const action = safety.action;
  const reasons = uniqueText([...asStringArray(decision.reasons), ...safety.reasons]).slice(0, 5);
  const risks = uniqueText([...asStringArray(decision.risks), ...safety.risks]).slice(0, 5);
  return {
    symbol: stock.symbol,
    name: stock.name,
    action,
    confidence: clamp(Number(decision.confidence || 45), 0, 100),
    thesis: String(safety.thesis || decision.thesis || `${stock.name}は${actionLabels[action]}判定。`).slice(0, 360),
    reasons,
    risks,
    price,
    position,
    entryValue: evaluateEntryPrice(stock.targetBuyPrice, price),
    evidence: research.evidence.slice(0, 12),
    researchStats: {
      searched: research.searched,
      crawled: research.crawled,
    },
  };
}

function decisionSafetyOverride(stock, price = {}, action, position = positionMetrics(stock, price)) {
  if (action === "BUY" && isHighChaseChart(price)) {
    return {
      action: stock.holding ? "HOLD" : "WATCH",
      thesis: `${stock.name}は事業材料や長期上昇はありますが、グラフ上は大きく上がった後の高い位置です。今すぐ買いではなく、押し目や決算確認を待つ判定にしました。`,
      reasons: ["長期の上昇力は確認できる"],
      risks: ["3年で大きく上がった後で、高値づかみになりやすい", "買うなら押し目と損切りラインを先に決めたい"],
    };
  }
  if (action === "BUY" && isNoUpsideChart(price)) {
    return {
      action: stock.holding ? "HOLD" : "WATCH",
      thesis: `${stock.name}は直近で戻していますが、3年チャートでは上値が重い位置です。新規買い候補ではなく、保有なら様子見、買い増しは押し目待ちにしました。`,
      reasons: ["直近の戻りは確認できる"],
      risks: ["3年高値に近いのに長期の上昇力が弱く、ここからの上値余地が小さい", "追加買いは安い位置まで待ちたい"],
    };
  }
  if (action === "SELL" && stock.holding) {
    const nearRangeLow = Number.isFinite(price.distanceFromLow3y) && price.distanceFromLow3y <= 18;
    const notDownTrend = price.trend3y !== "DOWN";
    const lossButNotBroken = Number.isFinite(position.totalReturnPct || position.pnlPct)
      && (position.totalReturnPct ?? position.pnlPct) > -18;
    if (nearRangeLow && notDownTrend && lossButNotBroken) {
      return {
        action: "WATCH",
        thesis: `${stock.name}は損失がありますが、3年レンジでは安い側です。これは即損切りではなく、決算悪化や下値割れがないか確認する判定です。`,
        reasons: ["3年レンジの安い側にあり、売るより反発確認の場面"],
        risks: ["レンジ下限を明確に割った場合は損切り候補", "業績悪化が確認された場合は保有理由を見直す"],
      };
    }
  }
  return { action, thesis: "", reasons: [], risks: [] };
}

async function status() {
  const settings = await readSettings();
  const [searchEngine, lmStudio] = await Promise.all([checkSearchEngine(settings), checkLmStudio(settings)]);
  return {
    searchEngine,
    googleSearch: searchEngine,
    lmStudio,
    settings: publicSettings(settings),
  };
}

async function searchDiagnostics() {
  const settings = await readSettings();
  if (settings.searchProvider !== "searxng") {
    return {
      provider: "Google",
      ok: Boolean(settings.googleApiKey && settings.googleCseId),
      generatedAt: new Date().toISOString(),
      checks: [{
        label: "Google Custom Search",
        ok: Boolean(settings.googleApiKey && settings.googleCseId),
        resultCount: null,
        note: settings.googleApiKey && settings.googleCseId ? "設定済み" : "APIキーと検索エンジンIDが必要",
        examples: [],
      }],
      stopped: [],
    };
  }

  const checks = await Promise.all([
    diagnosticSearxngCheck(settings, {
      label: "ニュース検索",
      categories: "news",
      engines: "bing news",
      query: "日本株 決算短信 上方修正 増配",
    }),
    diagnosticSearxngCheck(settings, {
      label: "通常検索",
      categories: "general",
      engines: "bing",
      query: "株探 上方修正 決算短信 日本株",
    }),
  ]);
  const stopped = uniqueBy(checks.flatMap((check) => check.stopped || []), (item) => `${item.engine}:${item.reason}`);
  return {
    provider: "SearXNG",
    ok: checks.some((check) => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
    stopped: stopped.slice(0, 12),
  };
}

async function diagnosticSearxngCheck(settings, test) {
  try {
    const data = await fetchSearxngData(test.query, {
      settings,
      categories: test.categories,
      engines: test.engines,
      timeout: 12000,
    });
    const results = Array.isArray(data.results) ? data.results : [];
    return {
      label: test.label,
      ok: results.length > 0,
      resultCount: results.length,
      note: results.length ? "検索結果あり" : "検索結果なし",
      examples: results.slice(0, 3).map((item) => ({
        title: cleanText(item.title || item.url),
        url: item.url,
        source: hostOf(item.url),
      })),
      stopped: normalizeUnresponsiveEngines(data.unresponsive_engines),
    };
  } catch (error) {
    return {
      label: test.label,
      ok: false,
      resultCount: 0,
      note: error.message || "検索に失敗",
      examples: [],
      stopped: [],
    };
  }
}

function normalizeUnresponsiveEngines(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (Array.isArray(item)) return { engine: String(item[0] || ""), reason: String(item[1] || "") };
    return { engine: String(item || ""), reason: "" };
  }).filter((item) => item.engine);
}

async function checkSearchEngine(settings = null) {
  const resolved = settings || await readSettings();
  if (resolved.searchProvider === "searxng") {
    try {
      const url = new URL(resolved.searxngUrl);
      url.searchParams.set("q", "日本株 決算短信");
      url.searchParams.set("format", "json");
      url.searchParams.set("language", "ja-JP");
      url.searchParams.set("safesearch", "0");
      url.searchParams.set("categories", "news");
      url.searchParams.set("engines", "bing news");
      const response = await fetchWithTimeout(url, { timeout: 10000, headers: { accept: "application/json" } });
      const data = response.ok ? await response.json().catch(() => ({})) : {};
      const resultCount = Array.isArray(data.results) ? data.results.length : 0;
      return {
        ok: response.ok && resultCount > 0,
        provider: "SearXNG",
        configured: Boolean(resolved.searxngUrl),
        url: resolved.searxngUrl,
        resultCount,
      };
    } catch (error) {
      return {
        ok: false,
        provider: "SearXNG",
        configured: Boolean(resolved.searxngUrl),
        url: resolved.searxngUrl,
        error: error.message,
      };
    }
  }

  return {
    ok: Boolean(resolved.googleApiKey && resolved.googleCseId),
    provider: "Google",
    configured: Boolean(resolved.googleApiKey && resolved.googleCseId),
    url: resolved.googleSearchUrl,
  };
}

async function checkLmStudio(settings = null) {
  const resolved = settings || await readSettings();
  try {
    const response = await fetchWithTimeout(`${resolved.lmStudioUrl}/models`, { timeout: 3000 });
    const data = response.ok ? await response.json() : {};
    return { ok: response.ok, url: resolved.lmStudioUrl, model: data?.data?.[0]?.id || "" };
  } catch (error) {
    return { ok: false, url: resolved.lmStudioUrl, error: error.message };
  }
}

function normalizeStock(stock) {
  const positions = normalizePositions(stock);
  const aggregate = aggregatePositions(positions);
  const purchaseDate = aggregate.purchaseDate || normalizeDate(stock.purchaseDate);
  const purchasePrice = aggregate.purchasePrice || nullablePositiveNumber(stock.purchasePrice);
  const quantity = aggregate.quantity || nullablePositiveNumber(stock.quantity);
  const minimumHoldQuantity = resolveMinimumHoldQuantity(stock, quantity);
  const hasPosition = positions.length > 0 || Boolean(purchaseDate || purchasePrice || quantity);
  return {
    symbol: normalizeSymbol(stock.symbol),
    name: String(stock.name || "").trim(),
    market: String(stock.market || "東証").trim(),
    sector: String(stock.sector || stockSector(stock)).trim(),
    holding: typeof stock.holding === "boolean" ? stock.holding : hasPosition,
    notes: String(stock.notes || "").trim(),
    purchaseDate,
    purchasePrice,
    quantity,
    positions,
    minimumHoldQuantity,
    targetBuyPrice: nullablePositiveNumber(stock.targetBuyPrice),
  };
}

function resolveMinimumHoldQuantity(stock, quantity) {
  const explicit = nullableNonNegativeNumber(stock.minimumHoldQuantity);
  if (explicit !== null) return explicit;
  const coreSymbols = new Set(["9005.T", "9201.T", "9432.T", "9434.T"]);
  const symbol = normalizeSymbol(stock.symbol);
  if (coreSymbols.has(symbol) && quantity) return quantity;
  return 0;
}

function positionMetrics(stock, price = {}) {
  const positions = normalizePositions(stock);
  const aggregate = aggregatePositions(positions);
  const quantity = aggregate.quantity;
  const invested = aggregate.invested;
  const purchasePrice = aggregate.purchasePrice;
  const current = nullablePositiveNumber(price.current);
  const firstPurchaseDate = aggregate.purchaseDate;
  const holdingDays = firstPurchaseDate ? daysSince(firstPurchaseDate) : null;
  const pnlPct = purchasePrice && current ? ((current - purchasePrice) / purchasePrice) * 100 : null;
  const pnlAmount = purchasePrice && current && quantity ? (current - purchasePrice) * quantity : null;
  const marketValue = current && quantity ? current * quantity : null;
  const dividendReceived = dividendsForPositions(positions, price.dividendEvents || []);
  const annualDividendEstimate = Number.isFinite(price.dividendPerShareTtm) && quantity
    ? price.dividendPerShareTtm * quantity
    : null;
  const totalReturnAmount = Number.isFinite(pnlAmount)
    ? pnlAmount + (Number.isFinite(dividendReceived) ? dividendReceived : 0)
    : null;
  const totalReturnPct = invested && Number.isFinite(totalReturnAmount)
    ? (totalReturnAmount / invested) * 100
    : null;
  const minimumHoldQuantity = nullableNonNegativeNumber(stock.minimumHoldQuantity) || 0;
  const sellableQuantity = Math.max(0, (quantity || 0) - minimumHoldQuantity);
  return {
    positions,
    purchaseDate: firstPurchaseDate,
    purchasePrice,
    quantity: quantity || null,
    holdingDays,
    invested: invested || null,
    marketValue,
    pnlAmount,
    pnlPct,
    dividendReceived,
    annualDividendEstimate,
    totalReturnAmount,
    totalReturnPct,
    minimumHoldQuantity,
    sellableQuantity,
  };
}

function dividendsForPositions(positions, dividendEvents = []) {
  return positions.reduce((sum, lot) => {
    const purchaseTime = lot.purchaseDate ? new Date(`${lot.purchaseDate}T00:00:00`).getTime() : null;
    if (!Number.isFinite(purchaseTime) || !lot.quantity) return sum;
    return sum + dividendEvents.reduce((eventSum, event) => {
      const time = event.date ? new Date(`${event.date}T00:00:00`).getTime() : null;
      if (!Number.isFinite(time) || time < purchaseTime || !Number.isFinite(event.amount)) return eventSum;
      return eventSum + (event.amount * lot.quantity);
    }, 0);
  }, 0);
}

function evaluateEntryPrice(targetBuyPrice, price = {}) {
  const target = nullablePositiveNumber(targetBuyPrice);
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
      grade: "未評価",
      score: null,
      summary: "価格データ取得後に評価できます。",
      reasons: [],
      risks: ["3年価格データが不足しています"],
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
    reasons.push("今の株価より少し安く、追いかけ買いになりにくい");
  } else if (currentGap > 6) {
    score -= 14;
    risks.push(`今の株価より${currentGap.toFixed(1)}%高く、急いで買いすぎる価格`);
  } else if (currentGap > 0) {
    score -= 5;
    risks.push("今の株価より高いので、急いで買う理由を確認したい");
  }

  if (Number.isFinite(rangePosition)) {
    if (rangePosition <= 35) {
      score += 15;
      reasons.push("過去3年で見ると安い側の価格");
    } else if (rangePosition <= 60) {
      score += 6;
      reasons.push("過去3年で見ると高すぎない価格");
    } else if (rangePosition >= 85) {
      score -= 17;
      risks.push("過去3年の高値に近く、高値づかみしやすい");
    } else if (rangePosition >= 72) {
      score -= 8;
      risks.push("過去3年で見るとやや高い側の価格");
    }
  }

  if (price.trend3y === "UP") {
    score += 8;
    reasons.push("3年の株価の流れは上向き");
  } else if (price.trend3y === "DOWN") {
    score -= 14;
    risks.push("3年の株価の流れは下向きで、まだ下がる可能性がある");
  }

  if (Number.isFinite(price.sma200)) {
    if (target <= price.sma200) {
      score += 7;
      reasons.push("長めの平均価格より下で買える");
    } else if (target > price.sma200 * 1.12) {
      score -= 7;
      risks.push("長めの平均価格よりかなり高い");
    }
  }

  if (Number.isFinite(price.sma50) && target > price.sma50 && price.trend3y !== "UP") {
    score -= 5;
    risks.push("短期の平均価格より高いのに、長期の流れが強くない");
  }

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

  if (Number.isFinite(price.maxDrawdown3y) && price.maxDrawdown3y < -50) {
    score -= 8;
    risks.push("過去3年で大きく下げたことがあり、損切りラインを先に決めたい");
  }

  if (Number.isFinite(price.volatility)) {
    if (price.volatility < 28) {
      score += 4;
      reasons.push("値動きが比較的おだやか");
    } else if (price.volatility > 55) {
      score -= 9;
      risks.push("値動きが大きいので、買うなら株数を抑えたい");
    }
  }

  const bounded = clamp(Math.round(score), 0, 100);
  const grade = bounded >= 75 ? "買いやすい" : bounded >= 60 ? "悪くない" : bounded >= 45 ? "慎重に検討" : "見送り";
  const trendText = Number.isFinite(targetTrendGap)
    ? `3年の流れから見た目安価格 ${formatYen(price.trendPrice3y)} と比べると${trendGapText(targetTrendGap)}。`
    : "";
  const summary = `買いたい価格 ${formatYen(target)} は、${currentGapText(currentGap)}。過去3年では${rangePositionText(rangePosition)}です。${trendText}`;

  return {
    targetBuyPrice: target,
    grade,
    score: bounded,
    summary,
    reasons: uniqueText(reasons).slice(0, 4),
    risks: uniqueText(risks).slice(0, 4),
  };
}

function aggregatePositions(positions) {
  const quantity = positions.reduce((sum, lot) => sum + lot.quantity, 0);
  const invested = positions.reduce((sum, lot) => sum + (lot.purchasePrice * lot.quantity), 0);
  return {
    purchaseDate: positions.map((lot) => lot.purchaseDate).filter(Boolean).sort()[0] || "",
    purchasePrice: quantity > 0 ? invested / quantity : null,
    quantity: quantity || null,
    invested: invested || null,
  };
}

async function readAnalysisCache() {
  try {
    const cached = JSON.parse(await readFile(ANALYSIS_CACHE_PATH, "utf8"));
    const analyses = Array.isArray(cached.analyses) ? cached.analyses : [];
    return {
      generatedAt: cached.generatedAt || "",
      usedLmStudio: Boolean(cached.usedLmStudio),
      warnings: asStringArray(cached.warnings).slice(0, 6),
      analyses,
    };
  } catch {
    return { generatedAt: "", usedLmStudio: false, warnings: [], analyses: [] };
  }
}

async function saveAnalysisCache(result) {
  await mkdir(path.dirname(ANALYSIS_CACHE_PATH), { recursive: true });
  await writeFile(ANALYSIS_CACHE_PATH, JSON.stringify({
    generatedAt: result.generatedAt,
    usedLmStudio: result.usedLmStudio,
    warnings: result.warnings || [],
    analyses: result.analyses || [],
  }, null, 2));
}

async function readDiscoveryCache() {
  try {
    const cached = JSON.parse(await readFile(DISCOVERY_CACHE_PATH, "utf8"));
    return {
      generatedAt: cached.generatedAt || "",
      suggestions: Array.isArray(cached.suggestions) ? cached.suggestions : [],
      evidence: Array.isArray(cached.evidence) ? cached.evidence : [],
      sourceSummary: cached.sourceSummary || null,
      message: String(cached.message || ""),
    };
  } catch {
    return { generatedAt: "", suggestions: [], evidence: [], sourceSummary: null, message: "" };
  }
}

async function saveDiscoveryCache(result) {
  const excludedCandidates = await readExcludedCandidates();
  const filtered = filterDiscoveryResultByExclusions(result, excludedCandidates);
  await mkdir(path.dirname(DISCOVERY_CACHE_PATH), { recursive: true });
  await writeFile(DISCOVERY_CACHE_PATH, JSON.stringify({
    generatedAt: filtered.generatedAt,
    suggestions: filtered.suggestions || [],
    evidence: filtered.evidence || [],
    sourceSummary: filtered.sourceSummary || null,
    message: filtered.message || "",
  }, null, 2));
}

function filterDiscoveryResultByExclusions(result = {}, excludedCandidates = []) {
  const excluded = new Set(excludedCandidates.map((candidate) => candidate.symbol));
  const suggestions = (result.suggestions || []).filter((candidate) => !excluded.has(candidate.symbol));
  return {
    generatedAt: result.generatedAt || "",
    added: result.added || [],
    stocks: result.stocks || [],
    suggestions,
    evidence: result.evidence || [],
    sourceSummary: result.sourceSummary
      ? { ...result.sourceSummary, excludedCount: excludedCandidates.length, suggestionCount: suggestions.length }
      : null,
    message: result.message || "",
  };
}

async function readExcludedCandidates() {
  try {
    const rows = JSON.parse(await readFile(EXCLUDED_CANDIDATES_PATH, "utf8"));
    if (!Array.isArray(rows)) return [];
    return rows
      .map(normalizeExcludedCandidate)
      .filter((candidate) => candidate.symbol)
      .sort((a, b) => a.name.localeCompare(b.name, "ja") || a.symbol.localeCompare(b.symbol));
  } catch {
    return [];
  }
}

async function saveExcludedCandidates(candidates = []) {
  const rows = uniqueBy(candidates.map(normalizeExcludedCandidate).filter((candidate) => candidate.symbol), (candidate) => candidate.symbol)
    .sort((a, b) => a.name.localeCompare(b.name, "ja") || a.symbol.localeCompare(b.symbol));
  await mkdir(path.dirname(EXCLUDED_CANDIDATES_PATH), { recursive: true });
  await writeFile(EXCLUDED_CANDIDATES_PATH, JSON.stringify(rows, null, 2));
  return rows;
}

async function addExcludedCandidate(candidate = {}) {
  const symbol = normalizeSymbol(candidate.symbol);
  if (!symbol) throw new Error("非表示にする銘柄コードが見つかりません。");
  const current = await readExcludedCandidates();
  const next = current.filter((item) => item.symbol !== symbol);
  next.push(normalizeExcludedCandidate({
    ...candidate,
    symbol,
    createdAt: new Date().toISOString(),
  }));
  return saveExcludedCandidates(next);
}

async function removeExcludedCandidate(symbol) {
  if (!symbol) return readExcludedCandidates();
  const next = (await readExcludedCandidates()).filter((candidate) => candidate.symbol !== symbol);
  return saveExcludedCandidates(next);
}

function normalizeExcludedCandidate(candidate = {}) {
  const symbol = normalizeSymbol(candidate.symbol);
  return {
    symbol,
    name: String(candidate.name || symbol || "").trim(),
    sector: String(candidate.sector || "").trim(),
    reason: String(candidate.reason || "好みではない").trim(),
    createdAt: candidate.createdAt || new Date().toISOString(),
  };
}

async function notifyStrongAnalysisSignals(analyses = []) {
  const settings = await readSettings();
  if (!settings.notificationsEnabled || (!settings.teamsWebhookUrl && !(settings.graphAccessToken && settings.graphChatId))) return;
  const signals = analyses
    .map((analysis) => analysisSignal(analysis, settings))
    .filter(Boolean);
  await sendSignalsOnce(signals, settings);
}

async function notifyStrongDiscoverySignals(suggestions = []) {
  const settings = await readSettings();
  if (!settings.notificationsEnabled || (!settings.teamsWebhookUrl && !(settings.graphAccessToken && settings.graphChatId))) return;
  const excluded = new Set((await readExcludedCandidates()).map((candidate) => candidate.symbol));
  const signals = suggestions
    .filter((candidate) => !excluded.has(candidate.symbol))
    .map((candidate) => discoverySignal(candidate, settings))
    .filter(Boolean);
  await sendSignalsOnce(signals, settings);
}

function analysisSignal(analysis, settings) {
  if (!analysis || Number(analysis.confidence || 0) < settings.notificationMinConfidence) return null;
  const price = analysis.price || {};
  const position = analysis.position || {};
  if (analysis.action === "BUY") {
    if (isHighChaseChart(price) || isNoUpsideChart(price)) return null;
    const edge = estimateBuyEdgeYen(price, settings.unitSize) - settings.tradeFeeYen;
    if (edge < settings.notificationMinNetEdgeYen) return null;
    return {
      key: `${analysis.symbol}:BUY`,
      action: "購入候補",
      symbol: analysis.symbol,
      name: analysis.name,
      confidence: analysis.confidence,
      netEdgeYen: edge,
      reason: analysis.thesis,
      points: [...(analysis.reasons || []), ...(analysis.risks || []).map((item) => `注意: ${item}`)].slice(0, 5),
    };
  }
  if (analysis.action === "SELL") {
    const sellableQuantity = Number(position.sellableQuantity || 0);
    if (sellableQuantity <= 0) return null;
    const edge = estimateSellEdgeYen(position, sellableQuantity) - settings.tradeFeeYen;
    if (edge < settings.notificationMinNetEdgeYen) return null;
    return {
      key: `${analysis.symbol}:SELL`,
      action: "追加分の見直し候補",
      symbol: analysis.symbol,
      name: analysis.name,
      confidence: analysis.confidence,
      netEdgeYen: edge,
      reason: analysis.thesis,
      points: [
        `判定対象 ${sellableQuantity}株`,
        ...(analysis.risks || []),
        ...(analysis.reasons || []),
      ].slice(0, 5),
    };
  }
  return null;
}

function discoverySignal(candidate, settings) {
  const confidence = candidate.businessValueScore || candidate.score || 0;
  if (confidence < settings.notificationMinConfidence) return null;
  const price = candidate.price || {};
  const plan = candidate.buyPlan || {};
  if (plan.stance !== "今すぐ検討") return null;
  const edge = estimateBuyEdgeYen(price, candidate.unitSize || settings.unitSize) - settings.tradeFeeYen;
  if (edge < settings.notificationMinNetEdgeYen) return null;
  return {
    key: `${candidate.symbol}:BUY`,
    action: "購入候補",
    symbol: candidate.symbol,
    name: candidate.name,
    confidence,
    netEdgeYen: edge,
    reason: plan.summary || candidate.aiReview?.summary || `${candidate.name}は候補スコアが高い銘柄です。`,
    points: [...(candidate.reasons || []), ...(candidate.risks || []).map((item) => `注意: ${item}`)].slice(0, 5),
  };
}

function estimateBuyEdgeYen(price = {}, unitSize = 100) {
  const current = nullablePositiveNumber(price.current);
  if (!current) return 0;
  const trend = nullablePositiveNumber(price.trendPrice3y);
  const dividend = Number.isFinite(price.dividendPerShareTtm) ? price.dividendPerShareTtm * unitSize : 0;
  const capitalEdge = trend && trend > current ? (trend - current) * unitSize : 0;
  return Math.max(capitalEdge, dividend);
}

function estimateSellEdgeYen(position = {}, sellableQuantity = 0) {
  const quantity = nullablePositiveNumber(position.quantity);
  if (!quantity || !sellableQuantity) return 0;
  const total = Number.isFinite(position.totalReturnAmount) ? position.totalReturnAmount : position.pnlAmount;
  if (!Number.isFinite(total)) return 0;
  return Math.abs((total / quantity) * sellableQuantity);
}

async function sendSignalsOnce(signals, settings) {
  if (!signals.length) return;
  const log = await readNotificationLog();
  const today = jstDate(new Date().toISOString());
  const sent = new Set((log.items || []).map((item) => item.key));
  const nextItems = [...(log.items || [])];
  for (const signal of signals) {
    const key = `${today}:${signal.key}`;
    if (sent.has(key)) continue;
    await sendTeamsSignal(settings, signal);
    nextItems.push({ key, sentAt: new Date().toISOString(), signal });
    sent.add(key);
  }
  await saveNotificationLog({ items: nextItems.slice(-500) });
}

async function sendTeamsSignal(settings, signal) {
  const text = [
    `【Stock Signal】${signal.action}: ${signal.name} (${signal.symbol})`,
    `信頼度: ${Math.round(signal.confidence)}%`,
    `手数料後メリット目安: ${formatYen(signal.netEdgeYen)}`,
    signal.reason,
    ...signal.points.map((item) => `・${item}`),
  ].filter(Boolean).join("\n");
  const tasks = [];
  if (settings.teamsWebhookUrl) tasks.push(sendTeamsWebhook(settings.teamsWebhookUrl, signal, text));
  if (settings.graphAccessToken && settings.graphChatId) tasks.push(sendGraphChatMessage(settings, text));
  await Promise.all(tasks);
}

async function sendTeamsWebhook(url, signal, text) {
  const response = await fetchWithTimeout(url, {
    timeout: 15000,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(teamsAdaptiveCardPayload(signal, text)),
  });
  if (!response.ok) throw new Error(`Teams Webhook returned ${response.status}`);
}

function teamsAdaptiveCardPayload(signal, text) {
  return {
    type: "message",
    text,
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          {
            type: "TextBlock",
            text: "Stock Signal",
            weight: "Bolder",
            size: "Medium",
          },
          {
            type: "TextBlock",
            text: `${signal.action}: ${signal.name} (${signal.symbol})`,
            weight: "Bolder",
            wrap: true,
          },
          {
            type: "FactSet",
            facts: [
              { title: "信頼度", value: `${Math.round(signal.confidence)}%` },
              { title: "手数料後メリット", value: formatYen(signal.netEdgeYen) },
            ],
          },
          {
            type: "TextBlock",
            text: signal.reason || "",
            wrap: true,
          },
          {
            type: "TextBlock",
            text: (signal.points || []).map((item) => `• ${item}`).join("\n"),
            wrap: true,
            spacing: "Small",
          },
        ],
      },
    }],
  };
}

async function sendGraphChatMessage(settings, text) {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(settings.graphChatId)}/messages`, {
    timeout: 15000,
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.graphAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      body: {
        contentType: "html",
        content: escapeHtmlForGraph(text).replace(/\n/g, "<br>"),
      },
    }),
  });
  if (!response.ok) throw new Error(`Graph Teams message returned ${response.status}`);
}

function escapeHtmlForGraph(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readNotificationLog() {
  try {
    const cached = JSON.parse(await readFile(NOTIFICATION_LOG_PATH, "utf8"));
    return { items: Array.isArray(cached.items) ? cached.items : [] };
  } catch {
    return { items: [] };
  }
}

async function saveNotificationLog(log) {
  await mkdir(path.dirname(NOTIFICATION_LOG_PATH), { recursive: true });
  await writeFile(NOTIFICATION_LOG_PATH, JSON.stringify({ items: log.items || [] }, null, 2));
}

async function readSettings() {
  try {
    const stored = JSON.parse(await readFile(SETTINGS_PATH, "utf8"));
    return normalizeSettings({ ...defaultSettings, ...stored });
  } catch {
    return normalizeSettings(defaultSettings);
  }
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizeSettings(settings = {}) {
  const provider = String(settings.searchProvider || "searxng").toLowerCase() === "google" ? "google" : "searxng";
  return {
    searchProvider: provider,
    searxngUrl: normalizeUrl(settings.searxngUrl) || defaultSettings.searxngUrl,
    googleApiKey: String(settings.googleApiKey || "").trim(),
    googleCseId: String(settings.googleCseId || "").trim(),
    googleSearchUrl: normalizeUrl(settings.googleSearchUrl) || defaultSettings.googleSearchUrl,
    lmStudioUrl: normalizeUrl(settings.lmStudioUrl) || defaultSettings.lmStudioUrl,
    lmStudioTimeoutMs: clamp(Number(settings.lmStudioTimeoutMs || defaultSettings.lmStudioTimeoutMs), 5000, 300000),
    unitSize: clamp(Number(settings.unitSize || defaultSettings.unitSize), 1, 1000),
    unitBudget: clamp(Number(settings.unitBudget || defaultSettings.unitBudget), 10000, 10000000),
    dailyDiscoveryEnabled: settings.dailyDiscoveryEnabled !== false,
    dailyDiscoveryHour: clamp(Number(settings.dailyDiscoveryHour ?? defaultSettings.dailyDiscoveryHour), 0, 23),
    notificationsEnabled: settings.notificationsEnabled === true,
    notificationMinConfidence: clamp(Number(settings.notificationMinConfidence || defaultSettings.notificationMinConfidence), 50, 100),
    notificationMinNetEdgeYen: clamp(Number(settings.notificationMinNetEdgeYen || defaultSettings.notificationMinNetEdgeYen), 0, 1000000),
    tradeFeeYen: clamp(Number(settings.tradeFeeYen || 0), 0, 100000),
    teamsWebhookUrl: normalizeUrl(settings.teamsWebhookUrl) || "",
    graphAccessToken: String(settings.graphAccessToken || "").trim(),
    graphTenantId: String(settings.graphTenantId || "").trim(),
    graphClientId: String(settings.graphClientId || "").trim(),
    graphClientSecret: String(settings.graphClientSecret || "").trim(),
    graphChatId: String(settings.graphChatId || "").trim(),
  };
}

function applySettingsPatch(current, body = {}) {
  const next = { ...current };
  if (body.searchProvider) next.searchProvider = body.searchProvider;
  if (typeof body.searxngUrl === "string" && body.searxngUrl.trim()) next.searxngUrl = body.searxngUrl;
  if (typeof body.googleSearchUrl === "string" && body.googleSearchUrl.trim()) next.googleSearchUrl = body.googleSearchUrl;
  if (typeof body.googleCseId === "string" && body.googleCseId.trim()) next.googleCseId = body.googleCseId;
  if (typeof body.googleApiKey === "string" && body.googleApiKey.trim()) next.googleApiKey = body.googleApiKey;
  if (body.clearGoogleApiKey) next.googleApiKey = "";
  if (typeof body.lmStudioUrl === "string" && body.lmStudioUrl.trim()) next.lmStudioUrl = body.lmStudioUrl;
  if (body.lmStudioTimeoutMs) next.lmStudioTimeoutMs = body.lmStudioTimeoutMs;
  if (body.unitSize) next.unitSize = body.unitSize;
  if (body.unitBudget) next.unitBudget = body.unitBudget;
  if (typeof body.dailyDiscoveryEnabled === "boolean") next.dailyDiscoveryEnabled = body.dailyDiscoveryEnabled;
  if (body.dailyDiscoveryHour !== undefined) next.dailyDiscoveryHour = body.dailyDiscoveryHour;
  if (typeof body.notificationsEnabled === "boolean") next.notificationsEnabled = body.notificationsEnabled;
  if (body.notificationMinConfidence) next.notificationMinConfidence = body.notificationMinConfidence;
  if (body.notificationMinNetEdgeYen !== undefined) next.notificationMinNetEdgeYen = body.notificationMinNetEdgeYen;
  if (body.tradeFeeYen !== undefined) next.tradeFeeYen = body.tradeFeeYen;
  if (typeof body.teamsWebhookUrl === "string" && body.teamsWebhookUrl.trim()) next.teamsWebhookUrl = body.teamsWebhookUrl;
  if (typeof body.graphAccessToken === "string" && body.graphAccessToken.trim()) next.graphAccessToken = body.graphAccessToken;
  if (typeof body.graphTenantId === "string" && body.graphTenantId.trim()) next.graphTenantId = body.graphTenantId;
  if (typeof body.graphClientId === "string" && body.graphClientId.trim()) next.graphClientId = body.graphClientId;
  if (typeof body.graphClientSecret === "string" && body.graphClientSecret.trim()) next.graphClientSecret = body.graphClientSecret;
  if (typeof body.graphChatId === "string" && body.graphChatId.trim()) next.graphChatId = body.graphChatId;
  return normalizeSettings(next);
}

function publicSettings(settings) {
  return {
    searchProvider: settings.searchProvider,
    searxngUrl: settings.searxngUrl,
    googleCseId: settings.googleCseId,
    googleSearchUrl: settings.googleSearchUrl,
    hasGoogleApiKey: Boolean(settings.googleApiKey),
    lmStudioUrl: settings.lmStudioUrl,
    lmStudioTimeoutMs: settings.lmStudioTimeoutMs,
    unitSize: settings.unitSize,
    unitBudget: settings.unitBudget,
    dailyDiscoveryEnabled: settings.dailyDiscoveryEnabled,
    dailyDiscoveryHour: settings.dailyDiscoveryHour,
    notificationsEnabled: settings.notificationsEnabled,
    notificationMinConfidence: settings.notificationMinConfidence,
    notificationMinNetEdgeYen: settings.notificationMinNetEdgeYen,
    tradeFeeYen: settings.tradeFeeYen,
    hasTeamsWebhookUrl: Boolean(settings.teamsWebhookUrl),
    graphChatId: settings.graphChatId,
    graphTenantId: settings.graphTenantId,
    graphClientId: settings.graphClientId,
    hasGraphAccessToken: Boolean(settings.graphAccessToken),
    hasGraphClientSecret: Boolean(settings.graphClientSecret),
  };
}

async function searchSourceSummary(searchCount, candidateLimit, budget = {}) {
  const settings = await readSettings();
  const provider = settings.searchProvider === "searxng" ? "SearXNG" : "Google";
  const unitSize = budget.unitSize || settings.unitSize;
  const unitBudget = budget.unitBudget || settings.unitBudget;
  return {
    provider,
    searchConfigured: settings.searchProvider === "searxng"
      ? Boolean(settings.searxngUrl)
      : Boolean(settings.googleApiKey && settings.googleCseId),
    searchCount,
    candidateLimit,
    discoveredCount: budget.discoveredCount || 0,
    candidatePool: budget.candidatePool || candidateLimit,
    usedDiscoveryAi: Boolean(budget.usedDiscoveryAi),
    fullScan: Boolean(budget.fullScan),
    searchPositionUsed: Boolean(budget.searchPositionUsed),
    marketBrief: budget.marketBrief || null,
    unitSize,
    unitBudget,
    priceSource: "Yahoo Finance 5年日足",
    universe: budget.fullScan ? "東証プライム全銘柄" : "事業好調・割安候補リスト",
  };
}

async function readWatchlist() {
  if (!existsSync(WATCHLIST_PATH)) {
    await saveWatchlist(defaultWatchlist);
    return defaultWatchlist.map(normalizeStock);
  }

  try {
    const stocks = JSON.parse(await readFile(WATCHLIST_PATH, "utf8"));
    if (Array.isArray(stocks) && stocks.length) return stocks.slice(0, MAX_MANAGED_STOCKS).map(normalizeStock);
  } catch {
    // Recreate the local list when the file is unreadable or partially written.
  }

  await saveWatchlist(defaultWatchlist);
  return defaultWatchlist.map(normalizeStock);
}

async function saveWatchlist(stocks) {
  await mkdir(path.dirname(WATCHLIST_PATH), { recursive: true });
  await writeFile(WATCHLIST_PATH, JSON.stringify(stocks.slice(0, MAX_MANAGED_STOCKS).map(normalizeStock), null, 2));
}

async function serveFile(res, filePath) {
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "Forbidden" });
  if (!existsSync(normalized)) return json(res, 404, { error: "Not found" });
  const extension = path.extname(normalized) || ".html";
  const content = await readFile(normalized);
  res.writeHead(200, { "content-type": mime[extension] || "application/octet-stream" });
  res.end(content);
}

function sanitizePath(input) {
  const decoded = decodeURIComponent(input.split("?")[0]);
  const cleaned = decoded.replace(/^\/+/, "").replace(/\.\./g, "");
  return cleaned || "index.html";
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function empty(res, statusCode) {
  res.writeHead(statusCode, { "cache-control": "public, max-age=86400" });
  res.end();
}

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    const rawValue = trimmed.slice(equals + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  return cleanText(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      if (["http:", "https:"].includes(url.protocol)) links.push(url.href);
    } catch {
      // Ignore invalid links from source pages.
    }
  }
  return [...new Set(links)];
}

function cleanText(value = "") {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function businessContextText(value = "") {
  return cleanText(value)
    .replace(/従来[^。]{0,50}減益予想から一転して増益/g, "増益")
    .replace(/減益予想から一転して増益/g, "増益")
    .replace(/減益率[^。]{0,40}縮小/g, "改善")
    .replace(/赤字から黒字/g, "黒字転換")
    .replace(/赤字予想から黒字/g, "黒字転換")
    .toLowerCase();
}

function parseJsonObject(value) {
  const trimmed = String(value || "").trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const jsonText = extractFirstJsonObject(trimmed);
  if (jsonText) candidates.push(jsonText);

  let lastError = null;
  for (const candidate of candidates) {
    for (const body of [candidate, repairJson(candidate)]) {
      try {
        return JSON.parse(body);
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("No JSON object in model response");
}

function repairJson(value = "") {
  return String(value)
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractFirstJsonObject(value) {
  const start = value.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, i + 1);
    }
  }

  return "";
}

function normalizeSymbol(value = "") {
  const symbol = String(value).trim().toUpperCase();
  if (!/^[0-9A-Z.-]{3,12}$/.test(symbol)) return "";
  return symbol.includes(".") ? symbol : `${symbol}.T`;
}

function normalizeUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text.includes("://") ? text : `http://${text}`);
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizePositions(stock) {
  const raw = Array.isArray(stock.positions) && stock.positions.length
    ? stock.positions
    : [{
      purchaseDate: stock.purchaseDate,
      purchasePrice: stock.purchasePrice,
      quantity: stock.quantity,
    }];
  return raw
    .map((lot) => ({
      purchaseDate: normalizeDate(lot.purchaseDate),
      purchasePrice: nullablePositiveNumber(lot.purchasePrice),
      quantity: nullablePositiveNumber(lot.quantity),
    }))
    .filter((lot) => lot.purchasePrice && lot.quantity)
    .slice(0, 50);
}

function normalizeDate(value = "") {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : text;
}

function nullablePositiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nullableNonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function emptyPrice(series = [], meta = {}) {
  return {
    current: null,
    return1m: null,
    return3m: null,
    return6m: null,
    return1y: null,
    return3y: null,
    annualizedReturn3y: null,
    high52: null,
    low52: null,
    high3y: null,
    low3y: null,
    distanceFromHigh52: null,
    distanceFromLow52: null,
    distanceFromHigh3y: null,
    distanceFromLow3y: null,
    maxDrawdown3y: null,
    trendSlope3y: null,
    trendPrice3y: null,
    distanceFromTrend3y: null,
    trend3y: "UNKNOWN",
    sma50: null,
    sma200: null,
    volatility: null,
    dividendPerShareTtm: null,
    dividendYield: null,
    dividendPreviousPerShareTtm: null,
    dividendChangePct: null,
    dividendLastDate: "",
    dividendLastAmount: null,
    dividendEvents: [],
    shortName: cleanText(meta.shortName || ""),
    longName: cleanText(meta.longName || ""),
    yahooSymbol: cleanText(meta.symbol || ""),
    series,
  };
}

function returnFrom(series, days) {
  if (series.length <= days) return null;
  const current = last(series).close;
  const previous = series[series.length - 1 - days].close;
  return previous ? ((current - previous) / previous) * 100 : null;
}

function annualizedVolatility(values) {
  if (values.length < 3) return null;
  const returns = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1]) returns.push(Math.log(values[i] / values[i - 1]));
  }
  const avg = average(returns);
  const variance = average(returns.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function annualizedReturn(series) {
  if (series.length < 2) return null;
  const first = series[0].close;
  const current = last(series).close;
  if (!first || !current) return null;
  const years = Math.max(1 / 252, (series.length - 1) / 252);
  return ((current / first) ** (1 / years) - 1) * 100;
}

function annualizedTrendSlope(series) {
  if (series.length < 40) return null;
  const points = series
    .map((point, index) => ({ x: index, y: Math.log(point.close) }))
    .filter((point) => Number.isFinite(point.y));
  if (points.length < 40) return null;
  const meanX = average(points.map((point) => point.x));
  const meanY = average(points.map((point) => point.y));
  const numerator = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0);
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  if (!denominator) return null;
  const dailySlope = numerator / denominator;
  return (Math.exp(dailySlope * 252) - 1) * 100;
}

function trendRegression(series) {
  if (series.length < 40) return { slope: null, currentPrice: null };
  const points = series
    .map((point, index) => ({ x: index, y: Math.log(point.close) }))
    .filter((point) => Number.isFinite(point.y));
  if (points.length < 40) return { slope: null, currentPrice: null };
  const meanX = average(points.map((point) => point.x));
  const meanY = average(points.map((point) => point.y));
  const numerator = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0);
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  if (!denominator) return { slope: null, currentPrice: null };
  const dailySlope = numerator / denominator;
  const intercept = meanY - (dailySlope * meanX);
  const lastIndex = series.length - 1;
  return {
    slope: (Math.exp(dailySlope * 252) - 1) * 100,
    currentPrice: Math.exp(intercept + (dailySlope * lastIndex)),
  };
}

function maxDrawdown(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return null;
  let peak = valid[0];
  let worst = 0;
  for (const value of valid) {
    if (value > peak) peak = value;
    const drawdown = peak ? ((value - peak) / peak) * 100 : 0;
    if (drawdown < worst) worst = drawdown;
  }
  return worst;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function last(values) {
  return values[values.length - 1];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function mapLimit(values, limit, fn) {
  const results = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await fn(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function formatYen(value) {
  if (!Number.isFinite(value)) return "-";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
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

function trendGapText(value) {
  if (!Number.isFinite(value)) return "まだ比べられません";
  if (value < 0) return `${Math.abs(value).toFixed(1)}%安いです`;
  if (value > 0) return `${value.toFixed(1)}%高いです`;
  return "ほぼ同じです";
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueText(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return uniqueText(value).map((item) => item.slice(0, 180));
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function googleSearchWarning() {
  return "検索エンジンの結果が取得できませんでした";
}
