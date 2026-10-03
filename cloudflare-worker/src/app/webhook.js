import { jsonResponse } from "./http-response.js";
import { healthResponse, constantTimeEqual } from "./http-security.js";
import { forwardWebhook } from "./coordinator-gateway.js";
import { scheduled } from "./scheduled.js";

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
  scheduled
};
