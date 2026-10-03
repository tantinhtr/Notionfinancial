# Architecture and module ownership

This is a modular monolith: one Cloudflare Worker deployment, with feature modules and injected infrastructure. Financial rules, normal Telegram output, queries and cache freshness are preserved. Authenticated webhook processing failures now receive HTTP 200 and a best-effort error notification. It does not resolve network latency.

## Layout

Paths are relative to cloudflare-worker/.

- src/app: composition, webhook and update coordination.
- src/features/cashflow: account navigation, presentation and injected use-case orchestration.
- src/features/fund-budget: fund presentation, child labels and six-jar synchronization.
- src/features/income-goal: goal presentation and use-case orchestration.
- src/features/shared: compatibility exports for domain report helpers.
- src/domain: pure finance, budget, cashflow, parsing and ledger calculations; finance-rules.js, debt-resolver.js and string-parser.js are the public entry points.
- src/adapters: Notion, Telegram and state storage I/O.
- src/repositories: injected Notion/cache orchestration; finance-repository.js composes cashflow, fund-budget and grab repositories.
- src/jobs: six-jar synchronization and daily cron reminder orchestration.

## Dependency rules

Application composition imports each feature through its index.js public entry point. Features use their own files, shared helpers and domain code; they cannot import another feature or concrete infrastructure. Adapters cannot import features or application orchestration.

Components orchestrate an injected repository and Telegram client. Repositories query injected notionAdapter/kvCacheAdapter ports and call pure domain rules. Models, presenters and domain rules perform no external I/O. Presenters return text/keyboard data.

Boundary tests enforce literal production imports and common I/O violations. They are a guardrail, not a complete JavaScript static analyzer. Do not bypass them with computed imports or indirect dependencies.

## Repository ports

| Feature | Methods | Dependencies |
|---|---|---|
| cashflow | getMonthlyCashflow(forceRefresh) | Notion query, report cache, config, clock |
| fund-budget | getFundBudgetReport(forceRefresh) | Notion query, report cache, config, clock |
| income-goal | getGoalStatus(), findGrabIncomeByUpdateId(...), addGrabIncome(...) | Notion query/create, config, clock, invalidateReports callback |

See the implementations and module-contracts.test.js for exact argument/result contracts. createFinanceRepositories returns three separate ports. Components receive only their own repository.

After an income write, the injected invalidateReports callback invalidates cashflow and fund-budget caches in their original order. Composition owns this interaction; income-goal does not import other features.

The old createFinanceRepository aggregate and top-level facades remain compatible. New code uses narrow ports. Runtime exposes repositories.cashflow, repositories.fundBudget and repositories.incomeGoal.

## Where to make a change

| Request | Owner |
|---|---|
| Account navigation and cashflow output | features/cashflow |
| Parent or child budget text | features/fund-budget/presenters/group-lines.js |
| Fund calculations | domain/budget/model.js and domain/finance-rules.js |
| Historical queries and rollover inputs | repositories/fund-budget-repository.js |
| Repayment matching | domain/ledger |
| Income writes and duplicate lookup | repositories/grab-repository.js |
| Update lifecycle | app coordinator |
| Goal arithmetic | domain/finance/goal-model.js |
| Notion retries / Telegram transport | corresponding adapter |
| Module wiring / cross-report invalidation | app/runtime.js / repository composition |

## Data flows

Telegram update -> coordinator/router -> feature component -> repository -> injected Notion/cache -> pure model -> presenter -> Telegram adapter.

Scheduled six-jar sync -> fresh fund-budget report -> existing six-jar synchronization function. Interactive fund callbacks retain the existing synchronization order.

Keep one calculation for the report consumed by Telegram and Notion. Do not add allocation formulas to transport or presentation code. Transaction data remains authoritative; architecture changes do not authorize financial rule changes.

## Verification

Run npm test and npm run check from cloudflare-worker. module-contracts.test.js checks isolation, invalidation and scheduled sync. module-boundaries.test.js guards import direction. Existing regression tests cover financial behavior and output.

Passing local tests or a health endpoint does not prove a Telegram button works live. Record the deployed version and actual verification boundary.

## Shared policies and SOLID responsibilities

