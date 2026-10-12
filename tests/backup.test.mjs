import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { createBackupManager, decodeBackup, japanDate } from "../backup.mjs";
import { createDataStore, createSerialQueue } from "../data-store.mjs";
import { createVersionedLoader, createCachedJsonSender } from "../response-cache.mjs";

async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stock-backup-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createDataStore(dir);
  await store.write("settings.json", JSON.stringify({ unitBudget: 300000, googleApiKey: "test-secret" }));
  await store.write("watchlist.json", JSON.stringify([{ symbol: "9005.T", positions: [{ quantity: 10, purchasePrice: 100 }], sales: [{ quantity: 5, sellPrice: 90 }] }]));
  await store.write("us-watchlist.json", "[]");
  await store.write("savings-plans.json", JSON.stringify([{ id: "fund-1", symbol: "9I31223A", schedule: [{ month: "2026-03", amount: 5000 }] }]));
  await store.write("candidate-history.json", JSON.stringify({ items: [{ symbol: "9005.T", outcome: "loss" }] }));
  const manager = createBackupManager({ store, effectiveSettings: () => store.readJson("settings.json"), ...options });
  await manager.initialize();
  return { dir, store, manager };
}

test("data writes remain complete under concurrency and cached values are isolated", async (t) => {
  const { store, dir } = await fixture(t);
  const writes = Array.from({ length: 20 }, (_, index) => store.write("cache.json", JSON.stringify({ index, text: "value".repeat(1000) })));
  await Promise.all(writes);
  const first = await store.readJson("cache.json");
  assert.equal(first.index, 19);
  first.index = -1;
  assert.equal((await store.readJson("cache.json")).index, 19);
  await assert.rejects(store.readJson("../settings.json"), /Invalid data path/);
  assert.equal((await readdir(dir)).some((name) => name.endsWith(".tmp")), false);
  const serial = createSerialQueue();
  await store.write("counter.json", "{\"count\":0}");
  await Promise.all(Array.from({ length: 10 }, () => serial(async () => {
    const value = await store.readJson("counter.json");
    value.count += 1;
    await store.write("counter.json", JSON.stringify(value));
  })));
  assert.equal((await store.readJson("counter.json")).count, 10);
});

test("versioned responses share work, invalidate on writes and retry failed builds", async (t) => {
  const { store, dir } = await fixture(t);
  const cache = createVersionedLoader();
  let builds = 0;
  const files = [path.join(dir, "settings.json")];
  const build = async () => { builds++; return store.readJson("settings.json"); };
  const [first, second] = await Promise.all([cache.load("settings", files, build), cache.load("settings", files, build)]);
  assert.equal(builds, 1);
  assert.equal(first, second);
  await store.write("settings.json", "{\"unitBudget\":500000}");
  assert.equal((await cache.load("settings", files, build)).unitBudget, 500000);
  assert.equal(builds, 2);
  await assert.rejects(cache.load("failure", files, () => { throw Error("offline"); }), /offline/);
  assert.equal(await cache.load("failure", files, () => 42), 42);
  const send = createCachedJsonSender();
  const payload = { text: "price".repeat(1000) };
  const response = () => ({ shouldGzip: true, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } });
  const a = response(); const b = response();
  await Promise.all([send(a, 200, payload), send(b, 200, payload)]);
  assert.equal(a.body, b.body);
  assert.deepEqual(JSON.parse(gunzipSync(a.body)), payload);
});

