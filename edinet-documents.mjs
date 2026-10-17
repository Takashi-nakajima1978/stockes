const DAY = 86400000;
const CACHE = "edinet-directory.json";
const reportTypes = new Set(["120", "130", "140", "150", "160", "170"]);

export function normalizeEdinetDocument(doc = {}) {
  if (!/^[A-Z0-9]{8}$/.test(doc.docID || "")) return null;
  const pick = key => String(doc[key] || "").slice(0, key === "docDescription" ? 200 : 80);
  return Object.fromEntries(["docID", "edinetCode", "secCode", "docTypeCode", "docDescription", "submitDateTime", "periodStart", "periodEnd", "parentDocID", "xbrlFlag", "withdrawalStatus", "disclosureStatus", "docInfoEditStatus", "legalStatus"].map(key => [key, pick(key)]));
}

export function isFinancialEdinetDocument(doc = {}) {
  return reportTypes.has(doc.docTypeCode) && doc.xbrlFlag === "1" && !["1", "2"].includes(doc.withdrawalStatus) && !["1", "2"].includes(doc.disclosureStatus) && doc.legalStatus !== "0";
}

export function selectEdinetDocuments(documents, symbols) {
  const byId = new Map();
  for (const doc of [...documents].sort((a, b) => a.submitDateTime.localeCompare(b.submitDateTime))) byId.set(doc.docID, doc);
  const withdrawn = new Set(documents.filter(doc => doc.withdrawalStatus === "1").map(doc => doc.parentDocID));
  const bySymbol = new Map();
  for (const symbol of symbols) {
    const reports = [...byId.values()].map(doc => {
      const parent = byId.get(doc.parentDocID);
      return { ...doc, periodStart: doc.periodStart || parent?.periodStart || "", periodEnd: doc.periodEnd || parent?.periodEnd || "", secCode: doc.secCode || parent?.secCode || "" };
    }).filter(doc => doc.secCode.slice(0, 4) === symbol.replace(/\.T$/, "") && !withdrawn.has(doc.docID) && isFinancialEdinetDocument(doc));
    // Select by reporting period first: a late correction of an old year is not the newest result.
    reports.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.submitDateTime.localeCompare(a.submitDateTime) || b.docTypeCode.localeCompare(a.docTypeCode));
    const annual = reports.find(doc => ["120", "130"].includes(doc.docTypeCode));
    const interims = reports.filter(doc => ["140", "150", "160", "170"].includes(doc.docTypeCode));
    const interim = interims.find(doc => !annual || doc.submitDateTime > annual.submitDateTime) || interims[0];
    const previousInterim = interim && interims.find(doc => doc.periodEnd < interim.periodEnd);
    const correction = reports.filter(doc => ["130", "150", "170"].includes(doc.docTypeCode)).sort((a, b) => b.submitDateTime.localeCompare(a.submitDateTime))[0];
    const selected = [...new Map([annual, interim, previousInterim, correction].filter(Boolean).map(doc => [doc.docID, doc])).values()];
    if (selected.length) bySymbol.set(symbol, selected);
  }
  return bySymbol;
}

// One shared directory fetch per process; disk cache also survives service restarts.
export function createEdinetDirectory({ store, fetchDay, now = () => new Date(), lookbackDays = 400 }) {
  let running;
  return () => {
    if (running) return running;
    running = load().finally(() => { running = null; });
    return running;
  };
  async function load() {
    let saved;
    try { saved = await store.readJson(CACHE); }
    catch (error) { if (error.code !== "ENOENT") throw error; saved = {}; }
    const days = {};
    const warnings = [];
    const time = now();
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(time);
    let consecutiveFailures = 0;
    for (let offset = 0; offset < lookbackDays; offset++) {
      const day = new Date(Date.parse(today) - offset * DAY).toISOString().slice(0, 10);
      const cached = saved.days?.[day];
      const age = time.getTime() - Date.parse(cached?.fetchedAt || "");
      // A filing's disclosure date is immutable; corrections and withdrawals arrive as new dated records.
      // Recheck only today's still-open index, while retaining historical date buckets across restarts.
      if (Array.isArray(cached?.documents) && (offset > 0 || (age >= 0 && age < 30 * 60000))) {
        days[day] = cached;
        continue;
      }
      try {
        const documents = (await fetchDay(day)).map(normalizeEdinetDocument).filter(Boolean);
        days[day] = { fetchedAt: time.toISOString(), documents: documents.filter(doc => reportTypes.has(doc.docTypeCode) || doc.withdrawalStatus === "1" || ["1", "2", "3"].includes(doc.disclosureStatus)) };
        consecutiveFailures = 0;
      } catch (error) {
        if ([401, 403, 429].includes(error.status)) throw error;
        if (cached) days[day] = cached;
        warnings.push(`${day}: EDINET一覧の更新に失敗`);
        if (++consecutiveFailures >= 3) throw new Error("EDINET一覧の取得に連続失敗。保存済み財務データを維持します");
      }
    }
    await store.write(CACHE, JSON.stringify({ days }));
    return { documents: Object.values(days).flatMap(entry => entry.documents), warnings };
  }
}
