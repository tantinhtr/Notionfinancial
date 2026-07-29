import { DurableObject } from "cloudflare:workers";
import { createBot, classifyUpdate } from "./bot.js";
import { getConfig } from "./config.js";
import { createCoordinatorHandler } from "./coordinator.js";
import { createNotionClient } from "./notion.js";
import { createFinanceRepository } from "./repository.js";
import { createStateStore } from "./state.js";
import { createTelegramClient } from "./telegram.js";

const REQUIRED_BINDINGS = [
  "TELEGRAM_TOKEN",
  "NOTION_TOKEN",
  "WEBHOOK_SECRET",
  "ALLOWED_USER_ID",
  "BOT_STATE",
  "UPDATE_COORDINATOR"
];
const COORDINATOR_STATUSES = new Set([
  "committed",
  "needs_reconciliation",
  "retryable",
  "in_progress"
]);

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function bindingPresent(env, name) {
  const value = env?.[name];
  if (["TELEGRAM_TOKEN", "NOTION_TOKEN", "WEBHOOK_SECRET", "ALLOWED_USER_ID"].includes(name)) {
    return typeof value === "string" && value.trim() !== "";
  }
  return value !== undefined && value !== null;
}

function healthResponse(env) {
  return jsonResponse({
    status: "ok",
    bindings: Object.fromEntries(
      REQUIRED_BINDINGS.map((name) => [name, bindingPresent(env, name)])
    )
  }, 200);
}

function constantTimeEqual(receivedValue, expectedValue) {
  if (typeof receivedValue !== "string" || typeof expectedValue !== "string") {
    return false;
  }
  const encoder = new TextEncoder();
  const received = encoder.encode(receivedValue);
  const expected = encoder.encode(expectedValue);
  let mismatch = received.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= (received[index] ?? 0) ^ expected[index];
  }
  return mismatch === 0;
}

function createRuntime(env, now = () => new Date()) {
  const config = getConfig(env);
  const telegram = createTelegramClient(config);
  const notion = createNotionClient(config);
  const state = createStateStore(config.botState);
  const repository = createFinanceRepository({ notion, state, config, now });
  const bot = createBot({ telegram, repository, config, now });
  return { bot, config, repository, telegram };
}

function coordinatorMetadata(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const metadata = {};
  if (COORDINATOR_STATUSES.has(body.status)) metadata.status = body.status;
  if (typeof body.duplicate === "boolean") metadata.duplicate = body.duplicate;
  if (typeof body.reconciled === "boolean") metadata.reconciled = body.reconciled;
  return metadata;
}

async function forwardWebhook(update, env) {
  try {
    const id = env.UPDATE_COORDINATOR.idFromName(String(update.update_id));
    const stub = env.UPDATE_COORDINATOR.get(id);
    const response = await stub.fetch(new Request("https://update-coordinator/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    }));
    if (!response.ok) {
      return jsonResponse({ status: "processing_failed" }, 500);
    }
    let result = null;
    try {
      result = await response.json();
    } catch {
      return jsonResponse({ status: "processing_failed" }, 500);
    }
    return jsonResponse({
      status: "ok",
      coordinator: coordinatorMetadata(result)
    }, 200);
  } catch {
    return jsonResponse({ status: "processing_failed" }, 500);
  }
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return healthResponse(env);
  }
  if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
    return jsonResponse({ status: "not_found" }, 404);
  }

  const receivedSecret = request.headers.get(
    "X-Telegram-Bot-Api-Secret-Token"
  );
  if (!constantTimeEqual(receivedSecret, env?.WEBHOOK_SECRET)) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return jsonResponse({ status: "invalid_json" }, 400);
  }
  if (typeof update?.update_id !== "number" || !Number.isFinite(update.update_id)) {
    return jsonResponse({ status: "invalid_update_id" }, 400);
  }
  return forwardWebhook(update, env);
}

export class UpdateCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const now = () => new Date();
    const { bot, config, repository, telegram } = createRuntime(env, now);
    this.handler = createCoordinatorHandler({
      storage: ctx.storage,
      runExclusive: (callback) => ctx.blockConcurrencyWhile(callback),
      classifyUpdate: (update) => classifyUpdate(update, config.allowedUserId),
      executeUpdate: (update) => bot.processUpdate(update),
      reconcileIncome: (updateId) => repository.findGrabIncomeByUpdateId(updateId),
      warnNeedsReconciliation: (update) => telegram.sendMessage(
        config.allowedUserId,
        `⚠️ Cần đối soát thu nhập Telegram update ${update.update_id}. ` +
        "Hãy kiểm tra Notion trước khi ghi lại."
      ),
      now: () => now().toISOString()
    });
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return jsonResponse({ status: "not_found" }, 404);
    }
    let update;
    try {
      update = await request.json();
    } catch {
      return jsonResponse({ status: "invalid_json" }, 400);
    }
    if (typeof update?.update_id !== "number" || !Number.isFinite(update.update_id)) {
      return jsonResponse({ status: "invalid_update_id" }, 400);
    }
    const result = await this.handler.handle(update);
    return jsonResponse(result, 200);
  }
}

export default {
  fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    const { bot } = createRuntime(env);
    ctx.waitUntil(bot.sendDailyReminder());
  }
};