test("full backups preserve transactions, secrets, binary files and can replace the data set", async (t) => {
  const { manager, store, dir } = await fixture(t);
  await store.write("jpx-listed-companies.xls", Buffer.from([0, 1, 2, 254, 255]));
  await mkdir(path.join(dir, "backups"));
  await writeFile(path.join(dir, "backups", "old.json.gz"), "not included");
  const bytes = await manager.download();
  const archive = await decodeBackup(bytes);
  assert.equal(archive.files.length, 6);
  assert.equal(JSON.parse(archive.files.find((file) => file.name === "settings.json").bytes).googleApiKey, "test-secret");
  const preview = await manager.preview(bytes);
  assert.equal(preview.japaneseStocks, 1);
  assert.equal(preview.savingsPlans, 1);
  assert.equal(preview.learningRecords, 1);
  await store.write("watchlist.json", "[]");
  await store.write("extra-cache.json", "{\"extra\":true}");
  const result = await manager.restore(preview.token);
  assert.equal((await store.readJson("watchlist.json"))[0].sales[0].sellPrice, 90);
  assert.deepEqual(await readFile(path.join(dir, "jpx-listed-companies.xls")), Buffer.from([0, 1, 2, 254, 255]));
  await assert.rejects(readFile(path.join(dir, "extra-cache.json")), { code: "ENOENT" });
  const before = await decodeBackup(await manager.recovery(result.recoveryFile));
  assert.deepEqual(JSON.parse(before.files.find((file) => file.name === "watchlist.json").bytes), []);
  assert.equal((await manager.status()).state.recoveryFile, result.recoveryFile);
  await assert.rejects(manager.restore(preview.token), /確認期限/);
});

test("invalid archives never change data and a corrupt current file can still be restored", async (t) => {
  const { manager, store } = await fixture(t);
  const valid = await manager.download();
  const document = JSON.parse(gunzipSync(valid));
  document.files[0].sha256 = "0".repeat(64);
  await assert.rejects(manager.preview(Buffer.from(JSON.stringify(document))), /整合性/);
  document.files[0].name = "../settings.json";
  await assert.rejects(manager.preview(Buffer.from(JSON.stringify(document))), /ファイル一覧/);
  assert.equal((await store.readJson("watchlist.json")).length, 1);
  const preview = await manager.preview(valid);
  await store.write("settings.json", "{broken");
  const result = await manager.restore(preview.token);
  assert.equal((await store.readJson("settings.json")).unitBudget, 300000);
  const recovery = JSON.parse(gunzipSync(await manager.recovery(result.recoveryFile)));
  assert.equal(Buffer.from(recovery.files.find((file) => file.name === "settings.json").content, "base64").toString(), "{broken");
});

test("startup rolls back an interrupted restore without losing originals not moved yet", async (t) => {
  const { store, dir } = await fixture(t);
  const stage = ".restore-11111111-1111-4111-8111-111111111111";
  const original = path.join(dir, "backups", stage, "original");
  await mkdir(original, { recursive: true });
  await rename(path.join(dir, "watchlist.json"), path.join(original, "watchlist.json"));
  await writeFile(path.join(dir, "watchlist.json"), "[]");
  await writeFile(path.join(dir, "new-cache.json"), "{}");
  await writeFile(path.join(dir, ".restore-journal.json"), JSON.stringify({ stage, original: ["watchlist.json", "settings.json"], incoming: ["watchlist.json", "settings.json", "new-cache.json"] }));
  const manager = createBackupManager({ store });
  await manager.initialize();
  assert.equal((await store.readJson("watchlist.json")).length, 1);
  assert.equal((await store.readJson("settings.json")).googleApiKey, "test-secret");
  await assert.rejects(readFile(path.join(dir, "new-cache.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(dir, ".restore-journal.json")), { code: "ENOENT" });
});

test("a failure halfway through restore rolls all data files back", async (t) => {
  let fail = false;
  const { manager, store, dir } = await fixture(t, { renameFile: async (from, to) => {
    if (fail && from.includes(`${path.sep}incoming${path.sep}`) && from.endsWith("watchlist.json")) {
      fail = false;
      throw Error("simulated disk error");
    }
    return rename(from, to);
  } });
  const preview = await manager.preview(await manager.download());
  await store.write("watchlist.json", "[]");
  await store.write("extra-cache.json", "{\"keep\":true}");
  fail = true;
  await assert.rejects(manager.restore(preview.token), /simulated disk error/);
  assert.deepEqual(await store.readJson("watchlist.json"), []);
  assert.equal((await store.readJson("extra-cache.json")).keep, true);
  assert.equal((await store.readJson("settings.json")).googleApiKey, "test-secret");
  await assert.rejects(readFile(path.join(dir, ".restore-journal.json")), { code: "ENOENT" });
  assert.equal(manager.restoring, false);
});

function googleMock() {
  const calls = [];
  let tokenFailure = false;
  let uploaded = null;
  let exists = false;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url: url.href, ...options });
    const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (url.hostname === "oauth2.googleapis.com") return tokenFailure ? json({ error: "invalid_grant" }, 400) : json({ access_token: "access-test", refresh_token: "refresh-test" });
    if (url.pathname === "/upload-session") {
      uploaded = Buffer.from(options.body);
      exists = true;
      return json({ id: "file-test", webViewLink: "https://drive.google.com/file/d/file-test/view" });
    }
    if (url.pathname.startsWith("/upload/drive/")) return json({}, 200, { location: "https://www.googleapis.com/upload-session" });
    if (url.pathname === "/drive/v3/files/folder-test") return json({ id: "folder-test", name: "Backups", mimeType: "application/vnd.google-apps.folder" });
    if (url.searchParams.get("q")?.includes("folder-v1")) return json({ files: [] });
    if (url.searchParams.get("q")) return json({ files: exists ? [{ id: "file-test" }] : [] });
    if (options.method === "POST") return json({ id: "folder-test", name: "Stock Signal Backups" });
    throw Error(`Unexpected mock request ${url}`);
  };
  return { fetchImpl, calls, failToken(value) { tokenFailure = value; }, get uploaded() { return uploaded; } };
}

