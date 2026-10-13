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

export function savingsAccountType(plan = {}) {
  if (plan.provider === "ideco") return "ideco";
  return ["nisa-tsumitate", "nisa-growth", "taxable"].includes(plan.accountType) ? plan.accountType : "unspecified";
}

function validNisaDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function collectNisaStockPurchases(stocks = []) {
  const byDate = new Map();
  let undatedCount = 0;
  for (const stock of stocks) {
    const lots = stock.positions?.length ? stock.positions : [stock];
    for (const lot of lots) {
      if ((lot.accountType || stock.accountType) !== "nisa") continue;
      const amount = Number(lot.purchasePrice) * Number(lot.quantity);
      if (!(Number(lot.purchasePrice) > 0 && Number(lot.quantity) > 0 && Number.isFinite(amount))) continue;
      if (!validNisaDate(lot.purchaseDate)) { undatedCount += 1; continue; }
      if (lot.purchaseDate < "2024-01-01") continue;
      byDate.set(lot.purchaseDate, (byDate.get(lot.purchaseDate) || 0) + amount);
    }
  }
  return { purchases: [...byDate].map(([date, amount]) => ({ date, amount })), undatedCount };
}

export function savingsNisaAllowance(plans = [], context = {}, today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())) {
  const year = Number(today.slice(0, 4));
  const currentMonth = today.slice(0, 7);
  const growthLimit = Number.isFinite(Number(context.growthAnnualLimit)) && context.growthAnnualLimit !== null
    ? Math.max(0, Math.min(2400000, Number(context.growthAnnualLimit))) : 2400000;
  const years = new Map();
  for (const targetYear of [year, year + 1]) {
    const buckets = new Map([["nisa-tsumitate", 1200000], ["nisa-growth", growthLimit]].map(([type, limit]) => [type, {
      limit, planned: 0, used: 0, stockPlanned: 0, stockUsed: 0, providers: new Set(), months: Array(12).fill(0),
    }]));
    const perPlan = new Map();
    for (const plan of plans) {
      const bucket = buckets.get(savingsAccountType(plan));
      if (!bucket) continue;
      let planned = 0;
      const included = plan.currentMonthIncluded && plan.currentValueDate?.slice(0, 7) === currentMonth && plan.currentValueDate <= today;
      for (let index = 0; index < 12; index += 1) {
        const month = `${targetYear}-${String(index + 1).padStart(2, "0")}`;
        const amount = scheduledContribution(plan.schedule, month, Boolean(plan.recurring));
        planned += amount;
        bucket.months[index] += amount;
        if (month < currentMonth || (month === currentMonth && included)) bucket.used += amount;
      }
      perPlan.set(plan.id, planned);
      bucket.planned += planned;
      if (planned > 0) bucket.providers.add(plan.provider);
    }
    const growth = buckets.get("nisa-growth");
    for (const purchase of context.purchases || []) {
      if (!validNisaDate(purchase.date) || Number(purchase.date.slice(0, 4)) !== targetYear || !(Number(purchase.amount) > 0) || !Number.isFinite(Number(purchase.amount))) continue;
      const amount = Number(purchase.amount);
      growth.planned += amount;
      growth.stockPlanned += amount;
      growth.months[Number(purchase.date.slice(5, 7)) - 1] += amount;
      if (purchase.date <= today) { growth.used += amount; growth.stockUsed += amount; }
    }
    for (const bucket of buckets.values()) {
      bucket.pending = bucket.planned - bucket.used;
      bucket.remainingNow = Math.max(0, bucket.limit - bucket.used);
      bucket.remaining = Math.max(0, bucket.limit - bucket.planned);
      bucket.excess = Math.max(0, bucket.planned - bucket.limit);
      let cumulative = 0;
      const firstExcess = bucket.months.findIndex((amount) => { cumulative += amount; return cumulative > bucket.limit; });
      bucket.firstExcessMonth = firstExcess >= 0 ? `${targetYear}-${String(firstExcess + 1).padStart(2, "0")}` : "";
    }
    const providers = new Set([...buckets.values()].flatMap((bucket) => [...bucket.providers]));
    years.set(targetYear, { buckets, perPlan, providerConflict: providers.size > 1 });
  }
  return { year, years, stockDataAvailable: context.available === true, undatedCount: context.undatedCount || 0 };
}

