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
