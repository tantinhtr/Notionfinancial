# Telegram Account Spending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicate monthly-expense button with an account-first Telegram report that preserves fixed-budget progress across all payment accounts.

**Architecture:** Query monthly expenses, budget categories, and payment accounts once per screen. Build a normalized snapshot containing global category totals, per-account category totals, and transaction rows; render Telegram screens from that snapshot. Resolve Telegram callbacks with the last eight characters of Notion IDs to stay below the 64-byte callback limit.

**Tech Stack:** Google Apps Script ES5-compatible JavaScript, Notion REST API 2022-06-28, Telegram Bot API inline keyboards, Node.js built-in test runner.

## Global Constraints

- Do not change the Notion schema or financial records.
- Monthly spending limit remains 5,500,000 VND.
- Fixed budgets are: Nhà Trọ 2,200,000; Internet 200,000; Đi Chợ 1,300,000; Affiilate 700,000; Phát Sinh 500,000.
- The remaining 600,000 VND is the unallocated monthly allowance.
- A payment account may pay any expense category; this alone is not a loan.
- Fixed-category progress sums spending across every payment account.
- Only explicit Notion transfers can later be treated as borrowing.

---

### Task 1: Account-first spending snapshot

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Produces: `accountSpendingData_()` returning `{t, total, accounts, fixedBudgets, unplannedTotal, unallocatedBudget}`.
- Produces: each account as `{id, name, total, categories}`.
- Produces: each category as `{id, name, total, rows}`.

- [ ] **Step 1: Write failing aggregation tests**

Add a test fixture with Đi Chợ paid partly by Grab Tiền Mặt and partly by Momo, plus unrelated expenses paid by Grab Tiền Mặt. Assert global Đi Chợ spending is 801,000, remaining budget is 499,000, and Grab Tiền Mặt retains separate category totals.

- [ ] **Step 2: Run the focused test**

Run:

```powershell
node --test --test-name-pattern="account spending" outputs/telegram-finance-bot.test.js
```

Expected: failure because `accountSpendingData_` does not exist.

- [ ] **Step 3: Implement the snapshot**

Add `ACCOUNT_DB` and `FIXED_EXPENSE_BUDGETS` to `getConfig_()`. Query the three Notion databases with `UrlFetchApp.fetchAll`, complete pagination with `completeNotionRows_`, normalize missing account/category relations, aggregate totals, and sort accounts/categories descending by spending.

- [ ] **Step 4: Verify aggregation**

Run the focused test again and expect it to pass.

### Task 2: Telegram account navigation

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Produces: `accountSpendingText_(data)`.
- Produces: `accountSpendingKeyboard_(data.accounts)`.
- Produces: `accountDetailText_(account)`.
- Produces: `accountDetailKeyboard_(account)`.
- Produces: `accountCategoryText_(account, category)`.
- Callback contracts: `show_accounts`, `refresh_accounts`, `spend_account:<id8>`, and `spend_category:<accountId8>:<categoryId8>`.

- [ ] **Step 1: Write failing callback tests**

Assert `/start` contains `💳 Chi theo tài khoản`; clicking it shows fixed-budget progress and account buttons; clicking Grab Tiền Mặt shows its categories; clicking Đi Chợ shows dated transactions.

- [ ] **Step 2: Run focused callback tests**

Run:

```powershell
node --test --test-name-pattern="account callback|account category|finance inline menu" outputs/telegram-finance-bot.test.js
```

Expected: failures because the new callback routes and renderers do not exist.

- [ ] **Step 3: Implement Telegram screens**

Replace `Chi tháng này` buttons with `Chi theo tài khoản`. Route `/chi` and the new callbacks to the account-first screens. Remove the old category-first callback path. Keep navigation to monthly report and home.

- [ ] **Step 4: Verify callback behavior**

Run the focused callback tests and expect all to pass.

### Task 3: Regression and live verification

**Files:**
- Verify: `outputs/telegram-finance-bot-fixed.js`
- Verify: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Consumes all functions from Tasks 1 and 2.

- [ ] **Step 1: Run the full suite**

Run:

```powershell
node --test outputs/telegram-finance-bot.test.js
```

Expected: all tests pass, including `/muctieu` and `/thang`.

- [ ] **Step 2: Save to Apps Script**

Replace `Mã.gs` in project `1aaj7iUlDJQT3xlGAhBztWsSYvpn105bLCzCRJ9nmtao5yIGlv4qe-J1o` and save. Polling uses the latest saved code, so no Web App deployment is required for the Telegram trigger.

- [ ] **Step 3: Verify Telegram**

Send `/start`, click `Chi theo tài khoản`, confirm the fixed-budget values and account totals, open Grab Tiền Mặt, then open Đi Chợ and confirm dated rows.

- [ ] **Step 4: Preserve user state**

Leave Apps Script available for inspection, keep Telegram open, and do not modify Notion data.

## Repository Note

The workspace is not a Git repository, so commit steps are intentionally omitted. Local files, Apps Script save state, automated test output, and live Telegram behavior are the verification evidence.
