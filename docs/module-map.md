# Project-wide module map

This map describes the production source after the project-wide modularity refactor. All production JavaScript files are covered by project-architecture.test.js. Tests, scripts, assets and documentation have separate support roles and are not runtime feature modules.

## Architecture responsibilities

| Area | Responsibility and boundary |
|---|---|
| src/index.js | Worker entry point only |
| Root compatibility facades | Preserve public imports; no implementation |
| config.js | Bindings and financial configuration |
| app/runtime.js | Construct and inject dependencies |
| app/bot-router.js | Dispatch authorized messages and callbacks |
| app/legacy-bot.js | Preserve legacy component composition |
| app/webhook.js | HTTP endpoint routing and update validation |
| app/http-security.js | Health/binding visibility and webhook authentication |
| app/coordinator-gateway.js | Forward updates to Durable Object and sanitize response metadata |
| app/update-coordinator.js | Cloudflare Durable Object integration |
| app/coordinator-handler.js | Update lifecycle, duplicate suppression and reconciliation |
| app/scheduled.js | Dispatch scheduled reminder or six-jar sync |
| app/bot-presenter.js | Application-level fallback text and keyboard |
| features/cashflow | Account cashflow model, presentation, callbacks and report queries |
| features/income-goal | Income writes, goal calculation, presentation and reminder use case |
| features/fund-budget | Fund report orchestration and its internal pure modules |
| features/shared | Pure report date/query helpers |
| domain/finance | Shared finance primitives, classification and input interpretation |
| domain/ledger | Ledger orchestration, obligation matching and arithmetic |
| services/report-cache.js | Optional cache policy through an injected state port |
| repositories/finance-repository.js | Feature repository composition and invalidation wiring |
| adapters | Notion/Telegram/state transport implementations |
| jobs | Scheduled six-jar use case orchestration |
| test | Behavioral, integration-contract and architecture regression checks |
| scripts/check-syntax.js | Parse every production source file |
| wrangler.jsonc / CI | Deployment bindings/schedules and verification commands |
| assets / docs | Static files and contributor documentation |

## Fund-budget internals

The public model function keeps its original signature and output. It now orchestrates ledger -> expense summary -> fund groups -> report result.

| Internal module | Responsibility |
|---|---|
| models/catalog.js | Build account/category/group aliases and fixed-budget catalog |
| models/assignment.js | Interpret expense notes referring to a fund or child |
| models/expenses.js | Attribute expenses and aggregate accounts/categories |
| models/groups.js | Assemble each fund from transfers, children and ledger evidence |
| models/transfers.js | Collect a group's net incoming/outgoing funding |
| models/children.js | Assemble child spending, outside payments and alias evidence |
| models/child-matching.js | Match debt/allocation descriptions to a unique child |
| models/funding.js | Calculate coverage, balances and transfer plans on the supplied group |
| models/totals.js | Summarize monthly budget, exclusions and income |
| models/history.js | Decide historical lookup eligibility and date filters |
| models/rollover.js | Compute carryover from historical input, preserving the confirmed override |
| presenters/account-spending.js | Account budget and unusual-spending views |
| presenters/group-lines.js | Parent/child lines and inline debt labels |
| presenters/data-issues.js | Data issue grouping and display |
| presenter.js | Assemble the fund report text and keyboard |
| repository.js | Query/cache I/O and report orchestration |
| six-jar-sync.js | Notion six-jar synchronization using the computed report |

Internal modules are not separate feature APIs. External production consumers still use features/<name>/index.js. In-memory updates to the locally built report objects are intentional; calculations perform no external I/O.

## Ledger internals

- finance-ledger.js composes ledgers and their results.
- validation.js checks explicit conflicts and reimbursement evidence.
- previous-month-ledger.js processes account transactions in order.
- advance-state.js updates local money cohorts and obligation balances.
- advance-evidence.js identifies account repayment sources and receipt types.
- fund-loan-ledger.js and personal-loan-ledger.js retain distinct debt matching.
- opening-plan.js, rows.js, evidence.js and transaction-language.js retain their focused shared responsibilities.

## Enforced dependency direction

