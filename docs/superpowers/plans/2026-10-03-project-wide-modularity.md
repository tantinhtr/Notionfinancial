# Project-wide modularity implementation plan

Goal: explicit ownership and enforceable boundaries across all production source.
Architecture: existing modular monolith, pure internal calculation modules, injected I/O ports.
Spec: docs/superpowers/specs/2026-10-03-project-wide-modularity.md
Execution: inline in the authorized workspace; preserve existing user changes and assets move.

- [x] Baseline: 310 tests pass; inventory responsibilities.
- [x] Extract fund catalog, expense accumulation, group funding and report composition with unchanged arithmetic.
- [x] Split fund presentation and isolate pure rollover/history selection.
- [x] Split ledger validation and advance state/evidence; move router and separate webhook/scheduled concerns.
- [x] Enforce dependency rules and cycles across every source file, including negative examples.
- [x] Document full ownership and run all tests, syntax, bundle and diff review.
- [x] Commit scoped work, deploy and verify health/version; report live Telegram access limitation if present.

## Verification evidence
- Baseline: 310/310 tests passed.
- After extraction and full-source architecture checks: 313/313 tests passed.
- Syntax: all 76 production modules passed.
- Differential: 145 facade calls across 83 finance cases matched commit 97645f0, including full outputs and input side effects.
- Wrangler dry run: passed; bundle 174.42 KiB.
- Independent review: no blocking code findings; architecture tests independently passed 3/3. Scope wording clarified.
- Telegram UI attempt: failed to initialize browser kernel (Windows apply deny-read ACLs); not verified.
- Source commit: 2637ac2. Deployed version 271aadb7-e149-450a-9ac5-35531b7368f7 verified at 100% traffic; health HTTP 200 on 2026-10-03 17:14 UTC (2026-10-04 local).
- Previous version for rollback: bd15d145-09fe-42c8-9f55-410741296e02.
- No public Git push; browser UI remains unverified as noted above.
