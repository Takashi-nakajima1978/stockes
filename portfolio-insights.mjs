const DAY_MS = 86400000;
const FORECAST_VERSION = "decision-weekly-calibrated-v1";
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

function mondayOf(date) {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time)) return "";
  const day = new Date(time).getUTCDay();
  return new Date(time - ((day + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

function weeklyCloses(series = []) {
  const byWeek = new Map();
  for (const point of series) {
    const date = String(point?.date || "").slice(0, 10);
    const close = Number(point?.close);
    if (!validDate(date) || !positive(close)) continue;
    const week = mondayOf(date);
    const prior = byWeek.get(week);
    if (!prior || date > prior.date) byWeek.set(week, { date, close });
  }
  return new Map([...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-157)
    .map(([week, point]) => [week, point.close]));
}

function weeklyReturns(series = []) {
  const closes = [...weeklyCloses(series).entries()];
  const returns = new Map();
  for (let i = 1; i < closes.length; i += 1) {
    const [week, close] = closes[i];
    const [previousWeek, previous] = closes[i - 1];
    if ((Date.parse(`${week}T00:00:00Z`) - Date.parse(`${previousWeek}T00:00:00Z`)) > 10 * DAY_MS) continue;
    returns.set(week, Math.log(close / previous));
  }
  return returns;
}

function mean(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function variance(values = [], center = mean(values)) {
  if (!values.length || !finite(center)) return null;
  return values.reduce((sum, value) => sum + ((value - center) ** 2), 0) / values.length;
}

function pearson(left = [], right = []) {
  if (left.length < 20 || left.length !== right.length) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const leftVariance = variance(left, leftMean);
  const rightVariance = variance(right, rightMean);
  if (!(leftVariance > 0) || !(rightVariance > 0)) return null;
  const covariance = left.reduce((sum, value, index) => sum + ((value - leftMean) * (right[index] - rightMean)), 0) / left.length;
  return clamp(covariance / Math.sqrt(leftVariance * rightVariance), -1, 1);
}

function betaAgainst(returns = new Map(), fxReturns = new Map()) {
  const weeks = [...returns.keys()].filter((week) => fxReturns.has(week));
  if (weeks.length < 26) return { beta: null, observations: weeks.length };
  const stock = weeks.map((week) => returns.get(week));
  const fx = weeks.map((week) => fxReturns.get(week));
  const fxVariance = variance(fx);
  if (!(fxVariance > 0)) return { beta: null, observations: weeks.length };
  const stockMean = mean(stock);
  const fxMean = mean(fx);
  const covariance = stock.reduce((sum, value, index) => sum + ((value - stockMean) * (fx[index] - fxMean)), 0) / stock.length;
  return { beta: clamp(covariance / fxVariance, -5, 5), observations: weeks.length };
}

function quantile(values = [], probability = 0.5) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function boundedAllocation(candidates = [], cash = 0, cap = 0.35) {
  const eligible = candidates.filter((item) => item.score >= 45);
  if (!eligible.length || !(cash > 0)) return { items: [], unallocated: Math.round(cash) };
  const weights = eligible.map((item) => Math.max(1, item.score - 30));
  const allocations = eligible.map(() => 0);
  let remaining = cash;
  let open = eligible.map((_, index) => index);
  while (remaining > 0.5 && open.length) {
    const totalWeight = open.reduce((sum, index) => sum + weights[index], 0);
    const capped = [];
    for (const index of open) {
      const desired = remaining * weights[index] / totalWeight;
      const room = cash * cap - allocations[index];
      if (desired >= room - 0.5) capped.push(index);
    }
    if (!capped.length) {
      for (const index of open) allocations[index] += remaining * weights[index] / totalWeight;
      remaining = 0;
      break;
    }
    for (const index of capped) {
      const room = Math.max(0, cash * cap - allocations[index]);
      allocations[index] += room;
      remaining -= room;
    }
    open = open.filter((index) => !capped.includes(index));
  }
  const roundedAllocations = eligible.map((item, index) => ({
    ...item,
    amount: Math.floor(allocations[index] / 1000) * 1000,
  })).filter((item) => item.amount > 0).sort((a, b) => b.score - a.score);
  return {
    items: roundedAllocations,
    unallocated: Math.max(0, Math.round(cash - roundedAllocations.reduce((sum, item) => sum + item.amount, 0))),
  };
}

export function buildPortfolioRiskAnalysis(input = {}) {
  const fxRate = positive(input.usdJpyRate) ? input.usdJpyRate : null;
  const fxTarget = positive(input.usdJpyTarget) ? clamp(input.usdJpyTarget, 70, 250) : 140;
  const equityShockPct = clamp(Number(input.equityShockPct) || 0, -80, 50);
  const cashAmount = clamp(Number(input.additionalCashYen) || 0, 0, 100_000_000);
  const fxMovePct = fxRate ? ((fxTarget / fxRate) - 1) * 100 : null;
  const fxReturns = weeklyReturns(input.usdJpySeries || []);
  const sourceHoldings = (input.holdings || []).filter((item) => positive(item.quantity) && positive(item.currentPrice));
  const holdings = sourceHoldings.map((item) => {
    const currency = item.market === "us" ? "USD" : "JPY";
    const marketValue = item.market === "us"
      ? item.currentPrice * item.quantity * (fxRate || 0)
      : item.currentPrice * item.quantity;
    const localReturns = weeklyReturns(item.series || []);
    const fxBeta = item.market === "jp" ? betaAgainst(localReturns, fxReturns) : { beta: 1, observations: fxReturns.size };
    return {
      symbol: String(item.symbol || "").slice(0, 20),
      name: String(item.name || item.symbol || "").slice(0, 80),
      market: item.market === "us" ? "us" : "jp",
      sector: String(item.sector || "その他").slice(0, 60),
      currency,
      currentPrice: item.currentPrice,
      quantity: item.quantity,
      marketValue: positive(marketValue) ? marketValue : null,
      annualDividendPerShare: positive(item.annualDividendPerShare) ? item.annualDividendPerShare : null,
      overseasSalesRatio: finite(item.overseasSalesRatio) ? clamp(item.overseasSalesRatio, 0, 100) : null,
      returns: localReturns,
      fxBeta: fxBeta.beta,
      fxObservations: fxBeta.observations,
    };
  }).filter((item) => positive(item.marketValue));
  const totalValue = holdings.reduce((sum, item) => sum + item.marketValue, 0);
  const fxAwareReturns = holdings.map((item) => {
    if (item.market === "jp") return item.returns;
    const combined = new Map(item.returns);
    for (const [week, fxReturn] of fxReturns) {
      if (combined.has(week)) combined.set(week, combined.get(week) + fxReturn);
    }
    for (const week of [...combined.keys()]) if (!fxReturns.has(week)) combined.delete(week);
    return combined;
  });
  const eligibleIndices = holdings.map((item, index) => fxAwareReturns[index].size >= 52 ? index : -1).filter((index) => index >= 0);
  const alignedWeeks = eligibleIndices.length
    ? [...fxAwareReturns[eligibleIndices[0]].keys()].filter((week) => eligibleIndices.every((index) => fxAwareReturns[index].has(week)))
    : [];
  const historyWeights = eligibleIndices.map((index) => holdings[index].marketValue / Math.max(1, eligibleIndices.reduce((sum, eligibleIndex) => sum + holdings[eligibleIndex].marketValue, 0)));
  const portfolioReturns = alignedWeeks.map((week) => eligibleIndices.reduce((sum, index, weightIndex) => (
    sum + (historyWeights[weightIndex] * (Math.exp(fxAwareReturns[index].get(week)) - 1))
  ), 0));
  const meanReturn = mean(portfolioReturns);
  const weeklyVariance = variance(portfolioReturns, meanReturn);
  let wealth = 1;
  let peak = 1;
  let maxDrawdownPct = 0;
  for (const value of portfolioReturns) {
    wealth *= 1 + value;
    peak = Math.max(peak, wealth);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((wealth / peak) - 1) * 100);
  }
  const tail = portfolioReturns.length ? portfolioReturns.filter((value) => value <= quantile(portfolioReturns, 0.05)) : [];
  const symbolWeights = holdings.map((item) => ({
    symbol: item.symbol, name: item.name, value: item.marketValue,
    weightPct: totalValue ? (item.marketValue / totalValue) * 100 : null,
  }));
  const sectorValues = new Map();
  holdings.forEach((item) => sectorValues.set(item.sector, (sectorValues.get(item.sector) || 0) + item.marketValue));
  const sectors = [...sectorValues.entries()].map(([sector, value]) => ({ sector, value, weightPct: totalValue ? (value / totalValue) * 100 : null }))
    .sort((a, b) => b.value - a.value);
  const correlations = [];
  for (let left = 0; left < eligibleIndices.length; left += 1) {
    for (let right = left + 1; right < eligibleIndices.length; right += 1) {
      const a = eligibleIndices[left];
      const b = eligibleIndices[right];
      const weeks = alignedWeeks.filter((week) => fxAwareReturns[a].has(week) && fxAwareReturns[b].has(week));
      const correlation = pearson(weeks.map((week) => fxAwareReturns[a].get(week)), weeks.map((week) => fxAwareReturns[b].get(week)));
      if (finite(correlation)) correlations.push({ left: holdings[a].symbol, right: holdings[b].symbol, correlation, observations: weeks.length });
    }
  }
  const fxCoverage = holdings.filter((item) => item.market === "us" || finite(item.fxBeta))
    .reduce((sum, item) => sum + item.marketValue, 0);
  const stressRows = holdings.map((item) => {
    const fxImpactPct = fxMovePct === null ? null : item.market === "us"
      ? fxMovePct
      : finite(item.fxBeta) ? item.fxBeta * fxMovePct : null;
    const totalImpactPct = fxImpactPct === null
      ? equityShockPct
      : (((1 + equityShockPct / 100) * (1 + fxImpactPct / 100)) - 1) * 100;
    return {
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      marketValue: item.marketValue,
      weightPct: totalValue ? (item.marketValue / totalValue) * 100 : null,
      fxBeta: item.market === "us" ? 1 : item.fxBeta,
      fxObservations: item.fxObservations,
      fxImpactPct,
      scenarioImpactPct: totalImpactPct,
      scenarioChangeYen: item.marketValue * totalImpactPct / 100,
      overseasSalesRatio: item.overseasSalesRatio,
    };
  });
  const stressChangeYen = stressRows.reduce((sum, item) => sum + item.scenarioChangeYen, 0);
  const rebalanceCandidates = holdings.map((item, index) => {
    const priceHistory = weeklyCloses(sourceHoldings.find((source) => source.symbol === item.symbol)?.series || []);
    const priceValues = [...priceHistory.values()];
    const trailing = priceValues.slice(-53);
    const minimum = trailing.length ? Math.min(...trailing) : null;
    const maximum = trailing.length ? Math.max(...trailing) : null;
    const chartPositionPct = minimum !== null && maximum > minimum
      ? clamp(((item.currentPrice - minimum) / (maximum - minimum)) * 100, 0, 100)
      : null;
    const momentumPct = priceValues.length >= 14 ? ((priceValues.at(-1) / priceValues.at(-14)) - 1) * 100 : null;
    const annualYieldPct = item.annualDividendPerShare ? (item.annualDividendPerShare / item.currentPrice) * 100 : null;
    const otherCorrelations = correlations.filter((pair) => pair.left === item.symbol || pair.right === item.symbol).map((pair) => pair.correlation);
    const averageCorrelation = mean(otherCorrelations);
    const currentWeight = totalValue ? (item.marketValue / totalValue) * 100 : 0;
    const dividendScore = annualYieldPct === null ? 35 : clamp(annualYieldPct / 6 * 100, 0, 100);
    const diversificationScore = averageCorrelation === null ? 50 : clamp(50 - averageCorrelation * 50, 0, 100);
    const trendScore = momentumPct === null ? 50 : clamp(50 + clamp(momentumPct, -25, 25) * 2, 0, 100);
    const positionScore = chartPositionPct === null ? 50 : clamp(100 - Math.abs(chartPositionPct - 40) * 1.2, 0, 100);
    const concentrationScore = clamp(100 - currentWeight * 2, 0, 100);
    const score = Math.round(dividendScore * 0.2 + diversificationScore * 0.3 + trendScore * 0.2 + positionScore * 0.1 + concentrationScore * 0.2);
    return {
      symbol: item.symbol, name: item.name, sector: item.sector, score,
      currentWeightPct: currentWeight, annualYieldPct, averageCorrelation,
      momentum3mPct: momentumPct, chartPosition52wPct: chartPositionPct,
      scoreBreakdown: { dividend: Math.round(dividendScore), diversification: Math.round(diversificationScore), trend: Math.round(trendScore), chart: Math.round(positionScore), concentration: Math.round(concentrationScore) },
      reason: score < 45 ? "評価項目の総合点が基準未満のため、今回は現金待機" : "配当・分散・直近推移・52週位置・保有集中度の参考スコア",
      returns: item.returns,
      value: item.marketValue,
    };
  }).sort((a, b) => b.score - a.score);
  const allocation = boundedAllocation(rebalanceCandidates, cashAmount);
  return {
    generatedAt: new Date().toISOString(),
    holdingsCount: holdings.length,
    totalValueYen: totalValue,
    currentUsdJpy: fxRate,
    scenario: { usdJpyTarget: fxTarget, fxMovePct, equityShockPct },
    stress: {
      estimatedChangeYen: stressChangeYen,
      estimatedValueYen: totalValue + stressChangeYen,
      coveragePct: totalValue ? (fxCoverage / totalValue) * 100 : 0,
      coverageValueYen: fxCoverage,
      items: stressRows.sort((a, b) => a.scenarioChangeYen - b.scenarioChangeYen),
      caveat: "日本株の為替感応度は週次の過去相関から推定。因果効果ではなく、業績・市場環境を分離できません。履歴不足の為替影響は未推定です。",
    },
    concentration: {
      topHoldings: [...symbolWeights].sort((a, b) => b.value - a.value).slice(0, 5),
      sectors,
      hhi: symbolWeights.reduce((sum, item) => sum + ((item.weightPct || 0) / 100) ** 2, 0),
    },
    correlation: {
      observations: alignedWeeks.length,
      coverageCount: eligibleIndices.length,
      annualizedVolatilityPct: weeklyVariance === null ? null : Math.sqrt(weeklyVariance * 52) * 100,
      historicalVaR95Pct: quantile(portfolioReturns, 0.05) === null ? null : -quantile(portfolioReturns, 0.05) * 100,
      historicalExpectedShortfall95Pct: tail.length ? -mean(tail) * 100 : null,
      maxDrawdownPct,
      topPairs: correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 8),
      excludedSymbols: holdings.filter((item, index) => fxAwareReturns[index].size < 52).map((item) => item.symbol),
    },
    rebalancing: {
      cashYen: cashAmount,
      unallocatedYen: allocation.unallocated,
      items: allocation.items.map(({ returns, value, ...item }) => item),
      candidates: rebalanceCandidates.map(({ returns, value, ...item }) => item),
      method: "候補は現在の保有株に限定。過去相関30%、配当20%、3カ月トレンド20%、52週位置10%、集中度20%。最大1銘柄35%。期待収益の予測ではありません。",
    },
    limitations: [
      "株価・為替の過去週次データによる参考試算です。外部ショック時の連鎖を因果的に特定するものではありません。",
      "日本株の海外売上比率は補助情報として表示し、為替効果の直接換算には使っていません。企業の通貨ヘッジ・仕入・負債通貨を取得できないためです。",
      "配当・分散・チャート指標の配分スコアは期待利益や最適配分の保証ではありません。手数料・税・売買単位を考慮していません。",
    ],
  };
}

export function collectIndependentForecasts(history = {}, asOf = new Date()) {
  const today = asOf instanceof Date ? asOf.toISOString().slice(0, 10) : String(asOf).slice(0, 10);
  const records = [];
  for (const [key, items] of Object.entries(history?.instruments || {})) {
    if (!Array.isArray(items)) continue;
    const [market, symbol] = key.split(":");
    const eligible = items.filter((item) => item?.version === FORECAST_VERSION
      && validDate(item.issuedDate) && item.issuedDate <= today
      && validDate(item.targetDate) && item.targetDate < today
      && validDate(item.outcome?.date) && item.outcome.date < today
      && positive(item.originPrice) && positive(item.outcome?.price))
      .sort((a, b) => a.issuedDate.localeCompare(b.issuedDate));
    let lastTarget = "";
    for (const item of eligible) {
      if (lastTarget && item.issuedDate <= lastTarget) continue;
      lastTarget = item.targetDate;
      records.push({
        market, symbol, issuedDate: item.issuedDate, targetDate: item.targetDate,
        originPrice: item.originPrice, predicted: item.predicted, low: item.low, high: item.high,
        outcome: item.outcome,
        realizedReturnPct: ((item.outcome.price / item.originPrice) - 1) * 100,
        errorPct: finite(item.outcome.errorPct) ? item.outcome.errorPct : null,
        baselineErrorPct: finite(item.outcome.baselineErrorPct) ? item.outcome.baselineErrorPct : null,
        directionCorrect: item.outcome.directionCorrect === true,
        covered: item.outcome.covered === true,
        context: item.context || {},
      });
    }
  }
  return records.sort((a, b) => a.issuedDate.localeCompare(b.issuedDate) || a.symbol.localeCompare(b.symbol));
}

function summary(records = []) {
  const finiteMean = (field) => mean(records.map((item) => item[field]).filter(finite));
  return {
    evaluated: records.length,
    meanAbsoluteErrorPct: finiteMean("errorPct"),
    baselineErrorPct: finiteMean("baselineErrorPct"),
    directionAccuracyPct: records.length ? records.filter((item) => item.directionCorrect).length / records.length * 100 : null,
    intervalCoveragePct: records.length ? records.filter((item) => item.covered).length / records.length * 100 : null,
    meanRealizedReturnPct: finiteMean("realizedReturnPct"),
  };
}

function groupedSummary(records = [], keyOf, minimum = 3) {
  const groups = new Map();
  records.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([key, items]) => ({ key, ...summary(items) }))
    .filter((item) => item.evaluated >= minimum)
    .sort((a, b) => b.evaluated - a.evaluated).slice(0, 12);
}

export function buildForecastReflection(history = {}, months = 3, asOf = new Date()) {
  const period = months === 6 ? 6 : 3;
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  const cutoff = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - period, date.getUTCDate())).toISOString().slice(0, 10);
  const all = collectIndependentForecasts(history, date);
  // Judge the requested window by when a forecast became verifiable, not when it was issued.
  const records = all.filter((item) => item.outcome.date >= cutoff);
  const actionRecords = records.filter((item) => ["BUY", "SELL", "HOLD", "WATCH"].includes(item.context?.action));
  const actions = groupedSummary(actionRecords, (item) => item.context.action).map((group) => {
    const scored = actionRecords.filter((item) => item.context.action === group.key)
      .map((item) => actionHit(item.context.action, item.realizedReturnPct)).filter((value) => value !== null);
    return {
      ...group,
      recommendationHitRatePct: scored.length ? scored.filter(Boolean).length / scored.length * 100 : null,
      recommendationEvaluated: scored.length,
    };
  });
  const sectors = groupedSummary(records.filter((item) => item.context?.sector && item.context.sector !== "不明"), (item) => `${item.market} / ${item.context.sector}`);
  const markets = groupedSummary(records, (item) => item.market, 1);
  return {
    asOf: date.toISOString(), periodMonths: period,
    overall: summary(records), markets, actions, sectors,
    independentRecords: records.slice(-48).map((item) => ({
      market: item.market, symbol: item.symbol, sector: item.context?.sector || "",
      action: item.context?.action || "", issuedDate: item.issuedDate,
      targetDate: item.targetDate, returnPct: item.realizedReturnPct,
      errorPct: item.errorPct, baselineErrorPct: item.baselineErrorPct,
      confidence: item.context?.confidence ?? null,
    })),
    note: records.length < 8
      ? `期間内に実績確定した独立予測が${records.length}件しかなく、AIの傾向分析は保留します。`
      : "同一銘柄の重複期間を除いた実績です。業種・判断別の少数標本は傾向として断定しません。",
  };
}

