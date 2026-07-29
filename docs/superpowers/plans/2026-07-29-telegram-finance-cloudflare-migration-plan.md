# Telegram Finance Bot Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Apps Script runtime completely with a Cloudflare Worker while preserving the approved Telegram finance bot behavior.

**Architecture:** A module Worker receives Telegram webhooks, serializes each
Telegram update through a SQLite-backed Durable Object, queries Notion through
asynchronous REST clients, stores short-lived report cache state in Workers KV,
and sends the daily reminder from a Cron Trigger. The production webhook is
switched only after local tests, deployment health checks, and direct Worker
checks pass.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers, Wrangler, Workers KV, Node.js built-in test runner, Telegram Bot API, Notion REST API.

## Global Constraints

- Preserve the current `/start`, `/muctieu`, account navigation, report text, finance classification, and numeric Grab-income behavior.
- Do not reintroduce `/thang` or `/chi`.
- Store `TELEGRAM_TOKEN`, `NOTION_TOKEN`, and `WEBHOOK_SECRET` only as Cloudflare encrypted secrets.
- Configure `ALLOWED_USER_ID` as a non-secret Worker variable.
- Use the existing Notion database IDs, Notion API version `2022-06-28`, timezone `Asia/Ho_Chi_Minh`, and `MONTHLY_EXPENSE_LIMIT=5500000`.
- Add the approved rich-text property `Telegram Update ID` to the Notion income database.
- Coordinate duplicate delivery through a SQLite-backed Durable Object;
  ambiguous Notion writes are reconciled or surfaced without blind recreation.
- Keep Google Apps Script active until the Cloudflare Worker passes production verification; then remove every Apps Script trigger.
- Do not enable a paid Cloudflare plan without a separate user decision.
- The working directory is not a Git repository, so commit steps are omitted and file-level verification replaces commit checkpoints.

---

### Task 1: Create the Worker Project and Runtime Configuration

**Files:**
- Create: `cloudflare-worker/package.json`
- Create: `cloudflare-worker/wrangler.jsonc`
- Create: `cloudflare-worker/src/config.js`
- Create: `cloudflare-worker/test/config.test.js`

**Interfaces:**
- Produces: `getConfig(env)` returning validated Worker configuration.
- Produces: Wrangler variable `ALLOWED_USER_ID` and Cron `0 14 * * *`.
- The production `BOT_STATE` binding is added after its namespace is created in
  Task 6.

- [ ] **Step 1: Write configuration tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";

test("getConfig validates required bindings", () => {
  assert.throws(() => getConfig({}), /TELEGRAM_TOKEN/);
});

