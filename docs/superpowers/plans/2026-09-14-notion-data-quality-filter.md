# Notion Transaction Data-Quality Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CHƯA ĐỦ DỮ KIỆN` validate every real current-month Notion transaction using only missing fields, unresolved explicit history, and explicit data conflicts.

**Architecture:** Keep raw row normalization and finance-ledger calculations in `ledger.js`, but add a separate `dataIssues` output whose entries always reference current-month Notion page IDs. Replace the one-month personal-loan lookup with complete pre-month history for all four transaction databases, use historical rows only in semantic reconciliation, and render only `dataIssues`; legacy calculated shortfalls remain aggregate values and can never become warning rows.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers, Notion REST API, Node.js built-in test runner, Wrangler.

**Spec:** `docs/superpowers/specs/2026-09-14-notion-data-quality-filter-design.md`

## Global Constraints

- Do not write to Notion or change its schema.
- Do not move money or create repayment transactions automatically.
- Do not add an AI model or infer transaction meaning from balances, equal amounts, nearby dates, or available cash.
- Only real current-month Notion rows may appear under `CHƯA ĐỦ DỮ KIỆN`.
- Only `missing_required_data`, `history_not_found`, and `conflicting_data` are user-facing issue types.
- Historical rows are reconciliation evidence only and never become current-month issues or spending.
- A rendered issue uses the original Notion date, title, and amount.
- `Thu Nhập Ròng Grab (App)` never requires the expense-only property `Loại Chi Phí`.
- Do not introduce `trả vượt khoản gốc`, parser-failure warnings, or calculated shortfall transactions.
- Preserve all existing budget, fund, cashflow, Telegram, cache, and Worker behavior outside this data-quality boundary.

---

## File Structure

- Modify `cloudflare-worker/src/ledger.js`: preserve raw field presence, validate required fields, reconcile current rows against full history, and produce typed `dataIssues`.
- Modify `cloudflare-worker/src/finance.js`: pass historical inputs, stop promoting calculated shortfalls, and render typed `dataIssues` once.
- Modify `cloudflare-worker/src/repository.js`: query all rows before the reporting month from all four transaction databases and pass them through without adding them to current-month totals.
- Modify `cloudflare-worker/test/ledger.test.js`: focused unit coverage for required fields, full-history reconciliation, conflict rules, and exclusion of internal calculations.
- Modify `cloudflare-worker/test/finance-regression.test.js`: exact Telegram copy, no duplicate inline warning, original Notion amounts, and preserved September behavior.
- Modify `cloudflare-worker/test/repository.test.js`: pre-month query filters, pagination/query wiring, and current-versus-history separation.

---

### Task 1: Introduce the typed current-row data-issue model

**Files:**
- Modify: `cloudflare-worker/src/ledger.js:206-238`
- Test: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: raw Notion pages already passed to `readFinanceRows_()`.
- Produces: normalized row fields `amountPresent: boolean` and `dataIssues: Array<DataIssue>` from `buildFinanceLedger_()`.
- `DataIssue` shape:

```js
{
  type: "missing_required_data" | "history_not_found" | "conflicting_data",
  rowId: string,
  date: string,
  createdTime: string,
  title: string,
  amount: number,
  details: string[]
}
```

- [ ] **Step 1: Write failing tests for common and database-specific required fields**

Add table-driven tests that create one current row per database kind and assert one issue per row:

```js
test("current rows report their exact missing required Notion properties once", () => {
  const incomeRow = income("income", "Thu chính", "", "", 100000, "2026-09-02");
  const otherRow = income("other", "Thu khác", "", "", 200000, "2026-09-03");
  const expenseRow = expense("expense", "Ăn tối", "", "", 35000, "2026-09-01");
  const transferRow = transfer("transfer", "Chuyển tiền", "", "", 50000, "2026-09-04", "");
  transferRow.properties["Loại Chuyển Đổi"] = { select: null };

  const { dataIssues } = buildFinanceLedger_({
    accountRows: [],
    categoryRows: [],
    incomeRows: [incomeRow],
    otherIncomeRows: [otherRow],
    expenseRows: [expenseRow],
    transferRows: [transferRow]
  });

  assert.deepEqual(dataIssues.map(({ rowId, type, details }) => ({ rowId, type, details })), [
    { rowId: "expense", type: "missing_required_data", details: ["Loại Chi Phí", "Phương Thức Thanh Toán"] },
    { rowId: "income", type: "missing_required_data", details: ["Loại Khoản Thu", "Phương Thức Thanh Toán"] },
    { rowId: "other", type: "missing_required_data", details: ["Loại Khoản Thu", "Phương Thức Thanh Toán"] },
    { rowId: "transfer", type: "missing_required_data", details: ["Loại Chuyển Đổi", "Từ Tài Khoản", "Đến Tài Khoản"] }
  ]);
});
```

Also add one test where title, date, and amount are absent. Assert the issue lists `Nội dung`, `Ngày`, and `Số Tiền` and preserves `amount: 0` without generating another amount.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern "current rows report their exact missing|required Notion properties" test/ledger.test.js
```

Expected: FAIL because normalized rows do not retain amount presence and `buildFinanceLedger_()` does not return `dataIssues`.

- [ ] **Step 3: Preserve field presence in normalized rows**

In `row_()`, keep the existing values and add explicit presence metadata:

```js
const amountProperty = props["Số Tiền"];
return {
  // existing fields
  amount: amount_(amountProperty),
  amountPresent: Number.isFinite(amountProperty?.number),
  datePresent: typeof props["Ngày"]?.date?.start === "string" && props["Ngày"].date.start !== "",
  titlePresent: title.trim() !== ""
};
```

Do not treat numeric zero as missing when the number property is present.

- [ ] **Step 4: Add the required-field validator and stable issue ordering**

Add private helpers beside `readFinanceRows_()`:

```js
function dataIssue_(row, type, details) {
  return {
    type,
    rowId: row.id,
    date: row.date,
    createdTime: row.createdTime,
    title: row.title,
    amount: row.amount,
    details: [...new Set(details)]
  };
}

