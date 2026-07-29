import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";

test("getConfig validates required bindings", () => {
  assert.throws(() => getConfig({}), /TELEGRAM_TOKEN/);
});

test("getConfig parses the allowed user and stable defaults", () => {
  const config = getConfig({
    TELEGRAM_TOKEN: "telegram",
    NOTION_TOKEN: "notion",
    WEBHOOK_SECRET: "secret",
    ALLOWED_USER_ID: "42",
    BOT_STATE: {}
  });
  assert.equal(config.allowedUserId, 42);
  assert.equal(config.monthlyExpenseLimit, 5500000);
  assert.equal(config.timezone, "Asia/Ho_Chi_Minh");
});

test("getConfig rejects a non-finite allowed user ID", () => {
  const env = {
    TELEGRAM_TOKEN: "telegram",
    NOTION_TOKEN: "notion",
    WEBHOOK_SECRET: "secret",
    ALLOWED_USER_ID: "not-a-number",
    BOT_STATE: {}
  };
  assert.throws(() => getConfig(env), /ALLOWED_USER_ID/);
});

test("getConfig returns stable Notion identifiers", () => {
  const config = getConfig({
    TELEGRAM_TOKEN: "telegram",
    NOTION_TOKEN: "notion",
    WEBHOOK_SECRET: "secret",
    ALLOWED_USER_ID: "42",
    BOT_STATE: {}
  });
  assert.equal(config.incomeDb, "1178ffb5-256b-81a1-8052-c91e72fb0eb6");
  assert.equal(config.goalDb, "1178ffb5-256b-815e-9f66-e18a90b48950");
  assert.equal(config.goalRelationPageId, "39c8ffb5-256b-806f-a710-e022aabf703d");
  assert.equal(config.walletIncomeRelationPageId, "3a08ffb5-256b-80a7-a68a-dc37d6dff53f");
});
