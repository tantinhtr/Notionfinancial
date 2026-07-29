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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(structuredClone(args));
  let response;
  try {
    response = await worker.fetch(
      webhookRequest(JSON.stringify(update(303))),
      env,
      {}
    );
  } finally {
    console.error = originalConsoleError;
  }
  const body = await responseJson(response);

  assert.equal(response.status, 500);
  assert.deepEqual(body, { status: "processing_failed" });
  assert.deepEqual(logs, [[{
    event: "telegram_update_processing_failed",
    updateId: 303,
    stage: "coordinator_response",
    httpStatus: 500
  }]]);
  assert.equal(JSON.stringify(body).includes("650000"), false);
  assert.equal(JSON.stringify(body).includes(TELEGRAM_TOKEN), false);
});

test("Worker logs only structured bounded metadata for each processing failure stage", async () => {
  const scenarios = [{
    stage: "coordinator_response",
    expectedLog: {
      event: "telegram_update_processing_failed",
      updateId: 304,
      stage: "coordinator_response",
      httpStatus: 503
    },
    stub: {
      async fetch() {
        return new Response(JSON.stringify({
          body: "private finance 650000",
          token: TELEGRAM_TOKEN
        }), { status: 503 });
      }
    }
  }, {
    stage: "coordinator_response_json",
    expectedLog: {
      event: "telegram_update_processing_failed",
      updateId: 304,
      stage: "coordinator_response_json",
      httpStatus: 200
    },
    stub: {
      async fetch() {
        return new Response(`not-json ${NOTION_TOKEN}`, { status: 200 });
      }
    }
  }, {
    stage: "coordinator_forward",
    expectedLog: {
      event: "telegram_update_processing_failed",
      updateId: 304,
      stage: "coordinator_forward",
      status: "exception"
    },
    stub: {
      async fetch() {
        throw new Error(`upstream private finance 650000 ${NOTION_TOKEN}`);
      }
    }
  }];

  for (const scenario of scenarios) {
    const logs = [];
    const originalConsoleError = console.error;
    console.error = (...args) => logs.push(structuredClone(args));
    try {
      const env = createEnv({
        UPDATE_COORDINATOR: {
          idFromName() {
            return "do-id";
          },
          get() {
            return scenario.stub;
          }
        }
      });

      const response = await worker.fetch(
        webhookRequest(JSON.stringify(update(304))),
        env,
        {}
      );

      assert.equal(response.status, 500, scenario.stage);
      assert.deepEqual(logs, [[scenario.expectedLog]], scenario.stage);
      const serialized = JSON.stringify(logs);
      for (const forbidden of [
        "650000",
        TELEGRAM_TOKEN,
        NOTION_TOKEN,
        "private finance",
        "upstream"
      ]) {
        assert.equal(serialized.includes(forbidden), false, scenario.stage);
      }
    } finally {
      console.error = originalConsoleError;
    }
  }
});

test("UpdateCoordinator committed replay avoids blockConcurrencyWhile and external work", async () => {
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

  assert.equal(context.gateCalls(), 0);
  assert.equal(externalCalls, 0);
});

test("UpdateCoordinator serializes same-ID I/O and persisted replay survives a new instance", async () => {
  const context = createDoContext();
  const firstCreateStarted = createDeferred();
  const releaseFirstCreate = createDeferred();
  let createCalls = 0;
  let confirmationCalls = 0;
  const externalFetch = async (url, options) => {
    if (isTelegramUrl(url)) {
      confirmationCalls += 1;
      return telegramResponse({ message_id: confirmationCalls });
    }
    if (isNotionCreate(url)) {
      createCalls += 1;
      if (createCalls === 1) {
        firstCreateStarted.resolve();
        await releaseFirstCreate.promise;
      }
      return new Response(JSON.stringify({ id: `created-${createCalls}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (isNotionQuery(url)) {
      const payload = requestPayload(options);
      if (payload.filter?.property === "Telegram Update ID") {
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
    const env = createEnv();
    const coordinator = new UpdateCoordinator(context.ctx, env);
    const first = callCoordinator(coordinator, update(3101));
    await firstCreateStarted.promise;

    const second = callCoordinator(coordinator, update(3101));
    await new Promise((resolve) => setImmediate(resolve));
    releaseFirstCreate.resolve();

    const responses = await Promise.all([first, second]);
    assert.deepEqual(await Promise.all(responses.map(responseJson)), [
      { status: "committed" },
      { status: "committed", duplicate: true }
    ]);
    assert.equal(createCalls, 1);
    assert.equal(confirmationCalls, 1);

    const restartedCoordinator = new UpdateCoordinator(context.ctx, env);
    const replay = await callCoordinator(restartedCoordinator, update(3101));
    assert.deepEqual(await responseJson(replay), {
      status: "committed",
      duplicate: true
    });
  });

  assert.equal(createCalls, 1);
  assert.equal(confirmationCalls, 1);
  assert.equal(context.gateCalls(), 0);
  assert.equal(context.record().status, "committed");
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

  assert.equal(context.gateCalls(), 0);
  assert.equal(createCalls, 1);
  assert.equal(context.record().status, "committed");
});

test("UpdateCoordinator reconciles an ambiguous income create without recreating it", async () => {
  const context = createDoContext();
  const telegramPayloads = [];
  let updateLookupCalls = 0;
  let createCalls = 0;
  const externalFetch = async (url, options) => {
    if (isTelegramUrl(url)) {
      telegramPayloads.push(requestPayload(options));
      return telegramResponse({ message_id: 1 });
    }
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
      if (payload.filter?.title) {
        return notionResponse([{
          id: "goal",
          properties: { "Mục Tiêu Hàng Tháng": { number: 12000000 } }
        }]);
      }
      return notionResponse([]);
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
  assert.equal(telegramPayloads.length, 1);
  assert.match(telegramPayloads[0].text, /^Đã ghi 650\.000đ cho hôm nay ✅/);
  assert.equal(context.record().status, "committed");
});

test("reconciled persisted income confirms once without create and committed replay is silent", async () => {
  const context = createDoContext({
    updateId: 3121,
    kind: "income",
    status: "needs_reconciliation",
    updatedAt: "2026-07-29T00:00:00.000Z"
  });
  const telegramPayloads = [];
  let createCalls = 0;
  const externalFetch = async (url, options) => {
    if (isTelegramUrl(url)) {
      telegramPayloads.push(requestPayload(options));
      return telegramResponse({ message_id: 1 });
    }
    if (isNotionCreate(url)) {
      createCalls += 1;
      throw new Error("reconciled completion must not create");
    }
    if (isNotionQuery(url)) {
      const payload = requestPayload(options);
      if (payload.filter?.property === "Telegram Update ID") {
        return notionResponse([{ id: "existing-income" }]);
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
    const first = await callCoordinator(coordinator, update(3121));
    const replay = await callCoordinator(coordinator, update(3121));

    assert.deepEqual(await responseJson(first), {
      status: "committed",
      reconciled: true
    });
    assert.deepEqual(await responseJson(replay), {
      status: "committed",
      duplicate: true
    });
  });

  assert.equal(createCalls, 0);
  assert.equal(telegramPayloads.length, 1);
  assert.equal(telegramPayloads[0].chat_id, 9001);
  assert.match(telegramPayloads[0].text, /^Đã ghi 650\.000đ cho hôm nay ✅/);
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
