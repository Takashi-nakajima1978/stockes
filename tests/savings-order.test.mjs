import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const serverSource = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

function loadFunction(source, name, globals = {}) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  const end = source.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, globals);
}

const plans = [
  { id: "a", symbol: "0331418A", provider: "rakuten", accountType: "nisa-tsumitate", currentPrincipal: 2342597, currentValueDate: "2026-10-13", schedule: [{ month: "2026-04", amount: 37800 }] },
  { id: "b", symbol: "0331418A", provider: "sbi", accountType: "taxable", currentValueDate: "2026-09-30", schedule: [{ month: "2026-05", amount: 5000 }] },
  { id: "c", symbol: "03311065", provider: "ideco", recurring: true },
];

test("savings order uses plan ids, preserving identical fund codes and every financial field", () => {
  const reorder = loadFunction(serverSource, "orderSavingsPlans");
  const before = JSON.stringify(plans);
  const result = reorder(plans, ["c", "b", "a"]);
  assert.deepEqual(Array.from(result, (plan) => plan.id), ["c", "b", "a"]);
  assert.equal(result[2], plans[0]);
  assert.equal(result[1], plans[1]);
  assert.equal(JSON.stringify(plans), before);
});

test("unknown or duplicate order ids never drop existing or newly registered plans", () => {
  const reorder = loadFunction(serverSource, "orderSavingsPlans");
  assert.deepEqual(Array.from(reorder(plans, ["b", "b", "unknown"]), (plan) => plan.id), ["b", "a", "c"]);
  assert.deepEqual(Array.from(reorder([...plans, { id: "new" }], ["c", "a", "b"]), (plan) => plan.id), ["c", "a", "b", "new"]);
  assert.deepEqual(Array.from(reorder(plans, []), (plan) => plan.id), ["a", "b", "c"]);
  assert.match(serverSource, /url\.pathname === "\/api\/savings-plans\/reorder" && req\.method === "POST"/);
  assert.match(serverSource, /body\.ids\.length <= 50/);
});

function moveHarness({ fail = false, pending = false } = {}) {
  const state = { savingsPlans: [...plans] };
  const cards = plans.map((plan) => ({ dataset: { savingsPlan: plan.id }, draft: "61000", chart: {} }));
  const status = { textContent: "" };
  const requests = [];
  let focused = false;
  const button = { disabled: false, focus: () => { focused = true; } };
  const globals = {
    state,
    savingsOrderSaving: false,
    els: {
      savingsOrderStatus: status,
      savingsCreateForm: { querySelector: () => ({ disabled: pending }) },
      savingsPlans: {
        querySelector: () => null,
        querySelectorAll: () => cards,
        append: (card) => { cards.splice(cards.indexOf(card), 1); cards.push(card); },
      },
      savingsOrderList: { querySelectorAll: () => plans.map((plan) => ({ dataset: { savingsOrderId: plan.id }, querySelector: () => button })) },
    },
    renderSavingsOrder: () => {},
    request: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (fail) throw new Error("保存できませんでした");
      return { plans: JSON.parse(options.body).ids.map((id) => plans.find((plan) => plan.id === id)) };
    },
  };
  return { state, cards, status, requests, globals, focused: () => focused, move: loadFunction(appSource, "moveSavingsPlan", globals) };
}

test("successful reorder moves existing cards without discarding unsaved inputs or chart handlers", async () => {
  const harness = moveHarness();
  const originalCard = harness.cards[1];
  const chart = originalCard.chart;
  await harness.move("b", "up");
  assert.deepEqual(harness.state.savingsPlans.map((plan) => plan.id), ["b", "a", "c"]);
  assert.deepEqual(harness.cards.map((card) => card.dataset.savingsPlan), ["b", "a", "c"]);
  assert.equal(harness.cards[0], originalCard);
  assert.equal(harness.cards[0].draft, "61000");
  assert.equal(harness.cards[0].chart, chart);
  assert.deepEqual(harness.requests, [{ url: "/api/savings-plans/reorder", body: { ids: ["b", "a", "c"] } }]);
  assert.match(harness.status.textContent, /保存しました/);
  assert.equal(harness.globals.savingsOrderSaving, false);
  assert.equal(harness.focused(), true);
});

test("failed reorders leave the old order and draft values intact and can be retried", async () => {
  const harness = moveHarness({ fail: true });
  await harness.move("a", "down");
  assert.deepEqual(harness.state.savingsPlans.map((plan) => plan.id), ["a", "b", "c"]);
  assert.deepEqual(harness.cards.map((card) => card.dataset.savingsPlan), ["a", "b", "c"]);
  assert.equal(harness.cards[0].draft, "61000");
  assert.equal(harness.status.textContent, "保存できませんでした");
  assert.equal(harness.globals.savingsOrderSaving, false);
});

test("edge moves, invalid directions and concurrent saves send no reorder requests", async () => {
  const harness = moveHarness();
  await harness.move("a", "up");
  await harness.move("c", "down");
  await harness.move("missing", "up");
  await harness.move("b", "sideways");
  harness.globals.savingsOrderSaving = true;
  await harness.move("b", "up");
  assert.equal(harness.requests.length, 0);
  const pending = moveHarness({ pending: true });
  await pending.move("b", "up");
  assert.equal(pending.requests.length, 0);
  assert.match(pending.status.textContent, /保存完了後/);
});
