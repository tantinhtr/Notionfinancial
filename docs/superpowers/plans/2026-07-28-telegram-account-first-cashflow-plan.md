# Telegram Account-First Cashflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a concise three-level Telegram report that groups real money in and money out by Notion payment account, then category, then individual transaction.

**Architecture:** A pure monthly cashflow builder combines the two income databases, expense database, account definitions, category definitions, and internal transfers into one model. `/thang`, `/chi`, and all callback screens render from that model, while `/muctieu` continues to use `Thu Nhập Ròng Grab (App)` independently.

**Tech Stack:** Google Apps Script V8, Notion REST API 2022-06-28, Telegram Bot API, Node.js `node:test` and `vm` test harness.

## Global Constraints

- Do not change the Notion schema.
- `Thu Nhập Ròng Grab (App)` is used only by `/muctieu` and is not account money in.
- Money in includes records with `Phương Thức Thanh Toán` from both income databases.
- Internal transfers never change total money in or total money out.
- Level 1 shows totals and account buttons only.
- Level 2 shows category totals only.
- Level 3 shows individual transactions only after a category button is selected.
- `/thang` and `/chi` must use the same monthly model.
- Keep the existing `📦 Quỹ & ngân sách` report behind a separate button.
- Telegram callback data must stay below 64 bytes.
- The workspace is not a Git repository; replace commit steps with a status and test checkpoint.

---

## File Map

- Modify `outputs/telegram-finance-bot-fixed.js`: monthly cashflow model, Notion loader, Telegram renderers, callbacks, and command routing.
- Modify `outputs/telegram-finance-bot.test.js`: pure model tests, renderer tests, callback tests, pagination tests, and regression coverage.
- Reference `docs/superpowers/specs/2026-07-28-telegram-account-first-cashflow-design.md`: approved behavior and terminology.

### Task 1: Pure Monthly Cashflow Model

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Produces: `buildMonthlyCashflowData_(t, accountRows, incomeRows, otherIncomeRows, expenseRows, transferRows, incomeCategoryRows, otherIncomeCategoryRows, expenseCategoryRows)`
- Produces: `cashflowCategoryToken_(direction, normalizedName)`
- Produces model fields: `totalIn`, `totalOut`, `net`, `unknownAccount`, `accounts`

- [ ] **Step 1: Write a failing aggregation test**

Add a test that creates Momo and Grap Tiền Mặt accounts, main-income rows,
other-income rows, expense rows, and an internal transfer:

```js
const model = sandbox.buildMonthlyCashflowData_(
  { y: 2026, m: 7, d: 28 },
  accountRows,
  [
    incomeRow('grab-earned', 'Thu nhập ròng grap', 'grab-net', null, 500000),
    incomeRow('legacy-cash', 'Grap tiền mặt', 'grab-wallet', 'cash', 300000),
  ],
  [
    incomeRow('debt-return', 'Tố trả nợ', 'loan-return', 'momo', 200000),
    incomeRow('wallet-cash', 'Grab tiền mặt', 'grab-wallet', 'cash', 400000),
  ],
  [
    namedExpenseRow('rent', 'Tiền phòng', 'rent-cat', 'cash', 2000000),
    namedExpenseRow('market', 'Đi chợ', 'market-cat', 'cash', 200000),
  ],
  [transferRow('withdraw', 'Rút tiền', 400000, 'momo', 'cash')],
  incomeCategoryRows,
  otherIncomeCategoryRows,
  expenseCategoryRows,
);

assert.equal(model.totalIn, 900000);
assert.equal(model.totalOut, 2200000);
assert.equal(model.net, -1300000);
assert.equal(model.accounts.find(a => a.id === 'cash').moneyIn.total, 700000);
assert.equal(model.accounts.find(a => a.id === 'cash').moneyOut.total, 2200000);
assert.equal(model.accounts.find(a => a.id === 'cash').transfersIn, 400000);
assert.equal(model.accounts.find(a => a.id === 'momo').transfersOut, 400000);
```

