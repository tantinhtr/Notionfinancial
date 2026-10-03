# Project-wide modular architecture

User objective: apply modular architecture throughout the existing finance bot, including internal responsibility boundaries.

Scope: all production JavaScript under cloudflare-worker/src plus architecture checks, contributor docs and verification. Preserve public facades, report values/text, Notion schema, schedule, query order, cache freshness, repayment matching and write idempotency. No new runtime dependency or additional deployed service. Release the existing Worker after verification.

Design:
- Keep one Worker and three feature public APIs.
- Fund model becomes an orchestrator of pure catalog, expense, funding and group computations; each receives explicit inputs.
- Fund presentation separates account/unusual reports, group/child rendering and data issue rendering.
- Repository owns I/O; rollover calculation and history selection policy become pure internal modules.
- Ledger orchestration separates conflict/reimbursement validation and account-advance matching/state transitions.
- App owns bot routing, webhook HTTP, coordinator gateway, health/auth and scheduled dispatch. Legacy root bot API remains compatible.
- All source files receive a recognized architectural role. Enforce allowed dependency directions, feature public APIs, model/presenter separation, concrete I/O boundaries, and no cycles.
- Existing focused cashflow, income, adapter and coordinator modules remain intact where responsibilities are already coherent.

Acceptance: all prior behavior tests pass; architecture checks cover every source file and reject representative forbidden imports/cycles; full syntax/build pass; live deploy health verified; Telegram UI verification reported separately.
