import { jsonResponse } from "./http-response.js";

const REQUIRED_BINDINGS = [
  "TELEGRAM_TOKEN",
  "NOTION_TOKEN",
  "WEBHOOK_SECRET",
  "ALLOWED_USER_ID",
  "BOT_STATE",
  "UPDATE_COORDINATOR"
];
function bindingPresent(env, name) {
  const value = env?.[name];
  if (["TELEGRAM_TOKEN", "NOTION_TOKEN", "WEBHOOK_SECRET", "ALLOWED_USER_ID"].includes(name)) {
    return typeof value === "string" && value.trim() !== "";
  }
  return value !== undefined && value !== null;
}

export function healthResponse(env) {
  return jsonResponse({
    status: "ok",
    bindings: Object.fromEntries(
      REQUIRED_BINDINGS.map((name) => [name, bindingPresent(env, name)])
    )
  }, 200);
}

export function constantTimeEqual(receivedValue, expectedValue) {
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
