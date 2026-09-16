# Fund Child Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fund allocation independent of current-month spending and apply historical Notion aliases consistently to all child budgets.

**Architecture:** Fetch expense history only when current fund transfers need child attribution, then build one shared child-candidate map from category names plus current and historical related expenses. Keep group allocation authoritative; assign child allocation only on a unique match and surface unresolved attribution without distributing it across children.

**Tech Stack:** JavaScript ES modules, Node.js test runner, Cloudflare Worker, Notion API repository.

**Spec:** `docs/superpowers/specs/2026-09-16-fund-child-allocation-design.md`

## Global Constraints

- A fund transfer is allocated without requiring current-month spending.
- Never infer a child from an amount.
- Preserve existing rent, debt, advance, and direct-spend behavior.
- Do not add a new fund-balance output line.

---

### Task 1: Load historical aliases for current fund transfers

**Files:**
- Modify: `cloudflare-worker/src/repository.js`
- Test: `cloudflare-worker/test/repository.test.js`

**Interfaces:**
- Consumes: current `transferRows` containing `Nhóm Quỹ` relations.
- Produces: `historicalExpenseRows` passed through the existing `buildAccountSpendingData_` options object.

- [x] **Step 1: Write the failing repository test**

Add a current transfer with a `Nhóm Quỹ` relation but no debt/history wording. Assert that the repository queries `expenses` with the pre-month history filter, while it does not query unrelated income or transfer history.

- [x] **Step 2: Run the repository test and verify RED**

Run: `node --test test/repository.test.js --test-name-pattern="fund transfer loads expense history"`

Expected: FAIL because the history expense query is absent.

- [x] **Step 3: Implement the minimal history-query predicate**

Add a small predicate that detects current transfer rows with a non-empty `Nhóm Quỹ` relation. Query only historical expenses for this case; retain the existing complete-history query for debt/repayment references.

- [x] **Step 4: Run the repository test and verify GREEN**

Run: `node --test test/repository.test.js`

Expected: all repository tests pass.

### Task 2: Resolve every child from current and historical Notion evidence

**Files:**
- Modify: `cloudflare-worker/src/finance.js`
- Test: `cloudflare-worker/test/finance-regression.test.js`

**Interfaces:**
- Consumes: `options.historicalExpenseRows`, current expense rows, child category IDs, and current transfer normalized text.
- Produces: per-child allocated totals and data-quality issues for unresolved multi-child allocation.

- [x] **Step 1: Write failing finance regression tests**

Add literal fixtures proving: `Tiền wifi ở nhà` funds `Internet` before any current expense; a different multi-child group uses the same historical-alias path; an ambiguous transfer remains group-level and is listed under `CHƯA ĐỦ DỮ KIỆN` without reducing any child's need.

- [x] **Step 2: Run the targeted tests and verify RED**

Run: `node --test test/finance-regression.test.js --test-name-pattern="historical child alias|unresolved child allocation"`

Expected: FAIL because historical rows are not candidate sources and unresolved allocations are silently ignored per child.

- [x] **Step 3: Implement minimal shared child resolution**

Index historical expense title/note text by `Loại Chi Phí`, add those strings to every child's candidate sources, and append one missing-data issue per unresolved current transfer in a multi-child group.

- [x] **Step 4: Run targeted finance tests and verify GREEN**

Run: `node --test test/finance-regression.test.js`

Expected: all finance regression tests pass.

- [x] **Step 5: Run full verification**

Run: `npm test`

Run: `npm run check`

Expected: zero test failures and syntax check exit code 0.