The `grab-earned` row intentionally has no account and must not enter
`unknownAccount`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
node --test --test-name-pattern "builds account-first monthly cashflow" outputs\telegram-finance-bot.test.js
```

Expected: FAIL because `buildMonthlyCashflowData_` does not exist.

- [ ] **Step 3: Implement exact row normalization and aggregation**

Add helpers that read title, rich text, date, number, and first relation ID.
Implement this model shape:

```js
{
  t: { y, m, d },
  totalIn: 0,
  totalOut: 0,
  net: 0,
  unknownAccount: {
    moneyIn: { count: 0, total: 0 },
    moneyOut: { count: 0, total: 0 }
  },
  accounts: [{
    id: '',
    token: '',
    name: '',
    moneyIn: { total: 0, categories: [] },
    moneyOut: { total: 0, categories: [] },
    transfersIn: 0,
    transfersOut: 0
  }]
}
```

For each category, store:

```js
{
  token: cashflowCategoryToken_('in', normalizedName),
  name: categoryName,
  total: 0,
  rows: [{ id, name, amount, date, note }]
}
```

Merge visible categories by normalized name. Exclude the configured
`GOAL_RELATION_PAGE_ID` when it has no account without creating a warning.
Other accountless records increment the relevant warning.

- [ ] **Step 4: Run the focused test and full suite**

Run:

```powershell
node --test --test-name-pattern "builds account-first monthly cashflow" outputs\telegram-finance-bot.test.js
node --test outputs\telegram-finance-bot.test.js
```

Expected: both commands PASS.

- [ ] **Step 5: Record checkpoint**

Run:

```powershell
git status --short 2>$null
```

Expected: the workspace reports that it is not a Git repository. Record the
passing test count in the implementation notes instead of committing.

### Task 2: Parallel Notion Loader and Cache

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Consumes: `buildMonthlyCashflowData_(...)`
- Produces: `monthlyCashflowData_(forceRefresh)`
- Produces: cache key `MONTHLY_CASHFLOW_<YYYY-MM-DD>`

- [ ] **Step 1: Write a failing loader test**

Mock `UrlFetchApp.fetchAll` and assert exactly eight initial requests:

```js
assert.deepEqual(
  batchRequests.map(req => req.url.split('/').at(-2)),
  [
    cfg.ACCOUNT_DB,
    cfg.INCOME_DB,
    cfg.OTHER_INCOME_DB,
    cfg.EXPENSE_DB,
    cfg.GOAL_DB,
    cfg.OTHER_INCOME_CATEGORY_DB,
    cfg.BUDGET_DB,
    cfg.TRANSFER_DB,
  ]
);
```

Assert all four transaction databases receive the same current-month date
filter and that paginated rows are forwarded to the pure builder.

- [ ] **Step 2: Run the loader test and verify failure**

Run:

```powershell
node --test --test-name-pattern "loads monthly cashflow sources in parallel" outputs\telegram-finance-bot.test.js
```

Expected: FAIL because `monthlyCashflowData_` does not exist.

- [ ] **Step 3: Implement the loader**

Use `UrlFetchApp.fetchAll` for the eight requests. Use
`completeNotionRows_` for every response so the existing 100-row pagination
behavior remains active. Call the pure builder with rows in the interface order.

Cache only the final JSON model:

```js
var cacheKey = 'MONTHLY_CASHFLOW_' + iso_(t.y, t.m, t.d);
if (!forceRefresh) {
  var cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) return JSON.parse(cached);
}
CacheService.getScriptCache().put(cacheKey, JSON.stringify(model), 60);
```

If the serialized model exceeds cache limits, catch the cache error and return
the live model without failing the report.

- [ ] **Step 4: Verify caching and pagination**

Add assertions that:

- two non-refresh calls reuse the cache;
- `forceRefresh === true` performs new Notion requests;
- a second Notion page is appended;
- cache failure does not fail the report.

Run:

```powershell
node --test --test-name-pattern "monthly cashflow sources|cache|remaining Notion pages" outputs\telegram-finance-bot.test.js
```

Expected: PASS.

- [ ] **Step 5: Record checkpoint**

Run the full suite and record the passing count:

```powershell
node --test outputs\telegram-finance-bot.test.js
```

### Task 3: Level 1 Monthly Summary

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Consumes: `monthlyCashflowData_(forceRefresh)`
- Produces: `monthlyCashflowText_(data)`
- Produces: `monthlyCashflowKeyboard_(data)`
- Produces: `sendMonthlyCashflowReport_(chatId, forceRefresh)`

- [ ] **Step 1: Write failing renderer tests**

Use a model with two active accounts and assert:

```js
assert.equal(
  sandbox.monthlyCashflowText_(model),
  [
    '📊 Dòng tiền tháng 7/2026',
    'Tổng tiền vào: 900.000đ',
    'Tổng tiền ra: 2.200.000đ',
    'Chênh lệch: -1.300.000đ',
    '',
    'Chọn tài khoản để xem chi tiết:'
  ].join('\n')
);
```

Assert the text does not contain category names or transaction titles. Assert
buttons have this copy:

```text
Momo · Vào 200.000đ · Ra 0đ
Grap Tiền Mặt · Vào 700.000đ · Ra 2.200.000đ
```

Also assert a `📦 Quỹ & ngân sách` button exists.

- [ ] **Step 2: Run the renderer tests and verify failure**

Run:

```powershell
node --test --test-name-pattern "renders level 1 cashflow" outputs\telegram-finance-bot.test.js
```

Expected: FAIL because the new renderers do not exist.

- [ ] **Step 3: Implement Level 1 and command routing**

Implement the exact summary and one account button per active account using:

```js
callback_data: 'cash_account:' + account.token
```

Add navigation buttons:

```js
[
  { text: '🔄 Cập nhật', callback_data: 'cash_refresh' },
  { text: '📦 Quỹ & ngân sách', callback_data: 'show_funds' }
]
```

Route both `/thang` and `/chi` to `sendMonthlyCashflowReport_`. Keep
`/muctieu` unchanged.

- [ ] **Step 4: Run renderer and command tests**

Run:

```powershell
node --test --test-name-pattern "level 1 cashflow|/thang|/chi" outputs\telegram-finance-bot.test.js
```

Expected: PASS.

- [ ] **Step 5: Record checkpoint**

Run the full suite and record the passing count.

### Task 4: Level 2 Account Categories

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Consumes: an account from the monthly model
- Produces: `cashflowAccountText_(data, account)`
- Produces: `cashflowAccountKeyboard_(account)`
- Produces callback `cash_account:<account-token>`

- [ ] **Step 1: Write failing account-view tests**

Assert the account text contains only totals:

```text
💳 Grap Tiền Mặt — tháng 7/2026
Tiền vào: 700.000đ
• Grab - Tiền Về Ví: 700.000đ

