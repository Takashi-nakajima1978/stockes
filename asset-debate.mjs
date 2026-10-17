const markets = new Set(["us", "crypto", "fx"]);

export function normalizeAssetDebate(value = {}, metadata = {}) {
  const candidateMarket = markets.has(metadata.market) ? metadata.market : "";
  const symbol = String(metadata.symbol || value.symbol || "").trim().toUpperCase().slice(0, 16);
  const validSymbol = candidateMarket === "us"
    ? /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)
    : candidateMarket === "crypto"
      ? symbol === "BTC-JPY"
      : candidateMarket === "fx" && ["USD-JPY", "EUR-JPY"].includes(symbol);
  const market = validSymbol ? candidateMarket : "";
  const list = (items, max = 5) => (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim().slice(0, 320))
    .filter(Boolean)
    .slice(0, max);
  const text = (item, max) => String(item || "").trim().slice(0, max);
  const rawScore = value.debate?.judge?.score;
  const score = rawScore === null || rawScore === undefined || rawScore === "" ? Number.NaN : Number(rawScore);
  const actions = ["強気寄り", "中立", "慎重寄り", "判断保留"];

  return {
    market,
    symbol,
    name: text(metadata.name || value.name, 120),
    generatedAt: text(metadata.generatedAt || value.generatedAt, 40),
    sourceGeneratedAt: text(metadata.sourceGeneratedAt || value.sourceGeneratedAt, 40),
    model: text(metadata.model || value.model, 160),
    evidenceBasis: text(metadata.evidenceBasis || value.evidenceBasis, 500),
    debate: {
      bull: {
        thesis: text(value.debate?.bull?.thesis, 900),
        positives: list(value.debate?.bull?.positives),
        risks: list(value.debate?.bull?.risks),
      },
      bear: {
        thesis: text(value.debate?.bear?.thesis, 900),
        concerns: list(value.debate?.bear?.concerns),
        counterpoints: list(value.debate?.bear?.counterpoints),
      },
      judge: {
        conclusion: actions.includes(value.debate?.judge?.conclusion) ? value.debate.judge.conclusion : "判断保留",
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
        rationale: text(value.debate?.judge?.rationale, 1100),
        priorities: list(value.debate?.judge?.priorities),
        caveat: text(value.debate?.judge?.caveat, 500),
      },
    },
    limitations: list(value.limitations, 6),
  };
}
