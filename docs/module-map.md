# Current source module map

Canonical implementation lives in src/modules. Platform entry points and DI live in app; scheduled bridges in jobs. Old paths are compatibility delegates. See [responsibilities/contracts](architecture.md) and [per-file pre-refactor mapping](project-architecture-audit.md).

All production JavaScript files, including compatibility delegates, are checked by the architecture matrix and syntax script. A large count of files does not mean separate services/deployments; this remains one Worker.

## Where to edit

| Change | Owner |
|---|---|
| Cashflow calculation / navigation | modules/cashflow/cashflow.rules.js / presenter.js and callbacks.js |
| Income write sequence / properties | modules/income-goal/income-goal.service.js / income-goal.repository.js |
| Budget history/query orchestration | modules/fund-budget/fund-budget.service.js |
| Budget/rollover math | modules/fund-budget/rules/ |
| Debt evidence and matching | modules/financial-ledger/rules/ |
| Opening allocation | modules/fund-budget/rules/opening-plan.js |
| Six-jar schema and month-row workflow | modules/six-jar-sync/six-jar-sync.service.js |
| Telegram routing | modules/telegram-bot/bot-router.js |
| Update dedup/reconciliation state | modules/update-processing/update-processing.service.js |
| Report cache TTL/fallback | modules/shared/cache/report-cache.js |
| Report keys | cashflow.service.js and fund-budget.service.js |
| Cross-report invalidation | app/runtime.js |
| Notion/Telegram transport | modules/shared/transport/ |

## Full production tree

185 JavaScript files.

