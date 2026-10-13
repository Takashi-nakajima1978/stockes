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

export function buildSavingsValuationHistory(contributionHistory = {}, navSeries = [], plan = {}) {
  const firstMonth = contributionHistory.rows?.[0]?.month;
  const quotes = [...new Map((Array.isArray(navSeries) ? navSeries : [])
    .map((point) => ({ date: String(point?.date || ""), close: Number(point?.close) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.close) && point.close > 0)
    .filter((point) => (!firstMonth || point.date >= `${firstMonth}-01`) && (!plan.today || point.date <= plan.today))
    .map((point) => [point.date, point])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const quoteByMonth = new Map();
  for (const quote of quotes) if (!quoteByMonth.has(quote.date.slice(0, 7))) quoteByMonth.set(quote.date.slice(0, 7), quote);
  const anchorDate = plan.currentValueDate || quotes.at(-1)?.date || "";
  const anchored = plan.balanceBasis !== "opening" && Number(plan.currentValue) > 0;
  const anchorQuote = anchored ? quotes.filter((quote) => quote.date <= anchorDate).at(-1) : null;
  const contributions = (Array.isArray(contributionHistory.rows) ? contributionHistory.rows : [])
    .filter((row) => Number(row.amount) > 0)
    .map((row) => {
      let quote = quoteByMonth.get(row.month);
      // A snapshot excluding its own month's purchase must precede that contribution.
      if (anchored && !plan.currentMonthIncluded && row.month === anchorDate.slice(0, 7) && quote?.date <= anchorDate) {
        quote = quotes.find((point) => point.date > anchorDate && point.date.startsWith(`${row.month}-`));
      }
      return quote ? { date: quote.date, amount: Number(row.amount), units: Number(row.amount) / quote.close, month: row.month } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const unpricedMonths = (Array.isArray(contributionHistory.rows) ? contributionHistory.rows : [])
    .filter((row) => Number(row.amount) > 0 && !contributions.some((point) => point.month === row.month))
    .map((row) => row.month);
  const empty = (status) => ({ rows: [], principalSeries: [], unpricedMonths, totalPrincipal: 0, latestValue: null, status });
  if (!quotes.length) return empty("missing_nav");
  if (anchored && plan.today && anchorDate > plan.today) return empty("future_anchor_date");
  if (anchored && !anchorQuote) return empty("missing_anchor_nav");
  if (anchored && unpricedMonths.some((month) => month <= anchorDate.slice(0, 7))) return empty("missing_contribution_nav");

  const openingSpecified = plan.openingValue !== null && plan.openingValue !== "" && Number.isFinite(Number(plan.openingValue)) && Number(plan.openingValue) >= 0;
  let openingUnits = plan.balanceBasis === "opening" && openingSpecified ? Number(plan.openingValue) / quotes[0].close : 0;
  if (plan.balanceBasis === "opening" && !openingSpecified) return empty("missing_opening_value");
  if (anchored) {
    const purchasedUnits = contributions.filter((item) => item.date <= anchorQuote.date).reduce((sum, item) => sum + item.units, 0);
    openingUnits = Number(plan.currentValue) / anchorQuote.close - purchasedUnits;
    if (openingUnits * anchorQuote.close < -1) return empty("inconsistent_balance");
    openingUnits = Math.max(0, openingUnits);
  }
  if (!contributions.length && !(openingUnits > 0)) return empty("no_holdings");
  const openingValue = openingUnits * quotes[0].close;
  const principalKnown = plan.openingPrincipal !== null && plan.openingPrincipal !== "" && Number.isFinite(Number(plan.openingPrincipal)) && Number(plan.openingPrincipal) >= 0;
  const openingPrincipal = principalKnown ? Number(plan.openingPrincipal) : 0;
  const comparisonBase = principalKnown ? openingPrincipal : openingValue;
  const comparisonLabel = principalKnown ? "投資元本（開始前を含む）" : openingValue > 0 ? "開始時評価額＋積立" : "累計積立元本";

  const rows = [];
  const principalSeries = [];
  let units = openingUnits;
  let principal = 0;
  let contributionIndex = 0;
  for (const quote of quotes) {
    while (contributionIndex < contributions.length && contributions[contributionIndex].date <= quote.date) {
      const contribution = contributions[contributionIndex];
      units += contribution.units;
      principal += contribution.amount;
      contributionIndex += 1;
    }
    if (principal > 0 || openingUnits > 0) {
      rows.push({ date: quote.date, value: units * quote.close, nav: quote.close, principal: comparisonBase + principal });
      principalSeries.push({ date: quote.date, value: comparisonBase + principal });
    }
  }
  const latest = rows.at(-1);
  return {
    rows,
    principalSeries,
    unpricedMonths,
    totalPrincipal: openingPrincipal + principal,
    contributionPrincipal: principal,
    comparisonValue: comparisonBase + principal,
    comparisonLabel,
    openingValue,
    openingPrincipal: principalKnown ? openingPrincipal : null,
    periodChange: latest ? latest.value - openingValue - principal : null,
    totalPnl: principalKnown && latest && !unpricedMonths.length ? latest.value - openingPrincipal - principal : null,
    status: anchored ? "reconstructed" : plan.balanceBasis === "opening" ? "opening" : "contributions",
    anchor: anchored ? { date: anchorDate, navDate: anchorQuote.date, value: Number(plan.currentValue) } : null,
    latestValue: latest?.value ?? null,
  };
}
