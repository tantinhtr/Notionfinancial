# Current-month fund source and account debt implementation plan

> **For Codex:** Execute inline with the existing isolated worktree. Follow test-driven development and verify before claiming completion.

**Goal:** Distinguish current-month funded spending from account advances and keep the 750.000đ rent fund loan separate.

**Architecture:** Reuse the chronological Notion transaction ledger. Expose per-expense source consumption, then let the fund report count eligible direct payments as funded and previous-month/explicit debt as obligations. Do not change Notion schema or infer repayment from balances.

**Tech stack:** Cloudflare Worker JavaScript, Node test runner.

### Task 1 — Trace each expense's money source

1. Add ledger regression tests for current-month Grab receipt, earlier transfer into Tiền Mặt, previous-month opening use, explicit debt, and unrelated income not repaying debt. Run `node --test test/ledger.test.js` and observe failure.
2. Add minimal per-expense applications to the existing chronological ledger; distinguish earned receipt from borrowing/return and preserve rent reserve exemption. Run focused tests to green.

### Task 2 — Classify fund spending and debt

1. Replace the obsolete "plain account never debt" expectation with tests for 550.000đ Tiền Mặt debt, 154.000đ direct Grap payment, 70.000đ direct Cắt Tóc, Đi Chợ, and Nhà Trọ 1.400.004đ + 750.000đ loan with 133.004đ separate. Run `node --test test/finance-regression.test.js` and observe failure.
2. Consume the row-level ledger results in `src/finance.js`; make only surgical report adjustments if necessary. Run focused tests to green.

### Task 3 — Final logic audit

1. Run `npm test`, `npm run check`, `git diff --check` and inspect status/diff.
2. Check the approved source, advance, repayment, fund-loan, and rent rules against tests. State whether real Notion verification was available; do not claim live verification from fixtures.
