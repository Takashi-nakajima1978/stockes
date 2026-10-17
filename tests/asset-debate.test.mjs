import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAssetDebate } from "../asset-debate.mjs";

test("normalizes debate fields and clamps evidence score", () => {
  const result = normalizeAssetDebate({
    debate: {
      bull: { thesis: "bull", positives: ["growth"], risks: ["volatility"] },
      bear: { thesis: "bear", concerns: ["valuation"], counterpoints: ["cash"] },
      judge: { conclusion: "慎重寄り", score: 123, rationale: "mixed", priorities: ["filing"], caveat: "not advice" },
    },
  }, { market: "us", symbol: "NVDA", generatedAt: "2026-10-17T00:00:00.000Z", model: "local-model" });
  assert.equal(result.market, "us");
  assert.equal(result.symbol, "NVDA");
  assert.equal(result.debate.judge.conclusion, "慎重寄り");
  assert.equal(result.debate.judge.score, 100);
  assert.deepEqual(result.debate.bull.positives, ["growth"]);
});

test("keeps unrecognized conclusions neutral and bounds model output", () => {
  const result = normalizeAssetDebate({
    debate: {
      bull: { thesis: "x".repeat(1200), positives: Array.from({ length: 12 }, (_, i) => `p${i}`) },
      judge: { conclusion: "BUY NOW", score: -8, rationale: "y".repeat(1400) },
    },
  }, { market: "crypto", symbol: "BTC-JPY" });
  assert.equal(result.debate.judge.conclusion, "判断保留");
  assert.equal(result.debate.judge.score, 0);
  assert.equal(result.debate.bull.thesis.length, 900);
  assert.equal(result.debate.bull.positives.length, 5);
  assert.equal(result.debate.judge.rationale.length, 1100);
});

test("rejects unknown market metadata instead of persisting an ambiguous record", () => {
  const result = normalizeAssetDebate({ symbol: "EUR-JPY" }, { market: "other" });
  assert.equal(result.market, "");
  assert.equal(result.symbol, "EUR-JPY");
  assert.equal(normalizeAssetDebate({ symbol: "EUR-JPY" }, { market: "crypto" }).market, "");
  assert.equal(normalizeAssetDebate({ symbol: "NVDA" }, { market: "fx" }).market, "");
  assert.equal(normalizeAssetDebate({ debate: { judge: {} } }, { market: "fx", symbol: "USD-JPY" }).debate.judge.score, null);
});
