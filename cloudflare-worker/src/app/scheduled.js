/**
 * Chọn tác vụ theo lịch Cloudflare: nhắc mục tiêu lúc 21:00 giờ Việt Nam hoặc đồng bộ sáu lọ.
 * Đăng ký promise với ngữ cảnh để tác vụ được tiếp tục thực thi.
 */
import { createRuntime } from "./runtime.js";

export function scheduled(controller, env, ctx) {
  const runtime = createRuntime(env);
  if (controller.cron === "0 14 * * *") {
    ctx.waitUntil(runtime.sendDailyReminder());
  } else {
    ctx.waitUntil(runtime.syncLatestSixJar());
  }
}