function missingFields_(row) {
  const missing = [];
  if (!row.titlePresent) missing.push("Nội dung");
  if (!row.datePresent) missing.push("Ngày");
  if (!row.amountPresent) missing.push("Số Tiền");
  if (row.kind === "expense") {
    if (!row.categoryId) missing.push("Loại Chi Phí");
    if (!row.accountId) missing.push("Phương Thức Thanh Toán");
  }
  if (row.kind === "income" || row.kind === "otherIncome") {
    if (!row.categoryId) missing.push("Loại Khoản Thu");
    if (!row.accountId) missing.push("Phương Thức Thanh Toán");
  }
  if (row.kind === "transfer") {
    if (!row.transferType) missing.push("Loại Chuyển Đổi");
    if (!row.fromAccountId) missing.push("Từ Tài Khoản");
    if (!row.toAccountId) missing.push("Đến Tài Khoản");
  }
  return missing;
}
```

Build one missing issue per current row and sort by `date`, `createdTime`, then `rowId`. Return it as `dataIssues` without removing the legacy internal ledgers yet.

- [ ] **Step 5: Add the Grab net-income regression**

Create a complete income page whose `Loại Khoản Thu` relation is `goalRelationPageId`, has no `Loại Chi Phí` property, and assert it has no missing issue:

```js
assert.equal(result.dataIssues.some((issue) => issue.rowId === "grab-net"), false);
```

This proves income is checked against its own schema rather than expense fields.

- [ ] **Step 6: Run focused and ledger tests and verify GREEN**

Run:

```powershell
node --test test/ledger.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "feat(du-lieu): kiem tra truong bat buoc"
```

---

### Task 2: Load complete pre-month history without contaminating current totals

**Files:**
- Modify: `cloudflare-worker/src/repository.js:72-104,180-232`
- Modify: `cloudflare-worker/src/finance.js:560-590`
- Modify: `cloudflare-worker/src/ledger.js:121-160`
- Test: `cloudflare-worker/test/repository.test.js`
- Test: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: report month `{ y, m, d }` and the same four Notion transaction database IDs already configured.
- Produces: `historicalIncomeRows`, `historicalOtherIncomeRows`, `historicalExpenseRows`, and `historicalTransferRows` containing every row before the first day of the report month.
- `buildFinanceLedger_()` consumes those four arrays but keeps its public `rows` property current-only.

- [ ] **Step 1: Write a failing repository filter test**

For the fixed report date `2026-09-14`, provide a current explicit repayment
and assert the repository issues four historical queries using:

```js
const historyFilter = {
  property: "Ngày",
  date: { on_or_before: "2026-08-31" }
};
```

The complete ordered query list must contain the seven existing current/master
queries plus historical queries for `income`, `other-income`, `expenses`, and
`transfers`. Remove expectations for the old two-query previous-month window.
Add a second fixture with no current historical reference and assert it performs
only the seven current/master queries.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```powershell
node --test --test-name-pattern "fund report wires complete pre-month history" test/repository.test.js
```

Expected: FAIL because `getFundBudgetReport()` still queries only previous-month expenses and other income.

- [ ] **Step 3: Replace the previous-month filter with a pre-month filter**

Replace `previousMonthFilterFor()` with:

```js
function historyBeforeMonthFilterFor(t) {
  const end = new Date(Date.UTC(t.y, t.m - 1, 0));
  return {
    property: MONTH_DATE_PROPERTY,
    date: { on_or_before: iso_(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()) }
  };
}
```

Fetch the seven current/master inputs first. Normalize the four current
transaction arrays and use a new exported helper:

```js
export function historyLookupRequired_(rows = []) {
  return rows.some((row) => /\b(?:tra no|tra lai|tra tien muon|nhan lai|hoan lai|hoan tien|cap bu|dao giao dich|dieu chinh|thang truoc|truoc do)\b/.test(row.normalizedText));
}
```

When it returns `true`, query all four historical transaction databases with
the pre-month filter in one `Promise.all()`. When it returns `false`, pass four
empty history arrays and perform no history query. This keeps the trigger tied
to an explicit current-row dependency while still allowing the historical
opening to live in any transaction database. Notion pagination remains handled
by `queryDatabase()`.

- [ ] **Step 4: Pass all four history arrays through finance**

Replace `previousExpenseRows` and `previousOtherIncomeRows` options with the four `historical*Rows` names in `repository.js`, `finance.js`, and `ledger.js`.

In `buildFinanceLedger_()` create two distinct collections:

```js
const currentRows = readFinanceRows_({ incomeRows, otherIncomeRows, expenseRows, transferRows });
const historicalRows = readFinanceRows_({
  incomeRows: historicalIncomeRows,
  otherIncomeRows: historicalOtherIncomeRows,
  expenseRows: historicalExpenseRows,
  transferRows: historicalTransferRows
});
const semanticRows = [...historicalRows, ...currentRows];
```

Use `semanticRows` for personal-loan and fund-loan reconciliation. Keep opening allocation, current spending, current transfer totals, and `return.rows` based only on `currentRows`.

Pass `currentRowIds` into `buildFundLoanLedger_()`. Historical fund rows may
open or close debts for reconciliation, but only current-row fund movements may
contribute to `allocationAdjustments` and `balanceAdjustments`:

```js
const currentRowIds = new Set(currentRows.map((row) => row.id));
const fundLoans = buildFundLoanLedger_(semanticRows, fundGroupRows, { currentRowIds });
```

Guard each allocation/balance adjustment with `currentRowIds.has(row.id)` so a
historical fund movement cannot be counted again in this month's allocation.

- [ ] **Step 5: Write a failing separation test**

Create a July loan opening, a September repayment, and an unrelated August expense. Assert:

```js
const result = buildFinanceLedger_({
  accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
  categoryRows: [{ id: "loan", properties: {
    "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] }
  } }],
  historicalOtherIncomeRows: [
    income("july-loan", "Tố cho mượn tiền", "loan", "momo", 1000000, "2026-07-10")
  ],
  historicalExpenseRows: [
    expense("august-expense", "Ăn tối", "food", "bank", 35000, "2026-08-09")
  ],
  expenseRows: [
    expense("september-repayment", "Trả nợ Tố mượn tháng trước", "loan", "bank", 1000000, "2026-09-07")
  ]
});

