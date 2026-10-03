# Modular Monolith Implementation Plan

> Execute inline in the existing authorized workspace; preserve the user's AGENTS.md and CLAUDE.md changes.

**Goal:** Give contributors explicit ownership and enforceable dependencies while retaining bot behavior.
**Architecture:** One Worker, feature modules with public entry points and narrow repository ports, injected adapters, pure finance rules.
**Tech Stack:** JavaScript ESM, Node test runner, Cloudflare Workers.
**Spec:** docs/superpowers/specs/2026-10-03-modular-monolith-design.md

## Global constraints
No financial, text, cache, query, retry or callback changes. No new runtime dependencies. Keep compatibility facades.

## Tasks
- [x] Capture baseline: npm test (299 passing).
- [x] Add repository isolation and architecture boundary tests; verify they fail before extraction.
- [x] Extract shared report helpers, per-feature repositories, and pure income goal model by moving existing bodies.
- [x] Add explicit feature index exports; route all production cross-boundary imports through them.
- [x] Compose narrow repositories and inject cross-report cache invalidation; retain the old aggregate API.
- [x] Extract scheduled six-jar job and migrate runtime/update-coordinator wiring.
- [x] Document module ownership, ports, regression examples and contributor workflow in docs/architecture.md and CONTRIBUTING.md; link README.
- [x] Run all tests, syntax check, boundary negative probe and Wrangler dry-run bundle.
- [x] Review exact-output and write-idempotency tests; inspect diff for nonstructural changes.
- [ ] Commit only scoped files; deploy verified bundle and check active version/health if authorized, clearly distinguish live UI verification.

## Review focus
- Income creation still invalidates both caches in order, and failed invalidation cannot turn a successful write into failure.
- Historical filters, the confirmed October 136972 carryover and weighted allocations are preserved.
- Standalone read-only repositories do not require the income writer port.
- Fresh fund callbacks, existing report strings and retry/no-duplicate-write behavior remain intact.
- Scheduled sync still requests a fresh report and forwards the same report object to the sync adapter.

## Verification evidence
- Baseline: 299/299 tests passed.
- Refactor: 305/305 tests passed; syntax check and Wrangler dry run passed.
- Negative probe: forbidden feature import was detected; source restored and full suite passed.
- Telegram UI: browser automation kernel failed to start; live button verification is unavailable.
