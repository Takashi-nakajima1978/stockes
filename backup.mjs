import { readdir, readFile, writeFile, mkdir, rename, rm, stat, lstat, open as openFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const FORMAT = "stock-signal-backup";
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const CONFIG = "backup-config.json";
const STATUS = "backup-status.json";
const JOURNAL = ".restore-journal.json";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOKEN = "https://oauth2.googleapis.com/token";
const eligibleName = (name) => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:json|xls)$/i.test(name) && !/[\r\n]/.test(name);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function japanDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function decodeBackup(bytes) {
  if (bytes.length > MAX_BACKUP_BYTES) throw failure("バックアップファイルが大きすぎます。", 413);
  let document;
  try {
    const raw = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await decompress(bytes, { maxOutputLength: MAX_EXPANDED_BYTES })
      : bytes;
    if (raw.length > MAX_EXPANDED_BYTES) throw new Error("too large");
    document = JSON.parse(raw.toString("utf8"));
  } catch {
    throw failure("バックアップを読み込めません。破損または対応していない形式です。");
  }
  if (document?.format !== FORMAT || document.version !== 1 || !Array.isArray(document.files) || !document.files.length || document.files.length > 200) {
    throw failure("Stock Signalのバックアップファイルを選択してください。");
  }
  const names = new Set();
  let totalBytes = 0;
  const files = document.files.map((file) => {
    if (!eligibleName(file?.name) || names.has(file.name) || typeof file.content !== "string") throw failure("バックアップのファイル一覧が正しくありません。");
    names.add(file.name);
    const bytes = Buffer.from(file.content, "base64");
    totalBytes += bytes.length;
    if (totalBytes > MAX_EXPANDED_BYTES || bytes.length !== file.size || digest(bytes) !== file.sha256) throw failure(`${file.name}の整合性を確認できません。`);
    if (file.name.endsWith(".json")) {
      let value;
      try { value = JSON.parse(bytes.toString("utf8")); } catch { throw failure(`${file.name}が破損しています。`); }
      const listFile = ["watchlist.json", "us-watchlist.json", "savings-plans.json", "excluded-candidates.json"].includes(file.name);
      if (listFile ? !Array.isArray(value) : !value || typeof value !== "object") throw failure(`${file.name}のデータ形式が正しくありません。`);
      if (["settings.json", "crypto-holding.json", CONFIG, STATUS].includes(file.name) && Array.isArray(value)) throw failure(`${file.name}のデータ形式が正しくありません。`);
      if (listFile && value.some((entry) => !entry || typeof entry !== "object" || typeof entry.symbol !== "string" || !entry.symbol || (entry.positions !== undefined && !Array.isArray(entry.positions)) || (entry.sales !== undefined && !Array.isArray(entry.sales)))) throw failure(`${file.name}の銘柄・商品情報が正しくありません。`);
    }
    return { name: file.name, bytes };
  });
  if (!names.has("settings.json")) throw failure("設定データが含まれていません。");
  return { createdAt: String(document.createdAt || ""), files, totalBytes };
}

export function backupSummary(archive) {
  const value = (name) => {
    const file = archive.files.find((entry) => entry.name === name);
    return file ? JSON.parse(file.bytes.toString("utf8")) : null;
  };
  const forecasts = Object.values(value("forecast-history.json")?.instruments || {}).flatMap(records => Array.isArray(records) ? records : []);
  return {
    createdAt: archive.createdAt,
    fileCount: archive.files.length,
    totalBytes: archive.totalBytes,
    japaneseStocks: value("watchlist.json")?.length || 0,
    usStocks: value("us-watchlist.json")?.length || 0,
    savingsPlans: value("savings-plans.json")?.length || 0,
    learningRecords: value("candidate-history.json")?.items?.length || 0,
    forecastRecords: forecasts.length,
    evaluatedForecastRecords: forecasts.filter(record => record?.outcome).length,
    files: archive.files.map(file => file.name).sort(),
  };
}