assert.equal(result.personalLoans.liabilities[0].outstanding, 0);
assert.deepEqual(result.rows.map((row) => row.id), ["september-repayment"]);
assert.equal(result.dataIssues.some((issue) => issue.rowId === "august-expense"), false);
```

- [ ] **Step 6: Run focused repository and ledger tests and verify GREEN**

Run:

```powershell
node --test test/repository.test.js test/ledger.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- cloudflare-worker/src/repository.js cloudflare-worker/src/finance.js cloudflare-worker/src/ledger.js cloudflare-worker/test/repository.test.js cloudflare-worker/test/ledger.test.js
git commit -m "feat(doi-soat): doc day du lich su lien quan"
```

---

### Task 3: Convert semantic reconciliation failures into the three approved issue types

**Files:**
- Modify: `cloudflare-worker/src/ledger.js:39-160,241-379,459-600`
- Test: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: `currentRows`, `historicalRows`, existing account/category/fund maps, and outputs from personal/fund/advance ledgers.
- Produces: current-row `dataIssues` with only the three approved types; legacy `unmatched` arrays remain internal until Task 5 removes their report path.

- [ ] **Step 1: Write failing tests for approved history outcomes**

Add focused cases:

```js
test("a current explicit repayment with no historical opening reports history_not_found", () => {
  const result = buildFinanceLedger_({
    categoryRows: [{ id: "loan", properties: {
      "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] }
    } }],
    expenseRows: [
      expense("repay-to", "Trả nợ Tố mượn tháng trước", "loan", "bank", 500000, "2026-09-07")
    ]
  });
  assert.deepEqual(result.dataIssues.map(({ type, rowId, details }) => ({ type, rowId, details })), [{
    type: "history_not_found",
    rowId: "repay-to",
    details: ["Không tìm thấy bản ghi gốc liên quan"]
  }]);
});

test("repayment continues through all matching historical openings without an excess category", () => {
  const result = buildFinanceLedger_({
    categoryRows: [{ id: "loan", properties: {
      "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] }
    } }],
    historicalOtherIncomeRows: [
      income("to-a", "Tố cho mượn tiền", "loan", "momo", 400000, "2026-07-01"),
      income("to-b", "Tố cho mượn tiền", "loan", "momo", 600000, "2026-08-01")
    ],
    expenseRows: [
      expense("repay-to", "Trả nợ Tố mượn trước đó", "loan", "bank", 1000000, "2026-09-07")
    ]
  });
  assert.equal(result.dataIssues.length, 0);
  assert.equal(JSON.stringify(result).includes("excess-fund-repayment"), false);
});
```

Cover personal repayment, internal-fund repayment, refund/reimbursement, and receiving repayment of a receivable.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "history_not_found|without an excess category" test/ledger.test.js
```

Expected: FAIL because legacy `unmatched` reasons are not typed `dataIssues` and fund repayment still emits `excess-fund-repayment`.

- [ ] **Step 3: Add current-row issue aggregation and deduplication**

Add a helper that accepts only current IDs and merges details for the same row/type:

