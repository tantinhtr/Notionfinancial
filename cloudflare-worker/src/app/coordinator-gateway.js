import { jsonResponse } from "./http-response.js";

const COORDINATOR_STATUSES = new Set([
  "committed",
  "needs_reconciliation",
  "retryable",
  "in_progress"
]);

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

export async function forwardWebhook(update, env) {
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
