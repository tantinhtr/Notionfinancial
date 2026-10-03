import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookHandler } from "../src/app/index.js";
import { createWebhookNotifier } from "../src/app/runtime.js";

const env = { WEBHOOK_SECRET: "secret", TELEGRAM_TOKEN: "private-token", ALLOWED_USER_ID: "42" };
const update = { update_id: 7, message: { from: { id: 42 }, chat: { id: 9001 }, text: "50000" } };
const request = () => new Request("https://bot.example/telegram/webhook", {
  method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "secret" }, body: JSON.stringify(update)
});

test("authenticated processing failure is acknowledged and notification is scheduled", async () => {
  const notices = [], pending = [];
  const handler = createWebhookHandler({
    async forwardUpdate() { throw new Error("private upstream details"); },
    createNotifier() { return async value => notices.push(value.update_id); }
  });
  const response = await handler(request(), env, { waitUntil(promise) { pending.push(promise); } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "processing_failed" });
  await Promise.all(pending);
  assert.deepEqual(notices, [7]);
});

test("coordinator error response and notification rejection never escape as HTTP 500", async () => {
  const handler = createWebhookHandler({
    async forwardUpdate() { return new Response("upstream secrets", { status: 503 }); },
    createNotifier() { return async () => { throw new Error("Telegram down"); }; }
  });
  assert.equal((await handler(request(), env, {})).status, 200);
  const brokenNotifier = createWebhookHandler({
    async forwardUpdate() { throw new Error("Notion down"); },
    createNotifier() { throw new Error("bad transport configuration"); }
  });
  assert.equal((await brokenNotifier(request(), env, {})).status, 200);
});

test("success does not generate an error notification and bad secrets remain rejected", async () => {
  let notifications = 0, calls = 0;
  const handler = createWebhookHandler({
    async forwardUpdate() { calls++; return Response.json({ status: "ok" }); },
    createNotifier() { notifications++; return async () => {}; }
  });
  assert.equal((await handler(request(), env, {})).status, 200);
  const invalid = request(); invalid.headers.set("X-Telegram-Bot-Api-Secret-Token", "wrong");
  assert.equal((await handler(invalid, env, {})).status, 401);
  assert.equal(notifications, 0);
  assert.equal(calls, 1);
});

test("failure notifier sends only to the allowed user's update chat and exposes no upstream data", async () => {
  const calls = [];
  const notify = createWebhookNotifier(env, async (url, options) => {
    calls.push(JSON.parse(options.body));
    assert.ok(options.signal);
    return Response.json({ ok: true, result: true });
  });
  await notify(update);
  await notify({ ...update, message: { ...update.message, from: { id: 43 } } });
  await notify({ update_id: 8, callback_query: { from: { id: 42 }, message: { chat: { id: 9002 } } } });
  assert.deepEqual(calls.map(value => value.chat_id), [9001, 9002]);
  assert.ok(calls.every(value => !value.text.includes(env.TELEGRAM_TOKEN)));
});