export function createBackupManager({ store, effectiveSettings = async () => ({}), fetchImpl = fetch, now = () => new Date(), renameFile = rename, nasDirectory = "" }) {
  const root = store.directory;
  const backups = path.join(root, "backups");
  const previews = new Map();
  const authRequests = new Map();
  let uploadTask = null;
  let nasTask = null;
  let restoring = false;
  let timer = null;
  const nasRoot = String(nasDirectory || "").trim();
  const configPath = path.join(root, CONFIG);
  const statusPath = path.join(root, STATUS);
  const readOptional = async (file, fallback) => {
    try { return await store.readJson(file); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return fallback;
    }
  };
  const readConfig = () => readOptional(configPath, { enabled: false, hour: 4, minute: 0, folderName: "Stock Signal Backups", folderId: "", clientId: "", clientSecret: "", refreshToken: "", redirectUri: "" });
  const readStatus = () => readOptional(statusPath, {});
  const saveConfig = (config) => store.write(configPath, JSON.stringify(config, null, 2));
  const saveStatus = (state) => store.write(statusPath, JSON.stringify(state, null, 2));
  function getNasDirectory() {
    if (!nasRoot) throw failure("Ubuntu側でnasneの共有をマウントし、NAS用Compose設定でDockerへ接続してください。設定画面のUbuntu接続設定を確認してください。");
    if (!path.isAbsolute(nasRoot)) throw failure("NASのマウント先は絶対パスで指定してください。", 500);
    return nasRoot;
  }
  async function requireNasDirectory() {
    const directory = getNasDirectory();
    let info;
    try { info = await stat(directory); }
    catch (error) {
      if (error.code === "ENOENT") throw failure("nasneのshare2がマウントされていません。Ubuntuホストの接続を確認してください。");
      throw error;
    }
    if (!info.isDirectory()) throw failure("NASのマウント先がフォルダーではありません。");
    return directory;
  }
  async function inspectNas() {
    if (!nasRoot) return { configured: false, available: false, connectionError: "Ubuntu側で共有をマウントし、設定画面のComposeコマンドでDockerへ接続してください。" };
    try {
      await requireNasDirectory();
      return { configured: true, available: true, connectionError: "" };
    } catch (error) {
      return { configured: true, available: false, connectionError: error.code === "ENOENT" ? "nasneのshare2がマウントされていません。Ubuntuホストの接続を確認してください。" : `NASを確認できません: ${error.message}` };
    }
  }
  const dataFiles = async () => (await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  })).filter((entry) => entry.isFile() && eligibleName(entry.name)).map((entry) => entry.name).sort();

  async function snapshotUnlocked({ validate = true } = {}) {
    const files = await Promise.all((await dataFiles()).map(async (name) => ({ name, bytes: await readFile(path.join(root, name)) })));
    try {
      const settings = { name: "settings.json", bytes: Buffer.from(JSON.stringify(await effectiveSettings(), null, 2)) };
      const index = files.findIndex((file) => file.name === settings.name);
      if (index >= 0) files[index] = settings;
      else files.push(settings);
    } catch (error) { if (validate) throw error; }
    const document = {
      format: FORMAT, version: 1, createdAt: now().toISOString(),
      files: files.map(({ name, bytes }) => ({ name, size: bytes.length, sha256: digest(bytes), content: bytes.toString("base64") })),
    };
    const bytes = await compress(Buffer.from(JSON.stringify(document)));
    if (validate) await decodeBackup(bytes);
    return bytes;
  }

  async function rollback(journal) {
    if (!/^\.restore-[0-9a-f-]+$/.test(journal.stage || "")) throw failure("復元作業の退避先が正しくありません。", 500);
    const stage = path.join(backups, journal.stage);
    const original = path.join(stage, "original");
    const saved = await readdir(original).catch(() => []);
    if (![...(journal.original || []), ...(journal.incoming || []), ...saved].every(eligibleName)) throw failure("復元記録が破損しています。", 500);
    for (const name of journal.incoming || []) {
      if (saved.includes(name) || !journal.original.includes(name)) await rm(path.join(root, name), { force: true });
    }
    for (const name of saved) await renameFile(path.join(original, name), path.join(root, name));
    await rm(path.join(root, JOURNAL), { force: true });
    await rm(stage, { recursive: true, force: true });
    store.invalidate();
  }

  async function requestGoogle(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw failure(`Google Drive接続エラー (${response.status}): ${String(body.error?.message || body.error_description || body.error || "アクセス権・接続設定を確認してください").slice(0, 350)}`, 502);
    }
    return response;
  }

  async function accessToken(config) {
    if (!config.clientId || !config.refreshToken) throw failure("設定でGoogle Driveへの接続を完了してください。");
    const response = await requestGoogle(TOKEN, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret || "", refresh_token: config.refreshToken }) });
    const token = await response.json();
    if (!token.access_token) throw failure("Googleからアクセストークンを取得できません。", 502);
    return token.access_token;
  }

  async function folder(config, token) {
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    if (config.folderId) {
      const metadata = await (await requestGoogle(`${DRIVE}/${encodeURIComponent(config.folderId)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`, { headers })).json();
      if (metadata.trashed || metadata.mimeType !== "application/vnd.google-apps.folder") throw failure("保存先のGoogle Driveフォルダを確認してください。");
      return metadata;
    }
    const query = new URL(DRIVE);
    query.searchParams.set("q", "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='stockSignalBackup' and value='folder-v1' }");
    query.searchParams.set("fields", "files(id,name)");
    const previous = (await (await requestGoogle(query, { headers })).json()).files?.[0];
    const created = previous || await (await requestGoogle(DRIVE, { method: "POST", headers, body: JSON.stringify({ name: config.folderName || "Stock Signal Backups", mimeType: "application/vnd.google-apps.folder", appProperties: { stockSignalBackup: "folder-v1" } }) })).json();
    await saveConfig({ ...(await readConfig()), folderId: created.id });
    return created;
  }

  async function upload(reason) {
    const previous = await readStatus();
    await saveStatus({ ...previous, lastAttempt: now().toISOString(), error: "" });
    try {
      const config = await readConfig();
      const token = await accessToken(config);
      const parent = await folder(config, token);
      const bytes = await store.exclusive(snapshotUnlocked);
      const date = japanDate(now());
      const name = `stock-signal-${date}.json.gz`;
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      const query = new URL(DRIVE);
      query.searchParams.set("q", `'${parent.id}' in parents and trashed = false and appProperties has { key='stockSignalBackupDate' and value='${date}' }`);
      query.searchParams.set("fields", "files(id)");
      const existing = (await (await requestGoogle(query, { headers })).json()).files?.[0];
      const target = new URL(existing ? `${UPLOAD}/${encodeURIComponent(existing.id)}` : UPLOAD);
      target.searchParams.set("uploadType", "resumable");
      target.searchParams.set("fields", "id,name,webViewLink,size");
      target.searchParams.set("supportsAllDrives", "true");
      const metadata = { name, mimeType: "application/gzip", appProperties: { stockSignalBackupDate: date, stockSignalBackup: "v1" }, ...(!existing ? { parents: [parent.id] } : {}) };
      const session = await requestGoogle(target, { method: existing ? "PATCH" : "POST", headers: { ...headers, "x-upload-content-type": "application/gzip", "x-upload-content-length": String(bytes.length) }, body: JSON.stringify(metadata) });
      const location = session.headers.get("location");
      const uploadUrl = location ? new URL(location) : null;
      if (!uploadUrl || uploadUrl.protocol !== "https:" || !["www.googleapis.com", "content.googleapis.com"].includes(uploadUrl.hostname)) throw failure("Googleからアップロード先を取得できません。", 502);
      const uploaded = await (await requestGoogle(uploadUrl, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/gzip", "content-length": String(bytes.length) }, body: bytes })).json();
      if (!uploaded.id) throw failure("Google Driveへの保存を確認できません。", 502);
      const result = { ...(await readStatus()), lastSuccess: now().toISOString(), lastSuccessDate: date, lastFileName: name, lastFileId: uploaded.id, lastFileUrl: uploaded.webViewLink || "", lastSize: bytes.length, reason, error: "" };
      await saveStatus(result);
      return result;
    } catch (error) {
      await saveStatus({ ...(await readStatus()), error: error.message });
      throw error;
    }
  }

  async function saveToNas(reason) {
    const previous = await readStatus();
    await saveStatus({ ...previous, nas: { ...(previous.nas || {}), lastAttempt: now().toISOString(), error: "" } });
    let temporary = "";
    let handle = null;
    try {
      const directory = await requireNasDirectory();
      const bytes = await store.exclusive(snapshotUnlocked);
      const date = japanDate(now());
      const name = `stock-signal-${date}.json.gz`;
      const target = path.join(directory, name);
      temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
      handle = await openFile(temporary, "wx", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      await renameFile(temporary, target);
      const state = await readStatus();
      const result = { ...state, nas: { ...(state.nas || {}), lastSuccess: now().toISOString(), lastSuccessDate: date, lastFileName: name, lastSize: bytes.length, reason, error: "" } };
      await saveStatus(result);
      return result;
    } catch (error) {
      await handle?.close().catch(() => {});
      if (temporary) await rm(temporary, { force: true }).catch(() => {});
      const state = await readStatus();
      await saveStatus({ ...state, nas: { ...(state.nas || {}), error: error.message } });
      throw error;
    }
  }

  async function checkNasWriteAccess() {
    const directory = await requireNasDirectory();
    const probe = path.join(directory, `.stock-signal-check-${randomUUID()}.tmp`);
    try {
      await writeFile(probe, "stock-signal NAS write check", { flag: "wx", mode: 0o600 });
    } finally {
      await rm(probe, { force: true }).catch(() => {});
    }
  }

  async function latestNasBackup() {
    const directory = await requireNasDirectory();
    const files = (await readdir(directory)).filter((name) => /^stock-signal-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name)).sort().reverse();
    if (!files.length) throw failure("nasneにバックアップがありません。先に「今すぐ保存」を実行してください。");
    return { name: files[0], bytes: await readFile(path.join(directory, files[0])) };
  }

  const manager = {
    get restoring() { return restoring; },
    get running() { return Boolean(uploadTask); },
    get nasRunning() { return Boolean(nasTask); },
    async initialize() {
      await mkdir(root, { recursive: true });
      try {
        const journal = JSON.parse(await readFile(path.join(root, JOURNAL), "utf8"));
        await store.exclusive(() => rollback(journal));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },
    async status() {
      const [config, state, names, nas] = await Promise.all([readConfig(), readStatus(), dataFiles(), inspectNas()]);
      const totalBytes = (await Promise.all(names.map(async (name) => (await stat(path.join(root, name))).size))).reduce((sum, size) => sum + size, 0);
      return {
        config: { enabled: Boolean(config.enabled), hour: config.hour ?? 4, minute: config.minute ?? 0, folderId: config.folderId || "", folderName: config.folderName || "Stock Signal Backups", clientId: config.clientId || "", redirectUri: config.redirectUri || "", hasClientSecret: Boolean(config.clientSecret), connected: Boolean(config.refreshToken), nasEnabled: Boolean(config.nasEnabled), nasHour: config.nasHour ?? 4, nasMinute: config.nasMinute ?? 0 },
        state: { ...state, running: Boolean(uploadTask), restoring },
        nas: { ...(state.nas || {}), ...nas, running: Boolean(nasTask) },
        inventory: { fileCount: names.length, totalBytes },
      };
    },
    async configure(patch = {}) {
      const config = await readConfig();
      const next = { ...config };
      if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
      for (const key of ["hour", "minute"]) {
        if (patch[key] !== undefined) {
          const number = Number(patch[key]);
          if (!Number.isInteger(number) || number < 0 || number > (key === "hour" ? 23 : 59)) throw failure("バックアップ時刻を確認してください。");
          next[key] = number;
        }
      }
      for (const key of ["clientId", "folderId", "folderName", "redirectUri"]) if (typeof patch[key] === "string") next[key] = patch[key].trim().slice(0, 2048);
      for (const key of ["clientSecret", "refreshToken"]) if (typeof patch[key] === "string" && patch[key].trim()) next[key] = patch[key].trim().slice(0, 4096);
      if (next.folderId && !/^[A-Za-z0-9_-]+$/.test(next.folderId)) throw failure("Google DriveのフォルダIDを確認してください。");
      if (next.clientId !== config.clientId) {
        next.refreshToken = patch.refreshToken?.trim() || "";
        next.clientSecret = patch.clientSecret?.trim() || "";
      }
      await saveConfig(next);
      return manager.status();
    },
    async configureNas(patch = {}) {
      const config = await readConfig();
      const next = { ...config };
      if (patch.enabled === true && !nasRoot) throw failure("先にUbuntu側でnasneの共有をマウントし、NAS用Compose設定でDockerへ接続してください。");
      if (typeof patch.enabled === "boolean") next.nasEnabled = patch.enabled;
      for (const key of ["hour", "minute"]) {
        if (patch[key] !== undefined) {
          const number = Number(patch[key]);
          if (!Number.isInteger(number) || number < 0 || number > (key === "hour" ? 23 : 59)) throw failure("NASバックアップ時刻を確認してください。");
          next[key === "hour" ? "nasHour" : "nasMinute"] = number;
        }
      }
      await saveConfig(next);
      return manager.status();
    },
    download() { return store.exclusive(snapshotUnlocked); },
    async preview(bytes) {
      const archive = await decodeBackup(bytes);
      for (const [token, entry] of previews) if (entry.expires < now().getTime()) previews.delete(token);
      if (previews.size >= 2) previews.delete(previews.keys().next().value);
      const token = randomBytes(24).toString("hex");
      previews.set(token, { archive, expires: now().getTime() + 15 * 60000 });
      return { token, ...backupSummary(archive) };
    },
    async restore(token) {
      const preview = previews.get(token);
      if (!preview || preview.expires < now().getTime()) throw failure("復元の確認期限が切れました。ファイルを選び直してください。");
      if (restoring || uploadTask || nasTask) throw failure("バックアップ処理中です。完了後に復元してください。", 409);
      restoring = true;
      try {
        const result = await store.exclusive(async () => {
          for (const file of preview.archive.files) {
            const info = await lstat(path.join(root, file.name)).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
            if (info && !info.isFile()) throw failure(`${file.name}の保存先が通常ファイルではありません。`, 409);
          }
          const recovery = `before-restore-${now().toISOString().replace(/[:.]/g, "-")}.json.gz`;
          await mkdir(backups, { recursive: true });
          await writeFile(path.join(backups, recovery), await snapshotUnlocked({ validate: false }), { mode: 0o600 });
          const stageName = `.restore-${randomUUID()}`;
          const stage = path.join(backups, stageName);
          await mkdir(path.join(stage, "original"), { recursive: true });
          await mkdir(path.join(stage, "incoming"));
          for (const file of preview.archive.files) await writeFile(path.join(stage, "incoming", file.name), file.bytes, { mode: 0o600 });
          const journal = { stage: stageName, original: await dataFiles(), incoming: preview.archive.files.map((file) => file.name) };
          await writeFile(path.join(root, JOURNAL), JSON.stringify(journal), { mode: 0o600 });
          try {
            for (const name of journal.original) await renameFile(path.join(root, name), path.join(stage, "original", name));
            for (const name of journal.incoming) await renameFile(path.join(stage, "incoming", name), path.join(root, name));
            await rm(path.join(root, JOURNAL));
          } catch (error) {
            await rollback(journal);
            throw error;
          }
          store.invalidate();
          previews.delete(token);
          await rm(stage, { recursive: true, force: true });
          return { ...backupSummary(preview.archive), recoveryFile: recovery };
        });
        authRequests.clear();
        previews.clear();
        try { await saveStatus({ ...(await readStatus()), lastRestoreAt: now().toISOString(), recoveryFile: result.recoveryFile }); }
        catch { result.warning = "データは復元済みですが、復元記録を保存できませんでした。"; }
        return result;
      } finally { restoring = false; }
    },
    async recovery(name) {
      if (!/^before-restore-[0-9TZ.-]+\.json\.gz$/.test(name)) throw failure("復元前バックアップを選択してください。");
      return readFile(path.join(backups, name));
    },
    async beginAuth(origin) {
      const config = await readConfig();
      if (!config.clientId) throw failure("Google OAuthのクライアントIDを保存してください。");
      const redirect = new URL(config.redirectUri || `${origin}/api/backup/drive/callback`);
      if (redirect.origin !== origin || redirect.pathname !== "/api/backup/drive/callback" || redirect.search || redirect.hash || redirect.username || (redirect.protocol !== "https:" && !(redirect.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname)))) throw failure("このコールバックURLはGoogle OAuthで使用できません。localhostまたはHTTPSから接続し、Google Cloudに画面表示のコールバックURLを登録してください。");
      const state = randomBytes(24).toString("hex");
      const verifier = randomBytes(48).toString("base64url");
      for (const [key, request] of authRequests) if (request.expires < now().getTime()) authRequests.delete(key);
      if (authRequests.size >= 8) authRequests.delete(authRequests.keys().next().value);
      authRequests.set(state, { verifier, redirectUri: redirect.href, clientId: config.clientId, expires: now().getTime() + 10 * 60000 });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: redirect.href, response_type: "code", scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" })) url.searchParams.set(key, value);
      return { url: url.href, state };
    },
    async completeAuth({ state, cookieState, code }) {
      const entry = authRequests.get(state);
      authRequests.delete(state);
      const expected = Buffer.from(state || "");
      const received = Buffer.from(cookieState || "");
      if (!entry || entry.expires < now().getTime() || expected.length !== received.length || !timingSafeEqual(expected, received) || !code) throw failure("Google認証が期限切れか確認できません。設定からもう一度接続してください。");
      const config = await readConfig();
      if (config.clientId !== entry.clientId) throw failure("認証中に接続設定が変更されました。もう一度接続してください。");
      const response = await requestGoogle(TOKEN, { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret || "", code, code_verifier: entry.verifier, redirect_uri: entry.redirectUri, grant_type: "authorization_code" }) });
      const tokens = await response.json();
      if (!tokens.refresh_token) throw failure("日次実行用の認証を取得できません。Google側でアプリのアクセスを解除して再接続してください。");
      await saveConfig({ ...config, refreshToken: tokens.refresh_token });
      return manager.testDrive();
    },
    async disconnect() {
      if (uploadTask) throw failure("アップロード完了後に接続を解除してください。", 409);
      const config = await readConfig();
      await saveConfig({ ...config, enabled: false, refreshToken: "" });
      return manager.status();
    },
    async testDrive() {
      const config = await readConfig();
      const token = await accessToken(config);
      const parent = await folder(config, token);
      await saveStatus({ ...(await readStatus()), lastConnectionCheckAt: now().toISOString(), error: "" });
      return { folderId: parent.id, folderName: parent.name, ...(await manager.status()) };
    },
    upload(reason = "manual") {
      if (restoring) return Promise.reject(failure("復元処理中です。", 409));
      if (nasTask) return Promise.reject(failure("NASバックアップ処理中です。完了後に実行してください。", 409));
      if (!uploadTask) uploadTask = upload(reason).finally(() => { uploadTask = null; });
      return uploadTask;
    },
    async testNas() {
      if (restoring || uploadTask || nasTask) throw failure("バックアップ処理中です。完了後に接続を確認してください。", 409);
      await checkNasWriteAccess();
      const state = await readStatus();
      await saveStatus({ ...state, nas: { ...(state.nas || {}), lastConnectionCheckAt: now().toISOString(), error: "" } });
      return manager.status();
    },
    backupNas(reason = "manual") {
      if (restoring || uploadTask) return Promise.reject(failure("別のバックアップまたは復元処理中です。完了後に実行してください。", 409));
      if (!nasTask) nasTask = saveToNas(reason).finally(() => { nasTask = null; });
      return nasTask;
    },
    async previewNas() {
      if (restoring || uploadTask || nasTask) throw failure("バックアップ処理中です。完了後に復元してください。", 409);
      const backup = await latestNasBackup();
      return { ...await manager.preview(backup.bytes), sourceFileName: backup.name };
    },
    async tick() {
      if (restoring || uploadTask || nasTask) return;
      const config = await readConfig();
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now()).map((part) => [part.type, part.value]));
      const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
      const today = japanDate(now());
      const state = await readStatus();
      let backupError = null;
      const driveRetryReady = !state.lastAttempt || now().getTime() - Date.parse(state.lastAttempt) >= 30 * 60000;
      if (config.enabled && config.refreshToken && minuteOfDay >= Number(config.hour ?? 4) * 60 + Number(config.minute || 0) && state.lastSuccessDate !== today && driveRetryReady) {
        try { await manager.upload("daily"); } catch (error) { backupError = error; }
      }
      const latest = await readStatus();
      const nasState = latest.nas || {};
      const nasRetryReady = !nasState.lastAttempt || now().getTime() - Date.parse(nasState.lastAttempt) >= 30 * 60000;
      if (config.nasEnabled && minuteOfDay >= Number(config.nasHour ?? 4) * 60 + Number(config.nasMinute || 0) && nasState.lastSuccessDate !== today && nasRetryReady) {
        try { await manager.backupNas("daily"); } catch (error) { if (!backupError) backupError = error; }
      }
      if (backupError) throw backupError;
    },
    startSchedule() {
      manager.stopSchedule();
      timer = setInterval(() => { void manager.tick().catch((error) => console.error("日次バックアップ:", error.message)); }, 60000);
      timer.unref?.();
      void manager.tick().catch((error) => console.error("日次バックアップ:", error.message));
    },
    stopSchedule() { if (timer) clearInterval(timer); timer = null; },
  };
  return manager;
}