test("daily Drive uploads run once per Japan day and retry failures after 30 minutes", async (t) => {
  const google = googleMock();
  let time = new Date("2026-10-11T18:59:00Z");
  const { manager, store } = await fixture(t, { fetchImpl: google.fetchImpl, now: () => time });
  await manager.configure({ enabled: true, clientId: "client-test", clientSecret: "secret-test", refreshToken: "refresh-test", hour: 4, minute: 0 });
  await manager.tick();
  assert.equal(google.calls.length, 0);
  time = new Date("2026-10-11T19:00:00Z");
  assert.equal(japanDate(time), "2026-10-12");
  await manager.tick();
  const status = await manager.status();
  assert.equal(status.state.lastFileName, "stock-signal-2026-10-12.json.gz");
  assert.equal(status.state.lastSuccessDate, "2026-10-12");
  assert.equal(JSON.stringify(status).includes("refresh-test"), false);
  assert.equal(JSON.stringify(status).includes("secret-test"), false);
  assert.ok((await decodeBackup(google.uploaded)).files.some((file) => file.name === "backup-config.json"));
  const count = google.calls.length;
  await manager.tick();
  assert.equal(google.calls.length, count);
  time = new Date("2026-10-12T19:00:00Z");
  google.failToken(true);
  await assert.rejects(manager.tick(), /Google Drive接続エラー/);
  assert.equal((await manager.status()).state.lastSuccessDate, "2026-10-12");
  const failedCount = google.calls.length;
  time = new Date("2026-10-12T19:10:00Z");
  await manager.tick();
  assert.equal(google.calls.length, failedCount);
  time = new Date("2026-10-12T19:31:00Z");
  google.failToken(false);
  await manager.tick();
  assert.equal((await manager.status()).state.lastSuccessDate, "2026-10-13");
  const restart = createBackupManager({ store, fetchImpl: google.fetchImpl, now: () => time });
  const beforeRestart = google.calls.length;
  await restart.tick();
  assert.equal(google.calls.length, beforeRestart);
  await manager.upload();
  assert.ok(google.calls.some((call) => call.method === "PATCH" && call.url.includes("/file-test")));
});

