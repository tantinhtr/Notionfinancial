/**
 * Điểm vào HTTP: kiểm tra đường dẫn, secret và update trước khi chuyển cho bộ xử lý.
 * Lỗi xử lý hợp lệ được xác nhận HTTP 200 để Telegram không tự gửi lại, không có nghĩa giao dịch đã ghi thành công.
 */
import { createWebhookNotifier } from "./runtime.js";
import { jsonResponse } from "./http-response.js";
import { healthResponse, constantTimeEqual } from "./http-security.js";
import { forwardWebhook } from "./coordinator-gateway.js";
import { scheduled } from "./scheduled.js";

export function createWebhookHandler({
  forwardUpdate = forwardWebhook,
  createNotifier = createWebhookNotifier
} = {}) {
  return async function handleFetch(request, env, ctx = {}) {
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
    try {
      const response = await forwardUpdate(update, env);
      if (response.ok) return response;
    } catch {
      // Processing failure is acknowledged, not reported as a committed transaction.
    }
    const notification = (async () => {
      try { await createNotifier(env)(update); }
      catch { /* Notification failure must not reopen webhook delivery. */ }
    })();
    if (typeof ctx?.waitUntil === "function") {
      try { ctx.waitUntil(notification); }
      catch { await notification; }
    } else {
      await notification;
    }
    return jsonResponse({ status: "processing_failed" }, 200);
  };
}

export default {
  fetch: createWebhookHandler(),
  scheduled
};
