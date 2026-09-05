import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadLocalEnv(path.join(__dirname, ".env"));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const WATCHLIST_PATH = path.join(__dirname, "data", "watchlist.json");
const US_WATCHLIST_PATH = path.join(__dirname, "data", "us-watchlist.json");
const CRYPTO_HOLDING_PATH = path.join(__dirname, "data", "crypto-holding.json");
const ANALYSIS_CACHE_PATH = path.join(__dirname, "data", "analysis-cache.json");
const US_ANALYSIS_CACHE_PATH = path.join(__dirname, "data", "us-analysis-cache.json");
const CRYPTO_ANALYSIS_CACHE_PATH = path.join(__dirname, "data", "crypto-analysis-cache.json");
const DISCOVERY_CACHE_PATH = path.join(__dirname, "data", "discovery-cache.json");
const CANDIDATE_HISTORY_PATH = path.join(__dirname, "data", "candidate-history.json");
const EXIT_STATE_PATH = path.join(__dirname, "data", "exit-state.json");
const SHAREHOLDER_CACHE_PATH = path.join(__dirname, "data", "shareholder-cache.json");
const FINANCIAL_CACHE_PATH = path.join(__dirname, "data", "financial-cache.json");
const PRIME_UNIVERSE_PATH = path.join(__dirname, "data", "prime-universe.json");
const NOTIFICATION_LOG_PATH = path.join(__dirname, "data", "notification-log.json");
const EXCLUDED_CANDIDATES_PATH = path.join(__dirname, "data", "excluded-candidates.json");
const TDNET_DISCLOSURE_CACHE_PATH = path.join(__dirname, "data", "tdnet-disclosure-cache.json");
const SETTINGS_PATH = path.join(__dirname, "data", "settings.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_MANAGED_STOCKS = 50;
const MAX_US_STOCKS = 40;
const MAX_DISCOVERY_SUGGESTIONS = 100;
const MAX_WEBSITE_LIMIT = 100;
const MAX_DEPTH_LIMIT = 50;
const MAX_PAGES_PER_SITE = 100;
const AI_DISCOVERY_REVIEW_LIMIT = 24;
const DISCOVERY_SCORING_VERSION = 10;
const DISCOVERY_FINANCIAL_REVIEW_LIMIT = 48;
const US_DISCOVERY_UNIT_SIZE = 1;
const US_DISCOVERY_UNIT_BUDGET = 2000;
const STRICT_BUY_TARGET_TOLERANCE = 1;
const FUNDAMENTAL_EXIT_MAX_AGE_DAYS = 30;
const TRAILING_STOP_LOSS_PCT = 20;
const US_EVIDENCE_TRANSLATION_CHUNK_SIZE = 3;
const PRICE_HISTORY_TIMEOUT_MS = 12000;
const QUICK_PRICE_HISTORY_TIMEOUT_MS = 4000;
const US_NEWS_MAX_AGE_DAYS = 45;
const US_EVIDENCE_TRANSLATION_TIMEOUT_MS = 180000;
const US_HOLDING_REVIEW_TIMEOUT_MS = 180000;
const US_HOLDING_REVIEW_CHUNK_SIZE = 2;
const EDINET_API_BASE = "https://api.edinet-fsa.go.jp/api/v2";
const EDINET_LOOKBACK_DAYS = 120;
const JP_PE_MARKET_CAP_MIN = 5_000_000_000;
const JP_PE_MARKET_CAP_CORE_MAX = 50_000_000_000;
const JP_PE_MARKET_CAP_MAX = 300_000_000_000;
const JP_PE_MARKET_CAP_LARGE_WATCH_MAX = 1_000_000_000_000;
const US_FINANCE_NEWS_SOURCES = [
  ["finance.yahoo.com", 100],
  ["seekingalpha.com", 96],
  ["marketwatch.com", 94],
  ["barrons.com", 94],
  ["cnbc.com", 92],
  ["reuters.com", 92],
  ["nasdaq.com", 90],
  ["zacks.com", 88],
  ["benzinga.com", 86],
  ["investing.com", 84],
  ["fool.com", 82],
  ["investors.com", 82],
  ["morningstar.com", 80],
  ["tipranks.com", 78],
  ["stocktitan.net", 76],
  ["investopedia.com", 76],
  ["barchart.com", 74],
  ["quiverquant.com", 74],
  ["tikr.com", 72],
  ["chartmill.com", 72],
  ["tradingview.com", 72],
  ["businesswire.com", 74],
  ["prnewswire.com", 74],
  ["stockanalysis.com", 74],
  ["thestreet.com", 72],
  ["apnews.com", 72],
  ["businessinsider.com", 72],
  ["markets.businessinsider.com", 72],
  ["gurufocus.com", 70],
  ["marketbeat.com", 70],
  ["wallstreetzen.com", 70],
  ["msn.com", 70],
];
const US_SHAREHOLDER_SOURCES = [
  ["nasdaq.com", 100],
  ["finance.yahoo.com", 96],
  ["sec.gov", 94],
  ["fintel.io", 92],
  ["marketbeat.com", 90],
  ["gurufocus.com", 88],
  ["stockanalysis.com", 86],
  ["wallstreetzen.com", 82],
  ["morningstar.com", 80],
  ["tipranks.com", 76],
];
const JP_SHAREHOLDER_SOURCES = [
  ["nikkei.com", 100],
  ["irbank.net", 96],
  ["kabutan.jp", 94],
  ["minkabu.jp", 90],
  ["finance.yahoo.co.jp", 86],
  ["jpx.co.jp", 84],
  ["buffett-code.com", 80],
];
const US_NEWS_BLOCKED_HOSTS = [
  "wikipedia.org",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "glassdoor.com",
  "indeed.com",
  "ziprecruiter.com",
  "simplyhired.com",
];
const US_NEWS_KEYWORDS = [
  "stock", "stocks", "shares", "earnings", "revenue", "profit", "guidance", "forecast", "analyst",
  "rating", "upgrade", "downgrade", "price target", "dividend", "buyback", "acquisition", "deal",
  "lawsuit", "recall", "sec", "quarter", "results", "outlook", "margin",
];
const SHAREHOLDER_KEYWORDS = [
  "institutional", "ownership", "holder", "holders", "shareholder", "shareholders", "major holders",
  "13f", "13d", "13g", "stake", "fund holdings", "mutual fund", "機関投資家", "大株主", "株主構成",
  "株主", "保有割合", "持株比率", "外国法人", "金融機関",
];
const PE_PRIORITY_MIN_SCORE = 45;
const PE_STRONG_MIN_SCORE = 55;
const DISCOVERY_AVOID_SECTOR_PATTERN = /(卸売|商社|食品|食料品|wholesale|food|grocery|consumer staples|packaged foods)/i;
const DISCOVERY_IT_VENTURE_PATTERN = /(情報|IT|ＳＩ|SI|ソフトウェア|クラウド|SaaS|アプリ|ネット|メディア|広告|ゲーム|DX|AI)/i;
const DISCOVERY_IT_STABLE_PATTERN = /(通信|インフラ|データセンター|セキュリティ|半導体|NTT|KDDI|ソフトバンク|SoftBank|SIer|公共|基幹|mature|enterprise|consulting|infrastructure|security|cybersecurity|semiconductor|data center|platform|payments|mission critical|recurring revenue|automation|medical device)/i;
const PE_BUYER_WORDS = ["PEファンド", "プライベートエクイティ", "投資ファンド", "TOB", "MBO", "買収", "非公開化", "大量保有", "株主", "物言う株主", "アクティビスト", "private equity", "buyout", "take private", "tender offer", "activist", "shareholder", "stake", "Bain", "KKR", "Carlyle", "Blackstone", "Apollo", "CVC", "MBK", "ベイン", "カーライル", "ブラックストーン", "アドバンテッジパートナーズ", "ポラリス", "エフィッシモ", "旧村上", "Oasis", "3D Investment"];
const PE_DIRECT_BUYER_WORDS = ["PEファンド", "プライベートエクイティ", "投資ファンド", "TOB", "MBO", "買収", "非公開化", "private equity", "buyout", "take private", "tender offer", "Bain", "KKR", "Carlyle", "Blackstone", "Apollo", "CVC", "MBK", "ベイン", "カーライル", "ブラックストーン", "アドバンテッジパートナーズ", "ポラリス"];
const PE_RECENT_TENDENCIES = [
  "直近数年の国内PE・MBO案件は、低PBR、ネットキャッシュ、安定CF、株主還元余地、上場維持コストが重い会社を重視して採点",
  "時価総額は50億-500億円を強い条件、500億-3000億円を大型PEでも検討し得る範囲、3000億-1兆円をJSR級の大型・特殊案件として扱う",
  "単なる大型優良株や高値圏のテーマ株は、直接の買収・MBO・株主変化がなければPE候補から外す",
  "決算後に業績は悪くないのに還元不足で売られた銘柄を、アクティビスト/PEの入口候補として加点",
];
const PE_FINANCIAL_CRITERIA = [
  { key: "market_cap", label: "時価総額50億-3000億円中心", max: 25 },
  { key: "net_cash", label: "ネットキャッシュ比率50%以上", max: 25 },
  { key: "ev_ebitda", label: "EV/EBITDA 6倍以下または低PER", max: 20 },
  { key: "pbr", label: "PBR1倍割れ", max: 15 },
  { key: "operating_cf", label: "営業CFが継続プラス", max: 15 },
];
const US_TICKER_STOPWORDS = new Set(["A", "AI", "API", "CEO", "CFO", "COO", "EPS", "ETF", "GDP", "IPO", "LLM", "MBO", "MOC", "NYSE", "PE", "PBR", "PER", "Q1", "Q2", "Q3", "Q4", "SEC", "TOB", "USA", "USD"]);
const TDNET_SOURCE_BASE = "https://www.release.tdnet.info/inbs/";
const DISCLOSURE_CRITICAL_WORDS = [
  "下方修正", "業績予想の修正", "業績予想修正", "通期業績予想", "連結業績予想", "減配", "無配",
  "配当予想の修正", "配当予想修正", "配当方針の変更", "赤字", "損失", "特別損失", "減損",
  "債務超過", "継続企業の前提", "上場廃止", "整理銘柄", "監理銘柄", "不適切会計", "不正",
  "行政処分", "訴訟", "調査委員会", "第三者委員会", "リコール", "事業撤退", "事業休止",
];
const DISCLOSURE_GROWTH_REVIEW_WORDS = [
  "決算短信", "四半期決算短信", "決算説明資料", "補足説明資料", "業績説明資料", "Financial Results",
  "Earnings", "ガイダンス", "業績予想",
];
const DISCLOSURE_IGNORE_WORDS = [
  "役員人事", "人事異動", "自己株式の取得", "ToSTNeT", "ストック・オプション", "譲渡制限付株式",
  "月次", "定款", "株主総会", "基準日", "独立役員届出書", "コーポレート・ガバナンス", "招集",
  "議決権", "ETF", "投資法人", "REIT",
];
const PE_CRITERIA = [
  { key: "undervalued", label: "割安に見える材料", words: ["低PBR", "PBR1倍割れ", "低PER", "割安", "資産価値", "純資産", "undervalued", "low multiple", "cheap valuation", "sum-of-the-parts"], weight: 18 },
  { key: "cashflow", label: "安定キャッシュフロー", words: ["安定収益", "キャッシュフロー", "高配当", "営業CF", "ストック収益", "継続課金", "cash flow", "free cash flow", "recurring revenue", "stable revenue", "dividend"], weight: 14 },
  { key: "debt_capacity", label: "低負債・借入余地", words: ["無借金", "ネットキャッシュ", "財務健全", "自己資本比率", "低負債", "debt capacity", "low debt", "net cash", "strong balance sheet"], weight: 14 },
  { key: "governance", label: "株主還元・経営改善の余地", words: ["自社株買い", "増配", "政策保有株", "ROE", "資本効率", "中期経営計画", "buyback", "capital allocation", "margin improvement", "ROIC", "shareholder return"], weight: 13 },
  { key: "shareholder", label: "株主変化", words: ["大量保有", "保有割合", "株主", "物言う株主", "アクティビスト", "エフィッシモ", "Oasis", "旧村上", "activist", "shareholder", "stake", "13D", "13G"], weight: 18 },
  { key: "restructuring", label: "再編余地", words: ["TOB", "MBO", "非公開化", "事業売却", "構造改革", "再編", "親子上場", "buyout", "take private", "spin off", "divestiture", "strategic review", "tender offer"], weight: 18 },
  { key: "sector_fit", label: "PEが扱いやすい業態", words: ["サービス", "ヘルスケア", "ソフトウェア", "不動産", "物流", "人材", "設備保守", "services", "healthcare", "industrial", "maintenance", "logistics", "consumer staples"], weight: 9 },
  { key: "risk", label: "買収されにくい要因", words: ["規制", "国策", "赤字", "訴訟", "不祥事", "過大債務", "景気敏感", "regulatory", "litigation", "loss", "high debt", "cyclical"], weight: -12 },
];
const defaultSettings = {
  searchProvider: process.env.SEARCH_PROVIDER || "searxng",
  searxngUrl: process.env.SEARXNG_URL || "http://127.0.0.1:8081/search",
  searxngEngines: process.env.SEARXNG_ENGINES || "bing",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  googleCseId: process.env.GOOGLE_CSE_ID || "",
  googleSearchUrl: process.env.GOOGLE_SEARCH_URL || "https://www.googleapis.com/customsearch/v1",
  lmStudioUrl: process.env.LM_STUDIO_URL || "http://127.0.0.1:1234/v1",
  lmStudioTimeoutMs: clamp(Number(process.env.LM_STUDIO_TIMEOUT_MS || 180000), 5000, 300000),
  unitSize: 100,
  unitBudget: Number(process.env.UNIT_BUDGET || 300000),
  websiteLimit: 10,
  depthLimit: 2,
  pagesPerSite: 2,
  dailyDiscoveryEnabled: true,
  dailyDiscoveryHour: 7,
  hourlyRefreshEnabled: true,
  marketHoursOnlyRefresh: true,
  tdnetDisclosureEnabled: true,
  tdnetDisclosureLookbackDays: 3,
  tdnetDisclosureUseLmStudio: true,
  growthExitEnabled: true,
  trailingStopPct: 25,
  onkabuProfitPct: 100,
  shareholderMonitorEnabled: true,
  shareholderChangeThresholdPct: 2,
  shareholderUseLmStudio: true,
  edinetApiKey: process.env.EDINET_API_KEY || "",
  rakutenAccountMemo: "",
  revolutAccountMemo: "",
  notificationsEnabled: false,
  notificationMinConfidence: 78,
  notificationMinNetEdgeYen: 5000,
  tradeFeeYen: 0,
  defaultJpAccountType: "taxable",
  jpTaxableTradeFeeYen: 0,
  jpNisaTradeFeeYen: 0,
  nisaAnnualLimitYen: 3600000,
  jpCapitalGainTaxPct: 20.315,
  usTradeFeeUsd: 0,
  usCapitalGainTaxPct: 0,
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

const businessGoodWords = ["増収増益", "上方修正", "最高益", "過去最高益", "最高益更新", "営業益増", "営業利益増", "経常増益", "増益", "増収", "黒字転換", "増配", "配当増額", "自社株買い", "受注増", "受注高", "revenue growth", "earnings beat", "raised guidance", "record profit", "margin expansion", "free cash flow", "buyback", "dividend increase"];
const valueGoodWords = ["割安", "低per", "低pbr", "pbr1倍割れ", "pbr", "per", "配当利回り", "高配当", "出遅れ", "undervalued", "low multiple", "cheap valuation", "dividend yield", "discount"];
const businessBadWords = ["下方修正", "減益", "赤字", "減配", "不祥事", "行政処分", "訴訟", "guidance cut", "earnings miss", "loss", "dividend cut", "lawsuit", "investigation"];

let lmModelCache = { configuredUrl: "", url: "", model: "" };
let primeUniverseCache = null;
let secCompanyTickerCache = null;
let analysisJob = null;
let usAnalysisJob = null;
let discoveryJob = null;
let hourlyRefreshTimer = null;

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

const defaultUsWatchlist = [
  { symbol: "ACN", name: "Accenture", market: "NYSE", holding: false, notes: "IT consulting, outsourcing, digital transformation" },
  { symbol: "NVDA", name: "NVIDIA", market: "NASDAQ", holding: false, notes: "AI semiconductors, GPU, data center" },
  { symbol: "INTC", name: "Intel", market: "NASDAQ", holding: false, notes: "CPU, foundry, semiconductor turnaround" },
];

const defaultCryptoHolding = {
  symbol: "BTC",
  name: "Bitcoin",
  market: "Crypto",
  holding: false,
  positions: [],
  sales: [],
};

const usDiscoveryUniverse = [
  { symbol: "IBM", name: "IBM", market: "NYSE", sector: "Technology services", notes: "mature enterprise software, consulting, recurring revenue", currency: "USD" },
  { symbol: "ORCL", name: "Oracle", market: "NYSE", sector: "Enterprise software", notes: "mature software, cloud infrastructure, cash flow", currency: "USD" },
  { symbol: "CSCO", name: "Cisco Systems", market: "NASDAQ", sector: "Network equipment", notes: "network infrastructure, security, buybacks", currency: "USD" },
  { symbol: "HPQ", name: "HP", market: "NYSE", sector: "Hardware", notes: "cash flow, buybacks, mature technology", currency: "USD" },
  { symbol: "DELL", name: "Dell Technologies", market: "NYSE", sector: "Hardware", notes: "enterprise infrastructure, AI servers, cash flow", currency: "USD" },
  { symbol: "HPE", name: "Hewlett Packard Enterprise", market: "NYSE", sector: "Infrastructure", notes: "enterprise infrastructure, hybrid cloud, restructuring", currency: "USD" },
  { symbol: "PARA", name: "Paramount Global", market: "NASDAQ", sector: "Media", notes: "media assets, strategic review, M&A", currency: "USD" },
  { symbol: "WBD", name: "Warner Bros. Discovery", market: "NASDAQ", sector: "Media", notes: "media restructuring, cash flow, debt reduction", currency: "USD" },
  { symbol: "DIS", name: "Walt Disney", market: "NYSE", sector: "Media", notes: "brand assets, streaming turnaround, activist history", currency: "USD" },
  { symbol: "PYPL", name: "PayPal", market: "NASDAQ", sector: "Financial technology", notes: "payments, buybacks, margin improvement", currency: "USD" },
  { symbol: "GPN", name: "Global Payments", market: "NYSE", sector: "Payment services", notes: "payment processing, cash flow, strategic review potential", currency: "USD" },
  { symbol: "FIS", name: "Fidelity National Information Services", market: "NYSE", sector: "Payment services", notes: "financial services infrastructure, divestiture, cash flow", currency: "USD" },
  { symbol: "FI", name: "Fiserv", market: "NYSE", sector: "Payment services", notes: "merchant acquiring, recurring revenue, buybacks", currency: "USD" },
  { symbol: "UPS", name: "UPS", market: "NYSE", sector: "Logistics", notes: "logistics, union cost reset, cash flow", currency: "USD" },
  { symbol: "FDX", name: "FedEx", market: "NYSE", sector: "Logistics", notes: "logistics, restructuring, margin improvement", currency: "USD" },
  { symbol: "KHC", name: "Kraft Heinz", market: "NASDAQ", sector: "Consumer staples", notes: "stable brands, dividend, private equity history", currency: "USD" },
  { symbol: "MDLZ", name: "Mondelez", market: "NASDAQ", sector: "Consumer staples", notes: "global snacks, stable cash flow", currency: "USD" },
  { symbol: "GIS", name: "General Mills", market: "NYSE", sector: "Consumer staples", notes: "packaged foods, dividend, stable demand", currency: "USD" },
  { symbol: "K", name: "Kellanova", market: "NYSE", sector: "Consumer staples", notes: "packaged foods, brand portfolio, restructuring", currency: "USD" },
  { symbol: "CLX", name: "Clorox", market: "NYSE", sector: "Consumer staples", notes: "household brands, margin recovery", currency: "USD" },
  { symbol: "SYY", name: "Sysco", market: "NYSE", sector: "Food services", notes: "food distribution, stable cash flow", currency: "USD" },
  { symbol: "KR", name: "Kroger", market: "NYSE", sector: "Retail", notes: "grocery retail, stable demand, cash flow", currency: "USD" },
  { symbol: "TGT", name: "Target", market: "NYSE", sector: "Retail", notes: "retail turnaround, brand assets, cash flow", currency: "USD" },
  { symbol: "LOW", name: "Lowe's", market: "NYSE", sector: "Retail", notes: "home improvement, buybacks, cash flow", currency: "USD" },
  { symbol: "HD", name: "Home Depot", market: "NYSE", sector: "Retail", notes: "home improvement, cash flow, dividend", currency: "USD" },
  { symbol: "CVS", name: "CVS Health", market: "NYSE", sector: "Healthcare services", notes: "healthcare services, restructuring, cash flow", currency: "USD" },
  { symbol: "CI", name: "Cigna", market: "NYSE", sector: "Healthcare services", notes: "managed care, buybacks, cash flow", currency: "USD" },
  { symbol: "HUM", name: "Humana", market: "NYSE", sector: "Healthcare services", notes: "managed care, Medicare, valuation reset", currency: "USD" },
  { symbol: "BMY", name: "Bristol Myers Squibb", market: "NYSE", sector: "Pharmaceuticals", notes: "pharma, patent cycle, dividend", currency: "USD" },
  { symbol: "PFE", name: "Pfizer", market: "NYSE", sector: "Pharmaceuticals", notes: "pharma, dividend, pipeline reset", currency: "USD" },
  { symbol: "MMM", name: "3M", market: "NYSE", sector: "Industrial", notes: "industrial restructuring, litigation overhang, cash flow", currency: "USD" },
  { symbol: "HON", name: "Honeywell", market: "NASDAQ", sector: "Industrial", notes: "industrial automation, aerospace, portfolio changes", currency: "USD" },
  { symbol: "GE", name: "GE Aerospace", market: "NYSE", sector: "Aerospace", notes: "aerospace, margin expansion, cash flow", currency: "USD" },
  { symbol: "EMR", name: "Emerson Electric", market: "NYSE", sector: "Industrial automation", notes: "automation, portfolio reshaping, cash flow", currency: "USD" },
  { symbol: "ETN", name: "Eaton", market: "NYSE", sector: "Electrical equipment", notes: "electrification, data center power, cash flow", currency: "USD" },
  { symbol: "APD", name: "Air Products", market: "NYSE", sector: "Industrial gases", notes: "industrial gases, activist interest, capital allocation", currency: "USD" },
  { symbol: "DOW", name: "Dow", market: "NYSE", sector: "Chemicals", notes: "chemicals, dividend, cyclical recovery", currency: "USD" },
  { symbol: "LYB", name: "LyondellBasell", market: "NYSE", sector: "Chemicals", notes: "chemicals, cash return, cyclical", currency: "USD" },
  { symbol: "VZ", name: "Verizon", market: "NYSE", sector: "Telecom", notes: "telecom, dividend, stable cash flow", currency: "USD" },
  { symbol: "T", name: "AT&T", market: "NYSE", sector: "Telecom", notes: "telecom, deleveraging, dividend", currency: "USD" },
  { symbol: "CMCSA", name: "Comcast", market: "NASDAQ", sector: "Telecom media", notes: "cable, media assets, buybacks", currency: "USD" },
  { symbol: "GM", name: "General Motors", market: "NYSE", sector: "Automotive", notes: "automotive, buybacks, valuation discount", currency: "USD" },
  { symbol: "F", name: "Ford Motor", market: "NYSE", sector: "Automotive", notes: "automotive, dividend, restructuring", currency: "USD" },
  { symbol: "UAL", name: "United Airlines", market: "NASDAQ", sector: "Airlines", notes: "airline, travel demand, cyclical", currency: "USD" },
  { symbol: "DAL", name: "Delta Air Lines", market: "NYSE", sector: "Airlines", notes: "airline, travel demand, loyalty cash flow", currency: "USD" },
  { symbol: "AAL", name: "American Airlines", market: "NASDAQ", sector: "Airlines", notes: "airline, high debt, cyclical", currency: "USD" },
  { symbol: "BKNG", name: "Booking Holdings", market: "NASDAQ", sector: "Travel services", notes: "travel platform, cash flow, buybacks", currency: "USD" },
  { symbol: "MAR", name: "Marriott International", market: "NASDAQ", sector: "Travel services", notes: "asset-light hotels, recurring fee revenue", currency: "USD" },
  { symbol: "H", name: "Hyatt Hotels", market: "NYSE", sector: "Travel services", notes: "hotels, asset-light transition, cash flow", currency: "USD" },
  { symbol: "LUV", name: "Southwest Airlines", market: "NYSE", sector: "Airlines", notes: "airline turnaround, activist interest", currency: "USD" },
  { symbol: "AMD", name: "Advanced Micro Devices", market: "NASDAQ", sector: "Semiconductors", notes: "AI accelerators, data center, semiconductor platform", currency: "USD" },
  { symbol: "AVGO", name: "Broadcom", market: "NASDAQ", sector: "Semiconductors", notes: "AI networking, custom silicon, enterprise software cash flow", currency: "USD" },
  { symbol: "QCOM", name: "Qualcomm", market: "NASDAQ", sector: "Semiconductors", notes: "mobile chips, automotive chips, edge AI, buybacks", currency: "USD" },
  { symbol: "TXN", name: "Texas Instruments", market: "NASDAQ", sector: "Semiconductors", notes: "analog chips, industrial demand, cash flow", currency: "USD" },
  { symbol: "MU", name: "Micron Technology", market: "NASDAQ", sector: "Semiconductors", notes: "memory cycle, HBM, data center AI demand", currency: "USD" },
  { symbol: "AMAT", name: "Applied Materials", market: "NASDAQ", sector: "Semiconductor equipment", notes: "wafer equipment, AI chip capacity, cash flow", currency: "USD" },
  { symbol: "LRCX", name: "Lam Research", market: "NASDAQ", sector: "Semiconductor equipment", notes: "wafer fabrication equipment, memory recovery, buybacks", currency: "USD" },
  { symbol: "KLAC", name: "KLA", market: "NASDAQ", sector: "Semiconductor equipment", notes: "process control, semiconductor equipment, cash flow", currency: "USD" },
  { symbol: "ASML", name: "ASML", market: "NASDAQ", sector: "Semiconductor equipment", notes: "lithography, semiconductor infrastructure, backlog", currency: "USD" },
  { symbol: "TSM", name: "Taiwan Semiconductor", market: "NYSE", sector: "Semiconductors", notes: "advanced foundry, AI data center chips, cash flow", currency: "USD" },
  { symbol: "ARM", name: "Arm Holdings", market: "NASDAQ", sector: "Semiconductors", notes: "processor IP, AI edge devices, licensing revenue", currency: "USD" },
  { symbol: "ON", name: "ON Semiconductor", market: "NASDAQ", sector: "Semiconductors", notes: "automotive power chips, industrial demand, margin recovery", currency: "USD" },
  { symbol: "NXPI", name: "NXP Semiconductors", market: "NASDAQ", sector: "Semiconductors", notes: "automotive chips, industrial semiconductors, cash flow", currency: "USD" },
  { symbol: "MCHP", name: "Microchip Technology", market: "NASDAQ", sector: "Semiconductors", notes: "microcontrollers, industrial chips, dividend", currency: "USD" },
  { symbol: "ADI", name: "Analog Devices", market: "NASDAQ", sector: "Semiconductors", notes: "analog chips, industrial automation, cash flow", currency: "USD" },
  { symbol: "MRVL", name: "Marvell Technology", market: "NASDAQ", sector: "Semiconductors", notes: "AI networking, data center silicon, growth cycle", currency: "USD" },
  { symbol: "MPWR", name: "Monolithic Power Systems", market: "NASDAQ", sector: "Semiconductors", notes: "power management chips, data center power, margins", currency: "USD" },
  { symbol: "TER", name: "Teradyne", market: "NASDAQ", sector: "Semiconductor equipment", notes: "chip testing equipment, robotics, cycle recovery", currency: "USD" },
  { symbol: "COHR", name: "Coherent", market: "NYSE", sector: "Optical components", notes: "optical networking, AI data center, restructuring", currency: "USD" },
  { symbol: "LSCC", name: "Lattice Semiconductor", market: "NASDAQ", sector: "Semiconductors", notes: "low power FPGAs, industrial chips, margin recovery", currency: "USD" },
  { symbol: "QRVO", name: "Qorvo", market: "NASDAQ", sector: "Semiconductors", notes: "RF chips, mobile recovery, activist interest potential", currency: "USD" },
  { symbol: "SWKS", name: "Skyworks Solutions", market: "NASDAQ", sector: "Semiconductors", notes: "RF chips, mobile cycle recovery, dividend", currency: "USD" },
  { symbol: "GFS", name: "GlobalFoundries", market: "NASDAQ", sector: "Semiconductors", notes: "specialty foundry, industrial chips, strategic capacity", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft", market: "NASDAQ", sector: "Enterprise software", notes: "cloud platform, AI infrastructure, recurring revenue", currency: "USD" },
  { symbol: "GOOGL", name: "Alphabet", market: "NASDAQ", sector: "Digital platform", notes: "search platform, cloud, AI infrastructure, buybacks", currency: "USD" },
  { symbol: "AMZN", name: "Amazon", market: "NASDAQ", sector: "Cloud and commerce", notes: "AWS cloud infrastructure, advertising, margin expansion", currency: "USD" },
  { symbol: "META", name: "Meta Platforms", market: "NASDAQ", sector: "Digital platform", notes: "advertising platform, AI infrastructure, buybacks", currency: "USD" },
  { symbol: "CRM", name: "Salesforce", market: "NYSE", sector: "Enterprise software", notes: "enterprise SaaS, margin expansion, activist history", currency: "USD" },
  { symbol: "NOW", name: "ServiceNow", market: "NYSE", sector: "Enterprise software", notes: "workflow platform, recurring revenue, AI automation", currency: "USD" },
  { symbol: "ADBE", name: "Adobe", market: "NASDAQ", sector: "Enterprise software", notes: "creative platform, AI products, recurring revenue", currency: "USD" },
  { symbol: "INTU", name: "Intuit", market: "NASDAQ", sector: "Enterprise software", notes: "tax and accounting platform, recurring revenue, cash flow", currency: "USD" },
  { symbol: "ADSK", name: "Autodesk", market: "NASDAQ", sector: "Design software", notes: "design platform, recurring revenue, margin improvement", currency: "USD" },
  { symbol: "WDAY", name: "Workday", market: "NASDAQ", sector: "Enterprise software", notes: "HR and finance platform, recurring revenue, margin expansion", currency: "USD" },
  { symbol: "CDNS", name: "Cadence Design Systems", market: "NASDAQ", sector: "Design software", notes: "chip design software, recurring revenue, AI semiconductor demand", currency: "USD" },
  { symbol: "SNPS", name: "Synopsys", market: "NASDAQ", sector: "Design software", notes: "chip design software, semiconductor platform, cash flow", currency: "USD" },
  { symbol: "PLTR", name: "Palantir Technologies", market: "NASDAQ", sector: "Data platform", notes: "government and enterprise data platform, AI deployment, cash flow", currency: "USD" },
  { symbol: "MDB", name: "MongoDB", market: "NASDAQ", sector: "Data platform", notes: "database platform, enterprise recurring revenue, cloud usage", currency: "USD" },
  { symbol: "DDOG", name: "Datadog", market: "NASDAQ", sector: "Observability platform", notes: "enterprise monitoring platform, recurring revenue, cloud infrastructure", currency: "USD" },
  { symbol: "SNOW", name: "Snowflake", market: "NYSE", sector: "Data platform", notes: "data cloud platform, enterprise usage, AI data workloads", currency: "USD" },
  { symbol: "PANW", name: "Palo Alto Networks", market: "NASDAQ", sector: "Cybersecurity", notes: "enterprise cybersecurity platform, recurring revenue, consolidation", currency: "USD" },
  { symbol: "CRWD", name: "CrowdStrike", market: "NASDAQ", sector: "Cybersecurity", notes: "endpoint security platform, recurring revenue, enterprise security", currency: "USD" },
  { symbol: "FTNT", name: "Fortinet", market: "NASDAQ", sector: "Cybersecurity", notes: "network security, appliances and software, cash flow", currency: "USD" },
  { symbol: "ZS", name: "Zscaler", market: "NASDAQ", sector: "Cybersecurity", notes: "zero trust security platform, recurring revenue, enterprise security", currency: "USD" },
  { symbol: "OKTA", name: "Okta", market: "NASDAQ", sector: "Cybersecurity", notes: "identity security platform, recurring revenue, margin recovery", currency: "USD" },
  { symbol: "NET", name: "Cloudflare", market: "NYSE", sector: "Network platform", notes: "edge network platform, security, developer infrastructure", currency: "USD" },
  { symbol: "ANET", name: "Arista Networks", market: "NYSE", sector: "Network equipment", notes: "AI data center networking, cloud customers, margins", currency: "USD" },
  { symbol: "VRT", name: "Vertiv", market: "NYSE", sector: "Data center infrastructure", notes: "data center power and cooling, AI infrastructure, margin expansion", currency: "USD" },
  { symbol: "PWR", name: "Quanta Services", market: "NYSE", sector: "Infrastructure services", notes: "power grid services, data center power, backlog", currency: "USD" },
  { symbol: "HUBB", name: "Hubbell", market: "NYSE", sector: "Electrical equipment", notes: "grid equipment, electrification, data center power", currency: "USD" },
  { symbol: "CEG", name: "Constellation Energy", market: "NASDAQ", sector: "Power generation", notes: "nuclear power, data center electricity demand, cash flow", currency: "USD" },
  { symbol: "VST", name: "Vistra", market: "NYSE", sector: "Power generation", notes: "power generation, data center demand, capital returns", currency: "USD" },
  { symbol: "NRG", name: "NRG Energy", market: "NYSE", sector: "Power generation", notes: "power generation, cash flow, activist history", currency: "USD" },
  { symbol: "GEV", name: "GE Vernova", market: "NYSE", sector: "Power equipment", notes: "grid equipment, gas power, electrification turnaround", currency: "USD" },
  { symbol: "APH", name: "Amphenol", market: "NYSE", sector: "Electronic components", notes: "connectors, data center and industrial demand, cash flow", currency: "USD" },
  { symbol: "GLW", name: "Corning", market: "NYSE", sector: "Optical components", notes: "fiber optics, display glass, data center connectivity", currency: "USD" },
  { symbol: "ROP", name: "Roper Technologies", market: "NASDAQ", sector: "Industrial software", notes: "vertical software, recurring revenue, cash flow", currency: "USD" },
  { symbol: "ITW", name: "Illinois Tool Works", market: "NYSE", sector: "Industrial", notes: "industrial products, margin discipline, cash flow", currency: "USD" },
  { symbol: "PH", name: "Parker-Hannifin", market: "NYSE", sector: "Industrial", notes: "motion control, aerospace, industrial automation", currency: "USD" },
  { symbol: "ROK", name: "Rockwell Automation", market: "NYSE", sector: "Industrial automation", notes: "factory automation, cycle recovery, cash flow", currency: "USD" },
  { symbol: "TEL", name: "TE Connectivity", market: "NYSE", sector: "Electronic components", notes: "connectors, automotive, industrial, cash flow", currency: "USD" },
  { symbol: "TT", name: "Trane Technologies", market: "NYSE", sector: "HVAC equipment", notes: "commercial HVAC, data center cooling, margin expansion", currency: "USD" },
  { symbol: "CARR", name: "Carrier Global", market: "NYSE", sector: "HVAC equipment", notes: "HVAC, portfolio reshaping, cash flow", currency: "USD" },
  { symbol: "OTIS", name: "Otis Worldwide", market: "NYSE", sector: "Industrial services", notes: "elevator services, recurring maintenance revenue, cash flow", currency: "USD" },
  { symbol: "IR", name: "Ingersoll Rand", market: "NYSE", sector: "Industrial", notes: "industrial equipment, services, margin improvement", currency: "USD" },
  { symbol: "JCI", name: "Johnson Controls", market: "NYSE", sector: "Building systems", notes: "building automation, HVAC, portfolio changes", currency: "USD" },
  { symbol: "XYL", name: "Xylem", market: "NYSE", sector: "Water infrastructure", notes: "water infrastructure, mission critical services, cash flow", currency: "USD" },
  { symbol: "DOV", name: "Dover", market: "NYSE", sector: "Industrial", notes: "industrial equipment, cash flow, portfolio discipline", currency: "USD" },
  { symbol: "UNH", name: "UnitedHealth Group", market: "NYSE", sector: "Healthcare services", notes: "managed care, healthcare services, cash flow", currency: "USD" },
  { symbol: "ELV", name: "Elevance Health", market: "NYSE", sector: "Healthcare services", notes: "managed care, buybacks, stable cash flow", currency: "USD" },
  { symbol: "HCA", name: "HCA Healthcare", market: "NYSE", sector: "Healthcare services", notes: "hospital operator, cash flow, buybacks", currency: "USD" },
  { symbol: "THC", name: "Tenet Healthcare", market: "NYSE", sector: "Healthcare services", notes: "hospital operator, margin improvement, strategic assets", currency: "USD" },
  { symbol: "DHR", name: "Danaher", market: "NYSE", sector: "Life sciences", notes: "life sciences tools, recurring consumables, cash flow", currency: "USD" },
  { symbol: "TMO", name: "Thermo Fisher Scientific", market: "NYSE", sector: "Life sciences", notes: "life sciences tools, recurring consumables, cash flow", currency: "USD" },
  { symbol: "ISRG", name: "Intuitive Surgical", market: "NASDAQ", sector: "Medical devices", notes: "robotic surgery platform, recurring instrument revenue, growth", currency: "USD" },
  { symbol: "MDT", name: "Medtronic", market: "NYSE", sector: "Medical devices", notes: "medical device portfolio, dividend, margin recovery", currency: "USD" },
  { symbol: "BSX", name: "Boston Scientific", market: "NYSE", sector: "Medical devices", notes: "medical device growth, margin expansion, cash flow", currency: "USD" },
  { symbol: "SYK", name: "Stryker", market: "NYSE", sector: "Medical devices", notes: "medical devices, orthopedics, recurring procedure demand", currency: "USD" },
  { symbol: "ABT", name: "Abbott Laboratories", market: "NYSE", sector: "Healthcare", notes: "medical devices and diagnostics, dividend, cash flow", currency: "USD" },
  { symbol: "ABBV", name: "AbbVie", market: "NYSE", sector: "Pharmaceuticals", notes: "pharma portfolio, dividend, pipeline transition", currency: "USD" },
  { symbol: "AMGN", name: "Amgen", market: "NASDAQ", sector: "Pharmaceuticals", notes: "biotech medicines, dividend, cash flow", currency: "USD" },
  { symbol: "GILD", name: "Gilead Sciences", market: "NASDAQ", sector: "Pharmaceuticals", notes: "pharma cash flow, dividend, pipeline reset", currency: "USD" },
  { symbol: "VRTX", name: "Vertex Pharmaceuticals", market: "NASDAQ", sector: "Biotechnology", notes: "rare disease medicines, cash flow, pipeline", currency: "USD" },
  { symbol: "REGN", name: "Regeneron", market: "NASDAQ", sector: "Biotechnology", notes: "biotech platform, cash flow, pipeline", currency: "USD" },
  { symbol: "ZBH", name: "Zimmer Biomet", market: "NYSE", sector: "Medical devices", notes: "orthopedic devices, margin improvement, buybacks", currency: "USD" },
  { symbol: "V", name: "Visa", market: "NYSE", sector: "Payment services", notes: "payments network, recurring transaction revenue, margins", currency: "USD" },
  { symbol: "MA", name: "Mastercard", market: "NYSE", sector: "Payment services", notes: "payments network, recurring transaction revenue, cash flow", currency: "USD" },
  { symbol: "AXP", name: "American Express", market: "NYSE", sector: "Financial services", notes: "card network, affluent customers, buybacks", currency: "USD" },
  { symbol: "COF", name: "Capital One", market: "NYSE", sector: "Financial services", notes: "credit cards, banking, scale and capital returns", currency: "USD" },
  { symbol: "SYF", name: "Synchrony Financial", market: "NYSE", sector: "Financial services", notes: "consumer finance, buybacks, valuation discount", currency: "USD" },
  { symbol: "ALLY", name: "Ally Financial", market: "NYSE", sector: "Financial services", notes: "auto finance, online bank, valuation discount", currency: "USD" },
  { symbol: "ICE", name: "Intercontinental Exchange", market: "NYSE", sector: "Market infrastructure", notes: "exchange infrastructure, recurring data revenue, cash flow", currency: "USD" },
  { symbol: "CME", name: "CME Group", market: "NASDAQ", sector: "Market infrastructure", notes: "exchange infrastructure, clearing, dividend", currency: "USD" },
  { symbol: "CBOE", name: "Cboe Global Markets", market: "CBOE", sector: "Market infrastructure", notes: "options exchange, market data, cash flow", currency: "USD" },
  { symbol: "NDAQ", name: "Nasdaq", market: "NASDAQ", sector: "Market infrastructure", notes: "exchange operator, data revenue, financial technology", currency: "USD" },
  { symbol: "SPGI", name: "S&P Global", market: "NYSE", sector: "Financial data", notes: "ratings and index data, recurring revenue, margins", currency: "USD" },
  { symbol: "MCO", name: "Moody's", market: "NYSE", sector: "Financial data", notes: "ratings data, recurring analytics revenue, cash flow", currency: "USD" },
  { symbol: "MSCI", name: "MSCI", market: "NYSE", sector: "Financial data", notes: "index data, recurring revenue, high margins", currency: "USD" },
  { symbol: "FDS", name: "FactSet", market: "NYSE", sector: "Financial data", notes: "financial data platform, recurring revenue, cash flow", currency: "USD" },
  { symbol: "BLK", name: "BlackRock", market: "NYSE", sector: "Asset management", notes: "asset manager, scale, cash flow", currency: "USD" },
  { symbol: "SCHW", name: "Charles Schwab", market: "NYSE", sector: "Financial services", notes: "brokerage platform, deposits, scale economics", currency: "USD" },
  { symbol: "TROW", name: "T. Rowe Price", market: "NASDAQ", sector: "Asset management", notes: "asset management, net cash, dividend", currency: "USD" },
  { symbol: "UBER", name: "Uber Technologies", market: "NYSE", sector: "Mobility platform", notes: "mobility platform, delivery scale, free cash flow", currency: "USD" },
  { symbol: "ABNB", name: "Airbnb", market: "NASDAQ", sector: "Travel platform", notes: "travel platform, asset-light marketplace, cash flow", currency: "USD" },
  { symbol: "EXPE", name: "Expedia Group", market: "NASDAQ", sector: "Travel platform", notes: "travel platform, buybacks, margin improvement", currency: "USD" },
  { symbol: "RCL", name: "Royal Caribbean", market: "NYSE", sector: "Travel services", notes: "cruise demand, debt reduction, cash flow recovery", currency: "USD" },
  { symbol: "CCL", name: "Carnival", market: "NYSE", sector: "Travel services", notes: "cruise recovery, debt reduction, cash flow", currency: "USD" },
  { symbol: "NCLH", name: "Norwegian Cruise Line", market: "NYSE", sector: "Travel services", notes: "cruise recovery, pricing, debt reduction", currency: "USD" },
  { symbol: "NKE", name: "Nike", market: "NYSE", sector: "Consumer products", notes: "brand assets, turnaround, margin recovery", currency: "USD" },
  { symbol: "SBUX", name: "Starbucks", market: "NASDAQ", sector: "Consumer services", notes: "global brand, turnaround, activist history", currency: "USD" },
  { symbol: "EL", name: "Estee Lauder", market: "NYSE", sector: "Consumer products", notes: "beauty brand assets, turnaround, margin recovery", currency: "USD" },
  { symbol: "HAS", name: "Hasbro", market: "NASDAQ", sector: "Consumer products", notes: "brand portfolio, restructuring, cash flow recovery", currency: "USD" },
  { symbol: "MAT", name: "Mattel", market: "NASDAQ", sector: "Consumer products", notes: "brand portfolio, licensing, strategic review potential", currency: "USD" },
  { symbol: "OXY", name: "Occidental Petroleum", market: "NYSE", sector: "Energy", notes: "energy producer, debt reduction, capital returns", currency: "USD" },
  { symbol: "FANG", name: "Diamondback Energy", market: "NASDAQ", sector: "Energy", notes: "oil producer, shale consolidation, cash returns", currency: "USD" },
  { symbol: "COP", name: "ConocoPhillips", market: "NYSE", sector: "Energy", notes: "oil and gas producer, cash returns, low cost assets", currency: "USD" },
  { symbol: "SLB", name: "SLB", market: "NYSE", sector: "Energy services", notes: "oilfield services, international cycle, cash flow", currency: "USD" },
  { symbol: "HAL", name: "Halliburton", market: "NYSE", sector: "Energy services", notes: "oilfield services, cash flow, cycle recovery", currency: "USD" },
  { symbol: "LNG", name: "Cheniere Energy", market: "NYSE", sector: "Energy infrastructure", notes: "LNG export infrastructure, contract cash flow, buybacks", currency: "USD" },
  { symbol: "NEE", name: "NextEra Energy", market: "NYSE", sector: "Utilities", notes: "renewable power, grid investment, dividend", currency: "USD" },
  { symbol: "ENPH", name: "Enphase Energy", market: "NASDAQ", sector: "Energy technology", notes: "solar inverters, cycle recovery, clean energy platform", currency: "USD" },
  { symbol: "FSLR", name: "First Solar", market: "NASDAQ", sector: "Energy technology", notes: "solar modules, policy support, capacity expansion", currency: "USD" },
  { symbol: "FCX", name: "Freeport-McMoRan", market: "NYSE", sector: "Materials", notes: "copper producer, electrification demand, cash flow", currency: "USD" },
  { symbol: "NEM", name: "Newmont", market: "NYSE", sector: "Materials", notes: "gold miner, cash flow, portfolio optimization", currency: "USD" },
  { symbol: "SCCO", name: "Southern Copper", market: "NYSE", sector: "Materials", notes: "copper producer, electrification demand, dividend", currency: "USD" },
  { symbol: "NUE", name: "Nucor", market: "NYSE", sector: "Steel", notes: "steel producer, buybacks, infrastructure demand", currency: "USD" },
  { symbol: "STLD", name: "Steel Dynamics", market: "NASDAQ", sector: "Steel", notes: "steel producer, cash returns, infrastructure cycle", currency: "USD" },
  { symbol: "CMC", name: "Commercial Metals", market: "NYSE", sector: "Steel", notes: "rebar steel, infrastructure demand, cash flow", currency: "USD" },
  { symbol: "CLF", name: "Cleveland-Cliffs", market: "NYSE", sector: "Steel", notes: "steel turnaround, automotive exposure, cash flow recovery", currency: "USD" },
  { symbol: "RTX", name: "RTX", market: "NYSE", sector: "Aerospace and defense", notes: "defense backlog, aerospace aftermarket, cash flow", currency: "USD" },
  { symbol: "LMT", name: "Lockheed Martin", market: "NYSE", sector: "Aerospace and defense", notes: "defense contracts, dividend, backlog", currency: "USD" },
  { symbol: "NOC", name: "Northrop Grumman", market: "NYSE", sector: "Aerospace and defense", notes: "defense contracts, space systems, cash flow", currency: "USD" },
  { symbol: "GD", name: "General Dynamics", market: "NYSE", sector: "Aerospace and defense", notes: "defense, aerospace, backlog, cash flow", currency: "USD" },
  { symbol: "BA", name: "Boeing", market: "NYSE", sector: "Aerospace", notes: "aircraft backlog, turnaround, execution risk", currency: "USD" },
  { symbol: "TDG", name: "TransDigm", market: "NYSE", sector: "Aerospace", notes: "aerospace parts, recurring aftermarket revenue, cash flow", currency: "USD" },
  { symbol: "HEI", name: "HEICO", market: "NYSE", sector: "Aerospace", notes: "aerospace parts, aftermarket demand, margin expansion", currency: "USD" },
  { symbol: "CBRE", name: "CBRE Group", market: "NYSE", sector: "Real estate services", notes: "commercial real estate services, recurring outsourcing, cash flow", currency: "USD" },
  { symbol: "JLL", name: "Jones Lang LaSalle", market: "NYSE", sector: "Real estate services", notes: "real estate services, outsourcing, transaction recovery", currency: "USD" },
  { symbol: "DLR", name: "Digital Realty", market: "NYSE", sector: "Data center REIT", notes: "data center infrastructure, recurring lease revenue, AI demand", currency: "USD" },
  { symbol: "EQIX", name: "Equinix", market: "NASDAQ", sector: "Data center REIT", notes: "data center platform, recurring lease revenue, interconnection", currency: "USD" },
  { symbol: "WDC", name: "Western Digital", market: "NASDAQ", sector: "Data storage", notes: "data storage, memory cycle, strategic separation", currency: "USD" },
  { symbol: "STX", name: "Seagate Technology", market: "NASDAQ", sector: "Data storage", notes: "hard disk drives, data center storage cycle, cash flow", currency: "USD" },
  { symbol: "EBAY", name: "eBay", market: "NASDAQ", sector: "Marketplace", notes: "online marketplace, buybacks, cash flow", currency: "USD" },
  { symbol: "ETSY", name: "Etsy", market: "NASDAQ", sector: "Marketplace", notes: "online marketplace, activist interest, margin improvement", currency: "USD" },
  { symbol: "BAX", name: "Baxter International", market: "NYSE", sector: "Medical devices", notes: "medical products, restructuring, debt reduction", currency: "USD" },
  { symbol: "SWK", name: "Stanley Black & Decker", market: "NYSE", sector: "Industrial products", notes: "tools brand, restructuring, margin recovery", currency: "USD" },
  { symbol: "WHR", name: "Whirlpool", market: "NYSE", sector: "Consumer products", notes: "appliances, restructuring, dividend, valuation discount", currency: "USD" },
  { symbol: "CHTR", name: "Charter Communications", market: "NASDAQ", sector: "Telecom media", notes: "cable infrastructure, free cash flow, buybacks", currency: "USD" },
  { symbol: "TMUS", name: "T-Mobile US", market: "NASDAQ", sector: "Telecom", notes: "wireless network, buybacks, free cash flow", currency: "USD" },
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
  scheduleHourlyRefresh();
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
    const previousSettings = await readSettings();
    const previousDiscoveryKey = discoverySettingsKey(previousSettings);
    const settings = await saveSettings(applySettingsPatch(previousSettings, body));
    const discoveryReset = previousDiscoveryKey !== discoverySettingsKey(settings);
    const discovery = discoveryReset ? await resetDiscoveryCacheForSettings(settings) : null;
    lmModelCache = { configuredUrl: "", url: "", model: "" };
    return json(res, 200, {
      settings: publicSettings(settings),
      status: await status(),
      discoveryReset,
      discovery,
    });
  }

  if (url.pathname === "/api/stocks" && req.method === "GET") {
    return json(res, 200, { stocks: await readWatchlist() });
  }

  if (url.pathname === "/api/us-stocks" && req.method === "GET") {
    return json(res, 200, { stocks: await readUsWatchlist() });
  }

  if (url.pathname === "/api/crypto" && req.method === "GET") {
    const [holding, analysis] = await Promise.all([
      readCryptoHolding(),
      readCryptoAnalysisCache(),
    ]);
    return json(res, 200, { holding, analysis });
  }

  if (url.pathname === "/api/analysis" && req.method === "GET") {
    const [cached, settings] = await Promise.all([readAnalysisCache(), readSettings()]);
    const withFinancials = await attachFinancialsToAnalyses(cached.analyses);
    const analyses = await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(withFinancials, settings));
    return json(res, 200, { ...cached, analyses });
  }

  if (url.pathname === "/api/us-analysis" && req.method === "GET") {
    const [cached, settings] = await Promise.all([readUsAnalysisCache(), readSettings()]);
    const analyses = await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(cached.analyses, settings, { currency: "USD" }));
    return json(res, 200, { ...cached, analyses, summary: usPortfolioSummary(analyses) });
  }

  if (url.pathname === "/api/crypto-analyze" && req.method === "POST") {
    const body = await readJson(req);
    return json(res, 200, await analyzeCryptoHolding(body));
  }

  if (url.pathname === "/api/disclosures" && req.method === "GET") {
    return json(res, 200, await readDisclosureCache());
  }

  if (url.pathname === "/api/disclosures/check" && req.method === "POST") {
    const body = await readJson(req);
    return json(res, 200, await checkTimelyDisclosures({
      force: true,
      notify: body.notify !== false,
    }));
  }

  if (url.pathname === "/api/shareholders" && req.method === "GET") {
    return json(res, 200, await readShareholderCache());
  }

  if (url.pathname === "/api/shareholders/check" && req.method === "POST") {
    const body = await readJson(req);
    return json(res, 200, await updateShareholderSnapshots({
      force: true,
      notify: body.notify !== false,
    }));
  }

  if (url.pathname === "/api/financials" && req.method === "GET") {
    return json(res, 200, await readFinancialCache());
  }

  if (url.pathname === "/api/financials/check" && req.method === "POST") {
    return json(res, 200, await updateFinancialSnapshots({ force: true }));
  }

  if (url.pathname === "/api/analysis-job" && req.method === "GET") {
    return json(res, 200, {
      job: analysisJobSnapshot(),
      result: analysisJob?.result && !analysisJob.running ? analysisJob.result : null,
    });
  }

  if (url.pathname === "/api/us-analysis-job" && req.method === "GET") {
    return json(res, 200, {
      job: usAnalysisJobSnapshot(),
      result: usAnalysisJob?.result && !usAnalysisJob.running ? usAnalysisJob.result : null,
    });
  }

  if (url.pathname === "/api/discovery" && req.method === "GET") {
    const excludedCandidates = await readExcludedCandidates();
    const candidatePerformance = candidatePerformanceSummary(await readCandidateHistory());
    return json(res, 200, {
      ...filterDiscoveryResultByExclusions(await discoveryCacheForCurrentSettings(), excludedCandidates),
      excludedCandidates,
      candidatePerformance,
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
    const discovery = filterDiscoveryResultByExclusions(await discoveryCacheForCurrentSettings(), excludedCandidates);
    await saveDiscoveryCache(discovery);
    return json(res, 200, { excludedCandidates, ...discovery });
  }

  if (url.pathname === "/api/candidate-history" && req.method === "GET") {
    const history = await readCandidateHistory();
    return json(res, 200, {
      performance: candidatePerformanceSummary(history),
      items: history.items.slice(-200).reverse(),
    });
  }

  if (url.pathname.startsWith("/api/excluded-candidates/") && req.method === "DELETE") {
    const symbol = normalizeDiscoverySymbol(decodeURIComponent(url.pathname.split("/").pop() || ""));
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
    const stock = normalizeStock({
      symbol,
      name,
      market: body.market || "東証",
      sector: body.sector,
      notes: body.notes,
      holding: Boolean(body.holding || body.purchaseDate || body.purchasePrice || body.quantity || body.positions?.length || body.sales?.length),
      purchaseDate: body.purchaseDate,
      purchasePrice: body.purchasePrice,
      quantity: body.quantity,
      accountType: body.accountType,
      positions: body.positions,
      sales: body.sales,
      minimumHoldQuantity: body.minimumHoldQuantity,
      targetBuyPrice: body.targetBuyPrice,
    });
    stocks.push(stock);
    await saveWatchlist(stocks);
    if (!body.analyze) return json(res, 201, { stocks });
    try {
      const analysisCache = await analyzeSingleWatchStock(stock, body, { notify: true });
      return json(res, 201, { stocks, analysis: analysisCache.analysis, analysisCache });
    } catch (error) {
      return json(res, 201, { stocks, analysisError: error.message || "追加後の分析に失敗しました。" });
    }
  }

  if (url.pathname === "/api/stocks/reorder" && req.method === "POST") {
    const body = await readJson(req);
    const stocks = await readWatchlist();
    const requested = Array.isArray(body.symbols)
      ? body.symbols.map(normalizeSymbol).filter(Boolean)
      : [];
    if (!requested.length) return json(res, 400, { error: "並び替える銘柄がありません。" });
    const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const seen = new Set();
    const ordered = [];
    for (const symbol of requested) {
      const stock = bySymbol.get(symbol);
      if (!stock || seen.has(symbol)) continue;
      ordered.push(stock);
      seen.add(symbol);
    }
    for (const stock of stocks) {
      if (!seen.has(stock.symbol)) ordered.push(stock);
    }
    await saveWatchlist(ordered);
    return json(res, 200, { stocks: ordered.map(normalizeStock) });
  }

  if (url.pathname === "/api/us-stocks/reorder" && req.method === "POST") {
    const body = await readJson(req);
    const stocks = await readUsWatchlist();
    const requested = Array.isArray(body.symbols)
      ? body.symbols.map(normalizeUsSymbol).filter(Boolean)
      : [];
    if (!requested.length) return json(res, 400, { error: "並び替える米国株がありません。" });
    const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const seen = new Set();
    const ordered = [];
    for (const symbol of requested) {
      const stock = bySymbol.get(symbol);
      if (!stock || seen.has(symbol)) continue;
      ordered.push(stock);
      seen.add(symbol);
    }
    for (const stock of stocks) {
      if (!seen.has(stock.symbol)) ordered.push(stock);
    }
    await saveUsWatchlist(ordered);
    return json(res, 200, { stocks: ordered.map(normalizeUsStock) });
  }

  if (url.pathname === "/api/us-stocks" && req.method === "POST") {
    const body = await readJson(req);
    const stocks = await readUsWatchlist();
    if (stocks.length >= MAX_US_STOCKS) return json(res, 400, { error: `米国株で管理できる銘柄は${MAX_US_STOCKS}件までです。` });
    const symbol = normalizeUsSymbol(body.symbol);
    const name = String(body.name || "").trim();
    if (!symbol || !name) return json(res, 400, { error: "銘柄名とティッカーを入力してください。" });
    if (stocks.some((stock) => stock.symbol === symbol)) return json(res, 400, { error: "同じティッカーがすでにあります。" });
    const stock = normalizeUsStock({
      symbol,
      name,
      market: body.market || "NYSE",
      notes: body.notes,
      holding: Boolean(body.holding || body.purchaseDate || body.purchasePrice || body.quantity || body.positions?.length || body.sales?.length),
      purchaseDate: body.purchaseDate,
      purchasePrice: body.purchasePrice,
      quantity: body.quantity,
      accountType: body.accountType,
      positions: body.positions,
      sales: body.sales,
    });
    stocks.push(stock);
    await saveUsWatchlist(stocks);
    if (!body.analyze) return json(res, 201, { stocks });
    try {
      const analysisCache = await analyzeSingleUsStock(stock, body, { notify: true });
      return json(res, 201, { stocks, analysis: analysisCache.analysis, analysisCache });
    } catch (error) {
      return json(res, 201, { stocks, analysisError: error.message || "追加後の分析に失敗しました。" });
    }
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
      sales: body.sales,
      minimumHoldQuantity: body.minimumHoldQuantity,
      targetBuyPrice: body.targetBuyPrice,
    });
    await saveWatchlist(stocks);
    return json(res, 200, { stock: stocks[index], stocks });
  }

  if (url.pathname.startsWith("/api/us-stocks/") && req.method === "PATCH") {
    const symbol = normalizeUsSymbol(decodeURIComponent(url.pathname.split("/").pop() || ""));
    const body = await readJson(req);
    const stocks = await readUsWatchlist();
    const index = stocks.findIndex((stock) => stock.symbol === symbol);
    if (index < 0) return json(res, 404, { error: "米国株の銘柄が見つかりません。" });
    stocks[index] = normalizeUsStock({
      ...stocks[index],
      holding: Boolean(body.holding),
      positions: body.positions,
      sales: body.sales,
    });
    await saveUsWatchlist(stocks);
    return json(res, 200, { stock: stocks[index], stocks });
  }

  if (url.pathname === "/api/crypto" && req.method === "PATCH") {
    const body = await readJson(req);
    const holding = await saveCryptoHolding({
      ...(await readCryptoHolding()),
      holding: Boolean(body.holding),
      positions: body.positions,
      sales: body.sales,
    });
    return json(res, 200, { holding, analysis: await readCryptoAnalysisCache() });
  }

  if (url.pathname.startsWith("/api/stocks/") && req.method === "DELETE") {
    const symbol = decodeURIComponent(url.pathname.split("/").pop() || "");
    const stocks = (await readWatchlist()).filter((stock) => stock.symbol !== symbol);
    await saveWatchlist(stocks);
    return json(res, 200, { stocks });
  }

  if (url.pathname.startsWith("/api/us-stocks/") && req.method === "DELETE") {
    const symbol = normalizeUsSymbol(decodeURIComponent(url.pathname.split("/").pop() || ""));
    const stocks = (await readUsWatchlist()).filter((stock) => stock.symbol !== symbol);
    await saveUsWatchlist(stocks);
    return json(res, 200, { stocks });
  }

  if (url.pathname === "/api/analyze" && req.method === "POST") {
    const body = await readJson(req);
    if (body.quick) return json(res, 200, await refreshWatchlistPrices(body));
    if (body.sync) return json(res, 200, await analyzeWatchlist(body));
    const job = startAnalysisJob(body);
    return json(res, 202, {
      job,
      message: "一括分析を裏で開始しました。進み具合は自動で更新されます。",
    });
  }

  if (url.pathname === "/api/us-analyze" && req.method === "POST") {
    const body = await readJson(req);
    if (body.quick) return json(res, 200, await refreshUsPrices(body));
    if (body.sync) return json(res, 200, await analyzeUsHoldings(body, { notify: body.notify !== false }));
    const job = startUsAnalysisJob(body);
    return json(res, 202, {
      job,
      message: "米国株のニュース翻訳とAI確認を裏で開始しました。",
    });
  }

  if (url.pathname === "/api/discover" && req.method === "POST") {
    const body = await readJson(req);
    const job = startDiscoveryJob(body, "manual");
    const excludedCandidates = await readExcludedCandidates();
    return json(res, 202, {
      ...filterDiscoveryResultByExclusions(await discoveryCacheForCurrentSettings(), excludedCandidates),
      excludedCandidates,
      candidatePerformance: candidatePerformanceSummary(await readCandidateHistory()),
      job,
      message: "候補検索を裏で開始しました。途中結果は自動保存されます。",
    });
  }

  return json(res, 404, { error: "Not found" });
}

function startAnalysisJob(options = {}) {
  if (analysisJob?.running) return analysisJobSnapshot();
  const job = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    running: true,
    phase: "一括分析を準備中",
    checked: 0,
    total: 0,
    aiDone: 0,
    aiCurrent: 0,
    aiTotal: 0,
    generatedAt: "",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usedLmStudio: false,
    error: "",
    result: null,
  };
  analysisJob = job;
  void analyzeWatchlist(options, (patch) => updateAnalysisJob(job, patch))
    .then((result) => {
      updateAnalysisJob(job, {
        running: false,
        phase: "完了",
        checked: result.analyses?.length || job.checked,
        total: result.analyses?.length || job.total,
        generatedAt: result.generatedAt,
        usedLmStudio: Boolean(result.usedLmStudio),
        result,
      });
    })
    .catch((error) => {
      updateAnalysisJob(job, {
        running: false,
        phase: "失敗",
        error: error.message || "一括分析に失敗しました",
      });
    });
  return analysisJobSnapshot();
}

function updateAnalysisJob(job, patch = {}) {
  if (!job || analysisJob?.id !== job.id) return;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function analysisJobSnapshot() {
  if (!analysisJob) {
    return {
      running: false,
      phase: "待機中",
      checked: 0,
      total: 0,
      aiDone: 0,
      aiCurrent: 0,
      aiTotal: 0,
      generatedAt: "",
      startedAt: "",
      updatedAt: "",
      usedLmStudio: false,
      error: "",
      hasResult: false,
    };
  }
  const { result, ...snapshot } = analysisJob;
  return { ...snapshot, hasResult: Boolean(result) };
}

function startUsAnalysisJob(options = {}) {
  if (usAnalysisJob?.running) return usAnalysisJobSnapshot();
  const job = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    running: true,
    phase: "米国株分析を準備中",
    checked: 0,
    total: 0,
    aiDone: 0,
    aiCurrent: 0,
    aiTotal: 0,
    generatedAt: "",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usedLmStudio: false,
    error: "",
    result: null,
  };
  usAnalysisJob = job;
  void analyzeUsHoldings(options, { notify: options.notify !== false }, (patch) => updateUsAnalysisJob(job, patch))
    .then((result) => {
      updateUsAnalysisJob(job, {
        running: false,
        phase: "完了",
        checked: result.analyses?.length || job.checked,
        total: result.analyses?.length || job.total,
        generatedAt: result.generatedAt,
        usedLmStudio: Boolean(result.usedLmStudio),
        result,
      });
    })
    .catch((error) => {
      updateUsAnalysisJob(job, {
        running: false,
        phase: "失敗",
        error: error.message || "米国株分析に失敗しました",
      });
    });
  return usAnalysisJobSnapshot();
}

function updateUsAnalysisJob(job, patch = {}) {
  if (!job || usAnalysisJob?.id !== job.id) return;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function usAnalysisJobSnapshot() {
  if (!usAnalysisJob) {
    return {
      running: false,
      phase: "待機中",
      checked: 0,
      total: 0,
      aiDone: 0,
      aiCurrent: 0,
      aiTotal: 0,
      generatedAt: "",
      startedAt: "",
      updatedAt: "",
      usedLmStudio: false,
      error: "",
      hasResult: false,
    };
  }
  const { result, ...snapshot } = usAnalysisJob;
  return { ...snapshot, hasResult: Boolean(result) };
}

function usablePrice(price = {}) {
  return Boolean(nullablePositiveNumber(price.current));
}

function recentCachedPriceBySymbol(cache = {}, maxAgeMs = 5 * 60 * 1000) {
  const generatedAt = new Date(cache.generatedAt || "").getTime();
  if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > maxAgeMs) return new Map();
  return new Map((cache.analyses || [])
    .filter((analysis) => analysis?.symbol && usablePrice(analysis.price))
    .map((analysis) => [analysis.symbol, analysis.price]));
}

function cachedResearchFromAnalysis(analysis = null) {
  const evidence = Array.isArray(analysis?.evidence) ? analysis.evidence : [];
  return {
    searched: Number(analysis?.researchStats?.searched || 0),
    crawled: Number(analysis?.researchStats?.crawled || 0),
    evidence,
    contextText: cleanText(evidence.map((item) => `${item.title || ""}\n${item.summary || item.snippet || ""}`).join("\n")),
    warning: "",
  };
}

function cachedDecisionFromAnalysis(analysis = null, fallback = {}) {
  if (!analysis) return fallback;
  const reasons = asStringArray(analysis.reasons);
  const risks = asStringArray(analysis.risks);
  return {
    action: ["BUY", "HOLD", "SELL", "WATCH"].includes(analysis.action) ? analysis.action : fallback.action,
    confidence: Number.isFinite(Number(analysis.confidence)) ? Number(analysis.confidence) : fallback.confidence,
    thesis: analysis.thesis || fallback.thesis,
    reasons: reasons.length ? reasons : fallback.reasons,
    risks: risks.length ? risks : fallback.risks,
    riskChecks: analysis.riskChecks || fallback.riskChecks,
    growthExit: analysis.growthExit || analysis.ai?.growthExit || fallback.growthExit,
    sellForecast: analysis.sellForecast || analysis.ai?.sellForecast || fallback.sellForecast,
  };
}

async function refreshWatchlistPrices(options = {}) {
  const stocks = await readWatchlist();
  const settings = await readSettings();
  const previous = await readAnalysisCache();
  const previousBySymbol = new Map((previous.analyses || []).map((analysis) => [analysis.symbol, analysis]));
  const generatedAt = new Date().toISOString();
  const warnings = [];
  const rows = await mapLimit(stocks, 8, async (stock) => {
    const previousAnalysis = previousBySymbol.get(stock.symbol) || null;
    let priceError = "";
    const fetchedPrice = await fetchPriceHistory(stock.symbol, { timeout: QUICK_PRICE_HISTORY_TIMEOUT_MS }).catch((error) => {
      priceError = error.message || "価格を取得できませんでした";
      return emptyPrice();
    });
    const price = usablePrice(fetchedPrice) ? fetchedPrice : previousAnalysis?.price || fetchedPrice;
    if (!usablePrice(fetchedPrice)) {
      warnings.push(`${stock.name}: ${priceError || "最新価格を取得できなかったため保存済み価格を使いました"}`);
    }
    const research = cachedResearchFromAnalysis(previousAnalysis);
    const fallback = ruleBasedDecision(stock, price, research);
    const decision = cachedDecisionFromAnalysis(previousAnalysis, fallback);
    return {
      ...(previousAnalysis || {}),
      ...normalizeDecision(stock, price, research, decision),
      refreshedPriceOnlyAt: generatedAt,
    };
  });
  const withFinancials = await attachFinancialsToAnalyses(rows);
  const analyses = await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(withFinancials, settings));
  const result = {
    generatedAt,
    fastRefresh: true,
    usedLmStudio: Boolean(previous.usedLmStudio),
    warnings: uniqueText([...warnings, ...(previous.warnings || [])]).slice(0, 6),
    analyses,
    sectorEvidence: previous.sectorEvidence || [],
  };
  await saveAnalysisCache(result);
  return result;
}

async function analyzeWatchlist(options = {}, onProgress = null) {
  const stocks = await readWatchlist();
  const settings = await readSettings();
  const warnings = [];
  const systemWarnings = [];
  onProgress?.({
    phase: "EDINET財務を確認中",
    checked: 0,
    total: stocks.length,
    aiDone: 0,
    aiCurrent: 0,
    aiTotal: 0,
  });
  const previousFinancialCache = await readFinancialCache().catch(() => ({ items: [] }));
  const previousFinancialBySymbol = new Map((previousFinancialCache.items || []).map((item) => [item.symbol, item]));
  const missingFinancialForWatchlist = stocks.some((stock) => {
    if (!/\.T$/.test(stock.symbol)) return false;
    const item = previousFinancialBySymbol.get(stock.symbol);
    return !item || ["missing_key", "not_found", "error"].includes(item.status);
  });
  const shouldForceFinancials = Boolean(settings.edinetApiKey)
    && (options.forceFinancials === true || missingFinancialForWatchlist);
  const financialCache = await updateFinancialSnapshots({ force: shouldForceFinancials }).catch(async (error) => {
    systemWarnings.push(`EDINET財務: ${error.message || "財務情報を更新できませんでした"}`);
    return previousFinancialCache;
  });
  const financialBySymbol = new Map((financialCache.items || []).map((item) => [item.symbol, item]));
  const recentPrices = options.reuseFreshPrices
    ? recentCachedPriceBySymbol(await readAnalysisCache())
    : new Map();
  const websiteLimit = clamp(Number(options.websiteLimit || settings.websiteLimit || defaultSettings.websiteLimit), 1, MAX_WEBSITE_LIMIT);
  const depthLimit = clamp(Number(options.depthLimit || settings.depthLimit || defaultSettings.depthLimit), 1, MAX_DEPTH_LIMIT);
  const pagesPerSite = clamp(Number(options.pagesPerSite || settings.pagesPerSite || defaultSettings.pagesPerSite), 1, MAX_PAGES_PER_SITE);
  const lmStatus = await checkLmStudio();
  let checked = 0;
  onProgress?.({
    phase: "価格・配当・検索を確認中",
    checked,
    total: stocks.length,
      aiDone: 0,
      aiCurrent: 0,
      aiTotal: 0,
  });

  const rows = await mapLimit(stocks, 4, async (stock) => {
    const cachedPrice = recentPrices.get(stock.symbol);
    const [price, research] = await Promise.all([
      cachedPrice ? Promise.resolve(cachedPrice) : fetchPriceHistory(stock.symbol),
      researchStock(stock, { websiteLimit, depthLimit, pagesPerSite }),
    ]);

    if (research.warning) warnings.push(`${stock.name}: ${research.warning}`);
    const fallback = ruleBasedDecision(stock, price, research);
    checked += 1;
    onProgress?.({ phase: "価格・配当・検索を確認中", checked, total: stocks.length });
    return { stock, price, research, fallback, financials: financialBySymbol.get(stock.symbol) || null };
  });
  await translateResearchEvidenceRows(rows).catch(() => {});

  let aiBySymbol = new Map();
  if (lmStatus.ok && rows.length) {
    try {
      onProgress?.({
        phase: "LM Studioで2銘柄ずつ整理中",
        aiDone: 0,
        aiCurrent: 1,
        aiTotal: Math.ceil(rows.length / 2),
      });
      const decisions = await aiBatchDecisions(rows, (aiDone, aiTotal, aiCurrent = 0) => {
        onProgress?.({ phase: "LM Studioで2銘柄ずつ整理中", aiDone, aiTotal, aiCurrent });
      });
      aiBySymbol = new Map(decisions.map((decision) => [decision.symbol, decision]));
    } catch (error) {
      systemWarnings.push(`LM Studio: ${error.message || "分析が時間内に返りませんでした"}`);
    }
  } else {
    onProgress?.({ phase: "価格ルールで整理中", aiDone: 0, aiCurrent: 0, aiTotal: 0 });
  }

  const normalizedRows = rows.map(({ stock, price, research, fallback }) => {
    return normalizeDecision(stock, price, research, aiBySymbol.get(stock.symbol) || fallback);
  });
  const withFinancials = await attachFinancialsToAnalyses(normalizedRows);
  const analyses = await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(withFinancials, settings));

  const result = {
    generatedAt: new Date().toISOString(),
    usedLmStudio: aiBySymbol.size > 0,
    warnings: [...systemWarnings, ...new Set(warnings)].slice(0, 6),
    analyses,
    sectorEvidence: buildSectorEvidence(rows),
  };
  onProgress?.({ phase: "分析結果を保存中", checked: stocks.length, total: stocks.length });
  await saveAnalysisCache(result);
  await notifyStrongAnalysisSignals(result.analyses).catch(() => {});
  return result;
}

async function analyzeSingleWatchStock(stock, options = {}, { notify = false } = {}) {
  const settings = await readSettings();
  const websiteLimit = clamp(Number(options.websiteLimit || settings.websiteLimit || defaultSettings.websiteLimit), 1, MAX_WEBSITE_LIMIT);
  const depthLimit = clamp(Number(options.depthLimit || settings.depthLimit || defaultSettings.depthLimit), 1, MAX_DEPTH_LIMIT);
  const pagesPerSite = clamp(Number(options.pagesPerSite || settings.pagesPerSite || defaultSettings.pagesPerSite), 1, MAX_PAGES_PER_SITE);
  const warnings = [];
  const systemWarnings = [];
  const [price, research] = await Promise.all([
    fetchPriceHistory(stock.symbol),
    researchStock(stock, { websiteLimit, depthLimit, pagesPerSite }),
  ]);
  if (research.warning) warnings.push(`${stock.name}: ${research.warning}`);
  const row = {
    stock,
    price,
    research,
    fallback: ruleBasedDecision(stock, price, research),
  };
  await translateResearchEvidenceRows([row]).catch(() => {});

  let aiDecision = null;
  const lmStatus = await checkLmStudio(settings).catch(() => ({ ok: false }));
  if (lmStatus.ok) {
    try {
      aiDecision = (await aiBatchDecisions([row]))[0] || null;
    } catch (error) {
      systemWarnings.push(`LM Studio: ${error.message || "分析が時間内に返りませんでした"}`);
    }
  }

  const withFinancials = await attachFinancialsToAnalyses([
    normalizeDecision(stock, price, research, aiDecision || row.fallback),
  ]);
  const analysis = (await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(withFinancials, settings)))[0];
  const previous = await readAnalysisCache();
  const result = {
    generatedAt: new Date().toISOString(),
    usedLmStudio: Boolean(aiDecision || previous.usedLmStudio),
    warnings: uniqueText([...systemWarnings, ...warnings, ...(previous.warnings || [])]).slice(0, 6),
    analyses: mergeAnalysisRows(previous.analyses, analysis),
    sectorEvidence: mergeSectorEvidence(previous.sectorEvidence, buildSectorEvidence([row])),
    analysis,
  };
  await saveAnalysisCache(result);
  if (notify) await notifyStrongAnalysisSignals([analysis]).catch(() => {});
  return result;
}

async function refreshUsPrices(options = {}) {
  const stocks = await readUsWatchlist();
  const settings = await readSettings();
  const previous = await readUsAnalysisCache();
  const previousBySymbol = new Map((previous.analyses || []).map((analysis) => [analysis.symbol, analysis]));
  const generatedAt = new Date().toISOString();
  const warnings = [];
  const rows = await mapLimit(stocks, 8, async (stock) => {
    const previousAnalysis = previousBySymbol.get(stock.symbol) || null;
    let priceError = "";
    const fetchedPrice = await fetchPriceHistory(stock.symbol, { timeout: QUICK_PRICE_HISTORY_TIMEOUT_MS }).catch((error) => {
      priceError = error.message || "価格を取得できませんでした";
      return emptyPrice();
    });
    const price = usablePrice(fetchedPrice) ? fetchedPrice : previousAnalysis?.price || fetchedPrice;
    if (!usablePrice(fetchedPrice)) {
      warnings.push(`${stock.name}: ${priceError || "最新価格を取得できなかったため保存済み価格を使いました"}`);
    }
    const row = {
      ...(previousAnalysis || {}),
      symbol: stock.symbol,
      name: stock.name,
      market: stock.market || previousAnalysis?.market || "NYSE",
      currency: "USD",
      holding: Boolean(stock.holding),
      notes: stock.notes || previousAnalysis?.notes || "",
      price: compactUsPrice(price),
      position: positionMetrics(stock, price),
      researchStats: previousAnalysis?.researchStats || { searched: 0 },
      evidence: previousAnalysis?.evidence || [],
      refreshedPriceOnlyAt: generatedAt,
    };
    row.ai = previousAnalysis?.ai ? { ...previousAnalysis.ai } : fallbackUsReview(row);
    row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
    applyUsEvidenceTranslations(row);
    return row;
  });
  const analyses = await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(rows, settings, { currency: "USD" }));
  const result = {
    generatedAt,
    currency: "USD",
    fastRefresh: true,
    usedLmStudio: Boolean(previous.usedLmStudio),
    warnings: uniqueText([...warnings, ...(previous.warnings || [])]).slice(0, 6),
    analyses,
    summary: usPortfolioSummary(analyses),
  };
  await saveUsAnalysisCache(result);
  return result;
}

async function analyzeUsHoldings(options = {}, { notify = false } = {}, onProgress = null) {
  const stocks = await readUsWatchlist();
  const settings = await readSettings();
  const recentPrices = options.reuseFreshPrices
    ? recentCachedPriceBySymbol(await readUsAnalysisCache())
    : new Map();
  const websiteLimit = clamp(Number(options.websiteLimit || settings.websiteLimit || defaultSettings.websiteLimit), 1, MAX_WEBSITE_LIMIT);
  const warnings = [];
  let checked = 0;
  onProgress?.({
    phase: "米国株の価格・ニュースを確認中",
    checked,
    total: stocks.length,
    aiDone: 0,
    aiCurrent: 0,
    aiTotal: 0,
  });
  const rows = await mapLimit(stocks, 4, async (stock) => {
    const cachedPrice = recentPrices.get(stock.symbol);
    const [price, rawFundamentals, research] = await Promise.all([
      cachedPrice ? Promise.resolve(cachedPrice) : fetchPriceHistory(stock.symbol),
      fetchUsFundamentals(stock.symbol).catch((error) => {
        warnings.push(`${stock.name}: ${error.message || "米国財務情報を取得できませんでした"}`);
        return normalizeUsFundamentals();
      }),
      researchUsStock(stock, { websiteLimit }),
    ]);
    if (research.warning) warnings.push(`${stock.name}: ${research.warning}`);
    const position = positionMetrics(stock, price);
    const fundamentals = enrichUsFundamentals(rawFundamentals, price);
    checked += 1;
    onProgress?.({ phase: "米国株の価格・ニュースを確認中", checked, total: stocks.length });
    return {
      symbol: stock.symbol,
      name: stock.name,
      market: stock.market || "NYSE",
      holding: Boolean(stock.holding),
      notes: stock.notes || "",
      price: compactUsPrice(price),
      fundamentals,
      position,
      researchStats: {
        searched: research.searched,
      },
      evidence: research.evidence,
      ai: null,
    };
  });
  const lmStatus = await checkLmStudio(settings).catch(() => ({ ok: false }));
  if (lmStatus.ok) {
    onProgress?.({
      phase: "LM Studioで米国ニュースを日本語要約中",
      checked,
      total: stocks.length,
      aiDone: 0,
      aiCurrent: 1,
      aiTotal: Math.ceil(rows.reduce((sum, row) => sum + (row.evidence || []).filter((item) => isMostlyEnglish(`${item.title || ""} ${item.originalSnippet || item.snippet || ""}`)).length, 0) / US_EVIDENCE_TRANSLATION_CHUNK_SIZE),
    });
    await translateUsEvidenceRows(rows).catch((error) => {
      warnings.push(`LM Studio: ${error.message || "米国ニュース翻訳が返りませんでした"}`);
      markUsEvidenceTranslationUnavailable(rows, error);
    });
  } else {
    markUsEvidenceTranslationUnavailable(rows, new Error("LM Studioに接続できませんでした"));
  }

  let usedLmStudio = rows.some((row) => (row.evidence || []).some((item) => item.translationMethod === "lm_studio"));
  if (lmStatus.ok && rows.length) {
    try {
      onProgress?.({
        phase: "LM Studioで米国株の売却見通しを整理中",
        checked,
        total: stocks.length,
        aiDone: 0,
        aiCurrent: 1,
        aiTotal: Math.ceil(rows.length / US_HOLDING_REVIEW_CHUNK_SIZE),
      });
      const reviews = await aiUsHoldingReviews(rows);
      const bySymbol = new Map(reviews.map((review) => [review.symbol, review]));
      rows.forEach((row) => {
        row.ai = bySymbol.get(row.symbol) || fallbackUsReview(row);
        row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
        applyUsEvidenceTranslations(row);
      });
      usedLmStudio = usedLmStudio || reviews.length > 0;
    } catch (error) {
      warnings.push(`LM Studio: ${error.message || "米国株AI分析が返りませんでした"}`);
      markUsEvidenceTranslationUnavailable(rows, error);
      rows.forEach((row) => {
        row.ai = fallbackUsReview(row);
        row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
        applyUsEvidenceTranslations(row);
      });
    }
  } else {
    rows.forEach((row) => {
      row.ai = fallbackUsReview(row);
      row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
      applyUsEvidenceTranslations(row);
    });
  }

  onProgress?.({ phase: "米国株の結果を保存中", checked: stocks.length, total: stocks.length });
  const analyses = await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses(rows, settings, { currency: "USD" }));
  const result = {
    generatedAt: new Date().toISOString(),
    currency: "USD",
    usedLmStudio,
    warnings,
    analyses,
    summary: usPortfolioSummary(analyses),
  };
  const previous = await readUsAnalysisCache();
  await saveUsAnalysisCache(result);
  if (notify) await notifyUsChangeSignals(result, previous).catch(() => {});
  return result;
}

async function analyzeCryptoHolding() {
  const holding = await readCryptoHolding();
  const [btcUsdRaw, usdJpyRaw] = await Promise.all([
    fetchPriceHistory("BTC-USD"),
    fetchPriceHistory("JPY=X"),
  ]);
  const btcJpyRaw = priceMetrics(combineBtcJpySeries(btcUsdRaw.series || [], usdJpyRaw.series || []), {
    shortName: "Bitcoin JPY",
    longName: "Bitcoin / Japanese Yen",
    symbol: "BTC-JPY",
  });
  const fxRate = nullablePositiveNumber(usdJpyRaw.current);
  const position = cryptoPositionMetrics(holding, btcUsdRaw, btcJpyRaw, fxRate);
  const timing = {
    usd: cryptoTradeTiming(btcUsdRaw, "USD"),
    jpy: cryptoTradeTiming(btcJpyRaw, "JPY"),
  };
  const fxTiming = cryptoTradeTiming(usdJpyRaw, "JPY");
  const result = {
    generatedAt: new Date().toISOString(),
    asset: "BTC",
    name: "Bitcoin",
    holding,
    btcUsd: compactCryptoPrice(btcUsdRaw, "USD"),
    btcJpy: compactCryptoPrice(btcJpyRaw, "JPY"),
    usdJpy: compactFxPrice(usdJpyRaw),
    position,
    timing,
    fxTiming,
    summary: cryptoPortfolioSummary(position),
  };
  await saveCryptoAnalysisCache(result);
  return result;
}

async function analyzeSingleUsStock(stock, options = {}, { notify = false } = {}) {
  const settings = await readSettings();
  const websiteLimit = clamp(Number(options.websiteLimit || settings.websiteLimit || defaultSettings.websiteLimit), 1, MAX_WEBSITE_LIMIT);
  const warnings = [];
  const [price, rawFundamentals, research] = await Promise.all([
    fetchPriceHistory(stock.symbol),
    fetchUsFundamentals(stock.symbol).catch((error) => {
      warnings.push(`${stock.name}: ${error.message || "米国財務情報を取得できませんでした"}`);
      return normalizeUsFundamentals();
    }),
    researchUsStock(stock, { websiteLimit }),
  ]);
  const fundamentals = enrichUsFundamentals(rawFundamentals, price);
  const row = {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market || "NYSE",
    holding: Boolean(stock.holding),
    notes: stock.notes || "",
    price: compactUsPrice(price),
    fundamentals,
    position: positionMetrics(stock, price),
    researchStats: {
      searched: research.searched,
    },
    evidence: research.evidence,
    ai: null,
  };

  if (research.warning) warnings.push(`${stock.name}: ${research.warning}`);
  const lmStatus = await checkLmStudio(settings).catch(() => ({ ok: false }));
  if (lmStatus.ok) {
    await translateUsEvidenceRows([row]).catch((error) => {
      warnings.push(`LM Studio: ${error.message || "米国ニュース翻訳が返りませんでした"}`);
      markUsEvidenceTranslationUnavailable([row], error);
    });
  } else {
    markUsEvidenceTranslationUnavailable([row], new Error("LM Studioに接続できませんでした"));
  }
  let usedLmStudio = (row.evidence || []).some((item) => item.translationMethod === "lm_studio");
  if (lmStatus.ok) {
    try {
      const review = (await aiUsHoldingReviews([row]))[0] || null;
      row.ai = review || fallbackUsReview(row);
      row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
      applyUsEvidenceTranslations(row);
      usedLmStudio = usedLmStudio || Boolean(review);
    } catch (error) {
      warnings.push(`LM Studio: ${error.message || "米国株AI分析が返りませんでした"}`);
      markUsEvidenceTranslationUnavailable([row], error);
      row.ai = fallbackUsReview(row);
      row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
      applyUsEvidenceTranslations(row);
    }
  } else {
    row.ai = fallbackUsReview(row);
    row.ai.growthExit = enforceRecentGrowthExit(row.ai.growthExit, { evidence: row.evidence }, row);
    applyUsEvidenceTranslations(row);
  }

  const previous = await readUsAnalysisCache();
  const rowWithExit = (await attachShareholderInfoToAnalyses(await attachExitPlansToAnalyses([row], settings, { currency: "USD" })))[0];
  const analyses = mergeAnalysisRows(previous.analyses, rowWithExit);
  const result = {
    generatedAt: new Date().toISOString(),
    currency: "USD",
    usedLmStudio: Boolean(usedLmStudio || previous.usedLmStudio),
    warnings: uniqueText([...warnings, ...(previous.warnings || [])]).slice(0, 6),
    analyses,
    summary: usPortfolioSummary(analyses),
    analysis: rowWithExit,
  };
  await saveUsAnalysisCache(result);
  if (notify) await notifyUsChangeSignals({ ...result, analyses: [rowWithExit] }, previous).catch(() => {});
  return result;
}

function applyUsEvidenceTranslations(row = {}) {
  const translations = row.ai?.evidenceJa || [];
  row.evidence = (row.evidence || []).map((item, index) => {
    const summary = cleanText(translations[index]?.summary || "");
    return normalizeUsEvidenceTranslationState({
      ...item,
      summaryJa: summary || item.summaryJa || "",
      translationMethod: summary ? "lm_studio" : item.translationMethod,
    });
  });
}

function markUsEvidenceTranslationUnavailable(rows = [], error = null) {
  const message = lmStudioTranslationError(error);
  rows.forEach((row) => {
    row.evidence = (row.evidence || []).map((item) => normalizeUsEvidenceTranslationState({
      ...item,
      translationMethod: item.translationMethod === "lm_studio" ? item.translationMethod : "untranslated",
      translationError: item.translationError || message,
    }));
  });
}

function lmStudioTranslationError(error = null) {
  const message = cleanText(error?.message || "");
  if (!message) return "LM Studio翻訳未完了です。";
  if (/aborted|timed out|timeout/i.test(message)) {
    return "LM Studio翻訳がまだ完了していません。設定で待ち時間を長めにするか、再実行してください。";
  }
  return `LM Studio翻訳未完了: ${message}`;
}

function shouldFallbackToLmStudioChat(error = null) {
  return /responses returned (404|400|422)/i.test(String(error?.message || ""));
}

async function translateUsEvidenceRows(rows = []) {
  const items = [];
  for (const row of rows) {
    for (const evidence of row.evidence || []) {
      const text = `${evidence.title || ""}\n${evidence.originalSnippet || evidence.snippet || ""}`;
      if (!isMostlyEnglish(text)) {
        evidence.titleJa ||= evidence.title || "";
        evidence.summaryJa ||= evidence.snippet || evidence.originalSnippet || "";
        evidence.translationMethod ||= containsJapanese(text) ? "source_ja" : "untranslated";
        continue;
      }
      items.push({
        evidence,
        title: evidence.title || "",
        snippet: evidence.originalSnippet || evidence.snippet || "",
        source: evidence.source || "",
      });
    }
  }
  if (!items.length) return;
  const model = await getLmStudioModel();
  const failures = [];
  for (const chunk of chunkArray(items, US_EVIDENCE_TRANSLATION_CHUNK_SIZE)) {
    await applyUsEvidenceTranslationChunk(model, chunk).catch(async (error) => {
      failures.push(error);
      for (const item of chunk) {
        await applyUsEvidenceTranslationChunk(model, [item]).catch((singleError) => {
          failures.push(singleError);
          item.evidence.translationMethod = "untranslated";
          item.evidence.translationError = lmStudioTranslationError(singleError);
        });
      }
    });
  }
  rows.forEach((row) => {
    row.evidence = (row.evidence || []).map(normalizeUsEvidenceTranslationState);
  });
  const translatedCount = items.filter((item) => item.evidence.translationMethod === "lm_studio").length;
  if (!translatedCount && failures.length) throw failures[0];
}

async function applyUsEvidenceTranslationChunk(model, chunk = []) {
  const translations = await translateUsEvidenceChunk(model, chunk);
  chunk.forEach((item, index) => {
    const target = item.evidence;
    const translation = translations[index];
    const titleJa = cleanText(translation?.titleJa || "");
    const summaryJa = cleanText(translation?.summaryJa || translation?.summary || "");
    if (!summaryJa || !containsJapanese(`${titleJa} ${summaryJa}`)) {
      target.translationMethod = "untranslated";
      target.translationError = "LM Studio翻訳が空、または日本語ではありませんでした。";
      return;
    }
    target.titleJa = titleJa || target.titleJa || "";
    target.summaryJa = summaryJa;
    target.translationMethod = "lm_studio";
    delete target.translationError;
    if (target.summaryJa) target.snippet = target.summaryJa;
  });
}

async function translateUsEvidenceChunk(model, items = []) {
  const prompt = [
    "/no_think",
    "英語の米国株ニュースを日本語に要約してください。投資助言ではなく記事内容だけ。",
    "JSONのみ: {\"items\":[{\"titleJa\":\"45字以内\",\"summaryJa\":\"90字以内\"}]}。入力と同じ順番・件数。",
    "古い日付や根拠が薄い場合はsummaryJaに短く含めてください。",
    "",
    JSON.stringify({
      items: items.map((item) => ({
        source: item.source,
        title: cleanText(item.title).slice(0, 140),
        snippet: cleanText(item.snippet).slice(0, 220),
      })),
    }),
  ].join("\n");
  const content = await callLmStudioResponses(model, prompt, {
    maxOutputTokens: 2200,
    timeoutMs: US_EVIDENCE_TRANSLATION_TIMEOUT_MS,
  }).catch(async (error) => {
    if (shouldFallbackToLmStudioChat(error)) return callLmStudioChat(model, prompt, { maxTokens: 2200, timeoutMs: US_EVIDENCE_TRANSLATION_TIMEOUT_MS });
    throw error;
  });
  const parsed = parseJsonObjectMatching(content, isUsEvidenceTranslationPayload);
  const rows = Array.isArray(parsed) ? parsed : parsed.items || [];
  return rows.slice(0, items.length).map((item) => ({
    titleJa: String(item?.titleJa || item?.title || "").slice(0, 80),
    summaryJa: String(item?.summaryJa || item?.summary || "").slice(0, 160),
  }));
}

function isUsEvidenceTranslationPayload(value) {
  const rows = Array.isArray(value) ? value : value?.items;
  return Array.isArray(rows) && rows.some((item) => (
    cleanText(item?.titleJa || "").length > 0 || cleanText(item?.summaryJa || "").length > 0
  ));
}

function normalizeUsEvidenceTranslationState(item = {}) {
  const titleJa = cleanText(item.titleJa || "");
  const summaryJa = cleanText(item.summaryJa || "");
  const titleWeak = isWeakUsEvidenceTitle(titleJa);
  const summaryWeak = isWeakUsEvidenceSummary(summaryJa);
  const originalText = `${item.title || ""} ${item.originalSnippet || item.snippet || ""}`;
  const inferredLmTranslation = item.translationMethod !== "source_ja"
    && !summaryWeak
    && containsJapanese(summaryJa)
    && isMostlyEnglish(originalText);
  const lmTranslated = (item.translationMethod === "lm_studio" || inferredLmTranslation)
    && !summaryWeak
    && containsJapanese(summaryJa);
  const sourceJapanese = !lmTranslated
    && !isMostlyEnglish(originalText)
    && containsJapanese(originalText);
  if (lmTranslated) {
    return {
      ...item,
      titleJa: titleWeak ? "" : titleJa,
      summaryJa,
      translationMethod: "lm_studio",
      translationError: "",
    };
  }
  if (sourceJapanese) {
    return {
      ...item,
      titleJa: titleWeak ? cleanText(item.title || "") : titleJa,
      summaryJa: summaryWeak ? cleanText(item.snippet || item.originalSnippet || "") : summaryJa,
      translationMethod: "source_ja",
      translationError: "",
    };
  }
  return {
    ...item,
    titleJa: "",
    summaryJa: "",
    translationMethod: "untranslated",
    translationError: item.translationError || "LM Studioで再分析すると日本語要約を作ります。",
  };
}

function isWeakUsEvidenceTitle(value = "") {
  const text = cleanText(value);
  if (!text) return true;
  return /^米国ニュース[:：]/.test(text) || /^US news[:：]/i.test(text);
}

function isWeakUsEvidenceSummary(value = "") {
  const text = cleanText(value);
  if (!text) return true;
  return /LM Studio接続時|記事を取得しました|に関する内容です|リンクで原文を確認/.test(text);
}

async function researchUsStock(stock, options = {}) {
  const limit = clamp(Number(options.websiteLimit || 5), 1, 20);
  const searchLimit = Math.max(limit * 2, 8);
  const [yahooNews, searchedNews] = await Promise.all([
    fetchYahooFinanceSearchNews(stock, searchLimit).catch(() => []),
    searchUsFinanceNews(stock, searchLimit).catch(() => []),
  ]);
  const evidence = uniqueBy([...yahooNews, ...searchedNews]
    .filter((item) => isUsFinanceNewsEvidence(item, stock))
    .sort((a, b) => usFinanceNewsScore(b, stock) - usFinanceNewsScore(a, stock)), (item) => canonicalNewsUrl(item.url))
    .slice(0, limit)
    .map((item) => toUsEvidence(item, stock));
  return {
    searched: evidence.length,
    evidence,
    warning: evidence.length ? "" : "米国金融ニュースを取得できませんでした",
  };
}

async function fetchYahooFinanceSearchNews(stock, limit = 8) {
  const symbol = normalizeUsSymbol(stock.symbol);
  if (!symbol) return [];
  const url = new URL("https://query2.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", symbol);
  url.searchParams.set("quotesCount", "0");
  url.searchParams.set("newsCount", String(Math.min(Math.max(limit, 4), 20)));
  url.searchParams.set("region", "US");
  url.searchParams.set("lang", "en-US");
  const response = await fetchWithTimeout(url, {
    timeout: 8000,
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 Stock Signal",
    },
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return (data?.news || []).map((item) => ({
    title: cleanText(item.title || ""),
    url: normalizeUrl(item.link || item.url || ""),
    snippet: cleanText(item.summary || item.publisher || ""),
    publishedDate: item.providerPublishTime
      ? new Date(Number(item.providerPublishTime) * 1000).toISOString().slice(0, 10)
      : searchResultPublishedDate(item),
    source: hostOf(item.link || item.url || ""),
    relatedTickers: asStringArray(item.relatedTickers),
  })).filter((item) => item.title && item.url);
}

async function searchUsFinanceNews(stock, limit = 8) {
  const queries = usFinanceNewsQueries(stock);
  const rssPages = await mapLimit(queries, 2, async (query) => (
    fetchGoogleNewsUsRss(stock, limit, query).catch(() => [])
  ));
  return uniqueBy(rssPages.flat(), (item) => canonicalNewsUrl(item.url))
    .map((item) => ({
      ...item,
      source: item.source || hostOf(item.sourceUrl || item.url),
      publishedDate: item.publishedDate || searchResultPublishedDate(item),
    }));
}

async function searchUsCandidateEvidence(candidate = {}, limit = 8) {
  const research = await researchUsStock({
    symbol: normalizeUsSymbol(candidate.symbol),
    name: candidate.name || candidate.symbol,
    market: candidate.market || "NYSE",
  }, { websiteLimit: limit });
  return (research.evidence || []).map((item, index) => ({
    title: item.title,
    url: item.url,
    sourceUrl: item.sourceUrl,
    snippet: item.originalSnippet || item.snippet || item.summaryJa || "",
    publishedDate: item.publishedDate,
    rank: index + 1,
  }));
}

function usFinanceNewsQueries(stock = {}) {
  const symbol = normalizeUsSymbol(stock.symbol);
  const name = cleanText(stock.name || symbol);
  const nameQuery = name && !name.toLowerCase().includes(symbol.toLowerCase())
    ? `"${name}" ${symbol}`
    : symbol;
  return [
    `${nameQuery} stock earnings guidance analyst site:finance.yahoo.com`,
    `${nameQuery} stock earnings guidance outlook site:seekingalpha.com`,
    `${nameQuery} shares revenue margin dividend site:marketwatch.com`,
    `${nameQuery} price target results analyst site:barrons.com`,
    `${nameQuery} stock news revenue outlook site:cnbc.com`,
  ].filter(Boolean);
}

async function fetchGoogleNewsUsRss(stock, limit = 8, queryOverride = "") {
  const symbol = normalizeUsSymbol(stock.symbol);
  if (!symbol) return [];
  const name = cleanText(stock.name || symbol);
  const query = queryOverride || (name && !name.toLowerCase().includes(symbol.toLowerCase())
    ? `"${name}" ${symbol} stock earnings guidance analyst`
    : `${symbol} stock earnings guidance analyst`);
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  const response = await fetchWithTimeout(url, {
    timeout: 10000,
    headers: { accept: "application/rss+xml,text/xml;q=0.9,*/*;q=0.8" },
  });
  if (!response.ok) return [];
  const xml = await response.text();
  return parseGoogleNewsRssItems(xml).slice(0, Math.max(limit * 4, 20));
}

function parseGoogleNewsRssItems(xml = "") {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[1] || "";
    const titleRaw = xmlDecode(extractXmlTag(block, "title"));
    const link = normalizeUrl(xmlDecode(extractXmlTag(block, "link")));
    const description = htmlToText(xmlDecode(extractXmlTag(block, "description")));
    const pubDate = xmlDecode(extractXmlTag(block, "pubDate"));
    const sourceMatch = block.match(/<source\b[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
    const sourceUrl = normalizeUrl(xmlDecode(sourceMatch?.[1] || ""));
    const publisher = cleanText(xmlDecode(sourceMatch?.[2] || ""));
    const title = publisher
      ? cleanText(titleRaw.replace(new RegExp(`\\s+-\\s+${escapeRegExp(publisher)}$`, "i"), ""))
      : cleanText(titleRaw);
    items.push({
      title,
      url: link,
      sourceUrl,
      source: hostOf(sourceUrl) || publisher || hostOf(link),
      snippet: description,
      publishedDate: normalizeSearchDate(pubDate),
    });
  }
  return items.filter((item) => item.title && item.url);
}

function extractXmlTag(xml = "", tag = "") {
  const match = xml.match(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "i"));
  return match?.[1] || "";
}

function xmlDecode(value = "") {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function toUsEvidence(item = {}, stock = {}) {
  const original = cleanText(item.snippet || item.summary || "").slice(0, 360);
  const sourceUrl = normalizeUrl(item.sourceUrl);
  return {
    title: cleanText(item.title || "").slice(0, 180),
    url: normalizeUrl(item.url),
    sourceUrl,
    symbol: stock.symbol,
    name: stock.name,
    source: hostOf(sourceUrl || item.url),
    snippet: original,
    originalSnippet: original,
    summaryJa: "",
    publishedDate: normalizeDate(item.publishedDate) || searchResultPublishedDate(item),
    kind: "web",
  };
}

function isUsFinanceNewsEvidence(item = {}, stock = {}) {
  const url = normalizeUrl(item.url);
  const sourceUrl = normalizeUrl(item.sourceUrl);
  if (!url || isBlockedUsNewsUrl(url) || (sourceUrl && isBlockedUsNewsUrl(sourceUrl))) return false;
  if (!usFinanceNewsSourceRank(url, sourceUrl)) return false;
  if (!usEvidenceMentionsStock(item, stock)) return false;
  if (isStaleUsNews(item, US_NEWS_MAX_AGE_DAYS)) return false;
  const text = cleanText(`${item.title || ""} ${item.snippet || ""} ${url}`).toLowerCase();
  if (/wikipedia|linkedin|careers?|jobs?|login|sign in|company profile|corporate page/.test(text)) return false;
  return true;
}

function isBlockedUsNewsUrl(value = "") {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathText = decodeURIComponent(url.pathname || "").toLowerCase();
    if (US_NEWS_BLOCKED_HOSTS.some((blocked) => domainMatches(host, blocked))) return true;
    if (/\/(?:careers?|jobs?|job-search|recruit|login|signin|signup|account|about|company|wiki)(?:\/|$)/i.test(pathText)) return true;
    if (host === "finance.yahoo.com" && /^\/quote\/[^/]+\/?(?:news)?\/?$/.test(pathText)) return true;
    return false;
  } catch {
    return true;
  }
}

function usEvidenceMentionsStock(item = {}, stock = {}) {
  const symbol = normalizeUsSymbol(stock.symbol);
  const text = cleanText(`${item.title || ""} ${item.snippet || ""} ${item.url || ""}`).toLowerCase();
  if (symbol) {
    const escaped = escapeRegExp(symbol.toLowerCase());
    const dashVariant = escapeRegExp(symbol.toLowerCase().replace(".", "-"));
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text) || new RegExp(`\\b${dashVariant}\\b`, "i").test(text)) return true;
  }
  const words = cleanText(stock.name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
    .filter((word) => !["inc", "corp", "corporation", "company", "limited", "holdings", "group", "plc"].includes(word));
  return words.length ? words.every((word) => text.includes(word)) : false;
}

function isStaleUsNews(item = {}, maxAgeDays = US_NEWS_MAX_AGE_DAYS) {
  const publishedDate = normalizeDate(item.publishedDate) || searchResultPublishedDate(item);
  if (!publishedDate) return false;
  const time = new Date(`${publishedDate}T00:00:00`).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time > maxAgeDays * 86400000;
}

function usFinanceNewsScore(item = {}, stock = {}) {
  let score = usFinanceNewsSourceRank(item.url, item.sourceUrl);
  const publishedDate = normalizeDate(item.publishedDate) || searchResultPublishedDate(item);
  if (publishedDate) {
    const ageDays = Math.max(0, Math.floor((Date.now() - new Date(`${publishedDate}T00:00:00`).getTime()) / 86400000));
    score += Math.max(0, 36 - ageDays);
  } else {
    score -= 12;
  }
  const text = cleanText(`${item.title || ""} ${item.snippet || ""}`).toLowerCase();
  const keywordHits = US_NEWS_KEYWORDS.filter((word) => text.includes(word)).length;
  score += Math.min(24, keywordHits * 4);
  if (usEvidenceMentionsStock(item, stock)) score += 10;
  return score;
}

function usFinanceNewsSourceRank(value = "", sourceUrl = "") {
  const host = hostOf(sourceUrl || value).toLowerCase();
  for (const [domain, rank] of US_FINANCE_NEWS_SOURCES) {
    if (domain === "finance.yahoo.com" ? host === domain : domainMatches(host, domain)) return rank;
  }
  return 0;
}

function domainMatches(host = "", domain = "") {
  const cleanHost = String(host || "").replace(/^www\./, "").toLowerCase();
  const cleanDomain = String(domain || "").replace(/^www\./, "").toLowerCase();
  return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
}

function canonicalNewsUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|guccounter|fbclid|gclid|ocid|smid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return normalizeUrl(value);
  }
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function aiUsHoldingReviews(rows = []) {
  const model = await getLmStudioModel();
  const reviews = [];
  const chunks = chunkArray(rows, US_HOLDING_REVIEW_CHUNK_SIZE);
  for (const chunk of chunks) {
    reviews.push(...(await aiUsHoldingReviewChunk(model, chunk)));
  }
  return reviews;
}

async function aiUsHoldingReviewChunk(model, rows = []) {
  const items = rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    holding: row.holding,
    notes: row.notes,
    price: row.price,
    fundamentals: row.fundamentals,
    position: {
      purchasePrice: row.position.purchasePrice,
      quantity: row.position.quantity,
      grossQuantity: row.position.grossQuantity,
      soldQuantity: row.position.soldQuantity,
      invested: row.position.invested,
      grossInvested: row.position.grossInvested,
      marketValue: row.position.marketValue,
      pnlAmount: row.position.pnlAmount,
      pnlPct: row.position.pnlPct,
      realizedPnlAmount: row.position.realizedPnlAmount,
      unrealizedPnlAmount: row.position.unrealizedPnlAmount,
      unrealizedPnlPct: row.position.unrealizedPnlPct,
      dividendReceived: row.position.dividendReceived,
      annualDividendEstimate: row.position.annualDividendEstimate,
      totalReturnAmount: row.position.totalReturnAmount,
      totalReturnPct: row.position.totalReturnPct,
      holdingDays: row.position.holdingDays,
    },
    evidence: row.evidence.slice(0, 3).map((item) => ({
      title: cleanText(item.title || "").slice(0, 140),
      source: item.source,
      url: item.url,
      publishedDate: item.publishedDate || "",
      snippet: cleanText(item.summaryJa || item.originalSnippet || item.snippet || "").slice(0, 180),
    })),
  }));
  const prompt = [
    "/no_think",
    "あなたは米国株の保有確認AIです。候補探索はしません。保有銘柄について、損益とニュース材料を日本語で短く整理してください。",
    "英語記事のsnippetは日本語に要約してください。残株数、売却済み株数、確定損益、含み損益、受取配当、年間配当目安、配当込み損益を分けて読み、財務サマリーのPER、EPS、売上成長、利益率、ROE、負債水準、次回決算も確認してください。",
    "利益保証をせず、保有継続の確認材料と注意点を分けてください。財務データが不足している場合は、不足を注意点にしてください。",
    "出力はJSONのみ。形式は {\"reviews\":[{\"symbol\":\"ACN\",\"stance\":\"HOLD\",\"confidence\":60,\"summaryJa\":\"...\",\"good\":[\"...\"],\"risks\":[\"...\"],\"evidenceJa\":[{\"titleJa\":\"...\",\"source\":\"...\",\"summary\":\"...\"}],\"changeLevel\":\"normal\",\"growthExit\":{\"level\":\"normal|watch|exit_alert\",\"reason\":\"...\",\"signals\":[\"...\"],\"evidence\":[{\"title\":\"...\",\"source\":\"...\",\"url\":\"...\",\"publishedDate\":\"YYYY-MM-DD\",\"summary\":\"...\"}]},\"sellForecast\":{\"horizon\":\"1-3か月|3-6か月|決算後|未定\",\"targetPrice\":123.45,\"reviewPrice\":111.11,\"timing\":\"...\",\"reason\":\"...\",\"confidence\":60,\"catalysts\":[\"...\"]}}]}。",
    "stanceは HOLD, REVIEW, EXIT_WATCH, DATA_NEEDED のいずれか。changeLevelは normal, watch, important のいずれか。",
    "NVIDIAのような10倍候補は20〜30%の株価下落だけではEXITにしません。売上成長の鈍化、guidanceがconsensusを下回る、需要・粗利・受注の構造悪化、成長投資テーマの破綻など、買った根拠が崩れた時だけgrowthExit.levelをexit_alertにしてください。",
    `growthExit.exit_alertはpublishedDateが過去${FUNDAMENTAL_EXIT_MAX_AGE_DAYS}日以内の根拠がある時だけにしてください。日付不明、古い記事、過去の歴史記事は売りアラートの根拠にしないでください。`,
    "summaryJaは90字以内、goodとrisksは各3件まで、evidenceJaのsummaryは各80字以内にしてください。growthExit.evidenceは根拠にした記事や開示だけを最大3件入れてください。",
    "sellForecastは保有中か残株がある銘柄だけに出してください。ニュース、決算、過去3年の価格、保有単価、トレーリングストップを合わせ、売却を検討する価格帯と時期を出してください。根拠が薄ければtargetPrice/null、horizon/未定。",
    "",
    JSON.stringify({ asOfDate: new Date().toISOString().slice(0, 10), stocks: items }),
  ].join("\n");
  const content = await callLmStudioResponses(model, prompt, {
    maxOutputTokens: 3500,
    timeoutMs: US_HOLDING_REVIEW_TIMEOUT_MS,
  }).catch(async (error) => {
    if (shouldFallbackToLmStudioChat(error)) {
      return callLmStudioChat(model, prompt, { maxTokens: 3500, timeoutMs: US_HOLDING_REVIEW_TIMEOUT_MS });
    }
    throw error;
  });
  const parsed = parseJsonObjectMatching(content, isUsHoldingReviewPayload);
  const reviews = Array.isArray(parsed) ? parsed : parsed.reviews || [];
  return reviews
    .filter((review) => review?.symbol)
    .map((review) => ({
      symbol: normalizeUsSymbol(review.symbol),
      stance: String(review.stance || "DATA_NEEDED").toUpperCase(),
      confidence: clamp(Number(review.confidence || 50), 0, 100),
      summaryJa: String(review.summaryJa || review.summary || "").slice(0, 180),
      good: asStringArray(review.good || review.reasons).slice(0, 3),
      risks: asStringArray(review.risks).slice(0, 3),
      evidenceJa: Array.isArray(review.evidenceJa) ? review.evidenceJa.map((item) => ({
        titleJa: String(item.titleJa || item.title || "").slice(0, 100),
        source: String(item.source || ""),
        summary: String(item.summary || item.summaryJa || "").slice(0, 140),
      })).slice(0, 5) : [],
      changeLevel: ["normal", "watch", "important"].includes(String(review.changeLevel || "").toLowerCase())
        ? String(review.changeLevel).toLowerCase()
        : "normal",
      growthExit: normalizeGrowthExit(review.growthExit),
      sellForecast: normalizeSellForecast(review.sellForecast),
    }))
    .filter((review) => review.symbol);
}

function isUsHoldingReviewPayload(value) {
  const rows = Array.isArray(value) ? value : value?.reviews;
  return Array.isArray(rows) && rows.some((item) => (
    normalizeUsSymbol(item?.symbol || "")
    && (item?.summaryJa || item?.summary || item?.stance || item?.growthExit)
  ));
}

async function translateResearchEvidenceRows(rows = []) {
  const items = [];
  for (const row of rows) {
    for (const evidence of row.research?.evidence || []) {
      const text = `${evidence.title || ""}\n${evidence.snippet || ""}`;
      if (!isMostlyEnglish(text)) continue;
      items.push({ evidence, title: evidence.title || "", snippet: evidence.snippet || "", source: evidence.source || "" });
    }
  }
  if (!items.length) return;
  const model = await getLmStudioModel();
  for (const chunk of chunkArray(items, 8)) {
    const translations = await translateEvidenceChunk(model, chunk).catch(() => []);
    translations.forEach((translation, index) => {
      const target = chunk[index]?.evidence;
      if (!target || !translation) return;
      target.summaryJa = translation;
      target.snippet = translation;
    });
  }
}

async function translateEvidenceChunk(model, items = []) {
  const prompt = [
    "英語の株式ニュース断片を、日本語で短く要約してください。",
    "出力はJSONのみ。形式は {\"items\":[\"日本語要約\", \"...\"]}。入力と同じ順番、同じ件数で返してください。",
    "各要約は80字以内。投資助言ではなく、記事の内容だけを訳して要約してください。",
    "",
    JSON.stringify({
      items: items.map((item) => ({
        source: item.source,
        title: cleanText(item.title).slice(0, 160),
        snippet: cleanText(item.snippet).slice(0, 280),
      })),
    }),
  ].join("\n");
  const content = await callLmStudioResponses(model, prompt, { maxOutputTokens: 1800 }).catch(async (error) => {
    if (String(error.message || "").includes("404")) return callLmStudioChat(model, prompt, { maxTokens: 1800 });
    throw error;
  });
  const parsed = parseJsonObject(content);
  return asStringArray(Array.isArray(parsed) ? parsed : parsed.items).slice(0, items.length);
}

function isMostlyEnglish(value = "") {
  const text = cleanText(value);
  if (!text || /[ぁ-んァ-ン一-龥]/.test(text)) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters >= 20 && letters / Math.max(1, text.length) > 0.35;
}

function fallbackUsReview(row = {}) {
  const position = row.position || {};
  const price = row.price || {};
  const fundamentals = row.fundamentals || {};
  const risks = [];
  const good = [];
  let stance = "DATA_NEEDED";
  let changeLevel = "normal";
  if (Number.isFinite(position.pnlPct)) {
    if (position.pnlPct >= 20) {
      stance = "HOLD";
      good.push(`含み益が${position.pnlPct.toFixed(1)}%あります`);
    } else if (position.pnlPct <= -15) {
      stance = "REVIEW";
      risks.push(`含み損が${Math.abs(position.pnlPct).toFixed(1)}%あります`);
      changeLevel = "watch";
    } else {
      stance = "HOLD";
    }
  }
  if (Number.isFinite(price.return1m)) {
    if (price.return1m <= -10) {
      risks.push(`直近1か月で${Math.abs(price.return1m).toFixed(1)}%下落`);
      changeLevel = "watch";
    } else if (price.return1m >= 10) {
      good.push(`直近1か月で${price.return1m.toFixed(1)}%上昇`);
    }
  }
  if (Number.isFinite(fundamentals.revenueGrowthPct)) {
    if (fundamentals.revenueGrowthPct >= 8) {
      good.push(`売上成長が${fundamentals.revenueGrowthPct.toFixed(1)}%あります`);
    } else if (fundamentals.revenueGrowthPct < 0) {
      risks.push(`売上成長が${fundamentals.revenueGrowthPct.toFixed(1)}%です`);
      changeLevel = "watch";
    }
  }
  if (Number.isFinite(fundamentals.profitMarginPct)) {
    if (fundamentals.profitMarginPct >= 15) {
      good.push(`純利益率が${fundamentals.profitMarginPct.toFixed(1)}%あります`);
    } else if (fundamentals.profitMarginPct <= 0) {
      risks.push("純利益率がマイナスです");
      changeLevel = "watch";
    }
  }
  if (Number.isFinite(fundamentals.trailingPe) && fundamentals.trailingPe >= 60) {
    risks.push(`PERが${fundamentals.trailingPe.toFixed(1)}倍で高めです`);
  }
  return {
    symbol: row.symbol,
    stance,
    confidence: 45,
    summaryJa: Number.isFinite(position.pnlPct)
      ? `現在の損益は${formatSignedPercent(position.pnlPct)}です。ニュース材料は追加確認が必要です。`
      : "購入明細を入れるとドルベースの損益を確認できます。",
    good: uniqueText(good).slice(0, 3),
    risks: uniqueText(risks).slice(0, 3),
    evidenceJa: (row.evidence || []).slice(0, 5).map((item) => ({
      source: item.source,
      summary: item.summaryJa || item.snippet || item.originalSnippet || "",
    })),
    changeLevel,
    growthExit: { level: "normal", reason: "ファンダ崩壊を示す材料は未検出です。", signals: [] },
    sellForecast: ruleSellForecast(row, "USD"),
  };
}

function compactUsPrice(price = {}) {
  return {
    current: price.current,
    return1m: price.return1m,
    return3m: price.return3m,
    return6m: price.return6m,
    return1y: price.return1y,
    return3y: price.return3y,
    annualizedReturn3y: price.annualizedReturn3y,
    high52: price.high52,
    high52Date: price.high52Date,
    low52: price.low52,
    high3y: price.high3y,
    high3yDate: price.high3yDate,
    low3y: price.low3y,
    distanceFromHigh52: price.distanceFromHigh52,
    distanceFromLow52: price.distanceFromLow52,
    distanceFromHigh3y: price.distanceFromHigh3y,
    distanceFromLow3y: price.distanceFromLow3y,
    maxDrawdown3y: price.maxDrawdown3y,
    trendPrice3y: price.trendPrice3y,
    distanceFromTrend3y: price.distanceFromTrend3y,
    trend3y: price.trend3y,
    buyLine1y: price.buyLine1y,
    deepBuyLine1y: price.deepBuyLine1y,
    distanceFromBuyLine1y: price.distanceFromBuyLine1y,
    buyTiming1y: price.buyTiming1y,
    low1y: price.low1y,
    low1yDate: price.low1yDate,
    dividendPerShareTtm: price.dividendPerShareTtm,
    dividendYield: price.dividendYield,
    dividendChangePct: price.dividendChangePct,
    dividendLastDate: price.dividendLastDate,
    dividendLastAmount: price.dividendLastAmount,
    dividendEvents: price.dividendEvents,
    logReturn1d: price.logReturn1d,
    histVol20: price.histVol20,
    atr14: price.atr14,
    atrPct: price.atrPct,
    sma5: price.sma5,
    sma5CrossUp: Boolean(price.sma5CrossUp),
    rsi14: price.rsi14,
    rsiCross30: Boolean(price.rsiCross30),
    candlestickSignal: price.candlestickSignal || null,
    technicalEntry: price.technicalEntry || technicalEntryFallback(),
    regime: price.regime || null,
    shortName: price.shortName,
    longName: price.longName,
    yahooSymbol: price.yahooSymbol,
    series: price.series || [],
  };
}

function compactCryptoPrice(price = {}, currency = "USD") {
  return {
    ...compactUsPrice(price),
    currency,
  };
}

function compactFxPrice(price = {}) {
  return {
    current: price.current,
    return1m: price.return1m,
    return3m: price.return3m,
    return6m: price.return6m,
    return1y: price.return1y,
    return3y: price.return3y,
    high52: price.high52,
    low52: price.low52,
    high3y: price.high3y,
    low3y: price.low3y,
    trendPrice3y: price.trendPrice3y,
    distanceFromTrend3y: price.distanceFromTrend3y,
    trend3y: price.trend3y,
    buyLine1y: price.buyLine1y,
    distanceFromBuyLine1y: price.distanceFromBuyLine1y,
    logReturn1d: price.logReturn1d,
    histVol20: price.histVol20,
    atr14: price.atr14,
    atrPct: price.atrPct,
    sma5: price.sma5,
    sma5CrossUp: Boolean(price.sma5CrossUp),
    rsi14: price.rsi14,
    rsiCross30: Boolean(price.rsiCross30),
    candlestickSignal: price.candlestickSignal || null,
    technicalEntry: price.technicalEntry || technicalEntryFallback(),
    regime: price.regime || null,
    shortName: price.shortName,
    longName: price.longName,
    yahooSymbol: price.yahooSymbol,
    pair: "USD/JPY",
    currency: "JPY",
    series: price.series || [],
  };
}

function cryptoTradeTiming(price = {}, currency = "USD") {
  const current = nullablePositiveNumber(price.current);
  if (!current) {
    return {
      buy: { label: "価格待ち", line: null, summary: "価格データ取得後に買うタイミングを出します。", checks: ["価格データ待ち"] },
      sell: { label: "価格待ち", line: null, stopLine: null, summary: "価格データ取得後に売るタイミングを出します。", checks: ["価格データ待ち"] },
    };
  }
  const buyLine = nullablePositiveNumber(price.buyLine1y) || current * 0.82;
  const deepLine = nullablePositiveNumber(price.deepBuyLine1y) || buyLine * 0.92;
  const trendPrice = nullablePositiveNumber(price.trendPrice3y);
  const high52 = nullablePositiveNumber(price.high52);
  const gapFromBuy = buyLine ? ((current - buyLine) / buyLine) * 100 : null;
  const checks = [];
  if (Number.isFinite(gapFromBuy)) {
    if (gapFromBuy <= -4) checks.push("買い場ラインを下回る");
    else if (gapFromBuy <= 3) checks.push("買い場ラインに近い");
    else checks.push("買い場ラインより高い");
  }
  if (trendPrice) {
    const trendGap = ((current - trendPrice) / trendPrice) * 100;
    if (trendGap <= 0) checks.push("3年トレンドより安い");
    else if (trendGap <= 15) checks.push("3年トレンドから大きく離れていない");
    else checks.push("3年トレンドより高い");
  }
  if (Number.isFinite(price.return3m)) {
    if (price.return3m >= 35) checks.push("短期で急騰気味");
    else if (price.return3m <= -12) checks.push("直近は押し目");
    else checks.push("短期は中立");
  }

  let buyLabel = "押し目待ち";
  let buySummary = `買うなら ${formatMoney(buyLine, currency)} 以下を目安にします。直近は ${formatMoney(current, currency)} なので、まだ追わずに待つ位置です。`;
  if (current <= deepLine) {
    buyLabel = "分割で検討";
    buySummary = `直近は過去1年のかなり安い側です。${formatMoney(deepLine, currency)} 近辺以下なら、急落理由を確認しつつ分割で検討します。`;
  } else if (current <= buyLine) {
    buyLabel = "買い場";
    buySummary = `直近は買い場ライン以下です。${formatMoney(buyLine, currency)} 以下なら、反発の兆しを見ながら検討しやすい位置です。`;
  } else if (current <= buyLine * 1.05) {
    buyLabel = "近い";
    buySummary = `直近は買い場ラインに近いです。${formatMoney(buyLine, currency)} まで待つか、少額で分けて入る候補です。`;
  }

  const sellLine = Math.max(
    current * 1.12,
    high52 ? high52 * 0.96 : 0,
    trendPrice ? trendPrice * 1.25 : 0,
    buyLine * 1.35,
  );
  const stopLine = Math.max(1, Math.min(buyLine * 0.88, current * 0.82));
  const gapFromSell = sellLine ? ((sellLine - current) / current) * 100 : null;
  let sellLabel = "上振れ待ち";
  let sellSummary = `${formatMoney(sellLine, currency)} 前後は利益確定・売却検討ラインです。${formatMoney(stopLine, currency)} を割る場合は、下落理由を再確認します。`;
  if (Number.isFinite(gapFromSell) && gapFromSell <= 0) {
    sellLabel = "利益確定検討";
    sellSummary = `売り場ラインに到達しています。保有量がある場合は、利益確定か一部売却を検討する位置です。`;
  } else if (Number.isFinite(gapFromSell) && gapFromSell <= 8) {
    sellLabel = "利益確定準備";
    sellSummary = `売り場ラインが近いです。${formatMoney(sellLine, currency)} 付近では欲張らず一部利益確定を検討します。`;
  }

  return {
    buy: {
      label: buyLabel,
      line: roundMoney(buyLine, currency),
      deepLine: roundMoney(deepLine, currency),
      currentGapPct: Number.isFinite(gapFromBuy) ? gapFromBuy : null,
      summary: buySummary,
      checks: uniqueText(checks).slice(0, 4),
    },
    sell: {
      label: sellLabel,
      line: roundMoney(sellLine, currency),
      stopLine: roundMoney(stopLine, currency),
      currentGapPct: Number.isFinite(gapFromSell) ? gapFromSell : null,
      summary: sellSummary,
      checks: uniqueText([
        high52 ? "52週高値に近い位置を利益確定目安に含める" : "",
        trendPrice ? "3年トレンドから上振れた位置を売り場に含める" : "",
        "買い場ライン割れは確認ラインに使う",
      ].filter(Boolean)).slice(0, 4),
    },
  };
}

function roundMoney(value, currency = "JPY") {
  if (!Number.isFinite(value)) return null;
  return currency === "USD"
    ? Math.round(value * 100) / 100
    : Math.round(value);
}

async function fetchUsFundamentals(symbol) {
  const info = await secTickerInfo(symbol);
  if (!info) return normalizeUsFundamentals();
  const facts = await fetchSecCompanyFacts(info.cik).catch(() => null);
  if (!facts?.facts) return normalizeUsFundamentals();
  return normalizeUsFundamentalsFromSec(symbol, info, facts);
}

async function secTickerInfo(symbol) {
  const ticker = normalizeUsSymbol(symbol);
  if (!ticker) return null;
  const tickers = await fetchSecCompanyTickers();
  return tickers.find((item) => item.ticker === ticker) || null;
}

async function fetchSecCompanyTickers() {
  if (secCompanyTickerCache) return secCompanyTickerCache;
  const response = await fetchWithTimeout("https://www.sec.gov/files/company_tickers.json", {
    timeout: 12000,
    headers: secHeaders(),
  });
  if (!response.ok) throw new Error(`SEC tickers returned ${response.status}`);
  const data = await response.json().catch(() => ({}));
  secCompanyTickerCache = Object.values(data)
    .map((item) => ({
      cik: String(item.cik_str || "").padStart(10, "0"),
      ticker: normalizeUsSymbol(item.ticker),
      title: cleanText(item.title || ""),
    }))
    .filter((item) => item.cik && item.ticker);
  return secCompanyTickerCache;
}

async function fetchSecCompanyFacts(cik) {
  const response = await fetchWithTimeout(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    timeout: 15000,
    headers: secHeaders(),
  });
  if (!response.ok) throw new Error(`SEC companyfacts returned ${response.status}`);
  return response.json();
}

function secHeaders() {
  return {
    accept: "application/json",
    "user-agent": process.env.SEC_USER_AGENT || "StockSignal local app contact: local@example.com",
  };
}

function normalizeUsFundamentalsFromSec(symbol, info, facts) {
  const revenueValues = conceptValues(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], ["USD"])
    .filter(isAnnualFact)
    .sort(compareFactDesc);
  const revenue = revenueValues[0] || null;
  const previousRevenue = revenueValues.find((item) => item.fy !== revenue?.fy && item.end !== revenue?.end) || null;
  const grossProfit = latestAnnualFact(facts, ["GrossProfit"], ["USD"]);
  const operatingIncome = latestAnnualFact(facts, ["OperatingIncomeLoss"], ["USD"]);
  const netIncome = latestAnnualFact(facts, ["NetIncomeLoss", "ProfitLoss"], ["USD"]);
  const eps = latestAnnualFact(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], ["USD/shares"]);
  const cash = latestInstantFact(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], ["USD"]);
  const assets = latestInstantFact(facts, ["Assets"], ["USD"]);
  const assetsCurrent = latestInstantFact(facts, ["AssetsCurrent"], ["USD"]);
  const liabilities = latestInstantFact(facts, ["Liabilities"], ["USD"]);
  const liabilitiesCurrent = latestInstantFact(facts, ["LiabilitiesCurrent"], ["USD"]);
  const equity = latestInstantFact(facts, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], ["USD"]);
  const shares = latestInstantFact(facts, ["EntityCommonStockSharesOutstanding", "CommonStocksIncludingAdditionalPaidInCapital"], ["shares"]);

  return normalizeUsFundamentals({
    source: "SEC companyfacts",
    fetchedAt: new Date().toISOString(),
    symbol: normalizeUsSymbol(symbol),
    companyName: info.title || facts.entityName || "",
    cik: info.cik,
    revenue: revenue?.value,
    previousRevenue: previousRevenue?.value,
    revenueGrowthPct: safePercentChange(revenue?.value, previousRevenue?.value),
    grossProfit: grossProfit?.value,
    operatingIncome: operatingIncome?.value,
    netIncome: netIncome?.value,
    grossMarginPct: safePercent(grossProfit?.value, revenue?.value),
    operatingMarginPct: safePercent(operatingIncome?.value, revenue?.value),
    profitMarginPct: safePercent(netIncome?.value, revenue?.value),
    returnOnEquityPct: safePercent(netIncome?.value, equity?.value),
    trailingEps: eps?.value,
    totalCash: cash?.value,
    totalAssets: assets?.value,
    currentAssets: assetsCurrent?.value,
    totalLiabilities: liabilities?.value,
    currentLiabilities: liabilitiesCurrent?.value,
    equity: equity?.value,
    debtToEquityPct: safePercent(liabilities?.value, equity?.value),
    currentRatio: safeRatio(assetsCurrent?.value, liabilitiesCurrent?.value),
    sharesOutstanding: shares?.value,
    periodEnd: revenue?.end || netIncome?.end || "",
    balanceSheetDate: assets?.end || equity?.end || "",
    fiscalYear: revenue?.fy || netIncome?.fy || null,
    currency: "USD",
  });
}

function normalizeUsFundamentals(input = {}) {
  return {
    source: cleanText(input.source || ""),
    fetchedAt: cleanText(input.fetchedAt || ""),
    symbol: normalizeUsSymbol(input.symbol),
    companyName: cleanText(input.companyName || ""),
    cik: cleanText(input.cik || ""),
    marketCap: nullableNumber(input.marketCap),
    enterpriseValue: nullableNumber(input.enterpriseValue),
    trailingPe: nullableNumber(input.trailingPe),
    forwardPe: nullableNumber(input.forwardPe),
    pegRatio: nullableNumber(input.pegRatio),
    priceToBook: nullableNumber(input.priceToBook),
    trailingEps: nullableNumber(input.trailingEps),
    forwardEps: nullableNumber(input.forwardEps),
    revenue: nullableNumber(input.revenue),
    previousRevenue: nullableNumber(input.previousRevenue),
    revenueGrowthPct: nullableNumber(input.revenueGrowthPct),
    grossProfit: nullableNumber(input.grossProfit),
    operatingIncome: nullableNumber(input.operatingIncome),
    netIncome: nullableNumber(input.netIncome),
    grossMarginPct: nullableNumber(input.grossMarginPct),
    operatingMarginPct: nullableNumber(input.operatingMarginPct),
    profitMarginPct: nullableNumber(input.profitMarginPct),
    returnOnEquityPct: nullableNumber(input.returnOnEquityPct),
    totalCash: nullableNumber(input.totalCash),
    totalAssets: nullableNumber(input.totalAssets),
    currentAssets: nullableNumber(input.currentAssets),
    totalLiabilities: nullableNumber(input.totalLiabilities),
    currentLiabilities: nullableNumber(input.currentLiabilities),
    equity: nullableNumber(input.equity),
    debtToEquityPct: nullableNumber(input.debtToEquityPct),
    currentRatio: nullableNumber(input.currentRatio),
    sharesOutstanding: nullableNumber(input.sharesOutstanding),
    analystTargetPrice: nullableNumber(input.analystTargetPrice),
    analystRecommendation: cleanText(input.analystRecommendation || ""),
    analystOpinions: nullableNumber(input.analystOpinions),
    nextEarningsDate: normalizeDate(input.nextEarningsDate),
    periodEnd: normalizeDate(input.periodEnd),
    balanceSheetDate: normalizeDate(input.balanceSheetDate),
    fiscalYear: nullableNumber(input.fiscalYear),
    exchange: cleanText(input.exchange || ""),
    currency: cleanText(input.currency || "USD"),
  };
}

function enrichUsFundamentals(fundamentals = {}, price = {}) {
  const normalized = normalizeUsFundamentals(fundamentals);
  const current = nullablePositiveNumber(price.current);
  if (!Number.isFinite(normalized.trailingPe) && current && normalized.trailingEps > 0) {
    normalized.trailingPe = current / normalized.trailingEps;
  }
  if (!Number.isFinite(normalized.marketCap) && current && normalized.sharesOutstanding > 0) {
    normalized.marketCap = current * normalized.sharesOutstanding;
  }
  return normalized;
}

function conceptValues(facts = {}, names = [], units = ["USD"]) {
  const taxonomies = [facts.facts?.["us-gaap"] || {}, facts.facts?.dei || {}];
  for (const taxonomy of taxonomies) {
    for (const name of names) {
      const concept = taxonomy[name];
      if (!concept?.units) continue;
      for (const unit of units) {
        const values = (concept.units[unit] || [])
          .map((item) => ({
            value: nullableNumber(item.val),
            end: normalizeDate(item.end),
            start: normalizeDate(item.start),
            filed: normalizeDate(item.filed),
            form: cleanText(item.form || ""),
            fp: cleanText(item.fp || ""),
            fy: nullableNumber(item.fy),
          }))
          .filter((item) => Number.isFinite(item.value) && item.end);
        if (values.length) return values;
      }
    }
  }
  return [];
}

function latestAnnualFact(facts, names, units) {
  return conceptValues(facts, names, units).filter(isAnnualFact).sort(compareFactDesc)[0] || null;
}

function latestInstantFact(facts, names, units) {
  return conceptValues(facts, names, units).filter(isInstantFact).sort(compareFactDesc)[0] || null;
}

function isAnnualFact(item) {
  return item.form === "10-K" && (item.fp === "FY" || !item.fp) && item.start && item.end;
}

function isInstantFact(item) {
  return ["10-K", "10-Q"].includes(item.form) && !item.start && item.end;
}

function compareFactDesc(a, b) {
  const endCompare = String(b.end || "").localeCompare(String(a.end || ""));
  if (endCompare) return endCompare;
  return String(b.filed || "").localeCompare(String(a.filed || ""));
}

function safePercent(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator
    ? (numerator / denominator) * 100
    : null;
}

function safePercentChange(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;
}

function safeRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator
    ? numerator / denominator
    : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function usPortfolioSummary(rows = []) {
  return rows.reduce((summary, row) => {
    const position = row.position || {};
    const hasPositionResult = Number.isFinite(position.grossInvested)
      || Number.isFinite(position.invested)
      || Number.isFinite(position.pnlAmount);
    if (!hasPositionResult) return summary;
    summary.invested += Number.isFinite(position.invested) ? position.invested : 0;
    summary.grossInvested += Number.isFinite(position.grossInvested)
      ? position.grossInvested
      : Number.isFinite(position.invested)
      ? position.invested
      : 0;
    summary.marketValue += Number.isFinite(position.marketValue) ? position.marketValue : 0;
    summary.pnlAmount += Number.isFinite(position.pnlAmount) ? position.pnlAmount : 0;
    summary.dividendReceived += Number.isFinite(position.dividendReceived) ? position.dividendReceived : 0;
    summary.annualDividendEstimate += Number.isFinite(position.annualDividendEstimate) ? position.annualDividendEstimate : 0;
    summary.totalReturnAmount += Number.isFinite(position.totalReturnAmount)
      ? position.totalReturnAmount
      : Number.isFinite(position.pnlAmount)
      ? position.pnlAmount
      : 0;
    if (Number.isFinite(position.pnlAmount)) {
      if (position.pnlAmount >= 0) summary.winCount += 1;
      else summary.lossCount += 1;
    }
    summary.pnlPct = summary.grossInvested ? (summary.pnlAmount / summary.grossInvested) * 100 : null;
    summary.totalReturnPct = summary.grossInvested ? (summary.totalReturnAmount / summary.grossInvested) * 100 : null;
    return summary;
  }, {
    invested: 0,
    grossInvested: 0,
    marketValue: 0,
    pnlAmount: 0,
    pnlPct: null,
    dividendReceived: 0,
    annualDividendEstimate: 0,
    totalReturnAmount: 0,
    totalReturnPct: null,
    winCount: 0,
    lossCount: 0,
  });
}

async function notifyUsChangeSignals(result, previous) {
  const settings = await readSettings();
  if (!settings.notificationsEnabled) return;
  if (!settings.teamsWebhookUrl && !(settings.graphAccessToken && settings.graphChatId)) return;
  const previousBySymbol = new Map((previous.analyses || []).map((item) => [item.symbol, item]));
  const signals = [];
  for (const analysis of result.analyses || []) {
    signals.push(...exitPlanSignals(analysis));
    const signal = usChangeSignal(analysis, previousBySymbol.get(analysis.symbol), settings);
    if (signal) signals.push(signal);
  }
  await sendSignalsOnce(signals.slice(0, 6), settings);
}

function usChangeSignal(current = {}, previous = null, settings = {}) {
  const ai = current.ai || {};
  const position = current.position || {};
  const previousPosition = previous?.position || {};
  const pnlChange = Number.isFinite(position.pnlPct) && Number.isFinite(previousPosition.pnlPct)
    ? position.pnlPct - previousPosition.pnlPct
    : null;
  const stanceChanged = previous?.ai?.stance && ai.stance && previous.ai.stance !== ai.stance;
  const important = ai.changeLevel === "important" || ai.stance === "EXIT_WATCH";
  const sharpMove = Number.isFinite(pnlChange) && Math.abs(pnlChange) >= 5;
  const newLargeLoss = Number.isFinite(position.pnlPct) && position.pnlPct <= -15
    && (!Number.isFinite(previousPosition.pnlPct) || previousPosition.pnlPct > -15);
  if (!important && !sharpMove && !newLargeLoss && !stanceChanged) return null;
  const points = [
    Number.isFinite(pnlChange) ? `損益率の変化: ${formatSignedPercent(pnlChange)}` : "",
    Number.isFinite(position.pnlPct) ? `現在の損益: ${formatSignedPercent(position.pnlPct)} / ${formatUsd(position.pnlAmount)}` : "",
    ...(ai.good || []).map((item) => `良い材料: ${item}`),
    ...(ai.risks || []).map((item) => `注意: ${item}`),
  ].filter(Boolean).slice(0, 6);
  return {
    key: `US:${current.symbol}:${ai.stance || "CHANGE"}:${Math.round(Number(position.pnlPct || 0))}`,
    action: "米国株 変化点",
    currency: "USD",
    symbol: current.symbol,
    name: current.name,
    confidence: ai.confidence || 60,
    netEdgeYen: 0,
    currentPrice: current.price?.current,
    averagePurchasePrice: position.purchasePrice,
    averageSellPrice: position.averageSellPrice,
    quantity: position.quantity,
    accountText: accountTypeLabel("revolut_us"),
    costText: costSummaryText(estimateOneWayTradeCost(position.pnlAmount || 0, settings, { currency: "USD", accountType: "revolut_us" }), "USD"),
    reason: ai.summaryJa || "米国株の保有状況に変化があります。",
    points,
  };
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

function scheduleHourlyRefresh() {
  if (hourlyRefreshTimer) clearInterval(hourlyRefreshTimer);
  setTimeout(runHourlyRefreshIfDue, 12000);
  hourlyRefreshTimer = setInterval(runHourlyRefreshIfDue, 60 * 60 * 1000);
}

async function runHourlyRefreshIfDue() {
  const settings = await readSettings();
  if (!settings.hourlyRefreshEnabled) return;
  const now = new Date();
  const cache = await readDiscoveryCache();
  const analysisCache = await readAnalysisCache();
  const usCache = await readUsAnalysisCache();
  const cryptoCache = await readCryptoAnalysisCache();
  const disclosureCache = await readDisclosureCache();
  const shareholderCache = await readShareholderCache();
  const jpOpen = !settings.marketHoursOnlyRefresh || isMarketOpen("JP", now);
  const usOpen = !settings.marketHoursOnlyRefresh || isMarketOpen("US", now);
  if (jpOpen && !analysisJob?.running && isOlderThan(cacheHourKey(analysisCache.generatedAt), cacheHourKey(now.toISOString()))) {
    await refreshWatchlistPrices({ auto: true }).catch(() => null);
    startAnalysisJob({ websiteLimit: 8, depthLimit: 1, pagesPerSite: 1, reuseFreshPrices: true });
  }
  if (usOpen && isOlderThan(cacheHourKey(usCache.generatedAt), cacheHourKey(now.toISOString()))) {
    await refreshUsPrices({ auto: true }).catch(() => null);
    void analyzeUsHoldings({ websiteLimit: 5, reuseFreshPrices: true }, { notify: true }).catch(() => {});
  }
  if (isOlderThan(cacheHourKey(cryptoCache.generatedAt), cacheHourKey(now.toISOString()))) {
    void analyzeCryptoHolding({ auto: true }).catch(() => {});
  }
  if (settings.tdnetDisclosureEnabled && isJpDisclosureBusinessDay(now)
    && isOlderThan(cacheHourKey(disclosureCache.generatedAt), cacheHourKey(now.toISOString()))) {
    void checkTimelyDisclosures({ notify: true }).catch(() => {});
  }
  if (settings.shareholderMonitorEnabled && (jpOpen || usOpen)
    && jstDate(shareholderCache.generatedAt) !== jstDate(now.toISOString())) {
    void updateShareholderSnapshots({ notify: true }).catch(() => {});
  }
  if (jpOpen && !discoveryJob?.running && settings.dailyDiscoveryEnabled && jstDate(cache.generatedAt) !== jstDate(now.toISOString())) {
    startDiscoveryJob({ websiteLimit: 20, fullScan: true }, "daily");
  }
  if (jpOpen) {
    void updateCandidateHistoryOutcomes({ maxUpdates: 30 }).catch(() => {});
  }
}

function isMarketOpen(market, value = new Date()) {
  const timeZone = market === "US" ? "America/New_York" : "Asia/Tokyo";
  const parts = zonedParts(value, timeZone);
  if (!parts) return false;
  if (market === "US") {
    if (!isUsExchangeBusinessDay(parts)) return false;
    return minuteOfDay(parts) >= (9 * 60 + 30) && minuteOfDay(parts) < (16 * 60);
  }
  if (!isJpExchangeBusinessDay(parts)) return false;
  const minutes = minuteOfDay(parts);
  return (minutes >= 9 * 60 && minutes < 11 * 60 + 30)
    || (minutes >= 12 * 60 + 30 && minutes < 15 * 60 + 30);
}

function zonedParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

function minuteOfDay(parts) {
  return (parts.hour * 60) + parts.minute;
}

function isJpExchangeBusinessDay(parts) {
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const holidays = new Set(jpExchangeHolidays(parts.year).map(ymd));
  return !holidays.has(ymd(parts));
}

function isUsExchangeBusinessDay(parts) {
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const key = ymd(parts);
  const holidays = new Set(usExchangeHolidays(parts.year).map(ymd));
  return !holidays.has(key);
}

function jpExchangeHolidays(year) {
  const national = jpNationalHolidays(year);
  const dates = new Map(national.map((parts) => [ymd(parts), parts]));
  [2, 3].forEach((day) => {
    const parts = { year, month: 1, day };
    dates.set(ymd(parts), parts);
  });
  const yearEnd = { year, month: 12, day: 31 };
  dates.set(ymd(yearEnd), yearEnd);
  return [...dates.values()];
}

function jpNationalHolidays(year) {
  const base = [
    { year, month: 1, day: 1 },
    nthWeekdayOfMonth(year, 1, 1, 2),
    { year, month: 2, day: 11 },
    { year, month: 2, day: 23 },
    { year, month: 3, day: vernalEquinoxDay(year) },
    { year, month: 4, day: 29 },
    { year, month: 5, day: 3 },
    { year, month: 5, day: 4 },
    { year, month: 5, day: 5 },
    nthWeekdayOfMonth(year, 7, 1, 3),
    { year, month: 8, day: 11 },
    nthWeekdayOfMonth(year, 9, 1, 3),
    { year, month: 9, day: autumnalEquinoxDay(year) },
    nthWeekdayOfMonth(year, 10, 1, 2),
    { year, month: 11, day: 3 },
    { year, month: 11, day: 23 },
  ];
  const dates = new Map(base.map((parts) => [ymd(parts), parts]));
  for (const holiday of base) {
    if (weekdayUtc(holiday) !== 0) continue;
    let date = dateFromParts(holiday);
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (dates.has(ymd(datePartsUtc(date))));
    const substitute = datePartsUtc(date);
    if (substitute.year === year) dates.set(ymd(substitute), substitute);
  }
  for (let month = 1; month <= 12; month += 1) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 2; day < lastDay; day += 1) {
      const parts = { year, month, day };
      if (weekdayUtc(parts) === 0 || weekdayUtc(parts) === 6) continue;
      const key = ymd(parts);
      if (dates.has(key)) continue;
      const prev = datePartsUtc(new Date(Date.UTC(year, month - 1, day - 1)));
      const next = datePartsUtc(new Date(Date.UTC(year, month - 1, day + 1)));
      if (dates.has(ymd(prev)) && dates.has(ymd(next))) dates.set(key, parts);
    }
  }
  return [...dates.values()];
}

function ymd(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function usExchangeHolidays(year) {
  const dates = [
    observedDate(year, 1, 1),
    nthWeekdayOfMonth(year, 1, 1, 3),
    nthWeekdayOfMonth(year, 2, 1, 3),
    offsetDate(easterDate(year), -2),
    lastWeekdayOfMonth(year, 5, 1),
    observedDate(year, 6, 19),
    observedDate(year, 7, 4),
    nthWeekdayOfMonth(year, 9, 1, 1),
    nthWeekdayOfMonth(year, 11, 4, 4),
    observedDate(year, 12, 25),
  ];
  return dates.filter((date) => date.year === year);
}

function observedDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  return datePartsUtc(date);
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + ((nth - 1) * 7));
  return datePartsUtc(date);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const date = new Date(Date.UTC(year, month, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return datePartsUtc(date);
}

function offsetDate(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return datePartsUtc(date);
}

function dateFromParts(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function weekdayUtc(parts) {
  return dateFromParts(parts).getUTCDay();
}

function vernalEquinoxDay(year) {
  if (year < 1980 || year > 2099) return year % 4 === 0 ? 20 : 21;
  return Math.floor(20.8431 + (0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year) {
  if (year < 1980 || year > 2099) return year % 4 === 0 ? 23 : 24;
  return Math.floor(23.2488 + (0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4));
}

function datePartsUtc(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
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

function cacheHourKey(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).format(date);
}

function isOlderThan(left = "", right = "") {
  if (!right) return false;
  if (!left) return true;
  return left < right;
}

async function discoverStocks(options = {}, job = null) {
  const stocks = await readWatchlist();
  const usStocks = await readUsWatchlist();
  const settings = await readSettings();
  const excludedCandidates = await readExcludedCandidates();
  const existing = new Set([...stocks, ...usStocks].map((stock) => stock.symbol));
  const excluded = new Set(excludedCandidates.map((candidate) => candidate.symbol));
  const slots = Math.max(0, MAX_MANAGED_STOCKS - stocks.length);
  const usSlots = Math.max(0, MAX_US_STOCKS - usStocks.length);
  const totalSlots = slots + usSlots;
  const websiteLimit = clamp(Number(options.websiteLimit || 20), 1, MAX_WEBSITE_LIMIT);
  const unitSize = clamp(Number(options.unitSize || settings.unitSize || 100), 1, 1000);
  const unitBudgetUnlimited = options.unitBudgetUnlimited === true || settings.unitBudgetUnlimited === true;
  const unitBudget = unitBudgetUnlimited
    ? null
    : clamp(Number(options.unitBudget || settings.unitBudget || 300000), 10000, 10000000);
  const unitBudgetAllowance = unitBudget ? unitBudget * 1.1 : Infinity;
  const fullScan = options.fullScan !== false;
  updateDiscoveryJob(job, { phase: "市場全体の材料を検索中" });
  const search = await discoverySearchResults(websiteLimit);
  const haystack = `${search.map((item) => `${item.title} ${item.snippet}`).join("\n")}`.toLowerCase();
  const sectorCounts = sectorCount([...stocks, ...usStocks]);
  const searchCandidates = extractDiscoveryCandidates(search, existing, excluded);
  const primeUniverse = await readPrimeUniverse();
  updateDiscoveryJob(job, { phase: "LM Studioで市場トレンドを要約中" });
  const marketBrief = search.length
    ? await withTimeout(aiMarketTrendBrief(search, primeUniverse.length), 45000).catch(() => null)
    : null;
  const performance = candidatePerformanceSummary(await readCandidateHistory());
  const financialCache = await readFinancialCache();
  let financialBySymbol = new Map((financialCache.items || []).map((item) => [item.symbol, item]));
  const baseCandidateUniverse = uniqueBy([...searchCandidates, ...primeUniverse, ...discoveryUniverse, ...usDiscoveryUniverse], (candidate) => candidate.symbol);
  const candidateUniverse = baseCandidateUniverse
    .filter((candidate) => !existing.has(candidate.symbol) && !excluded.has(candidate.symbol))
    .filter((candidate) => !isDiscoveryAvoidedBusiness(candidate));
  const universeStats = discoveryUniverseStats(baseCandidateUniverse, candidateUniverse, existing, excluded);
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
    const candidateBudget = discoveryBudgetForCandidate(resolvedCandidate, {
      unitSize,
      unitBudget,
      unitBudgetAllowance,
      unitBudgetUnlimited,
    });
    const scoredCandidate = applyCandidateLearning(
      scoreDiscoveryCandidate(resolvedCandidate, price, haystack, sectorCounts, candidateBudget),
      performance,
    );
    checked += 1;
    if (checked === candidates.length || checked % 25 === 0) {
      updateDiscoveryJob(job, { checked, phase: "全プライム銘柄の価格と3年傾向を確認中" });
    }
    return scoredCandidate;
  });
  const prelimPool = scored
    .filter((candidate) => candidate.nearBudget)
    .sort((a, b) => b.businessValueScore - a.businessValueScore || b.score - a.score || a.risks.length - b.risks.length || a.symbol.localeCompare(b.symbol));
  const rawShortlist = fullScan ? prelimPool : prelimPool.slice(0, 24);
  const shortlist = uniqueBy([
    ...rawShortlist.filter((candidate) => !isUsDiscoveryCandidate(candidate)).slice(0, DISCOVERY_FINANCIAL_REVIEW_LIMIT),
    ...rawShortlist.filter(isUsDiscoveryCandidate),
  ], (candidate) => candidate.symbol);
  const discoveryFinancials = await refreshDiscoveryFinancials(shortlist, settings, financialCache, job);
  financialBySymbol = discoveryFinancials.bySymbol;
  const financialStats = {
    edinetDiscoveryEnabled: discoveryFinancials.enabled,
    edinetDiscoveryChecked: discoveryFinancials.checked,
    edinetDiscoveryWarnings: discoveryFinancials.warnings,
  };
  let individualSearchCount = 0;
  const enhancedSoFar = [];
  updateDiscoveryJob(job, {
    phase: "検索順位と事業材料を銘柄別に確認中",
    searched: 0,
    total: candidates.length + shortlist.length,
  });
  const enhanced = await mapLimit(shortlist, 3, async (candidate) => {
    const usCandidate = isUsDiscoveryCandidate(candidate);
    const results = usCandidate
      ? await searchUsCandidateEvidence(candidate, websiteLimit).catch(() => [])
      : await searchJpStockEvidence(candidate, websiteLimit).catch(() => []);
    const evidencePool = usCandidate
      ? results
      : uniqueBy([...(candidate.sourceEvidence || []), ...results], (item) => item.url);
    const relevantResults = relevantSearchResults(candidate, evidencePool);
    const positionSignal = searchPositionSignal(candidate, results, relevantResults);
    const peSignal = searchPeSignal(candidate, results, relevantResults, financialBySymbol.get(candidate.symbol));
    individualSearchCount += results.length;
    const enhancedCandidate = applyCandidateLearning(
      applyDiscoveryFinancialAdjustment(
        enhanceBusinessCandidate(candidate, relevantResults, positionSignal, peSignal),
        financialBySymbol.get(candidate.symbol),
      ),
      performance,
    );
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
        unitBudgetUnlimited,
        searchCandidates,
        candidateUniverse,
        usedDiscoveryAi: false,
        fullScan,
        marketBrief,
        universeStats,
        financialStats,
      });
    }
    return enhancedCandidate;
  });
  const edinetRequiredForJp = Boolean(settings.edinetApiKey);
  const eligibleEnhanced = enhanced
    .filter(hasDiscoverySupport)
    .filter((candidate) => isUsDiscoveryCandidate(candidate) || !edinetRequiredForJp || hasCandidateFinancialBasis(candidate))
    .filter((candidate) => candidate.evidenceQuality !== "悪材料あり");
  const supported = eligibleEnhanced.filter(isActionableDiscoveryCandidate);
  const viable = supported.filter((candidate) => candidate.businessValueScore >= 55);
  const fallbackPool = supported.length ? supported : eligibleEnhanced;
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
        .filter(isActionableDiscoveryCandidate)
        .sort(sortDiscoveryCandidates)
        .map((candidate) => ({
          ...candidate,
          priorityScore: discoveryPriorityScore(candidate),
          pePriorityScore: pePriorityScore(candidate),
          reportBucket: isPeReportCandidate(candidate) ? "pe" : "stock",
        }))
        .slice(0, MAX_DISCOVERY_SUGGESTIONS);
    }
  } catch {
    // Candidate discovery still works without the local model.
  }

  const added = [];
  const addedUs = [];
  let next = stocks;
  let nextUs = usStocks;
  if (options.autoAdd) {
    const jpSlots = Math.max(0, MAX_MANAGED_STOCKS - stocks.length);
    const usSlots = Math.max(0, MAX_US_STOCKS - usStocks.length);
    for (const candidate of suggestions) {
      if (isUsDiscoveryCandidate(candidate) && addedUs.length < usSlots) addedUs.push(candidateToUsStock(candidate));
      else if (!isUsDiscoveryCandidate(candidate) && added.length < jpSlots) added.push(candidateToStock(candidate));
      if (added.length >= jpSlots && addedUs.length >= usSlots) break;
    }
    next = added.length ? [...stocks, ...added].slice(0, MAX_MANAGED_STOCKS) : stocks;
    nextUs = addedUs.length ? [...usStocks, ...addedUs].slice(0, MAX_US_STOCKS) : usStocks;
    if (added.length) await saveWatchlist(next);
    if (addedUs.length) await saveUsWatchlist(nextUs);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    added: [...added, ...addedUs],
    stocks: next,
    usStocks: nextUs,
    suggestions,
    evidence: search.slice(0, 5),
    sourceSummary: await searchSourceSummary(search.length + individualSearchCount, candidateLimit, {
      unitSize,
      unitBudget,
      unitBudgetUnlimited,
      discoveredCount: searchCandidates.length,
      candidatePool: candidateUniverse.length,
      jpCandidatePool: candidateUniverse.filter((candidate) => !isUsDiscoveryCandidate(candidate)).length,
      usCandidatePool: candidateUniverse.filter(isUsDiscoveryCandidate).length,
      usedDiscoveryAi,
      fullScan,
      searchPositionUsed: true,
      marketBrief,
      performance,
      ...financialStats,
      ...universeStats,
    }),
    message: suggestions.length === 0
      ? "買い場ライン以下で条件に合う候補が見つかりませんでした。"
      : totalSlots > 0
      ? "候補を表示しました。必要な銘柄だけ追加してください。"
      : "管理枠が埋まっているため、入れ替え候補として表示します。",
  };
  await saveDiscoveryCache(result);
  await recordCandidateSnapshots(suggestions, result);
  await updateCandidateHistoryOutcomes({ maxUpdates: 20 }).catch(() => {});
  await notifyStrongDiscoverySignals(suggestions).catch(() => {});
  return result;
}

function discoveryUniverseStats(baseUniverse = [], candidateUniverse = [], existing = new Set(), excluded = new Set()) {
  const base = uniqueBy(baseUniverse.filter((candidate) => candidate?.symbol), (candidate) => candidate.symbol);
  const usBase = base.filter(isUsDiscoveryCandidate);
  const jpBase = base.filter((candidate) => !isUsDiscoveryCandidate(candidate));
  const available = candidateUniverse.filter((candidate) => candidate?.symbol);
  const countBlocked = (items, predicate) => items.filter(predicate).length;
  const notAlreadyBlocked = (candidate) => !existing.has(candidate.symbol) && !excluded.has(candidate.symbol);
  return {
    discoveredCount: base.filter((candidate) => candidate.discoverySource).length,
    jpDiscoveredCount: jpBase.filter((candidate) => candidate.discoverySource).length,
    usDiscoveredCount: usBase.filter((candidate) => candidate.discoverySource).length,
    jpUniverseTotal: jpBase.length,
    usUniverseTotal: usBase.length,
    jpCandidatePool: available.filter((candidate) => !isUsDiscoveryCandidate(candidate)).length,
    usCandidatePool: available.filter(isUsDiscoveryCandidate).length,
    jpExistingCount: countBlocked(jpBase, (candidate) => existing.has(candidate.symbol)),
    usExistingCount: countBlocked(usBase, (candidate) => existing.has(candidate.symbol)),
    jpExcludedCount: countBlocked(jpBase, (candidate) => excluded.has(candidate.symbol)),
    usExcludedCount: countBlocked(usBase, (candidate) => excluded.has(candidate.symbol)),
    jpAvoidedBusinessCount: countBlocked(jpBase, (candidate) => notAlreadyBlocked(candidate) && isDiscoveryAvoidedBusiness(candidate)),
    usAvoidedBusinessCount: countBlocked(usBase, (candidate) => notAlreadyBlocked(candidate) && isDiscoveryAvoidedBusiness(candidate)),
  };
}

function topDiscoverySuggestions(candidates = []) {
  return candidates
    .filter((candidate) => candidate && candidate.evidenceQuality !== "悪材料あり")
    .filter(isActionableDiscoveryCandidate)
    .sort(sortDiscoveryCandidates)
    .map((candidate) => ({
      ...candidate,
      priorityScore: discoveryPriorityScore(candidate),
      pePriorityScore: pePriorityScore(candidate),
      reportBucket: isPeReportCandidate(candidate) ? "pe" : "stock",
    }))
    .slice(0, MAX_DISCOVERY_SUGGESTIONS);
}

function sortDiscoveryCandidates(a, b) {
  return discoveryPriorityScore(b) - discoveryPriorityScore(a)
    || pePriorityScore(b) - pePriorityScore(a)
    || b.businessValueScore - a.businessValueScore
    || b.score - a.score
    || a.risks.length - b.risks.length
    || a.symbol.localeCompare(b.symbol);
}

function candidatePeScore(candidate = {}) {
  return Number(candidate.peSignal?.matchScore || 0);
}

function isPeReportCandidate(candidate = {}) {
  if (isUsDiscoveryCandidate(candidate)) return false;
  if (candidate.peSignal?.reportEligible === false) return false;
  const pe = candidatePeScore(candidate);
  if (pe >= PE_STRONG_MIN_SCORE) return true;
  if (pe < PE_PRIORITY_MIN_SCORE) return false;
  const keys = new Set((candidate.peSignal?.criteria || []).map((item) => item.key));
  return keys.has("shareholder")
    || keys.has("restructuring")
    || (keys.has("undervalued") && (keys.has("cashflow") || keys.has("debt_capacity")));
}

function discoveryPriorityScore(candidate = {}) {
  const pe = candidatePeScore(candidate);
  const value = Number(candidate.businessValueScore || candidate.score || 0);
  const early = Number(candidate.earlySignal?.score || 0);
  const current = nullablePositiveNumber(candidate.price?.current);
  const buyLine = nullablePositiveNumber(candidate.price?.buyLine1y);
  const buyPlan = nullablePositiveNumber(candidate.buyPlan?.maxBuyPrice);
  const timingBonus = candidate.buyPlan?.stance === "今すぐ検討"
    ? 22
    : candidate.buyPlan?.stance === "反転待ち"
    ? 8
    : candidate.buyPlan?.stance === "指値で待つ"
    ? 10
    : 0;
  const buyLineBonus = current && buyLine && current <= buyLine * 1.005 ? 18 : 0;
  const planBonus = current && buyPlan && current <= buyPlan * STRICT_BUY_TARGET_TOLERANCE ? 14 : 0;
  const us = isUsDiscoveryCandidate(candidate);
  const currencyBonus = us ? 8 : 0;
  const peAligned = isPeReportCandidate(candidate);
  const peTierBonus = pe >= 70 ? 260 : pe >= PE_STRONG_MIN_SCORE ? 170 : pe >= PE_PRIORITY_MIN_SCORE ? 75 : 0;
  const earlyTierBonus = early >= 75 ? (us ? 145 : 70) : early >= 60 ? (us ? 90 : 42) : early >= 45 ? 24 : 0;
  const earlyWeight = us ? 1.1 : 0.6;
  const nonPeWeight = peAligned ? 0.55 : 0.28;
  const timingWeight = peAligned || early >= 60 ? 1 : 0.4;
  const peThinPenalty = pe < PE_PRIORITY_MIN_SCORE ? (pe < 30 ? 120 : 70) : 0;
  const overheatPenalty = Number.isFinite(candidate.price?.return3m) && candidate.price.return3m > 28 ? 60 : 0;
  const extendedRunPenalty = isExtendedRunChart(candidate.price || {}) ? 220 : 0;
  return Math.max(0, Math.round(
    peTierBonus
    + earlyTierBonus
    + (pe * 1.4)
    + (early * earlyWeight)
    + (value * nonPeWeight)
    + ((timingBonus + buyLineBonus + planBonus) * timingWeight)
    + currencyBonus
    - peThinPenalty
    - overheatPenalty
    - extendedRunPenalty,
  ));
}

function pePriorityScore(candidate = {}) {
  const pe = candidatePeScore(candidate);
  const current = nullablePositiveNumber(candidate.price?.current);
  const buyLine = nullablePositiveNumber(candidate.price?.buyLine1y);
  const buyPlan = nullablePositiveNumber(candidate.buyPlan?.maxBuyPrice);
  if (!isPeReportCandidate(candidate)) return Math.round(pe);
  const timingBonus = candidate.buyPlan?.stance === "今すぐ検討"
    ? 22
    : candidate.buyPlan?.stance === "反転待ち"
    ? 8
    : candidate.buyPlan?.stance === "指値で待つ"
    ? 10
    : 0;
  const buyLineBonus = current && buyLine && current <= buyLine * 1.005 ? 18 : 0;
  const planBonus = current && buyPlan && current <= buyPlan * STRICT_BUY_TARGET_TOLERANCE ? 14 : 0;
  const currencyBonus = isUsDiscoveryCandidate(candidate) ? 2 : 0;
  const hardSignalBonus = pe >= PE_STRONG_MIN_SCORE ? 18 : 0;
  return Math.round((pe * 1.35) + hardSignalBonus + timingBonus + buyLineBonus + planBonus + currencyBonus);
}

function isActionableDiscoveryCandidate(candidate = {}) {
  const price = candidate.price || {};
  const plan = candidate.buyPlan || {};
  const current = nullablePositiveNumber(price.current);
  const maxBuyPrice = nullablePositiveNumber(plan.maxBuyPrice);
  if (!current || !maxBuyPrice) return false;
  if (isExtendedRunChart(price)) return false;
  if (current > maxBuyPrice * STRICT_BUY_TARGET_TOLERANCE) return false;
  if (price.buyLine1y && current > price.buyLine1y * 1.03) return false;
  if (candidate.inBudget === false) return false;
  return (candidate.businessValueScore || candidate.score || 0) >= 50;
}

function isDiscoveryAvoidedBusiness(candidate = {}) {
  const sector = `${candidate.sector || candidate.sector17 || ""}`;
  const notes = `${candidate.notes || ""} ${candidate.name || ""}`;
  if (DISCOVERY_AVOID_SECTOR_PATTERN.test(sector)) return true;
  if (DISCOVERY_IT_VENTURE_PATTERN.test(`${sector} ${notes}`) && !DISCOVERY_IT_STABLE_PATTERN.test(`${sector} ${notes}`)) return true;
  return false;
}

function isUsDiscoveryCandidate(candidate = {}) {
  const symbol = String(candidate.symbol || "").trim().toUpperCase();
  if (candidate.currency === "USD") return true;
  if (["NYSE", "NASDAQ", "AMEX"].includes(String(candidate.market || "").toUpperCase())) return true;
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) && !symbol.endsWith(".T");
}

function discoveryCurrency(candidate = {}) {
  return isUsDiscoveryCandidate(candidate) ? "USD" : "JPY";
}

function discoveryBudgetForCandidate(candidate, base = {}) {
  if (isUsDiscoveryCandidate(candidate)) {
    return {
      currency: "USD",
      unitSize: US_DISCOVERY_UNIT_SIZE,
      unitBudget: US_DISCOVERY_UNIT_BUDGET,
      unitBudgetAllowance: US_DISCOVERY_UNIT_BUDGET * 1.1,
      unitBudgetUnlimited: false,
    };
  }
  return {
    currency: "JPY",
    unitSize: base.unitSize || 100,
    unitBudget: base.unitBudget,
    unitBudgetAllowance: base.unitBudgetAllowance ?? Infinity,
    unitBudgetUnlimited: base.unitBudgetUnlimited === true,
  };
}

function formatMoney(value, currency = "JPY") {
  return currency === "USD" ? formatUsd(value) : formatYen(value);
}

async function refreshDiscoveryFinancials(candidates = [], settings = null, financialCache = null, job = null) {
  const previous = financialCache || await readFinancialCache();
  const bySymbol = new Map((previous.items || []).map((item) => [item.symbol, item]));
  const jpCandidates = uniqueBy(candidates
    .filter((candidate) => !isUsDiscoveryCandidate(candidate))
    .slice(0, DISCOVERY_FINANCIAL_REVIEW_LIMIT)
    .map(candidateToStock), (stock) => stock.symbol);
  if (!jpCandidates.length) {
    return { bySymbol, checked: 0, enabled: Boolean(settings?.edinetApiKey), warnings: [] };
  }
  if (!settings?.edinetApiKey) {
    return { bySymbol, checked: 0, enabled: false, warnings: ["EDINET APIキー未設定"] };
  }
  updateDiscoveryJob(job, {
    phase: "EDINET財務で日本株候補を確認中",
    checked: 0,
    total: jpCandidates.length,
  });
  const collected = await collectFinancialSnapshotsForStocks(jpCandidates, {
    settings,
    previous,
    force: true,
  }).catch((error) => ({
    generatedAt: new Date().toISOString(),
    enabled: false,
    checkedCount: 0,
    warningCount: 1,
    warnings: [`EDINET: ${error.message || "候補財務を取得できませんでした"}`],
    items: [],
    message: "候補財務を取得できませんでした。",
  }));
  const checkedCount = Number.isFinite(collected.checkedCount) ? collected.checkedCount : jpCandidates.length;
  const mergedItems = mergeFinancialSnapshotItems(previous.items, collected.items);
  for (const item of mergedItems) bySymbol.set(item.symbol, item);
  if (collected.items?.length) {
    await saveFinancialCache({
      ...collected,
      checkedCount,
      items: mergedItems,
    }).catch(() => {});
  }
  updateDiscoveryJob(job, {
    phase: "EDINET財務で日本株候補を確認中",
    checked: checkedCount,
    total: jpCandidates.length,
  });
  return {
    bySymbol,
    checked: checkedCount,
    enabled: collected.enabled !== false,
    warnings: asStringArray(collected.warnings),
  };
}

function applyDiscoveryFinancialAdjustment(candidate = {}, financials = null) {
  if (!candidate || isUsDiscoveryCandidate(candidate)) return candidate;
  const snapshot = financials ? normalizeFinancialSnapshot(financials) : null;
  if (!snapshot) return candidate;
  const criteria = normalizeFinancialCriteria(snapshot.criteria || []);
  let scoreDelta = 0;
  let process = candidate.process;
  const reasons = [];
  const risks = [];
  const statusByKey = new Map(criteria.map((item) => [item.key, item]));
  const marketCap = statusByKey.get("market_cap");
  const netCash = statusByKey.get("net_cash");
  const valuation = statusByKey.get("ev_ebitda");
  const pbr = statusByKey.get("pbr");
  const operatingCf = statusByKey.get("operating_cf");

  if (operatingCf?.status === "pass") {
    scoreDelta += 7;
    process = boostProcessStage(process, "事業", 4, "EDINETで営業CFプラス");
    process = boostProcessStage(process, "リスク", 3, "本業の現金創出は確認済み");
    reasons.push("EDINETで営業CFがプラス");
  } else if (operatingCf?.status === "fail") {
    scoreDelta -= 14;
    process = boostProcessStage(process, "リスク", -7, "EDINETで営業CFマイナス");
    risks.push("EDINETで営業CFがマイナス");
  }

  if (netCash?.status === "pass") {
    scoreDelta += 7;
    process = boostProcessStage(process, "割安", 4, "EDINETでネットキャッシュ厚め");
    reasons.push(netCash.summary || "ネットキャッシュ比率が高い");
  } else if (netCash?.status === "fail" && Number.isFinite(snapshot.netCashRatio) && snapshot.netCashRatio < 0) {
    scoreDelta -= 8;
    process = boostProcessStage(process, "リスク", -4, "ネットキャッシュはマイナス");
    risks.push("ネットキャッシュはマイナス");
  }

  if (valuation?.status === "pass" || pbr?.status === "pass") {
    scoreDelta += 8;
    process = boostProcessStage(process, "割安", 5, "EDINET/Yahooで倍率面の割安を確認");
    reasons.push([valuation, pbr].filter((item) => item?.status === "pass").map((item) => item.summary).filter(Boolean).join(" / ") || "倍率面で割安");
  } else if (valuation?.status === "fail" && pbr?.status === "fail") {
    scoreDelta -= 10;
    process = boostProcessStage(process, "割安", -6, "倍率面の割安さが弱い");
    risks.push("EDINET/Yahooで見ると倍率面の割安さが弱い");
  }

  if (marketCap?.status === "pass") {
    process = boostProcessStage(process, "再編", 3, "PEが扱いやすい時価総額レンジ");
  } else if (marketCap?.status === "fail") {
    scoreDelta -= 6;
    process = boostProcessStage(process, "再編", -5, "PEが対象にしやすい時価総額から外れる");
    risks.push(marketCap.summary || "PEが対象にしやすい時価総額から外れる");
  }

  const finalized = finalizeDiscoveryProcess(process);
  const businessValueScore = clamp(Math.round(finalized.totalScore), 0, 100);
  const score = clamp(Math.round(Number(candidate.score || 0) + scoreDelta), 0, 100);
  const buyPlan = candidateBuyPlan(candidate.price || {}, {
    unitSize: candidate.unitSize,
    unitBudget: candidate.unitBudget,
    unitAmount: candidate.unitAmount,
    businessValueScore,
    currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate),
  });
  return {
    ...candidate,
    financials: snapshot,
    score,
    businessValueScore,
    rankLabel: discoveryRankLabel(businessValueScore),
    process: finalized,
    buyPlan,
    sellPlan: candidateExitPlan(candidate.price || {}, buyPlan, { currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate) }),
    evidenceQuality: candidate.evidenceQuality && !candidate.evidenceQuality.includes("EDINET")
      ? `${candidate.evidenceQuality}・EDINET財務`
      : candidate.evidenceQuality || "EDINET財務",
    reasons: uniqueText([...(candidate.reasons || []), ...reasons].filter(Boolean)).slice(0, 5),
    risks: uniqueText([...(candidate.risks || []), ...risks].filter(Boolean)).slice(0, 4),
  };
}

function searchPeSignal(candidate, allResults = [], relevantResults = [], financials = null) {
  const text = businessContextText([
    candidate.name,
    candidate.symbol,
    candidate.sector || "",
    candidate.notes || "",
    ...relevantResults.map((item) => `${item.title} ${item.snippet} ${item.url}`),
  ].join("\n"));
  const criteria = PE_CRITERIA.map((criterion) => {
    const hits = criterion.words.filter((word) => text.includes(word.toLowerCase()));
    if (!hits.length) return null;
    return {
      key: criterion.key,
      label: criterion.label,
      hits: hits.slice(0, 4),
      score: criterion.weight,
    };
  }).filter(Boolean);
  const financialCriteria = normalizeFinancialCriteria(financials?.criteria || []);
  const financialScore = financialCriteriaScore(financialCriteria);
  const financialPass = new Set(financialCriteria.filter((item) => item.status === "pass").map((item) => item.key));
  const financialWatch = new Set(financialCriteria.filter((item) => item.status === "watch").map((item) => item.key));
  const financialFail = new Set(financialCriteria.filter((item) => item.status === "fail").map((item) => item.key));
  const buyerHits = PE_BUYER_WORDS.filter((word) => text.includes(word.toLowerCase())).slice(0, 8);
  const directBuyerHits = PE_DIRECT_BUYER_WORDS.filter((word) => text.includes(word.toLowerCase())).slice(0, 6);
  const disappointmentHits = ["決算後", "失望売り", "急落", "大幅安", "自社株買いなし", "増配なし", "株主還元", "還元不足", "earnings selloff", "disappointment", "no buyback", "capital allocation"]
    .filter((word) => text.includes(word.toLowerCase()))
    .slice(0, 6);
  const sector = candidate.sector || "";
  let score = criteria.reduce((sum, item) => sum + item.score, 0);
  if (Number.isFinite(financialScore)) score += Math.round(financialScore * 0.8);
  if (/サービス|ヘルスケア|不動産|物流|人材|設備|メンテ|小売|生活用品|services|healthcare|logistics|industrial|maintenance|payment|telecom|media/i.test(sector)) score += 8;
  if (/銀行|保険|電力|資源|航空|鉄道|防衛|半導体|bank|insurance|utility|airline|aerospace|semiconductor/i.test(sector)) score -= 6;
  if (directBuyerHits.length) score += Math.min(20, directBuyerHits.length * 5);
  else if (buyerHits.length) score += Math.min(8, buyerHits.length * 2);
  if (disappointmentHits.length && (financialPass.has("net_cash") || financialPass.has("pbr") || financialPass.has("ev_ebitda"))) {
    score += Math.min(18, disappointmentHits.length * 4);
  }
  if (isHighChaseChart(candidate.price || {})) score = Math.min(score, 30);
  const positiveKeys = new Set(criteria.filter((item) => item.score > 0).map((item) => item.key));
  const hasHardSignal = directBuyerHits.length
    || positiveKeys.has("shareholder")
    || positiveKeys.has("restructuring")
    || disappointmentHits.length >= 2;
  if (financialFail.has("market_cap")) score = Math.min(score, 34);
  const marketCapAccepted = financialPass.has("market_cap") || (financialWatch.has("market_cap") && hasHardSignal);
  const hasFinancialBase = marketCapAccepted
    && (financialPass.has("net_cash") || financialWatch.has("net_cash"))
    && (financialPass.has("ev_ebitda") || financialPass.has("pbr") || positiveKeys.has("undervalued"))
    && !financialFail.has("operating_cf");
  const hasLboBase = hasFinancialBase || (
    positiveKeys.has("cashflow")
    && (positiveKeys.has("undervalued") || positiveKeys.has("debt_capacity") || positiveKeys.has("sector_fit"))
  );
  if (!financialCriteria.length || financialCriteria.every((item) => item.status === "unknown")) {
    score = Math.min(score, 44);
  }
  if (!hasHardSignal && !hasLboBase) score = Math.min(score, 34);
  else if (!hasHardSignal) score = Math.min(score, 54);
  const matchScore = clamp(Math.round(score), 0, 100);
  const evidence = relevantResults
    .filter((item) => PE_DIRECT_BUYER_WORDS.some((word) => businessContextText(`${item.title} ${item.snippet}`).includes(word.toLowerCase())))
    .slice(0, 3)
    .map((item) => ({
      title: item.title,
      url: item.url,
      source: hostOf(item.url),
      snippet: item.snippet,
    }));
  const label = matchScore >= 70
    ? "PE注目度高め"
    : matchScore >= PE_STRONG_MIN_SCORE
    ? "PE候補として要確認"
    : matchScore >= PE_PRIORITY_MIN_SCORE
    ? "PE要素あり"
    : "PE要素薄い";
  return {
    matchScore,
    label,
    criteria: [
      ...financialCriteria.filter((item) => item.status === "pass" || item.status === "watch").map((item) => ({
        key: item.key,
        label: item.label,
        status: item.status,
        summary: item.summary,
      })),
      ...criteria.filter((item) => item.score > 0).map((item) => ({
        key: item.key,
        label: item.label,
        hits: item.hits,
      })),
    ].slice(0, 8),
    financialCriteria,
    financials: financials ? normalizeFinancialSnapshot(financials) : null,
    tendencies: PE_RECENT_TENDENCIES,
    risks: uniqueText([
      ...financialCriteria.filter((item) => item.status === "fail").map((item) => `${item.label}: ${item.summary}`),
      ...criteria.filter((item) => item.score < 0).map((item) => item.hits[0]),
      isHighChaseChart(candidate.price || {}) ? "高値追いになりやすい" : "",
    ].filter(Boolean)).slice(0, 5),
    buyerHits,
    directBuyerHits,
    disappointmentHits,
    reportEligible: matchScore >= PE_PRIORITY_MIN_SCORE && hasFinancialBase && (hasHardSignal || matchScore >= PE_STRONG_MIN_SCORE),
    evidence,
    summary: peSignalSummary(label, criteria, buyerHits, {
      directBuyerHits,
      disappointmentHits,
      hasHardSignal,
      hasLboBase,
      hasFinancialBase,
      financialCriteria,
      matchScore,
    }),
  };
}

function peSignalSummary(label, criteria = [], buyerHits = [], options = {}) {
  const positives = criteria.filter((item) => item.score > 0).map((item) => item.label).slice(0, 3);
  const financialHits = (options.financialCriteria || [])
    .filter((item) => item.status === "pass")
    .map((item) => item.label)
    .slice(0, 3);
  const risk = criteria.find((item) => item.score < 0)?.label;
  const parts = [];
  if (financialHits.length) parts.push(`財務条件: ${financialHits.join("・")}`);
  if (positives.length) parts.push(`${positives.join("・")}に該当`);
  if (options.directBuyerHits?.length) parts.push(`直接材料: ${options.directBuyerHits.slice(0, 3).join("、")}`);
  if (options.disappointmentHits?.length) parts.push(`失望売り/還元不足材料: ${options.disappointmentHits.slice(0, 3).join("、")}`);
  else if (buyerHits.length) parts.push(`周辺語: ${buyerHits.slice(0, 3).join("、")}`);
  if (risk) parts.push(`注意: ${risk}`);
  if (Number(options.matchScore || 0) < PE_PRIORITY_MIN_SCORE) parts.push("PE候補としては優先しない");
  else if (!options.hasFinancialBase) parts.push("指定した財務条件の根拠が不足");
  else if (!options.hasHardSignal) parts.push("直接の買収・株主変化は未確認");
  return `${label}${parts.length ? `。${parts.join("。")}` : "。PE候補としては根拠が薄い"}`;
}

function applyCandidateLearning(candidate, performance = {}) {
  if (!candidate) return candidate;
  const score = Number(candidate.businessValueScore || candidate.score || 0);
  let adjustment = 0;
  const reasons = [];
  const sectorStats = performance.bySector?.[candidate.sector || "その他"];
  if (sectorStats?.evaluated >= 3 && Number.isFinite(sectorStats.hitRate) && Number.isFinite(performance.hitRate)) {
    const delta = sectorStats.hitRate - performance.hitRate;
    adjustment += clamp(Math.round(delta * 18), -8, 8);
    reasons.push(`${candidate.sector || "その他"}の過去候補成績を反映`);
  }
  if (candidate.peSignal?.matchScore >= 70 && performance.peLike?.evaluated >= 3 && performance.peLike.hitRate >= performance.hitRate) {
    adjustment += 3;
    reasons.push("PE要素がある候補の過去成績を加点");
  }
  if (!adjustment) return candidate;
  const businessValueScore = clamp(Math.round(score + adjustment), 0, 100);
  return {
    ...candidate,
    businessValueScore,
    rankLabel: discoveryRankLabel(businessValueScore),
    learning: {
      adjustment,
      reasons: uniqueText(reasons),
      evaluated: performance.evaluated || 0,
      hitRate: performance.hitRate,
    },
  };
}

async function savePartialDiscovery({
  stocks,
  search,
  suggestions,
  searchCount,
  candidateLimit,
  unitSize,
  unitBudget,
  unitBudgetUnlimited,
  searchCandidates,
  candidateUniverse,
  usedDiscoveryAi,
  fullScan,
  marketBrief,
  universeStats = {},
  financialStats = {},
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
      unitBudgetUnlimited,
      discoveredCount: searchCandidates.length,
      candidatePool: candidateUniverse.length,
      jpCandidatePool: candidateUniverse.filter((candidate) => !isUsDiscoveryCandidate(candidate)).length,
      usCandidatePool: candidateUniverse.filter(isUsDiscoveryCandidate).length,
      usedDiscoveryAi,
      fullScan,
      searchPositionUsed: true,
      marketBrief,
      ...financialStats,
      ...universeStats,
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
    "PEファンド 日本企業 買収 TOB MBO 傾向 株主",
    "大量保有報告書 物言う株主 TOB 候補 日本株",
    `US stocks earnings beat raised guidance free cash flow buyback ${year}`,
    "NYSE NASDAQ undervalued growth stocks pullback earnings beat",
    "AI infrastructure semiconductor data center power stocks earnings guidance",
    "activist investor stake private equity buyout candidate NYSE NASDAQ",
  ];
  const perQueryLimit = Math.max(4, Math.ceil(limit / queries.length));
  const results = [];
  for (const query of queries) {
    const page = await searchGoogle(query, { limit: perQueryLimit }).catch(() => []);
    results.push(...page);
  }
  return uniqueBy(results, (item) => item.url).slice(0, Math.max(limit, queries.length * Math.min(perQueryLimit, 4)));
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
  const addUs = (code, rawName, item, market = "NYSE") => {
    const symbol = normalizeUsSymbol(code);
    if (!symbol || US_TICKER_STOPWORDS.has(symbol) || existing.has(symbol) || excluded.has(symbol)) return;
    const name = cleanUsCandidateName(rawName) || symbol;
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
      market: ["NYSE", "NASDAQ", "AMEX"].includes(String(market || "").toUpperCase()) ? String(market).toUpperCase() : "NYSE",
      sector: "US search discovery",
      notes: "US search result, earnings, guidance, valuation, shareholder or buyout candidate",
      discoverySource: "検索結果",
      sourceEvidence: [evidence],
      currency: "USD",
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
    const usExchangePattern = /\b(NYSE|NASDAQ|AMEX)\s*[:：]\s*([A-Z][A-Z0-9.-]{0,9})\b/gi;
    let exchangeMatch;
    while ((exchangeMatch = usExchangePattern.exec(text))) {
      addUs(exchangeMatch[2], nameBeforeTicker(text, exchangeMatch.index), item, exchangeMatch[1]);
    }
    const usSuffixPattern = /\b([A-Z][A-Z0-9.-]{0,9})\s*[（(\[]\s*(NYSE|NASDAQ|AMEX)\s*[）)\]]/gi;
    let suffixMatch;
    while ((suffixMatch = usSuffixPattern.exec(text))) {
      addUs(suffixMatch[1], nameBeforeTicker(text, suffixMatch.index), item, suffixMatch[2]);
    }
    const dollarTickerPattern = /\$([A-Z][A-Z0-9.-]{1,5})\b/g;
    let dollarMatch;
    while ((dollarMatch = dollarTickerPattern.exec(text))) {
      addUs(dollarMatch[1], nameBeforeTicker(text, dollarMatch.index), item);
    }
  }

  return [...found.values()].slice(0, 80);
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

function cleanUsCandidateName(value = "") {
  let text = cleanText(value)
    .replace(/\b(?:NYSE|NASDAQ|AMEX)\b\s*[:：]?/gi, "")
    .replace(/[$()[\]{}<>＜＞]/g, " ")
    .replace(/^(?:stock|stocks|shares|watch|buy|sell|rating|news)\s+/i, "")
    .replace(/.*[|｜:：]/, "")
    .replace(/\s+/g, " ")
    .trim();
  text = text.split(/---|--|[.!?;；。！？、，]/).pop() || text;
  text = text.trim();
  if (text.length > 46) text = text.slice(-46).trim();
  if (!text || /^[A-Z0-9.-]{1,8}$/.test(text)) return "";
  if (/\b(?:ETF|index|futures|options|market|earnings calendar)\b/i.test(text)) return "";
  return text;
}

function nameBeforeTicker(text = "", index = 0) {
  const before = cleanText(text.slice(Math.max(0, index - 90), index));
  const parts = before.split(/[.!?;；。！？、，|｜]/);
  return cleanUsCandidateName(parts.at(-1) || before);
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

function hasCandidateFinancialBasis(candidate = {}) {
  const financials = normalizeFinancialSnapshot(candidate.financials || candidate.peSignal?.financials || {});
  if (!financials) return false;
  const hasEdinetDocument = Boolean(financials.docID);
  const hasUsefulMetric = [
    financials.marketCap,
    financials.netCash,
    financials.operatingCashFlow,
    financials.pbr,
    financials.per,
    financials.evEbitda,
  ].some(Number.isFinite);
  return hasEdinetDocument && hasUsefulMetric;
}

function earlyEntrySignal(candidate = {}, price = {}) {
  const current = nullablePositiveNumber(price.current);
  if (!current) return null;
  let score = 35;
  const criteria = [];
  const risks = [];

  const buyLine = nullablePositiveNumber(price.buyLine1y);
  if (buyLine) {
    if (current <= buyLine) {
      score += 24;
      criteria.push("買い場ライン以下");
    } else if (current <= buyLine * 1.03) {
      score += 12;
      criteria.push("買い場ラインに近い");
    } else {
      score -= 28;
      risks.push("買い場ラインを超過");
    }
  }

  const trendPrice = nullablePositiveNumber(price.trendPrice3y);
  if (trendPrice) {
    if (current <= trendPrice * 0.95) {
      score += 12;
      criteria.push("3年目安より安い");
    } else if (current <= trendPrice * 1.04) {
      score += 8;
      criteria.push("3年目安に近い");
    } else if (current > trendPrice * 1.12) {
      score -= 16;
      risks.push("3年目安より高い");
    }
  }

  if (Number.isFinite(price.return1m)) {
    if (price.return1m >= 0 && price.return1m <= 12) {
      score += 14;
      criteria.push("1か月が上向き始め");
    } else if (price.return1m > 12 && price.return1m <= 22) {
      score += 7;
      criteria.push("短期反発あり");
    } else if (price.return1m < -8) {
      score -= 10;
      risks.push("直近1か月が弱い");
    }
  }

  if (Number.isFinite(price.return3m)) {
    if (price.return3m >= -8 && price.return3m <= 18) {
      score += 12;
      criteria.push("3か月は過熱していない");
    } else if (price.return3m > 28) {
      score -= 24;
      risks.push("3か月で上がりすぎ");
    } else if (price.return3m < -18) {
      score -= 8;
      risks.push("3か月の下げが強い");
    }
  }

  if (Number.isFinite(price.return1y)) {
    if (price.return1y >= -20 && price.return1y <= 35) {
      score += 8;
      criteria.push("1年では走り切っていない");
    } else if (price.return1y > 65) {
      score -= 16;
      risks.push("1年で上がりすぎ");
    }
  }

  if (Number.isFinite(price.distanceFromHigh52)) {
    if (price.distanceFromHigh52 <= -8 && price.distanceFromHigh52 >= -45) {
      score += 10;
      criteria.push("高値圏ではない");
    } else if (price.distanceFromHigh52 > -5) {
      score -= 14;
      risks.push("52週高値に近い");
    }
  }

  if (Number.isFinite(price.sma50) && Number.isFinite(price.sma200)) {
    if (price.sma50 >= price.sma200 * 0.96 && price.sma50 <= price.sma200 * 1.08) {
      score += 9;
      criteria.push("長期線近くで初動を狙える");
    }
    if (current >= price.sma50 * 0.98 && Number.isFinite(price.return1m) && price.return1m > 0) {
      score += 7;
      criteria.push("50日線付近を回復");
    }
    if (current > price.sma200 * 1.25) {
      score -= 12;
      risks.push("200日線から離れすぎ");
    }
  }

  if (price.sma5CrossUp) {
    score += 12;
    criteria.push("5日線を上抜け");
  }
  if (price.rsiCross30) {
    score += 12;
    criteria.push("RSI30割れから反転");
  }
  if (price.candlestickSignal?.label) {
    score += 9;
    criteria.push(price.candlestickSignal.label);
  }
  if (Number.isFinite(price.atrPct)) {
    if (price.atrPct >= 6) {
      score -= 8;
      risks.push("ATRが大きく指値を深くしたい");
    } else if (price.atrPct <= 4) {
      score += 4;
      criteria.push("ATRは荒すぎない");
    }
  }
  if (price.regime?.label === "調整/下落") {
    score -= 6;
    risks.push("レジームは調整寄り");
  } else if (price.regime?.label === "安定上昇") {
    score += 5;
    criteria.push("レジームは安定上昇寄り");
  }

  if (Number.isFinite(price.volumeRatio20)) {
    if (price.volumeRatio20 >= 1.1 && price.volumeRatio20 <= 2.8) {
      score += 7;
      criteria.push("出来高が増え始め");
    } else if (price.volumeRatio20 > 4) {
      score -= 6;
      risks.push("出来高が過熱");
    }
  }

  if (Number.isFinite(price.maxDrawdown3y)) {
    if (price.maxDrawdown3y > -45) {
      score += 5;
      criteria.push("大崩れが比較的浅い");
    } else if (price.maxDrawdown3y < -65) {
      score -= 10;
      risks.push("過去の下落が深い");
    }
  }

  if (Number.isFinite(price.volatility)) {
    if (price.volatility <= 45) score += 4;
    else if (price.volatility > 70) {
      score -= 10;
      risks.push("値動きが荒すぎる");
    }
  }

  if (isUsDiscoveryCandidate(candidate)) {
    const notes = businessContextText(candidate.notes || "");
    if (/(turnaround|restructuring|margin improvement|buyback|free cash flow|ai|data center|infrastructure|security|guidance)/i.test(notes)) {
      score += 6;
      criteria.push("米国株の材料テーマあり");
    }
  }

  if (isExtendedRunChart(price)) {
    const bounded = Math.min(44, clamp(Math.round(score - 42), 0, 100));
    const runText = extendedRunText(price);
    return {
      title: "高値追い警戒",
      score: bounded,
      label: "押し目待ち",
      summary: `${runText}。買い場ラインに近くても、先回りではなく高値追いになりやすいです。`,
      criteria: uniqueText(criteria).slice(0, 3),
      risks: uniqueText([
        runText,
        "早めに入る局面ではなく、すでに上がった後の形",
        "深い押し目か決算の再確認まで待ちたい",
        ...risks,
      ]).slice(0, 4),
    };
  }

  const bounded = clamp(Math.round(score), 0, 100);
  const label = bounded >= 75 ? "先回り優先" : bounded >= 60 ? "初動候補" : bounded >= 45 ? "押し目監視" : "先回り弱い";
  const summary = criteria.length
    ? criteria.slice(0, 3).join("・")
    : risks.length
    ? risks.slice(0, 2).join("・")
    : "価格の初動条件はまだ薄い";
  return {
    score: bounded,
    label,
    summary,
    criteria: uniqueText(criteria).slice(0, 5),
    risks: uniqueText(risks).slice(0, 4),
  };
}

function scoreDiscoveryCandidate(candidate, price, haystack, sectorCounts, budget = {}) {
  let score = 50;
  const reasons = [];
  const risks = [];
  const unitSize = budget.unitSize || 100;
  const currency = budget.currency || discoveryCurrency(candidate);
  const hasBudget = Number.isFinite(budget.unitBudget) && budget.unitBudget > 0;
  const unitAmount = Number.isFinite(price.current) ? price.current * unitSize : null;
  const inBudget = Number.isFinite(unitAmount) && (!hasBudget || unitAmount <= budget.unitBudget);
  const nearBudget = Number.isFinite(unitAmount) && (!hasBudget || unitAmount <= budget.unitBudgetAllowance);
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
    reasons.push(hasBudget
      ? `${unitSize}株で${formatMoney(unitAmount, currency)}。予算目安内で買える`
      : `${unitSize}株で${formatMoney(unitAmount, currency)}。予算上限なしで確認`);
  } else if (nearBudget) {
    score += 2;
    valueScore += 2;
    risks.push(`${unitSize}株で${formatMoney(unitAmount, currency)}。予算目安を少し超える`);
  } else {
    score -= 30;
    risks.push(`${unitSize}株で${formatMoney(unitAmount, currency)}。予算目安を超える`);
  }

  if (Number.isFinite(price.return3y)) {
    if (price.return3y >= 120) {
      if (isExtendedRunChart(price)) {
        score -= 10;
        businessScore += 2;
        risks.push(`${extendedRunText(price)}で、ここからは高値追いになりやすい`);
      } else {
        score += 14;
        businessScore += 8;
      }
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

  if (Number.isFinite(price.distanceFromBuyLine1y)) {
    if (price.buyTiming1y === "DEEP") {
      score += 16;
      valueScore += 12;
      reasons.push("過去1年の買い場ラインを大きく下回っている");
    } else if (price.buyTiming1y === "UNDER") {
      score += 14;
      valueScore += 10;
      reasons.push("過去1年の買い場ラインを下回っている");
    } else if (price.buyTiming1y === "NEAR") {
      score += 8;
      valueScore += 5;
      reasons.push("過去1年の買い場ラインに近い");
    } else if (price.distanceFromBuyLine1y > 18) {
      score -= 6;
      risks.push("過去1年の買い場ラインより高く、押し目待ち");
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

  const earlySignal = earlyEntrySignal(candidate, price);
  let process = buildDiscoveryProcess({
    candidate,
    price,
    unitSize,
    unitAmount,
    currency,
    inBudget,
    nearBudget,
    sectorHeld,
    businessHits: mentioned ? businessHits : [],
    valueHits: mentioned ? valueHits : [],
    badHits: mentioned ? badHits : [],
  });
  const extendedRun = isExtendedRunChart(price);
  if (extendedRun) {
    process = boostProcessStage(process, "買い時", -10, "3年で大きく上昇済み。早めに入る局面ではなく押し目待ち");
    process = boostProcessStage(process, "リスク", -6, "高値追いになりやすい");
    score -= 24;
    risks.push(`早めに入る候補ではなく押し目待ち: ${extendedRunText(price)}`);
  } else if (earlySignal?.score >= 75) {
    process = boostProcessStage(process, "買い時", 6, "早めに入りやすい条件");
    score += isUsDiscoveryCandidate(candidate) ? 12 : 8;
    reasons.push(`早めに入る条件: ${earlySignal.summary}`);
  } else if (earlySignal?.score >= 60) {
    process = boostProcessStage(process, "買い時", 4, "上昇前の条件を一部満たす");
    score += isUsDiscoveryCandidate(candidate) ? 7 : 4;
    reasons.push(`初動候補: ${earlySignal.summary}`);
  } else if (earlySignal?.score && earlySignal.score < 45) {
    score -= isUsDiscoveryCandidate(candidate) ? 8 : 4;
    risks.push(`早めに入る条件は弱い: ${earlySignal.summary}`);
  }
  const businessValueScore = process.totalScore;
  const buyPlan = candidateBuyPlan(price, { unitSize, unitBudget: budget.unitBudget, unitAmount, businessValueScore, currency });
  const sellPlan = candidateExitPlan(price, buyPlan, { currency });

  return {
    ...candidate,
    sector,
    currency,
    targetCollection: currency === "USD" ? "us" : "jp",
    score: clamp(Math.round(score), 0, 100),
    businessValueScore,
    rankLabel: discoveryRankLabel(businessValueScore),
    earlySignal,
    process,
    reasons: uniqueText(reasons).slice(0, 4),
    risks: uniqueText(risks).slice(0, 3),
    evidenceQuality: candidate.discoverySource ? "検索から発掘" : "価格中心",
    unitSize,
    unitBudget: budget.unitBudget,
    unitBudgetUnlimited: budget.unitBudgetUnlimited === true,
    unitAmount,
    inBudget,
    nearBudget,
    buyPlan,
    sellPlan,
    price: compactDiscoveryPrice(price, unitSize, currency),
  };
}

function enhanceBusinessCandidate(candidate, results, positionSignal = null, peSignal = null) {
  if (!results.length) {
    return {
      ...candidate,
      businessEvidence: [],
      searchPosition: positionSignal,
      peSignal: peSignal || candidate.peSignal || null,
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

  if (peSignal?.matchScore >= 65 && peSignal.reportEligible !== false) {
    const bonus = Math.min(8, Math.round((peSignal.matchScore - 50) / 5));
    score += bonus;
    businessValueScore += bonus * 2;
    candidate.process = boostProcessStage(candidate.process, "再編", Math.min(8, bonus + 2), "PE買収・再編の項目に合う");
    reasons.push(`PE候補チェック: ${peSignal.summary}`);
  } else if (peSignal?.matchScore >= PE_PRIORITY_MIN_SCORE && peSignal.reportEligible !== false) {
    score += 2;
    businessValueScore += 2;
    candidate.process = boostProcessStage(candidate.process, "再編", 3, "PE買収の一部項目に合う");
  } else if (peSignal?.matchScore) {
    risks.push("PE候補としては根拠が薄い");
  }

  const process = finalizeDiscoveryProcess(candidate.process);
  const boundedBusinessValue = process.totalScore;
  const buyPlan = candidateBuyPlan(candidate.price || {}, {
    unitSize: candidate.unitSize,
    unitBudget: candidate.unitBudget,
    unitAmount: candidate.unitAmount,
    businessValueScore: boundedBusinessValue,
    currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate),
  });
  return {
    ...candidate,
    score: clamp(Math.round(score), 0, 100),
    businessValueScore: boundedBusinessValue,
    rankLabel: discoveryRankLabel(boundedBusinessValue),
    process,
    buyPlan,
    sellPlan: candidateExitPlan(candidate.price || {}, buyPlan, { currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate) }),
    evidenceQuality,
    searchPosition: positionSignal,
    peSignal: peSignal || candidate.peSignal || null,
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
      distanceFromBuyLine1y: candidate.price?.distanceFromBuyLine1y,
      buyLine1y: candidate.price?.buyLine1y,
      buyTiming1y: candidate.price?.buyTiming1y,
      maxDrawdown3y: candidate.price?.maxDrawdown3y,
      dividendYield: candidate.price?.dividendYield,
      dividendPerShareTtm: candidate.price?.dividendPerShareTtm,
    },
    searchPosition: candidate.searchPosition || null,
    peSignal: candidate.peSignal || null,
    earlySignal: candidate.earlySignal || null,
    buyPlan: {
      stance: candidate.buyPlan?.stance,
      maxBuyPrice: candidate.buyPlan?.maxBuyPrice,
    },
    sellPlan: candidate.sellPlan || null,
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

  const model = await getLmStudioModel();
  const map = new Map();
  const errors = [];
  for (const chunk of chunkArray(items, 6)) {
    try {
      for (const [symbol, review] of await aiDiscoveryReviewChunk(model, chunk)) {
        map.set(symbol, review);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  if (!map.size && errors.length) throw errors[0];
  return map;
}

async function aiDiscoveryReviewChunk(model, items) {
  const prompt = [
    "あなたは日本株・米国株の候補発掘レビュー担当です。将来の利益を保証せず、根拠不足を厳しく扱ってください。",
    "目的は「事業として好調そうなのに、株価が高すぎず、買い場ラインや買い目安以下で検討できる候補」を上に残すことです。",
    "米国株は特に、すでに急騰した後ではなく、買い場以下・3年目安付近・1か月反発・3か月非過熱・出来高増のような、早めに入る条件を重視してください。",
    "過去3年の流れに対する現在価格、1年買い場ライン、早めに入る条件のスコア、配当利回り、検索順位に出る材料、短期の過熱、下落リスク、検索根拠の薄さを重視してください。",
    "1年買い場ラインを下回っていて、事業材料も良いものはプラス評価してください。上がり切った高値圏はマイナス評価してください。",
    "PEファンドが買いそうな会社かは、割安に見える材料、安定キャッシュフロー、株主変化、再編余地、買収されにくい要因に分けて評価してください。ただしPE要素だけで高い価格で買う判断を肯定しないでください。",
    "日本語は一般的な投資メモの表現にしてください。買収妙味、割安放置、PEの中小型狙いのような不自然な言い方は使わず、理由と買う時の影響が分かる言葉で書いてください。",
    "adjustmentは-8から8の整数。根拠が薄い場合は0以下、悪材料や高い価格で買ってしまう懸念が強い場合はマイナスにしてください。",
    "出力はJSONのみ。形式は {\"reviews\":[{\"symbol\":\"9433.T\",\"adjustment\":2,\"summary\":\"...\",\"positives\":[\"...\"],\"risks\":[\"...\"]}]}。米国株は IBM のようにティッカーをそのまま返してください。",
    "",
    JSON.stringify({ candidates: items }),
  ].join("\n");

  const content = await callLmStudioResponses(model, prompt, {
    instructions: "Return strict JSON only. Do not explain.",
    maxOutputTokens: 5000,
  }).catch(async (error) => {
    if (String(error.message || "").includes("404")) {
      return callLmStudioChat(model, prompt, {
        system: "Return strict JSON only. Do not explain.",
        maxTokens: 5000,
      });
    }
    throw error;
  });
  const parsed = parseJsonObject(content);
  const reviews = Array.isArray(parsed) ? parsed : parsed.reviews || parsed.rankings || [];
  const map = new Map();
  for (const review of reviews) {
    const symbol = normalizeDiscoverySymbol(review?.symbol);
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
    "PEファンド、TOB、MBO、大量保有、物言う株主の傾向があれば、過去の買収対象に多い特徴として短く含めてください。",
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
  const buyPlan = candidateBuyPlan(candidate.price || {}, {
    unitSize: candidate.unitSize,
    unitBudget: candidate.unitBudget,
    unitAmount: candidate.unitAmount,
    businessValueScore,
    currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate),
  });
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
    buyPlan,
    sellPlan: candidateExitPlan(candidate.price || {}, buyPlan, { currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate) }),
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
  if (isJapaneseListedSymbol(candidate.symbol)) {
    return results.filter((item) => isJpStockSpecificEvidence(item, candidate));
  }
  const code = String(candidate.symbol || "").replace(".T", "");
  const name = String(candidate.name || "").toLowerCase();
  const symbol = String(candidate.symbol || "").toLowerCase();
  return results.filter((item) => {
    const text = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
    return text.includes(code) || text.includes(symbol) || text.includes(name);
  });
}

function jpStockEvidenceQueries(stock = {}) {
  const code = jpStockCode(stock.symbol);
  const name = stock.name || code;
  const base = [
    `${code} ${name} 株価 ニュース 決算 業績予想 事業変化 Yahoo 株探`,
    `${code} ${name} 決算後 急落 失望売り 自社株買いなし 増配なし 株主還元`,
    `${code} ${name} 中期経営計画 受注 利益率 ガイダンス 上方修正 下方修正 TDnet`,
    `${code} ${name} 時価総額 PBR PER EV EBITDA ネットキャッシュ 営業キャッシュフロー`,
    `${code} ${name} 信用倍率 空売り 需給 大量保有 アクティビスト TOB MBO PEファンド`,
  ];
  if (!code) return base.map((text) => ({ text: text.trim(), topic: "company" }));
  return [
    { text: `site:kabutan.jp/stock/news?code=${code} ${name} 決算 業績 配当 自社株買い`, topic: "company" },
    { text: `site:finance.yahoo.co.jp/quote/${code}.T ${name} ニュース 決算 業績`, topic: "company" },
    { text: `site:irbank.net/${code} ${name} PBR PER 時価総額 キャッシュフロー`, topic: "company" },
    ...base.map((text) => ({ text, topic: "company" })),
  ];
}

async function searchJpStockEvidence(stock = {}, websiteLimit = 20) {
  const queries = jpStockEvidenceQueries(stock);
  const perQueryLimit = Math.max(3, Math.ceil(websiteLimit / Math.max(1, queries.length)));
  const pages = await mapLimit(queries, 2, async (query) => (
    searchGoogle(query.text, { limit: perQueryLimit, language: "ja-JP" }).catch(() => [])
  ));
  return uniqueBy(pages.flat(), (item) => item.url)
    .filter((item) => isJpStockSpecificEvidence(item, stock))
    .sort((a, b) => jpStockEvidenceScore(b, stock) - jpStockEvidenceScore(a, stock))
    .slice(0, websiteLimit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function isJapaneseListedSymbol(symbol = "") {
  return /^\d{4}(?:\.T)?$/i.test(String(symbol || "").trim());
}

function jpStockCode(symbol = "") {
  const match = String(symbol || "").toUpperCase().match(/(\d{4})(?:\.T)?/);
  return match ? match[1] : "";
}

function isJpStockSpecificEvidence(item = {}, stock = {}) {
  const url = normalizeUrl(item.url);
  const text = cleanText(`${item.title || ""} ${item.snippet || ""} ${url}`);
  if (!text) return false;
  if (isLowValueStockEvidence(item, url)) return false;
  const code = jpStockCode(stock.symbol);
  const hasCode = code ? jpEvidenceHasCode(item, code) : false;
  if (hasConflictingJpStockCode(item, code) && !hasCode) return false;
  if (hasCode) return true;
  return hasStrongCompanyName(item, stock);
}

function jpStockEvidenceScore(item = {}, stock = {}) {
  const url = normalizeUrl(item.url);
  const host = hostOf(url).toLowerCase();
  const text = businessContextText(`${item.title || ""} ${item.snippet || ""} ${url}`);
  const code = jpStockCode(stock.symbol);
  let score = 0;
  if (code && jpEvidenceHasCode(item, code)) score += 45;
  if (hasStrongCompanyName(item, stock)) score += 18;
  if (/kabutan\.jp|finance\.yahoo\.co\.jp|tdnet|jpx|irbank\.net|nikkei\.com|buffett-code|minkabu/.test(host)) score += 24;
  if (/決算|業績|上方修正|下方修正|配当|増配|減配|自社株買い|株主還元|中期経営|受注|営業利益|キャッシュフロー|pbr|per|ev.?ebitda|tob|mbo|大量保有|アクティビスト/i.test(text)) score += 16;
  if (item.publishedDate && isRecentSearchDate(item.publishedDate, 120)) score += 8;
  return score;
}

function jpEvidenceHasCode(item = {}, code = "") {
  if (!code) return false;
  const raw = `${item.title || ""} ${item.snippet || ""} ${item.url || ""}`;
  const normalized = raw.toLowerCase();
  const escaped = escapeRegExp(code);
  return new RegExp(`(^|[^0-9])${escaped}(\\.t|[^0-9]|$)`, "i").test(raw)
    || new RegExp(`(code|quote|stock|stocks|symbol|銘柄コード|証券コード)[=/._-]*${escaped}`, "i").test(normalized)
    || normalized.includes(`/quote/${code}.t`)
    || normalized.includes(`code=${code}`)
    || normalized.includes(`/stocks/${code}`)
    || normalized.includes(`/stock/${code}`)
    || normalized.includes(`/${code}/`)
    || normalized.includes(`/${code}-`);
}

function hasConflictingJpStockCode(item = {}, code = "") {
  const text = cleanText(`${item.title || ""} ${item.snippet || ""} ${item.url || ""}`);
  const matches = [
    ...[...text.matchAll(/(?:証券コード|銘柄コード|コード|code|quote|stock|stocks)[^0-9]{0,12}(\d{4})(?:\.T)?/gi)].map((match) => match[1]),
    ...[...text.matchAll(/[<（(]\s*(\d{4})(?:\.T)?\s*[>）)]/gi)].map((match) => match[1]),
    ...[...text.matchAll(/\/(?:quote|stock|stocks)\/?(\d{4})(?:\.T)?/gi)].map((match) => match[1]),
    ...[...text.matchAll(/[?&]code=(\d{4})/gi)].map((match) => match[1]),
  ]
    .filter((value) => !/^(19|20)\d{2}$/.test(value));
  const uniqueCodes = uniqueText(matches);
  return uniqueCodes.some((value) => value !== code);
}

function hasStrongCompanyName(item = {}, stock = {}) {
  const haystack = normalizeCompanyKey(`${item.title || ""} ${item.snippet || ""} ${item.url || ""}`);
  const aliases = jpCompanyAliases(stock);
  return aliases.some((alias) => alias.length >= 3 && haystack.includes(alias));
}

function jpCompanyAliases(stock = {}) {
  const rawValues = [
    stock.name,
    stock.shortName,
    stock.longName,
    ...(Array.isArray(stock.aliases) ? stock.aliases : []),
  ];
  return uniqueText(rawValues.map(normalizeCompanyKey).filter((value) => value.length >= 3));
}

function normalizeCompanyKey(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|（株）|㈱|ホールディングス|holdings?|corporation|corp\.?|inc\.?|company|co\.?,?\s*ltd\.?/gi, "")
    .replace(/[ァィゥェォッャュョ]/g, (char) => ({
      "ァ": "ア",
      "ィ": "イ",
      "ゥ": "ウ",
      "ェ": "エ",
      "ォ": "オ",
      "ッ": "ツ",
      "ャ": "ヤ",
      "ュ": "ユ",
      "ョ": "ヨ",
    }[char] || char))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/[\s　・･,，.．、。:：;；/／\\\-ー_＿()[\]（）【】「」『』"'`]/g, "");
}

function isLowValueStockEvidence(item = {}, url = "") {
  const titleAndUrl = cleanText(`${item.title || ""} ${url}`).toLowerCase();
  const haystack = cleanText(`${item.title || ""} ${item.snippet || ""} ${url}`).toLowerCase();
  if (/porn|casino|betting|download|crack|torrent|login|sign in/.test(haystack)) return true;
  if (/careers?|jobs?|採用|求人|転職|ログイン|社員用|myappid|linkedin|wikipedia|facebook|instagram|youtube|x\.com|twitter/.test(titleAndUrl)) return true;
  return false;
}

function buildDiscoveryProcess({
  price,
  unitSize,
  unitAmount,
  currency = "JPY",
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
  let restructuring = 0;
  const notes = {
    business: [],
    value: [],
    timing: [],
    risk: [],
    fit: [],
    restructuring: [],
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
    notes.value.push(`${unitSize}株で${formatMoney(unitAmount, currency)}`);
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
  if (Number.isFinite(price.distanceFromBuyLine1y)) {
    if (price.buyTiming1y === "DEEP") {
      timing += 10;
      notes.timing.push("1年買い場ラインを大きく下回る");
    } else if (price.buyTiming1y === "UNDER") {
      timing += 9;
      notes.timing.push("1年買い場ライン以下");
    } else if (price.buyTiming1y === "NEAR") {
      timing += 5;
      notes.timing.push("1年買い場ラインに近い");
    } else if (price.distanceFromBuyLine1y > 18) {
      timing -= 4;
      notes.timing.push("1年買い場ラインより高い");
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
  if (isExtendedRunChart(price)) {
    timing -= 10;
    risk -= 6;
    notes.timing.push("3年で上がりすぎており、初動ではない");
    notes.risk.push("高値追いになりやすい");
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

  restructuring += 1;
  notes.restructuring.push("PE買収・再編余地は個別検索で確認");

  return finalizeDiscoveryProcess({
    stages: [
      processStage("事業", business, 25, notes.business),
      processStage("割安", value, 25, notes.value),
      processStage("買い時", timing, 20, notes.timing),
      processStage("リスク", risk, 15, notes.risk),
      processStage("相性", fit, 15, notes.fit),
      processStage("再編", restructuring, 10, notes.restructuring),
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
  const currency = options.currency || price.currency || "JPY";
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
  const buyLine = nullablePositiveNumber(price.buyLine1y);
  const atrAdjustedBuyLine = nullablePositiveNumber(price.technicalEntry?.atrAdjustedBuyLine);
  const atrPct = Number.isFinite(price.atrPct) ? price.atrPct : null;
  if (isExtendedRunChart(price)) {
    const low1y = nullablePositiveNumber(price.low1y);
    const waitCandidates = [
      current * 0.92,
      atrAdjustedBuyLine,
      buyLine ? buyLine * 0.94 : null,
      low1y ? low1y * 1.04 : null,
    ].filter((value) => Number.isFinite(value) && value > 0);
    const maxBuyPrice = Math.max(1, Math.min(...waitCandidates));
    const unitAmountAtMax = maxBuyPrice * unitSize;
    const runText = extendedRunText(price);
    return {
      stance: "押し目待ち",
      maxBuyPrice: Math.round(maxBuyPrice * 10) / 10,
      unitAmountAtMax: Math.round(unitAmountAtMax),
      summary: `${runText}。買い場ライン付近でも高値追いになりやすいので、${formatMoney(maxBuyPrice, currency)}以下まで待ちます。`,
      checks: uniqueText([
        runText,
        "早めに入る局面ではない",
        buyLine ? "1年買い場だけでは買い判定にしない" : "",
        Number.isFinite(atrPct) && atrPct >= 4 ? "ATRが大きいので深めに待つ" : "",
        "大きな押し目待ち",
      ]).filter(Boolean).slice(0, 4),
    };
  }
  const nearTrendCap = trendPrice ? trendPrice * 1.02 : current * 0.98;
  const underBuyLine = buyLine && current <= buyLine;
  const pullbackCap = Number.isFinite(price.return3m) && price.return3m > 18
    ? current * 0.94
    : underBuyLine
    ? current * 1.01
    : current * 0.98;
  const budgetCap = unitBudget ? unitBudget / unitSize : current * 1.05;
  const buyLineCap = buyLine ? buyLine * 1.02 : current * 1.05;
  const volatilityCap = atrAdjustedBuyLine && Number.isFinite(atrPct) && atrPct >= 4
    ? atrAdjustedBuyLine
    : current * 1.05;
  const maxBuyPrice = Math.max(1, Math.min(nearTrendCap, pullbackCap, budgetCap, buyLineCap, volatilityCap));
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
  } else {
    checks.push("予算上限なし");
  }

  if (buyLine && Number.isFinite(price.distanceFromBuyLine1y)) {
    if (price.distanceFromBuyLine1y <= 0) checks.push("1年買い場ライン以下");
    else if (price.distanceFromBuyLine1y <= 3) checks.push("1年買い場ラインに近い");
    else checks.push("1年買い場ラインより高い");
  }

  if (Number.isFinite(price.return3m)) {
    if (price.return3m >= 28) checks.push("短期で上がりすぎに注意");
    else if (price.return3m >= -5) checks.push("短期の値動きは許容範囲");
    else checks.push("直近は弱め");
  }

  if (Number.isFinite(atrPct)) {
    checks.push(atrPct >= 4 ? "ATRで指値を深めに補正" : "ATRは通常範囲");
  }
  if (price.sma5CrossUp) checks.push("5日線上抜け");
  if (price.rsiCross30) checks.push("RSI30復帰");
  if (price.candlestickSignal?.label) checks.push(price.candlestickSignal.label);
  if (price.regime?.label) checks.push(`相場: ${price.regime.label}`);

  const gapToMax = ((current - maxBuyPrice) / maxBuyPrice) * 100;
  const gapFromMaxAmount = maxBuyPrice - current;
  const gapFromMaxPct = (gapFromMaxAmount / current) * 100;
  const gapFromMaxText = gapFromMaxAmount >= 0
    ? `今は買い目安より${formatMoney(gapFromMaxAmount, currency)}安い`
    : `今は買い目安より${formatMoney(Math.abs(gapFromMaxAmount), currency)}高い`;
  const strongScore = Number(options.businessValueScore || 0) >= 65;
  const technicalReady = price.technicalEntry?.ready === true;
  let stance = "待つ";
  if ((buyLine && current <= buyLine && strongScore && technicalReady) || (gapToMax <= 1 && strongScore && technicalReady)) stance = "今すぐ検討";
  else if (gapToMax <= 1 && strongScore) stance = "反転待ち";
  else if (gapToMax <= 7) stance = "指値で待つ";
  else stance = "押し目待ち";

  return {
    stance,
    maxBuyPrice: Math.round(maxBuyPrice * 10) / 10,
    unitAmountAtMax: Math.round(unitAmountAtMax),
    summary: `${formatMoney(maxBuyPrice, currency)}以下なら入口候補。${gapFromMaxText}（${formatSignedPercent(gapFromMaxPct)}）です。${technicalReady ? "反転確認あり。" : "反転確認は待ちます。"}`,
    checks: uniqueText(checks).slice(0, 6),
  };
}

function candidateExitPlan(price = {}, buyPlan = {}, options = {}) {
  const current = nullablePositiveNumber(price.current);
  const buy = nullablePositiveNumber(buyPlan.maxBuyPrice) || current;
  const currency = options.currency || price.currency || "JPY";
  if (!current || !buy) {
    return {
      targetPrice: null,
      stopPrice: null,
      summary: "価格データ取得後に売り場ラインを出します。",
    };
  }
  const trend = nullablePositiveNumber(price.trendPrice3y);
  const high52 = nullablePositiveNumber(price.high52);
  const sellCandidates = [
    buy * 1.12,
    current * 1.08,
    trend ? trend * 1.08 : null,
    high52 ? high52 * 0.96 : null,
  ].filter(Number.isFinite);
  const targetPrice = Math.max(...sellCandidates);
  const buyLine = nullablePositiveNumber(price.buyLine1y);
  const stopPrice = Math.max(1, Math.min(buy * 0.92, buyLine ? buyLine * 0.92 : buy * 0.92));
  return {
    targetPrice: Math.round(targetPrice * 10) / 10,
    stopPrice: Math.round(stopPrice * 10) / 10,
    summary: `${formatMoney(targetPrice, currency)}前後で利益確定・見直し、${formatMoney(stopPrice, currency)}割れで理由を再確認。`,
  };
}

function compactDiscoveryPrice(price, unitSize = 100, currency = "JPY") {
  return {
    currency,
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
    buyLine1y: price.buyLine1y,
    deepBuyLine1y: price.deepBuyLine1y,
    distanceFromBuyLine1y: price.distanceFromBuyLine1y,
    buyTiming1y: price.buyTiming1y,
    low1y: price.low1y,
    low1yDate: price.low1yDate,
    high52: price.high52,
    latestVolume: price.latestVolume,
    averageVolume20: price.averageVolume20,
    averageVolume60: price.averageVolume60,
    volumeRatio20: price.volumeRatio20,
    logReturn1d: price.logReturn1d,
    histVol20: price.histVol20,
    atr14: price.atr14,
    atrPct: price.atrPct,
    sma5: price.sma5,
    sma5CrossUp: Boolean(price.sma5CrossUp),
    rsi14: price.rsi14,
    rsiCross30: Boolean(price.rsiCross30),
    candlestickSignal: price.candlestickSignal || null,
    technicalEntry: price.technicalEntry || technicalEntryFallback(),
    regime: price.regime || null,
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

function candidateToUsStock(candidate) {
  return normalizeUsStock({
    symbol: candidate.symbol,
    name: candidate.name,
    market: candidate.market || "NYSE",
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
  const universe = [...discoveryUniverse, ...usDiscoveryUniverse].find((candidate) => candidate.symbol === stock.symbol);
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
  const sector = stock.sector || stockSector(stock);
  const queries = jpStockEvidenceQueries(stock);
  if (sector && sector !== "その他") {
    queries.push({ text: `${sector} 業界 市況 見通し 日本株 決算 業績 需要 リスク`, topic: "sector" });
  }
  const searchResults = [];
  const perQueryLimit = Math.max(5, Math.ceil(options.websiteLimit / queries.length));

  for (const query of queries) {
    const results = await searchGoogle(query.text, { limit: perQueryLimit, language: "ja-JP" }).catch(() => []);
    searchResults.push(...results.map((item) => ({ ...item, topic: query.topic, query: query.text })));
  }

  const companyResults = uniqueBy(searchResults
    .filter((item) => item.topic !== "sector")
    .filter((item) => isJpStockSpecificEvidence(item, stock))
    .sort((a, b) => jpStockEvidenceScore(b, stock) - jpStockEvidenceScore(a, stock)), (item) => item.url);
  const sectorResults = uniqueBy(searchResults
    .filter((item) => item.topic === "sector")
    .filter((item) => isRelevantSectorEvidence(item, sector)), (item) => item.url);
  const sectorLimit = Math.min(6, Math.max(2, Math.ceil(options.websiteLimit / 3)));
  const deduped = uniqueBy([
    ...companyResults.slice(0, options.websiteLimit),
    ...sectorResults.slice(0, sectorLimit),
  ], (item) => item.url);
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
        publishedDate: item.publishedDate || "",
        kind: item.topic === "sector" ? "sector" : "search",
        sector,
      })),
      ...crawled.map((item) => ({
        title: item.title,
        url: item.url,
        source: hostOf(item.url),
        snippet: cleanText(item.text).slice(0, 260),
        publishedDate: item.publishedDate || "",
        kind: `depth ${item.depth}`,
        sector,
      })),
    ].slice(0, 30),
    contextText: [
      ...deduped.map((item) => `${item.title}\n${item.snippet}\n${item.url}`),
      ...crawled.map((item) => `${item.title}\n${item.text}\n${item.url}`),
    ].join("\n\n").slice(0, 28000),
  };
}

async function searchGoogle(query, { limit, language } = {}) {
  const settings = await readSettings();
  const resolvedLanguage = language || (containsJapanese(query) ? "ja-JP" : "en-US");
  if (settings.searchProvider === "searxng") {
    return searchSearxng(query, { limit, settings, language: resolvedLanguage });
  }
  return searchGoogleCustom(query, { limit, settings, language: resolvedLanguage });
}

async function searchSearxng(query, { limit, settings, language = "ja-JP" }) {
  if (!settings.searxngUrl) return [];
  const engines = normalizeSearxngEngines(settings.searxngEngines);
  const attempts = [
    { categories: "general", engines, timeout: 18000 },
  ];
  const results = [];
  const maxPages = limit > 10 ? 3 : 1;

  for (const attempt of attempts) {
    if (uniqueBy(results, (item) => item.url).length >= limit) break;
    for (let pageno = 1; pageno <= maxPages; pageno += 1) {
      if (uniqueBy(results, (item) => item.url).length >= limit) break;
      const pageResults = await fetchSearxngResults(query, {
        settings,
        language,
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

async function fetchSearxngResults(query, { settings, language, categories, engines, timeout, pageno = 1 }) {
  const data = await fetchSearxngData(query, { settings, language, categories, engines, timeout, pageno });
  return (data.results || [])
    .filter((item) => item.url && /^https?:\/\//.test(item.url))
    .map((item) => ({
      title: cleanText(item.title || item.url),
      url: item.url,
      snippet: cleanText(item.content || item.snippet || ""),
      publishedDate: searchResultPublishedDate(item),
    }));
}

async function fetchSearxngData(query, { settings, language = "ja-JP", categories, engines, timeout, pageno = 1 }) {
  let lastError = null;
  for (const base of searxngCandidateUrls(settings)) {
    try {
      const url = new URL(base);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("language", language);
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
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("SearXNGに接続できません");
}

function searxngCandidateUrls(settings = defaultSettings) {
  const configured = normalizeUrl(settings.searxngUrl) || defaultSettings.searxngUrl;
  const urls = [configured];
  try {
    const parsed = new URL(configured);
    if (parsed.hostname === "host.docker.internal") {
      urls.push(configured.replace("host.docker.internal", "127.0.0.1"));
      urls.push(configured.replace("host.docker.internal", "localhost"));
    } else if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      urls.push(configured.replace(parsed.hostname, "host.docker.internal"));
    }
  } catch {
    // Keep the configured value as the only attempt.
  }
  return [...new Set(urls.map(normalizeUrl).filter(Boolean))];
}

function normalizeSearxngEngines(value) {
  const blocked = new Set(["duckduckgo", "google cse", "reuters", "bing news"]);
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const engines = uniqueText(raw
    .split(",")
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean)
    .filter((item) => !blocked.has(item))
    .filter((item) => /^[a-z0-9 _.-]{2,40}$/.test(item)));
  return engines.slice(0, 8).join(",") || "bing";
}

async function searchGoogleCustom(query, { limit, settings, language = "ja-JP" }) {
  if (!settings.googleApiKey || !settings.googleCseId) return [];
  const results = [];
  for (let start = 1; results.length < limit && start <= 91; start += 10) {
    const url = new URL(settings.googleSearchUrl);
    url.searchParams.set("key", settings.googleApiKey);
    url.searchParams.set("cx", settings.googleCseId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(10, limit - results.length)));
    url.searchParams.set("start", String(start));
    url.searchParams.set("hl", language.startsWith("en") ? "en" : "ja");
    url.searchParams.set("gl", language.startsWith("en") ? "us" : "jp");
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
        publishedDate: searchResultPublishedDate(item),
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
  return { title, text, html, publishedDate: searchResultPublishedDate({ title, url, snippet: text, html }) };
}

async function fetchPriceHistory(symbol, options = {}) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "5y");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "dividends");
  const timeout = clamp(Number(options.timeout || options.timeoutMs || PRICE_HISTORY_TIMEOUT_MS), 1000, 30000);
  const response = await fetchWithTimeout(url, { timeout }).catch(() => null);
  if (!response?.ok) return emptyPrice();
  const data = await response.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) return emptyPrice();
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];
  const dividends = Object.values(result.events?.dividends || {})
    .map((item) => ({
      date: new Date(Number(item.date) * 1000).toISOString().slice(0, 10),
      amount: Number(item.amount),
    }))
    .filter((item) => item.date && Number.isFinite(item.amount) && item.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const series = cleanPriceSeries(timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: Number(opens[index]),
      high: Number(highs[index]),
      low: Number(lows[index]),
      close: Number(closes[index]),
      volume: Number(volumes[index]),
    }))
    .filter((point) => Number.isFinite(point.close)));
  return priceMetrics(series, {
    shortName: meta.shortName,
    longName: meta.longName,
    symbol: meta.symbol,
    dividends,
  });
}

function combineBtcJpySeries(btcSeries = [], fxSeries = []) {
  const btc = (btcSeries || [])
    .map((point) => ({
      date: normalizeDate(point.date),
      close: nullablePositiveNumber(point.close),
      open: nullablePositiveNumber(point.open),
      high: nullablePositiveNumber(point.high),
      low: nullablePositiveNumber(point.low),
      volume: Number(point.volume),
    }))
    .filter((point) => point.date && point.close)
    .sort((a, b) => a.date.localeCompare(b.date));
  const fx = (fxSeries || [])
    .map((point) => ({
      date: normalizeDate(point.date),
      close: nullablePositiveNumber(point.close),
    }))
    .filter((point) => point.date && point.close)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!btc.length || !fx.length) return [];
  const combined = [];
  let fxIndex = 0;
  let lastRate = null;
  for (const point of btc) {
    while (fxIndex < fx.length && fx[fxIndex].date <= point.date) {
      lastRate = fx[fxIndex].close;
      fxIndex += 1;
    }
    if (!lastRate) continue;
    combined.push({
      date: point.date,
      open: (point.open || point.close) * lastRate,
      high: (point.high || point.close) * lastRate,
      low: (point.low || point.close) * lastRate,
      close: point.close * lastRate,
      volume: point.volume,
    });
  }
  return combined;
}

function priceMetrics(series, meta = {}) {
  series = cleanPriceSeries(series);
  if (series.length < 2) return emptyPrice(series, meta);
  const current = last(series).close;
  const closes = series.map((point) => point.close);
  const volumeValues = series.map((point) => point.volume).filter(Number.isFinite);
  const latestVolume = Number.isFinite(last(series).volume) ? last(series).volume : null;
  const averageVolume20 = average(volumeValues.slice(-20));
  const averageVolume60 = average(volumeValues.slice(-60));
  const series3y = series.slice(-756);
  const closes3y = series3y.map((point) => point.close);
  const series52 = series.slice(-252);
  const high52Point = highestClosePoint(series52);
  const high3yPoint = highestClosePoint(series3y);
  const high52 = high52Point?.close || Math.max(...closes.slice(-252));
  const low52 = Math.min(...closes.slice(-252));
  const high3y = high3yPoint?.close || Math.max(...closes3y);
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
  const buyTiming = priceBuyTiming(series);
  const technical = technicalIndicators(series, buyTiming);
  const regime = regimeAssessment(series);
  return {
    current,
    return1m: returnFrom(series, 21),
    return3m: returnFrom(series, 63),
    return6m: returnFrom(series, 126),
    return1y: returnFrom(series, 252),
    return3y,
    annualizedReturn3y,
    high52,
    high52Date: high52Point?.date || "",
    low52,
    high3y,
    high3yDate: high3yPoint?.date || "",
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
    latestVolume,
    averageVolume20,
    averageVolume60,
    volumeRatio20: latestVolume && averageVolume20 ? latestVolume / averageVolume20 : null,
    logReturn1d: technical.logReturn1d,
    histVol20: technical.histVol20,
    atr14: technical.atr14,
    atrPct: technical.atrPct,
    sma5: technical.sma5,
    sma5CrossUp: technical.sma5CrossUp,
    rsi14: technical.rsi14,
    rsiCross30: technical.rsiCross30,
    candlestickSignal: technical.candlestickSignal,
    technicalEntry: technical.entry,
    regime,
    shortName: cleanText(meta.shortName || ""),
    longName: cleanText(meta.longName || ""),
    yahooSymbol: cleanText(meta.symbol || ""),
    ...buyTiming,
    ...dividend,
    series: series3y,
  };
}

function cleanPriceSeries(series = []) {
  const byDate = new Map();
  for (const point of series || []) {
    const date = normalizeDate(point.date);
    const close = nullablePositiveNumber(point.close);
    if (!date || !close) continue;
    byDate.set(date, {
      date,
      open: nullablePositiveNumber(point.open) || close,
      high: Math.max(nullablePositiveNumber(point.high) || close, close),
      low: Math.min(nullablePositiveNumber(point.low) || close, close),
      close,
      volume: Number(point.volume),
    });
  }
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 5) return sorted;
  return sorted.filter((point, index, points) => !isSuspiciousPricePoint(point, index, points));
}

function isSuspiciousPricePoint(point, index, points = []) {
  const neighbors = [
    ...points.slice(Math.max(0, index - 8), index),
    ...points.slice(index + 1, index + 9),
  ].map((item) => item.close).filter(Number.isFinite);
  if (neighbors.length < 4) return false;
  const localMedian = quantile(neighbors, 0.5);
  if (!localMedian) return false;
  const previous = nullablePositiveNumber(points[index - 1]?.close);
  const next = nullablePositiveNumber(points[index + 1]?.close);
  const tooLow = point.close < localMedian * 0.25;
  const tooHigh = point.close > localMedian * 4;
  const isolatedLow = point.close < localMedian * 0.55
    && ((previous && previous > point.close * 1.8) || (next && next > point.close * 1.8))
    && (!previous || !next || Math.abs(previous - next) / localMedian < 0.25);
  const isolatedHigh = point.close > localMedian * 1.8
    && ((previous && previous * 1.8 < point.close) || (next && next * 1.8 < point.close))
    && (!previous || !next || Math.abs(previous - next) / localMedian < 0.25);
  if (tooLow) {
    return Boolean((previous && previous > point.close * 2.8) || (next && next > point.close * 2.8));
  }
  if (tooHigh) {
    return Boolean((previous && previous * 2.8 < point.close) || (next && next * 2.8 < point.close));
  }
  if (isolatedLow || isolatedHigh) return true;
  return false;
}

function priceBuyTiming(series = []) {
  const clean = cleanPriceSeries(series)
    .map((point) => ({ date: normalizeDate(point.date), close: Number(point.close) }))
    .filter((point) => point.date && Number.isFinite(point.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length < 40) return emptyBuyTiming();
  const latest = last(clean);
  const latestTime = new Date(`${latest.date}T00:00:00`).getTime();
  if (!Number.isFinite(latestTime)) return emptyBuyTiming();
  const oneYear = clean.filter((point) => {
    const time = new Date(`${point.date}T00:00:00`).getTime();
    return Number.isFinite(time) && latestTime - time <= 366 * 86400000;
  });
  if (oneYear.length < 40) return emptyBuyTiming();

  const closes = oneYear.map((point) => point.close).sort((a, b) => a - b);
  const buyLine1y = quantile(closes, 0.25);
  const deepBuyLine1y = quantile(closes, 0.15);
  const median1y = quantile(closes, 0.5);
  const low = oneYear.reduce((best, point) => (point.close < best.close ? point : best), oneYear[0]);
  const distanceFromBuyLine1y = buyLine1y ? ((latest.close - buyLine1y) / buyLine1y) * 100 : null;
  let status = "ABOVE";
  if (deepBuyLine1y && latest.close <= deepBuyLine1y * 1.02) status = "DEEP";
  else if (buyLine1y && latest.close <= buyLine1y) status = "UNDER";
  else if (buyLine1y && latest.close <= buyLine1y * 1.03) status = "NEAR";
  else if (median1y && latest.close <= median1y) status = "MID";

  return {
    buyLine1y,
    deepBuyLine1y,
    median1y,
    low1y: low.close,
    low1yDate: low.date,
    distanceFromBuyLine1y,
    buyTiming1y: status,
  };
}

function emptyBuyTiming() {
  return {
    buyLine1y: null,
    deepBuyLine1y: null,
    median1y: null,
    low1y: null,
    low1yDate: "",
    distanceFromBuyLine1y: null,
    buyTiming1y: "UNKNOWN",
  };
}

function technicalIndicators(series = [], buyTiming = {}) {
  const clean = cleanPriceSeries(series);
  const closes = clean.map((point) => point.close).filter(Number.isFinite);
  const latest = clean.at(-1) || {};
  const previous = clean.at(-2) || {};
  const current = nullablePositiveNumber(latest.close);
  if (clean.length < 20 || !current) {
    return {
      logReturn1d: null,
      histVol20: null,
      atr14: null,
      atrPct: null,
      sma5: null,
      sma5CrossUp: false,
      rsi14: null,
      rsiCross30: false,
      candlestickSignal: null,
      entry: technicalEntryFallback("価格データが不足しています。"),
    };
  }

  const sma5 = average(closes.slice(-5));
  const previousSma5 = clean.length >= 6 ? average(closes.slice(-6, -1)) : null;
  const previousClose = nullablePositiveNumber(previous.close);
  const sma5CrossUp = Boolean(previousClose && previousSma5 && sma5 && previousClose <= previousSma5 && current > sma5);
  const rsiSeries = rsiValues(closes, 14);
  const rsi14 = lastFinite(rsiSeries);
  const previousRsi = previousFinite(rsiSeries);
  const rsiCross30 = Boolean(Number.isFinite(previousRsi) && previousRsi <= 30 && Number.isFinite(rsi14) && rsi14 > 30);
  const trueRanges = trueRangeValues(clean);
  const atr14 = average(trueRanges.slice(-14));
  const atrPct = atr14 && current ? (atr14 / current) * 100 : null;
  const histVol20 = annualizedVolatility(closes.slice(-21));
  const logReturn1d = previousClose ? Math.log(current / previousClose) : null;
  const candlestickSignal = latestCandlestickSignal(clean);
  const buyLine = nullablePositiveNumber(buyTiming.buyLine1y);
  const atrBuffer = atr14 ? atr14 * (Number.isFinite(atrPct) && atrPct > 4 ? 1.0 : 0.5) : 0;
  const atrAdjustedBuyLine = buyLine ? Math.max(0.01, buyLine - atrBuffer) : null;
  const nearBuyLine = buyLine
    ? current <= buyLine * 1.01 || (atrAdjustedBuyLine && current <= atrAdjustedBuyLine * 1.03)
    : false;
  const confirmationSignals = [
    sma5CrossUp ? "終値が5日線を上抜け" : "",
    rsiCross30 ? "RSIが30割れから再浮上" : "",
    candlestickSignal ? candlestickSignal.label : "",
  ].filter(Boolean);
  const risks = [
    buyLine && !nearBuyLine ? "買い場ラインまではまだ距離あり" : "",
    Number.isFinite(atrPct) && atrPct >= 6 ? "ATRが大きく、指値を深めに置きたい" : "",
    !confirmationSignals.length ? "反転サインはまだ未確認" : "",
  ].filter(Boolean);
  const ready = Boolean(nearBuyLine && confirmationSignals.length);
  const score = clamp(Math.round(
    35
    + (nearBuyLine ? 25 : 0)
    + (sma5CrossUp ? 15 : 0)
    + (rsiCross30 ? 15 : 0)
    + (candlestickSignal ? 10 : 0)
    - (Number.isFinite(atrPct) && atrPct >= 6 ? 8 : 0),
  ), 0, 100);
  const summary = ready
    ? "買い場付近で反転確認が出ています。翌営業日の失速を確認して入る候補です。"
    : nearBuyLine
    ? "買い場付近ですが、5日線・RSI・ローソク足の反転確認を待ちます。"
    : "まだ買い場ラインから離れています。追わずに待つ前提です。";

  return {
    logReturn1d,
    histVol20,
    atr14,
    atrPct,
    sma5,
    sma5CrossUp,
    rsi14,
    rsiCross30,
    candlestickSignal,
    entry: {
      ready,
      score,
      buyLine,
      atrAdjustedBuyLine,
      signals: confirmationSignals,
      risks,
      summary,
    },
  };
}

function technicalEntryFallback(summary = "更新後に表示します。") {
  return {
    ready: false,
    score: null,
    buyLine: null,
    atrAdjustedBuyLine: null,
    signals: [],
    risks: [],
    summary,
  };
}

function rsiValues(values = [], period = 14) {
  return values.map((_, index) => {
    if (index < period) return null;
    let gains = 0;
    let losses = 0;
    for (let i = index - period + 1; i <= index; i += 1) {
      const diff = values[i] - values[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (!avgLoss) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  });
}

function trueRangeValues(series = []) {
  const values = [];
  for (let i = 1; i < series.length; i += 1) {
    const point = series[i];
    const previousClose = nullablePositiveNumber(series[i - 1]?.close);
    const high = nullablePositiveNumber(point.high) || point.close;
    const low = nullablePositiveNumber(point.low) || point.close;
    if (!previousClose || !high || !low) continue;
    values.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }
  return values;
}

function latestCandlestickSignal(series = []) {
  const latest = series.at(-1);
  const previous = series.at(-2);
  if (!latest || !previous) return null;
  const open = nullablePositiveNumber(latest.open) || latest.close;
  const close = nullablePositiveNumber(latest.close);
  const high = nullablePositiveNumber(latest.high) || close;
  const low = nullablePositiveNumber(latest.low) || close;
  const prevOpen = nullablePositiveNumber(previous.open) || previous.close;
  const prevClose = nullablePositiveNumber(previous.close);
  if (!open || !close || !high || !low || !prevOpen || !prevClose) return null;
  const body = Math.abs(close - open);
  const range = Math.max(0.000001, high - low);
  const lowerShadow = Math.min(open, close) - low;
  const upperShadow = high - Math.max(open, close);
  const lowerShadowBullish = close > open && lowerShadow >= Math.max(body * 1.8, range * 0.35) && upperShadow <= range * 0.45;
  if (lowerShadowBullish) return { key: "lower_shadow_bullish", label: "下ヒゲ陽線" };
  const bullishEngulfing = prevClose < prevOpen && close > open && open <= prevClose && close >= prevOpen;
  if (bullishEngulfing) return { key: "bullish_engulfing", label: "包み足" };
  return null;
}

function regimeAssessment(series = []) {
  const clean = cleanPriceSeries(series);
  const closes = clean.map((point) => point.close).filter(Number.isFinite);
  if (closes.length < 40) {
    return {
      label: "判定待ち",
      stableUptrendPct: null,
      panicPullbackPct: null,
      rangePct: null,
      summary: "価格履歴が不足しています。",
      features: {},
    };
  }
  const return20 = returnFrom(clean, Math.min(20, clean.length - 1));
  const vol20 = annualizedVolatility(closes.slice(-21));
  const sma20 = average(closes.slice(-20));
  const sma60 = average(closes.slice(-60));
  const maSpreadPct = sma20 && sma60 ? ((sma20 - sma60) / sma60) * 100 : 0;
  const drawdown52 = maxDrawdown(closes.slice(-252));
  let stable = 34;
  let panic = 33;
  let range = 33;
  if (Number.isFinite(return20)) {
    if (return20 > 2) stable += 18;
    if (return20 < -4) panic += 22;
    if (Math.abs(return20) <= 2) range += 12;
  }
  if (Number.isFinite(vol20)) {
    if (vol20 < 28) stable += 10;
    if (vol20 > 50) panic += 16;
    if (vol20 >= 25 && vol20 <= 45) range += 8;
  }
  if (Number.isFinite(maSpreadPct)) {
    if (maSpreadPct > 1) stable += 16;
    if (maSpreadPct < -2) panic += 10;
    if (Math.abs(maSpreadPct) <= 1.2) range += 14;
  }
  if (Number.isFinite(drawdown52) && drawdown52 < -20) panic += 8;
  const total = Math.max(1, stable + panic + range);
  const stablePct = Math.round((stable / total) * 100);
  const panicPct = Math.round((panic / total) * 100);
  const rangePct = Math.max(0, 100 - stablePct - panicPct);
  const label = stablePct >= panicPct && stablePct >= rangePct
    ? "安定上昇"
    : panicPct >= rangePct
    ? "調整/下落"
    : "レンジ";
  return {
    label,
    stableUptrendPct: stablePct,
    panicPullbackPct: panicPct,
    rangePct,
    summary: `特徴量からHMM風に、安定上昇${stablePct}%・調整${panicPct}%・レンジ${rangePct}%で推定。`,
    features: {
      return20,
      histVol20: vol20,
      maSpreadPct,
      maxDrawdown1y: drawdown52,
    },
  };
}

function lastFinite(values = []) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

function previousFinite(values = []) {
  let seen = false;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (!Number.isFinite(values[i])) continue;
    if (seen) return values[i];
    seen = true;
  }
  return null;
}

function highestClosePoint(series = []) {
  return (series || [])
    .map((point) => ({ date: normalizeDate(point.date), close: Number(point.close) }))
    .filter((point) => point.date && Number.isFinite(point.close))
    .reduce((best, point) => (!best || point.close > best.close ? point : best), null);
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

  const openPnlPct = Number.isFinite(position.unrealizedPnlPct) ? position.unrealizedPnlPct : position.pnlPct;
  if (Number.isFinite(openPnlPct)) {
    if (openPnlPct >= 30) {
      score += 3;
      reasons.push(`残っている株は取得単価比で${openPnlPct.toFixed(1)}%の含み益がある`);
      if (Number.isFinite(price.return3m) && price.return3m < -5) {
        score -= 6;
        risks.push("含み益はあるが直近モメンタムが弱く、利益確定ラインの確認が必要");
      }
    } else if (openPnlPct <= -20) {
      score -= 12;
      risks.push(`残っている株は取得単価比で${Math.abs(openPnlPct).toFixed(1)}%の含み損がある`);
      if (price.trend3y === "DOWN") {
        score -= 8;
        risks.push("含み損に加えて3年トレンドも下向き");
      }
    } else if (openPnlPct <= -10) {
      score -= 6;
      risks.push(`残っている株は取得単価比で${Math.abs(openPnlPct).toFixed(1)}%の含み損がある`);
    }
  }

  if (Number.isFinite(position.holdingDays) && position.holdingDays < 30 && Number.isFinite(openPnlPct) && openPnlPct < 0) {
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
      reasons.push("3年リターンは強いが、上がりすぎ後に高い価格で買ってしまう点に注意");
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
      risks.push("3年の流れから見た目安価格よりかなり高く、高い価格で買ってしまう点に注意");
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

  const context = String(research.contextText || "").toLowerCase();
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

  const initialAction = score >= 72 ? "BUY" : score >= 46 ? "HOLD" : score >= 26 ? "WATCH" : "SELL";
  const safety = decisionSafetyOverride(stock, price, initialAction, position);
  const action = safety.action;
  const thesis = safety.thesis || `${stock.name}は価格トレンド、検索材料、変動率を総合して${actionLabels[action]}判定。`;
  return {
    action,
    confidence: clamp(Math.round(Math.abs(score - 50) * 1.2 + 45), 35, 86),
    thesis,
    reasons: uniqueText([...reasons, ...safety.reasons]).slice(0, 5),
    risks: uniqueText([...risks, ...safety.risks]).slice(0, 5),
    riskChecks: professionalRiskChecks(stock, price, research, position),
  };
}

function professionalRiskChecks(stock, price = {}, research = {}, position = positionMetrics(stock, price)) {
  const context = String(research.contextText || "").toLowerCase();
  const sector = stock.sector || stockSector(stock);
  const hasEvidence = Number(research.searched || 0) >= 3;
  const badWords = ["下方修正", "減益", "赤字", "減配", "不祥事", "行政処分", "訴訟"].filter((word) => context.includes(word.toLowerCase()));
  const goodWords = ["上方修正", "増収増益", "最高益", "営業益増", "増配", "自社株買い"].filter((word) => context.includes(word.toLowerCase()));
  const sectorEvidenceCount = (research.evidence || []).filter((item) => item.kind === "sector").length;

  return [
    riskCheck("業績・決算", badWords.length ? "high" : goodWords.length ? "low" : hasEvidence ? "medium" : "medium",
      badWords.length
        ? `検索結果に${badWords.slice(0, 2).join("、")}があり、決算悪化の確認が必要`
        : goodWords.length
        ? `検索結果に${goodWords.slice(0, 2).join("、")}があり、業績材料は悪くない`
        : "決算・業績材料の強さは検索結果だけでは薄い"),
    riskCheck("業種環境", sectorEvidenceCount ? sectorRiskLevel(context, sector) : "medium",
      sectorEvidenceCount
        ? `${sector}の業種情報を${sectorEvidenceCount}件確認。需要、規制、景気感応度を評価材料に含める`
        : `${sector}の業種Evidenceが不足。個社だけで判断しない`),
    riskCheck("株価位置", chartRiskLevel(price),
      chartRiskSummary(price)),
    riskCheck("需給・流動性", liquidityRiskLevel(price),
      liquidityRiskSummary(price)),
    riskCheck("配当", dividendRiskLevel(price),
      dividendRiskSummary(price)),
    riskCheck("保有損益", holdingRiskLevel(position),
      holdingRiskSummary(position)),
  ];
}

function riskCheck(label, level, summary) {
  const normalized = ["low", "medium", "high"].includes(level) ? level : "medium";
  return {
    label,
    level: normalized,
    status: normalized === "high" ? "要注意" : normalized === "medium" ? "確認" : "良好",
    summary,
  };
}

function sectorRiskLevel(context, sector = "") {
  const cyclical = /航空|鉄道|自動車|機械|半導体|商社|資源|エネルギー|不動産|銀行|保険/.test(sector);
  const bad = ["需要減", "減速", "市況悪化", "規制", "原材料高", "金利上昇", "燃料費", "円高", "競争激化"].some((word) => context.includes(word.toLowerCase()));
  const good = ["需要増", "回復", "好調", "価格転嫁", "増益", "投資拡大"].some((word) => context.includes(word.toLowerCase()));
  if (bad) return "high";
  if (cyclical && !good) return "medium";
  return good ? "low" : "medium";
}

function chartRiskLevel(price = {}) {
  if (isHighChaseChart(price) || isNoUpsideChart(price)) return "high";
  if (Number.isFinite(price.distanceFromBuyLine1y) && price.distanceFromBuyLine1y <= 0) return "low";
  if (Number.isFinite(price.distanceFromTrend3y) && price.distanceFromTrend3y > 18) return "high";
  if (Number.isFinite(price.return3m) && price.return3m < -8) return "medium";
  return "medium";
}

function chartRiskSummary(price = {}) {
  if (isHighChaseChart(price)) return "3年で大きく上昇した後の高い位置。買うなら押し目と損切り幅を先に決める";
  if (isNoUpsideChart(price)) return "3年高値に近い一方で上昇力が弱く、上値余地を慎重に見る";
  if (Number.isFinite(price.distanceFromBuyLine1y) && price.distanceFromBuyLine1y <= 0) return "過去1年の買い場ライン以下。価格位置だけを見ると入りやすい";
  if (Number.isFinite(price.distanceFromTrend3y) && price.distanceFromTrend3y > 18) return "3年目安より高く、買い急ぎに注意";
  return "過熱・下落継続・レンジ位置をチャートで確認する";
}

function liquidityRiskLevel(price = {}) {
  if (Number.isFinite(price.averageVolume20) && price.averageVolume20 < 50000) return "high";
  if (Number.isFinite(price.averageVolume20) && price.averageVolume20 < 200000) return "medium";
  if (Number.isFinite(price.volatility) && price.volatility > 55) return "high";
  if (Number.isFinite(price.sma50) && Number.isFinite(price.sma200) && price.sma50 < price.sma200) return "medium";
  return Number.isFinite(price.averageVolume20) ? "low" : "medium";
}

function liquidityRiskSummary(price = {}) {
  if (Number.isFinite(price.averageVolume20) && price.averageVolume20 < 50000) return "平均出来高が少なく、売りたい時に価格が飛びやすい";
  if (Number.isFinite(price.averageVolume20) && price.averageVolume20 < 200000) return "出来高は厚くない。注文サイズと指値を慎重にする";
  if (Number.isFinite(price.volatility) && price.volatility > 55) return "値動きが大きく、建玉サイズを落とすべき";
  if (Number.isFinite(price.sma50) && Number.isFinite(price.sma200) && price.sma50 < price.sma200) return "50日線が200日線を下回り、需給はまだ強くない";
  return "出来高と移動平均の面では大きな警戒は少ない";
}

function dividendRiskLevel(price = {}) {
  if (Number.isFinite(price.dividendChangePct) && price.dividendChangePct < -5) return "high";
  if (Number.isFinite(price.dividendYield) && price.dividendYield >= 5.5 && (price.return1y < -10 || price.trend3y === "DOWN")) return "high";
  if (!Number.isFinite(price.dividendYield) || price.dividendYield <= 0) return "medium";
  return "low";
}

function dividendRiskSummary(price = {}) {
  if (Number.isFinite(price.dividendChangePct) && price.dividendChangePct < -5) return "直近1年の配当が減っており、保有理由としての配当を再確認";
  if (Number.isFinite(price.dividendYield) && price.dividendYield >= 5.5 && (price.return1y < -10 || price.trend3y === "DOWN")) return "高配当だが、株価下落で利回りが高く見えている可能性";
  if (!Number.isFinite(price.dividendYield) || price.dividendYield <= 0) return "配当データが薄い、または配当を主な保有理由にしにくい";
  return `配当利回り${price.dividendYield.toFixed(1)}%。減配リスクと業績の裏付けを確認`;
}

function holdingRiskLevel(position = {}) {
  if (!position.quantity) return "medium";
  if (Number.isFinite(position.totalReturnPct) && position.totalReturnPct <= -15) return "high";
  if (Number.isFinite(position.totalReturnPct) && position.totalReturnPct < 0) return "medium";
  return "low";
}

function holdingRiskSummary(position = {}) {
  if (!position.quantity) return "未保有。買うなら最初の損切り幅と単元数を先に決める";
  if (Number.isFinite(position.totalReturnPct) && position.totalReturnPct <= -15) return `配当込みで${Math.abs(position.totalReturnPct).toFixed(1)}%の損失。保有理由が残っているか確認`;
  if (Number.isFinite(position.totalReturnPct) && position.totalReturnPct < 0) return `配当込みで${Math.abs(position.totalReturnPct).toFixed(1)}%の損失。追加買いは慎重にする`;
  if (Number.isFinite(position.totalReturnPct)) return `配当込みで${position.totalReturnPct.toFixed(1)}%の利益。利益確定ラインも確認`;
  return "取得情報が不足。購入日、単価、株数の入力が必要";
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
  if (
    Number.isFinite(return3y)
    && return3y >= 180
    && Number.isFinite(distanceFromBuyLine1y)
    && distanceFromBuyLine1y <= 6
    && (!Number.isFinite(return1y) || return1y > -20)
  ) {
    return true;
  }
  return false;
}

function extendedRunText(price = {}) {
  if (Number.isFinite(price.return3y)) return `3年で${formatSignedPercent(price.return3y)}上昇済み`;
  return "過去3年で大きく上昇済み";
}

function isNoUpsideChart(price = {}) {
  const nearUpperRange = Number.isFinite(price.distanceFromHigh3y) && price.distanceFromHigh3y > -12;
  const notCheapVsTrend = !Number.isFinite(price.distanceFromTrend3y) || price.distanceFromTrend3y > -3;
  const weakLongTrend = price.trend3y !== "UP" || (Number.isFinite(price.annualizedReturn3y) && price.annualizedReturn3y < 5);
  const reboundAlready = Number.isFinite(price.return3m) && price.return3m > 10;
  const shortOverLongNotEnough = Number.isFinite(price.sma50) && Number.isFinite(price.sma200) && price.sma50 <= price.sma200 * 1.03;
  return nearUpperRange && notCheapVsTrend && weakLongTrend && (reboundAlready || shortOverLongNotEnough);
}

async function aiBatchDecisions(rows, onProgress = null) {
  const items = rows.map(({ stock, price, research, fallback, financials }) => ({
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector || stockSector(stock),
    holding: Boolean(stock.holding),
    notes: stock.notes || "",
    position: positionMetrics(stock, price),
    price: compactPrice(price),
    financials: compactFinancialForAi(financials),
    ruleDecision: fallback,
    evidence: research.evidence.slice(0, 6).map((item) => ({
      title: cleanText(item.title || "").slice(0, 140),
      source: item.source,
      url: item.url,
      publishedDate: item.publishedDate || "",
      snippet: cleanText(item.snippet || "").slice(0, 220),
      kind: item.kind,
    })),
    sectorEvidence: research.evidence.filter((item) => item.kind === "sector").slice(0, 4).map((item) => ({
      title: cleanText(item.title || "").slice(0, 140),
      source: item.source,
      snippet: cleanText(item.snippet || "").slice(0, 180),
    })),
  }));

  const model = await getLmStudioModel();
  const decisions = [];
  const errors = [];
  const chunks = chunkArray(items, 2);
  let done = 0;
  for (const chunk of chunks) {
    onProgress?.(done, chunks.length, done + 1);
    try {
      decisions.push(...(await aiDecisionChunk(model, chunk)));
    } catch (error) {
      errors.push(error);
    } finally {
      done += 1;
      onProgress?.(done, chunks.length, done < chunks.length ? done + 1 : 0);
    }
  }
  if (!decisions.length && errors.length) throw errors[0];
  return decisions;
}

async function aiDecisionChunk(model, items) {
  const prompt = [
    "あなたは日本株のリサーチ補助AIです。将来利益を保証せず、売買判断の根拠とリスクを厳密に分けてください。",
    "注意点は、トレードのプロが最低限確認する観点で評価してください。業種環境も個社とは別の材料として読み込んでください。",
    "出力はJSONのみ。形式は {\"decisions\":[{\"symbol\":\"9005.T\",\"action\":\"HOLD\",\"confidence\":55,\"thesis\":\"...\",\"reasons\":[\"...\"],\"risks\":[\"...\"],\"riskChecks\":[{\"label\":\"業績・決算\",\"level\":\"medium\",\"status\":\"確認\",\"summary\":\"...\"}],\"growthExit\":{\"level\":\"normal|watch|exit_alert\",\"reason\":\"...\",\"signals\":[\"...\"],\"evidence\":[{\"title\":\"...\",\"source\":\"...\",\"url\":\"...\",\"publishedDate\":\"YYYY-MM-DD\",\"summary\":\"...\"}]},\"sellForecast\":{\"horizon\":\"1-3か月|3-6か月|決算後|未定\",\"targetPrice\":2000,\"reviewPrice\":1600,\"timing\":\"...\",\"reason\":\"...\",\"confidence\":60,\"catalysts\":[\"...\"]}}]}。",
    "actionは BUY, HOLD, SELL, WATCH のいずれか。SELLは即時売却ではなく、数週間から数か月の保有理由を見直す意味です。confidenceは0-100。",
    "NVIDIAのような10倍候補は20〜30%の株価下落だけではファンダ崩壊にしないでください。growthExitは、売上高成長率の明確な鈍化、ガイダンスが市場予想を下回る、需要・粗利・受注の構造悪化、減配/下方修正など、買った根拠そのものが崩れた時だけexit_alertにしてください。",
    `growthExit.exit_alertはpublishedDateが過去${FUNDAMENTAL_EXIT_MAX_AGE_DAYS}日以内の根拠がある時だけにしてください。日付不明、古い記事、過去の歴史記事は売りアラートの根拠にしないでください。`,
    "riskChecksは必ずこの6項目にしてください: 業績・決算, 業種環境, 株価位置, 需給・流動性, 配当, 保有損益。levelは low, medium, high のいずれか。",
    "thesisは120字以内、reasonsとrisksは各3件まで、riskChecksのsummaryは各80字以内にしてください。growthExit.evidenceは根拠にした記事や開示だけを最大3件入れてください。",
    "ユーザーはデイトレーダーではありません。短期ノイズだけで売買を促さず、根拠不足、材料が古い、検索結果が薄い場合はWATCHを優先してください。",
    "3年で大きく上がった後、現在値が3年の流れや安値から見て高い位置にある場合はBUYにせず、WATCHかHOLDにしてください。",
    "配当利回り、配当の増減、購入日以降の配当込み損益を見てください。高配当だけでBUYにせず、株価下落で利回りが高く見える可能性をリスクに入れてください。",
    "短期売買ではなく、3年の価格傾向、1年買い場ライン、購入日、購入単価、残株数、売却済み株数、確定損益、含み損益、配当込み損益、直近モメンタム、出来高、悪材料、過熱感、業種環境、保有継続可否を総合評価してください。",
    "financialsにはEDINET有価証券報告書とYahoo株から取れた財務指標、未取得項目、決算書から分かることが入ります。未取得は推測せず、取得できた財務情報だけを根拠にしてください。",
    "日本語は一般的な投資メモの表現にしてください。買収妙味、割安放置、PEの中小型狙いのような不自然な言い方は使わず、理由と売買判断への影響が分かる言葉で書いてください。",
    "sellForecastは保有中か残株がある銘柄だけに出してください。将来を断定せず、ニュースや過去の経緯から売却を検討する時期、利益確定候補価格、見直し価格、根拠を短く示してください。根拠が薄ければtargetPrice/null、horizon/未定。",
    "",
    JSON.stringify({ asOfDate: new Date().toISOString().slice(0, 10), stocks: items }),
  ].join("\n");

  const content = await callLmStudioResponses(model, prompt, { maxOutputTokens: 2800 }).catch(async (error) => {
    if (String(error.message || "").includes("404")) return callLmStudioChat(model, prompt, { maxTokens: 2800 });
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
      riskChecks: decision.riskChecks,
      growthExit: decision.growthExit,
      sellForecast: decision.sellForecast,
    }));
}

async function callLmStudioResponses(model, prompt, options = {}) {
  const settings = await readSettings();
  const baseUrl = activeLmStudioUrl(settings);
  const response = await fetchWithTimeout(`${baseUrl}/responses`, {
    timeout: options.timeoutMs || settings.lmStudioTimeoutMs,
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
  const baseUrl = activeLmStudioUrl(settings);
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    timeout: options.timeoutMs || settings.lmStudioTimeoutMs,
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
  if (lmModelCache.configuredUrl === settings.lmStudioUrl && lmModelCache.model) return lmModelCache.model;
  let lastError = null;
  for (const url of lmStudioCandidateUrls(settings)) {
    try {
      const response = await fetchWithTimeout(`${url}/models`, { timeout: 5000 });
      if (!response.ok) throw new Error(`LM Studio models returned ${response.status}`);
      const models = await response.json();
      const model = models?.data?.[0]?.id || "";
      if (!model) throw new Error("LM Studio model not found");
      lmModelCache = { configuredUrl: settings.lmStudioUrl, url, model };
      return model;
    } catch (error) {
      lastError = error;
    }
  }
  lmModelCache = { configuredUrl: settings.lmStudioUrl, url: "", model: "" };
  throw lastError || new Error("LM Studio model not found");
}

function activeLmStudioUrl(settings = defaultSettings) {
  return lmModelCache.configuredUrl === settings.lmStudioUrl && lmModelCache.url
    ? lmModelCache.url
    : settings.lmStudioUrl;
}

function lmStudioCandidateUrls(settings = defaultSettings) {
  const configured = normalizeUrl(settings.lmStudioUrl) || defaultSettings.lmStudioUrl;
  const urls = [configured];
  try {
    const parsed = new URL(configured);
    if (parsed.hostname === "host.docker.internal") {
      urls.push(configured.replace("host.docker.internal", "127.0.0.1"));
      urls.push(configured.replace("host.docker.internal", "localhost"));
    } else if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      urls.push(configured.replace(parsed.hostname, "host.docker.internal"));
    }
  } catch {
    // Invalid URLs are normalized earlier; keep the configured value as the only attempt.
  }
  return [...new Set(urls.map(normalizeUrl).filter(Boolean))];
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
    high52: price.high52,
    high52Date: price.high52Date,
    high3y: price.high3y,
    high3yDate: price.high3yDate,
    distanceFromHigh52: price.distanceFromHigh52,
    distanceFromLow52: price.distanceFromLow52,
    distanceFromHigh3y: price.distanceFromHigh3y,
    maxDrawdown3y: price.maxDrawdown3y,
    trendSlope3y: price.trendSlope3y,
    trendPrice3y: price.trendPrice3y,
    distanceFromTrend3y: price.distanceFromTrend3y,
    trend3y: price.trend3y,
    buyLine1y: price.buyLine1y,
    deepBuyLine1y: price.deepBuyLine1y,
    distanceFromBuyLine1y: price.distanceFromBuyLine1y,
    buyTiming1y: price.buyTiming1y,
    low1y: price.low1y,
    low1yDate: price.low1yDate,
    sma50: price.sma50,
    sma200: price.sma200,
    volatility: price.volatility,
    latestVolume: price.latestVolume,
    averageVolume20: price.averageVolume20,
    averageVolume60: price.averageVolume60,
    volumeRatio20: price.volumeRatio20,
    logReturn1d: price.logReturn1d,
    histVol20: price.histVol20,
    atr14: price.atr14,
    atrPct: price.atrPct,
    sma5: price.sma5,
    sma5CrossUp: Boolean(price.sma5CrossUp),
    rsi14: price.rsi14,
    rsiCross30: Boolean(price.rsiCross30),
    candlestickSignal: price.candlestickSignal || null,
    technicalEntry: price.technicalEntry || technicalEntryFallback(),
    regime: price.regime || null,
    dividendPerShareTtm: price.dividendPerShareTtm,
    dividendYield: price.dividendYield,
    dividendChangePct: price.dividendChangePct,
    dividendLastDate: price.dividendLastDate,
    dividendLastAmount: price.dividendLastAmount,
  };
}

function compactFinancialForAi(financials = null) {
  const snapshot = financials ? normalizeFinancialSnapshot(financials) : null;
  if (!snapshot) return null;
  return {
    status: snapshot.status,
    source: snapshot.source,
    asOfDate: snapshot.asOfDate,
    docID: snapshot.docID,
    documentTitle: snapshot.documentTitle,
    currentPrice: snapshot.currentPrice,
    sharesOutstanding: snapshot.sharesOutstanding,
    marketCap: snapshot.marketCap,
    netCashRatio: snapshot.netCashRatio,
    netCash: snapshot.netCash,
    evEbitda: snapshot.evEbitda,
    pbr: snapshot.pbr,
    per: snapshot.per,
    operatingCashFlow: snapshot.operatingCashFlow,
    operatingCashFlowYears: snapshot.operatingCashFlowYears,
    operatingCashFlowPositive: snapshot.operatingCashFlowPositive,
    netSales: snapshot.netSales,
    operatingIncome: snapshot.operatingIncome,
    netIncome: snapshot.netIncome,
    criteria: snapshot.criteria.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      summary: item.summary,
    })),
    insights: snapshot.insights,
    missingMetrics: snapshot.missingMetrics,
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
  const fallbackGrowthExit = ruleGrowthExit(stock, research, price);
  let growthExit = normalizeGrowthExit(decision.growthExit || fallbackGrowthExit);
  if (!growthExit.evidence.length && fallbackGrowthExit.evidence?.length) {
    growthExit.evidence = normalizeGrowthExitEvidence(fallbackGrowthExit.evidence).slice(0, 3);
  }
  if (!growthExit.signals.length && fallbackGrowthExit.signals?.length) {
    growthExit.signals = asStringArray(fallbackGrowthExit.signals).slice(0, 5);
  }
  growthExit = enforceRecentGrowthExit(growthExit, research, stock);
  const sellForecast = normalizeSellForecast(decision.sellForecast) || ruleSellForecast({ price, position }, "JPY");
  const reasons = uniqueText([...asStringArray(decision.reasons), ...safety.reasons]).slice(0, 5);
  const risks = uniqueText([...asStringArray(decision.risks), ...safety.risks]).slice(0, 5);
  const riskChecks = mergeRiskChecks(
    professionalRiskChecks(stock, price, research, position),
    normalizeRiskChecks(decision.riskChecks),
  );
  return {
    symbol: stock.symbol,
    name: stock.name,
    action,
    confidence: clamp(Number(decision.confidence || 45), 0, 100),
    thesis: String(safety.thesis || decision.thesis || `${stock.name}は${actionLabels[action]}判定。`).slice(0, 360),
    reasons,
    risks,
    riskChecks,
    price,
    position,
    growthExit,
    sellForecast,
    entryValue: evaluateEntryPrice(stock.targetBuyPrice, price),
    evidence: research.evidence.slice(0, 12),
    researchStats: {
      searched: research.searched,
      crawled: research.crawled,
    },
  };
}

function ruleGrowthExit(stock, research = {}, price = {}) {
  const matchedEvidence = growthExitEvidenceFromResearch(research, { requireRecent: true });
  const staleEvidence = growthExitEvidenceFromResearch(research, { requireRecent: false })
    .filter((item) => !isRecentEvidenceForExit(item));
  const context = cleanText(matchedEvidence.map((item) => `${item.title}\n${item.summary}`).join("\n")).toLowerCase();
  const exitSignals = uniqueText([
    ...growthExitPatterns().filter(([, pattern]) => pattern.test(context)).map(([label]) => label),
    ...matchedEvidence.flatMap((item) => item.signals || []),
  ]);
  if (exitSignals.some((item) => ["下方修正", "ガイダンス失望", "減配"].includes(item))) {
    return {
      level: "exit_alert",
      reason: `${stock.name}の買った根拠に関わる悪材料が検索結果にあります。通知内の根拠リンクで確認してください。`,
      signals: exitSignals,
      evidence: matchedEvidence,
    };
  }
  if (exitSignals.length) {
    return {
      level: "watch",
      reason: `${stock.name}に成長鈍化や損失関連の確認材料があります。`,
      signals: exitSignals,
      evidence: matchedEvidence,
    };
  }
  if (staleEvidence.length) {
    return {
      level: "watch",
      reason: `${stock.name}に悪材料らしい古い記事がありますが、${FUNDAMENTAL_EXIT_MAX_AGE_DAYS}日以内の根拠ではないため売りアラートにはしません。`,
      signals: uniqueText(staleEvidence.flatMap((item) => item.signals || [])).slice(0, 5),
      evidence: staleEvidence.slice(0, 3),
    };
  }
  if (price.trend3y === "UP" && Number.isFinite(price.return3y) && price.return3y > 80) {
    return {
      level: "normal",
      reason: "長期上昇株は値動きだけで売らず、決算の成長ストーリーを確認します。",
      signals: [],
    };
  }
  return { level: "normal", reason: "ファンダ崩壊を示す材料は未検出です。", signals: [] };
}

function growthExitPatterns() {
  return [
    ["下方修正", /下方修正|guidance cut|lowered guidance|cut forecast/i],
    ["ガイダンス失望", /ガイダンス.{0,30}(下回|未達)|guidance.{0,80}(below|miss|disappoint)/i],
    ["成長鈍化", /成長率.{0,20}(鈍化|低下)|売上.{0,20}(鈍化|減速)|growth.{0,80}(slow|decelerate)/i],
    ["減配", /減配|無配|dividend cut/i],
    ["赤字・損失", /赤字|減損|特別損失|loss|impairment/i],
  ];
}

function growthExitEvidenceFromResearch(research = {}, options = {}) {
  const evidence = Array.isArray(research.evidence) ? research.evidence : [];
  return evidence.map((item) => {
    const text = cleanText(`${item.title || ""}\n${item.snippet || ""}\n${item.source || ""}`);
    const signals = growthExitPatterns()
      .filter(([, pattern]) => pattern.test(text))
      .map(([label]) => label);
    if (!signals.length) return null;
    const publishedDate = item.publishedDate || searchResultPublishedDate(item);
    if (options.requireRecent && !isRecentSearchDate(publishedDate, options.maxAgeDays || FUNDAMENTAL_EXIT_MAX_AGE_DAYS)) return null;
    return {
      title: cleanText(item.title || item.source || "検索結果").slice(0, 120),
      source: cleanText(item.source || hostOf(item.url || "") || "").slice(0, 80),
      url: normalizeUrl(item.url) || "",
      publishedDate,
      summary: cleanText(item.snippet || "").slice(0, 180),
      signals: uniqueText(signals).slice(0, 5),
    };
  }).filter(Boolean).slice(0, 3);
}

function enforceRecentGrowthExit(growthExit = {}, research = {}, stock = {}) {
  const normalized = normalizeGrowthExit(growthExit);
  const recentExplicit = normalizeGrowthExitEvidence(normalized.evidence)
    .filter((item) => isRecentEvidenceForExit(item));
  const recentFallback = growthExitEvidenceFromResearch(research, { requireRecent: true });
  const recentEvidence = recentExplicit.length ? recentExplicit : recentFallback;
  if (recentEvidence.length) return { ...normalized, evidence: recentEvidence.slice(0, 3) };
  if (normalized.level !== "exit_alert") return normalized;
  return {
    ...normalized,
    level: "watch",
    reason: `${stock.name || "この銘柄"}は悪材料らしい文言がありますが、${FUNDAMENTAL_EXIT_MAX_AGE_DAYS}日以内の日付付き根拠がないため売り通知ではなく確認扱いにします。`,
  };
}

function normalizeGrowthExit(value = {}) {
  const level = ["normal", "watch", "exit_alert"].includes(String(value.level || "").toLowerCase())
    ? String(value.level).toLowerCase()
    : "normal";
  return {
    level,
    reason: String(value.reason || (level === "normal" ? "ファンダ崩壊を示す材料は未検出です。" : "確認が必要です。")).slice(0, 180),
    signals: asStringArray(value.signals).slice(0, 5),
    evidence: normalizeGrowthExitEvidence(value.evidence || value.sources).slice(0, 3),
  };
}

function normalizeSellForecast(value = {}) {
  if (!value || typeof value !== "object") return null;
  const horizon = cleanText(value.horizon || value.period || "").slice(0, 40);
  const timing = cleanText(value.timing || "").slice(0, 120);
  const reason = cleanText(value.reason || value.summary || "").slice(0, 220);
  const targetPrice = nullablePositiveNumber(value.targetPrice);
  const reviewPrice = nullablePositiveNumber(value.reviewPrice || value.stopPrice);
  const confidence = Number.isFinite(Number(value.confidence)) ? clamp(Number(value.confidence), 0, 100) : null;
  const catalysts = asStringArray(value.catalysts || value.triggers).slice(0, 4);
  if (!horizon && !timing && !reason && !targetPrice && !reviewPrice && !catalysts.length) return null;
  return {
    horizon: horizon || "未定",
    targetPrice,
    reviewPrice,
    timing: timing || "次の決算・主要ニュース後に見直し",
    reason: reason || "根拠が薄いため、AI見通しは確認扱いです。",
    confidence,
    catalysts,
  };
}

function ruleSellForecast(analysis = {}, currency = "JPY") {
  const price = analysis.price || {};
  const position = analysis.position || {};
  const current = nullablePositiveNumber(price.current);
  const quantity = nullablePositiveNumber(position.quantity);
  if (!current || !quantity) return null;
  const purchasePrice = nullablePositiveNumber(position.purchasePrice);
  const high52 = nullablePositiveNumber(price.high52);
  const trendPrice = nullablePositiveNumber(price.trendPrice3y);
  const targetCandidates = [
    current * 1.08,
    high52 ? high52 * 0.96 : null,
    trendPrice ? trendPrice * 1.08 : null,
    purchasePrice ? purchasePrice * 1.25 : null,
  ].filter((value) => Number.isFinite(value) && value > 0);
  const reviewCandidates = [
    purchasePrice ? purchasePrice * 0.92 : null,
    nullablePositiveNumber(price.buyLine1y) ? nullablePositiveNumber(price.buyLine1y) * 0.92 : null,
    current * 0.88,
  ].filter((value) => Number.isFinite(value) && value > 0);
  const targetPrice = targetCandidates.length ? Math.max(...targetCandidates) : null;
  const reviewPrice = reviewCandidates.length ? Math.min(...reviewCandidates) : null;
  return normalizeSellForecast({
    horizon: "1-3か月",
    targetPrice: roundPrice(targetPrice),
    reviewPrice: roundPrice(reviewPrice),
    timing: "次の決算・主要ニュース後、または5日線/RSIの失速時に見直し",
    reason: `${formatMoney(targetPrice, currency)}前後で利益確定候補、${formatMoney(reviewPrice, currency)}割れで保有理由を再確認するルール目安です。AI材料が取れた場合はそちらを優先します。`,
    confidence: 45,
    catalysts: ["決算後の反応", "主要ニュース", "5日線割れ", "RSI失速"],
  });
}

function normalizeGrowthExitEvidence(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    title: cleanText(item.title || item.headline || "").slice(0, 120),
    source: cleanText(item.source || hostOf(item.url || "") || "").slice(0, 80),
    url: normalizeUrl(item.url) || "",
    publishedDate: item.publishedDate || item.date || searchResultPublishedDate(item),
    summary: cleanText(item.summary || item.snippet || item.reason || "").slice(0, 180),
    signals: asStringArray(item.signals).slice(0, 5),
  })).filter((item) => item.title || item.summary || item.url);
}

async function attachExitPlansToAnalyses(analyses = [], settings = defaultSettings, options = {}) {
  const state = await readExitState();
  const bySymbol = new Map((state.items || []).map((item) => [item.symbol, item]));
  const next = analyses.map((analysis) => {
    const currency = options.currency || analysis.currency || analysis.price?.currency || (/\.T$/.test(analysis.symbol) ? "JPY" : "USD");
    return {
      ...analysis,
      exitPlan: buildExitPlan(analysis, settings, bySymbol.get(analysis.symbol), { currency }),
    };
  });
  await saveExitState(mergeExitState(state, next));
  return next;
}

function buildExitPlan(analysis = {}, settings = defaultSettings, previous = null, options = {}) {
  const price = analysis.price || {};
  const position = analysis.position || {};
  const currency = options.currency || price.currency || "JPY";
  const current = nullablePositiveNumber(price.current);
  const sellableQuantity = sellableExitQuantity(position);
  const canNotifySellAlert = sellableQuantity > 0;
  const trailingStartDate = trailingStartDateForPosition(position);
  const highPoint = bestKnownHighPoint(price, current, { sinceDate: trailingStartDate });
  const previousHigh = nullablePositiveNumber(previous?.highWaterPrice);
  const previousHighDate = normalizeDate(previous?.highWaterDate);
  const previousEligible = Boolean(previousHigh && (!trailingStartDate || (previousHighDate && previousHighDate >= trailingStartDate)));
  const previousWins = previousEligible && (!highPoint.price || previousHigh >= highPoint.price);
  const highWaterPrice = previousWins ? previousHigh : highPoint.price;
  const highWaterDate = previousWins ? previous.highWaterDate || "" : highPoint.date || "";
  const trailingStopPct = clamp(Number(settings.trailingStopPct || defaultSettings.trailingStopPct), 5, 60);
  const trailingStopPrice = highWaterPrice ? highWaterPrice * (1 - trailingStopPct / 100) : null;
  const drawdownFromHighPct = current && highWaterPrice ? ((current - highWaterPrice) / highWaterPrice) * 100 : null;
  const trailing = trailingStopAssessment(position, {
    current,
    highWaterPrice,
    highWaterDate,
    trailingStopPrice,
    trailingStopPct,
    currency,
  });
  const trailingTriggered = trailing.triggered;
  const growthExit = enforceRecentGrowthExit(
    normalizeGrowthExit(analysis.growthExit || analysis.ai?.growthExit),
    { evidence: analysis.evidence || [] },
    analysis,
  );
  const aiSellForecast = normalizeSellForecast(analysis.sellForecast || analysis.ai?.sellForecast)
    || ruleSellForecast(analysis, currency);
  const onkabu = onkabuPlan(position, current, settings, currency);
  const alerts = [];
  if (canNotifySellAlert && settings.growthExitEnabled !== false && growthExit.level === "exit_alert") {
    alerts.push({
      type: "FUNDAMENTAL_EXIT",
      label: "ファンダ崩壊",
      action: "ファンダ売り確認アラート",
      confidence: 92,
      summary: growthExit.reason,
      points: growthExitAlertPoints(growthExit, analysis),
    });
  }
  if (canNotifySellAlert && trailingTriggered) {
    alerts.push({
      type: "TRAILING_STOP",
      label: "トレーリングストップ",
      action: trailing.mode === "loss_stop" ? "損切り確認アラート" : "利益確定確認アラート",
      confidence: 88,
      summary: `最高値${formatMoney(highWaterPrice, currency)}から${Math.abs(drawdownFromHighPct).toFixed(1)}%下落し、${trailingStopPct}%下落ラインを割りました。`,
      points: [
        `最高値: ${formatMoney(highWaterPrice, currency)}${highWaterDate ? ` (${highWaterDate})` : ""}`,
        `確認ライン: ${formatMoney(trailingStopPrice, currency)}`,
        `現在値: ${formatMoney(current, currency)}`,
        ...trailing.points,
      ],
    });
  }
  if (onkabu.triggered) {
    alerts.push({
      type: "ONKABU",
      label: "恩株化",
      action: "部分利益確定候補",
      confidence: 84,
      summary: onkabu.summary,
      points: [
        `元本回収目安: ${formatMoney(onkabu.principalToRecover, currency)}`,
        `売却候補: ${formatShareQuantity(onkabu.suggestedSellQuantity)}株`,
        `売却後も残る目安: ${formatShareQuantity(onkabu.remainingAfterSell)}株`,
      ],
    });
  }
  const alertLevel = alerts.some((item) => item.type === "FUNDAMENTAL_EXIT" || item.type === "TRAILING_STOP")
    ? "exit_alert"
    : alerts.some((item) => item.type === "ONKABU")
    ? "partial_profit"
    : Number.isFinite(drawdownFromHighPct) && drawdownFromHighPct <= -(trailingStopPct * 0.75)
    ? "watch"
    : growthExit.level === "watch"
    ? "watch"
    : "normal";
  return {
    currency,
    highWaterPrice: roundPrice(highWaterPrice),
    highWaterDate,
    trailingStartDate,
    current: roundPrice(current),
    trailingStopPct,
    trailingStopPrice: roundPrice(trailingStopPrice),
    drawdownFromHighPct: Number.isFinite(drawdownFromHighPct) ? Math.round(drawdownFromHighPct * 10) / 10 : null,
    trailingBelowLine: trailing.belowLine,
    trailingTriggered,
    trailingSuppressedReason: trailing.suppressedReason,
    trailingBasis: trailing.basis,
    growthExit,
    aiSellForecast,
    onkabu,
    alertLevel,
    alerts,
    summary: exitPlanSummary(alertLevel, growthExit, onkabu, trailingStopPct, drawdownFromHighPct, trailing.suppressedReason),
  };
}

function sellableExitQuantity(position = {}) {
  const quantity = nullablePositiveNumber(position.quantity) || 0;
  if (!quantity) return 0;
  if (Number.isFinite(position.sellableQuantity)) return Math.max(0, position.sellableQuantity);
  return quantity;
}

function growthExitAlertPoints(growthExit = {}, analysis = {}) {
  const points = [];
  const signals = asStringArray(growthExit.signals).slice(0, 5);
  if (signals.length) points.push(`検出材料: ${signals.join(" / ")}`);
  const evidence = growthExitEvidenceForAlert(growthExit, analysis).slice(0, 3);
  evidence.forEach((item, index) => {
    const date = item.publishedDate ? `${item.publishedDate} ` : "";
    points.push(`根拠${index + 1}: ${date}${item.title || item.source || "確認元"}`);
    if (item.summary) points.push(`内容: ${item.summary}`);
    if (item.url) points.push(`URL: ${item.url}`);
  });
  if (!evidence.length) {
    points.push("根拠リンク: 画面のEvidence要約で、悪材料に該当した検索結果を確認してください。");
  }
  return points.slice(0, 10);
}

function growthExitEvidenceForAlert(growthExit = {}, analysis = {}) {
  const explicit = normalizeGrowthExitEvidence(growthExit.evidence);
  if (explicit.length) return explicit;
  const signals = new Set(asStringArray(growthExit.signals));
  const evidence = Array.isArray(analysis.evidence) ? analysis.evidence : [];
  return evidence.map((item) => {
    const text = cleanText(`${item.title || ""}\n${item.summaryJa || item.snippet || ""}\n${item.source || ""}`);
    const matchedSignals = growthExitPatterns()
      .filter(([label, pattern]) => (signals.size ? signals.has(label) : true) && pattern.test(text))
      .map(([label]) => label);
    if (!matchedSignals.length) return null;
    return {
      title: cleanText(item.title || item.source || "検索結果").slice(0, 120),
      source: cleanText(item.source || hostOf(item.url || "") || "").slice(0, 80),
      url: normalizeUrl(item.url) || "",
      publishedDate: item.publishedDate || searchResultPublishedDate(item),
      summary: cleanText(item.summaryJa || item.snippet || "").slice(0, 180),
      signals: uniqueText(matchedSignals).slice(0, 5),
    };
  }).filter(Boolean);
}

function trailingStartDateForPosition(position = {}) {
  const remainingLots = Array.isArray(position.remainingLots) ? position.remainingLots : [];
  const dates = remainingLots
    .map((lot) => normalizeDate(lot.purchaseDate))
    .filter(Boolean)
    .sort();
  return dates[0] || normalizeDate(position.purchaseDate) || "";
}

function trailingStopAssessment(position = {}, options = {}) {
  const current = nullablePositiveNumber(options.current);
  const highWaterPrice = nullablePositiveNumber(options.highWaterPrice);
  const trailingStopPrice = nullablePositiveNumber(options.trailingStopPrice);
  const trailingStopPct = clamp(Number(options.trailingStopPct || defaultSettings.trailingStopPct), 5, 60);
  const currency = options.currency || "JPY";
  const quantity = nullablePositiveNumber(position.quantity) || 0;
  const sellableQuantity = sellableExitQuantity(position);
  const purchasePrice = nullablePositiveNumber(position.purchasePrice);
  const totalReturnPct = Number.isFinite(position.totalReturnPct) ? position.totalReturnPct : position.pnlPct;
  const unrealizedPnlPct = Number.isFinite(position.unrealizedPnlPct) ? position.unrealizedPnlPct : null;
  const gainFromCostPct = current && purchasePrice ? ((current - purchasePrice) / purchasePrice) * 100 : null;
  const highGainFromCostPct = highWaterPrice && purchasePrice ? ((highWaterPrice - purchasePrice) / purchasePrice) * 100 : null;
  const belowLine = Boolean(sellableQuantity > 0 && current && trailingStopPrice && current <= trailingStopPrice);
  const profitProtection = belowLine
    && Number.isFinite(highGainFromCostPct)
    && highGainFromCostPct >= Math.max(15, trailingStopPct)
    && Number.isFinite(gainFromCostPct)
    && gainFromCostPct >= 3;
  const lossStop = belowLine && (
    (Number.isFinite(totalReturnPct) && totalReturnPct <= -TRAILING_STOP_LOSS_PCT)
    || (Number.isFinite(unrealizedPnlPct) && unrealizedPnlPct <= -TRAILING_STOP_LOSS_PCT)
  );
  const points = uniqueText([
    purchasePrice ? `残り株の平均取得: ${formatMoney(purchasePrice, currency)}` : "",
    Number.isFinite(gainFromCostPct) ? `平均取得から: ${formatSignedPercent(gainFromCostPct)}` : "",
    Number.isFinite(totalReturnPct) ? `配当込み損益: ${formatSignedPercent(totalReturnPct)}` : "",
    Number.isFinite(highGainFromCostPct) ? `保有後高値は平均取得から${formatSignedPercent(highGainFromCostPct)}` : "",
  ].filter(Boolean)).slice(0, 5);

  let suppressedReason = "";
  if (belowLine && !profitProtection && !lossStop) {
    suppressedReason = purchasePrice && Number.isFinite(gainFromCostPct)
      ? `確認ラインは割っていますが、残り株の平均取得${formatMoney(purchasePrice, currency)}に対して現在は${formatSignedPercent(gainFromCostPct)}で、利益確定/損切り通知の条件ではありません。`
      : "確認ラインは割っていますが、残り株の取得状況が不足しているためTeams通知は出しません。";
  }

  return {
    triggered: Boolean(profitProtection || lossStop),
    belowLine,
    mode: lossStop ? "loss_stop" : profitProtection ? "profit_lock" : "suppressed",
    suppressedReason,
    points,
    basis: {
      purchasePrice: roundPrice(purchasePrice),
      totalReturnPct: Number.isFinite(totalReturnPct) ? Math.round(totalReturnPct * 10) / 10 : null,
      unrealizedPnlPct: Number.isFinite(unrealizedPnlPct) ? Math.round(unrealizedPnlPct * 10) / 10 : null,
      gainFromCostPct: Number.isFinite(gainFromCostPct) ? Math.round(gainFromCostPct * 10) / 10 : null,
      highGainFromCostPct: Number.isFinite(highGainFromCostPct) ? Math.round(highGainFromCostPct * 10) / 10 : null,
    },
  };
}

function bestKnownHighPoint(price = {}, current = null, options = {}) {
  const sinceDate = normalizeDate(options.sinceDate);
  const seriesHigh = (price.series || [])
    .map((point) => ({
      price: nullablePositiveNumber(point.close),
      date: normalizeDate(point.date),
      source: "保有後高値",
    }))
    .filter((point) => point.price && point.date && (!sinceDate || point.date >= sinceDate))
    .reduce((best, item) => (!best || item.price > best.price ? item : best), null);
  const candidates = [
    seriesHigh,
    (!sinceDate || (normalizeDate(price.high3yDate) && normalizeDate(price.high3yDate) >= sinceDate))
      ? { price: nullablePositiveNumber(price.high3y), date: normalizeDate(price.high3yDate), source: "3年高値" }
      : null,
    (!sinceDate || (normalizeDate(price.high52Date) && normalizeDate(price.high52Date) >= sinceDate))
      ? { price: nullablePositiveNumber(price.high52), date: normalizeDate(price.high52Date), source: "52週高値" }
      : null,
    { price: nullablePositiveNumber(current), date: normalizeDate(last(price.series || [])?.date), source: "現在値" },
  ].filter((item) => item && item.price);
  return candidates.reduce((best, item) => (!best || item.price > best.price ? item : best), { price: null, date: "", source: "" });
}

function onkabuPlan(position = {}, current = null, settings = defaultSettings, currency = "JPY") {
  const profitPct = Number(settings.onkabuProfitPct || defaultSettings.onkabuProfitPct);
  const quantity = nullablePositiveNumber(position.quantity) || 0;
  const sellableQuantity = Number.isFinite(position.sellableQuantity) ? Math.max(0, position.sellableQuantity) : quantity;
  const grossInvested = nullablePositiveNumber(position.grossInvested);
  const realizedProceeds = Number.isFinite(position.realizedProceeds) ? position.realizedProceeds : 0;
  const purchasePrice = nullablePositiveNumber(position.purchasePrice);
  const totalReturnPct = Number.isFinite(position.totalReturnPct) ? position.totalReturnPct : position.unrealizedPnlPct;
  const principalRecovered = Boolean(grossInvested && realizedProceeds >= grossInvested);
  const priceDouble = purchasePrice && current ? current >= purchasePrice * (1 + profitPct / 100) : false;
  const returnDouble = Number.isFinite(totalReturnPct) && totalReturnPct >= profitPct;
  const principalToRecover = grossInvested ? Math.max(0, grossInvested - realizedProceeds) : null;
  const rawSellQuantity = current && principalToRecover ? principalToRecover / current : 0;
  const suggestedSellQuantity = Math.min(sellableQuantity, roundSellQuantity(rawSellQuantity, currency));
  const triggered = Boolean(!principalRecovered && sellableQuantity > 0 && suggestedSellQuantity > 0 && (priceDouble || returnDouble));
  const remainingAfterSell = Math.max(0, quantity - suggestedSellQuantity);
  return {
    triggered,
    achieved: principalRecovered,
    profitPct,
    principalToRecover: roundPlanMoney(principalToRecover),
    suggestedSellQuantity,
    remainingAfterSell,
    summary: triggered
      ? `+${profitPct}%水準に到達。元本回収のため${formatShareQuantity(suggestedSellQuantity)}株の部分利益確定を検討できます。`
      : principalRecovered
      ? "売却済み分で元本回収済みです。残りは恩株として保有できます。"
      : `+${profitPct}%到達までは、成長ストーリーを見ながら保有確認します。`,
  };
}

function exitPlanSummary(level, growthExit, onkabu, trailingStopPct, drawdownFromHighPct, trailingSuppressedReason = "") {
  if (level === "exit_alert") return "売る理由が出た時だけ通知します。ファンダ崩壊またはトレーリングストップを確認してください。";
  if (level === "partial_profit") return onkabu.summary;
  if (trailingSuppressedReason) return trailingSuppressedReason;
  if (level === "watch") {
    const drawdown = Number.isFinite(drawdownFromHighPct) ? `最高値から${formatSignedPercent(drawdownFromHighPct)}。` : "";
    return `${drawdown}${trailingStopPct}%ライン接近、またはファンダ確認材料あり。`;
  }
  return growthExit.reason || "値動きだけでは売らず、成長ストーリーを確認しながら保有します。";
}

function mergeExitState(state = {}, analyses = []) {
  const bySymbol = new Map((state.items || []).map((item) => [item.symbol, item]));
  for (const analysis of analyses) {
    const plan = analysis.exitPlan || {};
    if (!analysis.symbol || !plan.highWaterPrice) continue;
    const previous = bySymbol.get(analysis.symbol) || {};
    bySymbol.set(analysis.symbol, {
      symbol: analysis.symbol,
      name: analysis.name || previous.name || analysis.symbol,
      currency: plan.currency || previous.currency || "JPY",
      highWaterPrice: plan.highWaterPrice,
      highWaterDate: plan.highWaterDate || previous.highWaterDate || "",
      trailingStartDate: plan.trailingStartDate || previous.trailingStartDate || "",
      trailingStopPct: plan.trailingStopPct,
      updatedAt: new Date().toISOString(),
    });
  }
  return { updatedAt: new Date().toISOString(), items: [...bySymbol.values()] };
}

function roundPrice(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function roundPlanMoney(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function roundSellQuantity(value, currency = "JPY") {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return currency === "JPY" ? Math.ceil(value) : Math.ceil(value * 10000) / 10000;
}

function formatShareQuantity(value) {
  if (!Number.isFinite(value)) return "-";
  return value % 1 === 0 ? value.toLocaleString("ja-JP") : value.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
}

function normalizeRiskChecks(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const label = String(item.label || "").trim();
    if (!label) return null;
    const level = ["low", "medium", "high"].includes(item.level) ? item.level : "medium";
    return {
      label,
      level,
      status: String(item.status || (level === "high" ? "要注意" : level === "medium" ? "確認" : "良好")).slice(0, 24),
      summary: String(item.summary || "").slice(0, 220),
    };
  }).filter(Boolean);
}

function mergeRiskChecks(base = [], ai = []) {
  const byLabel = new Map(base.map((item) => [item.label, item]));
  for (const item of ai) {
    const current = byLabel.get(item.label);
    byLabel.set(item.label, {
      ...(current || {}),
      ...item,
      summary: item.summary || current?.summary || "",
    });
  }
  return [...byLabel.values()].slice(0, 8);
}

function decisionSafetyOverride(stock, price = {}, action, position = positionMetrics(stock, price)) {
  const current = nullablePositiveNumber(price.current);
  const buyLine = nullablePositiveNumber(price.buyLine1y);
  const targetBuyPrice = nullablePositiveNumber(stock.targetBuyPrice);
  if (action === "BUY" && current && targetBuyPrice && current > targetBuyPrice * 1.01) {
    const gap = ((current - targetBuyPrice) / targetBuyPrice) * 100;
    return {
      action: stock.holding ? "HOLD" : "WATCH",
      thesis: `${stock.name}は買いたい価格を超えています。今すぐ買いではなく、入力した買値目安まで待つ判定にしました。`,
      reasons: ["事業や配当の確認材料は残る"],
      risks: [`現在値${formatYen(current)}は買いたい価格${formatYen(targetBuyPrice)}より${formatSignedPercent(gap)}高い`],
    };
  }
  if (action === "BUY" && current && buyLine && current > buyLine * 1.03) {
    const gap = ((current - buyLine) / buyLine) * 100;
    return {
      action: stock.holding ? "HOLD" : "WATCH",
      thesis: `${stock.name}は過去1年の買い場ラインより高い位置です。買い候補ではなく、押し目待ちにしました。`,
      reasons: ["候補として監視する価値は残る"],
      risks: [`現在値${formatYen(current)}は買い場ライン${formatYen(buyLine)}より${formatSignedPercent(gap)}高い`],
    };
  }
  if (action === "BUY" && isHighChaseChart(price)) {
    return {
      action: stock.holding ? "HOLD" : "WATCH",
      thesis: `${stock.name}は事業材料や長期上昇はありますが、グラフ上は大きく上がった後の高い位置です。今すぐ買いではなく、押し目や決算確認を待つ判定にしました。`,
      reasons: ["長期の上昇力は確認できる"],
      risks: ["3年で大きく上がった後で、高い価格で買ってしまいやすい", "買うなら押し目と損切りラインを先に決めたい"],
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
  const now = new Date();
  return {
    searchEngine,
    googleSearch: searchEngine,
    lmStudio,
    markets: {
      jp: {
        label: "東証",
        open: isMarketOpen("JP", now),
        timeZone: "Asia/Tokyo",
        regularHours: "9:00-11:30 / 12:30-15:30",
      },
      us: {
        label: "NYSE",
        open: isMarketOpen("US", now),
        timeZone: "America/New_York",
        regularHours: "9:30-16:00",
      },
      crypto: {
        label: "BTC",
        open: true,
        timeZone: "UTC",
        regularHours: "24時間",
      },
    },
    settings: publicSettings(settings),
  };
}

async function checkTimelyDisclosures(options = {}) {
  const settings = await readSettings();
  const previous = await readDisclosureCache();
  const generatedAt = new Date().toISOString();
  if (!settings.tdnetDisclosureEnabled) {
    const result = {
      generatedAt,
      enabled: false,
      source: "TDnet適時開示情報閲覧サービス",
      sourceUrl: TDNET_SOURCE_BASE,
      lookbackDays: settings.tdnetDisclosureLookbackDays,
      holdings: [],
      checkedCount: 0,
      matchedCount: 0,
      candidateCount: 0,
      usedLmStudio: false,
      warnings: [],
      important: [],
      recent: [],
      message: "TDnet重大開示フィルタはOFFです。",
    };
    await saveDisclosureCache(result);
    return result;
  }

  if (!options.force && previous.generatedAt && !isOlderThan(cacheHourKey(previous.generatedAt), cacheHourKey(generatedAt))) {
    return previous;
  }

  const stocks = (await readWatchlist()).filter((stock) => stock.holding && /\.T$/.test(stock.symbol));
  const holdings = stocks.map((stock) => ({
    symbol: stock.symbol,
    name: stock.name,
    codes: tdnetCodesForSymbol(stock.symbol),
  }));
  if (!holdings.length) {
    const result = {
      generatedAt,
      enabled: true,
      source: "TDnet適時開示情報閲覧サービス",
      sourceUrl: TDNET_SOURCE_BASE,
      lookbackDays: settings.tdnetDisclosureLookbackDays,
      holdings: [],
      checkedCount: 0,
      matchedCount: 0,
      candidateCount: 0,
      usedLmStudio: false,
      warnings: [],
      important: [],
      recent: [],
      message: "保有中の日本株がないため、TDnet確認はスキップしました。",
    };
    await saveDisclosureCache(result);
    return result;
  }

  const holdingByCode = new Map();
  holdings.forEach((stock) => stock.codes.forEach((code) => holdingByCode.set(code, stock)));
  const lookbackDays = clamp(Number(settings.tdnetDisclosureLookbackDays || 3), 1, 7);
  const { items, warnings } = await fetchTdnetRecentDisclosures(lookbackDays);
  const matched = items
    .map((disclosure) => ({
      ...disclosure,
      stock: holdingByCode.get(disclosure.code) || holdingByCode.get(disclosure.normalizedCode),
    }))
    .filter((disclosure) => disclosure.stock);
  const candidates = matched
    .map((disclosure) => ({
      ...disclosure,
      assessment: disclosureTitleAssessment(disclosure.title),
    }))
    .filter((disclosure) => disclosure.assessment.watch);

  let reviews = candidates.map((disclosure) => fallbackDisclosureReview(disclosure));
  let usedLmStudio = false;
  const nextWarnings = [...warnings];
  if (settings.tdnetDisclosureUseLmStudio !== false && candidates.length) {
    try {
      const model = await getLmStudioModel();
      reviews = await aiDisclosureReviews(model, candidates);
      usedLmStudio = true;
    } catch (error) {
      nextWarnings.push(`LM Studio判定: ${error.message || "失敗"}`);
    }
  }
  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const reviewed = candidates.map((disclosure) => ({
    ...disclosure,
    review: normalizeDisclosureReview(reviewById.get(disclosure.id), disclosure),
  }));
  const important = reviewed.filter((disclosure) => disclosureIsImportant(disclosure.review)).slice(0, 20);
  const result = {
    generatedAt,
    enabled: true,
    source: "TDnet適時開示情報閲覧サービス",
    sourceUrl: TDNET_SOURCE_BASE,
    lookbackDays,
    holdings,
    checkedCount: items.length,
    matchedCount: matched.length,
    candidateCount: candidates.length,
    usedLmStudio,
    warnings: nextWarnings.slice(0, 8),
    important: important.map(compactDisclosure),
    recent: reviewed.slice(0, 80).map(compactDisclosure),
    message: important.length
      ? `保有銘柄の重大開示を${important.length}件確認しました。`
      : "通知対象の重大開示はありません。",
  };
  await saveDisclosureCache(result);
  if (options.notify !== false) await notifyDisclosureSignals(result, settings).catch(() => {});
  return result;
}

async function fetchTdnetRecentDisclosures(lookbackDays = 3) {
  const warnings = [];
  const items = [];
  for (const dateKey of recentJstDateKeys(lookbackDays)) {
    for (let page = 1; page <= 20; page += 1) {
      const pageUrl = tdnetListUrl(dateKey, page);
      let response = null;
      try {
        response = await fetchWithTimeout(pageUrl, {
          timeout: 15000,
          headers: { "user-agent": "Mozilla/5.0 Stock Signal TDnet disclosure checker" },
        });
      } catch (error) {
        if (page === 1) warnings.push(`${tdnetDateToIso(dateKey)}のTDnet取得に失敗しました。`);
        break;
      }
      if (!response?.ok) {
        if (page === 1 && response?.status !== 404) warnings.push(`${tdnetDateToIso(dateKey)}のTDnetがHTTP ${response.status}でした。`);
        break;
      }
      const html = await response.text();
      const parsed = parseTdnetListPage(html, dateKey, pageUrl);
      items.push(...parsed.items);
      if (page >= parsed.totalPages || !parsed.items.length) break;
    }
  }
  return { items: uniqueBy(items, (item) => item.id), warnings };
}

function parseTdnetListPage(html = "", dateKey = "", pageUrl = "") {
  const items = [];
  const rows = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const match of rows) {
    const row = match[1] || "";
    if (!/kjCode/i.test(row) || !/kjTitle/i.test(row)) continue;
    const time = extractTdnetCell(row, "kjTime");
    const code = normalizeTdnetCode(extractTdnetCell(row, "kjCode"));
    const name = extractTdnetCell(row, "kjName");
    const titleCell = extractTdnetCellHtml(row, "kjTitle");
    const anchor = titleCell.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const title = cleanText(anchor ? htmlToInlineText(anchor[2]) : htmlToInlineText(titleCell));
    if (!code || !title) continue;
    const href = anchor?.[1] || "";
    const url = href ? absoluteTdnetUrl(href) : pageUrl;
    items.push({
      id: `${dateKey}:${code}:${href || title}`,
      date: tdnetDateToIso(dateKey),
      time,
      code,
      normalizedCode: code.replace(/0$/, ""),
      name,
      title,
      url,
      source: "TDnet",
      pageUrl,
    });
  }
  const totalText = cleanText(html);
  const total = Number((totalText.match(/全\s*([0-9,]+)\s*件/)?.[1] || "").replace(/,/g, ""));
  const totalPages = Number.isFinite(total) && total > 0 ? Math.ceil(total / 100) : 1;
  return { items, totalPages };
}

function disclosureTitleAssessment(title = "") {
  const criticalHits = DISCLOSURE_CRITICAL_WORDS.filter((word) => title.includes(word));
  const growthReviewHits = DISCLOSURE_GROWTH_REVIEW_WORDS.filter((word) => title.includes(word));
  const ignoreHits = DISCLOSURE_IGNORE_WORDS.filter((word) => title.includes(word));
  if (!criticalHits.length && !growthReviewHits.length && ignoreHits.length) {
    return { watch: false, severity: "ignore", keywords: [], ignored: ignoreHits };
  }
  const severe = ["上場廃止", "整理銘柄", "監理銘柄", "債務超過", "継続企業の前提", "不適切会計", "不正", "行政処分"]
    .some((word) => title.includes(word));
  return {
    watch: Boolean(criticalHits.length || growthReviewHits.length),
    severity: severe ? "critical" : criticalHits.length ? "important" : "ignore",
    keywords: uniqueText([...criticalHits, ...growthReviewHits]),
    ignored: ignoreHits,
  };
}

async function aiDisclosureReviews(model, disclosures = []) {
  const payload = disclosures.slice(0, 24).map((disclosure) => ({
    id: disclosure.id,
    symbol: disclosure.stock?.symbol || "",
    company: disclosure.stock?.name || disclosure.name,
    date: disclosure.date,
    time: disclosure.time,
    title: disclosure.title,
    url: disclosure.url,
    keywordHits: disclosure.assessment?.keywords || [],
  }));
  const prompt = `あなたは日本株の適時開示を保有者向けにふるい分けるアナリストです。
次のTDnet開示タイトルを確認し、保有企業の根本的価値に関わる重大ニュースだけを important 以上にしてください。
重大扱いの例: 業績下方修正、減配/無配、赤字転落、特別損失、減損、債務超過、継続企業の前提、上場廃止、不祥事、行政処分、事業撤退。
決算短信・決算説明資料は確認対象だが、売上成長率の明確な鈍化、ガイダンス失望、需要/粗利/受注の構造悪化など、成長ストーリー崩壊が読み取れる場合だけ important 以上にしてください。
通常は通知しない例: 役員人事、自己株式取得、月次、株主総会、コーポレートガバナンス、軽微な事務的開示。
PDF本文がない場合は、タイトルだけで断定しすぎず「確認が必要」と書いてください。

返答はこのJSONだけ:
{"reviews":[{"id":"...","severity":"critical|important|monitor|ignore","fundamentalImpact":true,"category":"下方修正|減配|赤字/損失|減損|上場廃止|不祥事|その他","summary":"日本語で1文","whyNotify":"通知する/しない理由を1文","suggestedAction":"次に確認することを1文"}]}

TDnet開示:
${JSON.stringify(payload, null, 2)}`;
  let raw = "";
  try {
    raw = await callLmStudioResponses(model, prompt, { maxOutputTokens: 4096 });
  } catch {
    raw = await callLmStudioChat(model, prompt, { maxTokens: 4096 });
  }
  const parsed = parseJsonObject(raw);
  const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
  const byId = new Map(reviews.map((review) => [String(review.id || ""), review]));
  return disclosures.map((disclosure) => normalizeDisclosureReview(byId.get(disclosure.id), disclosure));
}

function normalizeDisclosureReview(review = {}, disclosure = {}) {
  const fallback = fallbackDisclosureReview(disclosure);
  const severity = ["critical", "important", "monitor", "ignore"].includes(review.severity) ? review.severity : fallback.severity;
  return {
    id: disclosure.id || review.id || "",
    severity,
    fundamentalImpact: typeof review.fundamentalImpact === "boolean" ? review.fundamentalImpact : fallback.fundamentalImpact,
    category: String(review.category || fallback.category || "その他").slice(0, 40),
    summary: String(review.summary || fallback.summary || disclosure.title || "").slice(0, 180),
    whyNotify: String(review.whyNotify || fallback.whyNotify || "").slice(0, 180),
    suggestedAction: String(review.suggestedAction || fallback.suggestedAction || "").slice(0, 180),
    keywords: asStringArray(review.keywords || disclosure.assessment?.keywords || fallback.keywords).slice(0, 8),
  };
}

function fallbackDisclosureReview(disclosure = {}) {
  const assessment = disclosure.assessment || disclosureTitleAssessment(disclosure.title || "");
  const keywords = assessment.keywords || [];
  const category = disclosureCategory(disclosure.title || "", keywords);
  return {
    id: disclosure.id || "",
    severity: assessment.severity || "monitor",
    fundamentalImpact: Boolean(keywords.length),
    category,
    summary: `${disclosure.stock?.name || disclosure.name || disclosure.code}で「${disclosure.title || "適時開示"}」が出ています。`,
    whyNotify: keywords.length ? `${keywords.slice(0, 2).join("、")}に該当し、保有理由の見直しが必要な可能性があります。` : "重大開示キーワードには該当しません。",
    suggestedAction: "開示資料を開き、通期業績・配当・一過性要因かを確認してください。",
    keywords,
  };
}

function disclosureCategory(title = "", keywords = []) {
  const text = `${title} ${keywords.join(" ")}`;
  if (/減配|無配|配当/.test(text)) return "減配/配当";
  if (/下方修正|業績予想|通期業績|連結業績/.test(text)) return "業績予想";
  if (/赤字|損失|減損|特別損失/.test(text)) return "赤字/損失";
  if (/上場廃止|監理銘柄|整理銘柄/.test(text)) return "上場廃止";
  if (/不適切会計|不正|行政処分|訴訟|調査委員会|第三者委員会/.test(text)) return "不祥事/法務";
  if (/事業撤退|事業休止|リコール/.test(text)) return "事業リスク";
  return "その他";
}

function disclosureIsImportant(review = {}) {
  return review.fundamentalImpact !== false && ["critical", "important"].includes(review.severity);
}

function compactDisclosure(disclosure = {}) {
  return {
    id: disclosure.id,
    date: disclosure.date,
    time: disclosure.time,
    code: disclosure.code,
    symbol: disclosure.stock?.symbol || "",
    name: disclosure.stock?.name || disclosure.name || disclosure.code,
    title: disclosure.title,
    url: disclosure.url,
    source: disclosure.source || "TDnet",
    pageUrl: disclosure.pageUrl,
    review: normalizeDisclosureReview(disclosure.review, disclosure),
  };
}

async function notifyDisclosureSignals(result = {}, settings = {}) {
  if (!settings.notificationsEnabled) return;
  if (!settings.teamsWebhookUrl && !(settings.graphAccessToken && settings.graphChatId)) return;
  const cache = await readAnalysisCache().catch(() => ({ analyses: [] }));
  const contextBySymbol = new Map((cache.analyses || []).map((analysis) => [analysis.symbol, analysis]));
  const signals = (result.important || []).map((disclosure) => {
    const symbol = disclosure.symbol || disclosure.code;
    const context = contextBySymbol.get(symbol) || {};
    return {
      key: `tdnet:${disclosure.id}`,
      absoluteKey: true,
      action: `重大開示/${disclosure.review?.category || "要確認"}`,
      symbol,
      name: disclosure.name || disclosure.symbol || disclosure.code,
      confidence: disclosure.review?.severity === "critical" ? 96 : 88,
      netEdgeYen: 0,
      currency: context.price?.currency || "JPY",
      currentPrice: context.price?.current,
      averagePurchasePrice: context.position?.purchasePrice,
      averageSellPrice: context.position?.averageSellPrice,
      quantity: Number(context.position?.sellableQuantity) > 0 ? context.position.sellableQuantity : undefined,
      accountText: context.position?.accountType ? accountTypeLabel(context.position.accountType) : "",
      hideEdge: true,
      reason: disclosure.review?.summary || disclosure.title,
      points: [
        `開示: ${disclosure.title}`,
        `日時: ${disclosure.date} ${disclosure.time}`,
        disclosure.review?.whyNotify,
        disclosure.review?.suggestedAction,
        disclosure.url,
      ].filter(Boolean),
    };
  });
  await sendSignalsOnce(signals, settings);
}

function tdnetCodesForSymbol(symbol = "") {
  const base = String(symbol).trim().toUpperCase().replace(/\.T$/, "");
  if (!base) return [];
  return uniqueText([base, `${base}0`]);
}

function recentJstDateKeys(days = 3) {
  const parts = zonedParts(new Date(), "Asia/Tokyo");
  if (!parts) return [];
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const count = clamp(Number(days || 3), 1, 7);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() - index);
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  });
}

function tdnetListUrl(dateKey, page) {
  return `${TDNET_SOURCE_BASE}I_list_${String(page).padStart(3, "0")}_${dateKey}.html`;
}

function tdnetDateToIso(dateKey = "") {
  const text = String(dateKey);
  if (!/^\d{8}$/.test(text)) return "";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function normalizeTdnetCode(value = "") {
  return String(value).trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function extractTdnetCell(row = "", className = "") {
  return cleanText(htmlToInlineText(extractTdnetCellHtml(row, className)));
}

function extractTdnetCellHtml(row = "", className = "") {
  const re = new RegExp(`<td[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i");
  return row.match(re)?.[1] || "";
}

function htmlToInlineText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function absoluteTdnetUrl(href = "") {
  try {
    return new URL(href, TDNET_SOURCE_BASE).toString();
  } catch {
    return "";
  }
}

function isJpDisclosureBusinessDay(value = new Date()) {
  const parts = zonedParts(value, "Asia/Tokyo");
  return Boolean(parts && isJpExchangeBusinessDay(parts));
}

async function searchDiagnostics() {
  const settings = await readSettings();
  if (settings.searchProvider !== "searxng") {
    return {
      provider: "Google",
      engines: "",
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
      label: "ニュース語句検索",
      categories: "general",
      engines: normalizeSearxngEngines(settings.searxngEngines),
      query: "日本株 決算短信 上方修正 増配",
    }),
    diagnosticSearxngCheck(settings, {
      label: "通常検索",
      categories: "general",
      engines: normalizeSearxngEngines(settings.searxngEngines),
      query: "株探 上方修正 決算短信 日本株",
    }),
  ]);
  const stopped = uniqueBy(checks.flatMap((check) => check.stopped || []), (item) => `${item.engine}:${item.reason}`);
  return {
    provider: "SearXNG",
    engines: normalizeSearxngEngines(settings.searxngEngines),
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
      const checks = [
        { query: "日本株 決算短信 上方修正 増配", categories: "general", engines: normalizeSearxngEngines(resolved.searxngEngines) },
        { query: "株探 決算速報 日本株", categories: "general", engines: normalizeSearxngEngines(resolved.searxngEngines) },
      ];
      let responseOk = false;
      let resultCount = 0;
      for (const check of checks) {
        const data = await fetchSearxngData(check.query, {
          settings: resolved,
          language: "ja-JP",
          categories: check.categories,
          engines: check.engines,
          timeout: 10000,
        });
        responseOk = true;
        resultCount = Array.isArray(data.results) ? data.results.length : 0;
        if (resultCount > 0) break;
      }
      return {
        ok: responseOk && resultCount > 0,
        provider: "SearXNG",
        engines: normalizeSearxngEngines(resolved.searxngEngines),
        configured: Boolean(resolved.searxngUrl),
        url: resolved.searxngUrl,
        triedUrls: searxngCandidateUrls(resolved),
        resultCount,
      };
    } catch (error) {
      return {
        ok: false,
        provider: "SearXNG",
        engines: normalizeSearxngEngines(resolved.searxngEngines),
        configured: Boolean(resolved.searxngUrl),
        url: resolved.searxngUrl,
        triedUrls: searxngCandidateUrls(resolved),
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
  let lastError = null;
  for (const url of lmStudioCandidateUrls(resolved)) {
    for (const timeout of [4500, 9000]) {
      try {
        const response = await fetchWithTimeout(`${url}/models`, { timeout });
        const data = response.ok ? await response.json() : {};
        if (!response.ok) {
          lastError = new Error(`LM Studio models returned ${response.status}`);
          continue;
        }
        if (response.ok) {
          lmModelCache = {
            configuredUrl: resolved.lmStudioUrl,
            url,
            model: data?.data?.[0]?.id || lmModelCache.model || "",
          };
        }
        return {
          ok: response.ok,
          url,
          configuredUrl: resolved.lmStudioUrl,
          model: data?.data?.[0]?.id || "",
        };
      } catch (error) {
        lastError = error;
      }
    }
  }
  return {
    ok: false,
    url: resolved.lmStudioUrl,
    configuredUrl: resolved.lmStudioUrl,
    triedUrls: lmStudioCandidateUrls(resolved),
    error: lastError?.message || "LM Studioに接続できません",
  };
}

function normalizeStock(stock) {
  const positions = normalizePositions(stock);
  const sales = normalizeSales(stock);
  const aggregate = aggregatePositions(positions);
  const accountType = normalizeJpAccountType(stock.accountType || positions[0]?.accountType || defaultSettings.defaultJpAccountType);
  const purchaseDate = aggregate.purchaseDate || normalizeDate(stock.purchaseDate);
  const purchasePrice = aggregate.purchasePrice || nullablePositiveNumber(stock.purchasePrice);
  const soldQuantity = aggregateSales(sales).quantity || 0;
  const quantity = aggregate.quantity ? Math.max(0, aggregate.quantity - soldQuantity) || null : nullablePositiveNumber(stock.quantity);
  const minimumHoldQuantity = resolveMinimumHoldQuantity(stock, quantity || aggregate.quantity);
  const hasPosition = positions.length > 0 || sales.length > 0 || Boolean(purchaseDate || purchasePrice || quantity);
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
    accountType,
    positions,
    sales,
    minimumHoldQuantity,
    targetBuyPrice: nullablePositiveNumber(stock.targetBuyPrice),
  };
}

function normalizeUsStock(stock) {
  const positions = normalizePositions(stock);
  const sales = normalizeSales(stock);
  const aggregate = aggregatePositions(positions);
  const purchaseDate = aggregate.purchaseDate || normalizeDate(stock.purchaseDate);
  const purchasePrice = aggregate.purchasePrice || nullablePositiveNumber(stock.purchasePrice);
  const soldQuantity = aggregateSales(sales).quantity || 0;
  const quantity = aggregate.quantity ? Math.max(0, aggregate.quantity - soldQuantity) || null : nullablePositiveNumber(stock.quantity);
  const hasPosition = positions.length > 0 || sales.length > 0 || Boolean(purchaseDate || purchasePrice || quantity);
  return {
    symbol: normalizeUsSymbol(stock.symbol),
    name: String(stock.name || "").trim(),
    market: String(stock.market || "NYSE").trim().toUpperCase(),
    holding: typeof stock.holding === "boolean" ? stock.holding : hasPosition,
    notes: String(stock.notes || "").trim(),
    purchaseDate,
    purchasePrice,
    quantity,
    accountType: "revolut_us",
    positions,
    sales,
  };
}

function normalizeCryptoHolding(holding = {}) {
  const positions = normalizeCryptoPositions(holding);
  const sales = normalizeCryptoSales(holding);
  const hasPosition = positions.length > 0 || sales.length > 0;
  return {
    symbol: "BTC",
    name: "Bitcoin",
    market: "Crypto",
    holding: typeof holding.holding === "boolean" ? holding.holding : hasPosition,
    positions,
    sales,
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
  const sales = normalizeSales(stock);
  const aggregate = aggregatePositions(positions);
  const lotState = positionLotState(positions, sales);
  const grossQuantity = aggregate.quantity || 0;
  const grossInvested = aggregate.invested || 0;
  const soldQuantity = lotState.soldQuantity || 0;
  const remainingQuantity = lotState.remainingQuantity || Math.max(0, grossQuantity - soldQuantity);
  const remainingInvested = lotState.remainingInvested || null;
  const purchasePrice = remainingQuantity && remainingInvested
    ? remainingInvested / remainingQuantity
    : aggregate.purchasePrice;
  const realizedProceeds = lotState.realizedProceeds || null;
  const realizedCost = lotState.realizedCost || 0;
  const salesAggregate = aggregateSales(currentCycleSales(positions, sales, remainingQuantity));
  const averageSellPrice = salesAggregate.sellPrice;
  const realizedPnlAmount = Number.isFinite(realizedProceeds) && Number.isFinite(realizedCost) && soldQuantity
    ? realizedProceeds - realizedCost
    : soldQuantity && realizedCost ? -realizedCost : null;
  const current = nullablePositiveNumber(price.current);
  const firstPurchaseDate = lotState.remainingLots[0]?.purchaseDate || aggregate.purchaseDate;
  const holdingDays = firstPurchaseDate ? daysSince(firstPurchaseDate) : null;
  const unrealizedPnlAmount = purchasePrice && current && remainingQuantity ? (current - purchasePrice) * remainingQuantity : null;
  const unrealizedPnlPct = purchasePrice && current && remainingQuantity ? ((current - purchasePrice) / purchasePrice) * 100 : null;
  const pnlParts = [realizedPnlAmount, unrealizedPnlAmount].filter(Number.isFinite);
  const pnlAmount = pnlParts.length ? pnlParts.reduce((sum, value) => sum + value, 0) : null;
  const pnlPct = grossInvested && Number.isFinite(pnlAmount) ? (pnlAmount / grossInvested) * 100 : null;
  const marketValue = current && remainingQuantity ? current * remainingQuantity : null;
  const dividendReceived = dividendsForPositionHistory(positions, sales, price.dividendEvents || []);
  const annualDividendEstimate = Number.isFinite(price.dividendPerShareTtm) && remainingQuantity
    ? price.dividendPerShareTtm * remainingQuantity
    : null;
  const totalReturnAmount = Number.isFinite(pnlAmount)
    ? pnlAmount + (Number.isFinite(dividendReceived) ? dividendReceived : 0)
    : null;
  const totalReturnPct = grossInvested && Number.isFinite(totalReturnAmount)
    ? (totalReturnAmount / grossInvested) * 100
    : null;
  const minimumHoldQuantity = resolveMinimumHoldQuantity(stock, remainingQuantity);
  const sellableQuantity = Math.max(0, remainingQuantity - minimumHoldQuantity);
  return {
    positions,
    sales,
    remainingLots: lotState.remainingLots,
    purchaseDate: firstPurchaseDate,
    purchasePrice,
    grossPurchasePrice: aggregate.purchasePrice,
    quantity: remainingQuantity || null,
    grossQuantity: grossQuantity || null,
    soldQuantity: soldQuantity || null,
    holdingDays,
    invested: remainingInvested || null,
    grossInvested: grossInvested || null,
    marketValue,
    pnlAmount: Number.isFinite(pnlAmount) ? pnlAmount : null,
    pnlPct,
    realizedPnlAmount,
    unrealizedPnlAmount,
    unrealizedPnlPct,
    realizedProceeds: realizedProceeds || null,
    averageSellPrice,
    accountType: dominantAccountType(lotState.remainingLots, stock.accountType),
    dividendReceived,
    annualDividendEstimate,
    totalReturnAmount,
    totalReturnPct,
    minimumHoldQuantity,
    sellableQuantity,
  };
}

function cryptoPositionMetrics(holding, btcUsd = {}, btcJpy = {}, fxRate = null) {
  const normalized = normalizeCryptoHolding(holding);
  const positions = normalized.positions;
  const sales = normalized.sales;
  const aggregate = aggregateCryptoPositions(positions, fxRate);
  const saleAggregate = aggregateCryptoSales(sales, fxRate);
  const grossQuantity = aggregate.quantity || 0;
  const saleInputQuantity = saleAggregate.quantity || 0;
  const soldQuantity = Math.min(saleInputQuantity, grossQuantity);
  const remainingQuantity = Math.max(0, grossQuantity - soldQuantity);
  const currentUsd = nullablePositiveNumber(btcUsd.current);
  const currentJpy = nullablePositiveNumber(btcJpy.current) || (currentUsd && fxRate ? currentUsd * fxRate : null);
  const remainingInvestedUsd = aggregate.purchasePriceUsd && remainingQuantity ? aggregate.purchasePriceUsd * remainingQuantity : null;
  const remainingInvestedJpy = aggregate.purchasePriceJpy && remainingQuantity ? aggregate.purchasePriceJpy * remainingQuantity : null;
  const realizedProceedsUsd = saleInputQuantity > 0 && soldQuantity < saleInputQuantity
    ? (saleAggregate.proceedsUsd || 0) * (soldQuantity / saleInputQuantity)
    : saleAggregate.proceedsUsd;
  const realizedProceedsJpy = saleInputQuantity > 0 && soldQuantity < saleInputQuantity
    ? (saleAggregate.proceedsJpy || 0) * (soldQuantity / saleInputQuantity)
    : saleAggregate.proceedsJpy;
  const realizedPnlUsd = aggregate.purchasePriceUsd && soldQuantity
    ? (realizedProceedsUsd || 0) - (aggregate.purchasePriceUsd * soldQuantity)
    : null;
  const realizedPnlJpy = aggregate.purchasePriceJpy && soldQuantity
    ? (realizedProceedsJpy || 0) - (aggregate.purchasePriceJpy * soldQuantity)
    : null;
  const unrealizedPnlUsd = aggregate.purchasePriceUsd && currentUsd && remainingQuantity
    ? (currentUsd - aggregate.purchasePriceUsd) * remainingQuantity
    : null;
  const unrealizedPnlJpy = aggregate.purchasePriceJpy && currentJpy && remainingQuantity
    ? (currentJpy - aggregate.purchasePriceJpy) * remainingQuantity
    : null;
  const pnlAmountUsd = sumFinite([realizedPnlUsd, unrealizedPnlUsd]);
  const pnlAmountJpy = sumFinite([realizedPnlJpy, unrealizedPnlJpy]);
  const grossInvestedUsd = aggregate.investedUsd || null;
  const grossInvestedJpy = aggregate.investedJpy || null;
  return {
    positions,
    sales,
    purchaseDate: aggregate.purchaseDate,
    purchasePriceUsd: aggregate.purchasePriceUsd,
    purchasePriceJpy: aggregate.purchasePriceJpy,
    quantity: remainingQuantity || null,
    grossQuantity: grossQuantity || null,
    soldQuantity: soldQuantity || null,
    holdingDays: aggregate.purchaseDate ? daysSince(aggregate.purchaseDate) : null,
    currentUsd,
    currentJpy,
    investedUsd: remainingInvestedUsd,
    investedJpy: remainingInvestedJpy,
    grossInvestedUsd,
    grossInvestedJpy,
    marketValueUsd: currentUsd && remainingQuantity ? currentUsd * remainingQuantity : null,
    marketValueJpy: currentJpy && remainingQuantity ? currentJpy * remainingQuantity : null,
    realizedPnlUsd,
    realizedPnlJpy,
    unrealizedPnlUsd,
    unrealizedPnlJpy,
    pnlAmountUsd,
    pnlAmountJpy,
    pnlPctUsd: grossInvestedUsd && Number.isFinite(pnlAmountUsd) ? (pnlAmountUsd / grossInvestedUsd) * 100 : null,
    pnlPctJpy: grossInvestedJpy && Number.isFinite(pnlAmountJpy) ? (pnlAmountJpy / grossInvestedJpy) * 100 : null,
    realizedProceedsUsd: realizedProceedsUsd || null,
    realizedProceedsJpy: realizedProceedsJpy || null,
    fxRate,
    jpyEstimated: aggregate.jpyEstimated || saleAggregate.jpyEstimated,
    usdEstimated: aggregate.usdEstimated || saleAggregate.usdEstimated,
  };
}

function aggregateCryptoPositions(positions = [], fxRate = null) {
  const quantity = positions.reduce((sum, lot) => sum + lot.quantity, 0);
  let investedUsd = 0;
  let investedJpy = 0;
  let usdEstimated = false;
  let jpyEstimated = false;
  for (const lot of positions) {
    if (lot.purchasePriceUsd) investedUsd += lot.purchasePriceUsd * lot.quantity;
    else if (lot.purchasePriceJpy && fxRate) {
      investedUsd += (lot.purchasePriceJpy / fxRate) * lot.quantity;
      usdEstimated = true;
    }
    if (lot.purchasePriceJpy) investedJpy += lot.purchasePriceJpy * lot.quantity;
    else if (lot.purchasePriceUsd && fxRate) {
      investedJpy += (lot.purchasePriceUsd * fxRate) * lot.quantity;
      jpyEstimated = true;
    }
  }
  return {
    purchaseDate: positions.map((lot) => lot.purchaseDate).filter(Boolean).sort()[0] || "",
    purchasePriceUsd: quantity > 0 && investedUsd > 0 ? investedUsd / quantity : null,
    purchasePriceJpy: quantity > 0 && investedJpy > 0 ? investedJpy / quantity : null,
    quantity: quantity || null,
    investedUsd: investedUsd || null,
    investedJpy: investedJpy || null,
    usdEstimated,
    jpyEstimated,
  };
}

function aggregateCryptoSales(sales = [], fxRate = null) {
  const quantity = sales.reduce((sum, lot) => sum + lot.quantity, 0);
  let proceedsUsd = 0;
  let proceedsJpy = 0;
  let usdEstimated = false;
  let jpyEstimated = false;
  for (const lot of sales) {
    if (lot.sellPriceUsd) proceedsUsd += lot.sellPriceUsd * lot.quantity;
    else if (lot.sellPriceJpy && fxRate) {
      proceedsUsd += (lot.sellPriceJpy / fxRate) * lot.quantity;
      usdEstimated = true;
    }
    if (lot.sellPriceJpy) proceedsJpy += lot.sellPriceJpy * lot.quantity;
    else if (lot.sellPriceUsd && fxRate) {
      proceedsJpy += (lot.sellPriceUsd * fxRate) * lot.quantity;
      jpyEstimated = true;
    }
  }
  return {
    sellDate: sales.map((lot) => lot.sellDate).filter(Boolean).sort().at(-1) || "",
    sellPriceUsd: quantity > 0 && proceedsUsd > 0 ? proceedsUsd / quantity : null,
    sellPriceJpy: quantity > 0 && proceedsJpy > 0 ? proceedsJpy / quantity : null,
    quantity: quantity || null,
    proceedsUsd: proceedsUsd || null,
    proceedsJpy: proceedsJpy || null,
    usdEstimated,
    jpyEstimated,
  };
}

function sumFinite(values = []) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) : null;
}

function cryptoPortfolioSummary(position = {}) {
  return {
    quantity: position.quantity,
    investedUsd: position.investedUsd,
    investedJpy: position.investedJpy,
    marketValueUsd: position.marketValueUsd,
    marketValueJpy: position.marketValueJpy,
    pnlAmountUsd: position.pnlAmountUsd,
    pnlAmountJpy: position.pnlAmountJpy,
    pnlPctUsd: position.pnlPctUsd,
    pnlPctJpy: position.pnlPctJpy,
  };
}

function dividendsForPositionHistory(positions, sales, dividendEvents = []) {
  return dividendEvents.reduce((sum, event) => {
    const eventTime = event.date ? new Date(`${event.date}T00:00:00`).getTime() : null;
    const amount = Number(event.amount);
    if (!Number.isFinite(eventTime) || !Number.isFinite(amount)) return sum;
    const bought = positions.reduce((qty, lot) => {
      const time = lot.purchaseDate ? new Date(`${lot.purchaseDate}T00:00:00`).getTime() : -Infinity;
      return Number.isFinite(time) && time <= eventTime ? qty + lot.quantity : qty;
    }, 0);
    const sold = sales.reduce((qty, lot) => {
      const time = lot.sellDate ? new Date(`${lot.sellDate}T00:00:00`).getTime() : Infinity;
      return Number.isFinite(time) && time <= eventTime ? qty + lot.quantity : qty;
    }, 0);
    return sum + (Math.max(0, bought - sold) * amount);
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
      risks.push("過去3年の高値に近く、高い価格で買ってしまいやすい");
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

function aggregateSales(sales) {
  const quantity = sales.reduce((sum, lot) => sum + lot.quantity, 0);
  const proceeds = sales.reduce((sum, lot) => sum + (lot.sellPrice * lot.quantity), 0);
  return {
    sellDate: sales.map((lot) => lot.sellDate).filter(Boolean).sort().at(-1) || "",
    sellPrice: quantity > 0 ? proceeds / quantity : null,
    quantity: quantity || null,
    proceeds: proceeds || null,
  };
}

function currentCycleSales(positions = [], sales = [], remainingQuantity = 0) {
  if (!sales.length) return [];
  const resetDate = lastZeroPositionDate(positions, sales);
  if (!resetDate) return sales;
  const hasBuyAfterReset = positions.some((lot) => lot.purchaseDate && lot.purchaseDate > resetDate);
  if (!hasBuyAfterReset) return sales;
  return sales.filter((sale) => sale.sellDate && sale.sellDate > resetDate);
}

function lastZeroPositionDate(positions = [], sales = []) {
  const transactions = [
    ...positions.map((lot) => ({
      date: lot.purchaseDate || "",
      type: "buy",
      quantity: lot.quantity,
    })),
    ...sales.map((lot) => ({
      date: lot.sellDate || "",
      type: "sell",
      quantity: lot.quantity,
    })),
  ]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => {
      const dateCompare = (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99");
      if (dateCompare) return dateCompare;
      return a.type === "sell" ? -1 : 1;
    });

  let quantity = 0;
  let resetDate = "";
  for (const item of transactions) {
    quantity += item.type === "buy" ? item.quantity : -item.quantity;
    if (quantity <= 0.000001) {
      quantity = 0;
      resetDate = item.date || "";
    }
  }
  return resetDate;
}

function positionLotState(positions = [], sales = []) {
  const remainingLots = positions.map((lot) => ({ ...lot }));
  let soldQuantity = 0;
  let realizedCost = 0;
  let realizedProceeds = 0;
  const grossQuantity = positions.reduce((sum, lot) => sum + lot.quantity, 0);

  for (const sale of sales) {
    let saleLeft = Math.min(sale.quantity, Math.max(0, grossQuantity - soldQuantity));
    for (const lot of remainingLots) {
      if (saleLeft <= 0) break;
      if (!lot.quantity) continue;
      const take = Math.min(lot.quantity, saleLeft);
      lot.quantity = Math.max(0, lot.quantity - take);
      soldQuantity += take;
      saleLeft -= take;
      realizedCost += take * lot.purchasePrice;
      realizedProceeds += take * sale.sellPrice;
    }
  }

  const openLots = remainingLots
    .filter((lot) => lot.quantity > 0.000001)
    .map((lot) => ({
      purchaseDate: lot.purchaseDate,
      purchasePrice: lot.purchasePrice,
      quantity: Math.round(lot.quantity * 1000000) / 1000000,
      accountType: lot.accountType,
    }));
  const remainingQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const remainingInvested = openLots.reduce((sum, lot) => sum + (lot.purchasePrice * lot.quantity), 0);

  return {
    remainingLots: openLots,
    soldQuantity: Math.round(soldQuantity * 1000000) / 1000000,
    remainingQuantity: Math.round(remainingQuantity * 1000000) / 1000000,
    remainingInvested,
    realizedCost,
    realizedProceeds,
  };
}

function buildSectorEvidence(rows = []) {
  const bySector = new Map();
  for (const row of rows) {
    const sector = row.stock?.sector || stockSector(row.stock || {}) || "その他";
    const current = bySector.get(sector) || {
      sector,
      symbols: new Set(),
      items: [],
    };
    if (row.stock?.symbol) current.symbols.add(row.stock.symbol);
    const sectorItems = (row.research?.evidence || [])
      .filter((item) => item.kind === "sector")
      .map((item) => ({
        title: item.title,
        url: item.url,
        source: item.source,
        snippet: item.snippet,
        publishedDate: item.publishedDate || "",
        sector,
      }));
    current.items.push(...sectorItems);
    bySector.set(sector, current);
  }
  return [...bySector.values()].map((group) => ({
    sector: group.sector,
    symbols: [...group.symbols].sort(),
    items: uniqueBy(group.items, (item) => item.url).slice(0, 8),
  })).filter((group) => group.items.length);
}

function mergeAnalysisRows(existing = [], nextRow = null) {
  const rows = Array.isArray(existing) ? existing.filter((row) => row?.symbol) : [];
  if (!nextRow?.symbol) return rows;
  const index = rows.findIndex((row) => row.symbol === nextRow.symbol);
  if (index >= 0) {
    rows[index] = nextRow;
    return rows;
  }
  return [...rows, nextRow];
}

function mergeSectorEvidence(existing = [], incoming = []) {
  const bySector = new Map();
  for (const group of normalizeSectorEvidence(existing)) {
    bySector.set(group.sector, {
      sector: group.sector,
      symbols: new Set(group.symbols || []),
      items: group.items || [],
    });
  }
  for (const group of normalizeSectorEvidence(incoming)) {
    const current = bySector.get(group.sector) || {
      sector: group.sector,
      symbols: new Set(),
      items: [],
    };
    for (const symbol of group.symbols || []) current.symbols.add(symbol);
    current.items = uniqueBy(
      [...(group.items || []), ...current.items],
      (item) => item.url || `${item.source || ""}:${item.title || ""}`,
    ).slice(0, 8);
    bySector.set(group.sector, current);
  }
  return [...bySector.values()].map((group) => ({
    sector: group.sector,
    symbols: [...group.symbols].sort(),
    items: group.items,
  })).filter((group) => group.items.length);
}

function isRelevantSectorEvidence(item = {}, sector = "") {
  const normalizedSector = cleanText(sector);
  if (!normalizedSector || normalizedSector === "その他") return false;
  const text = businessContextText(`${item.title || ""} ${item.snippet || ""} ${item.url || ""}`);
  if (!text) return false;
  const hasSector = sectorEvidenceTerms(normalizedSector).some((term) => text.includes(term.toLowerCase()));
  const hasMarketContext = [
    "株", "日本株", "銘柄", "市場", "市況", "業界", "業績", "決算", "見通し", "需要", "供給",
    "利益", "売上", "営業益", "増益", "減益", "配当", "投資", "証券", "経済", "景気", "レーティング",
    "stock", "stocks", "market", "markets", "sector", "industry", "earnings", "revenue", "profit",
    "guidance", "outlook", "analyst", "dividend",
  ].some((term) => text.includes(term.toLowerCase()));
  const looksConsumerOnly = [
    "typing test", "typing speed", "wpm", "recipe", "salad", "wikipedia", "国語辞典", "英和辞典",
    "意味や使い方", "とは何か", "jlpt", "play on", "cooking",
  ].some((term) => text.includes(term.toLowerCase()));
  return hasSector && hasMarketContext && !looksConsumerOnly;
}

function sectorEvidenceTerms(sector = "") {
  const normalized = cleanText(sector);
  const aliases = {
    鉄道: ["鉄道", "鉄道株", "私鉄", "JR", "railway", "railroad"],
    航空: ["航空", "航空株", "航空会社", "空運", "airline", "airlines", "aviation"],
    通信: ["通信", "通信株", "通信会社", "携帯", "通信キャリア", "telecom", "telecommunications"],
    自動車: ["自動車", "自動車株", "完成車", "automotive", "automaker"],
    自動車部品: ["自動車部品", "車載", "自動車部品株", "automotive parts"],
    半導体: ["半導体", "半導体株", "半導体製造装置", "semiconductor"],
    電機: ["電機", "電気機器", "電機株", "electronics"],
    電子部品: ["電子部品", "電子部品株", "electronics components"],
    機械: ["機械", "機械株", "産業機械", "machinery"],
    FA: ["FA", "ファクトリーオートメーション", "factory automation"],
    銀行: ["銀行", "銀行株", "金融", "bank"],
    金融: ["金融", "金融株", "finance", "financial"],
    保険: ["保険", "保険株", "損保", "insurance"],
    商社: ["商社", "総合商社", "trading company"],
    不動産: ["不動産", "不動産株", "real estate"],
    医薬品: ["医薬品", "製薬", "pharma", "pharmaceutical"],
    小売: ["小売", "小売株", "retail"],
    建設: ["建設", "ゼネコン", "construction"],
    資源: ["資源", "原油", "天然ガス", "resource", "energy"],
    エネルギー: ["エネルギー", "電力", "石油", "energy"],
    電力: ["電力", "電力株", "電力会社", "utility", "utilities"],
    素材: ["素材", "素材株", "化学", "materials"],
    食品: ["食品", "食品株", "food"],
    生活用品: ["生活用品", "日用品", "consumer staples"],
    サービス: ["サービス", "サービス株", "service"],
    IT: ["IT", "情報通信", "ソフトウェア", "technology"],
    レジャー: ["レジャー", "テーマパーク", "旅行", "leisure"],
    化粧品: ["化粧品", "化粧品株", "cosmetics"],
    繊維製品: ["繊維製品", "繊維株", "アパレル", "textile"],
  };
  return uniqueText([normalized, ...(aliases[normalized] || [])]);
}

function normalizeSectorEvidence(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((group) => ({
    sector: String(group.sector || "その他").trim(),
    symbols: asStringArray(group.symbols).slice(0, 20),
    items: Array.isArray(group.items) ? group.items.map((item) => ({
      title: String(item.title || "").slice(0, 180),
      url: String(item.url || ""),
      source: String(item.source || ""),
      snippet: String(item.snippet || "").slice(0, 300),
      publishedDate: normalizeDate(item.publishedDate) || searchResultPublishedDate(item),
      sector: String(item.sector || group.sector || "その他"),
    })).filter((item) => (item.url || item.title) && isRelevantSectorEvidence(item, group.sector)).slice(0, 8) : [],
  })).filter((group) => group.items.length);
}

async function readAnalysisCache() {
  try {
    const cached = JSON.parse(await readFile(ANALYSIS_CACHE_PATH, "utf8"));
    const stocks = await readWatchlist().catch(() => []);
    const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const analyses = Array.isArray(cached.analyses)
      ? cached.analyses.map((analysis) => sanitizeCachedAnalysis(analysis, bySymbol.get(analysis.symbol))).filter(Boolean)
      : [];
    return {
      generatedAt: cached.generatedAt || "",
      fastRefresh: Boolean(cached.fastRefresh),
      usedLmStudio: Boolean(cached.usedLmStudio),
      warnings: asStringArray(cached.warnings).slice(0, 6),
      analyses,
      sectorEvidence: normalizeSectorEvidence(cached.sectorEvidence),
    };
  } catch {
    return { generatedAt: "", fastRefresh: false, usedLmStudio: false, warnings: [], analyses: [], sectorEvidence: [] };
  }
}

function sanitizeCachedAnalysis(analysis = {}, stock = null) {
  const symbol = normalizeSymbol(analysis.symbol || stock?.symbol);
  if (!symbol) return null;
  const resolvedStock = stock || normalizeStock({
    symbol,
    name: analysis.name || symbol,
    holding: Boolean(analysis.position?.quantity),
  });
  const price = analysis.price || {};
  const position = positionMetrics(resolvedStock, price);
  const initialAction = ["BUY", "HOLD", "SELL", "WATCH"].includes(analysis.action) ? analysis.action : "WATCH";
  const safety = decisionSafetyOverride(resolvedStock, price, initialAction, position);
  const action = safety.action;
  const growthExit = enforceRecentGrowthExit(
    normalizeGrowthExit(analysis.growthExit || analysis.ai?.growthExit),
    { evidence: analysis.evidence || [] },
    resolvedStock,
  );
  const sellForecast = normalizeSellForecast(analysis.sellForecast || analysis.ai?.sellForecast)
    || ruleSellForecast({ price, position }, "JPY");
  return {
    ...analysis,
    symbol,
    name: resolvedStock.name || analysis.name || symbol,
    action,
    thesis: safety.thesis || analysis.thesis || `${resolvedStock.name || symbol}は${actionLabels[action]}判定。`,
    reasons: uniqueText([...asStringArray(analysis.reasons), ...safety.reasons]).slice(0, 5),
    risks: uniqueText([...asStringArray(analysis.risks), ...safety.risks]).slice(0, 5),
    position,
    growthExit,
    sellForecast,
    financials: analysis.financials ? normalizeFinancialSnapshot(analysis.financials) : analysis.financials,
    ai: analysis.ai ? { ...analysis.ai, growthExit, sellForecast: normalizeSellForecast(analysis.ai.sellForecast) || sellForecast } : analysis.ai,
    entryValue: evaluateEntryPrice(resolvedStock.targetBuyPrice, price),
  };
}

async function saveAnalysisCache(result) {
  await mkdir(path.dirname(ANALYSIS_CACHE_PATH), { recursive: true });
  await writeFile(ANALYSIS_CACHE_PATH, JSON.stringify({
    generatedAt: result.generatedAt,
    fastRefresh: Boolean(result.fastRefresh),
    usedLmStudio: result.usedLmStudio,
    warnings: result.warnings || [],
    analyses: result.analyses || [],
    sectorEvidence: normalizeSectorEvidence(result.sectorEvidence),
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

async function discoveryCacheForCurrentSettings() {
  const settings = await readSettings();
  const cached = await readDiscoveryCache();
  const cachedKey = cached.sourceSummary?.settingsKey || "";
  const currentKey = discoverySettingsKey(settings);
  if (!cachedKey && (cached.suggestions.length || cached.sourceSummary)) return resetDiscoveryCacheForSettings(settings);
  if (cachedKey && cachedKey !== currentKey) return resetDiscoveryCacheForSettings(settings);
  return cached;
}

async function resetDiscoveryCacheForSettings(settings) {
  const sourceSummary = await searchSourceSummary(0, 0, {
    unitSize: settings.unitSize,
    unitBudget: settings.unitBudget,
    unitBudgetUnlimited: settings.unitBudgetUnlimited,
    settingsChanged: true,
    message: "調査条件または採点ルールが変わりました。候補を探すで現在の条件に合わせて作り直してください。",
  });
  const result = {
    generatedAt: "",
    added: [],
    stocks: [],
    suggestions: [],
    evidence: [],
    sourceSummary,
    message: sourceSummary.message,
  };
  await saveDiscoveryCache(result);
  return result;
}

function discoverySettingsKey(settings = {}) {
  const normalized = normalizeSettings(settings);
  return JSON.stringify({
    searchProvider: normalized.searchProvider,
    searxngUrl: normalized.searxngUrl,
    searxngEngines: normalized.searxngEngines,
    unitSize: normalized.unitSize,
    unitBudget: normalized.unitBudget,
    unitBudgetUnlimited: normalized.unitBudgetUnlimited === true,
    websiteLimit: normalized.websiteLimit,
    depthLimit: normalized.depthLimit,
    pagesPerSite: normalized.pagesPerSite,
    hasEdinetApiKey: Boolean(normalized.edinetApiKey),
    scoringVersion: DISCOVERY_SCORING_VERSION,
  });
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
  const suggestions = (result.suggestions || [])
    .filter((candidate) => !excluded.has(candidate.symbol))
    .filter((candidate) => !isDiscoveryAvoidedBusiness(candidate))
    .filter(isActionableDiscoveryCandidate)
    .map((candidate) => ({
      ...candidate,
      priorityScore: discoveryPriorityScore(candidate),
      pePriorityScore: pePriorityScore(candidate),
      reportBucket: isPeReportCandidate(candidate) ? "pe" : "stock",
    }));
  return {
    generatedAt: result.generatedAt || "",
    added: result.added || [],
    stocks: result.stocks || [],
    suggestions,
    evidence: result.evidence || [],
    sourceSummary: result.sourceSummary
      ? {
        ...result.sourceSummary,
        strictBuyTarget: true,
        avoidedBusiness: result.sourceSummary.avoidedBusiness || "卸売・食品、情報系ベンチャー寄りは候補から除外",
        peCriteria: result.sourceSummary.peCriteria || PE_FINANCIAL_CRITERIA.map((item) => item.label),
        peTendencies: result.sourceSummary.peTendencies || PE_RECENT_TENDENCIES,
        excludedCount: excludedCandidates.length,
        suggestionCount: suggestions.length,
      }
      : null,
    message: result.message || "",
  };
}

async function readCandidateHistory() {
  try {
    const cached = JSON.parse(await readFile(CANDIDATE_HISTORY_PATH, "utf8"));
    const items = Array.isArray(cached.items) ? cached.items.map(normalizeCandidateHistoryItem).filter(Boolean) : [];
    return { items };
  } catch {
    return { items: [] };
  }
}

async function saveCandidateHistory(history = {}) {
  const items = uniqueBy((history.items || []).map(normalizeCandidateHistoryItem).filter(Boolean), (item) => item.id)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.symbol.localeCompare(b.symbol))
    .slice(-2000);
  await mkdir(path.dirname(CANDIDATE_HISTORY_PATH), { recursive: true });
  await writeFile(CANDIDATE_HISTORY_PATH, JSON.stringify({ items }, null, 2));
  return { items };
}

function normalizeCandidateHistoryItem(item = {}) {
  const symbol = normalizeDiscoverySymbol(item.symbol, item);
  const generatedAt = item.generatedAt || "";
  if (!symbol || !generatedAt) return null;
  const currency = item.currency || (/\.T$/.test(symbol) ? "JPY" : "USD");
  return {
    id: String(item.id || `${generatedAt}:${symbol}`),
    generatedAt,
    symbol,
    currency,
    name: String(item.name || symbol),
    sector: String(item.sector || "その他"),
    rank: Number(item.rank || 0),
    score: nullableNonNegativeNumber(item.score),
    businessValueScore: nullableNonNegativeNumber(item.businessValueScore),
    entryPrice: nullablePositiveNumber(item.entryPrice),
    buyTarget: nullablePositiveNumber(item.buyTarget),
    sellTarget: nullablePositiveNumber(item.sellTarget),
    stopLine: nullablePositiveNumber(item.stopLine),
    buyLine1y: nullablePositiveNumber(item.buyLine1y),
    peMatchScore: nullableNonNegativeNumber(item.peMatchScore),
    peLabel: String(item.peLabel || ""),
    reasons: asStringArray(item.reasons).slice(0, 5),
    risks: asStringArray(item.risks).slice(0, 5),
    latestPrice: nullablePositiveNumber(item.latestPrice),
    latestDate: normalizeDate(item.latestDate),
    latestReturnPct: numberOrNull(item.latestReturnPct),
    maxReturnPct: numberOrNull(item.maxReturnPct),
    minReturnPct: numberOrNull(item.minReturnPct),
    elapsedTradingDays: nullableNonNegativeNumber(item.elapsedTradingDays) || 0,
    outcome: ["hit", "miss", "pending"].includes(item.outcome) ? item.outcome : "pending",
    outcomeReason: String(item.outcomeReason || ""),
    evaluatedAt: item.evaluatedAt || "",
  };
}

async function recordCandidateSnapshots(suggestions = [], discovery = {}) {
  if (!suggestions.length) return;
  const history = await readCandidateHistory();
  const byId = new Map(history.items.map((item) => [item.id, item]));
  suggestions.forEach((candidate, index) => {
    const current = nullablePositiveNumber(candidate.price?.current);
    const generatedAt = discovery.generatedAt || new Date().toISOString();
    if (!current) return;
    const item = normalizeCandidateHistoryItem({
      id: `${generatedAt}:${candidate.symbol}`,
      generatedAt,
      symbol: candidate.symbol,
      currency: candidate.currency || candidate.price?.currency || discoveryCurrency(candidate),
      name: candidate.name,
      sector: candidate.sector,
      rank: index + 1,
      score: candidate.score,
      businessValueScore: candidate.businessValueScore,
      entryPrice: current,
      buyTarget: candidate.buyPlan?.maxBuyPrice,
      sellTarget: candidate.sellPlan?.targetPrice,
      stopLine: candidate.sellPlan?.stopPrice,
      buyLine1y: candidate.price?.buyLine1y,
      peMatchScore: candidate.peSignal?.matchScore,
      peLabel: candidate.peSignal?.label,
      reasons: candidate.reasons,
      risks: candidate.risks,
      outcome: "pending",
    });
    if (item) byId.set(item.id, { ...byId.get(item.id), ...item });
  });
  await saveCandidateHistory({ items: [...byId.values()] });
}

async function updateCandidateHistoryOutcomes({ maxUpdates = 50 } = {}) {
  const history = await readCandidateHistory();
  const pending = history.items
    .filter((item) => item.outcome === "pending" && item.entryPrice)
    .sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt))
    .slice(0, maxUpdates);
  if (!pending.length) return history;
  const updated = new Map(history.items.map((item) => [item.id, item]));
  for (const item of pending) {
    const price = await fetchPriceHistory(item.symbol).catch(() => emptyPrice());
    updated.set(item.id, evaluateCandidateOutcome(item, price.series || []));
  }
  return saveCandidateHistory({ items: [...updated.values()] });
}

function evaluateCandidateOutcome(item, series = []) {
  const start = new Date(item.generatedAt);
  if (Number.isNaN(start.getTime())) return { ...item, evaluatedAt: new Date().toISOString(), outcome: "pending", outcomeReason: "候補作成日の形式を確認" };
  const startDate = start.toISOString().slice(0, 10);
  const after = (series || [])
    .filter((point) => point.date >= startDate && Number.isFinite(point.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!after.length || !item.entryPrice) {
    return { ...item, evaluatedAt: new Date().toISOString(), outcome: "pending", outcomeReason: "評価できる価格がまだありません" };
  }
  const closes = after.map((point) => point.close);
  const latest = after.at(-1);
  const maxPrice = Math.max(...closes);
  const minPrice = Math.min(...closes);
  const latestReturnPct = ((latest.close - item.entryPrice) / item.entryPrice) * 100;
  const maxReturnPct = ((maxPrice - item.entryPrice) / item.entryPrice) * 100;
  const minReturnPct = ((minPrice - item.entryPrice) / item.entryPrice) * 100;
  let outcome = "pending";
  let outcomeReason = "判定に必要な日数がまだ不足";
  if (item.sellTarget && maxPrice >= item.sellTarget) {
    outcome = "hit";
    outcomeReason = "売り場ラインに到達";
  } else if (item.stopLine && minPrice <= item.stopLine && after.length >= 5) {
    outcome = "miss";
    outcomeReason = "損切り確認ラインを割った";
  } else if (after.length >= 20 && latestReturnPct >= 2) {
    outcome = "hit";
    outcomeReason = "20営業日後にプラスを維持";
  } else if (after.length >= 20 && latestReturnPct < 0) {
    outcome = "miss";
    outcomeReason = "20営業日後にマイナス";
  }
  return {
    ...item,
    latestPrice: latest.close,
    latestDate: latest.date,
    latestReturnPct,
    maxReturnPct,
    minReturnPct,
    elapsedTradingDays: after.length,
    outcome,
    outcomeReason,
    evaluatedAt: new Date().toISOString(),
  };
}

function candidatePerformanceSummary(history = {}) {
  const items = Array.isArray(history.items) ? history.items : [];
  const evaluatedItems = items.filter((item) => item.outcome === "hit" || item.outcome === "miss");
  const hitItems = evaluatedItems.filter((item) => item.outcome === "hit");
  const bySector = {};
  for (const item of evaluatedItems) {
    const key = item.sector || "その他";
    bySector[key] ||= { evaluated: 0, hits: 0, avgReturnPct: 0 };
    bySector[key].evaluated += 1;
    if (item.outcome === "hit") bySector[key].hits += 1;
    bySector[key].avgReturnPct += Number(item.latestReturnPct || 0);
  }
  for (const stats of Object.values(bySector)) {
    stats.hitRate = stats.evaluated ? stats.hits / stats.evaluated : null;
    stats.avgReturnPct = stats.evaluated ? stats.avgReturnPct / stats.evaluated : null;
  }
  const peLikeItems = evaluatedItems.filter((item) => Number(item.peMatchScore || 0) >= 60);
  const avgReturnPct = evaluatedItems.length
    ? evaluatedItems.reduce((sum, item) => sum + Number(item.latestReturnPct || 0), 0) / evaluatedItems.length
    : null;
  return {
    total: items.length,
    pending: items.filter((item) => item.outcome === "pending").length,
    evaluated: evaluatedItems.length,
    hits: hitItems.length,
    misses: evaluatedItems.length - hitItems.length,
    hitRate: evaluatedItems.length ? hitItems.length / evaluatedItems.length : null,
    avgReturnPct,
    bySector,
    peLike: {
      evaluated: peLikeItems.length,
      hits: peLikeItems.filter((item) => item.outcome === "hit").length,
      hitRate: peLikeItems.length ? peLikeItems.filter((item) => item.outcome === "hit").length / peLikeItems.length : null,
    },
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
  const symbol = normalizeDiscoverySymbol(candidate.symbol, candidate);
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
  const symbol = normalizeDiscoverySymbol(candidate.symbol, candidate);
  return {
    symbol,
    currency: candidate.currency || (/\.T$/.test(symbol) ? "JPY" : "USD"),
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
    .flatMap((analysis) => analysisSignals(analysis, settings))
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

function analysisSignals(analysis, settings) {
  const exitSignals = exitPlanSignals(analysis);
  const regular = analysisSignal(analysis, settings);
  return [...exitSignals, regular].filter(Boolean);
}

function analysisSignal(analysis, settings) {
  if (!analysis || Number(analysis.confidence || 0) < settings.notificationMinConfidence) return null;
  const price = analysis.price || {};
  const position = analysis.position || {};
  const currency = analysis.currency || price.currency || "JPY";
  if (analysis.action === "BUY") {
    if (isHighChaseChart(price) || isNoUpsideChart(price)) return null;
    const opportunity = estimateBuyOpportunity(price, settings.unitSize, settings, {
      currency,
      accountType: position.accountType || settings.defaultJpAccountType,
    });
    if (opportunity.netAmount < minimumSignalEdge(settings, currency)) return null;
    return {
      key: `${analysis.symbol}:BUY`,
      action: "購入候補",
      symbol: analysis.symbol,
      name: analysis.name,
      confidence: analysis.confidence,
      currency,
      currentPrice: opportunity.currentPrice,
      quantity: opportunity.quantity,
      netEdgeYen: opportunity.netAmount,
      netEdgeAmount: opportunity.netAmount,
      netEdgeLabel: opportunity.label,
      accountText: opportunity.accountText,
      costText: opportunity.costText,
      reason: analysis.thesis,
      points: [...(analysis.reasons || []), ...(analysis.risks || []).map((item) => `注意: ${item}`)].slice(0, 5),
    };
  }
  if (analysis.action === "SELL") {
    const sellableQuantity = Number(position.sellableQuantity || 0);
    if (sellableQuantity <= 0) return null;
    const sale = estimateSellOpportunity(analysis, sellableQuantity, settings, { currency });
    if (Math.abs(sale.netAmount) < minimumSignalEdge(settings, currency)) return null;
    return {
      key: `${analysis.symbol}:SELL`,
      action: "追加分の見直し候補",
      symbol: analysis.symbol,
      name: analysis.name,
      confidence: analysis.confidence,
      currency,
      currentPrice: sale.currentPrice,
      averagePurchasePrice: position.purchasePrice,
      averageSellPrice: position.averageSellPrice,
      quantity: sellableQuantity,
      netEdgeYen: Math.abs(sale.netAmount),
      netEdgeAmount: sale.netAmount,
      netEdgeLabel: sale.label,
      accountText: sale.accountText,
      costText: sale.costText,
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

function exitPlanSignals(analysis = {}) {
  const plan = analysis.exitPlan || {};
  if (sellableExitQuantity(analysis.position || {}) <= 0) return [];
  return (plan.alerts || []).filter((alert) => exitAlertCanNotify(alert, plan, analysis)).map((alert) => ({
    key: `${analysis.symbol}:EXIT:${alert.type}:${plan.highWaterPrice || ""}:${Math.round(plan.current || 0)}`,
    action: alert.action,
    symbol: analysis.symbol,
    name: analysis.name,
    confidence: alert.confidence || 85,
    netEdgeYen: 0,
    currency: plan.currency,
    currentPrice: plan.current,
    averagePurchasePrice: analysis.position?.purchasePrice,
    averageSellPrice: analysis.position?.averageSellPrice,
    quantity: sellableExitQuantity(analysis.position || {}),
    accountText: accountTypeLabel(analysis.position?.accountType || (plan.currency === "USD" ? "revolut_us" : "taxable")),
    hideEdge: true,
    reason: alert.summary,
    points: [
      `出口ルール: ${alert.label}`,
      plan.summary,
      ...(alert.points || []),
    ].filter(Boolean).slice(0, 10),
  }));
}

function exitAlertCanNotify(alert = {}, plan = {}, analysis = {}) {
  if (alert.type !== "FUNDAMENTAL_EXIT") return true;
  const growthExit = normalizeGrowthExit(plan.growthExit || analysis.growthExit || analysis.ai?.growthExit);
  return growthExitEvidenceForAlert(growthExit, analysis).some((item) => isRecentEvidenceForExit(item));
}

function discoverySignal(candidate, settings) {
  const confidence = candidate.businessValueScore || candidate.score || 0;
  if (confidence < settings.notificationMinConfidence) return null;
  if (!isActionableDiscoveryCandidate(candidate)) return null;
  const price = candidate.price || {};
  const plan = candidate.buyPlan || {};
  if (plan.stance !== "今すぐ検討") return null;
  const currency = candidate.currency || price.currency || discoveryCurrency(candidate);
  const opportunity = estimateBuyOpportunity(price, candidate.unitSize || settings.unitSize, settings, {
    currency,
    accountType: settings.defaultJpAccountType,
  });
  if (opportunity.netAmount < minimumSignalEdge(settings, currency)) return null;
  return {
    key: `${candidate.symbol}:BUY`,
    action: "購入候補",
    symbol: candidate.symbol,
    name: candidate.name,
    confidence,
    currency,
    currentPrice: opportunity.currentPrice,
    quantity: opportunity.quantity,
    netEdgeYen: opportunity.netAmount,
    netEdgeAmount: opportunity.netAmount,
    netEdgeLabel: opportunity.label,
    accountText: opportunity.accountText,
    costText: opportunity.costText,
    reason: plan.summary || candidate.aiReview?.summary || `${candidate.name}は候補スコアが高い銘柄です。`,
    points: [...(candidate.reasons || []), ...(candidate.risks || []).map((item) => `注意: ${item}`)].slice(0, 5),
  };
}

function estimateBuyOpportunity(price = {}, unitSize = 100, settings = {}, options = {}) {
  const current = nullablePositiveNumber(price.current);
  const currency = options.currency || price.currency || "JPY";
  const quantity = nullablePositiveNumber(unitSize) || 0;
  if (!current || !quantity) {
    return {
      currentPrice: current,
      quantity,
      netAmount: 0,
      label: "通知判定の余裕",
      accountText: accountTypeLabel(options.accountType || (currency === "USD" ? "revolut_us" : settings.defaultJpAccountType)),
      costText: costSummaryText({ total: 0, fee: 0, tax: 0 }, currency),
    };
  }
  const trend = nullablePositiveNumber(price.trendPrice3y);
  const dividend = Number.isFinite(price.dividendPerShareTtm) ? price.dividendPerShareTtm * quantity : 0;
  const capitalEdge = trend && trend > current ? (trend - current) * quantity : 0;
  const grossAmount = Math.max(capitalEdge, dividend);
  const accountType = currency === "USD" ? "revolut_us" : normalizeJpAccountType(options.accountType || settings.defaultJpAccountType);
  const cost = estimateRoundTripCost(grossAmount, settings, { currency, accountType });
  const netAmount = Math.max(0, grossAmount - cost.total);
  return {
    currentPrice: current,
    quantity,
    grossAmount,
    netAmount,
    label: capitalEdge >= dividend ? "3年目安との差額(税/費用後)" : "年間配当目安(税/費用後)",
    accountText: accountTypeLabel(accountType),
    costText: costSummaryText(cost, currency),
  };
}

function estimateSellEdgeYen(position = {}, sellableQuantity = 0) {
  const quantity = nullablePositiveNumber(position.quantity);
  if (!quantity || !sellableQuantity) return 0;
  const total = Number.isFinite(position.unrealizedPnlAmount)
    ? position.unrealizedPnlAmount
    : position.pnlAmount;
  if (!Number.isFinite(total)) return 0;
  return Math.abs((total / quantity) * sellableQuantity);
}

function estimateSellOpportunity(analysis = {}, sellableQuantity = 0, settings = {}, options = {}) {
  const position = analysis.position || {};
  const price = analysis.price || {};
  const currency = options.currency || price.currency || analysis.currency || "JPY";
  const current = nullablePositiveNumber(price.current);
  const purchasePrice = nullablePositiveNumber(position.purchasePrice);
  const grossAmount = current && purchasePrice
    ? (current - purchasePrice) * sellableQuantity
    : estimateSellEdgeYen(position, sellableQuantity);
  const accountType = currency === "USD" ? "revolut_us" : (position.accountType || "taxable");
  const cost = estimateOneWayTradeCost(grossAmount, settings, { currency, accountType });
  const netAmount = grossAmount >= 0
    ? grossAmount - cost.total
    : grossAmount - cost.fee;
  return {
    currentPrice: current,
    netAmount,
    label: grossAmount >= 0 ? "対象株の損益(税/費用後)" : "対象株の損益(費用後)",
    accountText: accountTypeLabel(accountType),
    costText: costSummaryText(cost, currency),
  };
}

function minimumSignalEdge(settings = {}, currency = "JPY") {
  const yenThreshold = clamp(Number(settings.notificationMinNetEdgeYen ?? defaultSettings.notificationMinNetEdgeYen), 0, 1000000);
  return currency === "USD" && yenThreshold > 0 ? Math.max(10, Math.round(yenThreshold / 150)) : yenThreshold;
}

function estimateRoundTripCost(grossGain = 0, settings = {}, options = {}) {
  const currency = options.currency || "JPY";
  if (currency === "USD") {
    const fee = clamp(Number(settings.usTradeFeeUsd || 0), 0, 1000) * 2;
    const tax = Math.max(0, grossGain) * (clamp(Number(settings.usCapitalGainTaxPct || 0), 0, 60) / 100);
    return { fee, tax, total: fee + tax };
  }
  const accountType = normalizeJpAccountType(options.accountType || settings.defaultJpAccountType);
  const perTradeFee = accountType === "nisa"
    ? clamp(Number(settings.jpNisaTradeFeeYen || 0), 0, 100000)
    : clamp(Number(settings.jpTaxableTradeFeeYen ?? settings.tradeFeeYen ?? 0), 0, 100000);
  const tax = accountType === "nisa" ? 0 : Math.max(0, grossGain) * (clamp(Number(settings.jpCapitalGainTaxPct ?? defaultSettings.jpCapitalGainTaxPct), 0, 60) / 100);
  return { fee: perTradeFee * 2, tax, total: (perTradeFee * 2) + tax };
}

function estimateOneWayTradeCost(grossGain = 0, settings = {}, options = {}) {
  const currency = options.currency || "JPY";
  if (currency === "USD") {
    const fee = clamp(Number(settings.usTradeFeeUsd || 0), 0, 1000);
    const tax = Math.max(0, grossGain) * (clamp(Number(settings.usCapitalGainTaxPct || 0), 0, 60) / 100);
    return { fee, tax, total: fee + tax };
  }
  const accountType = normalizeJpAccountType(options.accountType || settings.defaultJpAccountType);
  const fee = accountType === "nisa"
    ? clamp(Number(settings.jpNisaTradeFeeYen || 0), 0, 100000)
    : clamp(Number(settings.jpTaxableTradeFeeYen ?? settings.tradeFeeYen ?? 0), 0, 100000);
  const tax = accountType === "nisa" ? 0 : Math.max(0, grossGain) * (clamp(Number(settings.jpCapitalGainTaxPct ?? defaultSettings.jpCapitalGainTaxPct), 0, 60) / 100);
  return { fee, tax, total: fee + tax };
}

function costSummaryText(cost = {}, currency = "JPY") {
  const fee = Number.isFinite(cost.fee) ? cost.fee : 0;
  const tax = Number.isFinite(cost.tax) ? cost.tax : 0;
  const total = Number.isFinite(cost.total) ? cost.total : fee + tax;
  const formatter = (value) => formatMoney(value, currency);
  return `概算費用 ${formatter(total)}（手数料 ${formatter(fee)} / 税 ${formatter(tax)}）`;
}

async function sendSignalsOnce(signals, settings) {
  if (!signals.length) return;
  const log = await readNotificationLog();
  const today = jstDate(new Date().toISOString());
  const sent = new Set((log.items || []).map((item) => item.key));
  const nextItems = [...(log.items || [])];
  for (const signal of signals) {
    const key = signal.absoluteKey ? signal.key : `${today}:${signal.key}`;
    if (sent.has(key)) continue;
    await sendTeamsSignal(settings, signal);
    nextItems.push({ key, sentAt: new Date().toISOString(), signal });
    sent.add(key);
  }
  await saveNotificationLog({ items: nextItems.slice(-500) });
}

async function sendTeamsSignal(settings, signal) {
  const currency = signal.currency || "JPY";
  const netAmount = signalNetAmount(signal);
  const text = [
    `【Stock Signal】${signal.action}: ${signal.name} (${signal.symbol})`,
    `信頼度: ${Math.round(signal.confidence)}%`,
    Number.isFinite(signal.currentPrice) ? `現在単価: ${formatMoney(signal.currentPrice, currency)}` : "",
    Number.isFinite(signal.averagePurchasePrice) ? `平均取得単価: ${formatMoney(signal.averagePurchasePrice, currency)}` : "",
    Number.isFinite(signal.averageSellPrice) ? `平均売却単価: ${formatMoney(signal.averageSellPrice, currency)}` : "",
    Number.isFinite(signal.quantity) ? `判定数量: ${signal.quantity.toLocaleString("ja-JP")}株` : "",
    signal.accountText ? `口座/通貨: ${signal.accountText}` : "",
    signal.costText || "",
    !signal.hideEdge && Number.isFinite(netAmount) ? `${signal.netEdgeLabel || "通知判定の余裕"}: ${formatMoney(netAmount, currency)}` : "",
    signal.reason,
    ...(signal.points || []).map((item) => `・${item}`),
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
  const currency = signal.currency || "JPY";
  const netAmount = signalNetAmount(signal);
  const facts = [
    { title: "信頼度", value: `${Math.round(signal.confidence)}%` },
  ];
  if (Number.isFinite(signal.currentPrice)) facts.push({ title: "現在単価", value: formatMoney(signal.currentPrice, currency) });
  if (Number.isFinite(signal.averagePurchasePrice)) facts.push({ title: "平均取得単価", value: formatMoney(signal.averagePurchasePrice, currency) });
  if (Number.isFinite(signal.averageSellPrice)) facts.push({ title: "平均売却単価", value: formatMoney(signal.averageSellPrice, currency) });
  if (Number.isFinite(signal.quantity)) facts.push({ title: "判定数量", value: `${signal.quantity.toLocaleString("ja-JP")}株` });
  if (signal.accountText) facts.push({ title: "口座/通貨", value: signal.accountText });
  if (signal.costText) facts.push({ title: "費用前提", value: signal.costText });
  if (!signal.hideEdge && Number.isFinite(netAmount)) facts.push({ title: signal.netEdgeLabel || "通知判定の余裕", value: formatMoney(netAmount, currency) });
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
            facts,
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

function signalNetAmount(signal = {}) {
  if (Number.isFinite(signal.netEdgeAmount)) return signal.netEdgeAmount;
  if (Number.isFinite(signal.netEdgeYen)) return signal.netEdgeYen;
  return null;
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

async function readDisclosureCache() {
  try {
    const cached = JSON.parse(await readFile(TDNET_DISCLOSURE_CACHE_PATH, "utf8"));
    return {
      generatedAt: cached.generatedAt || "",
      enabled: cached.enabled !== false,
      source: cached.source || "TDnet適時開示情報閲覧サービス",
      sourceUrl: cached.sourceUrl || TDNET_SOURCE_BASE,
      lookbackDays: clamp(Number(cached.lookbackDays || defaultSettings.tdnetDisclosureLookbackDays), 1, 7),
      holdings: Array.isArray(cached.holdings) ? cached.holdings.map((item) => ({
        symbol: normalizeSymbol(item.symbol),
        name: String(item.name || "").slice(0, 80),
        codes: asStringArray(item.codes).slice(0, 4),
      })).filter((item) => item.symbol) : [],
      checkedCount: Number(cached.checkedCount || 0),
      matchedCount: Number(cached.matchedCount || 0),
      candidateCount: Number(cached.candidateCount || 0),
      usedLmStudio: Boolean(cached.usedLmStudio),
      warnings: asStringArray(cached.warnings).slice(0, 8),
      important: normalizeCachedDisclosures(cached.important),
      recent: normalizeCachedDisclosures(cached.recent),
      message: String(cached.message || ""),
    };
  } catch {
    return {
      generatedAt: "",
      enabled: true,
      source: "TDnet適時開示情報閲覧サービス",
      sourceUrl: TDNET_SOURCE_BASE,
      lookbackDays: defaultSettings.tdnetDisclosureLookbackDays,
      holdings: [],
      checkedCount: 0,
      matchedCount: 0,
      candidateCount: 0,
      usedLmStudio: false,
      warnings: [],
      important: [],
      recent: [],
      message: "",
    };
  }
}

function normalizeCachedDisclosures(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: String(item.id || ""),
    date: normalizeDate(item.date),
    time: String(item.time || "").slice(0, 10),
    code: normalizeTdnetCode(item.code),
    symbol: normalizeSymbol(item.symbol),
    name: String(item.name || "").slice(0, 100),
    title: String(item.title || "").slice(0, 220),
    url: normalizeUrl(item.url) || "",
    source: String(item.source || "TDnet").slice(0, 30),
    pageUrl: normalizeUrl(item.pageUrl) || "",
    review: {
      id: String(item.review?.id || item.id || ""),
      severity: ["critical", "important", "monitor", "ignore"].includes(item.review?.severity) ? item.review.severity : "monitor",
      fundamentalImpact: item.review?.fundamentalImpact !== false,
      category: String(item.review?.category || "その他").slice(0, 40),
      summary: String(item.review?.summary || "").slice(0, 180),
      whyNotify: String(item.review?.whyNotify || "").slice(0, 180),
      suggestedAction: String(item.review?.suggestedAction || "").slice(0, 180),
      keywords: asStringArray(item.review?.keywords).slice(0, 8),
    },
  })).filter((item) => item.id && item.title);
}

async function saveDisclosureCache(result) {
  await mkdir(path.dirname(TDNET_DISCLOSURE_CACHE_PATH), { recursive: true });
  await writeFile(TDNET_DISCLOSURE_CACHE_PATH, JSON.stringify({
    generatedAt: result.generatedAt || new Date().toISOString(),
    enabled: result.enabled !== false,
    source: result.source || "TDnet適時開示情報閲覧サービス",
    sourceUrl: result.sourceUrl || TDNET_SOURCE_BASE,
    lookbackDays: result.lookbackDays || defaultSettings.tdnetDisclosureLookbackDays,
    holdings: result.holdings || [],
    checkedCount: result.checkedCount || 0,
    matchedCount: result.matchedCount || 0,
    candidateCount: result.candidateCount || 0,
    usedLmStudio: Boolean(result.usedLmStudio),
    warnings: result.warnings || [],
    important: result.important || [],
    recent: result.recent || [],
    message: result.message || "",
  }, null, 2));
}

async function readExitState() {
  try {
    const state = JSON.parse(await readFile(EXIT_STATE_PATH, "utf8"));
    return {
      updatedAt: state.updatedAt || "",
      items: Array.isArray(state.items) ? state.items.map(normalizeExitStateItem).filter(Boolean) : [],
    };
  } catch {
    return { updatedAt: "", items: [] };
  }
}

async function saveExitState(state) {
  await mkdir(path.dirname(EXIT_STATE_PATH), { recursive: true });
  await writeFile(EXIT_STATE_PATH, JSON.stringify({
    updatedAt: state.updatedAt || new Date().toISOString(),
    items: (state.items || []).map(normalizeExitStateItem).filter(Boolean),
  }, null, 2));
}

function normalizeExitStateItem(item = {}) {
  const rawSymbol = String(item.symbol || "").trim().toUpperCase();
  const symbol = rawSymbol.includes(".") ? normalizeSymbol(rawSymbol) : normalizeUsSymbol(rawSymbol);
  if (!symbol) return null;
  return {
    symbol,
    name: String(item.name || symbol).slice(0, 100),
    currency: item.currency === "USD" ? "USD" : "JPY",
    highWaterPrice: nullablePositiveNumber(item.highWaterPrice),
    highWaterDate: normalizeDate(item.highWaterDate),
    trailingStartDate: normalizeDate(item.trailingStartDate),
    trailingStopPct: clamp(Number(item.trailingStopPct || defaultSettings.trailingStopPct), 5, 60),
    updatedAt: item.updatedAt || "",
  };
}

async function readShareholderCache() {
  try {
    const cached = JSON.parse(await readFile(SHAREHOLDER_CACHE_PATH, "utf8"));
    return normalizeShareholderCache(cached);
  } catch {
    return normalizeShareholderCache({});
  }
}

async function saveShareholderCache(cache) {
  const normalized = normalizeShareholderCache(cache);
  await mkdir(path.dirname(SHAREHOLDER_CACHE_PATH), { recursive: true });
  await writeFile(SHAREHOLDER_CACHE_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizeShareholderCache(cache = {}) {
  const items = Array.isArray(cache.items)
    ? cache.items.map(normalizeShareholderItem).filter(Boolean)
    : [];
  const changed = Array.isArray(cache.changed)
    ? cache.changed.map(normalizeShareholderItem).filter(Boolean)
    : items.filter((item) => item.changeAlert);
  return {
    generatedAt: cache.generatedAt || "",
    usedLmStudio: Boolean(cache.usedLmStudio),
    checkedCount: Number(cache.checkedCount || 0),
    warningCount: Number(cache.warningCount || 0),
    warnings: asStringArray(cache.warnings).slice(0, 10),
    items,
    changed,
  };
}

function normalizeShareholderItem(item = {}) {
  const rawSymbol = String(item.symbol || "").trim().toUpperCase();
  const symbol = rawSymbol.includes(".") ? normalizeSymbol(rawSymbol) : normalizeUsSymbol(rawSymbol);
  if (!symbol) return null;
  const institutionalOwnershipPct = nullablePercent(item.institutionalOwnershipPct);
  const previousInstitutionalOwnershipPct = nullablePercent(item.previousInstitutionalOwnershipPct);
  const changePct = Number.isFinite(item.changePct)
    ? Math.round(Number(item.changePct) * 10) / 10
    : (Number.isFinite(institutionalOwnershipPct) && Number.isFinite(previousInstitutionalOwnershipPct)
      ? Math.round((institutionalOwnershipPct - previousInstitutionalOwnershipPct) * 10) / 10
      : null);
  return {
    symbol,
    name: String(item.name || symbol).slice(0, 100),
    market: String(item.market || (symbol.includes(".") ? "JP" : "US")).slice(0, 20),
    currency: item.currency === "USD" ? "USD" : "JPY",
    asOfDate: normalizeDate(item.asOfDate),
    checkedAt: item.checkedAt || "",
    institutionalOwnershipPct,
    previousInstitutionalOwnershipPct,
    changePct,
    changeAlert: Boolean(item.changeAlert),
    foreignOwnershipPct: nullablePercent(item.foreignOwnershipPct),
    confidence: clamp(Number(item.confidence || 0), 0, 100),
    summaryJa: String(item.summaryJa || "").slice(0, 220),
    majorHolders: normalizeMajorHolders(item.majorHolders).slice(0, 8),
    evidence: normalizeShareholderEvidence(item.evidence).slice(0, 8),
    warning: String(item.warning || "").slice(0, 180),
  };
}

function normalizeMajorHolders(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    name: String(item.name || "").trim().slice(0, 100),
    pct: nullablePercent(item.pct),
    type: String(item.type || "").trim().slice(0, 40),
  })).filter((item) => item.name);
}

function normalizeShareholderEvidence(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    title: String(item.title || "").slice(0, 180),
    url: normalizeUrl(item.url) || "",
    source: String(item.source || hostOf(item.url || "") || "").slice(0, 80),
    snippet: String(item.snippet || "").slice(0, 260),
  })).filter((item) => item.url || item.title);
}

function nullablePercent(value) {
  const number = nullableNonNegativeNumber(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(100, number) * 10) / 10;
}

async function attachShareholderInfoToAnalyses(analyses = [], cache = null) {
  const shareholderCache = cache || await readShareholderCache();
  const bySymbol = new Map((shareholderCache.items || []).map((item) => [item.symbol, item]));
  return analyses.map((analysis) => ({
    ...analysis,
    shareholders: sanitizeShareholderItemForAnalysis(bySymbol.get(analysis.symbol), analysis),
  }));
}

function sanitizeShareholderItemForAnalysis(item = null, analysis = {}) {
  if (!item) return null;
  const stock = {
    symbol: analysis.symbol || item.symbol,
    name: analysis.name || item.name,
    currency: item.currency || analysis.price?.currency || (String(analysis.symbol || "").includes(".T") ? "JPY" : "USD"),
    shareholderMarket: String(analysis.symbol || item.symbol || "").includes(".T") ? "JP" : "US",
  };
  const rawEvidence = Array.isArray(item.evidence) ? item.evidence : [];
  const evidence = rawEvidence.filter((source) => isShareholderEvidence(source, stock));
  if (rawEvidence.length && !evidence.length) {
    return normalizeShareholderItem({
      ...item,
      institutionalOwnershipPct: null,
      foreignOwnershipPct: null,
      previousInstitutionalOwnershipPct: null,
      changePct: null,
      changeAlert: false,
      confidence: 0,
      majorHolders: [],
      evidence: [],
      summaryJa: "信頼できる株主情報サイトで再取得が必要です。",
      warning: "保存済みの確認元が信頼対象外だったため非表示にしました。",
    });
  }
  return normalizeShareholderItem({ ...item, evidence });
}

async function updateShareholderSnapshots(options = {}) {
  const settings = await readSettings();
  const previous = await readShareholderCache();
  if (!settings.shareholderMonitorEnabled && !options.force) {
    return previous;
  }
  const [jpStocks, usStocks] = await Promise.all([readWatchlist(), readUsWatchlist()]);
  const stocks = [
    ...jpStocks.map((stock) => ({ ...stock, currency: "JPY", shareholderMarket: "JP" })),
    ...usStocks.map((stock) => ({ ...stock, currency: "USD", shareholderMarket: "US" })),
  ].filter((stock) => stock.symbol);
  const previousBySymbol = new Map((previous.items || []).map((item) => [item.symbol, item]));
  const lmStatus = settings.shareholderUseLmStudio !== false
    ? await checkLmStudio(settings).catch(() => ({ ok: false }))
    : { ok: false };
  const warnings = [];
  const items = await mapLimit(stocks, 3, async (stock) => {
    const snapshot = await fetchShareholderSnapshot(stock, settings, { useLmStudio: lmStatus.ok })
      .catch((error) => shareholderSnapshotFallback(stock, [], String(error.message || "株主情報を取得できませんでした")));
    if (snapshot.warning) warnings.push(`${stock.name || stock.symbol}: ${snapshot.warning}`);
    return finalizeShareholderSnapshot(snapshot, previousBySymbol.get(stock.symbol), settings);
  });
  const result = await saveShareholderCache({
    generatedAt: new Date().toISOString(),
    usedLmStudio: Boolean(lmStatus.ok),
    checkedCount: stocks.length,
    warningCount: warnings.length,
    warnings: uniqueText(warnings).slice(0, 10),
    items,
    changed: items.filter((item) => item.changeAlert),
  });
  if (options.notify !== false) await notifyShareholderSignals(result, settings).catch(() => {});
  return result;
}

async function fetchShareholderSnapshot(stock, settings, options = {}) {
  const queries = shareholderQueries(stock);
  const perQueryLimit = Math.max(3, Math.ceil(8 / queries.length));
  const searchResults = [];
  for (const query of queries) {
    const results = await searchGoogle(query, { limit: perQueryLimit }).catch(() => []);
    searchResults.push(...results.map((item) => ({ ...item, query })));
  }
  const filteredResults = uniqueBy(searchResults
    .filter((item) => isShareholderEvidence(item, stock))
    .sort((a, b) => shareholderEvidenceScore(b, stock) - shareholderEvidenceScore(a, stock)), (item) => canonicalNewsUrl(item.url));
  const evidence = filteredResults.slice(0, 8).map((item) => ({
    title: item.title,
    url: item.url,
    source: hostOf(item.url),
    snippet: cleanText(item.snippet).slice(0, 260),
  }));
  if (options.useLmStudio && evidence.length) {
    const ai = await aiShareholderSnapshot(stock, evidence).catch(() => null);
    if (ai) return normalizeShareholderItem({
      ...ai,
      symbol: stock.symbol,
      name: stock.name,
      market: stock.shareholderMarket || stock.market,
      currency: stock.currency || "JPY",
      checkedAt: new Date().toISOString(),
      evidence,
    });
  }
  const warning = evidence.length
    ? ""
    : searchResults.length
      ? "信頼できる株主情報サイトの根拠に絞ると0件でした。"
      : googleSearchWarning();
  return shareholderSnapshotFallback(stock, evidence, warning);
}

function shareholderQueries(stock = {}) {
  const symbol = String(stock.symbol || "").trim().toUpperCase();
  const name = stock.name || symbol;
  if (symbol.includes(".T")) {
    const code = symbol.replace(".T", "");
    return [
      `${name} ${code} 大株主 機関投資家 比率 外国人 持株比率`,
      `${name} ${code} 株主構成 金融機関 外国法人 個人 比率`,
    ];
  }
  return [
    `${symbol} institutional holdings site:nasdaq.com`,
    `${symbol} major holders site:finance.yahoo.com/quote`,
    `${symbol} institutional ownership site:marketbeat.com`,
    `${symbol} 13F institutional ownership site:fintel.io`,
    `${name} ${symbol} shareholders institutional ownership site:gurufocus.com`,
  ];
}

function isShareholderEvidence(item = {}, stock = {}) {
  const url = normalizeUrl(item.url);
  if (!url || isBlockedUsNewsUrl(url)) return false;
  const rank = shareholderSourceRank(url, stock);
  if (!rank) return false;
  if (!shareholderEvidenceMentionsStock(item, stock)) return false;
  const text = cleanText(`${item.title || ""} ${item.snippet || ""} ${url}`).toLowerCase();
  if (/porn|casino|betting|download|crack|torrent|login|sign in|careers?|jobs?|wikipedia|linkedin/.test(text)) return false;
  if (!SHAREHOLDER_KEYWORDS.some((word) => text.includes(word.toLowerCase()))) return rank >= 94;
  return true;
}

function shareholderEvidenceScore(item = {}, stock = {}) {
  const text = cleanText(`${item.title || ""} ${item.snippet || ""}`).toLowerCase();
  const keywordHits = SHAREHOLDER_KEYWORDS.filter((word) => text.includes(word.toLowerCase())).length;
  return shareholderSourceRank(item.url, stock) + Math.min(24, keywordHits * 4);
}

function shareholderSourceRank(url = "", stock = {}) {
  const symbol = String(stock.symbol || "").trim().toUpperCase();
  const sources = stock.shareholderMarket === "US" || (!symbol.includes(".T") && stock.currency === "USD")
    ? US_SHAREHOLDER_SOURCES
    : JP_SHAREHOLDER_SOURCES;
  const host = hostOf(url).toLowerCase();
  for (const [domain, rank] of sources) {
    if (domainMatches(host, domain)) return rank;
  }
  return 0;
}

function shareholderEvidenceMentionsStock(item = {}, stock = {}) {
  const symbol = String(stock.symbol || "").trim().toUpperCase();
  const text = cleanText(`${item.title || ""} ${item.snippet || ""} ${item.url || ""}`).toLowerCase();
  if (symbol.includes(".T")) {
    const code = symbol.replace(".T", "");
    if (code && new RegExp(`\\b${escapeRegExp(code)}\\b`).test(text)) return true;
  } else {
    const normalizedSymbol = normalizeUsSymbol(symbol);
    if (normalizedSymbol && new RegExp(`\\b${escapeRegExp(normalizedSymbol.toLowerCase())}\\b`, "i").test(text)) return true;
  }
  const words = cleanText(stock.name || "")
    .toLowerCase()
    .split(/[^a-z0-9一-龥ぁ-んァ-ン]+/)
    .filter((word) => word.length >= 3)
    .filter((word) => !["inc", "corp", "corporation", "company", "limited", "holdings", "group", "plc"].includes(word));
  return words.length ? words.some((word) => text.includes(word)) : false;
}

async function aiShareholderSnapshot(stock, evidence = []) {
  const model = await getLmStudioModel();
  const prompt = [
    "あなたは株主構成データの抽出係です。根拠に書かれていない数値を推測しないでください。",
    "機関投資家比率は、institutional ownership または明示された機関投資家/金融機関等の保有割合です。日本株で外国法人等しか分からない場合は foreignOwnershipPct に入れ、institutionalOwnershipPct はnullにしてください。",
    "出力はJSONのみ。形式: {\"institutionalOwnershipPct\":12.3,\"foreignOwnershipPct\":45.6,\"asOfDate\":\"YYYY-MM-DD\",\"majorHolders\":[{\"name\":\"...\",\"pct\":1.2,\"type\":\"機関/外国/個人/政府/その他\"}],\"summaryJa\":\"日本語で1文\",\"confidence\":0}",
    "数値は百分率です。明示値がなければnull。majorHoldersは最大6件。",
    "",
    JSON.stringify({
      symbol: stock.symbol,
      name: stock.name,
      market: stock.shareholderMarket || stock.market,
      evidence,
    }),
  ].join("\n");
  const content = await callLmStudioResponses(model, prompt, { maxOutputTokens: 1400 }).catch(async (error) => {
    if (String(error.message || "").includes("404")) return callLmStudioChat(model, prompt, { maxTokens: 1400 });
    throw error;
  });
  const parsed = parseJsonObject(content);
  return {
    institutionalOwnershipPct: nullablePercent(parsed.institutionalOwnershipPct),
    foreignOwnershipPct: nullablePercent(parsed.foreignOwnershipPct),
    asOfDate: normalizeDate(parsed.asOfDate),
    majorHolders: normalizeMajorHolders(parsed.majorHolders),
    summaryJa: String(parsed.summaryJa || "").slice(0, 220),
    confidence: clamp(Number(parsed.confidence || 0), 0, 100),
  };
}

function shareholderSnapshotFallback(stock, evidence = [], warning = "") {
  const text = evidence.map((item) => `${item.title}\n${item.snippet}`).join("\n");
  const institutionalOwnershipPct = extractFirstPercent(text, [
    /機関投資家(?:比率|保有率|持株比率|所有割合)?[^0-9%]{0,30}([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /institutional ownership[^0-9%]{0,50}([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /held by institutions[^0-9%]{0,50}([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /institutions hold[^0-9%]{0,50}([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /金融機関[^0-9%]{0,30}([0-9]+(?:\.[0-9]+)?)\s*%/i,
  ]);
  const foreignOwnershipPct = extractFirstPercent(text, [
    /外国法人等[^0-9%]{0,30}([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /外国人(?:持株比率|保有比率|比率)?[^0-9%]{0,30}([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /foreign ownership[^0-9%]{0,50}([0-9]+(?:\.[0-9]+)?)\s*%/i,
  ]);
  const confidence = Number.isFinite(institutionalOwnershipPct) ? 55 : evidence.length ? 25 : 0;
  return normalizeShareholderItem({
    symbol: stock.symbol,
    name: stock.name,
    market: stock.shareholderMarket || stock.market,
    currency: stock.currency || "JPY",
    checkedAt: new Date().toISOString(),
    institutionalOwnershipPct,
    foreignOwnershipPct,
    majorHolders: [],
    evidence,
    confidence,
    summaryJa: Number.isFinite(institutionalOwnershipPct)
      ? `検索結果から機関投資家比率は約${institutionalOwnershipPct.toFixed(1)}%と読み取れます。`
      : evidence.length
      ? "主要株主の根拠リンクは保存しましたが、機関投資家比率の明示値は未検出です。"
      : "株主情報を取得できませんでした。",
    warning,
  });
}

function extractFirstPercent(text = "", patterns = []) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    const value = nullablePercent(match?.[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function finalizeShareholderSnapshot(snapshot = {}, previous = null, settings = defaultSettings) {
  const current = nullablePercent(snapshot.institutionalOwnershipPct);
  const previousPct = nullablePercent(previous?.institutionalOwnershipPct);
  const changePct = Number.isFinite(current) && Number.isFinite(previousPct)
    ? Math.round((current - previousPct) * 10) / 10
    : null;
  const threshold = clamp(Number(settings.shareholderChangeThresholdPct || defaultSettings.shareholderChangeThresholdPct), 0.1, 20);
  return normalizeShareholderItem({
    ...snapshot,
    previousInstitutionalOwnershipPct: previousPct,
    changePct,
    changeAlert: Number.isFinite(changePct) && Math.abs(changePct) >= threshold,
  });
}

async function notifyShareholderSignals(result = {}, settings = {}) {
  if (!settings.notificationsEnabled) return;
  if (!settings.teamsWebhookUrl && !(settings.graphAccessToken && settings.graphChatId)) return;
  const cache = await readAnalysisCache().catch(() => ({ analyses: [] }));
  const contextBySymbol = new Map((cache.analyses || []).map((analysis) => [analysis.symbol, analysis]));
  const signals = (result.changed || []).map((item) => {
    const direction = item.changePct > 0 ? "上昇" : "低下";
    const context = contextBySymbol.get(item.symbol) || {};
    return {
      key: `shareholder:${item.symbol}:${formatPercentKey(item.previousInstitutionalOwnershipPct)}:${formatPercentKey(item.institutionalOwnershipPct)}:${item.asOfDate || ""}`,
      absoluteKey: true,
      action: "株主構成変化",
      symbol: item.symbol,
      name: item.name,
      confidence: Math.max(80, item.confidence || 0),
      netEdgeYen: 0,
      currency: context.price?.currency || "JPY",
      currentPrice: context.price?.current,
      averagePurchasePrice: context.position?.purchasePrice,
      averageSellPrice: context.position?.averageSellPrice,
      quantity: Number(context.position?.quantity) > 0 ? context.position.quantity : undefined,
      accountText: context.position?.accountType ? accountTypeLabel(context.position.accountType) : "",
      hideEdge: true,
      reason: `機関投資家比率が${formatPercentValue(item.previousInstitutionalOwnershipPct)}から${formatPercentValue(item.institutionalOwnershipPct)}へ${Math.abs(item.changePct).toFixed(1)}pt${direction}しました。`,
      points: [
        item.asOfDate ? `基準日: ${item.asOfDate}` : "",
        Number.isFinite(item.foreignOwnershipPct) ? `外国人/外国法人比率: ${formatPercentValue(item.foreignOwnershipPct)}` : "",
        item.summaryJa,
        ...item.majorHolders.slice(0, 3).map((holder) => `主要株主: ${holder.name}${Number.isFinite(holder.pct) ? ` ${formatPercentValue(holder.pct)}` : ""}`),
        ...item.evidence.slice(0, 2).map((source) => `確認元: ${source.source || source.url}`),
      ].filter(Boolean),
    };
  });
  await sendSignalsOnce(signals, settings);
}

function formatPercentKey(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "na";
}

function formatPercentValue(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

async function readFinancialCache() {
  try {
    const cached = JSON.parse(await readFile(FINANCIAL_CACHE_PATH, "utf8"));
    return {
      generatedAt: cached.generatedAt || "",
      enabled: cached.enabled !== false,
      checkedCount: Number(cached.checkedCount || 0),
      warningCount: Number(cached.warningCount || 0),
      warnings: asStringArray(cached.warnings).slice(0, 12),
      items: Array.isArray(cached.items) ? cached.items.map(normalizeFinancialSnapshot).filter(Boolean) : [],
      message: String(cached.message || ""),
    };
  } catch {
    return { generatedAt: "", enabled: true, checkedCount: 0, warningCount: 0, warnings: [], items: [], message: "" };
  }
}

async function saveFinancialCache(result = {}) {
  const normalized = {
    generatedAt: result.generatedAt || new Date().toISOString(),
    enabled: result.enabled !== false,
    checkedCount: Number(result.checkedCount || result.items?.length || 0),
    warningCount: Number(result.warningCount || result.warnings?.length || 0),
    warnings: asStringArray(result.warnings).slice(0, 12),
    items: Array.isArray(result.items) ? result.items.map(normalizeFinancialSnapshot).filter(Boolean) : [],
    message: String(result.message || ""),
  };
  await mkdir(path.dirname(FINANCIAL_CACHE_PATH), { recursive: true });
  await writeFile(FINANCIAL_CACHE_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizeFinancialSnapshot(item = {}) {
  const symbol = normalizeSymbol(item.symbol);
  if (!symbol) return null;
  const criteria = normalizeFinancialCriteria(item.criteria || item.peCriteria);
  return {
    symbol,
    name: cleanText(item.name || symbol).slice(0, 120),
    status: ["ok", "missing_key", "not_found", "error", "partial"].includes(item.status) ? item.status : "partial",
    source: cleanText(item.source || "EDINET / Yahoo Finance").slice(0, 80),
    checkedAt: item.checkedAt || "",
    asOfDate: normalizeDate(item.asOfDate) || "",
    docID: cleanText(item.docID || "").slice(0, 80),
    documentTitle: cleanText(item.documentTitle || "").slice(0, 160),
    currentPrice: numberOrNull(item.currentPrice),
    sharesOutstanding: numberOrNull(item.sharesOutstanding),
    marketCap: numberOrNull(item.marketCap),
    pbr: numberOrNull(item.pbr),
    per: numberOrNull(item.per),
    evEbitda: numberOrNull(item.evEbitda),
    netCashRatio: numberOrNull(item.netCashRatio),
    cashAndEquivalents: numberOrNull(item.cashAndEquivalents),
    shortTermSecurities: numberOrNull(item.shortTermSecurities),
    interestBearingDebt: numberOrNull(item.interestBearingDebt),
    netCash: numberOrNull(item.netCash),
    operatingCashFlow: numberOrNull(item.operatingCashFlow),
    operatingCashFlowYears: nullableNonNegativeNumber(item.operatingCashFlowYears) || 0,
    operatingCashFlowPositive: item.operatingCashFlowPositive === true,
    ebitda: numberOrNull(item.ebitda),
    netSales: numberOrNull(item.netSales),
    operatingIncome: numberOrNull(item.operatingIncome),
    netIncome: numberOrNull(item.netIncome),
    netAssets: numberOrNull(item.netAssets),
    totalAssets: numberOrNull(item.totalAssets),
    depreciationAndAmortization: numberOrNull(item.depreciationAndAmortization),
    criteria,
    missingMetrics: asStringArray(item.missingMetrics).slice(0, 10),
    insights: asStringArray(item.insights).slice(0, 8),
    insightMethod: cleanText(item.insightMethod || "rules").slice(0, 40),
    peScore: Number.isFinite(item.peScore) ? clamp(Math.round(item.peScore), 0, 100) : financialCriteriaScore(criteria),
    warnings: asStringArray(item.warnings).slice(0, 8),
  };
}

function normalizeFinancialCriteria(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: String(item.key || "").slice(0, 40),
    label: cleanText(item.label || "").slice(0, 80),
    status: ["pass", "watch", "fail", "unknown"].includes(item.status) ? item.status : "unknown",
    score: clamp(Number(item.score || 0), 0, Number(item.max || 25) || 25),
    max: clamp(Number(item.max || 25), 1, 50),
    summary: cleanText(item.summary || "").slice(0, 140),
  })).filter((item) => item.key && item.label);
}

function financialCriteriaScore(criteria = []) {
  const max = criteria.reduce((sum, item) => sum + (Number(item.max) || 0), 0);
  if (!max) return null;
  const score = criteria.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
  return clamp(Math.round((score / max) * 100), 0, 100);
}

async function attachFinancialsToAnalyses(analyses = [], cache = null) {
  const financialCache = cache || await readFinancialCache();
  const bySymbol = new Map((financialCache.items || []).map((item) => [item.symbol, item]));
  return analyses.map((analysis) => {
    if (!/\.T$/.test(analysis?.symbol || "")) return analysis;
    const financials = bySymbol.get(analysis.symbol) || financialSnapshotPlaceholder(analysis);
    return { ...analysis, financials };
  });
}

function financialSnapshotPlaceholder(stock = {}) {
  return normalizeFinancialSnapshot({
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    status: "missing_key",
    source: "EDINET / Yahoo Finance",
    checkedAt: "",
    message: "EDINET APIキーを設定すると財務情報を取得します。",
    criteria: buildPeFinancialCriteria({}),
    warnings: ["EDINET APIキー未設定"],
  });
}

async function updateFinancialSnapshots(options = {}) {
  const settings = await readSettings();
  const previous = await readFinancialCache();
  const generatedAt = new Date().toISOString();
  const stocks = (await readWatchlist()).filter((stock) => /\.T$/.test(stock.symbol));
  if (!options.force && previous.generatedAt && !isOlderThan(cacheHourKey(previous.generatedAt), cacheHourKey(generatedAt))) {
    return previous;
  }

  const collected = await collectFinancialSnapshotsForStocks(stocks, {
    settings,
    previous,
    force: options.force,
  });
  return saveFinancialCache({
    ...collected,
    generatedAt,
    checkedCount: stocks.length,
    items: mergeFinancialSnapshotItems(previous.items, collected.items),
  });
}

async function collectFinancialSnapshotsForStocks(stocks = [], options = {}) {
  const settings = options.settings || await readSettings();
  const previous = options.previous || await readFinancialCache();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const jpStocks = uniqueBy((stocks || [])
    .map((stock) => normalizeStock(stock))
    .filter((stock) => /\.T$/.test(stock.symbol)), (stock) => stock.symbol);
  if (!settings.edinetApiKey) {
    return {
      generatedAt,
      enabled: false,
      checkedCount: jpStocks.length,
      warnings: ["EDINET APIキー未設定。設定の財務/口座タブで追加してください。"],
      items: jpStocks.map((stock) => financialSnapshotPlaceholder(stock)),
      message: "EDINET APIキーが未設定です。",
    };
  }

  const warnings = [];
  let quoteBySymbol = await fetchYahooQuoteSnapshots(jpStocks.map((stock) => stock.symbol)).catch((error) => {
    warnings.push(`Yahoo Finance: ${error.message || "株価サイトの指標取得に失敗しました"}`);
    return new Map();
  });
  const quoteSummaryBySymbol = await fetchYahooQuoteSummarySnapshots(jpStocks.map((stock) => stock.symbol)).catch((error) => {
    warnings.push(`Yahoo quoteSummary: ${error.message || "株価サイトの詳細指標取得に失敗しました"}`);
    return new Map();
  });
  quoteBySymbol = mergeQuoteSnapshotMaps(quoteBySymbol, quoteSummaryBySymbol);
  const pageFallbackSymbols = jpStocks
    .map((stock) => stock.symbol)
    .filter((symbol) => !hasQuoteSnapshotFinancialBasis(quoteBySymbol.get(symbol)));
  if (pageFallbackSymbols.length) {
    const pageQuoteBySymbol = await fetchYahooJapanPageSnapshots(pageFallbackSymbols).catch((error) => {
      warnings.push(`Yahoo株ページ: ${error.message || "ページからの補完に失敗しました"}`);
      return new Map();
    });
    quoteBySymbol = mergeQuoteSnapshotMaps(quoteBySymbol, pageQuoteBySymbol);
  }
  const docLookup = await findLatestEdinetDocuments(jpStocks, settings.edinetApiKey).catch((error) => {
    warnings.push(`EDINET: ${error.message || "書類一覧を取得できませんでした"}`);
    return { bySymbol: new Map(), warnings: [] };
  });
  warnings.push(...asStringArray(docLookup.warnings));
  const previousBySymbol = new Map((previous.items || []).map((item) => [item.symbol, item]));
  const items = await mapLimit(jpStocks, 2, async (stock) => {
    const previousItem = previousBySymbol.get(stock.symbol) || null;
    const doc = docLookup.bySymbol?.get(stock.symbol) || null;
    let quote = quoteBySymbol.get(stock.symbol) || {};
    if (!nullablePositiveNumber(quote.currentPrice ?? quote.regularMarketPrice)) {
      const chartQuote = await fetchYahooCurrentQuoteFromChart(stock.symbol).catch(() => null);
      if (chartQuote) quote = { ...quote, ...chartQuote };
    }
    let facts = previousItem && previousItem.docID === doc?.docID
      ? financialFactsFromSnapshot(previousItem)
      : null;
    if (doc?.docID && (!facts || options.force)) {
      facts = await fetchEdinetFinancialFacts(doc.docID, settings.edinetApiKey).catch((error) => {
        warnings.push(`${stock.name}: ${error.message || "XBRL財務抽出に失敗しました"}`);
        return facts;
      });
    }
    return buildFinancialSnapshot(stock, quote, doc, facts, previousItem);
  });
  return {
    generatedAt,
    enabled: true,
    checkedCount: jpStocks.length,
    warningCount: warnings.length,
    warnings: uniqueText(warnings).slice(0, 12),
    items,
    message: items.some((item) => item.status === "ok" || item.status === "partial")
      ? "EDINET財務情報を更新しました。"
      : "EDINET財務情報を取得できませんでした。",
  };
}

function mergeFinancialSnapshotItems(previousItems = [], nextItems = []) {
  const bySymbol = new Map();
  for (const item of previousItems || []) {
    const normalized = normalizeFinancialSnapshot(item);
    if (normalized) bySymbol.set(normalized.symbol, normalized);
  }
  for (const item of nextItems || []) {
    const normalized = normalizeFinancialSnapshot(item);
    if (normalized) bySymbol.set(normalized.symbol, normalized);
  }
  return [...bySymbol.values()];
}

function buildFinancialSnapshot(stock = {}, quote = {}, doc = null, facts = null, previous = null) {
  const cash = numberOrNull(facts?.cashAndEquivalents ?? previous?.cashAndEquivalents);
  const shortTermSecurities = numberOrNull(facts?.shortTermSecurities ?? previous?.shortTermSecurities);
  const debt = numberOrNull(facts?.interestBearingDebt ?? previous?.interestBearingDebt);
  const sharesOutstanding = nullablePositiveNumber(facts?.sharesOutstanding ?? quote.sharesOutstanding ?? previous?.sharesOutstanding);
  const rawCurrentPrice = nullablePositiveNumber(quote.currentPrice ?? quote.regularMarketPrice ?? stock.currentPrice ?? stock.price?.current ?? previous?.currentPrice);
  const rawMarketCap = numberOrNull(quote.marketCap ?? previous?.marketCap);
  const marketValues = reconcileFinancialMarketValues(rawCurrentPrice, sharesOutstanding, rawMarketCap);
  const currentPrice = marketValues.currentPrice;
  const marketCap = marketValues.marketCap;
  const operatingIncome = numberOrNull(facts?.operatingIncome ?? previous?.operatingIncome);
  const depreciation = numberOrNull(facts?.depreciationAndAmortization ?? previous?.depreciationAndAmortization);
  const ebitda = numberOrNull(facts?.ebitda ?? (Number.isFinite(operatingIncome) && Number.isFinite(depreciation) ? operatingIncome + depreciation : previous?.ebitda));
  const netIncome = numberOrNull(facts?.netIncome ?? previous?.netIncome);
  const netAssets = numberOrNull(facts?.netAssets ?? previous?.netAssets);
  const bookValue = numberOrNull(quote.bookValue);
  const eps = numberOrNull(quote.epsTrailingTwelveMonths ?? quote.epsForward);
  const pbr = numberOrNull(
    quote.priceToBook
      ?? (currentPrice && bookValue ? currentPrice / bookValue : null)
      ?? (marketCap && netAssets ? marketCap / netAssets : null)
      ?? previous?.pbr,
  );
  const per = numberOrNull(
    quote.trailingPE
      ?? quote.forwardPE
      ?? (currentPrice && eps && eps > 0 ? currentPrice / eps : null)
      ?? (marketCap && netIncome && netIncome > 0 ? marketCap / netIncome : null)
      ?? previous?.per,
  );
  const netCash = Number.isFinite(cash) || Number.isFinite(shortTermSecurities) || Number.isFinite(debt)
    ? (cash || 0) + (shortTermSecurities || 0) - (debt || 0)
    : numberOrNull(previous?.netCash);
  const netCashRatio = marketCap && Number.isFinite(netCash) ? netCash / marketCap : numberOrNull(previous?.netCashRatio);
  const calculatedEvEbitda = marketCap && Number.isFinite(netCash) && ebitda
    ? Math.max(0, marketCap - netCash) / ebitda
    : null;
  const evEbitda = numberOrNull(quote.enterpriseToEbitda ?? calculatedEvEbitda ?? previous?.evEbitda);
  const snapshot = {
    symbol: stock.symbol,
    name: stock.name,
    status: doc?.docID || Object.keys(quote).length ? "partial" : "not_found",
    source: "EDINET / Yahoo Finance",
    checkedAt: new Date().toISOString(),
    asOfDate: normalizeDate(doc?.submitDateTime || doc?.submitDate || previous?.asOfDate) || "",
    docID: doc?.docID || previous?.docID || "",
    documentTitle: doc?.docDescription || previous?.documentTitle || "",
    currentPrice,
    sharesOutstanding,
    marketCap,
    pbr,
    per,
    evEbitda,
    cashAndEquivalents: cash,
    shortTermSecurities,
    interestBearingDebt: debt,
    netCash,
    netCashRatio,
    operatingCashFlow: numberOrNull(facts?.operatingCashFlow ?? previous?.operatingCashFlow),
    operatingCashFlowYears: nullableNonNegativeNumber(facts?.operatingCashFlowYears)
      || nullableNonNegativeNumber(previous?.operatingCashFlowYears)
      || (Number.isFinite(facts?.operatingCashFlow) && facts.operatingCashFlow > 0 ? 1 : 0),
    operatingCashFlowPositive: Boolean(Number.isFinite(facts?.operatingCashFlow) ? facts.operatingCashFlow > 0 : previous?.operatingCashFlowPositive),
    ebitda,
    netSales: numberOrNull(facts?.netSales ?? previous?.netSales),
    operatingIncome,
    netIncome,
    netAssets,
    totalAssets: numberOrNull(facts?.totalAssets ?? previous?.totalAssets),
    depreciationAndAmortization: depreciation,
    warnings: marketValues.warnings,
  };
  snapshot.criteria = buildPeFinancialCriteria(snapshot);
  snapshot.missingMetrics = buildFinancialMissingMetrics(snapshot);
  snapshot.insights = buildFinancialInsights(snapshot);
  snapshot.insightMethod = "edinet_rules";
  snapshot.peScore = financialCriteriaScore(snapshot.criteria);
  if (snapshot.marketCap || snapshot.cashAndEquivalents || snapshot.pbr || snapshot.per) snapshot.status = doc?.docID ? "ok" : "partial";
  if (!doc?.docID) snapshot.warnings.push("EDINET報告書は直近検索で未取得");
  if (!Number.isFinite(snapshot.marketCap)) snapshot.warnings.push("時価総額未取得");
  return normalizeFinancialSnapshot(snapshot);
}

function reconcileFinancialMarketValues(currentPrice, sharesOutstanding, marketCap) {
  const warnings = [];
  const price = nullablePositiveNumber(currentPrice);
  const shares = nullablePositiveNumber(sharesOutstanding);
  const cap = nullablePositiveNumber(marketCap);
  const impliedPrice = cap && shares ? cap / shares : null;
  let reconciledPrice = price;
  let reconciledMarketCap = cap;

  if (Number.isFinite(impliedPrice) && !isFinancialPriceConsistent(price, impliedPrice)) {
    reconciledPrice = impliedPrice;
    warnings.push("株価を時価総額÷発行済株式数で補正");
  }

  if (!Number.isFinite(reconciledMarketCap) && Number.isFinite(reconciledPrice) && shares) {
    reconciledMarketCap = reconciledPrice * shares;
  }

  return {
    currentPrice: numberOrNull(reconciledPrice),
    marketCap: numberOrNull(reconciledMarketCap),
    warnings,
  };
}

function isFinancialPriceConsistent(price, impliedPrice) {
  if (!Number.isFinite(price)) return false;
  if (!Number.isFinite(impliedPrice) || impliedPrice <= 0) return true;
  const ratio = price / impliedPrice;
  return ratio >= 0.65 && ratio <= 1.35;
}

function financialFactsFromSnapshot(item = {}) {
  return {
    cashAndEquivalents: item.cashAndEquivalents,
    shortTermSecurities: item.shortTermSecurities,
    interestBearingDebt: item.interestBearingDebt,
    operatingCashFlow: item.operatingCashFlow,
    operatingCashFlowYears: item.operatingCashFlowYears,
    ebitda: item.ebitda,
    netSales: item.netSales,
    operatingIncome: item.operatingIncome,
    netIncome: item.netIncome,
    netAssets: item.netAssets,
    totalAssets: item.totalAssets,
    sharesOutstanding: item.sharesOutstanding,
    depreciationAndAmortization: item.depreciationAndAmortization,
  };
}

function buildFinancialMissingMetrics(financials = {}) {
  const missing = [];
  if (!Number.isFinite(financials.marketCap)) {
    const parts = [];
    if (!Number.isFinite(financials.currentPrice)) parts.push("現在株価");
    if (!Number.isFinite(financials.sharesOutstanding)) parts.push("発行済株式数");
    missing.push(parts.length ? `時価総額: ${parts.join("・")}不足` : "時価総額: Yahoo側の補完不足");
  }
  if (!Number.isFinite(financials.netCashRatio)) missing.push("ネットキャッシュ比率: 時価総額不足");
  if (!Number.isFinite(financials.evEbitda)) {
    const parts = [];
    if (!Number.isFinite(financials.marketCap)) parts.push("時価総額");
    if (!Number.isFinite(financials.netCash)) parts.push("ネットキャッシュ");
    if (!Number.isFinite(financials.ebitda)) parts.push("EBITDA");
    missing.push(`EV/EBITDA: ${parts.length ? parts.join("・") : "倍率データ"}不足`);
  }
  if (!Number.isFinite(financials.pbr)) {
    const parts = [];
    if (!Number.isFinite(financials.marketCap)) parts.push("時価総額");
    if (!Number.isFinite(financials.netAssets)) parts.push("純資産");
    missing.push(`PBR: ${parts.length ? parts.join("・") : "Yahoo側のPBR"}不足`);
  }
  if (!Number.isFinite(financials.per)) {
    const parts = [];
    if (!Number.isFinite(financials.marketCap)) parts.push("時価総額");
    if (!Number.isFinite(financials.netIncome)) parts.push("純利益");
    missing.push(`PER: ${parts.length ? parts.join("・") : "Yahoo側のPER"}不足`);
  }
  return uniqueText(missing).slice(0, 8);
}

function buildFinancialInsights(financials = {}) {
  const insights = [];
  const criteria = normalizeFinancialCriteria(financials.criteria || []);
  const byKey = new Map(criteria.map((item) => [item.key, item]));
  const marketCap = byKey.get("market_cap");
  const netCash = byKey.get("net_cash");
  const valuation = byKey.get("ev_ebitda");
  const pbr = byKey.get("pbr");
  const operatingCf = byKey.get("operating_cf");

  if (marketCap?.status === "pass") {
    insights.push("時価総額はPEが買収を検討しやすい範囲です。50億-500億円は中小型、500億-3000億円は大型PEでも対象になり得る規模として見ます。");
  } else if (marketCap?.status === "watch") {
    insights.push(`時価総額は大きめです。${marketCap.summary} 直接の買収・MBO・株主変化がない場合、PE候補としては慎重に見ます。`);
  } else if (marketCap?.status === "fail") {
    insights.push(`時価総額はPEが対象にしやすい中小型株の範囲から外れます。${marketCap.summary}`);
  } else if (marketCap?.status === "unknown") {
    insights.push("時価総額が作れていないため、PE候補としての規模の確認は保留です。");
  }

  if (netCash?.status === "pass") {
    insights.push("ネットキャッシュが厚く、買収後に資金回収しやすい形です。");
  } else if (netCash?.status === "watch") {
    insights.push("ネットキャッシュは一定ありますが、PEが強く好む50%以上には届いていません。");
  } else if (netCash?.status === "fail") {
    insights.push("ネットキャッシュ面では、買収対象として見られやすい条件は強くありません。");
  }

  if (valuation?.status === "pass" || pbr?.status === "pass") {
    const labels = [valuation, pbr].filter((item) => item?.status === "pass").map((item) => item.summary).filter(Boolean).join(" / ");
    insights.push(`${labels || "倍率面"}から見ると、割安に見える材料があります。`);
  } else if (valuation?.status === "watch" || pbr?.status === "watch") {
    insights.push("倍率面は確認レベルで、割安だけを根拠に強く買うには弱めです。");
  } else if (valuation?.status === "fail" && pbr?.status === "fail") {
    insights.push("EV/EBITDA・PBRの両面で、資産や利益に対する割安感は弱めです。");
  }

  if (operatingCf?.status === "pass") {
    insights.push("営業CFが継続プラスで、本業で現金を生み出せていることを確認できます。");
  } else if (operatingCf?.status === "watch") {
    insights.push("直近の営業CFはプラスですが、複数年での安定性確認が必要です。");
  } else if (operatingCf?.status === "fail") {
    insights.push("営業CFがマイナスで、PE候補としては大きな注意点です。");
  }

  if (Number.isFinite(financials.netCash) && Number.isFinite(financials.operatingCashFlow)) {
    insights.push(`決算書ではネットキャッシュ${formatLargeYen(financials.netCash)}、営業CF${formatLargeYen(financials.operatingCashFlow)}を確認しました。`);
  }
  return uniqueText(insights).slice(0, 6);
}

function buildPeFinancialCriteria(financials = {}) {
  return PE_FINANCIAL_CRITERIA.map((criterion) => {
    if (criterion.key === "market_cap") {
      const marketCap = numberOrNull(financials.marketCap);
      if (!Number.isFinite(marketCap)) return financialCriterion(criterion, "unknown", 0, "時価総額が未取得");
      if (marketCap >= JP_PE_MARKET_CAP_MIN && marketCap <= JP_PE_MARKET_CAP_CORE_MAX) {
        return financialCriterion(criterion, "pass", criterion.max, "50億-500億円で、中小型PEが検討しやすい規模");
      }
      if (marketCap < JP_PE_MARKET_CAP_MIN) return financialCriterion(criterion, "fail", 0, "規模が小さく、PEの案件としては優先されにくい");
      if (marketCap <= JP_PE_MARKET_CAP_MAX) {
        return financialCriterion(criterion, "pass", criterion.max * 0.72, "500億-3000億円で、大型PEなら対象になり得る規模");
      }
      if (marketCap <= JP_PE_MARKET_CAP_LARGE_WATCH_MAX) {
        return financialCriterion(criterion, "watch", criterion.max * 0.25, "3000億円超の大型案件。直接の買収・MBO材料が必要");
      }
      return financialCriterion(criterion, "fail", 0, "1兆円超で、通常のPE候補としては大きすぎます");
    }
    if (criterion.key === "net_cash") {
      const ratio = numberOrNull(financials.netCashRatio);
      if (!Number.isFinite(ratio)) return financialCriterion(criterion, "unknown", 0, "現金・負債または時価総額が未取得");
      if (ratio >= 0.5) return financialCriterion(criterion, "pass", criterion.max, `ネットキャッシュ比率${Math.round(ratio * 100)}%`);
      if (ratio >= 0.3) return financialCriterion(criterion, "watch", criterion.max * 0.45, `ネットキャッシュ比率${Math.round(ratio * 100)}%で惜しい`);
      return financialCriterion(criterion, "fail", 0, `ネットキャッシュ比率${Math.round(ratio * 100)}%`);
    }
    if (criterion.key === "ev_ebitda") {
      const evEbitda = numberOrNull(financials.evEbitda);
      const per = numberOrNull(financials.per);
      if (Number.isFinite(evEbitda) && evEbitda <= 6) return financialCriterion(criterion, "pass", criterion.max, `EV/EBITDA ${evEbitda.toFixed(1)}倍`);
      if (Number.isFinite(per) && per <= 12) return financialCriterion(criterion, "pass", criterion.max * 0.8, `PER ${per.toFixed(1)}倍`);
      if (Number.isFinite(evEbitda) || Number.isFinite(per)) return financialCriterion(criterion, "watch", criterion.max * 0.25, "買収後に投資回収しやすい水準とは言い切れません");
      return financialCriterion(criterion, "unknown", 0, "EV/EBITDA/PERが未取得");
    }
    if (criterion.key === "pbr") {
      const pbr = numberOrNull(financials.pbr);
      if (!Number.isFinite(pbr)) return financialCriterion(criterion, "unknown", 0, "PBRが未取得");
      if (pbr <= 0.8) return financialCriterion(criterion, "pass", criterion.max, `PBR ${pbr.toFixed(2)}倍`);
      if (pbr < 1) return financialCriterion(criterion, "pass", criterion.max * 0.75, `PBR ${pbr.toFixed(2)}倍`);
      if (pbr <= 1.2) return financialCriterion(criterion, "watch", criterion.max * 0.25, `PBR ${pbr.toFixed(2)}倍`);
      return financialCriterion(criterion, "fail", 0, `PBR ${pbr.toFixed(2)}倍で、純資産と比べた割安感は強くありません`);
    }
    if (criterion.key === "operating_cf") {
      const years = nullableNonNegativeNumber(financials.operatingCashFlowYears);
      if (Number.isFinite(years) && years >= 3) return financialCriterion(criterion, "pass", criterion.max, `営業CFは直近${years}期分プラス`);
      const cashFlow = numberOrNull(financials.operatingCashFlow);
      if (Number.isFinite(cashFlow) && cashFlow > 0) return financialCriterion(criterion, "watch", criterion.max * 0.45, "直近営業CFはプラス、連続年数は確認中");
      if (Number.isFinite(cashFlow)) return financialCriterion(criterion, cashFlow > 0 ? "pass" : "fail", cashFlow > 0 ? criterion.max * 0.65 : 0, cashFlow > 0 ? "営業CFプラス" : "営業CFマイナス");
      return financialCriterion(criterion, "unknown", 0, "営業CFが未取得");
    }
    return financialCriterion(criterion, "unknown", 0, "未評価");
  });
}

function financialCriterion(base, status, score, summary) {
  return {
    key: base.key,
    label: base.label,
    status,
    score: Math.round(Number(score || 0)),
    max: base.max,
    summary,
  };
}

function mergeQuoteSnapshotMaps(...maps) {
  const merged = new Map();
  for (const map of maps) {
    if (!(map instanceof Map)) continue;
    for (const [symbol, value] of map.entries()) {
      const normalized = normalizeSymbol(symbol);
      if (!normalized) continue;
      const next = { ...(merged.get(normalized) || {}) };
      for (const [key, entryValue] of Object.entries(value || {})) {
        if (entryValue === null || entryValue === undefined || entryValue === "") continue;
        next[key] = entryValue;
      }
      merged.set(normalized, next);
    }
  }
  return merged;
}

function hasQuoteSnapshotFinancialBasis(quote = {}) {
  if (!quote) return false;
  return Number.isFinite(quote.marketCap)
    && (Number.isFinite(quote.priceToBook) || Number.isFinite(quote.trailingPE) || Number.isFinite(quote.forwardPE));
}

async function fetchYahooQuoteSnapshots(symbols = []) {
  const cleanSymbols = uniqueText(symbols.map(normalizeSymbol).filter(Boolean));
  const quotes = new Map();
  for (const chunk of chunkArray(cleanSymbols, 30)) {
    const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    url.searchParams.set("symbols", chunk.join(","));
    url.searchParams.set("lang", "ja-JP");
    url.searchParams.set("region", "JP");
    url.searchParams.set("fields", [
      "regularMarketPrice",
      "marketCap",
      "sharesOutstanding",
      "priceToBook",
      "trailingPE",
      "forwardPE",
      "enterpriseToEbitda",
      "bookValue",
      "epsTrailingTwelveMonths",
      "epsForward",
    ].join(","));
    const response = await fetchWithTimeout(url, {
      timeout: 10000,
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 Stock Signal" },
    });
    if (!response.ok) throw new Error(`Yahoo quote returned ${response.status}`);
    const payload = await response.json().catch(() => null);
    for (const item of payload?.quoteResponse?.result || []) {
      const symbol = normalizeSymbol(item.symbol);
      if (!symbol) continue;
      quotes.set(symbol, {
        marketCap: numberOrNull(item.marketCap),
        currentPrice: numberOrNull(item.regularMarketPrice),
        sharesOutstanding: numberOrNull(item.sharesOutstanding),
        priceToBook: numberOrNull(item.priceToBook),
        trailingPE: numberOrNull(item.trailingPE),
        forwardPE: numberOrNull(item.forwardPE),
        enterpriseToEbitda: numberOrNull(item.enterpriseToEbitda),
        regularMarketPrice: numberOrNull(item.regularMarketPrice),
        bookValue: numberOrNull(item.bookValue),
        epsTrailingTwelveMonths: numberOrNull(item.epsTrailingTwelveMonths),
        epsForward: numberOrNull(item.epsForward),
      });
    }
  }
  return quotes;
}

async function fetchYahooQuoteSummarySnapshots(symbols = []) {
  const cleanSymbols = uniqueText(symbols.map(normalizeSymbol).filter(Boolean));
  const quotes = new Map();
  await mapLimit(cleanSymbols, 4, async (symbol) => {
    const url = new URL(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set("modules", "price,summaryDetail,defaultKeyStatistics,financialData");
    url.searchParams.set("lang", "ja-JP");
    url.searchParams.set("region", "JP");
    const response = await fetchWithTimeout(url, {
      timeout: 9000,
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 Stock Signal" },
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null);
    const result = payload?.quoteSummary?.result?.[0] || {};
    const price = result.price || {};
    const summary = result.summaryDetail || {};
    const stats = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    quotes.set(symbol, {
      marketCap: yahooRawNumber(price.marketCap ?? summary.marketCap),
      currentPrice: yahooRawNumber(price.regularMarketPrice ?? financial.currentPrice),
      regularMarketPrice: yahooRawNumber(price.regularMarketPrice ?? financial.currentPrice),
      sharesOutstanding: yahooRawNumber(stats.sharesOutstanding ?? stats.floatShares ?? price.sharesOutstanding),
      priceToBook: yahooRawNumber(stats.priceToBook ?? summary.priceToBook),
      trailingPE: yahooRawNumber(summary.trailingPE ?? stats.trailingPE),
      forwardPE: yahooRawNumber(summary.forwardPE ?? stats.forwardPE),
      enterpriseToEbitda: yahooRawNumber(stats.enterpriseToEbitda),
      bookValue: yahooRawNumber(stats.bookValue),
      epsTrailingTwelveMonths: yahooRawNumber(stats.trailingEps),
      epsForward: yahooRawNumber(stats.forwardEps),
    });
  });
  return quotes;
}

function yahooRawNumber(value) {
  if (value && typeof value === "object" && "raw" in value) return numberOrNull(value.raw);
  return numberOrNull(value);
}

async function fetchYahooJapanPageSnapshots(symbols = []) {
  const cleanSymbols = uniqueText(symbols.map(normalizeSymbol).filter(Boolean));
  const quotes = new Map();
  await mapLimit(cleanSymbols, 4, async (symbol) => {
    const url = `https://finance.yahoo.co.jp/quote/${encodeURIComponent(symbol)}`;
    const response = await fetchWithTimeout(url, {
      timeout: 9000,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ja,en-US;q=0.8,en;q=0.6",
        "user-agent": "Mozilla/5.0 Stock Signal",
      },
    });
    if (!response.ok) return;
    const html = await response.text();
    const parsed = parseYahooJapanQuotePageSnapshot(html);
    if (Object.values(parsed).some(Number.isFinite)) quotes.set(symbol, parsed);
  });
  return quotes;
}

function parseYahooJapanQuotePageSnapshot(html = "") {
  const decoded = xmlDecode(String(html || ""))
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\"/g, "\"");
  const text = cleanText(htmlToInlineText(decoded));
  const currentPrice = extractJsonRawNumber(decoded, ["regularMarketPrice", "currentPrice"])
    ?? parseJapaneseAmountNearLabel(text, ["現在値", "取引値"], { allowNoUnit: true });
  const marketCap = parseJapaneseAmountNearLabel(text, ["時価総額"], { defaultUnit: "百万円" })
    ?? extractJsonRawNumber(decoded, ["marketCap", "marketCapitalization"]);
  const sharesOutstanding = parseJapaneseAmountNearLabel(text, ["発行済株式数"], { defaultUnit: "株", allowNoUnit: true })
    ?? extractJsonRawNumber(decoded, ["sharesOutstanding", "issuedShare", "issuedShares"]);
  return {
    currentPrice,
    regularMarketPrice: currentPrice,
    marketCap,
    sharesOutstanding,
    priceToBook: parseMultipleNearLabel(text, ["PBR", "株価純資産倍率"]) ?? extractJsonRawNumber(decoded, ["priceToBook"]),
    trailingPE: parseMultipleNearLabel(text, ["PER", "株価収益率"]) ?? extractJsonRawNumber(decoded, ["trailingPE"]),
    forwardPE: extractJsonRawNumber(decoded, ["forwardPE"]),
    enterpriseToEbitda: parseMultipleNearLabel(text, ["EV/EBITDA", "EV EBITDA"]) ?? extractJsonRawNumber(decoded, ["enterpriseToEbitda"]),
    bookValue: parseJapaneseAmountNearLabel(text, ["BPS", "1株純資産"], { allowNoUnit: true }) ?? extractJsonRawNumber(decoded, ["bookValue"]),
    epsTrailingTwelveMonths: parseJapaneseAmountNearLabel(text, ["EPS", "1株利益"], { allowNoUnit: true }) ?? extractJsonRawNumber(decoded, ["trailingEps"]),
    epsForward: extractJsonRawNumber(decoded, ["forwardEps"]),
  };
}

function extractJsonRawNumber(text = "", keys = []) {
  for (const key of keys) {
    const escaped = escapeRegExp(key);
    const rawMatch = text.match(new RegExp(`"${escaped}"\\s*:\\s*\\{[^{}]{0,240}?"raw"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
    if (rawMatch) return numberOrNull(rawMatch[1]);
    const simpleMatch = text.match(new RegExp(`"${escaped}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
    if (simpleMatch) return numberOrNull(simpleMatch[1]);
  }
  return null;
}

function parseMultipleNearLabel(text = "", labels = []) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${escapeRegExp(label)}[^0-9\\-]{0,80}(-?\\d+(?:\\.\\d+)?)\\s*倍`, "i"));
    const number = numberOrNull(match?.[1]);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function parseJapaneseAmountNearLabel(text = "", labels = [], options = {}) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${escapeRegExp(label)}[^0-9０-９\\-]{0,100}(-?[0-9０-９,，.．]+)\\s*(兆円|億円|万円|百万円|千円|円|株)?`, "i"));
    if (!match) continue;
    const amount = parseJapaneseNumber(match[1]);
    if (!Number.isFinite(amount)) continue;
    const unit = match[2] || options.defaultUnit || "";
    if (!unit && options.allowNoUnit !== true) continue;
    return applyJapaneseAmountUnit(amount, unit);
  }
  return null;
}

function parseJapaneseNumber(value = "") {
  const text = String(value || "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/，/g, ",")
    .replace(/．/g, ".")
    .replace(/,/g, "")
    .trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function applyJapaneseAmountUnit(value, unit = "") {
  if (!Number.isFinite(value)) return null;
  if (unit === "兆円") return value * 1_000_000_000_000;
  if (unit === "億円") return value * 100_000_000;
  if (unit === "万円") return value * 10_000;
  if (unit === "百万円") return value * 1_000_000;
  if (unit === "千円") return value * 1_000;
  return value;
}

async function fetchYahooCurrentQuoteFromChart(symbol = "") {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}`);
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");
  const response = await fetchWithTimeout(url, {
    timeout: QUICK_PRICE_HISTORY_TIMEOUT_MS,
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 Stock Signal" },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const latestClose = [...closes].reverse().find((value) => nullablePositiveNumber(value));
  const currentPrice = nullablePositiveNumber(meta.regularMarketPrice ?? meta.previousClose ?? latestClose);
  if (!currentPrice) return null;
  return {
    currentPrice,
    regularMarketPrice: currentPrice,
  };
}

async function findLatestEdinetDocuments(stocks = [], apiKey = "") {
  const wanted = new Map(stocks.map((stock) => [stock.symbol.replace(".T", ""), stock]));
  const bySymbol = new Map();
  const warnings = [];
  if (!wanted.size) return { bySymbol, warnings };
  for (let offset = 0; offset < EDINET_LOOKBACK_DAYS && bySymbol.size < wanted.size; offset += 1) {
    const date = isoDateDaysAgo(offset);
    let documents = [];
    try {
      documents = await fetchEdinetDocumentsByDate(date, apiKey);
    } catch (error) {
      if (offset < 3) warnings.push(`${date}: ${error.message || "EDINET書類一覧取得失敗"}`);
      continue;
    }
    for (const doc of documents) {
      const normalized = normalizeEdinetDocument(doc);
      if (!normalized || !isFinancialEdinetDocument(normalized)) continue;
      const code = normalized.secCode.slice(0, 4);
      const stock = wanted.get(code);
      if (!stock || bySymbol.has(stock.symbol)) continue;
      bySymbol.set(stock.symbol, normalized);
    }
  }
  return { bySymbol, warnings };
}

function isoDateDaysAgo(offset = 0) {
  const date = new Date(Date.now() - offset * 86400000);
  return date.toISOString().slice(0, 10);
}

async function fetchEdinetDocumentsByDate(date, apiKey) {
  const url = new URL(`${EDINET_API_BASE}/documents.json`);
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", apiKey);
  const response = await fetchWithTimeout(url, {
    timeout: 10000,
    headers: {
      accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
      "Subscription-Key": apiKey,
      "user-agent": "Mozilla/5.0 Stock Signal",
    },
  });
  if (!response.ok) throw new Error(`EDINET documents returned ${response.status}`);
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.results) ? payload.results : [];
}

function normalizeEdinetDocument(doc = {}) {
  const docID = cleanText(doc.docID || doc.docId || "");
  const secCode = cleanText(doc.secCode || "");
  if (!docID || !secCode) return null;
  return {
    docID,
    secCode,
    filerName: cleanText(doc.filerName || ""),
    docDescription: cleanText(doc.docDescription || ""),
    submitDateTime: cleanText(doc.submitDateTime || doc.submitDate || ""),
    formCode: cleanText(doc.formCode || ""),
    ordinanceCode: cleanText(doc.ordinanceCode || ""),
  };
}

function isFinancialEdinetDocument(doc = {}) {
  const description = `${doc.docDescription || ""} ${doc.formCode || ""}`;
  if (/訂正|変更報告書|大量保有|公開買付|臨時報告|発行登録|半期報告書の確認書/.test(description)) return false;
  return /有価証券報告書|四半期報告書|半期報告書/.test(description);
}

async function fetchEdinetFinancialFacts(docID, apiKey) {
  const url = new URL(`${EDINET_API_BASE}/documents/${encodeURIComponent(docID)}`);
  url.searchParams.set("type", "1");
  url.searchParams.set("Subscription-Key", apiKey);
  const response = await fetchWithTimeout(url, {
    timeout: 20000,
    headers: {
      accept: "application/zip,application/octet-stream,*/*",
      "Ocp-Apim-Subscription-Key": apiKey,
      "Subscription-Key": apiKey,
      "user-agent": "Mozilla/5.0 Stock Signal",
    },
  });
  if (!response.ok) throw new Error(`EDINET XBRL returned ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const entries = unzipTextEntries(buffer)
    .filter((entry) => /\.xbrl$/i.test(entry.name) && !/AuditDoc|PublicDoc\/attach/i.test(entry.name))
    .sort((a, b) => b.text.length - a.text.length);
  const xbrl = entries[0]?.text || "";
  if (!xbrl) throw new Error("EDINET XBRL本文が見つかりませんでした");
  return extractFinancialFactsFromXbrl(xbrl);
}

function unzipTextEntries(buffer) {
  const eocd = findZipEocd(buffer);
  if (eocd < 0) return [];
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let offset = centralOffset;
  while (offset + 46 < buffer.length && buffer.readUInt32LE(offset) === 0x02014b50) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    let text = "";
    try {
      if (method === 8) text = inflateRawSync(data).toString("utf8");
      else if (method === 0) text = data.toString("utf8");
    } catch {
      text = "";
    }
    if (text) entries.push({ name, text });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findZipEocd(buffer) {
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 66000); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}

function extractFinancialFactsFromXbrl(xbrl = "") {
  const cash = extractBestXbrlFact(xbrl, [
    "CashAndDeposits",
    "CashAndCashEquivalents",
    "CashAndCashEquivalentsIFRS",
    "CashAndCashEquivalentsIFRSSummaryOfBusinessResults",
    "CashAndCashEquivalentsAtEndOfPeriod",
    "CashAndCashEquivalentsAtEndOfPeriodIFRS",
  ], "instant");
  const securities = extractBestXbrlFact(xbrl, [
    "ShortTermInvestmentSecurities",
    "Securities",
    "SecuritiesCA",
    "ShortTermInvestments",
    "OtherFinancialAssetsCA",
    "MarketableSecurities",
  ], "instant");
  const broadDebt = extractBestXbrlFact(xbrl, [
    "InterestBearingDebt",
    "BondsAndBorrowings",
  ], "instant");
  const debt = Number.isFinite(broadDebt) ? broadDebt : extractXbrlFactSum(xbrl, [
    "BondsAndBorrowingsCL",
    "BondsAndBorrowingsNCL",
    "ShortTermLoansPayable",
    "ShortTermBorrowings",
    "CurrentPortionOfLongTermLoansPayable",
    "CurrentPortionOfBonds",
    "LongTermLoansPayable",
    "LongTermBorrowings",
    "BondsPayable",
    "LeaseObligations",
    "LeaseLiabilitiesCL",
    "LeaseLiabilitiesNCL",
    "CommercialPapersLiabilities",
  ]);
  const operatingCashFlow = extractBestXbrlFact(xbrl, [
    "NetCashProvidedByUsedInOperatingActivities",
    "CashFlowsFromUsedInOperatingActivities",
    "CashFlowsFromOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesIFRS",
    "CashFlowsFromUsedInOperatingActivitiesIFRS",
  ], "duration");
  const operatingCashFlowSeries = extractXbrlFactValues(xbrl, [
    "NetCashProvidedByUsedInOperatingActivities",
    "CashFlowsFromUsedInOperatingActivities",
    "CashFlowsFromOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesIFRS",
    "CashFlowsFromUsedInOperatingActivitiesIFRS",
  ], "duration").map((item) => item.value);
  const operatingCashFlowYears = operatingCashFlowSeries.filter((value) => value > 0).length;
  const netSales = extractBestXbrlFact(xbrl, [
    "NetSales",
    "Revenue",
    "RevenueIFRS",
    "RevenueSummaryOfBusinessResults",
    "OperatingRevenue",
    "SalesRevenue",
  ], "duration");
  const operatingIncome = extractBestXbrlFact(xbrl, [
    "OperatingIncome",
    "OperatingProfitLoss",
    "OperatingProfitIFRS",
    "ProfitLossFromOperatingActivities",
    "ProfitLossFromOperatingActivitiesIFRS",
    "BusinessProfit",
  ], "duration");
  const netIncome = extractBestXbrlFact(xbrl, [
    "ProfitLoss",
    "ProfitLossAttributableToOwnersOfParent",
    "ProfitLossAttributableToOwnersOfParentIFRS",
    "ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",
    "ProfitAttributableToOwnersOfParentSummaryOfBusinessResults",
    "NetIncome",
    "NetIncomeLoss",
    "NetIncomeLossAttributableToOwnersOfParent",
    "ProfitAttributableToOwnersOfParent",
    "ProfitAttributableToOwnersOfParentIFRS",
    "ProfitLossSummaryOfBusinessResults",
  ], "duration");
  const depreciation = extractBestXbrlFact(xbrl, [
    "DepreciationAndAmortization",
    "Depreciation",
    "DepreciationAndAmortisationExpense",
    "DepreciationAndAmortizationSGA",
  ], "duration");
  const ebitda = extractBestXbrlFact(xbrl, ["EBITDA", "AdjustedEBITDA"], "duration");
  const netAssets = extractBestXbrlFact(xbrl, [
    "NetAssets",
    "NetAssetsSummaryOfBusinessResults",
    "Equity",
    "EquityIFRS",
    "TotalEquityIFRS",
    "EquityAttributableToOwnersOfParent",
    "EquityAttributableToOwnersOfParentIFRS",
    "EquityAttributableToOwnersOfParentSummaryOfBusinessResults",
  ], "instant");
  const totalAssets = extractBestXbrlFact(xbrl, [
    "Assets",
    "TotalAssets",
    "AssetsIFRS",
    "TotalAssetsIFRS",
    "TotalAssetsSummaryOfBusinessResults",
  ], "instant");
  const sharesOutstanding = extractBestXbrlFact(xbrl, [
    "TotalNumberOfIssuedSharesSummaryOfBusinessResults",
    "TotalNumberOfIssuedSharesAsOfFiscalYearEndSummaryOfBusinessResults",
    "TotalNumberOfIssuedShares",
    "NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock",
    "NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYear",
    "NumberOfIssuedShares",
    "IssuedSharesTotalNumberOfSharesEtc",
    "NumberOfIssuedSharesAsOfFiscalYearEndIssuedSharesTotalNumberOfSharesEtc",
    "TotalNumberOfIssuedSharesIssuedSharesTotalNumberOfSharesEtc",
    "NumberOfSharesIssuedAndOutstandingAtEndOfFiscalYear",
    "TotalNumberOfIssuedSharesCommonStocks",
    "TotalNumberOfIssuedSharesCommonShares",
    "AverageNumberOfShares",
    "AverageNumberOfSharesSummaryOfBusinessResults",
    "AverageNumberOfSharesDuringPeriod",
  ], "shares");
  return {
    cashAndEquivalents: cash,
    shortTermSecurities: securities,
    interestBearingDebt: debt,
    operatingCashFlow,
    operatingCashFlowYears,
    netSales,
    operatingIncome,
    netIncome,
    depreciationAndAmortization: depreciation,
    ebitda,
    netAssets,
    totalAssets,
    sharesOutstanding,
  };
}

function extractXbrlFactValues(xbrl = "", names = [], periodHint = "") {
  const facts = [];
  const seen = new Set();
  for (const name of names) {
    const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${escapeRegExp(name)}\\b([^>]*)>([^<]+)<\\/(?:[A-Za-z0-9_.-]+:)?${escapeRegExp(name)}>`, "gi");
    let match;
    while ((match = re.exec(xbrl))) {
      const value = parseXbrlNumber(match[2]);
      if (!Number.isFinite(value)) continue;
      const attrs = match[1] || "";
      const contextRef = cleanText(attrs.match(/contextRef=["']([^"']+)["']/i)?.[1] || "");
      const unitRef = cleanText(attrs.match(/unitRef=["']([^"']+)["']/i)?.[1] || "");
      if (unitRef && !/JPY|Yen|Pure|shares|Share/i.test(unitRef)) continue;
      const key = `${name}:${contextRef}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({ name, value, contextRef, score: xbrlFactScore(contextRef, periodHint) });
    }
  }
  return facts.sort((a, b) => b.score - a.score || Math.abs(b.value) - Math.abs(a.value)).slice(0, 5);
}

function extractXbrlFactSum(xbrl = "", names = []) {
  const values = names.map((name) => extractBestXbrlFact(xbrl, [name], "instant")).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function extractBestXbrlFact(xbrl = "", names = [], periodHint = "") {
  const facts = [];
  for (const name of names) {
    const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${escapeRegExp(name)}\\b([^>]*)>([^<]+)<\\/(?:[A-Za-z0-9_.-]+:)?${escapeRegExp(name)}>`, "gi");
    let match;
    while ((match = re.exec(xbrl))) {
      const value = parseXbrlNumber(match[2]);
      if (!Number.isFinite(value)) continue;
      const attrs = match[1] || "";
      const contextRef = cleanText(attrs.match(/contextRef=["']([^"']+)["']/i)?.[1] || "");
      const unitRef = cleanText(attrs.match(/unitRef=["']([^"']+)["']/i)?.[1] || "");
      if (unitRef && !/JPY|Yen|Pure|shares|Share/i.test(unitRef)) continue;
      facts.push({ name, value, contextRef, score: xbrlFactScore(contextRef, periodHint) });
    }
  }
  if (!facts.length) return null;
  facts.sort((a, b) => b.score - a.score || Math.abs(b.value) - Math.abs(a.value));
  return facts[0].value;
}

function parseXbrlNumber(value = "") {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function xbrlFactScore(contextRef = "", periodHint = "") {
  const text = String(contextRef || "");
  let score = 0;
  if (/Current|当期|This/i.test(text)) score += 40;
  if (/Prior|Previous|前期/i.test(text)) score -= 30;
  if (/Consolidated|連結/i.test(text)) score += 16;
  if (/NonConsolidated|個別/i.test(text)) score -= 10;
  if (/Segment|セグメント|Business|Geographical|Axis|Member/i.test(text)) score -= 16;
  if (periodHint === "instant" && /Instant|AsOf/i.test(text)) score += 8;
  if (periodHint === "duration" && /Duration|YTD|Year/i.test(text)) score += 8;
  if (periodHint === "instant" && /Duration/i.test(text)) score -= 12;
  if (periodHint === "duration" && /Instant|AsOf/i.test(text)) score -= 12;
  if (periodHint === "shares") {
    if (/Instant|AsOf|End|FiscalYearEnd/i.test(text)) score += 18;
    if (/Average/i.test(text)) score += 8;
    if (/PerShare|Diluted|Basic/i.test(text)) score -= 90;
  }
  if (/Quarter|Q[1-4]/i.test(text)) score += 2;
  return score;
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
  const unitBudgetUnlimited = settings.unitBudgetUnlimited === true;
  return {
    searchProvider: provider,
    searxngUrl: normalizeUrl(settings.searxngUrl) || defaultSettings.searxngUrl,
    searxngEngines: normalizeSearxngEngines(settings.searxngEngines || defaultSettings.searxngEngines),
    googleApiKey: String(settings.googleApiKey || "").trim(),
    googleCseId: String(settings.googleCseId || "").trim(),
    googleSearchUrl: normalizeUrl(settings.googleSearchUrl) || defaultSettings.googleSearchUrl,
    lmStudioUrl: normalizeUrl(settings.lmStudioUrl) || defaultSettings.lmStudioUrl,
    lmStudioTimeoutMs: clamp(Number(settings.lmStudioTimeoutMs || defaultSettings.lmStudioTimeoutMs), 5000, 300000),
    unitSize: clamp(Number(settings.unitSize || defaultSettings.unitSize), 1, 1000),
    unitBudget: unitBudgetUnlimited ? null : clamp(Number(settings.unitBudget || defaultSettings.unitBudget), 10000, 10000000),
    unitBudgetUnlimited,
    websiteLimit: clamp(Number(settings.websiteLimit || defaultSettings.websiteLimit), 1, MAX_WEBSITE_LIMIT),
    depthLimit: clamp(Number(settings.depthLimit || defaultSettings.depthLimit), 1, MAX_DEPTH_LIMIT),
    pagesPerSite: clamp(Number(settings.pagesPerSite || defaultSettings.pagesPerSite), 1, MAX_PAGES_PER_SITE),
    dailyDiscoveryEnabled: settings.dailyDiscoveryEnabled !== false,
    dailyDiscoveryHour: clamp(Number(settings.dailyDiscoveryHour ?? defaultSettings.dailyDiscoveryHour), 0, 23),
    hourlyRefreshEnabled: settings.hourlyRefreshEnabled !== false,
    marketHoursOnlyRefresh: settings.marketHoursOnlyRefresh !== false,
    tdnetDisclosureEnabled: settings.tdnetDisclosureEnabled !== false,
    tdnetDisclosureLookbackDays: clamp(Number(settings.tdnetDisclosureLookbackDays || defaultSettings.tdnetDisclosureLookbackDays), 1, 7),
    tdnetDisclosureUseLmStudio: settings.tdnetDisclosureUseLmStudio !== false,
    growthExitEnabled: settings.growthExitEnabled !== false,
    trailingStopPct: clamp(Number(settings.trailingStopPct || defaultSettings.trailingStopPct), 5, 60),
    onkabuProfitPct: clamp(Number(settings.onkabuProfitPct || defaultSettings.onkabuProfitPct), 50, 300),
    shareholderMonitorEnabled: settings.shareholderMonitorEnabled !== false,
    shareholderChangeThresholdPct: clamp(Number(settings.shareholderChangeThresholdPct || defaultSettings.shareholderChangeThresholdPct), 0.1, 20),
    shareholderUseLmStudio: settings.shareholderUseLmStudio !== false,
    edinetApiKey: String(settings.edinetApiKey || "").trim(),
    rakutenAccountMemo: String(settings.rakutenAccountMemo || "").slice(0, 500),
    revolutAccountMemo: String(settings.revolutAccountMemo || "").slice(0, 500),
    notificationsEnabled: settings.notificationsEnabled === true,
    notificationMinConfidence: clamp(Number(settings.notificationMinConfidence || defaultSettings.notificationMinConfidence), 50, 100),
    notificationMinNetEdgeYen: clamp(Number(settings.notificationMinNetEdgeYen ?? defaultSettings.notificationMinNetEdgeYen), 0, 1000000),
    tradeFeeYen: clamp(Number(settings.tradeFeeYen || settings.jpTaxableTradeFeeYen || 0), 0, 100000),
    defaultJpAccountType: normalizeJpAccountType(settings.defaultJpAccountType || defaultSettings.defaultJpAccountType),
    jpTaxableTradeFeeYen: clamp(Number(settings.jpTaxableTradeFeeYen ?? settings.tradeFeeYen ?? defaultSettings.jpTaxableTradeFeeYen), 0, 100000),
    jpNisaTradeFeeYen: clamp(Number(settings.jpNisaTradeFeeYen ?? defaultSettings.jpNisaTradeFeeYen), 0, 100000),
    nisaAnnualLimitYen: clamp(Number(settings.nisaAnnualLimitYen ?? defaultSettings.nisaAnnualLimitYen), 0, 10000000),
    jpCapitalGainTaxPct: clamp(Number(settings.jpCapitalGainTaxPct ?? defaultSettings.jpCapitalGainTaxPct), 0, 60),
    usTradeFeeUsd: clamp(Number(settings.usTradeFeeUsd ?? defaultSettings.usTradeFeeUsd), 0, 1000),
    usCapitalGainTaxPct: clamp(Number(settings.usCapitalGainTaxPct ?? defaultSettings.usCapitalGainTaxPct), 0, 60),
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
  if (typeof body.searxngEngines === "string") next.searxngEngines = body.searxngEngines;
  if (typeof body.googleSearchUrl === "string" && body.googleSearchUrl.trim()) next.googleSearchUrl = body.googleSearchUrl;
  if (typeof body.googleCseId === "string" && body.googleCseId.trim()) next.googleCseId = body.googleCseId;
  if (typeof body.googleApiKey === "string" && body.googleApiKey.trim()) next.googleApiKey = body.googleApiKey;
  if (body.clearGoogleApiKey) next.googleApiKey = "";
  if (typeof body.lmStudioUrl === "string" && body.lmStudioUrl.trim()) next.lmStudioUrl = body.lmStudioUrl;
  if (body.lmStudioTimeoutMs) next.lmStudioTimeoutMs = body.lmStudioTimeoutMs;
  if (body.unitSize) next.unitSize = body.unitSize;
  if (body.unitBudget !== undefined) next.unitBudget = body.unitBudget;
  if (typeof body.unitBudgetUnlimited === "boolean") next.unitBudgetUnlimited = body.unitBudgetUnlimited;
  if (body.websiteLimit !== undefined) next.websiteLimit = body.websiteLimit;
  if (body.depthLimit !== undefined) next.depthLimit = body.depthLimit;
  if (body.pagesPerSite !== undefined) next.pagesPerSite = body.pagesPerSite;
  if (typeof body.dailyDiscoveryEnabled === "boolean") next.dailyDiscoveryEnabled = body.dailyDiscoveryEnabled;
  if (body.dailyDiscoveryHour !== undefined) next.dailyDiscoveryHour = body.dailyDiscoveryHour;
  if (typeof body.hourlyRefreshEnabled === "boolean") next.hourlyRefreshEnabled = body.hourlyRefreshEnabled;
  if (typeof body.marketHoursOnlyRefresh === "boolean") next.marketHoursOnlyRefresh = body.marketHoursOnlyRefresh;
  if (typeof body.tdnetDisclosureEnabled === "boolean") next.tdnetDisclosureEnabled = body.tdnetDisclosureEnabled;
  if (body.tdnetDisclosureLookbackDays !== undefined) next.tdnetDisclosureLookbackDays = body.tdnetDisclosureLookbackDays;
  if (typeof body.tdnetDisclosureUseLmStudio === "boolean") next.tdnetDisclosureUseLmStudio = body.tdnetDisclosureUseLmStudio;
  if (typeof body.growthExitEnabled === "boolean") next.growthExitEnabled = body.growthExitEnabled;
  if (body.trailingStopPct !== undefined) next.trailingStopPct = body.trailingStopPct;
  if (body.onkabuProfitPct !== undefined) next.onkabuProfitPct = body.onkabuProfitPct;
  if (typeof body.shareholderMonitorEnabled === "boolean") next.shareholderMonitorEnabled = body.shareholderMonitorEnabled;
  if (body.shareholderChangeThresholdPct !== undefined) next.shareholderChangeThresholdPct = body.shareholderChangeThresholdPct;
  if (typeof body.shareholderUseLmStudio === "boolean") next.shareholderUseLmStudio = body.shareholderUseLmStudio;
  if (typeof body.edinetApiKey === "string" && body.edinetApiKey.trim()) next.edinetApiKey = body.edinetApiKey;
  if (body.clearEdinetApiKey) next.edinetApiKey = "";
  if (typeof body.rakutenAccountMemo === "string") next.rakutenAccountMemo = body.rakutenAccountMemo;
  if (typeof body.revolutAccountMemo === "string") next.revolutAccountMemo = body.revolutAccountMemo;
  if (typeof body.notificationsEnabled === "boolean") next.notificationsEnabled = body.notificationsEnabled;
  if (body.notificationMinConfidence) next.notificationMinConfidence = body.notificationMinConfidence;
  if (body.notificationMinNetEdgeYen !== undefined) next.notificationMinNetEdgeYen = body.notificationMinNetEdgeYen;
  if (body.tradeFeeYen !== undefined) next.tradeFeeYen = body.tradeFeeYen;
  if (body.defaultJpAccountType !== undefined) next.defaultJpAccountType = body.defaultJpAccountType;
  if (body.jpTaxableTradeFeeYen !== undefined) next.jpTaxableTradeFeeYen = body.jpTaxableTradeFeeYen;
  if (body.jpNisaTradeFeeYen !== undefined) next.jpNisaTradeFeeYen = body.jpNisaTradeFeeYen;
  if (body.nisaAnnualLimitYen !== undefined) next.nisaAnnualLimitYen = body.nisaAnnualLimitYen;
  if (body.jpCapitalGainTaxPct !== undefined) next.jpCapitalGainTaxPct = body.jpCapitalGainTaxPct;
  if (body.usTradeFeeUsd !== undefined) next.usTradeFeeUsd = body.usTradeFeeUsd;
  if (body.usCapitalGainTaxPct !== undefined) next.usCapitalGainTaxPct = body.usCapitalGainTaxPct;
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
    searxngEngines: settings.searxngEngines,
    googleCseId: settings.googleCseId,
    googleSearchUrl: settings.googleSearchUrl,
    hasGoogleApiKey: Boolean(settings.googleApiKey),
    lmStudioUrl: settings.lmStudioUrl,
    lmStudioTimeoutMs: settings.lmStudioTimeoutMs,
    unitSize: settings.unitSize,
    unitBudget: settings.unitBudget,
    unitBudgetUnlimited: settings.unitBudgetUnlimited === true,
    websiteLimit: settings.websiteLimit,
    depthLimit: settings.depthLimit,
    pagesPerSite: settings.pagesPerSite,
    dailyDiscoveryEnabled: settings.dailyDiscoveryEnabled,
    dailyDiscoveryHour: settings.dailyDiscoveryHour,
    hourlyRefreshEnabled: settings.hourlyRefreshEnabled,
    marketHoursOnlyRefresh: settings.marketHoursOnlyRefresh,
    tdnetDisclosureEnabled: settings.tdnetDisclosureEnabled,
    tdnetDisclosureLookbackDays: settings.tdnetDisclosureLookbackDays,
    tdnetDisclosureUseLmStudio: settings.tdnetDisclosureUseLmStudio,
    growthExitEnabled: settings.growthExitEnabled,
    trailingStopPct: settings.trailingStopPct,
    onkabuProfitPct: settings.onkabuProfitPct,
    shareholderMonitorEnabled: settings.shareholderMonitorEnabled,
    shareholderChangeThresholdPct: settings.shareholderChangeThresholdPct,
    shareholderUseLmStudio: settings.shareholderUseLmStudio,
    hasEdinetApiKey: Boolean(settings.edinetApiKey),
    rakutenAccountMemo: settings.rakutenAccountMemo,
    revolutAccountMemo: settings.revolutAccountMemo,
    notificationsEnabled: settings.notificationsEnabled,
    notificationMinConfidence: settings.notificationMinConfidence,
    notificationMinNetEdgeYen: settings.notificationMinNetEdgeYen,
    tradeFeeYen: settings.tradeFeeYen,
    defaultJpAccountType: settings.defaultJpAccountType,
    jpTaxableTradeFeeYen: settings.jpTaxableTradeFeeYen,
    jpNisaTradeFeeYen: settings.jpNisaTradeFeeYen,
    nisaAnnualLimitYen: settings.nisaAnnualLimitYen,
    jpCapitalGainTaxPct: settings.jpCapitalGainTaxPct,
    usTradeFeeUsd: settings.usTradeFeeUsd,
    usCapitalGainTaxPct: settings.usCapitalGainTaxPct,
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
  const unitBudgetUnlimited = budget.unitBudgetUnlimited === true || settings.unitBudgetUnlimited === true;
  const unitBudget = unitBudgetUnlimited ? null : (budget.unitBudget || settings.unitBudget);
  return {
    provider,
    engines: settings.searchProvider === "searxng" ? normalizeSearxngEngines(settings.searxngEngines) : "",
    searchConfigured: settings.searchProvider === "searxng"
      ? Boolean(settings.searxngUrl)
      : Boolean(settings.googleApiKey && settings.googleCseId),
    searchCount,
    candidateLimit,
    discoveredCount: budget.discoveredCount || 0,
    jpDiscoveredCount: budget.jpDiscoveredCount || 0,
    usDiscoveredCount: budget.usDiscoveredCount || 0,
    candidatePool: budget.candidatePool || candidateLimit,
    usedDiscoveryAi: Boolean(budget.usedDiscoveryAi),
    edinetDiscoveryEnabled: Boolean(budget.edinetDiscoveryEnabled),
    edinetDiscoveryChecked: Number(budget.edinetDiscoveryChecked || 0),
    edinetDiscoveryWarnings: asStringArray(budget.edinetDiscoveryWarnings).slice(0, 5),
    fullScan: Boolean(budget.fullScan),
    searchPositionUsed: Boolean(budget.searchPositionUsed),
    marketBrief: budget.marketBrief || null,
    performance: budget.performance || null,
    settingsKey: discoverySettingsKey(settings),
    settingsChanged: Boolean(budget.settingsChanged),
    message: String(budget.message || ""),
    strictBuyTarget: true,
    avoidedBusiness: "卸売・食品、情報系ベンチャー寄りは候補から除外",
    peCriteria: PE_FINANCIAL_CRITERIA.map((item) => item.label),
    peTendencies: PE_RECENT_TENDENCIES,
    unitSize,
    unitBudget,
    unitBudgetUnlimited,
    usUnitSize: US_DISCOVERY_UNIT_SIZE,
    usUnitBudget: US_DISCOVERY_UNIT_BUDGET,
    jpUniverseTotal: budget.jpUniverseTotal || 0,
    usUniverseTotal: budget.usUniverseTotal || 0,
    jpCandidatePool: budget.jpCandidatePool || 0,
    usCandidatePool: budget.usCandidatePool || 0,
    jpExistingCount: budget.jpExistingCount || 0,
    usExistingCount: budget.usExistingCount || 0,
    jpExcludedCount: budget.jpExcludedCount || 0,
    usExcludedCount: budget.usExcludedCount || 0,
    jpAvoidedBusinessCount: budget.jpAvoidedBusinessCount || 0,
    usAvoidedBusinessCount: budget.usAvoidedBusinessCount || 0,
    priceSource: "Yahoo Finance 5年日足",
    universe: budget.fullScan ? "東証プライム全銘柄 + 米国大型・中型候補" : "事業好調・割安候補リスト",
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

async function readUsWatchlist() {
  if (!existsSync(US_WATCHLIST_PATH)) {
    await saveUsWatchlist(defaultUsWatchlist);
    return defaultUsWatchlist.map(normalizeUsStock);
  }

  try {
    const stocks = JSON.parse(await readFile(US_WATCHLIST_PATH, "utf8"));
    if (Array.isArray(stocks) && stocks.length) return stocks.slice(0, MAX_US_STOCKS).map(normalizeUsStock);
  } catch {
    // Recreate the local list when the file is unreadable or partially written.
  }

  await saveUsWatchlist(defaultUsWatchlist);
  return defaultUsWatchlist.map(normalizeUsStock);
}

async function saveUsWatchlist(stocks) {
  await mkdir(path.dirname(US_WATCHLIST_PATH), { recursive: true });
  await writeFile(US_WATCHLIST_PATH, JSON.stringify(stocks.slice(0, MAX_US_STOCKS).map(normalizeUsStock), null, 2));
}

async function readCryptoHolding() {
  if (!existsSync(CRYPTO_HOLDING_PATH)) {
    await saveCryptoHolding(defaultCryptoHolding);
    return normalizeCryptoHolding(defaultCryptoHolding);
  }
  try {
    const holding = JSON.parse(await readFile(CRYPTO_HOLDING_PATH, "utf8"));
    return normalizeCryptoHolding(holding);
  } catch {
    await saveCryptoHolding(defaultCryptoHolding);
    return normalizeCryptoHolding(defaultCryptoHolding);
  }
}

async function saveCryptoHolding(holding) {
  const normalized = normalizeCryptoHolding(holding);
  await mkdir(path.dirname(CRYPTO_HOLDING_PATH), { recursive: true });
  await writeFile(CRYPTO_HOLDING_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function readUsAnalysisCache() {
  try {
    const cached = JSON.parse(await readFile(US_ANALYSIS_CACHE_PATH, "utf8"));
    const stocks = await readUsWatchlist().catch(() => []);
    const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const analyses = Array.isArray(cached.analyses)
      ? cached.analyses.map((analysis) => sanitizeCachedUsAnalysis(analysis, bySymbol.get(analysis.symbol))).filter(Boolean)
      : [];
    return {
      generatedAt: cached.generatedAt || "",
      currency: "USD",
      fastRefresh: Boolean(cached.fastRefresh),
      usedLmStudio: Boolean(cached.usedLmStudio),
      warnings: asStringArray(cached.warnings).slice(0, 6),
      analyses,
      summary: usPortfolioSummary(analyses),
    };
  } catch {
    return { generatedAt: "", currency: "USD", fastRefresh: false, usedLmStudio: false, warnings: [], analyses: [], summary: usPortfolioSummary([]) };
  }
}

function sanitizeCachedUsAnalysis(analysis = {}, stock = null) {
  const symbol = normalizeUsSymbol(analysis.symbol || stock?.symbol);
  if (!symbol) return null;
  const resolvedStock = stock || normalizeUsStock({
    symbol,
    name: analysis.name || symbol,
    market: analysis.market || "NYSE",
    holding: Boolean(analysis.position?.quantity),
  });
  const price = analysis.price || {};
  const position = positionMetrics(resolvedStock, price);
  const evidence = (analysis.evidence || []).map(normalizeUsEvidenceTranslationState);
  const ai = analysis.ai
    ? {
      ...analysis.ai,
      growthExit: enforceRecentGrowthExit(analysis.ai.growthExit, { evidence }, analysis),
      sellForecast: normalizeSellForecast(analysis.ai.sellForecast) || ruleSellForecast({ price, position }, "USD"),
    }
    : null;
  return {
    ...analysis,
    symbol,
    name: resolvedStock.name || analysis.name || symbol,
    market: resolvedStock.market || analysis.market || "NYSE",
    holding: Boolean(resolvedStock.holding),
    notes: resolvedStock.notes || analysis.notes || "",
    fundamentals: normalizeUsFundamentals(analysis.fundamentals || {}),
    position,
    evidence,
    ai,
  };
}

async function saveUsAnalysisCache(result) {
  await mkdir(path.dirname(US_ANALYSIS_CACHE_PATH), { recursive: true });
  await writeFile(US_ANALYSIS_CACHE_PATH, JSON.stringify({
    generatedAt: result.generatedAt,
    currency: "USD",
    fastRefresh: Boolean(result.fastRefresh),
    usedLmStudio: result.usedLmStudio,
    warnings: result.warnings || [],
    analyses: normalizeUsAnalyses(result.analyses),
    summary: result.summary || usPortfolioSummary(result.analyses || []),
  }, null, 2));
}

function normalizeUsAnalyses(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    ...item,
    fundamentals: normalizeUsFundamentals(item.fundamentals || {}),
  }));
}

async function readCryptoAnalysisCache() {
  try {
    const cached = JSON.parse(await readFile(CRYPTO_ANALYSIS_CACHE_PATH, "utf8"));
    return {
      generatedAt: cached.generatedAt || "",
      asset: "BTC",
      name: "Bitcoin",
      holding: normalizeCryptoHolding(cached.holding || defaultCryptoHolding),
      btcUsd: cached.btcUsd || compactCryptoPrice(emptyPrice(), "USD"),
      btcJpy: cached.btcJpy || compactCryptoPrice(emptyPrice(), "JPY"),
      usdJpy: cached.usdJpy || compactFxPrice(emptyPrice()),
      position: cached.position || cryptoPositionMetrics(defaultCryptoHolding),
      timing: cached.timing || {
        usd: cryptoTradeTiming(emptyPrice(), "USD"),
        jpy: cryptoTradeTiming(emptyPrice(), "JPY"),
      },
      fxTiming: cached.fxTiming || cryptoTradeTiming(emptyPrice(), "JPY"),
      summary: cached.summary || cryptoPortfolioSummary(cached.position || {}),
    };
  } catch {
    return {
      generatedAt: "",
      asset: "BTC",
      name: "Bitcoin",
      holding: normalizeCryptoHolding(defaultCryptoHolding),
      btcUsd: compactCryptoPrice(emptyPrice(), "USD"),
      btcJpy: compactCryptoPrice(emptyPrice(), "JPY"),
      usdJpy: compactFxPrice(emptyPrice()),
      position: cryptoPositionMetrics(defaultCryptoHolding),
      timing: {
        usd: cryptoTradeTiming(emptyPrice(), "USD"),
        jpy: cryptoTradeTiming(emptyPrice(), "JPY"),
      },
      fxTiming: cryptoTradeTiming(emptyPrice(), "JPY"),
      summary: cryptoPortfolioSummary({}),
    };
  }
}

async function saveCryptoAnalysisCache(result) {
  await mkdir(path.dirname(CRYPTO_ANALYSIS_CACHE_PATH), { recursive: true });
  await writeFile(CRYPTO_ANALYSIS_CACHE_PATH, JSON.stringify({
    generatedAt: result.generatedAt,
    asset: "BTC",
    name: "Bitcoin",
    holding: normalizeCryptoHolding(result.holding || defaultCryptoHolding),
    btcUsd: result.btcUsd || compactCryptoPrice(emptyPrice(), "USD"),
    btcJpy: result.btcJpy || compactCryptoPrice(emptyPrice(), "JPY"),
    usdJpy: result.usdJpy || compactFxPrice(emptyPrice()),
    position: result.position || cryptoPositionMetrics(result.holding || defaultCryptoHolding),
    timing: result.timing || {
      usd: cryptoTradeTiming(emptyPrice(), "USD"),
      jpy: cryptoTradeTiming(emptyPrice(), "JPY"),
    },
    fxTiming: result.fxTiming || cryptoTradeTiming(emptyPrice(), "JPY"),
    summary: result.summary || cryptoPortfolioSummary(result.position || {}),
  }, null, 2));
}

async function serveFile(res, filePath) {
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "Forbidden" });
  if (!existsSync(normalized)) return json(res, 404, { error: "Not found" });
  const extension = path.extname(normalized) || ".html";
  const content = await readFile(normalized);
  res.writeHead(200, {
    "content-type": mime[extension] || "application/octet-stream",
    "cache-control": "no-store",
  });
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
  const timeoutMs = options.timeout || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out")), ms);
    }),
  ]);
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
  return polishJapaneseText(String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim());
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
  const candidates = jsonObjectTextCandidates(trimmed);

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

function parseJsonObjectMatching(value, predicate) {
  const trimmed = String(value || "").trim();
  const candidates = jsonObjectTextCandidates(trimmed);

  let lastError = null;
  for (const candidate of candidates) {
    for (const body of [candidate, repairJson(candidate)]) {
      try {
        const parsed = JSON.parse(body);
        if (!predicate || predicate(parsed)) return parsed;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("No matching JSON object in model response");
}

function jsonObjectTextCandidates(trimmed) {
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  candidates.push(...extractJsonObjects(trimmed));
  return [...new Set(candidates.filter(Boolean))];
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
  return extractJsonObjects(value)[0] || "";
}

function extractJsonObjects(value) {
  const objects = [];
  const start = value.indexOf("{");
  if (start < 0) return objects;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;

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
    else if (char === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
    }
    else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) objects.push(value.slice(objectStart, i + 1));
    }
  }

  return objects;
}

function normalizeSymbol(value = "") {
  const symbol = String(value).trim().toUpperCase();
  if (!/^[0-9A-Z.-]{3,12}$/.test(symbol)) return "";
  return symbol.includes(".") ? symbol : `${symbol}.T`;
}

function normalizeUsSymbol(value = "") {
  const symbol = String(value).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return "";
  return symbol;
}

function normalizeDiscoverySymbol(value = "", context = {}) {
  const symbol = String(value || "").trim().toUpperCase();
  if (!symbol) return "";
  if (/^\d{4}(?:\.T)?$/.test(symbol)) return normalizeSymbol(symbol);
  if (context.currency === "USD" || ["NYSE", "NASDAQ", "AMEX"].includes(String(context.market || "").toUpperCase()) || /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
    return normalizeUsSymbol(symbol);
  }
  return normalizeSymbol(symbol);
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

function searchResultPublishedDate(item = {}) {
  const metaTags = Array.isArray(item.pagemap?.metatags) ? item.pagemap.metatags : [];
  const metaValues = metaTags.flatMap((tag) => [
    tag["article:published_time"],
    tag["article:modified_time"],
    tag["og:updated_time"],
    tag["datePublished"],
    tag.datePublished,
    tag.date,
    tag.pubdate,
    tag["parsely-pub-date"],
    tag["sailthru.date"],
    tag["dc.date"],
    tag["citation_publication_date"],
  ]);
  const candidates = [
    item.publishedDate,
    item.published,
    item.pubdate,
    item.date,
    item.datetime,
    item.created,
    item.updated,
    ...metaValues,
    item.title,
    item.snippet,
    item.content,
    item.url || item.link,
  ];
  for (const value of candidates) {
    const date = normalizeSearchDate(value);
    if (date) return date;
  }
  return "";
}

function normalizeSearchDate(value = "") {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = cleanText(value);
  if (!text) return "";
  const relative = relativeSearchDate(text);
  if (relative) return relative;
  const absolute = absoluteSearchDate(text);
  if (absolute) return absolute;
  if (/\b(?:19|20)\d{2}\b/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function relativeSearchDate(text = "") {
  const value = String(text).trim().toLowerCase();
  const english = value.match(/\b(\d{1,3})\s*(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago\b/);
  if (english) {
    const amount = Number(english[1]);
    const unit = english[2];
    const days = unit.startsWith("minute") || unit.startsWith("hour")
      ? 0
      : unit.startsWith("week")
      ? amount * 7
      : unit.startsWith("month")
      ? amount * 30
      : unit.startsWith("year")
      ? amount * 365
      : amount;
    return dateDaysAgo(days);
  }
  const japanese = value.match(/(\d{1,3})\s*(分|時間|日|週間|か月|ヶ月|年)前/);
  if (japanese) {
    const amount = Number(japanese[1]);
    const unit = japanese[2];
    const days = unit === "分" || unit === "時間"
      ? 0
      : unit === "週間"
      ? amount * 7
      : unit === "か月" || unit === "ヶ月"
      ? amount * 30
      : unit === "年"
      ? amount * 365
      : amount;
    return dateDaysAgo(days);
  }
  if (/昨日|yesterday/.test(value)) return dateDaysAgo(1);
  if (/今日|today/.test(value)) return dateDaysAgo(0);
  return "";
}

function absoluteSearchDate(text = "") {
  const value = String(text);
  const numeric = value.match(/\b((?:19|20)\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})(?:日)?\b/);
  if (numeric) return ymdFromNumbers(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const mdY = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})\b/);
  if (mdY) return ymdFromNumbers(Number(mdY[3]), Number(mdY[1]), Number(mdY[2]));
  const months = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const english = value.match(/\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/i);
  if (english) return ymdFromNumbers(Number(english[3]), months[english[1].toLowerCase().replace(".", "")], Number(english[2]));
  const urlDate = value.match(/[\/_-]((?:19|20)\d{2})[\/_-](\d{1,2})[\/_-](\d{1,2})(?=[\/_.-]|$)/);
  if (urlDate) return ymdFromNumbers(Number(urlDate[1]), Number(urlDate[2]), Number(urlDate[3]));
  return "";
}

function ymdFromNumbers(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function isRecentEvidenceForExit(item = {}) {
  return isRecentSearchDate(item.publishedDate || item.date || searchResultPublishedDate(item), FUNDAMENTAL_EXIT_MAX_AGE_DAYS);
}

function isRecentSearchDate(dateString = "", maxAgeDays = FUNDAMENTAL_EXIT_MAX_AGE_DAYS) {
  const date = normalizeDate(dateString);
  if (!date) return false;
  const age = daysSinceSearchDate(date);
  return Number.isFinite(age) && age >= -1 && age <= maxAgeDays;
}

function daysSinceSearchDate(dateString = "") {
  const date = normalizeDate(dateString);
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - target) / 86400000);
}

function normalizeJpAccountType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "nisa" || text.includes("nisa") || text.includes("ニーサ")) return "nisa";
  return "taxable";
}

function normalizePositionAccountType(value, stock = {}) {
  const symbol = String(stock.symbol || "").trim().toUpperCase();
  if (symbol && !symbol.endsWith(".T")) return "revolut_us";
  return normalizeJpAccountType(value || stock.accountType || defaultSettings.defaultJpAccountType);
}

function accountTypeLabel(value) {
  const type = String(value || "").toLowerCase();
  if (type === "revolut_us") return "Revolut USA / USD";
  if (type === "nisa") return "NISA";
  if (type === "mixed") return "NISA+一般/特定";
  return "一般/特定";
}

function dominantAccountType(lots = [], fallback = "taxable") {
  const types = new Set(lots.map((lot) => lot.accountType).filter(Boolean));
  if (types.size === 1) return [...types][0];
  if (types.size > 1) return "mixed";
  if (String(fallback || "").toLowerCase() === "revolut_us") return "revolut_us";
  return normalizePositionAccountType(fallback);
}

function normalizePositions(stock) {
  const raw = Array.isArray(stock.positions) && stock.positions.length
    ? stock.positions
    : [{
      purchaseDate: stock.purchaseDate,
      purchasePrice: stock.purchasePrice,
      quantity: stock.quantity,
      accountType: stock.accountType,
    }];
  return raw
    .map((lot) => ({
      purchaseDate: normalizeDate(lot.purchaseDate),
      purchasePrice: nullablePositiveNumber(lot.purchasePrice),
      quantity: nullablePositiveNumber(lot.quantity),
      accountType: normalizePositionAccountType(lot.accountType, stock),
    }))
    .filter((lot) => lot.purchasePrice && lot.quantity)
    .sort((a, b) => (a.purchaseDate || "9999-99-99").localeCompare(b.purchaseDate || "9999-99-99"))
    .slice(0, 50);
}

function normalizeSales(stock) {
  const raw = Array.isArray(stock.sales) ? stock.sales : [];
  return raw
    .map((lot) => ({
      sellDate: normalizeDate(lot.sellDate || lot.saleDate),
      sellPrice: nullablePositiveNumber(lot.sellPrice || lot.salePrice),
      quantity: nullablePositiveNumber(lot.quantity),
    }))
    .filter((lot) => lot.sellPrice && lot.quantity)
    .sort((a, b) => (a.sellDate || "9999-99-99").localeCompare(b.sellDate || "9999-99-99"))
    .slice(0, 50);
}

function normalizeCryptoPositions(holding = {}) {
  const raw = Array.isArray(holding.positions) ? holding.positions : [];
  return raw
    .map((lot) => ({
      purchaseDate: normalizeDate(lot.purchaseDate),
      purchasePriceUsd: nullablePositiveNumber(lot.purchasePriceUsd ?? lot.purchasePrice),
      purchasePriceJpy: nullablePositiveNumber(lot.purchasePriceJpy),
      quantity: nullablePositiveNumber(lot.quantity),
    }))
    .filter((lot) => lot.quantity && (lot.purchasePriceUsd || lot.purchasePriceJpy))
    .sort((a, b) => (a.purchaseDate || "9999-99-99").localeCompare(b.purchaseDate || "9999-99-99"))
    .slice(0, 80);
}

function normalizeCryptoSales(holding = {}) {
  const raw = Array.isArray(holding.sales) ? holding.sales : [];
  return raw
    .map((lot) => ({
      sellDate: normalizeDate(lot.sellDate || lot.saleDate),
      sellPriceUsd: nullablePositiveNumber(lot.sellPriceUsd ?? lot.sellPrice ?? lot.salePrice),
      sellPriceJpy: nullablePositiveNumber(lot.sellPriceJpy),
      quantity: nullablePositiveNumber(lot.quantity),
    }))
    .filter((lot) => lot.quantity && (lot.sellPriceUsd || lot.sellPriceJpy))
    .sort((a, b) => (a.sellDate || "9999-99-99").localeCompare(b.sellDate || "9999-99-99"))
    .slice(0, 80);
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    ...emptyBuyTiming(),
    sma50: null,
    sma200: null,
    volatility: null,
    latestVolume: null,
    averageVolume20: null,
    averageVolume60: null,
    volumeRatio20: null,
    logReturn1d: null,
    histVol20: null,
    atr14: null,
    atrPct: null,
    sma5: null,
    sma5CrossUp: false,
    rsi14: null,
    rsiCross30: false,
    candlestickSignal: null,
    technicalEntry: technicalEntryFallback("価格データが不足しています。"),
    regime: {
      label: "判定待ち",
      stableUptrendPct: null,
      panicPullbackPct: null,
      rangePct: null,
      summary: "価格履歴が不足しています。",
      features: {},
    },
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

function quantile(values = [], ratio = 0.5) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const position = (valid.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return valid[lower];
  return valid[lower] + (valid[upper] - valid[lower]) * (position - lower);
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

function chunkArray(values = [], size = 1) {
  const chunkSize = Math.max(1, size);
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function formatYen(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(value)).toLocaleString("ja-JP")}`;
}

function formatLargeYen(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(2)}兆円`;
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}億円`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ja-JP")}万円`;
  return formatYen(value);
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
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