```js
function mergeDataIssue_(issuesByKey, currentRowIds, row, type, details) {
  if (!currentRowIds.has(row.id)) return;
  const key = row.id + ":" + type;
  const existing = issuesByKey.get(key);
  if (existing) {
    existing.details = [...new Set([...existing.details, ...details])];
    return;
  }
  issuesByKey.set(key, dataIssue_(row, type, details));
}
```

Required-field, history, and conflict checks must all use this helper so one row is not printed twice for the same issue type.

- [ ] **Step 4: Map personal-loan failures to history issues**

After applying a repayment to every matching opening in chronological order, any remaining amount means the complete loaded history did not contain enough matching principal. Add `history_not_found` for the current repayment row with `Không tìm thấy bản ghi gốc liên quan`. Do not expose the remaining calculated amount and do not name it overpayment.

Rows whose text indicates a personal-loan action but omits the person belong to `missing_required_data` with detail `Người liên quan`, provided the current row otherwise has the required database properties.

- [ ] **Step 5: Map internal-fund failures without an excess status**

Replace legacy fund reasons as follows:

```text
unidentified fund party with no explicit named fund -> missing_required_data: Quỹ liên quan
explicit named fund conflicts with Nhóm Quỹ -> conflicting_data: name both values
no matching historical opening -> history_not_found: Không tìm thấy bản ghi gốc liên quan
remaining after all matching openings -> history_not_found: Không tìm thấy bản ghi gốc liên quan
```

Delete the user-facing meaning of `excess-fund-repayment`; no issue detail may include `trả vượt` or a computed remainder.

- [ ] **Step 6: Map explicit reimbursements**

For a row containing `trả lại`, `hoàn lại`, or `cấp bù`:

- No explicit beneficiary/source: add `missing_required_data` with `Tài khoản hoặc quỹ cần hoàn`.
- One explicit known beneficiary but no matching historical obligation after the full search: add `history_not_found`.
- Two explicit beneficiaries or a beneficiary that conflicts with a structured relation: add `conflicting_data` naming both values.

Do not create an issue from account balance, cohort depletion, or remaining calculated reimbursement amount.

- [ ] **Step 7: Remove calculated source shortfalls from semantic issue producers**

Delete pushes that create warning-like rows solely because `currentUse.remaining` is positive. Keep any numeric values needed for aggregate ledger arithmetic, but do not put them in `dataIssues` or in a collection consumed by the renderer.

- [ ] **Step 8: Run all ledger tests and verify GREEN**

Run:

```powershell
node --test test/ledger.test.js
```

Expected: PASS with zero failures, no issue type outside the three approved values, and no `excess-fund-repayment` assertion.

- [ ] **Step 9: Commit Task 3**

```powershell
git add -- cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "fix(doi-soat): chi bao ba loi du lieu that"
```

---

### Task 4: Detect explicit conflicts without guessing from vague text

**Files:**
- Modify: `cloudflare-worker/src/ledger.js`
- Test: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: normalized text plus real account and fund names/aliases already loaded from Notion.
- Produces: `conflicting_data` only when explicit text resolves to a known entity and contradicts the corresponding structured relation.

- [ ] **Step 1: Write failing conflict and non-conflict tests**

Add these cases:

```js
test("explicit transfer account text conflicting with relations reports both values", () => {
  const result = buildFinanceLedger_({
    accountRows: [
      account("bank", "Banking", 0, 0),
      account("cash", "Grap Tiền Mặt", 0, 0),
      account("momo", "Momo", 0, 0)
    ],
    transferRows: [
      transfer("conflict", "Chuyển từ Banking sang Momo", "cash", "momo", 500000, "2026-09-15", "")
    ]
  });
  assert.deepEqual(result.dataIssues[0].details, ["Ghi chú: Banking; Từ Tài Khoản: Grap Tiền Mặt"]);
});

test("vague text never overrides valid structured account and fund relations", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [
      transfer("valid", "Chuyển tiền chi tiêu", "bank", "momo", 500000, "2026-09-15", "")
    ]
  });
  assert.equal(result.dataIssues.length, 0);
});
```

