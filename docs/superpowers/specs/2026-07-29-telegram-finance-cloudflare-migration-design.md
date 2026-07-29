# Telegram Finance Bot Cloudflare Migration Design

## Objective

Replace the Google Apps Script runtime completely with Cloudflare Workers while
preserving the currently approved Telegram interface and all Notion-backed
finance rules.

The migration is complete only when Telegram messages, inline-button callbacks,
Notion reads and writes, report caching, duplicate-update protection, and the
daily reminder all run on Cloudflare. Google Apps Script must no longer poll,
receive webhooks, or run scheduled triggers.

## Current System

The current bot is implemented in
`outputs/telegram-finance-bot-fixed.js`. It uses:

- `pollTelegram()` from an Apps Script minute trigger.
- `UrlFetchApp` for Telegram and Notion HTTP requests.
- `PropertiesService` for credentials and the last Telegram update ID.
- `CacheService` for the 60-second monthly report cache.
- `LockService` to serialize update processing.
- `Utilities` for dates and formatting.
- `dailyReminder()` from an Apps Script scheduled trigger.

The finance aggregation, classification, Telegram copy, and inline-keyboard
behavior are approved behavior and must not be redesigned during this
migration.

## Target Architecture

### Worker HTTP handler

The Worker exposes:

- `GET /health`: returns a small JSON status response without exposing secrets.
- `POST /telegram/webhook`: accepts Telegram updates only when the
  `X-Telegram-Bot-Api-Secret-Token` header matches `WEBHOOK_SECRET`.
- All other routes return `404`.

The handler validates the request, rejects unauthorized requests, parses one
Telegram update, checks whether its `update_id` was already processed, and then
dispatches it through the existing command and callback logic.

### Notion and Telegram clients

Google-specific `UrlFetchApp` calls are replaced with standards-based
asynchronous `fetch()` calls.

The Notion client:

- Uses the same database IDs and Notion API version as the existing bot.
- Preserves pagination and checks every HTTP status and response body.
- Runs independent database queries concurrently with `Promise.all`.

The Telegram client:

- Preserves the current text and inline keyboards.
- Checks Telegram's `ok` field and HTTP status.
- Supports `sendMessage`, `answerCallbackQuery`, `setWebhook`,
  `getWebhookInfo`, and `deleteWebhook`.

### State, coordination, and cache

A Workers KV namespace named `BOT_STATE` stores the 60-second monthly cashflow
report cache. KV is not the correctness boundary for duplicate Telegram
updates because it is eventually consistent.

A SQLite-backed Durable Object namespace named `UPDATE_COORDINATOR` provides
strong coordination. Every Telegram `update_id` maps to one Durable Object
instance. Its persistent state is one of `in_progress`, `committed`,
`retryable`, or `needs_reconciliation`.

Concurrent deliveries of the same update are serialized through that object.
Committed updates acknowledge without processing again. Retryable updates may
run again.

Numeric Grab-income updates also use a rich-text property named
`Telegram Update ID` in the Notion income database. Before creating a page, the
Worker queries this property for the Telegram `update_id`; after creation, the
same ID is stored on the page.

If a Notion create request has an ambiguous outcome, the coordinator never
blindly creates the page again. It queries by `Telegram Update ID`. A confirmed
row becomes `committed`; a still-ambiguous outcome becomes
`needs_reconciliation`, sends a concise warning to the authorized user, and
requires checking Notion before another write. This favors no duplicate
financial entry over automatic retry in the rare unknowable external-failure
window.

### Scheduled reminder

A Worker `scheduled()` handler replaces the Apps Script daily trigger. The
production Cron Trigger runs at `14:00 UTC`, equivalent to `21:00` in
`Asia/Ho_Chi_Minh`.

The reminder uses the same target calculation and approved Vietnamese message
copy as `dailyReminder()`.

## Code Structure

The migration creates a focused Worker project:

- `cloudflare-worker/wrangler.jsonc`: Worker, KV, Cron, compatibility, and
  observability configuration.
- `cloudflare-worker/src/index.js`: HTTP and scheduled entry points only.
- `cloudflare-worker/src/config.js`: environment validation and stable database
  identifiers.
- `cloudflare-worker/src/notion.js`: Notion HTTP client and pagination.
- `cloudflare-worker/src/telegram.js`: Telegram HTTP client.
- `cloudflare-worker/src/state.js`: KV report caching.
- `cloudflare-worker/src/coordinator.js`: Durable Object update serialization,
  persistent status, and ambiguous-write reconciliation.
- `cloudflare-worker/src/finance.js`: existing finance parsing, aggregation,
  classification, and formatting adapted to normal JavaScript.
