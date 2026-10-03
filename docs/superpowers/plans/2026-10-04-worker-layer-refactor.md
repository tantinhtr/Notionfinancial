# Worker layer refactor

## Scope and design

Implement the user-specified app, adapter, domain, repository and job entry points. Keep supporting modules and old-path export facades; do not duplicate business implementations. Preserve financial formulas, normal messages, Notion properties, cache namespace/TTL and coordinator reconciliation. The explicit behavioral change is HTTP 200 plus a friendly notification for validated webhook processing failures. Invalid requests remain rejected. No automatic retry queue is introduced.

## Execution and verification

1. Capture baseline (313 tests) and map current ownership.
2. Relocate financial models into pure domain modules; preserve exports. Verify full finance results against 5b7f57f.
3. Inject raw Notion/Telegram and generic KV adapters through runtime; verify exact prepared payloads and post-Grab invalidation.
4. Move webhook presentation to app/index.js; verify error acknowledgment, authorized notification, bad authentication and post-write replay without duplicate creation.
5. Update architecture guards/docs; run all tests, syntax check, Wrangler dry run and independent review.

Completed local checks: 321 tests; 104 source syntax checks; 145 differential calls across 83 finance tests. Reviewer found no actionable regression. Deployment and actual Telegram UI checks must be reported separately.
