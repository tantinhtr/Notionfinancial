import test from "node:test";
import assert from "node:assert/strict";
import { createCashflowComponent } from "../src/features/cashflow/component.js";
import { cashflowFixture } from "./helpers/feature-fixtures.js";
function harness() {
  const calls = [], sent = [];
  return { calls, sent, component: createCashflowComponent({
    repository: { async getMonthlyCashflow(refresh) { calls.push(refresh); return cashflowFixture(); } },
    telegram: { async sendMessage(...args) { sent.push(args); } }
  }) };
}
test("cashflow refresh loads once and sends a navigable account report", async () => {
  const h = harness();
  await h.component.showHome(42, { refresh: true });
  assert.deepEqual(h.calls, [true]);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0][0], 42);
  assert.equal(h.sent[0][1], "📊 Dòng tiền tháng 7/2026");
  assert.ok(h.sent[0][2].inline_keyboard.flat().some(b => b.callback_data === "cash_account:cash"));
});
test("cashflow malformed callbacks return safe navigation without reading data", async () => {
  for (const data of ["cash_direction", "cash_direction:bad", "cash_cat", "cash_cat:bad"]) {
    const h = harness();
    assert.equal(h.component.handlesCallback(data), true);
    await h.component.handleCallback(42, data);
    assert.deepEqual(h.calls, []);
    assert.equal(h.sent.length, 1);
    assert.match(h.sent[0][1], /không còn tồn tại/);
    assert.equal(h.sent[0][2].inline_keyboard[0][0].callback_data, "cash_home");
  }
});
test("cashflow stale account and category each return safe navigation", async () => {
  for (const data of ["cash_account:gone", "cash_direction:gone:out", "cash_cat:cash:out:gone"]) {
    const h = harness();
    await h.component.handleCallback(42, data);
    assert.deepEqual(h.calls, [false]);
    assert.equal(h.sent.length, 1);
    assert.match(h.sent[0][1], /không còn tồn tại/);
  }
});
test("cashflow factory rejects missing required dependencies", () => {
  assert.throws(() => createCashflowComponent({ repository: {}, telegram: {} }), TypeError);
  assert.throws(() => createCashflowComponent({ repository: { getMonthlyCashflow() {} }, telegram: {} }), TypeError);
});
test("cashflow propagates repository errors", async () => {
  const failure = new Error("offline");
  const component = createCashflowComponent({
    repository: { async getMonthlyCashflow() { throw failure; } },
    telegram: { sendMessage() { assert.fail("must not send"); } }
  });
  await assert.rejects(component.showHome(42), error => error === failure);
});
