import { createRuntime } from "./runtime.js";

export function scheduled(controller, env, ctx) {
  const runtime = createRuntime(env);
  if (controller.cron === "0 14 * * *") {
    ctx.waitUntil(runtime.sendDailyReminder());
  } else {
    ctx.waitUntil(runtime.syncLatestSixJar());
  }
}
