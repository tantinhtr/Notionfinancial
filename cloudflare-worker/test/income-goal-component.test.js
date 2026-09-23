import test from "node:test";
import assert from "node:assert/strict";
import { createIncomeGoalComponent } from "../src/features/income-goal/component.js";
import { AmbiguousIncomeWriteError } from "../src/repository.js";
import { goalFixture, messageUpdate } from "./helpers/feature-fixtures.js";
function harness(overrides = {}) {
  const calls = [], sent = [];
  const deps = {
    repository: {
      async getGoalStatus() { calls.push(["goal"]); return goalFixture(); },
      async addGrabIncome(...args) { calls.push(["write", ...args]); }
    },
    telegram: { async sendMessage(...args) { sent.push(args); } },
    config: { allowedUserId: 42, timezone: "Asia/Ho_Chi_Minh" },
    now: () => new Date("2026-07-29T18:30:00Z"),
    ...overrides
  };
  return { deps, calls, sent, component: createIncomeGoalComponent(deps) };
}
test("income goal renders one report with existing navigation", async () => {
  const h = harness();
  await h.component.show(9001);
  assert.deepEqual(h.calls, [["goal"]]);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0][1], /Mục tiêu Thu Nhập Ròng Grab/);
  assert.deepEqual(h.sent[0][2].inline_keyboard.flat().map(b => b.callback_data), ["cash_home", "show_funds", "show_home"]);
});
test("income recording respects local midnight and confirms exactly once", async () => {
  const h = harness();
  await h.component.recordIncome(messageUpdate(17, "650.000", 42, "edited_message"));
  assert.deepEqual(h.calls, [["write", 17, "2026-07-30", 650000], ["goal"]]);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0][1], /^Đã ghi 650\.000đ/);
});
test("ambiguous income write propagates unchanged without retry or confirmation", async () => {
  const failure = new AmbiguousIncomeWriteError(17);
  let writes = 0;
  const h = harness({ repository: {
    async addGrabIncome() { writes++; throw failure; },
    async getGoalStatus() { assert.fail("must not confirm"); }
  } });
  await assert.rejects(h.component.recordIncome(messageUpdate(17, "650000")), e => e === failure);
  assert.equal(writes, 1);
  assert.deepEqual(h.sent, []);
});
test("reconciled income only confirms and rejects unauthorized updates", async () => {
  const h = harness();
  await h.component.completeReconciledIncome(messageUpdate(17, "650000"));
  assert.deepEqual(h.calls, [["goal"]]);
  assert.equal(h.sent.length, 1);
  await assert.rejects(h.component.completeReconciledIncome(messageUpdate(18, "650000", 99)), TypeError);
  assert.equal(h.sent.length, 1);
});
test("invalid and unauthorized income records cannot reach repository", async () => {
  const h = harness();
  for (const update of [messageUpdate(1, "hello"), messageUpdate(2, "0"), messageUpdate(3, "650000", 99)]) {
    await assert.rejects(h.component.recordIncome(update), TypeError);
  }
  assert.deepEqual(h.calls, []);
});
test("income reminders use status and configured recipient", async () => {
  const h = harness();
  await h.component.sendDailyReminder();
  assert.deepEqual(h.calls, [["goal"]]);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0][0], 42);
  assert.match(h.sent[0][1], /^💪 Hôm nay kiếm 300\.000đ, còn thiếu 200\.000đ\./);
});
test("income factory validates repository, adapter, config and clock", () => {
  const { deps } = harness();
  for (const override of [
    { repository: {} }, { telegram: {} }, { config: {} },
    { config: { allowedUserId: 42, timezone: "" } }, { now: null }
  ]) assert.throws(() => createIncomeGoalComponent({ ...deps, ...override }), TypeError);
});
