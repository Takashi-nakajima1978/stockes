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
  const today = normalizeYmd(options.today) || new Date().toISOString().slice(0, 10);
  const events = normalizeDividendEvents(price);
  const months = recurringEventMonths(events);
  const next = estimateNextEventDate(months, today, events.at(-1)?.date || "");
  const dividendYield = numericValue(price.dividendYield);
  const hasDividend = events.length > 0 || (Number.isFinite(dividendYield) && dividendYield > 0);
  if (!hasDividend) {
    return {
      hasDividend: false,
      score: 0,
      label: "配当材料なし",
      nextDate: "",
      daysToNext: null,
      months,
      summary: "配当イベントは未確認です。",
      criteria: [],
      risks: [],
    };
  }

  const daysToNext = Number.isFinite(next?.daysToNext) ? next.daysToNext : null;
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
    if (daysToNext >= 8 && daysToNext <= 45) {
      score += 8;
      criteria.push("配当の権利取り前");
    } else if (daysToNext > 45 && daysToNext <= 75) {
      score += 4;
      criteria.push("配当権利月が近い");
    } else if (daysToNext >= 0 && daysToNext < 8) {
      score -= 5;
      risks.push("権利落ち直前で短期反落に注意");
    }
  }

  const label = score >= 10 ? "権利取り前" : score > 0 ? "配当確認" : "配当のみ確認";
  const nextText = next?.date ? `次回目安 ${formatYmdShort(next.date)}` : months.length ? `${months.join("・")}月頃` : "次回時期は未推定";
  const summary = `${nextText}。権利取り前は買い需要が入りやすい一方、権利落ち後の反落も確認します。`;
  return {
    hasDividend: true,
    score,
    label,
    nextDate: next?.date || "",
    daysToNext,
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

function estimateNextEventDate(months = [], today = "", latestDate = "") {
  if (!months.length) return null;
  const todayDate = ymdToUtcDate(today);
  if (!todayDate) return null;
  const latest = ymdToUtcDate(latestDate);
  const base = latest && latest.getTime() > todayDate.getTime() ? latest : todayDate;
  const baseYear = base.getUTCFullYear();
  for (let year = baseYear; year <= baseYear + 2; year += 1) {
    for (const month of months) {
      const day = likelyEventDay(year, month);
      const candidate = new Date(Date.UTC(year, month - 1, day));
      const daysToNext = Math.round((candidate.getTime() - todayDate.getTime()) / 86400000);
      if (daysToNext >= 0) return { date: candidate.toISOString().slice(0, 10), daysToNext };
    }
  }
  return null;
}

function likelyEventDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
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