Add a Quỹ Momo conflict with existing helpers:

```js
const fundConflict = buildFinanceLedger_({
  accountRows: [account("fund-account", "Quỹ Momo", 0, 0)],
  fundGroupRows: loanFunds,
  transferRows: [
    fundTransfer("fund-conflict", "Nhu cầu thiết yếu trả lại cho quỹ tiết kiệm", 200000, "essential")
  ]
});
assert.equal(fundConflict.dataIssues[0].type, "conflicting_data");
assert.match(fundConflict.dataIssues[0].details.join(" "), /Nhu cầu thiết yếu|Tiết kiệm dài hạn/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "conflicting with relations|vague text never overrides" test/ledger.test.js
```

Expected: FAIL because there is no approved conflict validator.

- [ ] **Step 3: Resolve only explicit directional phrases**

Build account comparison only from explicit phrases such as `từ <known account>` and `sang|vào|đến <known account>`. Resolve the captured phrase against normalized full names from `accountNamesById`; do not scan for any account word anywhere in the note.

Compare resolved `từ` only with `fromAccountId`, resolved destination only with `toAccountId`, and an explicit payment phrase such as `thanh toán bằng <known account>` only with `accountId`. If no unique known name resolves, produce no conflict issue from that phrase.

- [ ] **Step 4: Validate same-account Quỹ Momo virtual movements**

When both physical relations resolve to Quỹ Momo:

- Require `Nhóm Quỹ`.
- Require exactly one other explicitly named, uniquely resolved fund for a movement between two virtual funds.
- If the named lender/recipient is the same as the structured group where the operation requires two distinct funds, add `conflicting_data`.
- If the other fund is absent, add `missing_required_data` with `Quỹ liên quan`.

Use existing `Tên Nhóm Quỹ` and `Tên Cũ` aliases. Do not infer a fund from amount or account balance.

- [ ] **Step 5: Run ledger tests and verify GREEN**

Run:

```powershell
node --test test/ledger.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "feat(du-lieu): phat hien mau thuan ro rang"
```

---

### Task 5: Render only approved current-row data issues

**Files:**
- Modify: `cloudflare-worker/src/finance.js:994-1012,1257-1281,1325-1385`
- Test: `cloudflare-worker/test/finance-regression.test.js`

**Interfaces:**
- Consumes: `data.explicitLedger.dataIssues: DataIssue[]`.
- Produces: one optional `⚠️ CHƯA ĐỦ DỮ KIỆN` section with one compact bullet per real current-month row.

- [ ] **Step 1: Write failing exact-output tests**

Add a model with three approved issues and assert exact text:

```text
⚠️ CHƯA ĐỦ DỮ KIỆN
• 09/09 — Ăn tối — 35.000đ · thiếu Loại Chi Phí
• 12/09 — Hoàn lại Banking — 100.000đ · không tìm thấy bản ghi gốc liên quan
• 15/09 — Chuyển quỹ — 500.000đ · ghi chú: Banking; tài khoản: Momo
```

Add negative assertions that the output contains neither `26.000đ`, `trả vượt`, `source-funding-shortfall`, nor a duplicate inline `⚠️ thiếu loại chi`.

