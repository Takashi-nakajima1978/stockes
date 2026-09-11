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

function positiveNumber(value) {
  const numeric = numericValue(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function numericValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
