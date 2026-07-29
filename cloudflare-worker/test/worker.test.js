import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const cloudflareWorkersHook = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: "mock:cloudflare-workers", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === "mock:cloudflare-workers") {
    return {
      format: "module",
      source: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
      shortCircuit: true
    };
  }
  return nextLoad(url, context);
}
`;
register(
  `data:text/javascript,${encodeURIComponent(cloudflareWorkersHook)}`,
  import.meta.url
);

const {
  default: worker,
  UpdateCoordinator
} = await import("../src/index.js");

const WEBHOOK_SECRET = "sëcret-telegram";
const TELEGRAM_TOKEN = "telegram-token-private";
const NOTION_TOKEN = "notion-token-private";

function createKv() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    }
  };
}

function createEnv(overrides = {}) {
  return {
    TELEGRAM_TOKEN,
    NOTION_TOKEN,
    WEBHOOK_SECRET,
    ALLOWED_USER_ID: "42",
    BOT_STATE: createKv(),
    UPDATE_COORDINATOR: {},
    ...overrides
  };
}

function webhookRequest(body, {
  secret = WEBHOOK_SECRET,
  path = "/telegram/webhook",
  method = "POST"
} = {}) {
  const headers = { "Content-Type": "application/json" };
  if (secret !== null) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  }
  return new Request(`https://worker.example${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body
  });
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function createDoContext(initialRecord = null) {
  const values = new Map();
  if (initialRecord !== null) values.set("record", structuredClone(initialRecord));
  let gateCalls = 0;
  const storage = {
    async get(key) {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    }
  };
  return {
    ctx: {
      storage,
      blockConcurrencyWhile(callback) {
        gateCalls += 1;
        return callback();
      }
    },
    record() {
      const value = values.get("record");
      return value === undefined ? undefined : structuredClone(value);
    },
    gateCalls() {
      return gateCalls;
    }
  };
}

function update(updateId, text = "650000", userId = 42) {
  return {
    update_id: updateId,
    message: {
      text,
      from: { id: userId },
      chat: { id: 9001 }
    }
  };
}

