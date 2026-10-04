# Architecture and ownership

One Cloudflare Worker, organized into feature-owned modules. JavaScript factories and explicit object contracts implement SRP/DIP without a DI framework. app/runtime.js is the production composition root.

## Canonical owners

| Module | Responsibility |
|---|---|
| modules/cashflow | Account navigation, cashflow calculation, application report/cache orchestration, Notion data reads |
| modules/income-goal | Income validation/write orchestration, goal calculation, confirmation/reminder views and Notion data access |
| modules/fund-budget | Budget/children/rollover/opening allocation, history orchestration, report and synchronization outcome |
| modules/financial-ledger | Pure personal/fund loan and previous-month advance evaluation and evidence validation |
| modules/six-jar-sync | Project a computed report into six-jar values, select month row and persist schema/page changes |
| modules/telegram-bot | Authorized message/callback routing, common presentation, delivery truncation |
| modules/update-processing | Durable update state machine through injected storage/mutex/execution/reconciliation ports |
| modules/shared | Raw transports, generic cache policy and genuinely shared finance primitives |
| app and jobs | HTTP/security, Durable Object shell, dependency injection and scheduled bridges |

See [complete current source tree](module-map.md) and [baseline whole-repo audit](project-architecture-audit.md).

## Dependency contracts

Controllers consume application services and Telegram delivery. Services consume injected repository/cache/clock ports and pure calculations. Repositories own Notion query/property mapping, not report calculation. Raw adapters own HTTP or KV serialization. Each module exposes index.js; cross-module internal imports are forbidden.

JSDoc *.contracts.js files describe data shapes, errors and side effects. They are documentation, not runtime type enforcement; contract tests exercise implementations. Some pure rules still accept Notion-shaped property rows as before. A replacement backend must provide compatible data or mapping; do not claim zero migration effort merely because a port exists.

Financial-ledger receives openingPlan from budget calculation. It never imports budget. createBudgetCalculator receives evaluateFinanceLedger from runtime. This prevents fund-budget -> ledger -> fund-budget cycles, including historical rollover.

Income receives an invalidation callback. Runtime calls cashflow.invalidate then fundBudget.invalidate. It retains the existing stop-on-first-delete-error behavior and optional invalidation failure after successful income creation. Module cache keys remain daily monthly-cashflow:<date> and fund-budget:<date>; shared policy retains TTL 60 and runtime supplies report: prefix.

## Runtime flows

- HTTP -> secret/update validation -> Durable Object -> update-processing service -> Telegram router -> feature controller/service.
- Cashflow: service loads/cache-controls data through its data repository, runs pure rules, controller renders navigation.
- Budget: service chooses current/history datasets, runs injected calculator and rollover; controller prepares view, invokes injected synchronization operation, appends the original warning on sync failure, then sends.
- Income: service validates amount/date/update ID, checks duplicate, writes once, invalidates reports, calculates confirmation status. Controller handles text/authorization/presentation.
- Daily 21:00 UTC+7: cron-reminder calls income service and injected presentation/delivery, not a controller.
- Every 15 minutes: fresh budget report -> same six-jar sync service used interactively.
- Financial debt reconciliation is distinct from reconciliation of an uncertain Notion write in update-processing.

## Compatibility

Old domain/, features/, adapters/, repositories/ paths and root exports remain compatibility entry points. Most are export-only; old factories delegate to new services in their original shape. app/legacy-components.js preserves old controller factory signatures and app/finance-composition.js binds pure legacy builder signatures. No canonical module imports old paths. Production runtime uses new module APIs.

The repositories key returned by runtime remains a compatibility alias for application service ports; concrete data repositories are injected into those services. It is not an instruction to put business rules in persistence classes.

## Webhook failure contract

Authenticated valid processing failures still return HTTP 200 processing_failed with best-effort user notification. Bad secrets and malformed inputs retain 401/400. Telegram does not automatically redeliver a 200 response; 200 does not confirm a successful Notion write. Existing durable deduplication and uncertain-write reconciliation remain; no new retry queue was introduced.

## Maintenance rules and verification

- Add a rule in its owning module. Keep presenters free of calculation/storage, and rules free of I/O/clock reads.
- Keep real distinctions in numeric fallback, expense classification and loan interpretation; do not merge superficially similar helpers.
- Preserve 136972 October carryover, 2150000 rent, 2:2:2:1 weights, configured source accounts and child-only remaining text unless separately authorized.
- project-architecture.test.js checks every production file, cycles, public APIs, outward dependencies and canonical-to-legacy imports. It checks literal imports/common calls, not arbitrary JavaScript semantics.
- npm test and npm run check are local checks. Full financial/ledger differential validation against 5d55827 compared 311 calls across 164 tests including errors and input side effects.
- Browser access failed during this refactor; real Telegram button verification is not established by health 200 or unit tests.