- `cloudflare-worker/src/bot.js`: commands, callbacks, keyboards, and update
  dispatch.
- `cloudflare-worker/test/*.test.js`: unit and integration-style tests using
  mocked Telegram, Notion, KV, and time.

The existing Apps Script source remains untouched as a rollback reference until
production verification is complete.

## Configuration and Secrets

The Worker uses encrypted Cloudflare secrets:

- `TELEGRAM_TOKEN`
- `NOTION_TOKEN`
- `WEBHOOK_SECRET`

The following non-secret variable is configured separately:

- `ALLOWED_USER_ID`

Secrets must never be committed, printed in logs, or pasted into project files.
Database IDs and `MONTHLY_EXPENSE_LIMIT=5500000` remain non-secret
configuration.

The Notion income database gains one technical rich-text property:
`Telegram Update ID`. Existing rows may leave it empty.

## Behavior Preservation

The Cloudflare version must preserve:

- `/start` opening the monthly account overview.
- `/muctieu` opening the Grab income goal report.
- The five approved account buttons and current navigation.
- Account to total income/expense, then category buttons, then text transaction
  details.
- Shared income, expense, transfer, unusual-spending, and fund classification.
- Adding a numeric Telegram message as today's Grab income.
- The 3,900-character Telegram safety limit.
- Authorization by the configured Telegram user ID.

No `/thang` or `/chi` command is reintroduced.

## Error Handling and Observability

- Invalid webhook secret: `401`.
- Invalid JSON: `400`.
- Unauthorized Telegram user: acknowledge without exposing data.
- Notion or Telegram failure: log a redacted structured error and return `500`
  so Telegram may retry.
- Duplicate update: return `200` without processing.
- `/health`: report deployment version and binding availability, never secret
  values.
- Cloudflare Worker logs are enabled for deployment diagnosis.

Logs must not include Telegram tokens, Notion tokens, webhook secrets, or full
Notion response bodies containing user finance data.

## Test Strategy

1. Port the current 61 regression cases so finance totals, labels, keyboards,
   and navigation remain unchanged.
2. Add Worker-specific tests for route handling, webhook-secret validation,
   unauthorized users, duplicate updates, KV expiration, Notion pagination,
   idempotent Grab-income writes, concurrent duplicate delivery, ambiguous
   Notion-create reconciliation, Telegram failures, and scheduled reminders.
3. Deploy with no Telegram webhook and verify `/health`.
4. Send fixture Telegram updates directly to the Worker using a test secret and
   mocked or non-mutating paths.
5. Query `getWebhookInfo`, set the production webhook with
   `allowed_updates=["message","edited_message","callback_query"]`, and verify
   `/start`, `/muctieu`, one account drill-down, and one callback detail live.
6. Verify the Cron Trigger configuration without sending an extra production
   reminder.

## Migration and Rollback

Migration order:

1. Build and test the Worker locally.
2. Add the `Telegram Update ID` property to the Notion income database.
3. Create and bind `BOT_STATE` and the SQLite-backed `UPDATE_COORDINATOR`.
4. Add Worker secrets and variables.
5. Deploy and verify `/health`.
6. Set the Telegram webhook with the secret token and `max_connections=1`.
7. Verify live Telegram behavior, coordinator state, and Cloudflare logs.
8. Delete every Apps Script trigger and confirm Apps Script no longer receives
   or polls Telegram updates.

Rollback during the migration:

1. Call Telegram `deleteWebhook` without dropping pending updates.
2. Run the existing Apps Script `installPolling()`.
3. Diagnose the Worker while the old bot continues operating.

After final acceptance, Apps Script remains only as inert reference code and is
not part of production operation.

## Resource Limits

The initial deployment stays on Workers Free. External Telegram and Notion wait
time is not CPU time, but JSON parsing and aggregation are CPU work. Production
logs and tests must confirm that the current finance dataset stays within the
free-plan CPU limit. No paid Cloudflare plan is enabled automatically; any need
for a paid plan requires a separate decision.

## Acceptance Criteria

- Telegram normally begins processing commands and callbacks within seconds,
  without minute polling latency.
- Approved report totals and navigation match the existing bot.
- Concurrent/retried numeric Grab updates create at most one confirmed Notion
  page during normal processing.
- An ambiguous Notion create outcome is never blindly recreated; it is either
  reconciled by `Telegram Update ID` or surfaced as `needs_reconciliation`.
- The daily reminder runs from Cloudflare Cron.
- `getWebhookInfo` reports the Cloudflare webhook with no pending error.
- Apps Script has no active Telegram polling, webhook, or reminder trigger.
- No secret appears in source, logs, tests, or chat output.
