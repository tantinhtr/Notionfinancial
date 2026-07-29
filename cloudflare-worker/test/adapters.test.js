import test from "node:test";
import assert from "node:assert/strict";
import { createNotionClient } from "../src/notion.js";
import { createStateStore } from "../src/state.js";
import { createTelegramClient } from "../src/telegram.js";

const config = {
  telegramToken: "telegram-sensitive-value",
  notionToken: "notion-sensitive-value",
  notionVersion: "2022-06-28"
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body
  };
}

function createKv() {
  const values = new Map();
  const calls = [];
  return {
    calls,
    async get(key) {
      calls.push(["get", key]);
      return values.get(key) ?? null;
    },
    async put(key, value, options) {
      calls.push(["put", key, value, options]);
      values.set(key, value);
    },
    async delete(key) {
      calls.push(["delete", key]);
      values.delete(key);
    }
  };
}

test("Notion queryDatabase follows pagination and sends the next cursor", async () => {
  const calls = [];
  const notion = createNotionClient(config, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? jsonResponse({ results: [{ id: "one" }], has_more: true, next_cursor: "cursor-2" })
      : jsonResponse({ results: [{ id: "two" }], has_more: false, next_cursor: null });
  });

  const filter = { property: "Date", date: { equals: "2026-07-29" } };
  const rows = await notion.queryDatabase("database-id", filter);

  assert.deepEqual(rows, [{ id: "one" }, { id: "two" }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.notion.com/v1/databases/database-id/query");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { page_size: 100, filter });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    page_size: 100,
    filter,
    start_cursor: "cursor-2"
  });
  assert.deepEqual(calls[0].options.headers, {
    Authorization: "Bearer notion-sensitive-value",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  });
});

test("Notion createPage sends the exact parent and properties", async () => {
  const calls = [];
  const notion = createNotionClient(config, async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ id: "page-id" });
  });
  const properties = { Name: { title: [{ text: { content: "Lunch" } }] } };

  const page = await notion.createPage("database-id", properties);

  assert.deepEqual(page, { id: "page-id" });
  assert.equal(calls[0].url, "https://api.notion.com/v1/pages");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    parent: { database_id: "database-id" },
    properties
  });
});

test("Notion errors include status and message without configured sensitive values", async () => {
  const notion = createNotionClient(config, async () =>
    jsonResponse({ message: "invalid request" }, { ok: false, status: 400 })
  );

  await assert.rejects(
    notion.createPage("database-id", {}),
    (error) => {
      assert.match(error.message, /createPage/);
      assert.match(error.message, /400/);
      assert.match(error.message, /invalid request/);
      assert.doesNotMatch(error.message, /notion-sensitive-value/);
      return true;
    }
  );
});

test("Telegram sends POST JSON and rejects failed Telegram responses", async () => {
  const calls = [];
  const telegram = createTelegramClient(config, async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ ok: true, result: { message_id: 1 } });
  });

  const result = await telegram.answerCallbackQuery("callback-id");

  assert.deepEqual(result, { message_id: 1 });
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(calls[0].options.headers, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(calls[0].options.body), { callback_query_id: "callback-id" });

  const failingTelegram = createTelegramClient(config, async () =>
    jsonResponse({ ok: false, description: "query expired" })
  );
  await assert.rejects(failingTelegram.getWebhookInfo(), /getWebhookInfo.*query expired/);
});

test("Telegram errors never expose the configured sensitive value", async () => {
  const telegram = createTelegramClient(config, async () =>
    jsonResponse({ ok: false, description: "forbidden" }, { ok: false, status: 403 })
  );

  await assert.rejects(
    telegram.deleteWebhook(),
    (error) => {
      assert.match(error.message, /deleteWebhook/);
      assert.match(error.message, /403/);
      assert.match(error.message, /forbidden/);
      assert.doesNotMatch(error.message, /telegram-sensitive-value/);
      return true;
    }
  );
});

test("Telegram sendMessage truncates text above the safe cap", async () => {
  const calls = [];
  const telegram = createTelegramClient(config, async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ ok: true, result: true });
  });
  const suffix = "\n\n... Tin nhắn quá dài nên đã rút gọn.";

  await telegram.sendMessage("chat-id", "x".repeat(3901));

  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.text.length, 3900);
  assert.equal(payload.text, "x".repeat(3900 - suffix.length) + suffix);
});

test("Telegram setWebhook sends the required updates without dropping pending updates", async () => {
  const calls = [];
  const telegram = createTelegramClient(config, async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ ok: true, result: true });
  });

  await telegram.setWebhook("https://example.invalid/webhook", "webhook-sensitive-value");

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    url: "https://example.invalid/webhook",
    secret_token: "webhook-sensitive-value",
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: false
  });
});

test("state store caches reports for 60 seconds by default", async () => {
  const kv = createKv();
  const state = createStateStore(kv);

  await state.putReportCache("monthly", { total: 100 });
  const cached = await state.getReportCache("monthly");
  await state.deleteReportCache("monthly");

  assert.deepEqual(kv.calls, [
    ["put", "report:monthly", JSON.stringify({ total: 100 }), { expirationTtl: 60 }],
    ["get", "report:monthly"],
    ["delete", "report:monthly"]
  ]);
  assert.deepEqual(cached, { total: 100 });
});

test("state store uses seven-day processed keys and suppresses duplicates", async () => {
  const kv = createKv();
  const state = createStateStore(kv);

  assert.equal(await state.hasProcessedUpdate(123), false);
  await state.markProcessedUpdate(123);
  assert.equal(await state.hasProcessedUpdate(123), true);

  assert.deepEqual(kv.calls, [
    ["get", "telegram:update:123"],
    ["put", "telegram:update:123", "1", { expirationTtl: 604800 }],
    ["get", "telegram:update:123"]
  ]);
});

test("state store deletes malformed cached JSON and returns a cache miss", async () => {
  const kv = createKv();
  await kv.put("report:bad", "not-json", { expirationTtl: 60 });
  const state = createStateStore(kv);

  const cached = await state.getReportCache("bad");

  assert.equal(cached, null);
  assert.deepEqual(kv.calls.slice(1), [
    ["get", "report:bad"],
    ["delete", "report:bad"]
  ]);
});

test("state store validates required KV methods", () => {
  assert.throws(() => createStateStore({ get() {}, put() {} }), /delete/);
});
