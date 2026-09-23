import { DurableObject } from "cloudflare:workers";
import { classifyUpdate } from "../bot.js";
import { createCoordinatorHandler } from "./coordinator-handler.js";
import { createRuntime } from "./runtime.js";
import { jsonResponse } from "./http-response.js";

function createPromiseTailMutex() {
  // External I/O must not run inside blockConcurrencyWhile's 30-second reset window.
  let tail = Promise.resolve();
  return (callback) => {
    const result = tail.then(callback, callback);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

export class UpdateCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const now = () => new Date();
    const runExclusive = createPromiseTailMutex();
    const { bot, config, repository, telegram } = createRuntime(env, now);
    this.handler = createCoordinatorHandler({
      storage: ctx.storage,
      runExclusive,
      classifyUpdate: (update) => classifyUpdate(update, config.allowedUserId),
      executeUpdate: (update) => bot.processUpdate(update),
      reconcileIncome: (updateId) => repository.findGrabIncomeByUpdateId(updateId),
      completeReconciledIncome: (update) => bot.completeReconciledIncome(update),
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
