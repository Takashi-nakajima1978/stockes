import { createSerialQueue } from "./data-store.mjs";

const FILE = "dividend-history.json";
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

function normalizedEvents(value = []) {
  const byDate = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    const date = String(item?.date || "").slice(0, 10);
    const amount = Number(item?.amount);
    if (validDate(date) && Number.isFinite(amount) && amount > 0) byDate.set(date, { date, amount });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function createDividendHistory(store, now = () => new Date()) {
  const serial = createSerialQueue();
  return {
    merge(market, symbol, price = {}) {
      const normalizedMarket = String(market || "").trim().toLowerCase();
      const normalizedSymbol = String(symbol || "").trim().toUpperCase();
      if (!["jp", "us"].includes(normalizedMarket) || !/^[A-Z0-9.^=-]{1,20}$/.test(normalizedSymbol)) {
        return Promise.resolve(price);
      }

      return serial(async () => {
        let history;
        try {
          history = await store.readJson(FILE);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          history = { version: 1, updatedAt: "", instruments: {} };
        }
        if (history.version !== 1 || !history.instruments || typeof history.instruments !== "object" || Array.isArray(history.instruments)) {
          throw new Error("保存済み配当履歴の形式を確認できません。既存データは変更していません。");
        }

        const key = `${normalizedMarket}:${normalizedSymbol}`;
        const previous = normalizedEvents(history.instruments[key]);
        const incoming = normalizedEvents(price.dividendEvents);
        const combined = new Map(previous.map((event) => [event.date, event]));
        for (const event of incoming) combined.set(event.date, event);
        const events = [...combined.values()].sort((a, b) => a.date.localeCompare(b.date));
        const changed = events.length !== previous.length
          || events.some((event, index) => event.amount !== previous[index]?.amount);

        if (changed) {
          history.instruments[key] = events;
          history.updatedAt = now().toISOString();
          await store.write(FILE, JSON.stringify(history, null, 2));
        }

        const latest = events.at(-1);
        return {
          ...price,
          dividendEvents: events,
          ...(latest && (!price.dividendLastDate || latest.date > price.dividendLastDate)
            ? { dividendLastDate: latest.date, dividendLastAmount: latest.amount }
            : {}),
        };
      });
    },
  };
}