```text
src/
├── adapters/
│   ├── http-response.js
│   ├── kv-cache-adapter.js
│   ├── notion-adapter.js
│   ├── notion.js
│   ├── state.js
│   ├── telegram-adapter.js
│   └── telegram.js
├── app/
│   ├── bot-presenter.js
│   ├── bot-router.js
│   ├── coordinator-gateway.js
│   ├── coordinator-handler.js
│   ├── finance-composition.js
│   ├── http-response.js
│   ├── http-security.js
│   ├── index.js
│   ├── legacy-bot.js
│   ├── legacy-components.js
│   ├── runtime.js
│   ├── scheduled.js
│   ├── telegram-presenter.js
│   ├── update-coordinator.js
│   └── webhook.js
├── domain/
│   ├── budget/
│   │   ├── assignment.js
│   │   ├── catalog.js
│   │   ├── child-matching.js
│   │   ├── children.js
│   │   ├── expenses.js
│   │   ├── funding.js
│   │   ├── groups.js
│   │   ├── history.js
│   │   ├── model.js
│   │   ├── rollover.js
│   │   ├── totals.js
│   │   └── transfers.js
│   ├── cashflow/
│   │   └── model.js
│   ├── finance/
│   │   ├── calendar.js
│   │   ├── expense-classifier.js
│   │   ├── goal-model.js
│   │   ├── income-input.js
│   │   ├── notion-properties.js
│   │   ├── report-data.js
│   │   └── shared.js
│   ├── ledger/
│   │   ├── advance-evidence.js
│   │   ├── advance-state.js
│   │   ├── evidence.js
│   │   ├── finance-ledger.js
│   │   ├── fund-loan-ledger.js
│   │   ├── opening-plan.js
│   │   ├── personal-loan-ledger.js
│   │   ├── previous-month-ledger.js
│   │   ├── rows.js
│   │   ├── transaction-language.js
│   │   └── validation.js
│   ├── debt-resolver.js
│   ├── finance-rules.js
│   └── string-parser.js
├── features/
│   ├── cashflow/
│   │   ├── callbacks.js
│   │   ├── component.js
│   │   ├── index.js
│   │   ├── model.js
│   │   ├── presenter.js
│   │   └── repository.js
│   ├── fund-budget/
│   │   ├── models/
│   │   │   ├── assignment.js
│   │   │   ├── catalog.js
│   │   │   ├── child-matching.js
│   │   │   ├── children.js
│   │   │   ├── expenses.js
│   │   │   ├── funding.js
│   │   │   ├── groups.js
│   │   │   ├── history.js
│   │   │   ├── rollover.js
│   │   │   ├── totals.js
│   │   │   └── transfers.js
│   │   ├── presenters/
│   │   │   ├── account-spending.js
│   │   │   ├── data-issues.js
│   │   │   └── group-lines.js
│   │   ├── component.js
│   │   ├── index.js
│   │   ├── model.js
│   │   ├── presenter.js
│   │   ├── repository.js
│   │   └── six-jar-sync.js
│   ├── income-goal/
│   │   ├── component.js
│   │   ├── index.js
│   │   ├── model.js
│   │   ├── presenter.js
│   │   └── repository.js
│   └── shared/
│       └── report-data.js
├── jobs/
│   ├── cron-reminder.js
│   └── six-jar-sync.js
├── modules/
│   ├── cashflow/
│   │   ├── callbacks.js
│   │   ├── cashflow.contracts.js
│   │   ├── cashflow.controller.js
│   │   ├── cashflow.repository.js
│   │   ├── cashflow.rules.js
│   │   ├── cashflow.service.js
│   │   ├── index.js
│   │   └── presenter.js
│   ├── financial-ledger/
│   │   ├── rules/
│   │   │   ├── advance-evidence.js
│   │   │   ├── advance-state.js
│   │   │   ├── evidence.js
│   │   │   ├── fund-loan-ledger.js
│   │   │   ├── personal-loan-ledger.js
│   │   │   ├── previous-month-ledger.js
│   │   │   ├── transaction-language.js
│   │   │   └── validation.js
│   │   ├── financial-ledger.contracts.js
│   │   ├── financial-ledger.service.js
│   │   └── index.js
│   ├── fund-budget/
│   │   ├── presenters/
│   │   │   ├── account-spending.js
│   │   │   ├── data-issues.js
│   │   │   └── group-lines.js
│   │   ├── rules/
│   │   │   ├── assignment.js
│   │   │   ├── catalog.js
│   │   │   ├── child-matching.js
│   │   │   ├── children.js
│   │   │   ├── expense-classifier.js
│   │   │   ├── expenses.js
│   │   │   ├── funding.js
│   │   │   ├── groups.js
│   │   │   ├── history.js
│   │   │   ├── model.js
│   │   │   ├── opening-plan.js
│   │   │   ├── rollover.js
│   │   │   ├── totals.js
│   │   │   └── transfers.js
│   │   ├── budget-calculator.js
│   │   ├── budget-display.service.js
│   │   ├── fund-budget.contracts.js
│   │   ├── fund-budget.controller.js
│   │   ├── fund-budget.repository.js
│   │   ├── fund-budget.service.js
│   │   ├── index.js
│   │   └── presenter.js
│   ├── income-goal/
│   │   ├── income-goal.contracts.js
│   │   ├── income-goal.controller.js
│   │   ├── income-goal.errors.js
│   │   ├── income-goal.repository.js
│   │   ├── income-goal.rules.js
│   │   ├── income-goal.service.js
│   │   ├── income-input.js
│   │   ├── index.js
│   │   └── presenter.js
│   ├── shared/
│   │   ├── cache/
│   │   │   ├── cache-port.js
│   │   │   ├── cache.contracts.js
│   │   │   ├── kv-cache-adapter.js
│   │   │   ├── report-cache.js
│   │   │   └── state.js
│   │   ├── finance/
│   │   │   ├── calendar.js
│   │   │   ├── notion-properties.js
│   │   │   ├── report-data.js
│   │   │   ├── shared.js
│   │   │   └── transaction-rows.js
│   │   └── transport/
│   │       ├── http-response.js
│   │       ├── notion-adapter.js
│   │       └── telegram-adapter.js
│   ├── six-jar-sync/
│   │   ├── index.js
│   │   ├── six-jar-sync.contracts.js
│   │   ├── six-jar-sync.repository.js
│   │   ├── six-jar-sync.rules.js
│   │   └── six-jar-sync.service.js
│   ├── telegram-bot/
│   │   ├── bot-presenter.js
│   │   ├── bot-router.js
│   │   ├── index.js
│   │   ├── telegram-bot.contracts.js
│   │   └── telegram-presenter.js
│   └── update-processing/
│       ├── index.js
│       ├── update-processing.contracts.js
│       └── update-processing.service.js
├── repositories/
│   ├── cashflow-repository.js
│   ├── finance-repository.js
│   ├── fund-budget-repository.js
│   └── grab-repository.js
├── services/
│   ├── cache-port.js
│   └── report-cache.js
├── bot.js
├── config.js
├── coordinator.js
├── finance.js
├── index.js
├── ledger.js
├── notion.js
├── repository.js
├── state.js
└── telegram.js
```
