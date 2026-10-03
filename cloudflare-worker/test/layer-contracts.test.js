import test from "node:test";
import assert from "node:assert/strict";
import { createKvCacheAdapter } from "../src/adapters/kv-cache-adapter.js";
import { createTelegramAdapter } from "../src/adapters/telegram-adapter.js";
import { createFinanceRepositories } from "../src/repositories/finance-repository.js";
import { buildOpeningPlan_ } from "../src/domain/finance-rules.js";
import { parseAmount } from "../src/domain/string-parser.js";
import { getConfig } from "../src/config.js";

test("raw Telegram adapter transmits prepared text without formatting or parsing", async () => {
  const text = "x".repeat(4000), calls = [];
  const adapter = createTelegramAdapter({ telegramToken: "test" }, async (url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: true });
  });
  await adapter.sendMessage(7, text);
  assert.deepEqual(calls, [{ chat_id: 7, text }]);
});

test("injected generic KV port preserves report namespace and clears both cached reports after Grab write", async () => {
  const entries = new Map(), deleted = [];
  const kv = {
    async get(key) { return entries.get(key) ?? null; },
    async put(key, value) { entries.set(key, value); },
    async delete(key) { deleted.push(key); entries.delete(key); }
  };
  const cache = createKvCacheAdapter(kv, { prefix: "report:" });
  await cache.set("monthly-cashflow:2026-10-04", { amount: 1 }, 60);
  await cache.set("fund-budget:2026-10-04", { amount: 2 }, 60);
  assert.deepEqual(await cache.get("fund-budget:2026-10-04"), { amount: 2 });
  const config = getConfig({ TELEGRAM_TOKEN: "test", NOTION_TOKEN: "test", WEBHOOK_SECRET: "test",
    ALLOWED_USER_ID: "42", BOT_STATE: kv, UPDATE_COORDINATOR: {} });
  const repos = createFinanceRepositories({
    notionAdapter: { async queryDatabase() { return []; }, async createPage() { return { id: "new" }; } },
    kvCacheAdapter: cache, config
  });
  await repos.incomeGoal.addGrabIncome(101, "2026-10-04", 50000);
  assert.deepEqual(deleted, ["report:monthly-cashflow:2026-10-04", "report:fund-budget:2026-10-04"]);
  assert.equal(entries.size, 0);
});

test("finance rules run from frozen inputs without adapters or database access", () => {
  const accounts = Object.freeze([
    Object.freeze({ id: "cash", properties: Object.freeze({
      "Phương Thức Thanh Toán": Object.freeze({ title: Object.freeze([Object.freeze({ plain_text: "Tiền Mặt" })]) }),
      "Số Dư Ban Đầu": Object.freeze({ number: 3252023 })
    }) })
  ]);
  const options = Object.freeze({
    sourceAccountNames: Object.freeze(["Tiền Mặt"]), rentReserveAmount: 2150000,
    rolloverCarryoverAmount: 136972, rolloverFundNames: Object.freeze(["A", "B", "C", "D"]),
    rolloverFundWeights: Object.freeze([2, 2, 2, 1])
  });
  const result = buildOpeningPlan_(accounts, options);
  assert.equal(result.remainder, 1238995);
  assert.deepEqual(result.allocations.map(value => value.amount), [353999, 353999, 353998, 176999]);
  assert.equal(parseAmount("50.000"), 50000);
});