Tiền ra: 2.200.000đ
• Nhà Trọ: 2.000.000đ
• Đi Chợ: 200.000đ

Chuyển nội bộ: vào 400.000đ · ra 0đ
```

Assert no transaction title or date appears. Assert income and expense category
buttons use:

```js
'cash_cat:' + account.token + ':in:' + category.token
'cash_cat:' + account.token + ':out:' + category.token
```

- [ ] **Step 2: Run the account-view tests and verify failure**

Run:

```powershell
node --test --test-name-pattern "renders level 2 account categories" outputs\telegram-finance-bot.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement account rendering and callback handling**

Resolve the account token from a freshly loaded model. If it is missing, send:

```text
Tài khoản không còn tồn tại trong dữ liệu tháng này.
```

Then return the user to `cash_home`. Render categories sorted by amount
descending and hide zero-value categories.

- [ ] **Step 4: Run account callback tests**

Run:

```powershell
node --test --test-name-pattern "level 2 account|cash_account" outputs\telegram-finance-bot.test.js
```

Expected: PASS.

- [ ] **Step 5: Record checkpoint**

Run the full suite and record the passing count.

### Task 5: Level 3 Transaction Details

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Consumes: account token, direction, category token
- Produces: `cashflowCategoryText_(data, account, direction, category)`
- Produces callback `cash_cat:<account-token>:<in|out>:<category-token>`