- Domain finance depends only on domain finance.
- Domain ledger may use domain finance and other ledger modules.
- Feature models depend on pure model/domain/shared code.
- Presenters depend on formatting/presentation/callback code, never model or repository code.
- Components consume injected ports and presentation helpers.
- Repositories use models, domain, shared query helpers and the cache service.
- Services cannot import features, repositories, concrete adapters or app code.
- Adapters cannot import application or financial feature code.
- App/composition connects the modules through public feature APIs.
- Production consumers cannot use compatibility facades as a dependency shortcut.
- Unknown ownership, unresolved imports, computed imports and dependency cycles fail checks.

The checker covers literal JavaScript imports and common I/O calls. It is not a full semantic analysis of arbitrary JavaScript; code review and behavioral tests remain necessary.

## Verification boundary

Baseline: 310 passing tests before extraction. Differential verification against source commit 97645f0: 145 facade calls across 83 finance tests returned identical complete results and identical input side effects. No old implementation or user data is shipped as part of the comparison.

Architecture guard tests also exercise forbidden imports, unknown module ownership, pure-module I/O, computed imports and cycles. Existing suites continue covering callback output, allocation, repayments, duplicate writes, adapters and scheduled dispatch.

This restructuring does not promise zero bugs or change response-time/cache behavior. Live Telegram interaction must be reported separately from local tests and deployment health.

## Complete production tree

Production modules: 76

```text
src/
|-- adapters/
|   |-- http-response.js
|   |-- notion.js
|   |-- state.js
|   \-- telegram.js
|-- app/
|   |-- bot-presenter.js
|   |-- bot-router.js
|   |-- coordinator-gateway.js
|   |-- coordinator-handler.js
|   |-- http-response.js
|   |-- http-security.js
|   |-- legacy-bot.js
|   |-- runtime.js
|   |-- scheduled.js
|   |-- update-coordinator.js
|   \-- webhook.js
|-- domain/
|   |-- finance/
|   |   |-- calendar.js
|   |   |-- expense-classifier.js
|   |   |-- income-input.js
|   |   |-- notion-properties.js
|   |   \-- shared.js
|   \-- ledger/
|       |-- advance-evidence.js
|       |-- advance-state.js
|       |-- evidence.js
|       |-- finance-ledger.js
|       |-- fund-loan-ledger.js
|       |-- opening-plan.js
|       |-- personal-loan-ledger.js
|       |-- previous-month-ledger.js
|       |-- rows.js
|       |-- transaction-language.js
|       \-- validation.js
|-- features/
|   |-- cashflow/
|   |   |-- callbacks.js
|   |   |-- component.js
|   |   |-- index.js
|   |   |-- model.js
|   |   |-- presenter.js
|   |   \-- repository.js
|   |-- fund-budget/
|   |   |-- models/
|   |   |   |-- assignment.js
|   |   |   |-- catalog.js
|   |   |   |-- child-matching.js
|   |   |   |-- children.js
|   |   |   |-- expenses.js
|   |   |   |-- funding.js
|   |   |   |-- groups.js
|   |   |   |-- history.js
|   |   |   |-- rollover.js
|   |   |   |-- totals.js
|   |   |   \-- transfers.js
|   |   |-- presenters/
|   |   |   |-- account-spending.js
|   |   |   |-- data-issues.js
|   |   |   \-- group-lines.js
|   |   |-- component.js
|   |   |-- index.js
|   |   |-- model.js
|   |   |-- presenter.js
|   |   |-- repository.js
|   |   \-- six-jar-sync.js
|   |-- income-goal/
|   |   |-- component.js
|   |   |-- index.js
|   |   |-- model.js
|   |   |-- presenter.js
|   |   \-- repository.js
|   \-- shared/
|       \-- report-data.js
|-- jobs/
|   \-- six-jar-sync.js
|-- repositories/
|   \-- finance-repository.js
|-- services/
|   \-- report-cache.js
|-- bot.js
|-- config.js
|-- coordinator.js
|-- finance.js
|-- index.js
|-- ledger.js
|-- notion.js
|-- repository.js
|-- state.js
\-- telegram.js
```