function actionHit(action, realizedReturnPct) {
  if (action === "BUY") return realizedReturnPct > 0;
  if (action === "SELL") return realizedReturnPct < 0;
  return null;
}

export function buildValidatedConfidenceCalibration(history = {}, asOf = new Date()) {
  const records = collectIndependentForecasts(history, asOf)
    .filter((item) => item.context?.sector && item.context.sector !== "不明");
  const eligible = records.filter((item) => ["jp", "us"].includes(item.market)
    && ["BUY", "SELL"].includes(item.context?.action)
    && finite(item.realizedReturnPct));
  const splitIndex = Math.floor(eligible.length * 0.7);
  const training = eligible.slice(0, splitIndex);
  const validation = eligible.slice(splitIndex);
  const rules = [];
  for (const market of ["jp", "us"]) {
    for (const sector of new Set(eligible.filter((item) => item.market === market).map((item) => item.context.sector))) {
      for (const action of ["BUY", "SELL"]) {
        const isMatch = (item) => item.market === market && item.context.sector === sector && item.context.action === action;
        const train = training.filter(isMatch);
        const validate = validation.filter(isMatch);
        const trainBaseline = training.filter((item) => item.market === market && item.context.action === action);
        const validationBaseline = validation.filter((item) => item.market === market && item.context.action === action);
        if (train.length < 8 || validate.length < 5 || trainBaseline.length < 10 || validationBaseline.length < 5) continue;
        const hitRate = (items) => items.filter((item) => actionHit(action, item.realizedReturnPct)).length / items.length;
        const trainGap = hitRate(train) - hitRate(trainBaseline);
        const validationGap = hitRate(validate) - hitRate(validationBaseline);
        if (trainGap > -0.1 || validationGap > -0.1) continue;
        const penalty = clamp(Math.round(Math.abs(validationGap) * 30), 2, 8);
        rules.push({
          market, sector, action, confidencePenalty: penalty,
          training: { evaluated: train.length, hitRatePct: hitRate(train) * 100, baselineHitRatePct: hitRate(trainBaseline) * 100 },
          validation: { evaluated: validate.length, hitRatePct: hitRate(validate) * 100, baselineHitRatePct: hitRate(validationBaseline) * 100 },
          method: "時系列分離・独立予測期間・同一市場同一判断の基準比較",
        });
      }
    }
  }
  return { version: 1, generatedAt: (asOf instanceof Date ? asOf : new Date(asOf)).toISOString(), rules: rules.slice(0, 30) };
}

export function normalizePortfolioDebate(value = {}) {
  const list = (items, max = 4) => (Array.isArray(items) ? items : []).map((item) => String(item || "").trim().slice(0, 240)).filter(Boolean).slice(0, max);
  return {
    bull: { thesis: String(value.bull?.thesis || "").slice(0, 480), positives: list(value.bull?.positives), risks: list(value.bull?.risks) },
    bear: { thesis: String(value.bear?.thesis || "").slice(0, 480), concerns: list(value.bear?.concerns), counterpoints: list(value.bear?.counterpoints) },
    judge: {
      conclusion: String(value.judge?.conclusion || "判断保留").slice(0, 160),
      rationale: String(value.judge?.rationale || "").slice(0, 600),
      priorities: list(value.judge?.priorities),
      caveat: String(value.judge?.caveat || "").slice(0, 320),
    },
  };
}
