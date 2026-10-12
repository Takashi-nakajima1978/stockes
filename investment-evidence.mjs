export function splitLearningHistory(items = []) {
  const bySymbol = new Map();
  for (const item of items) {
    if (!item?.symbol || !["hit", "miss"].includes(item.learningOutcome)
      || !Number.isFinite(item.learningHorizonReturnPct) || !Number.isFinite(Date.parse(item.generatedAt))) continue;
    const previous = bySymbol.get(item.symbol);
    if (!previous || item.generatedAt > previous.generatedAt) bySymbol.set(item.symbol, item);
  }
  const ordered = [...bySymbol.values()].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.symbol.localeCompare(b.symbol));
  const cutoff = ordered[Math.floor(ordered.length * 0.7)]?.generatedAt?.slice(0, 10);
  if (!cutoff) return { ordered, training: [], validation: [], purged: 0, cutoff: "" };
  // A label is usable only after its entire outcome window ends. Never split a same-day batch.
  const training = ordered.filter((item) => item.generatedAt.slice(0, 10) < cutoff
    && Number.isFinite(Date.parse(item.learningHorizonEndDate))
    && item.learningHorizonEndDate > item.generatedAt.slice(0, 10) && item.learningHorizonEndDate < cutoff);
  const validation = ordered.filter((item) => item.generatedAt.slice(0, 10) >= cutoff);
  return { ordered, training, validation, cutoff, purged: ordered.length - training.length - validation.length };
}

export function returnEvidence(items = []) {
  const returns = items.map((item) => item.learningHorizonReturnPct).filter(Number.isFinite).sort((a, b) => a - b);
  const net = items.map((item) => item.learningHorizonNetReturnPct).filter(Number.isFinite);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const middle = Math.floor(returns.length / 2);
  return {
    evaluated: returns.length,
    avgReturnPct: mean(returns),
    medianReturnPct: returns.length ? (returns[middle] + returns[Math.floor((returns.length - 1) / 2)]) / 2 : null,
    lossRatePct: returns.length ? returns.filter((value) => value < 0).length / returns.length * 100 : null,
    tailReturnPct: mean(returns.slice(0, Math.ceil(returns.length * 0.1))),
    netEvaluated: net.length,
    avgNetReturnPct: mean(net),
  };
}

export function hasProfitableEvidence(stats = {}) {
  return stats.evaluated > 0 && stats.netEvaluated === stats.evaluated
    && Number.isFinite(stats.avgNetReturnPct) && stats.avgNetReturnPct > 0;
}

export function afterCostReturn(returnPct, feePct = 0, taxPct = 0) {
  const afterFees = returnPct - feePct;
  return afterFees - Math.max(0, afterFees) * taxPct / 100;
}