- [ ] **Step 1: Write failing income and expense detail tests**

Assert income detail:

```text
📥 Momo → Vay Và Trả: 300.000đ
• 02/07 — Quảng trả tiền mượn: 100.000đ
• 14/07 — Tố trả nợ: 200.000đ
```

Assert expense detail:

```text
💸 Grap Tiền Mặt → Đi Chợ: 200.000đ
• 05/07 — Đi chợ 2 ngày: 73.000đ
...
```

Assert rows sort by date descending, stop after 30 records, and show the
remaining count.

- [ ] **Step 2: Run detail tests and verify failure**

Run:

```powershell
node --test --test-name-pattern "renders level 3 transaction details" outputs\telegram-finance-bot.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement detail rendering and callback validation**

Parse callback parts, require direction to be exactly `in` or `out`, resolve the
category from that direction only, and reject stale tokens with:

```text
Loại giao dịch không còn tồn tại trong dữ liệu tháng này.
```

Add one back button to the selected account and one home button.

- [ ] **Step 4: Verify callback length and detail behavior**

Add:

```js
for (const callback of allGeneratedCallbacks) {
  assert.ok(Buffer.byteLength(callback, 'utf8') <= 64);
}
```

Run:

```powershell
node --test --test-name-pattern "level 3|callback length|stale token" outputs\telegram-finance-bot.test.js
```

Expected: PASS.

- [ ] **Step 5: Record checkpoint**

Run the full suite and record the passing count.

### Task 6: Preserve Fund Report and Complete Live Verification

**Files:**
- Modify: `outputs/telegram-finance-bot-fixed.js`
- Test: `outputs/telegram-finance-bot.test.js`

**Interfaces:**
- Consumes: existing `accountSpendingData_` and fund-group calculations
- Produces: `sendFundBudgetReport_(chatId)`
- Produces callback `show_funds`

- [ ] **Step 1: Write a failing compatibility test**

Assert `show_funds` renders the existing fund rows, including:

```text
Thiết Yếu
Đi Chợ
Làm YouTube
Phát Sinh
```

Assert none of these rows appear in the Level 1 monthly cashflow text.

- [ ] **Step 2: Run the compatibility test and verify failure**

Run:

```powershell
node --test --test-name-pattern "keeps fund report separate" outputs\telegram-finance-bot.test.js
```

Expected: FAIL until routing is separated.

- [ ] **Step 3: Separate fund routing and remove conflicting legacy routes**

Keep the existing fund calculations behind `show_funds`. Remove or redirect
legacy `show_accounts`, `spend_account`, and `spend_category` callbacks so there
is only one account drill-down implementation. Update `/start` help text to:

```text
• /thang — tổng tiền vào/ra theo tài khoản
• /chi — mở cùng báo cáo dòng tiền theo tài khoản
• /muctieu — Thu Nhập Ròng Grab (App)
```

- [ ] **Step 4: Run all automated verification**

Run:

```powershell
node --check outputs\telegram-finance-bot-fixed.js
node --test outputs\telegram-finance-bot.test.js
```

Expected: syntax check succeeds and every test passes.

- [ ] **Step 5: Update Google Apps Script**

Replace `Mã.gs` in project
`1aaj7iUlDJQT3xlGAhBztWsSYvpn105bLCzCRJ9nmtao5yIGlv4qe-J1o`, save, and keep
the existing polling trigger. A Web App deployment is not required for polling.

- [ ] **Step 6: Verify Telegram end to end**

Verify these exact paths:

1. `/thang` shows only totals and account buttons.
2. `/chi` opens the same totals.
3. Select `Momo`; confirm income and expense category totals.
4. Select `Vay Và Trả`; confirm borrower names and dates.
5. Select one expense category; confirm expense rows only.
6. Return and open `📦 Quỹ & ngân sách`; confirm fund warnings still work.
7. Confirm internal transfers appear only in the account reconciliation line.

- [ ] **Step 7: Final checkpoint**

Record:

- automated test count;
- live `/thang` totals;
- one verified account total;
- one verified income category;
- one verified expense category;
- confirmation that internal transfers were excluded from global totals.
