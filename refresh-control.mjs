export function createSingleFlight() {
  const pending = new Map();
  return function run(key, task) {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(task).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}

// Long-running research must not replace a more recently fetched price.
export function preserveNewerPrices(rows, savedRows) {
  const saved = new Map(savedRows.map((row) => [row.symbol, row]));
  return rows.map((row) => {
    const previous = saved.get(row.symbol);
    if (!(Date.parse(previous?.price?.fetchedAt) > (Date.parse(row.price?.fetchedAt) || 0))) return row;
    return { ...row, price: previous.price, position: previous.position, exitPlan: previous.exitPlan,
      refreshedPriceOnlyAt: previous.refreshedPriceOnlyAt };
  });
}

export function isBuyReversalPending(price = {}) {
  const entry = price?.technicalEntry || {};
  if (entry.ready === true) return false;

  const current = positiveNumber(price.current);
  const buyLine = positiveNumber(entry.buyLine) || positiveNumber(price.buyLine1y);
  if (!current || !buyLine || current > buyLine * 1.03) return false;

  const entryScore = numericValue(entry.score);
  const rsi = numericValue(price.rsi14);
  const return1m = numericValue(price.return1m);
  const pullback = numericValue(price.regime?.panicPullbackPct);

  return (Number.isFinite(entryScore) && entryScore >= 55)
    || (Number.isFinite(rsi) && rsi <= 35)
    || (Number.isFinite(return1m) && return1m <= -6)
    || (Number.isFinite(pullback) && pullback >= 40);
}

export function dividendEventSeasonality(price = {}, options = {}) {
  const today = normalizeYmd(options.today) || todayYmdJapan();
  const events = normalizeDividendEvents(price);
  const months = recurringEventMonths(events);
  const scheduledDate = normalizeYmd(price.dividendNextDate);
  const estimated = estimateNextEventDate(months, today, events.at(-1)?.date || "", events);
  const next = scheduledDate && scheduledDate >= today
    ? { date: scheduledDate, daysToNext: daysBetween(today, scheduledDate) }
    : estimated;
  const frequencyPerYear = inferDividendFrequency(events, today);
  const frequencyLabel = frequencyPerYear === 2
    ? "中間配当あり（過去実績から推定・年2回）"
    : frequencyPerYear === 4
    ? "年4回配当（過去実績から推定）"
    : frequencyPerYear === 1
    ? "年1回配当（過去実績から推定）"
    : "配当回数未確認";
  const nextAmount = next
    ? estimateNextDividendAmount(events, next.date, price, frequencyPerYear)
    : null;
  const nextDateSource = scheduledDate && scheduledDate >= today
    ? price.dividendNextDateSource === "過去実績から推定" ? "過去実績から推定" : "データ取得済み予定"
    : estimated ? "過去実績から推定" : "未確認";
  const dividendYield = numericValue(price.dividendYield);
  const hasDividend = events.length > 0
    || (Number.isFinite(dividendYield) && dividendYield > 0)
    || Boolean(positiveNumber(price.dividendPerShareAnnual ?? price.dividendPerShareForward))
    || Boolean(scheduledDate && scheduledDate >= today);
  if (!hasDividend) {
    return {
      hasDividend: false,
      score: 0,
      label: "配当材料なし",
      nextDate: "",
      daysToNext: null,
      nextAmount: null,
      nextDateSource: "未確認",
      frequencyPerYear: null,
      frequencyLabel: "配当回数未確認",
      buyCaution: false,
      months,
      summary: "配当イベントは未確認です。",
      criteria: [],
      risks: [],
    };
  }

  const daysToNext = Number.isFinite(next?.daysToNext) ? next.daysToNext : null;
  const buyCaution = Number.isFinite(daysToNext) && daysToNext >= 0 && daysToNext <= 14;
  let score = 0;
  const criteria = [];
  const risks = [];

  if (Number.isFinite(dividendYield)) {
    if (dividendYield >= 4) {
      score += 4;
      criteria.push(`配当利回り${dividendYield.toFixed(1)}%`);
    } else if (dividendYield >= 3) {
      score += 2;
      criteria.push(`配当利回り${dividendYield.toFixed(1)}%`);
    }
  }

  if (Number.isFinite(daysToNext)) {
    if (buyCaution) {
      score -= 8;
      criteria.push("配当落ち後に買い場を再計算");
      risks.push("配当落ちが近いため新規買いは待ち、配当落ち後の価格を確認");
    } else if (daysToNext >= 15 && daysToNext <= 45) {
      score += 8;
      criteria.push("配当の権利取り前");
    } else if (daysToNext > 45 && daysToNext <= 75) {
      score += 4;
      criteria.push("配当権利月が近い");
    }
  }

  const label = buyCaution
    ? "配当落ち後まで購入待ち"
    : score >= 10 ? "権利取り前" : score > 0 ? "配当確認" : "配当のみ確認";
  const nextText = next?.date
    ? `次回${nextDateSource === "データ取得済み予定" ? "取得予定" : "予想"} ${formatYmdShort(next.date)}`
    : months.length ? `${months.join("・")}月頃` : "次回時期は未推定";
  const summary = buyCaution
    ? `${nextText}（${daysToNext}日後）。配当落ち前の新規買いは待ち、配当落ち後に実際の株価と買い場ラインを確認します。`
    : `${nextText}。配当は参考情報として扱い、権利落ち後の価格と買い場を確認します。`;
  return {
    hasDividend: true,
    score,
    label,
    nextDate: next?.date || "",
    daysToNext,
    nextAmount,
    nextDateSource,
    frequencyPerYear,
    frequencyLabel,
    buyCaution,
    months,
    summary,
    criteria,
    risks,
  };
}

function positiveNumber(value) {
  const numeric = numericValue(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function numericValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDividendEvents(price = {}) {
  const events = Array.isArray(price?.dividendEvents) ? price.dividendEvents : [];
  const normalized = events
    .map((item) => ({
      date: normalizeYmd(item?.date),
      amount: numericValue(item?.amount),
    }))
    .filter((item) => item.date && (!Number.isFinite(item.amount) || item.amount > 0))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!normalized.length && normalizeYmd(price?.dividendLastDate)) {
    normalized.push({
      date: normalizeYmd(price.dividendLastDate),
      amount: numericValue(price.dividendLastAmount),
    });
  }
  return normalized;
}

function recurringEventMonths(events = []) {
  const counts = new Map();
  for (const event of events.slice(-12)) {
    const month = Number(event.date.slice(5, 7));
    if (month >= 1 && month <= 12) counts.set(month, (counts.get(month) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 4)
    .map(([month]) => month)
    .sort((a, b) => a - b);
}

function estimateNextEventDate(months = [], today = "", latestDate = "", events = []) {
  if (!months.length) return null;
  const todayDate = ymdToUtcDate(today);
  if (!todayDate) return null;
  const latest = ymdToUtcDate(latestDate);
  const base = latest && latest.getTime() > todayDate.getTime() ? latest : todayDate;
  const baseYear = base.getUTCFullYear();
  for (let year = baseYear; year <= baseYear + 2; year += 1) {
    for (const month of months) {
      const day = likelyEventDay(year, month, events);
      const candidate = new Date(Date.UTC(year, month - 1, day));
      const daysToNext = Math.round((candidate.getTime() - todayDate.getTime()) / 86400000);
      if (daysToNext >= 0) return { date: candidate.toISOString().slice(0, 10), daysToNext };
    }
  }
  return null;
}

function inferDividendFrequency(events = [], today = "") {
  const todayDate = ymdToUtcDate(today);
  if (!todayDate) return null;
  const cutoff = todayDate.getTime() - (550 * 86400000);
  const dates = events
    .map((event) => ymdToUtcDate(event.date))
    .filter((date) => date && date.getTime() >= cutoff && date.getTime() <= todayDate.getTime())
    .sort((a, b) => a - b);
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((date, index) => (date.getTime() - dates[index].getTime()) / 86400000);
  const medianGap = medianValue(gaps);
  if (medianGap >= 70 && medianGap <= 115) return 4;
  if (medianGap > 115 && medianGap <= 245) return 2;
  if (medianGap > 245 && medianGap <= 550) return 1;
  return null;
}

function estimateNextDividendAmount(events = [], nextDate = "", price = {}, frequencyPerYear = null) {
  const month = normalizeYmd(nextDate).slice(5, 7);
  const sameMonth = events
    .filter((event) => event.date.slice(5, 7) === month && Number.isFinite(event.amount) && event.amount > 0)
    .slice(-3)
    .map((event) => event.amount);
  if (sameMonth.length) return Math.round(medianValue(sameMonth) * 100) / 100;
  const annual = positiveNumber(price.dividendPerShareForward ?? price.dividendPerShareAnnual);
  if (annual && frequencyPerYear) return Math.round((annual / frequencyPerYear) * 100) / 100;
  return null;
}

function medianValue(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function daysBetween(from = "", to = "") {
  const fromDate = ymdToUtcDate(from);
  const toDate = ymdToUtcDate(to);
  if (!fromDate || !toDate) return null;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function likelyEventDay(year, month, events = []) {
  const monthEvents = events
    .filter((event) => Number(event.date.slice(5, 7)) === month)
    .slice(-4)
    .map((event) => Number(event.date.slice(8, 10)))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);
  const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return monthEvents.length ? Math.min(monthEnd, Math.round(medianValue(monthEvents))) : monthEnd;
}

function todayYmdJapan() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeYmd(value = "") {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function ymdToUtcDate(value = "") {
  const ymd = normalizeYmd(value);
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYmdShort(value = "") {
  const ymd = normalizeYmd(value);
  if (!ymd) return "";
  const [, month, day] = ymd.split("-");
  return `${Number(month)}/${Number(day)}`;
}