The October 3 shared-policy refactor keeps the existing feature boundaries and adds:

| Concern | Single owner |
|---|---|
| Report cache keys, TTL, optional failures and invalidation | src/services/report-cache.js |
| Date extraction and timezone formatter | src/domain/finance/calendar.js |
| Notion text and first relation decoding | src/domain/finance/notion-properties.js |
| Common repayment/reimbursement vocabulary and history hint | src/domain/ledger/transaction-language.js |
| JSON response parsing and token redaction | src/adapters/http-response.js |

SRP: repositories own report queries, the cache service owns caching policy, models own calculations, presenters own Telegram output, and adapters own transport. Domain recognition identifies an action; ledger modules retain responsibility for matching its accounts, parties and obligations.

Dependency inversion: the cache service receives a get/set/delete port and report-loader callback; it never creates a storage client. The existing repositories and components continue receiving their dependencies. Pure modules cannot import services or adapters, enforced by module-boundaries.test.js.

Interface segregation: each feature still receives its own repository port. No class hierarchy or generic framework was introduced. Open/closed and substitution principles are supported by the existing injected ports and contract tests rather than speculative abstractions.

To add a repayment synonym, edit the appropriate vocabulary fragment, then test both history eligibility and the applicable ledger interpretation. A recognized action alone never proves that a particular debt was repaid. Different debt types retain their own parsing and matching rules.

Numeric readers are intentionally separate where semantics differ (strict finite numbers versus coercion or formula/rollup support). Fund text reading also retains its original fallback behavior. Do not merge merely similar functions without checking their contracts.

Verification: baseline 305 tests; 310 tests after extraction. New coverage exercises cache hits/refresh/invalidation, cache failure fallback, month-boundary consistency and shared vocabulary. Existing adapter tests continue covering error handling. Financial amounts, allocation weights, report text and freshness behavior are unchanged by this refactor.

## Project-wide modularity

See [the complete module map](module-map.md) for all source ownership, fund calculation/presentation submodules, ledger validation and application entry points.

All production files are covered by the dependency matrix and cycle checks in project-architecture.test.js. Pure nested models/presenters receive the same protection as their top-level entry points. The root bot.js is now a compatibility facade; app/bot-router.js owns routing, and app/legacy-bot.js preserves legacy initialization.

npm run check now checks every production JavaScript file. Existing boundary checks remain in place alongside the full-project matrix.

## Layered refactor (2026-10-04)

runtime.js is the composition root: it creates raw notion-adapter.js and telegram-adapter.js clients, the kv-cache-adapter.js wrapper, repositories and feature components. Telegram text truncation belongs to app/telegram-presenter.js. Database IDs and existing financial configuration stay in config.js.

KV serialization is in the adapter. Cache keys/TTL/failure policy stay in services/report-cache.js; runtime supplies the existing `report:` namespace. A Grab write invokes injected invalidation, which calls cache.delete for the two existing report keys. services/cache-port.js only bridges legacy state-port callers.

Old feature model/repository paths and adapter names remain export-only compatibility facades. New calculation owners are under domain; new data orchestration owners are under repositories. Supporting modules stay small rather than merging calculations into three large files. The debt resolver consumes supplied transaction history; repositories retrieve that history.

### Webhook failure contract

app/index.js validates the route, secret and update shape, then forwards to the existing Durable Object coordinator. Processing failures after validation return HTTP 200 with status processing_failed, and schedule a friendly notification only for the configured user. Notification failure cannot cause another HTTP 500. Authentication and malformed requests retain 401/400 responses.

[Telegram retries webhook delivery on non-2xx responses](https://core.telegram.org/bots/api#setwebhook). Consequently a failed update acknowledged with 200 is not automatically redelivered by Telegram. HTTP 200 does not mean a Notion write succeeded. No background retry queue was added. Existing update-ID deduplication and uncertain-write reconciliation still apply when an update is replayed; the notification advises checking Notion before re-entering an income.

Verification: 321 automated tests passed; 104 production modules passed syntax checks. Differential comparison against 5b7f57f checked 145 facade calls across 83 finance tests: complete return values, errors and input side effects matched. Live Telegram verification remains a separate release check.