export function buildSavingsTaxComparison(valuation = {}, plan = {}) {
  const accountType = savingsAccountType(plan);
  const complete = !(valuation.unpricedMonths?.length);
  const contributionOnly = valuation.openingValue === 0 && Number.isFinite(valuation.contributionPrincipal);
  const totalKnown = complete && (Number.isFinite(valuation.totalPnl) || contributionOnly);
  const grossGain = totalKnown
    ? Number.isFinite(valuation.totalPnl) ? valuation.totalPnl : valuation.latestValue - valuation.contributionPrincipal
    : valuation.periodChange;
  const baseAmount = totalKnown ? valuation.totalPrincipal : valuation.openingValue + valuation.contributionPrincipal;
  if (!Number.isFinite(valuation.latestValue) || !Number.isFinite(grossGain) || !Number.isFinite(baseAmount)) {
    return { available: false, accountType };
  }
  // A missing acquisition cost permits a period-only comparison, never an actual redemption tax.
  const tax = complete ? Math.max(0, grossGain) * 0.20315 : null;
  const gainPct = baseAmount > 0 ? grossGain / baseAmount * 100 : null;
  return {
    available: true,
    complete,
    accountType,
    basis: totalKnown ? "total" : "period",
    grossGain,
    baseAmount,
    gainPct,
    nisaGain: complete ? grossGain : null,
    taxableGain: complete ? grossGain - tax : null,
    tax,
    taxableGainPct: complete && baseAmount > 0 ? (grossGain - tax) / baseAmount * 100 : null,
    nisaProceeds: totalKnown ? valuation.latestValue : null,
    taxableProceeds: totalKnown ? valuation.latestValue - tax : null,
  };
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
  const snapshotPrincipalKnown = plan.currentPrincipal !== null && plan.currentPrincipal !== undefined && plan.currentPrincipal !== "" && Number.isFinite(Number(plan.currentPrincipal)) && Number(plan.currentPrincipal) >= 0;
  const anchorQuote = anchored || snapshotPrincipalKnown ? quotes.filter((quote) => quote.date <= anchorDate).at(-1) : null;
  const contributions = (Array.isArray(contributionHistory.rows) ? contributionHistory.rows : [])
    .filter((row) => Number(row.amount) > 0)
    .map((row) => {
      let quote = quoteByMonth.get(row.month);
      // A snapshot excluding its own month's purchase must precede that contribution.
      if ((anchored || snapshotPrincipalKnown) && !plan.currentMonthIncluded && row.month === anchorDate.slice(0, 7) && quote?.date <= anchorDate) {
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
  if ((anchored || snapshotPrincipalKnown) && plan.today && anchorDate > plan.today) return empty("future_anchor_date");
  if ((anchored || snapshotPrincipalKnown) && !anchorQuote) return empty("missing_anchor_nav");
  if ((anchored || snapshotPrincipalKnown) && unpricedMonths.some((month) => month <= anchorDate.slice(0, 7))) return empty("missing_contribution_nav");

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
  const enteredOpeningPrincipalKnown = plan.openingPrincipal !== null && plan.openingPrincipal !== undefined && plan.openingPrincipal !== "" && Number.isFinite(Number(plan.openingPrincipal)) && Number(plan.openingPrincipal) >= 0;
  const principalKnown = snapshotPrincipalKnown || enteredOpeningPrincipalKnown;
  const snapshotContributions = snapshotPrincipalKnown ? contributions.filter((item) => item.date <= anchorQuote.date).reduce((sum, item) => sum + item.amount, 0) : 0;
  const openingPrincipal = snapshotPrincipalKnown ? Number(plan.currentPrincipal) - snapshotContributions : enteredOpeningPrincipalKnown ? Number(plan.openingPrincipal) : 0;
  if (openingPrincipal < 0) return empty("inconsistent_principal");
  if (openingPrincipal > 0 && !anchored && plan.balanceBasis !== "opening") return empty("missing_balance");
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
    principalAnchor: snapshotPrincipalKnown ? { date: anchorDate, amount: Number(plan.currentPrincipal), contributions: snapshotContributions } : null,
    principalDifference: snapshotPrincipalKnown && enteredOpeningPrincipalKnown ? openingPrincipal - Number(plan.openingPrincipal) : null,
    periodChange: latest ? latest.value - openingValue - principal : null,
    totalPnl: principalKnown && latest && !unpricedMonths.length ? latest.value - openingPrincipal - principal : null,
    status: anchored ? "reconstructed" : plan.balanceBasis === "opening" ? "opening" : "contributions",
    anchor: anchored ? { date: anchorDate, navDate: anchorQuote.date, value: Number(plan.currentValue) } : null,
    latestValue: latest?.value ?? null,
  };
}
