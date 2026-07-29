# Telegram Finance Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/start` open a button-first monthly account report with separate Thu, Chi, category, and transaction-detail screens, while removing `/thang`.

**Architecture:** Keep `buildMonthlyCashflowData_()` as the shared data source. Change only the Telegram presentation and callback routing layers so every screen displays one level of information and never duplicates button content in message text.

**Tech Stack:** Google Apps Script JavaScript, Telegram Bot API inline keyboards, Notion API, Node.js built-in test runner.

## Global Constraints

- Reader-facing terminology is `Thu` and `Chi`, never `Tiền vào` or `Tiền ra`.
- Internal account transfers are excluded from Thu and Chi.
- Callback data must remain within Telegram's 64-byte UTF-8 limit.
- `/start` opens the account overview directly.
- `/thang` is not a command.
- Do not click an unrelated live account during verification.
- This directory is not a Git repository, so the plan has no commit steps.

---

### Task 1: Start Screen And Command Routing

**Files:**
- Modify: `outputs/telegram-finance-bot.test.js`
- Modify: `outputs/telegram-finance-bot-fixed.js`

**Interfaces:**
- Consumes: `sendMonthlyCashflowReport_(chatId, forceRefresh)`
- Produces: `/start` routing to the monthly overview; `/thang` routing to generic fallback

- [ ] **Step 1: Write failing routing and keyboard tests**

Update the `/start` test to expect `sendMonthlyCashflowReport_(42, false)`.
Update the command test to send `/thang` and expect:

```js
{
  chatId: 42,
  text: 'Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.'
}
```

Update the Level 1 keyboard expectation so the final rows are:

```js
[
  [{ text: '🎯 Mục tiêu', callback_data: 'show_goal' }],
  [{ text: '📦 Quỹ & ngân sách', callback_data: 'show_funds' }],
]
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="/start|/thang|level 1 cashflow keyboard" outputs\telegram-finance-bot.test.js
```

Expected: failures because `/start` still calls `sendStartMenu_()`, `/thang` still opens cashflow, and Level 1 lacks the approved Goal row.

- [ ] **Step 3: Implement minimal routing and Level 1 keyboard changes**

In `processUpdate_()`:

```js
if (command === '/start') sendMonthlyCashflowReport_(chatId, false);
else if (command === '/muctieu') sendGoalReport_(chatId);
else {
  var amount = parseAmount_(text);
  if (amount == null) {
    sendMessage_(chatId, 'Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.');
  }
}
```

In `monthlyCashflowKeyboard_()`, append separate Goal and Funds rows after the five active account rows. Remove the refresh button from this screen.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

### Task 2: Account Totals And Direction Screens

**Files:**
- Modify: `outputs/telegram-finance-bot.test.js`
- Modify: `outputs/telegram-finance-bot-fixed.js`

**Interfaces:**
- Consumes: `account.moneyIn`, `account.moneyOut`, `cashflowAccountCategories_()`
- Produces:
  - `cashflowAccountText_(data, account): string`
  - `cashflowAccountKeyboard_(account): object`
  - `cashflowDirectionText_(data, account, direction): string`
  - `cashflowDirectionKeyboard_(account, direction): object`
  - `parseCashflowDirectionCallback_(value): object|null`

- [ ] **Step 1: Write failing Level 2 tests**

Assert the account text is exactly:

```text
💳 Momo — tháng 7/2026
```

Assert the account keyboard is exactly:

```js
{
  inline_keyboard: [
    [{ text: 'Tổng Thu · 6.450.000đ', callback_data: 'cash_direction:momo:in' }],
    [{ text: 'Tổng Chi · 2.649.610đ', callback_data: 'cash_direction:momo:out' }],
    [{ text: '⬅️ Các tài khoản', callback_data: 'cash_home' }],
  ],
}
```

Assert both total buttons exist when their totals are zero. Assert account text does not contain category names, transfer totals, `Tiền vào`, or `Tiền ra`.

