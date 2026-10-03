# Architecture and module ownership

This is a modular monolith: one Cloudflare Worker deployment, with feature modules and injected infrastructure. This refactor preserves financial rules, Telegram output, queries and cache freshness. It does not resolve network latency.

## Layout

Paths are relative to cloudflare-worker/.

- src/app: composition, webhook and update coordination.
- src/features/cashflow: account cashflow, navigation and report repository.
- src/features/fund-budget: fund report, child labels and six-jar synchronization.
- src/features/income-goal: income writes, reconciliation lookup, goal calculation and reminders.
- src/features/shared: pure report date/property helpers.
- src/domain/finance and src/domain/ledger: shared classification and ledger rules.
- src/adapters: Notion, Telegram and state storage I/O.
- src/repositories/finance-repository.js: composition and cross-report invalidation.
- src/jobs/six-jar-sync.js: scheduled synchronization orchestration.

## Dependency rules

Application composition imports each feature through its index.js public entry point. Features use their own files, shared helpers and domain code; they cannot import another feature or concrete infrastructure. Adapters cannot import features or application orchestration.

Components orchestrate an injected repository and Telegram client. Repositories query injected Notion/state ports and build models. Models, presenters and domain rules perform no external I/O. Presenters return text/keyboard data.

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
| Parent or child budget text | features/fund-budget/presenter.js |
| Fund calculations | features/fund-budget/model.js and domain rules |
| Historical queries and rollover inputs | features/fund-budget/repository.js |
| Repayment matching | domain/ledger |
| Income writes and duplicate lookup | features/income-goal/repository.js |
| Update lifecycle | app coordinator |
| Goal arithmetic | features/income-goal/model.js |
| Notion retries / Telegram transport | corresponding adapter |
| Module wiring / cross-report invalidation | app/runtime.js / repository composition |

## Data flows

Telegram update -> coordinator/router -> feature component -> repository -> injected Notion/cache -> pure model -> presenter -> Telegram adapter.

Scheduled six-jar sync -> fresh fund-budget report -> existing six-jar synchronization function. Interactive fund callbacks retain the existing synchronization order.

Keep one calculation for the report consumed by Telegram and Notion. Do not add allocation formulas to transport or presentation code. Transaction data remains authoritative; architecture changes do not authorize financial rule changes.

## Verification

Run npm test and npm run check from cloudflare-worker. module-contracts.test.js checks isolation, invalidation and scheduled sync. module-boundaries.test.js guards import direction. Existing regression tests cover financial behavior and output.

Passing local tests or a health endpoint does not prove a Telegram button works live. Record the deployed version and actual verification boundary.