test("getConfig parses the allowed user and stable defaults", () => {
  const config = getConfig({
    TELEGRAM_TOKEN: "telegram",
    NOTION_TOKEN: "notion",
    WEBHOOK_SECRET: "secret",
    ALLOWED_USER_ID: "42",
    BOT_STATE: {}
  });
  assert.equal(config.allowedUserId, 42);
  assert.equal(config.monthlyExpenseLimit, 5500000);
  assert.equal(config.timezone, "Asia/Ho_Chi_Minh");
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node --test cloudflare-worker/test/config.test.js`

Expected: FAIL because `src/config.js` does not exist.

- [ ] **Step 3: Add the package and Worker configuration**

`package.json` must set `"type": "module"` and define:

```json
{
  "scripts": {
    "test": "node --test test/*.test.js",
    "check": "node --check src/index.js",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4.0.0"
  }
}
```

`wrangler.jsonc` must declare `main`, a current compatibility date, the
the non-secret variables, observability, and:

```json
"triggers": { "crons": ["0 14 * * *"] }
```

- [ ] **Step 4: Implement `getConfig(env)`**

Validate all required values, parse `ALLOWED_USER_ID` as a finite number, and
return the exact database IDs from the approved Apps Script source.

- [ ] **Step 5: Run the configuration tests**

Run: `cd cloudflare-worker; npm install; npm test`

Expected: both configuration tests PASS and no production secret is present in
`wrangler.jsonc`.

### Task 2: Implement Telegram, Notion, and KV Adapters

**Files:**
- Create: `cloudflare-worker/src/telegram.js`
- Create: `cloudflare-worker/src/notion.js`
- Create: `cloudflare-worker/src/state.js`
- Create: `cloudflare-worker/test/adapters.test.js`

**Interfaces:**
- Produces: `createTelegramClient(config, fetchImpl)`.
- Produces: `createNotionClient(config, fetchImpl)`.
- Produces: `createStateStore(kv)`.
- Consumes: `getConfig(env)` from Task 1.

- [ ] **Step 1: Write failing adapter tests**

Cover:

```js
test("Notion query follows next_cursor pagination", async () => {});
test("Notion error includes status without leaking token", async () => {});
test("Telegram rejects ok=false responses", async () => {});
test("state cache uses a 60 second expiration", async () => {});
test("processed update keys expire and suppress duplicates", async () => {});
```

Use an in-memory KV fake that records `put` options and a queued `fetch` fake
that returns deterministic JSON responses.

- [ ] **Step 2: Run tests and verify missing exports**

Run: `cd cloudflare-worker; npm test`

Expected: FAIL because the adapter modules do not exist.

- [ ] **Step 3: Implement the Notion client**

Use this URL construction:

```js
fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, options);
```

Send the `Authorization` and `Notion-Version` headers, use `page_size: 100`, and
follow the pagination cursor. Expose:

```js
queryDatabase(databaseId, filter)
createPage(databaseId, properties)
```

Throw redacted errors containing the operation, status, and Notion error message
but never the authorization header.

- [ ] **Step 4: Implement the Telegram client**

Expose:

```js
call(method, payload)
sendMessage(chatId, text, replyMarkup)
answerCallbackQuery(callbackQueryId)
setWebhook(url, secretToken)
getWebhookInfo()
deleteWebhook()
```

Apply the existing 3,900-character text cap before `sendMessage`.

- [ ] **Step 5: Implement the KV state adapter**

Expose:

```js
hasProcessedUpdate(updateId)
markProcessedUpdate(updateId)
getReportCache(key)
putReportCache(key, value, ttlSeconds = 60)
deleteReportCache(key)
```

Processed update keys must have a bounded expiration of seven days.

- [ ] **Step 6: Run adapter tests**

Run: `cd cloudflare-worker; npm test`

Expected: all Task 1 and Task 2 tests PASS.

### Task 3: Port the Pure Finance Domain Regressions

**Files:**
- Create: `cloudflare-worker/src/finance.js`
- Create: `cloudflare-worker/test/finance-regression.test.js`
- Reference: `outputs/telegram-finance-bot-fixed.js`
- Reference: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Produces pure parsing, aggregation, classification, formatting, keyboard, and
  callback-token helpers imported by `bot.js`.
- No Cloudflare, Telegram, Notion, KV, or clock globals are allowed in this
  module.

- [ ] **Step 1: Copy the existing pure regression fixtures**

Move the pure finance, formatting, keyboard, and callback-token cases from
`outputs/telegram-finance-bot.test.js` into ES-module tests. Replace the Apps
Script VM loader with direct imports from `src/finance.js`. Preserve every
existing expected total, label, callback value, keyboard row, and transaction
line. Record a mapping of all 61 legacy tests: pure cases belong to this task;
Notion/cache/repository cases belong to Task 4; command, callback, webhook, and
update-deduplication cases belong to Task 5.

- [ ] **Step 2: Run the regression tests and verify missing exports**

Run: `cd cloudflare-worker; node --test test/finance-regression.test.js`

Expected: FAIL because the finance module is not implemented.

- [ ] **Step 3: Port pure finance behavior**

Port the approved functions from the Apps Script source, including:

- Property readers and normalization.
- Monthly goal and cashflow aggregation.
- Expense nature classification and shared report analysis.
- Account, direction, category, and transaction formatting.
- Fund and budget formatting.
- Telegram inline keyboards and callback parsing.
- Money, date, and safe-text formatting.

Replace `Utilities.formatDate` and `Utilities.formatString` with deterministic
standard JavaScript helpers that accept the clock/date as an argument.

- [ ] **Step 4: Run all finance regressions**

Run: `cd cloudflare-worker; node --test test/finance-regression.test.js`

Expected: every selected pure regression passes with no expected-value changes,
and the 61-test mapping has no unassigned legacy case.

- [ ] **Step 5: Check module purity**

Run:

```powershell
rg -n "UrlFetchApp|PropertiesService|CacheService|LockService|ScriptApp|Utilities|ContentService" cloudflare-worker/src/finance.js
```

Expected: no matches.

### Task 4: Implement Async Finance Queries and Idempotent Income Writes

**Files:**
- Create: `cloudflare-worker/src/repository.js`
- Create: `cloudflare-worker/test/repository.test.js`

**Interfaces:**
- Produces: `createFinanceRepository({ notion, state, config, now })`.
- Produces async methods used by `bot.js`: `getGoalStatus()`,
  `getMonthlyCashflow(forceRefresh)`, `getFundBudgetReport()`, and
  `addGrabIncome(updateId, dateISO, amount)`.
- Consumes the pure builders from `finance.js`.

- [ ] **Step 1: Write failing repository tests**

Test concurrent monthly queries, pagination-compatible rows, 60-second cache
reuse, forced refresh, and:

```js
test("addGrabIncome does not create a second page for the same update id", async () => {
  // First lookup returns an existing row whose Telegram Update ID is "9001".
  // Assert createPage is never called.
});
```

Also assert a new page includes:

```js
"Telegram Update ID": {
  rich_text: [{ text: { content: "9001" } }]
}
```

Port the legacy Notion query, pagination, cache, refresh, and monthly
aggregation cases assigned to Task 4 by the Task 3 mapping.

- [ ] **Step 2: Run tests and verify missing repository**

Run: `cd cloudflare-worker; node --test test/repository.test.js`

Expected: FAIL because `src/repository.js` does not exist.

- [ ] **Step 3: Implement parallel monthly reads**

Issue the account, income, other-income, expense, goal, category, budget, and
transfer queries concurrently with `Promise.all`; pass rows to the pure monthly
cashflow builder and cache the result for 60 seconds.

- [ ] **Step 4: Implement idempotent Grab-income writes**

Query `INCOME_DB` with a rich-text `equals` filter on `Telegram Update ID`.
Create the page only when no matching row exists. Preserve the existing title,
amount, date, and goal relation properties, then clear the monthly cache.

- [ ] **Step 5: Run repository tests**

Run: `cd cloudflare-worker; npm test`

Expected: all configuration, adapter, finance, and repository tests PASS.

### Task 5: Implement Bot Dispatch, HTTP Webhook, and Cron

**Files:**
- Create: `cloudflare-worker/src/bot.js`
- Create: `cloudflare-worker/src/index.js`
- Create: `cloudflare-worker/src/coordinator.js`
- Create: `cloudflare-worker/test/bot.test.js`
- Create: `cloudflare-worker/test/worker.test.js`
- Create: `cloudflare-worker/test/coordinator.test.js`
- Modify: `cloudflare-worker/src/telegram.js`
- Modify: `cloudflare-worker/test/adapters.test.js`
- Modify: `cloudflare-worker/src/repository.js`
- Modify: `cloudflare-worker/test/repository.test.js`
- Modify: `cloudflare-worker/wrangler.jsonc`

**Interfaces:**
- Produces: `createBot({ telegram, repository, state, config, now })`.
- Produces: `processUpdate(update)` and `sendDailyReminder()`.
- Produces: SQLite-backed `UpdateCoordinator` Durable Object behavior keyed by
  Telegram `update_id`.
- Worker default export provides `fetch(request, env, ctx)` and
  `scheduled(controller, env, ctx)`.

- [ ] **Step 1: Write failing bot dispatch tests**

Cover `/start`, `/muctieu`, numeric Grab income, unauthorized users, callback
acknowledgment, account/direction/category callbacks, unknown text, and
duplicate updates. Assert that `/thang` and `/chi` are not command routes.
Port the legacy command, callback, Telegram error, update deduplication, and
polling-equivalent behavior cases assigned to Task 5 by the Task 3 mapping.

Add coordinator tests for:

- Two concurrent deliveries of the same numeric update create at most one
  Notion page.
- A committed update acknowledges without another bot call.
- A retryable pre-write failure can run again.
- An ambiguous Notion create is reconciled by `Telegram Update ID`.
- A still-ambiguous result becomes `needs_reconciliation`, warns the authorized
  user, and never invokes create again automatically.

- [ ] **Step 2: Implement async command and callback dispatch**

Translate the existing `processUpdate_()` branches to awaited service calls.
Call `answerCallbackQuery` before expensive Notion work. Mark an update
processed only after its operation succeeds.

- [ ] **Step 3: Write failing Worker route tests**

Cover:

```js
test("GET /health reports binding status without secret values", async () => {});
test("POST webhook rejects a wrong Telegram secret with 401", async () => {});
test("POST webhook rejects malformed JSON with 400", async () => {});
test("POST webhook returns 200 after successful processing", async () => {});
test("unknown route returns 404", async () => {});
test("scheduled event sends the daily reminder", async () => {});
```

- [ ] **Step 4: Implement Worker entry points**

Validate `X-Telegram-Bot-Api-Secret-Token` with a timing-safe comparison where
available. Route each accepted update to `UPDATE_COORDINATOR` using a Durable
Object ID derived from `String(update.update_id)`. The coordinator owns awaited
processing and persistent transitions through `in_progress`, `committed`,
`retryable`, and `needs_reconciliation`. Return JSON responses with no
financial payload.

The `scheduled()` handler must call `ctx.waitUntil(bot.sendDailyReminder())`.
Telegram `setWebhook` must send `max_connections: 1` as defense-in-depth.

- [ ] **Step 5: Run the full local suite**

Run:

```powershell
cd cloudflare-worker
npm test
npm run check
npx wrangler deploy --dry-run
```

Expected: all tests PASS, syntax check PASS, and Wrangler produces a valid dry
run bundle.

### Task 6: Provision Cloudflare and Prepare Production Without Switching Telegram

**Files:**
- Modify: `cloudflare-worker/wrangler.jsonc`
- Create locally but do not commit: `cloudflare-worker/.dev.vars.example`

**Interfaces:**
- Produces the deployed Worker URL, a bound `BOT_STATE` namespace, and the
  SQLite-backed `UPDATE_COORDINATOR` Durable Object namespace.
- Does not change the Telegram webhook.

- [ ] **Step 1: Authenticate Wrangler to the approved Cloudflare account**

Run: `cd cloudflare-worker; npx wrangler login`

Expected: the browser confirms the account containing Worker
`notion-finance-bot`.

- [ ] **Step 2: Create the KV namespace**

Run:

```powershell
npx wrangler kv namespace create BOT_STATE
```

Copy the returned namespace ID exactly into the `kv_namespaces` entry in
`wrangler.jsonc`.

Confirm `wrangler.jsonc` declares the exported coordinator class and binds it as
`UPDATE_COORDINATOR` with the SQLite storage backend.

- [ ] **Step 3: Add production secrets without exposing them**

Enter values interactively:

```powershell
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

Use a newly generated high-entropy webhook secret. Do not print or store any
secret in shell history, source, logs, or chat.

- [ ] **Step 4: Add the Notion idempotency property**

In database `1178ffb5-256b-81a1-8052-c91e72fb0eb6`, create a rich-text property
named exactly `Telegram Update ID`. Hide it in normal Notion views if desired.

- [ ] **Step 5: Deploy without switching the Telegram webhook**

Run: `npx wrangler deploy`

Expected: deployment succeeds at the existing
`notion-finance-bot.hongthamcute04.workers.dev` Worker.

- [ ] **Step 6: Verify health and logs**

Run:

```powershell
Invoke-RestMethod https://notion-finance-bot.hongthamcute04.workers.dev/health
npx wrangler tail
```

Expected: health is `ok`, required bindings are present, and logs contain no
secret or full finance payload.

### Task 7: Switch Telegram, Verify Production, and Retire Apps Script

**Files:**
- Modify only if defects are found: `cloudflare-worker/src/*`
- Modify only if tests are added for defects: `cloudflare-worker/test/*`

**Interfaces:**
- Makes the Cloudflare Worker the sole production runtime.
- Removes all active Apps Script triggers after live acceptance.

- [ ] **Step 1: Record the current Telegram webhook state**

Call `getWebhookInfo` through the Telegram client or a one-off redacted setup
script. Confirm the current state before changing it.

- [ ] **Step 2: Set the Cloudflare webhook**

Call `telegram.setWebhook()` with the exact production URL and the same secret
value entered interactively in Task 6:

```js
await telegram.setWebhook(
  "https://notion-finance-bot.hongthamcute04.workers.dev/telegram/webhook",
  process.env.WEBHOOK_SECRET
);
```

The client sends `allowed_updates` as
`["message", "edited_message", "callback_query"]` and
`drop_pending_updates: false`, plus `max_connections: 1`. Expected: Telegram
returns `ok: true`.

- [ ] **Step 3: Run live read-only Telegram checks**

Verify in order:

1. `/start` responds within seconds and shows the approved account overview.
2. `/muctieu` shows the approved Grab target report.
3. One account button opens total income and total expense.
4. One direction opens category buttons.
5. One category opens text transaction details.

Compare output with the existing approved bot and inspect Worker errors/CPU.

- [ ] **Step 4: Run one controlled write check**

Send one agreed numeric Grab amount, verify exactly one Notion page was created
with its `Telegram Update ID`, and replay the same fixture update directly to
the Worker to verify no second page is created.

- [ ] **Step 5: Confirm webhook health**

Call `getWebhookInfo`.

Expected: the Cloudflare URL is active, `max_connections` is `1`,
`pending_update_count` is stable or falling, and `last_error_message` is empty.

- [ ] **Step 6: Remove every Apps Script trigger**

Open the Apps Script project's Triggers page and delete:

- The minute `pollTelegram` trigger.
- The old `dailyReminder` trigger.
- Any other Telegram webhook or polling trigger belonging to this bot.

Do not delete the source project until the Cloudflare bot has remained healthy
through the final checks.

- [ ] **Step 7: Verify Cloudflare is the sole runtime**

Send `/start` again after Apps Script triggers are gone, confirm a single
response arrives within seconds, and verify the Worker log received that
update.

- [ ] **Step 8: Verify the scheduled configuration**

Run: `npx wrangler deployments list` and inspect the Worker settings.

Expected: production contains Cron `0 14 * * *`, KV `BOT_STATE`, Durable Object
`UPDATE_COORDINATOR`, all required bindings, and no Apps Script trigger remains
active.

## Rollback Procedure

If a production verification step fails:

1. Call Telegram `deleteWebhook` with `drop_pending_updates=false`.
2. Run `installPolling()` once in the preserved Apps Script project.
3. Confirm the old bot responds before diagnosing the Worker.
4. Fix the Worker with a failing regression test, redeploy, and repeat Task 7.