- [ ] **Step 2: Run Level 2 tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="level 2 account" outputs\telegram-finance-bot.test.js
```

Expected: failures because the existing account text repeats totals/categories and the keyboard jumps directly to categories.

- [ ] **Step 3: Implement the minimal Level 2 format**

Make `cashflowAccountText_()` return only the heading. Make
`cashflowAccountKeyboard_()` create `Tổng Thu`, `Tổng Chi`, and back buttons.

- [ ] **Step 4: Run Level 2 tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Write failing Level 3 tests**

For `direction === 'in'`, assert the text is exactly:

```text
📥 Momo — Tổng Thu
```

Assert the keyboard contains only nonzero income-category buttons:

```js
[
  [{ text: 'Grab - Tiền Về Ví · 6.150.000đ', callback_data: 'cash_cat:momo:in:grab' }],
  [{ text: 'Vay Và Trả · 300.000đ', callback_data: 'cash_cat:momo:in:loan' }],
  [{ text: '⬅️ Momo', callback_data: 'cash_account:momo' }],
  [{ text: '🏠 Các tài khoản', callback_data: 'cash_home' }],
]
```

Add corresponding `out` assertions using `💸 Momo — Tổng Chi`. Add parser tests for valid and invalid `cash_direction` callbacks.

- [ ] **Step 6: Run Level 3 tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="direction|level 3 category selection" outputs\telegram-finance-bot.test.js
```

Expected: failures because direction functions and callback routing do not exist.

- [ ] **Step 7: Implement direction formatters and callback routing**

Add:

```js
function parseCashflowDirectionCallback_(value) {
  var match = /^cash_direction:([A-Za-z0-9-]+):(in|out)$/.exec(String(value || ''));
  return match ? { accountToken: match[1], direction: match[2] } : null;
}
```

Add heading-only `cashflowDirectionText_()`, category-only
`cashflowDirectionKeyboard_()`, and `sendCashflowDirectionReport_()`. Route
`cash_direction:` callbacks before `cash_account:` callbacks.

- [ ] **Step 8: Run Level 3 tests and verify GREEN**

Run the command from Step 6. Expected: all selected tests pass.

### Task 3: Transaction Detail And Navigation

**Files:**
- Modify: `outputs/telegram-finance-bot.test.js`
- Modify: `outputs/telegram-finance-bot-fixed.js`

**Interfaces:**
- Consumes: existing `cashflowCategoryText_()` and `cash_cat:` callback format
- Produces: text-only transaction detail with direction-aware back navigation

- [ ] **Step 1: Write failing detail navigation tests**

Keep existing newest-first transaction-row assertions. Change the detail keyboard expectation to:

```js
{
  inline_keyboard: [
    [{ text: '⬅️ Tổng Thu', callback_data: 'cash_direction:momo:in' }],
    [{ text: '🏠 Các tài khoản', callback_data: 'cash_home' }],
  ],
}
```

Assert the detail keyboard contains no transaction buttons.

- [ ] **Step 2: Run detail tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="level 4|transaction detail|cash_cat" outputs\telegram-finance-bot.test.js
```

Expected: navigation assertion fails because the existing back button returns directly to the account.

- [ ] **Step 3: Implement direction-aware detail navigation**

Change the signature to:

```js
cashflowCategoryKeyboard_(account, direction)
```

Use `Tổng Thu` for `in`, `Tổng Chi` for `out`, and route back through
`cash_direction:<account>:<direction>`. Pass `direction` from every category
success and error call site.

- [ ] **Step 4: Run detail tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

### Task 4: Full Verification And Live Save

**Files:**
- Verify: `outputs/telegram-finance-bot-fixed.js`
- Verify: `outputs/telegram-finance-bot.test.js`
- Save to: Google Apps Script project `1aaj7iUlDJQT3xlGAhBztWsSYvpn105bLCzCRJ9nmtao5yIGlv4qe-J1o`

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: saved and live-verified Telegram bot

- [ ] **Step 1: Run syntax and full regression tests**

Run:

```powershell
node --check outputs\telegram-finance-bot-fixed.js
node --test outputs\telegram-finance-bot.test.js
```

Expected: syntax exit code 0 and all tests pass.

- [ ] **Step 2: Save exact source to Apps Script**

Replace the Apps Script editor contents with
`outputs/telegram-finance-bot-fixed.js`, save to Drive, reload, copy the editor
contents, normalize line endings, and assert exact equality with the local file.

- [ ] **Step 3: Verify `/start` live**

Send `/start` once and wait for the minute polling trigger. Verify:

- Heading only: `📊 Dòng tiền tháng 7/2026`.
- Five ordered balance buttons.
- `🎯 Mục tiêu` and `📦 Quỹ & ngân sách`.
- No `/thang`, `Vào`, `Ra`, `Tiền vào`, or `Tiền ra`.

- [ ] **Step 4: Verify one deliberate account path**

Click only `Tiền Mặt`, then verify the two buttons `Tổng Thu` and `Tổng Chi`.
Click one nonzero direction and verify category buttons. Click one category and
verify text transaction rows. Do not click Momo or another unrelated account.

- [ ] **Step 5: Report observed results**

Report the exact test count, successful Apps Script equality check, and the live
screen levels verified. If browser reading times out, distinguish that from an
Apps Script or Telegram failure.
