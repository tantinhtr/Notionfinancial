import test from "node:test";
import assert from "node:assert/strict";
import { createFundBudgetComponent } from "../src/features/fund-budget/component.js";
import { fundFixture } from "./helpers/feature-fixtures.js";
test("fund component forwards refresh and sends one report with home navigation", async () => {
  const calls = [], sent = [];
  const component = createFundBudgetComponent({
    repository: { async getFundBudgetReport(refresh) { calls.push(refresh); return fundFixture(); } },
    telegram: { async sendMessage(...args) { sent.push(args); } }
  });
  assert.equal(component.handlesCallback("show_funds"), true);
  assert.equal(component.handlesCallback("cash_home"), false);
  await component.show(7, { refresh: true });
  assert.deepEqual(calls, [true]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 7);
  assert.match(sent[0][1], /Thiết Yếu/);
  assert.equal(sent[0][2].inline_keyboard[0][0].callback_data, "cash_home");
});
test("fund callback uses cached report and ignores unrelated callbacks", async () => {
  const calls = [];
  const component = createFundBudgetComponent({
    repository: { async getFundBudgetReport(refresh) { calls.push(refresh); return fundFixture(); } },
    telegram: { async sendMessage() { calls.push("send"); } }
  });
  await component.handleCallback(7, "cash_home");
  assert.deepEqual(calls, []);
  await component.handleCallback(7, "show_funds");
  assert.deepEqual(calls, [false, "send"]);
});
test("fund repository failures propagate without sending", async () => {
  const failure = new Error("offline");
  const component = createFundBudgetComponent({
    repository: { async getFundBudgetReport() { throw failure; } },
    telegram: { sendMessage() { assert.fail("must not send"); } }
  });
  await assert.rejects(component.show(7), error => error === failure);
});
test("fund component validates required dependencies", () => {
  assert.throws(() => createFundBudgetComponent({ repository: {}, telegram: {} }), TypeError);
  assert.throws(() => createFundBudgetComponent({ repository: { getFundBudgetReport() {} }, telegram: {} }), TypeError);
});