- [ ] **Step 2: Run focused renderer tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "renders only approved current-row data issues|does not duplicate missing category" test/finance-regression.test.js
```

Expected: FAIL because the renderer still consumes `explicitLedger.unmatched` and the group line can append `⚠️ thiếu loại chi`.

- [ ] **Step 3: Replace `appendUnmatched_()` with `appendDataIssues_()`**

Render only `ledger.dataIssues`. Map details as follows:

```js
const issuePrefix = {
  missing_required_data: "thiếu ",
  history_not_found: "",
  conflicting_data: ""
};
```

For each issue, use `issue.date`, `issue.title`, and `issue.amount`; never use `unmatchedAmount`. Join missing field names with `, ` and preserve explicit Vietnamese conflict/history details.

- [ ] **Step 4: Remove legacy warning feeds and duplication**

- Stop pushing `group.fundingShortfall` into a renderer-facing ledger collection.
- Remove `group.unmatchedCategories` from `budgetLine_()` output; missing categories are already current-row `dataIssues`.
- Keep `fundingShortfall`, `unmatchedCategories`, or similar values only if another aggregate calculation still uses them. Remove fields made unused by this change, but do not refactor unrelated finance code.

- [ ] **Step 5: Update the complete September fixture**

Assert all of these together:

- The August Tố opening is matched to both September repayments and has zero outstanding.
- No Tố row appears under `CHƯA ĐỦ DỮ KIỆN`.
- The real `Ăn tối` row displays 35,000 VND only if it actually lacks an approved required field.
- No 26,000 VND synthetic row appears.
- The 750,000 VND internal fund debt remains independent until an explicit repayment exists.

- [ ] **Step 6: Run finance regression tests and verify GREEN**

Run:

```powershell
node --test test/finance-regression.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 7: Commit Task 5**

```powershell
git add -- cloudflare-worker/src/finance.js cloudflare-worker/test/finance-regression.test.js
git commit -m "fix(bao-cao): chi hien thi loi du lieu Notion"
```

---

### Task 6: Verify, integrate, deploy, and check live data

**Files:**
- Verify only: `cloudflare-worker/src/*.js`
- Verify only: `cloudflare-worker/test/*.test.js`

**Interfaces:**
- Consumes: the completed implementation from Tasks 1-5.
- Produces: tested `main`, GitHub `origin/main`, a deployed Cloudflare Worker version, healthy bindings, and a read-only live-report verification.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
Set-Location cloudflare-worker
npm test
npm run check
npx wrangler deploy --dry-run
```

Expected: every test passes, syntax check exits 0, and Wrangler dry-run builds successfully.

- [ ] **Step 2: Audit the exact diff boundary**

Run:

```powershell
Set-Location ..
git diff --check
git status --short
git diff --stat 4a9ba5d..HEAD
```

Expected: only the source/tests named in this plan plus this approved spec/plan changed; no Notion export, secret, local Wrangler credential, build artifact, or unrelated formatting file is tracked.

- [ ] **Step 3: Fetch and integrate safely**

Run:

```powershell
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected before push: no unexpected remote commits. If the remote side is nonzero, stop and inspect/rebase without discarding local commits.

- [ ] **Step 4: Push the approved commits to `main`**

Run:

```powershell
git push origin main
```

Expected: `origin/main` advances to the verified implementation commit.

- [ ] **Step 5: Deploy the verified Worker**

Run:

```powershell
Set-Location cloudflare-worker
npm run deploy
```

Expected: Wrangler prints the production Worker URL and a new version ID.

- [ ] **Step 6: Verify production health**

Run:

```powershell
Invoke-RestMethod -Uri "https://notion-finance-bot.hongthamcute04.workers.dev/health" -Method Get | ConvertTo-Json -Compress
```

Expected: `status` is `ok` and every required binding is `true`.

- [ ] **Step 7: Verify the live report without modifying Notion**

Ask the user to press the existing `Quỹ & ngân sách` button, or obtain action-time confirmation before sending a Telegram command on their behalf. Then inspect the new bot response and verify:

- Every `CHƯA ĐỦ DỮ KIỆN` bullet corresponds to a visible current-month Notion row.
- Its title, date, and amount exactly equal that row.
- The report contains no synthetic `Ăn tối 26.000đ`.
- The August Tố opening and both September repayments reconcile to zero outstanding.
- Historical rows are not copied into the September warning section.
- No Notion page is created, edited, or deleted.

- [ ] **Step 8: Record final evidence**

Report the full test count, syntax/dry-run result, Git commit, deployed Worker version ID, `/health` response, and the precise live-verification boundary. Do not claim Telegram behavior verified unless the fresh post-deployment response was actually inspected.
