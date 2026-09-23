import { createRuntime } from "./runtime.js";
import { jsonResponse } from "./http-response.js";

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

function logProcessingFailure(updateId, stage, httpStatus) {
  const event = {
    event: "telegram_update_processing_failed",
    updateId,
    stage
  };
  if (Number.isInteger(httpStatus)) event.httpStatus = httpStatus;
  else event.status = "exception";
  try {
    console.error(event);
  } catch {
    // Diagnostics must not change webhook retry behavior.
  }
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
      logProcessingFailure(
        update.update_id,
        "coordinator_response",
        response.status
      );
      return jsonResponse({ status: "processing_failed" }, 500);
    }
    let result = null;
    try {
      result = await response.json();
    } catch {
      logProcessingFailure(
        update.update_id,
        "coordinator_response_json",
        response.status
      );
      return jsonResponse({ status: "processing_failed" }, 500);
    }
    // Update bi coi la trung thi coordinator tra ve ngay ma khong lam gi — day la
    // mot trong nhung duong dan toi "bam nut khong nhan duoc gi".
    console.log(JSON.stringify({
      event: "update_handled",
      updateId: update.update_id,
      status: result?.status ?? null,
      duplicate: result?.duplicate === true
    }));
    return jsonResponse({
      status: "ok",
      coordinator: coordinatorMetadata(result)
    }, 200);
  } catch {
    logProcessingFailure(update.update_id, "coordinator_forward");
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

export default {
  fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    const { bot } = createRuntime(env);
    ctx.waitUntil(bot.sendDailyReminder());
  }
};
