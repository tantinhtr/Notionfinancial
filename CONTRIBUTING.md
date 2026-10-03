# Contributing

Read [architecture and ownership](docs/architecture.md) before changing a module.

## Setup

Use Node.js 22 or newer. From cloudflare-worker:

    npm ci
    npm test
    npm run check

Use npm run dev for local development. Configure secrets in the ignored .dev.vars file as described in README.md. Never commit credentials, sessions or user data.

## Change workflow

1. State the requested behavior and affected module. For refactors, identify behavior that must remain identical.
2. Capture the test baseline.
3. Add a failing regression test for a bug, or a contract test for a new boundary.
4. Make the smallest change in the owning module. Import features through index.js.
5. Run relevant tests, the full suite and syntax check. Review unrelated financial, UI and configuration changes.
6. Explain the change, evidence and verification limitations.

Test Notion, Telegram and cache through injected ports without writing live transactions. Keep models/presenters pure. Coordinate interactions between features at application composition.

## Financial regression examples

Preserve these unless separately authorized to change:

- Confirmed October carryover: 136,972 VND. Unused budget limits do not establish extra money.
- Allocation weights: 10:10:10:5 after the existing opening-balance and rent calculation.
- Repayment matching uses transaction/account evidence; never hard-code the 50,000 VND example.
- Remaining fund text belongs on child labels, not parent group rows.
- Reconcile ambiguous income writes before retrying to prevent duplicates.

## Build and release

From cloudflare-worker:

    npx wrangler deploy --dry-run

Deploy the reviewed revision with npm run deploy. Verify the active version with npx wrangler deployments list and GET /health. Exercise /start, account navigation, fund budget and goal display using the authorized Telegram account. An income-writing test needs an agreed test transaction.

Report missing live access accurately. Local tests and HTTP 200 do not verify Telegram output. Keep the preceding deployment version available for rollback. Do not change webhook configuration for an ordinary code release.

CI runs npm run check and npm test, including boundary tests. Public repository pushes require the appropriate authorization.

## Shared-policy changes

Before copying a helper, check the shared-policy ownership table in docs/architecture.md. Change cache prefixes and TTL only in services/report-cache.js. Use the shared calendar for income dates and reports. Use domain/ledger/transaction-language.js for shared repayment vocabulary; preserve the separate matching rules for each ledger.

When changing a shared module, test its consumers as well as the helper. Keep financial calculations out of adapters and presenters. Different numeric coercion and fallback policies are not interchangeable just because their code looks similar.

## Project-wide module ownership

Use docs/module-map.md to locate the responsible module before editing. New production files must fit an explicit role in test/helpers/architecture-policy.js. Do not loosen dependency rules merely to make an import pass; place the behavior in the owning module or inject the required port.

Nested models cannot import presenters or I/O. Presenters cannot import models. Module dependencies must remain acyclic. Root compatibility facades contain only exports; production modules use the real owner directly.

For broad refactors, compare complete report results and input side effects against the prior revision, in addition to running the regression suite. npm run check parses all production files.
