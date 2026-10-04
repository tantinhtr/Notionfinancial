# Feature modules implementation plan

Goal: implement the approved whole-repo ownership design without changing financial behavior.
Spec: ../specs/2026-10-04-feature-layered-design.md
Execution: native in this session, then independent review. User explicitly authorized implementation and previously authorized main/push/deploy. Baseline 5d55827; 321 tests.

## Constraints

JavaScript, no added runtime dependencies. Preserve text/callbacks, dates, Notion payloads, TTL60, update ID/reconciliation and schedules. Keep legacy API paths as delegates. No production deployment until verified.

## Tasks

- [x] Contracts and tests: add feature-services.test.js. Assert income service with plain repository/cache callbacks, duplicate/write ambiguity, cashflow port/cache, ledger supplied plan and budget evaluator. Watch missing modules fail before implementing.
- [x] Relocate owned implementations to modules as recorded in project-architecture-audit.md; rewrite relative imports; old paths re-export. Shared transport/cache/date helpers first. Verify all exports resolve.
- [x] Income: createIncomeDataRepository readGoalRows/find/create; createIncomeGoalService getGoalStatus/addGrabIncome/recordRevenue; controller receives service. Move date/write/invalidation orchestration into service. Preserve old factory with delegate.
- [x] Cashflow/budget: data repositories only retrieve datasets; report services own date/cache/history/calculation. Inject evaluator via createBudgetCalculator; ledger consumes supplied openingPlan. Compatibility composition preserves old pure signatures.
- [x] Six-jar sync: projection rules, repository for schema/page IO, service for month/schema/no-op workflow. Interactive controller receives workflow status, not concrete sync IO.
- [x] Telegram/update processing: relocate router and state machine, inject income classification and service; runtime wires canonical modules; jobs call service/presenter delivery. Legacy factories remain delegates.
- [x] Guards/contracts: enforce explicit module roles and no internal cross-module imports; preserve old facade tests and financial assertions. Add negative tests for application importing concrete repositories.
- [x] Local verification: full suite, all-source syntax, dry run, differential finance/ledger outputs against baseline, independent review, docs/source map, release separately with commit/push/deploy and health/version confirmation.

## Review focus

Post-write cache failure vs ambiguous write; injected UTC+7 clock near month boundary; rollover recursion with injected ledger; schema formula/blank-row/duplicate-month sync behavior; facades importing platform runtime by accident. Existing regression suites plus new port contracts cover these.

## Execution ledger

- Baseline: production clean; two design/audit documents untracked from approved planning work.
- Ruling: continue in current main workspace under prior explicit user main authorization; no unrelated worktree migration.

- Verification: 311 differential calls (finance145 + ledger166) across164 tests match5d55827; dry-run succeeded. Review caught missing sync warning and two guard gaps; all fixed with failing-then-passing regressions and reviewer recheck11/11.
- Ruling: retain legacy shim factories; production only consumes canonical modules. Public historical input shapes remain compatible.
- Browser: CUA kernel failed; no live Telegram button claim. Final local suite: 332/332 passed; 185 source syntax checks passed. Release evidence will be reported separately.