test("OAuth requires a matching callback, PKCE and cookie state; secrets stay on the server", async (t) => {
  const google = googleMock();
  const { manager } = await fixture(t, { fetchImpl: google.fetchImpl });
  await manager.configure({ clientId: "client-test", clientSecret: "secret-test" });
  await assert.rejects(manager.beginAuth("http://192.168.1.10:5173"), /localhostまたはHTTPS/);
  const invalid = await manager.beginAuth("http://localhost:5173");
  await assert.rejects(manager.completeAuth({ state: invalid.state, cookieState: "invalid", code: "code-test" }), /認証が期限切れ/);
  assert.equal(google.calls.length, 0);
  const auth = await manager.beginAuth("http://localhost:5173");
  const url = new URL(auth.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file");
  const result = await manager.completeAuth({ state: auth.state, cookieState: auth.state, code: "code-test" });
  assert.equal(result.config.connected, true);
  const exchange = google.calls[0].body;
  assert.equal(createHash("sha256").update(exchange.get("code_verifier")).digest("base64url"), url.searchParams.get("code_challenge"));
  await manager.configure({ clientSecret: "" });
  assert.equal((await manager.status()).config.hasClientSecret, true);
  await assert.rejects(manager.configure({ hour: -1 }), /時刻/);
  await manager.disconnect();
  assert.equal((await manager.status()).config.connected, false);
});

test("empty watchlists stay empty and unreadable lists are not replaced by defaults", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  for (const [name, label] of [["readWatchlist", "Watchlist"], ["readUsWatchlist", "UsWatchlist"]]) {
    const start = source.indexOf(`async function ${name}(`);
    const block = source.slice(start, source.indexOf("\n}", start) + 2);
    let writes = 0;
    const globals = { existsSync: () => true, readDataJson: async () => [], WATCHLIST_PATH: "jp", US_WATCHLIST_PATH: "us", MAX_MANAGED_STOCKS: 50, MAX_US_STOCKS: 40, normalizeStock: (value) => value, normalizeUsStock: (value) => value, defaultWatchlist: [{ symbol: "default" }], defaultUsWatchlist: [{ symbol: "default" }], saveWatchlist: async () => writes++, saveUsWatchlist: async () => writes++ };
    const load = vm.runInNewContext(`${block}; ${name}`, globals);
    assert.equal((await load()).length, 0, label);
    globals.readDataJson = async () => { throw Error("invalid JSON"); };
    await assert.rejects(load(), /元のデータを保全/);
    assert.equal(writes, 0);
  }
});

test("displaying exit plans does not change persistence; analysis refresh still saves them", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function attachExitPlansToAnalyses(");
  const block = source.slice(start, source.indexOf("\n}", start) + 2);
  let saves = 0;
  const attach = vm.runInNewContext(`${block}; attachExitPlansToAnalyses`, {
    defaultSettings: {}, readExitState: async () => ({ items: [] }), buildExitPlan: () => ({ highWaterPrice: 100 }),
    mergeExitState: (state) => state, saveExitState: async () => { saves++; },
  });
  const rows = [{ symbol: "9005.T" }];
  const displayed = await attach(rows, {}, { persist: false });
  assert.equal(displayed[0].exitPlan.highWaterPrice, 100);
  assert.equal(saves, 0);
  await attach(rows, {});
  assert.equal(saves, 1);
});

test("learning history merges concurrent snapshots and keeps evaluated results", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function saveCandidateHistory(");
  const block = source.slice(start, source.indexOf("\n}", start) + 2);
  const hit = { id: "a", symbol: "9005.T", generatedAt: "2026-10-01", evaluatedAt: "2026-10-10", outcome: "hit", outcomeReason: "10% reached", learningOutcome: "hit", entryPrice: 100 };
  let history = { items: [hit] };
  const save = vm.runInNewContext(`${block}; saveCandidateHistory`, {
    serializeCandidateHistory: createSerialQueue(), readCandidateHistory: async () => structuredClone(history),
    normalizeCandidateHistoryItem: (value) => value, CANDIDATE_HISTORY_PATH: "history.json",
    writeDataFile: async (_file, content) => { history = JSON.parse(content); },
  });
  await Promise.all([
    save({ items: [{ ...hit, outcome: "pending", evaluatedAt: "", entryPrice: 101 }] }),
    save({ items: [{ id: "b", symbol: "7203.T", generatedAt: "2026-10-11", evaluatedAt: "", outcome: "pending", learningOutcome: "pending", entryPrice: 50 }] }),
  ]);
  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].outcome, "hit");
  assert.equal(history.items[0].entryPrice, 100);
  await save({ items: [{ ...hit, evaluatedAt: "2026-10-12", outcome: "pending", outcomeReason: "no price data" }] });
  assert.equal(history.items[0].outcome, "hit");
  assert.equal(history.items[0].outcomeReason, "10% reached");
});
