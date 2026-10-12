import test from "node:test";
import assert from "node:assert/strict";
import { splitLearningHistory, returnEvidence, hasProfitableEvidence, afterCostReturn } from "../investment-evidence.mjs";

function observation(symbol, start, end) {
  return { symbol, generatedAt: start, learningHorizonEndDate: end, learningOutcome: "hit", learningHorizonReturnPct: 2 };
}

test("training outcomes finish before the first validation day, with same-day batches kept together", () => {
  const items = [
    observation("A", "2026-01-01", "2026-02-01"),
    observation("B", "2026-01-02", "2026-04-01"),
    observation("C", "2026-02-01", "2026-05-01"),
    observation("D", "2026-02-02", ""),
    observation("E", "2026-03-01", "2026-04-02"),
    observation("F", "2026-04-01T01:00:00Z", "2026-05-01"),
    observation("G", "2026-04-01T02:00:00Z", "2026-05-01"),
    observation("H", "2026-04-01T03:00:00Z", "2026-05-01"),
    observation("I", "2026-05-01", "2026-06-01"),
    observation("J", "2026-06-01", "2026-07-01"),
  ];
  const split = splitLearningHistory(items);
  assert.equal(split.cutoff, "2026-04-01");
  assert.deepEqual(split.training.map((item) => item.symbol), ["A"]);
  assert.deepEqual(split.validation.map((item) => item.symbol), ["F", "G", "H", "I", "J"]);
  assert.equal(split.purged, 4);
  assert.ok(split.training.every((item) => item.learningHorizonEndDate < split.cutoff));
});

test("one-day and duplicate-symbol histories cannot pretend to be independent later validation", () => {
  const batch = Array.from({ length: 20 }, (_, index) => observation(`S${index}`, "2026-01-01", "2026-02-01"));
  batch.push(observation("S0", "2026-01-01", "2026-02-01"));
  const split = splitLearningHistory(batch);
  assert.equal(split.training.length, 0);
  assert.equal(split.validation.length, 20);
});

test("profit evidence counts terminal losses even when all stocks once hit the target", () => {
  const evidence = returnEvidence([-20, -10, 1, 3].map((value) => ({
    learningOutcome: "hit", learningHorizonReturnPct: value, learningHorizonNetReturnPct: afterCostReturn(value, 1, 20),
  })));
  assert.equal(evidence.avgReturnPct, -6.5);
  assert.equal(evidence.medianReturnPct, -4.5);
  assert.equal(evidence.lossRatePct, 50);
  assert.equal(evidence.tailReturnPct, -20);
  assert.equal(hasProfitableEvidence(evidence), false);
  assert.equal(afterCostReturn(10, 1, 20), 7.2);
  assert.equal(afterCostReturn(-10, 1, 20), -11);
  assert.equal(hasProfitableEvidence(returnEvidence([{ learningHorizonReturnPct: 10 }])), false);
  assert.equal(hasProfitableEvidence(returnEvidence([{ learningHorizonReturnPct: 10, learningHorizonNetReturnPct: 7.2 }])), true);
});
