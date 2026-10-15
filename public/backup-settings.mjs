export function initializeBackupSettings({ request, toast }) {
  const root = document.getElementById("backupSettings");
  if (!root) return;
  const node = (id) => document.getElementById(id);
  const field = (name) => root.querySelector(`[data-drive-field="${name}"]`);
  let loaded = false;
  let previewToken = "";
  let busy = false;
  let polling = false;
  const callbackPath = "/api/backup/drive/callback";
  const date = (value) => value ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "まだありません";
  const size = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;
  const isLoopback = (hostname) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
  const isPrivateIpv4 = (hostname) => {
    const parts = hostname.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  };

  function explainOAuthCallback() {
    const hint = node("driveOAuthHint");
    hint.replaceChildren();
    const origin = new URL(location.origin);
    const callback = `${location.origin}${callbackPath}`;
    if (origin.protocol === "http:" && !isLoopback(origin.hostname)) {
      hint.append("現在はLAN内HTTPで開いているため、Google認証には使えません。");
      if (isPrivateIpv4(origin.hostname)) {
        const localUrl = `http://localhost:${origin.port || "80"}/`;
        const link = document.createElement("a");
        link.href = localUrl;
        link.textContent = "同じ端末でlocalhostを開く";
        link.target = "_blank";
        link.rel = "noreferrer";
        hint.append("同じ端末のブラウザーなら ", link, " を開き直し、設定→バックアップから接続してください。別端末から使う場合はHTTPSが必要です。");
      } else {
        hint.append("同じ端末でlocalhostを開くか、HTTPSでアクセスしてください。");
      }
    } else {
      hint.append("Google Cloud Consoleの認可済みリダイレクトURIに次を完全一致で登録してください: ");
      const code = document.createElement("code");
      code.textContent = callback;
      hint.append(code);
    }
  }

  function configuredCallback(value) {
    const current = new URL(location.origin);
    const fallback = `${location.origin}${callbackPath}`;
    if (!value) return fallback;
    try {
      const saved = new URL(value);
      const canUseLocalCallback = current.protocol === "https:" || (current.protocol === "http:" && isLoopback(current.hostname));
      if (canUseLocalCallback && saved.origin !== current.origin && saved.pathname === callbackPath && !saved.search && !saved.hash) return fallback;
    } catch {}
    return value;
  }

  function render(payload, applyConfig = false) {
    const { config = {}, state = {}, inventory = {} } = payload;
    if (!loaded || applyConfig) {
      field("enabled").checked = config.enabled === true;
      field("time").value = `${String(config.hour ?? 4).padStart(2, "0")}:${String(config.minute ?? 0).padStart(2, "0")}`;
      for (const key of ["folderName", "folderId", "clientId", "redirectUri"]) field(key).value = config[key] || "";
      field("redirectUri").value = configuredCallback(field("redirectUri").value);
      field("clientSecret").value = "";
      field("refreshToken").value = "";
      field("clientSecret").placeholder = config.hasClientSecret ? "保存済み。変更時だけ入力" : "Google OAuth クライアントのシークレット";
      loaded = true;
    }
    explainOAuthCallback();
    node("backupInventory").textContent = `${Number(inventory.fileCount || 0)}ファイル / ${size(inventory.totalBytes)}`;
    node("driveConnectionStatus").textContent = config.connected ? "接続済み" : "未接続";
    node("driveBackupStatus").textContent = state.running ? "Google Driveに保存中…" : state.error ? state.error : `最終保存: ${date(state.lastSuccess)}`;
    node("driveBackupDetail").textContent = state.lastFileName ? `${state.lastFileName} / ${size(state.lastSize)}` : "";
    const fileLink = node("driveBackupFile");
    fileLink.hidden = !/^https:\/\/(?:drive|docs)\.google\.com\//.test(state.lastFileUrl || "");
    if (!fileLink.hidden) fileLink.href = state.lastFileUrl;
    const recovery = node("backupRecovery");
    recovery.hidden = !state.recoveryFile;
    if (!recovery.hidden) recovery.href = `/api/backup/recovery?name=${encodeURIComponent(state.recoveryFile)}`;
    for (const action of ["upload", "test", "disconnect"]) root.querySelector(`[data-backup-action="${action}"]`).disabled = !config.connected || state.running || busy;
    if (state.running) void poll();
  }

  async function load(applyConfig = false) {
    render(await request("/api/backup/status"), applyConfig);
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const payload = await request("/api/backup/status");
        render(payload);
        if (!payload.state?.running) return;
      }
    } catch (error) { node("driveBackupStatus").textContent = error.message; }
    finally { polling = false; }
  }

  async function save() {
    const [hour, minute] = field("time").value.split(":").map(Number);
    const config = { enabled: field("enabled").checked, hour, minute };
    for (const name of ["folderName", "folderId", "clientId", "clientSecret", "redirectUri", "refreshToken"]) config[name] = field(name).value;
    const payload = await request("/api/backup/drive/settings", { method: "PATCH", body: JSON.stringify(config) });
    render(payload, true);
    return payload;
  }

  async function download() {
    node("backupLocalStatus").textContent = "全データをまとめています…";
    const response = await fetch("/api/backup/download");
    if (!response.ok) throw new Error((await response.json()).error || "バックアップを作成できません。");
    const bytes = await response.blob();
    const link = document.createElement("a");
    const url = URL.createObjectURL(bytes);
    link.href = url;
    link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "stock-signal-backup.json.gz";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    node("backupLocalStatus").textContent = `バックアップを作成しました (${size(bytes.size)})。`;
  }

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-backup-action]");
    if (!button || busy) return;
    const action = button.dataset.backupAction;
    if (action === "select") { node("backupFile").click(); return; }
    const popup = action === "connect" ? window.open("about:blank", "stock-signal-drive-auth", "width=650,height=750") : null;
    let failed = false;
    busy = true;
    button.disabled = true;
    try {
      if (action === "download") await download();
      else if (action === "save") { await save(); toast("バックアップ設定を保存しました。"); }
      else if (action === "connect") {
        await save();
        const auth = await request("/api/backup/drive/auth", { method: "POST" });
        if (popup) popup.location = auth.url;
        else location.assign(auth.url);
      } else if (action === "disconnect") render(await request("/api/backup/drive/disconnect", { method: "POST" }), true);
      else if (action === "test") {
        const payload = await request("/api/backup/drive/test", { method: "POST" });
        render(payload, true);
        toast(`接続OK: ${payload.folderName}`);
      } else if (action === "upload") render(await request("/api/backup/drive/run", { method: "POST" }));
    } catch (error) {
      failed = true;
      popup?.close();
      (action === "download" ? node("backupLocalStatus") : node("driveBackupStatus")).textContent = error.message;
      toast(error.message);
    } finally {
      busy = false;
      button.disabled = false;
      if (loaded && !failed) void load().catch(() => {});
    }
  });

  node("backupFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (busy) return;
    busy = true;
    previewToken = "";
    node("backupLocalStatus").textContent = "バックアップの内容を検証しています…";
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("バックアップファイルは64 MB以下を選択してください。");
      const result = await request("/api/backup/preview", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      previewToken = result.token;
      node("backupRestoreSummary").textContent = `${date(result.createdAt)}の保存データ。日本株 ${result.japaneseStocks}銘柄、米国株 ${result.usStocks}銘柄、積立 ${result.savingsPlans}商品、候補の学習記録 ${result.learningRecords}件、保存済み予測 ${result.forecastRecords ?? 0}件（実績照合済み ${result.evaluatedForecastRecords ?? 0}件）。全${result.fileCount}ファイル (${size(result.totalBytes)})。`;
      node("backupRestoreStatus").textContent = "";
      node("backupLocalStatus").textContent = "バックアップの内容を確認しました。";
      node("backupRestoreDialog").showModal();
    } catch (error) { node("backupLocalStatus").textContent = error.message; }
    finally { busy = false; event.target.value = ""; }
  });
  node("backupRestoreCancel").addEventListener("click", () => { previewToken = ""; node("backupRestoreDialog").close(); });
  node("backupRestoreConfirm").addEventListener("click", async () => {
    if (!previewToken || busy) return;
    busy = true;
    node("backupRestoreConfirm").disabled = true;
    node("backupRestoreCancel").disabled = true;
    node("backupRestoreStatus").textContent = "現在のデータを退避して復元しています…";
    try {
      await request("/api/backup/restore", { method: "POST", body: JSON.stringify({ token: previewToken, confirm: true }) });
      location.reload();
    } catch (error) { node("backupRestoreStatus").textContent = error.message; }
    finally { busy = false; node("backupRestoreConfirm").disabled = false; node("backupRestoreCancel").disabled = false; }
  });
  document.querySelector('[data-settings-tab="backup"]')?.addEventListener("click", () => { void load().catch((error) => { node("backupLocalStatus").textContent = error.message; }); });
  window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.data?.type === "stock-signal-drive-connected") {
      void load(true).then(() => toast("Google Driveに接続しました。")).catch((error) => toast(error.message));
    }
  });
}