function notionResponse(results = [], status = 200, extra = {}) {
  return new Response(JSON.stringify({
    object: "list",
    results,
    has_more: false,
    next_cursor: null,
    ...extra
  }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function telegramResponse(result = true, status = 200) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, result }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function withGlobalFetch(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function isTelegramUrl(url) {
  return String(url).startsWith("https://api.telegram.org/");
}

function isNotionQuery(url) {
  return String(url).includes("api.notion.com/v1/databases/");
}

function isNotionCreate(url) {
  return String(url) === "https://api.notion.com/v1/pages";
}

function requestPayload(options) {
  return JSON.parse(options.body);
}

async function callCoordinator(coordinator, telegramUpdate) {
  return coordinator.fetch(new Request("https://coordinator.internal/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telegramUpdate)
  }));
}

test("GET /health reports required binding booleans without secret values", async () => {
  const env = createEnv({ NOTION_TOKEN: "" });

  const response = await worker.fetch(
    new Request("https://worker.example/health"),
    env,
    {}
  );
  const body = await responseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: "ok",
    bindings: {
      TELEGRAM_TOKEN: true,
      NOTION_TOKEN: false,
      WEBHOOK_SECRET: true,
      ALLOWED_USER_ID: true,
      BOT_STATE: true,
      UPDATE_COORDINATOR: true
    }
  });
  for (const secret of [TELEGRAM_TOKEN, WEBHOOK_SECRET, "42"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("webhook rejects missing, wrong, prefixed, and suffixed secrets with 401", async () => {
  for (const secret of [
    null,
    "wrong",
    `x${WEBHOOK_SECRET}`,
    `${WEBHOOK_SECRET}x`
  ]) {
    const response = await worker.fetch(
      webhookRequest(JSON.stringify(update(300)), { secret }),
      createEnv(),
      {}
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await responseJson(response), { status: "unauthorized" });
  }
});

test("webhook accepts only POST on the exact route and all other routes return 404", async () => {
  for (const request of [
    webhookRequest(undefined, { method: "GET" }),
    webhookRequest("{}", { path: "/telegram/webhook/" }),
    new Request("https://worker.example/unknown"),
    new Request("https://worker.example/health", { method: "POST" })
  ]) {
    const response = await worker.fetch(request, createEnv(), {});
    assert.equal(response.status, 404);
    assert.deepEqual(await responseJson(response), { status: "not_found" });
  }
});

test("webhook rejects malformed JSON before touching the Durable Object", async () => {
  let namespaceCalls = 0;
  const env = createEnv({
    UPDATE_COORDINATOR: {
      idFromName() {
        namespaceCalls += 1;
      }
    }
  });

  const response = await worker.fetch(
    webhookRequest("{not-json"),
    env,
    {}
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await responseJson(response), { status: "invalid_json" });
  assert.equal(namespaceCalls, 0);
});

test("webhook rejects missing and non-finite numeric update_id values", async () => {
  for (const body of [
    {},
    { update_id: null },
    { update_id: "301" },
    { update_id: true }
  ]) {
    const response = await worker.fetch(
      webhookRequest(JSON.stringify(body)),
      createEnv(),
      {}
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await responseJson(response), { status: "invalid_update_id" });
  }
});

test("webhook derives the exact Durable Object ID and waits for successful forwarding", async () => {
  let requestedName;
  let forwardedUpdate;
  let releaseProcessing;
  const processingGate = new Promise((resolve) => {
    releaseProcessing = resolve;
  });
  const namespace = {
    idFromName(name) {
      requestedName = name;
      return { name };
    },
    get(id) {
      assert.deepEqual(id, { name: "302" });
      return {
        async fetch(request) {
          forwardedUpdate = await request.json();
          await processingGate;
          return new Response(JSON.stringify({
            status: "committed",
            duplicate: false,
            finance: { amount: 650000 }
          }), { status: 200 });
        }
      };
    }
  };
  const env = createEnv({ UPDATE_COORDINATOR: namespace });

  let settled = false;
  const pending = worker.fetch(
    webhookRequest(JSON.stringify(update(302))),
    env,
    {}
  ).then((response) => {
    settled = true;
    return response;
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(settled, false);
  releaseProcessing();
  const response = await pending;
  const body = await responseJson(response);

  assert.equal(requestedName, "302");
  assert.deepEqual(forwardedUpdate, update(302));
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: "ok",
    coordinator: {
      status: "committed",
      duplicate: false
    }
  });
  assert.equal(JSON.stringify(body).includes("650000"), false);
});

test("webhook returns a redacted 500 when Durable Object processing fails", async () => {
  const env = createEnv({
    UPDATE_COORDINATOR: {
      idFromName() {
        return "do-id";
      },
      get() {
        return {
          async fetch() {
            return new Response(JSON.stringify({
              error: "private finance 650000",
              token: TELEGRAM_TOKEN
            }), { status: 500 });
          }
        };
      }
    }
  });

  const response = await worker.fetch(
    webhookRequest(JSON.stringify(update(303))),
    env,
    {}
  );
  const body = await responseJson(response);

  assert.equal(response.status, 500);
  assert.deepEqual(body, { status: "processing_failed" });
  assert.equal(JSON.stringify(body).includes("650000"), false);
  assert.equal(JSON.stringify(body).includes(TELEGRAM_TOKEN), false);
});

test("UpdateCoordinator committed replay uses the exclusive gate and never calls the bot", async () => {
  const context = createDoContext({
    updateId: 310,
    kind: "income",
    status: "committed",
    updatedAt: "2026-07-29T00:00:00.000Z"
  });
  let externalCalls = 0;

  await withGlobalFetch(async () => {
    externalCalls += 1;
    throw new Error("committed replay must not call external services");
  }, async () => {
    const coordinator = new UpdateCoordinator(context.ctx, createEnv());
    const response = await callCoordinator(coordinator, update(310));

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), {
      status: "committed",
      duplicate: true
    });
  });

  assert.equal(context.gateCalls(), 1);
  assert.equal(externalCalls, 0);
});

test("UpdateCoordinator retries an ordinary pre-write error and later commits", async () => {
  const context = createDoContext();
  let updateLookupCalls = 0;
  let createCalls = 0;
  const externalFetch = async (url, options) => {
    if (isTelegramUrl(url)) return telegramResponse({ message_id: 1 });
    if (isNotionCreate(url)) {
      createCalls += 1;
      return new Response(JSON.stringify({ id: "created-page" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (isNotionQuery(url)) {
      const payload = requestPayload(options);
      if (payload.filter?.property === "Telegram Update ID") {
        updateLookupCalls += 1;
        if (updateLookupCalls === 1) {
          return notionResponse([], 503, { message: "temporary lookup failure" });
        }
        return notionResponse([]);
      }
      if (payload.filter?.title) {
        return notionResponse([{
          id: "goal",
          properties: { "Mục Tiêu Hàng Tháng": { number: 12000000 } }
        }]);
      }
      return notionResponse([]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await withGlobalFetch(externalFetch, async () => {
    const coordinator = new UpdateCoordinator(context.ctx, createEnv());

    await assert.rejects(
      () => callCoordinator(coordinator, update(311)),
      /Notion queryDatabase failed/
    );
    assert.equal(context.record().status, "retryable");

    const response = await callCoordinator(coordinator, update(311));
    assert.deepEqual(await responseJson(response), { status: "committed" });
  });

  assert.equal(context.gateCalls(), 2);
  assert.equal(createCalls, 1);
  assert.equal(context.record().status, "committed");
});

test("UpdateCoordinator reconciles an ambiguous income create without recreating it", async () => {
  const context = createDoContext();
  let updateLookupCalls = 0;
  let createCalls = 0;
  const externalFetch = async (url, options) => {
    if (isNotionCreate(url)) {
      createCalls += 1;
      return notionResponse([], 503, {
        message: `private finance 650000 ${NOTION_TOKEN}`
      });
    }
    if (isNotionQuery(url)) {
      const payload = requestPayload(options);
      if (payload.filter?.property === "Telegram Update ID") {
        updateLookupCalls += 1;
        return updateLookupCalls === 1
          ? notionResponse([])
          : notionResponse([{ id: "existing-income" }]);
      }
    }
    throw new Error(`Unexpected external call: ${url}`);
  };

  await withGlobalFetch(externalFetch, async () => {
    const coordinator = new UpdateCoordinator(context.ctx, createEnv());
    const response = await callCoordinator(coordinator, update(312));

    assert.deepEqual(await responseJson(response), {
      status: "committed",
      reconciled: true
    });
  });

  assert.equal(createCalls, 1);
  assert.equal(updateLookupCalls, 2);
  assert.equal(context.record().status, "committed");
});

test("persistent needs_reconciliation warns only the allowed user and never recreates income", async () => {
  const context = createDoContext();
  const telegramPayloads = [];
  let createCalls = 0;
  const externalFetch = async (url, options) => {
    if (isTelegramUrl(url)) {
      telegramPayloads.push(requestPayload(options));
      return telegramResponse({ message_id: telegramPayloads.length });
    }
    if (isNotionCreate(url)) {
      createCalls += 1;
      return notionResponse([], 503, {
        message: `private finance 650000 ${NOTION_TOKEN}`
      });
    }
    if (isNotionQuery(url)) return notionResponse([]);
    throw new Error(`Unexpected URL: ${url}`);
  };

  await withGlobalFetch(externalFetch, async () => {
    const coordinator = new UpdateCoordinator(context.ctx, createEnv());
    const first = await callCoordinator(coordinator, update(313));
    const replay = await callCoordinator(coordinator, update(313));

    assert.deepEqual(await responseJson(first), { status: "needs_reconciliation" });
    assert.deepEqual(await responseJson(replay), { status: "needs_reconciliation" });
  });

  assert.equal(createCalls, 1);
  assert.equal(context.record().status, "needs_reconciliation");
  assert.equal(context.record().kind, "income");
  assert.equal(telegramPayloads.length, 2);
  for (const payload of telegramPayloads) {
    const serialized = JSON.stringify(payload);
    assert.equal(payload.chat_id, 42);
    assert.match(payload.text, /313/);
    for (const forbidden of [
      "650000",
      TELEGRAM_TOKEN,
      NOTION_TOKEN,
      "private finance",
      '"message"'
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }
});

test("scheduled passes the real reminder promise to waitUntil without network access", async () => {
  const telegramPayloads = [];
  const externalFetch = async (url, options) => {
    if (isTelegramUrl(url)) {
      telegramPayloads.push(requestPayload(options));
      return telegramResponse({ message_id: 1 });
    }
    if (isNotionQuery(url)) {
      const payload = requestPayload(options);
      if (payload.filter?.title) {
        return notionResponse([{
          id: "goal",
          properties: { "Mục Tiêu Hàng Tháng": { number: 12000000 } }
        }]);
      }
      return notionResponse([]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await withGlobalFetch(externalFetch, async () => {
    const promises = [];
    const ctx = {
      waitUntil(promise) {
        promises.push(promise);
      }
    };

    const result = worker.scheduled({}, createEnv(), ctx);

    assert.equal(result, undefined);
    assert.equal(promises.length, 1);
    await promises[0];
  });

  assert.equal(telegramPayloads.length, 1);
  assert.equal(telegramPayloads[0].chat_id, 42);
  assert.match(telegramPayloads[0].text, /Hôm nay chưa ghi thu nhập nào/);
});
