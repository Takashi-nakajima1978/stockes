export function scheduledContribution(schedule = [], month = "", recurring = false) {
  const entries = [...(Array.isArray(schedule) ? schedule : [])]
    .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item?.month) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  const exact = entries.find((item) => item.month === month);
  if (exact) return Number(exact.amount);
  if (!recurring) return 0;
  const prior = entries.filter((item) => item.month <= month).at(-1);
  return prior ? Number(prior.amount) : 0;
}

export function buildSavingsContributionHistory(
  plan = {},
  throughMonth = new Date().toISOString().slice(0, 7),
  currentMonth = throughMonth,
) {
  const schedule = (Array.isArray(plan.schedule) ? plan.schedule : [])
    .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item?.month) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!schedule.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(throughMonth)) {
    return { rows: [], total: 0, monthlyAmount: 0 };
  }

  const first = schedule[0].month.split("-").map(Number);
  const last = throughMonth.split("-").map(Number);
  const startIndex = first[0] * 12 + first[1] - 1;
  const endIndex = last[0] * 12 + last[1] - 1;
  const displayStart = Math.max(startIndex, endIndex - 239);
  const rows = [];
  let total = 0;
  let scheduleIndex = 0;
  let recurringAmount = 0;
  let lastScheduleMonth = "";
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    while (scheduleIndex < schedule.length && schedule[scheduleIndex].month <= key) {
      lastScheduleMonth = schedule[scheduleIndex].month;
      recurringAmount = Number(schedule[scheduleIndex].amount);
      scheduleIndex += 1;
    }
    const amount = lastScheduleMonth === key ? recurringAmount : plan.recurring ? recurringAmount : 0;
    total += amount;
    if (index >= displayStart) rows.push({ month: key, date: `${key}-01`, amount, total });
  }

  return {
    rows,
    total,
    monthlyAmount: scheduledContribution(schedule, currentMonth, Boolean(plan.recurring)),
  };
}

export function buildSavingsValuationHistory(contributionHistory = {}, navSeries = []) {
  const quotes = (Array.isArray(navSeries) ? navSeries : [])
    .map((point) => ({ date: String(point?.date || ""), close: Number(point?.close) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const contributions = (Array.isArray(contributionHistory.rows) ? contributionHistory.rows : [])
    .filter((row) => Number(row.amount) > 0)
    .map((row) => {
      const quote = quotes.find((point) => point.date.startsWith(`${row.month}-`));
      return quote ? { date: quote.date, amount: Number(row.amount), month: row.month } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const unpricedMonths = (Array.isArray(contributionHistory.rows) ? contributionHistory.rows : [])
    .filter((row) => Number(row.amount) > 0 && !quotes.some((point) => point.date.startsWith(`${row.month}-`)))
    .map((row) => row.month);
  if (!quotes.length || !contributions.length) {
    return { rows: [], principalSeries: [], unpricedMonths, totalPrincipal: 0, latestValue: null };
  }

  const rows = [];
  const principalSeries = [];
  let units = 0;
  let principal = 0;
  let contributionIndex = 0;
  for (const quote of quotes) {
    while (contributionIndex < contributions.length && contributions[contributionIndex].date <= quote.date) {
      const contribution = contributions[contributionIndex];
      units += contribution.amount / quote.close;
      principal += contribution.amount;
      contributionIndex += 1;
    }
    if (principal > 0) {
      rows.push({ date: quote.date, value: units * quote.close, nav: quote.close, principal });
      principalSeries.push({ date: quote.date, value: principal });
    }
  }
  const latest = rows.at(-1);
  return {
    rows,
    principalSeries,
    unpricedMonths,
    totalPrincipal: principal,
    latestValue: latest?.value ?? null,
  };
}
