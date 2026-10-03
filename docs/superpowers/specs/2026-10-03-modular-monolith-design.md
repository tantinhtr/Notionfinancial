# Modular monolith with explicit feature boundaries

The user approved applying the proposed modular monolith, feature ownership, and injected Notion/Telegram adapters. This refactor preserves financial behavior, report text, callbacks, cache freshness, retry policy and deployment topology.

## Current evidence
299 tests pass. Feature components and pure domain ledgers already exist. The remaining concentration is the 465-line finance repository, which owns all three features. Runtime injects the entire aggregate into each component. Feature entry points and enforced dependency boundaries are missing.

## Design
- Keep one Cloudflare Worker and existing feature directories.
- Each feature owns repository.js and index.js. External consumers use index.js. Model/presenter/component internals remain private to other production modules.
- Shared report date/filter/property helpers live in features/shared/report-data.js; they perform no network I/O.
- Income goal arithmetic moves to its pure model.js.
- repositories/finance-repository.js becomes composition plus legacy compatibility. It coordinates invalidating both report caches after income writes via an injected callback; income-goal does not import other features.
- Runtime injects the cashflow, fund-budget and income-goal repository ports separately.
- A jobs module owns the existing six-jar scheduled workflow and receives repository/sync functions.
- Existing financial domain ledgers remain pure; Notion and Telegram adapters remain injected. No new framework.
- Legacy top-level facades retain their exports. Runtime's internal repository property becomes repositories with three named ports; update-coordinator and its wiring test migrate together.
- Architecture tests enforce public feature imports, no cross-feature imports, pure domain/model/presenter dependencies, and no adapters importing application features.
- Contributor documentation explains ownership, ports, regression fixtures and deployment verification.

## Acceptance
All existing behavior tests pass unchanged except the runtime wiring assertion for narrow ports. New contract tests exercise each feature repository independently, cache invalidation after writes, and scheduled sync delegation. Architecture tests run automatically in the existing npm test CI gate. A Worker bundle must build. User changes to AGENTS.md / CLAUDE.md are not included. Live deployment and actual Telegram UI verification are reported separately; no claim that this refactor improves response latency.
