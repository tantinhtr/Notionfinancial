# Explicit Finance Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inferred fund debt and repayment with an explicit transaction ledger that reads every relevant Notion field, preserves the one-time previous-month allocation, and reports only repayments that have an identifying transaction.

**Architecture:** Add one pure `ledger.js` domain module beside the existing large `finance.js`. It converts raw Notion rows into normalized semantic rows, builds the monthly opening plan, personal-loan ledger, previous-month reimbursement ledger, and internal virtual-fund loan ledger; `finance.js` consumes those results for fund arithmetic and Telegram text without changing the Notion schema or making writes.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, Node.js built-in test runner (`node:test`), Notion API row objects.

**Spec:** `docs/superpowers/specs/2026-09-09-explicit-finance-ledger-design.md`

## Global Constraints

- Read title, note, type, amount, date, account relations, and fund relation for every income, other-income, expense, and transfer row.
- Structured relations take precedence; explicit title/note wording is the fallback; ambiguous rows are reported and never guessed.
- Never infer repayment from a balance, available income, matching amount, matching date, or shared payment account.
- `Quỹ Momo` is excluded from the previous-month source pool.
- The previous-month pool uses only `Tiền Mặt`, `Banking`, `Grap Tiền Mặt`, and `Momo` opening balances.
- Reserve exactly 2,150,000 VND for Nhà Trọ once; this use does not require reimbursement.
- Split the remaining opening pool once and equally among `Tiết kiệm dài hạn`, `Đầu tư tài chính`, and `Hưởng thụ`; never split a current balance such as 665,000 VND again.
- Keep Nhu cầu thiết yếu and Giáo dục phát triển on their existing fixed child budgets.
- Fund balance, debt principal, repayment, and budget funding need are independent values.
- A debt decreases only through an explicit repayment row naming the party or source.
- Keep loan principal outside `personalSpendingTotal` and the 5.5M ceiling.
- Do not mutate Notion, change its schema, deploy, or add dependencies.

## File Structure

- Create `cloudflare-worker/src/ledger.js`: pure Notion row reader and all explicit ledger calculations.
- Create `cloudflare-worker/test/ledger.test.js`: focused behavioral tests for row semantics and each ledger.
- Modify `cloudflare-worker/src/finance.js`: consume ledger output, correct fund arithmetic, and render the separated sections.
- Modify `cloudflare-worker/src/config.js`: hold the four source names, rent reserve, and three rollover fund names as business constants.
- Modify `cloudflare-worker/src/repository.js`: pass those constants and the already-fetched rows into the ledger through `buildAccountSpendingData_`.
- Modify `cloudflare-worker/test/config.test.js`: lock the finance constants exposed by production config.
- Modify `cloudflare-worker/test/finance-regression.test.js`: preserve old report behavior where compatible and add the complete September 2026 regression fixture.
- Modify `cloudflare-worker/test/repository.test.js`: prove the repository forwards the new options without adding Notion queries.

---

### Task 1: Normalize Every Notion Transaction Row

**Files:**
- Create: `cloudflare-worker/src/ledger.js`
- Create: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: raw Notion page rows from the four transaction databases.
- Produces: `readFinanceRows_({ incomeRows, otherIncomeRows, expenseRows, transferRows }): SemanticRow[]`.
- `SemanticRow` fields: `id`, `kind`, `title`, `note`, `text`, `normalizedText`, `amount`, `date`, `createdTime`, `categoryId`, `accountId`, `fromAccountId`, `toAccountId`, `fundGroupId`, and `transferType`.

- [ ] **Step 1: Write the failing semantic-row test**

Add a table-driven test with one complete row from each database. The transfer fixture must mirror the live title property named `Ghi Chú`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFinanceRows_ } from "../src/ledger.js";

test("reads title note type account and fund fields from every finance database", () => {
  const transfer = {
    id: "borrow-savings",
    created_time: "2026-09-08T05:00:00.000Z",
    properties: {
      "Ghi Chú": { title: [{ plain_text: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu" }] },
      "Số Tiền": { number: 750000 },
      "Ngày": { date: { start: "2026-09-08" } },
      "Loại Chuyển Đổi": { select: { name: "Giao Dịch Giữa Các Tài Khoản" } },
      "Từ Tài Khoản": { relation: [{ id: "fund-account" }] },
      "Đến Tài Khoản": { relation: [{ id: "fund-account" }] },
      "Nhóm Quỹ": { relation: [{ id: "essential" }] }
    }
  };

  const [row] = readFinanceRows_({ transferRows: [transfer] });
  assert.deepEqual(row, {
    id: "borrow-savings",
    kind: "transfer",
    title: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu",
    note: "",
    text: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu",
    normalizedText: "muon tien cua quy tiet kiem chuyen sang tien phong quy thiet yeu",
    amount: 750000,
    date: "2026-09-08",
    createdTime: "2026-09-08T05:00:00.000Z",
    categoryId: "",
    accountId: "",
    fromAccountId: "fund-account",
    toAccountId: "fund-account",
    fundGroupId: "essential",
    transferType: "Giao Dịch Giữa Các Tài Khoản"
  });
});
```

Add equivalent literal assertions for `Tên Khoản Thu` plus `Ghi Chú` on both income databases, and `Nội Dung Khoản Chi` plus `Ghi Chú` on expenses.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `cd cloudflare-worker && node --test test/ledger.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ledger.js`.

- [ ] **Step 3: Implement the pure property reader**

Create `ledger.js` with no Notion client dependency:

```js
function normalizeLedgerText_(value) {
  let text = String(value || "").toLowerCase();
  if (text.normalize) text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return text.replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function propertyText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || part.text?.content || "").join("");
}

function relationId_(property) {
  const relation = property?.relation || [];
  return relation.length ? relation[0].id : "";
}

function amount_(property) {
  return Number(property?.number) || 0;
}

function row_(kind, page, titleProperty) {
  const props = page.properties || {};
  const title = propertyText_(props[titleProperty]);
  const note = titleProperty === "Ghi Chú" ? "" : propertyText_(props["Ghi Chú"]);
  const text = [title, note].filter(Boolean).join(" | ");
  return {
    id: page.id,
    kind,
    title,
    note,
    text,
    normalizedText: normalizeLedgerText_(text),
    amount: amount_(props["Số Tiền"]),
    date: props["Ngày"]?.date?.start || "",
    createdTime: page.created_time || "",
    categoryId: relationId_(props[kind === "expense" ? "Loại Chi Phí" : "Loại Khoản Thu"]),
    accountId: relationId_(props["Phương Thức Thanh Toán"]),
    fromAccountId: relationId_(props["Từ Tài Khoản"]),
    toAccountId: relationId_(props["Đến Tài Khoản"]),
    fundGroupId: relationId_(props["Nhóm Quỹ"]),
    transferType: props["Loại Chuyển Đổi"]?.select?.name || ""
  };
}

export function readFinanceRows_({
  incomeRows = [], otherIncomeRows = [], expenseRows = [], transferRows = []
} = {}) {
  return [
    ...incomeRows.map((page) => row_("income", page, "Tên Khoản Thu")),
    ...otherIncomeRows.map((page) => row_("otherIncome", page, "Tên Khoản Thu")),
    ...expenseRows.map((page) => row_("expense", page, "Nội Dung Khoản Chi")),
    ...transferRows.map((page) => row_("transfer", page, "Ghi Chú"))
  ].sort((a, b) => (a.date + a.createdTime).localeCompare(b.date + b.createdTime));
}
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `cd cloudflare-worker && node --test test/ledger.test.js`

Expected: PASS with all four database row shapes preserved.

- [ ] **Step 5: Commit the semantic reader**

```bash
git add cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "feat(finance): doc du nghia giao dich"
```

---

### Task 2: Build the One-time Previous-month Opening Plan

**Files:**
- Modify: `cloudflare-worker/src/ledger.js`
- Modify: `cloudflare-worker/src/config.js:43-70`
- Modify: `cloudflare-worker/src/repository.js:200-215`
- Modify: `cloudflare-worker/test/ledger.test.js`
- Modify: `cloudflare-worker/test/config.test.js:24-40`
- Modify: `cloudflare-worker/test/repository.test.js:11-24,336-355`

**Interfaces:**
- Consumes: account rows and `{ sourceAccountNames, rentReserveAmount, rolloverFundNames }`.
- Produces: `buildOpeningPlan_(accountRows, options): OpeningPlan` with `sourceTotal`, `rentReserve`, `rentShortfall`, `remainder`, `allocations`, and per-account opening balances.
- `buildAccountSpendingData_` receives the same constants inside its existing `options` object.

- [ ] **Step 1: Write the failing opening-plan test**

Use literal September balances and include Quỹ Momo as the exclusion guard:

```js
test("builds the September opening plan once from four free sources", () => {
  const accounts = [
    account("cash", "Tiền Mặt", 2021000, 665000),
    account("bank", "Banking", 1670004, 0),
    account("grab-cash", "Grap Tiền Mặt", 0, 9000),
    account("momo", "Momo", 158706, 100000),
    account("fund", "Quỹ Momo", 706166, 247876)
  ];
  assert.deepEqual(buildOpeningPlan_(accounts, OPENING_OPTIONS), {
    sourceTotal: 3849710,
    rentReserve: 2150000,
    rentShortfall: 0,
    remainder: 1699710,
    sourceAccounts: [
      { id: "cash", name: "Tiền Mặt", opening: 2021000 },
      { id: "bank", name: "Banking", opening: 1670004 },
      { id: "grab-cash", name: "Grap Tiền Mặt", opening: 0 },
      { id: "momo", name: "Momo", opening: 158706 }
    ],
    allocations: [
      { fund: "Tiết kiệm dài hạn", amount: 566570 },
      { fund: "Đầu tư tài chính", amount: 566570 },
      { fund: "Hưởng thụ", amount: 566570 }
    ]
  });
});
```

The `account()` fixture must expose `Số Dư Ban Đầu` and `Số Dư Hiện Tại`; assert that changing only the current balance from 665,000 to another value leaves the plan unchanged.

- [ ] **Step 2: Run the opening-plan test and verify RED**

Run: `cd cloudflare-worker && node --test --test-name-pattern="opening plan" test/ledger.test.js`

Expected: FAIL because `buildOpeningPlan_` is not exported.

- [ ] **Step 3: Write failing config and repository wiring tests**

Extend `config.test.js` with literal assertions for the four source names,
2,150,000 VND reserve, and three rollover fund names. Extend the repository
test config with the same values and assert that the returned model contains
the opening plan while `notion.calls` still contains exactly seven reads.

Run: `cd cloudflare-worker && node --test test/config.test.js test/repository.test.js`

Expected: FAIL because production config and repository do not forward these
options yet.

- [ ] **Step 4: Implement opening-plan arithmetic and wiring**

Add a numeric reader that supports number, formula, and rollup values. Match account names through `normalizeSearchText_`, take `Math.min(sourceTotal, rentReserveAmount)`, and divide the non-negative remainder into equal integer shares. Put any indivisible VND remainder on the first allocation so the allocations always sum exactly to `remainder`.

Add these exact business constants to `getConfig()`:

```js
sourceAccountNames: ["Tiền Mặt", "Banking", "Grap Tiền Mặt", "Momo"],
rentReserveAmount: 2150000,
rolloverFundNames: ["Tiết kiệm dài hạn", "Đầu tư tài chính", "Hưởng thụ"],
```

Pass them through `repository.js`:

```js
sourceAccountNames: config.sourceAccountNames,
rentReserveAmount: config.rentReserveAmount,
rolloverFundNames: config.rolloverFundNames
```

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `cd cloudflare-worker && node --test test/ledger.test.js test/repository.test.js`

Expected: PASS; the query count remains seven.

- [ ] **Step 6: Commit the opening plan**

```bash
git add cloudflare-worker/src/ledger.js cloudflare-worker/src/config.js cloudflare-worker/src/repository.js cloudflare-worker/test/ledger.test.js cloudflare-worker/test/config.test.js cloudflare-worker/test/repository.test.js
git commit -m "feat(finance): chot tien du dau thang"
```

---

### Task 3: Track Personal Loans and Explicit Cross-account Repayments

**Files:**
- Modify: `cloudflare-worker/src/ledger.js`
- Modify: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: `SemanticRow[]` plus category-name maps.
- Produces: `buildPersonalLoanLedger_(rows, { loanCategoryIds }): { receivables, liabilities, repayments, unmatched }`.
- Every open item contains `party`, `principal`, `repaid`, `outstanding`, `openedBy`, and `repaymentRows`.

- [ ] **Step 1: Write failing tests for the exact Tuấn, Em, and Tố behaviors**

```js
test("repays Tuấn across accounts but never links Em's loan to Tố's payment", () => {
  const ledger = buildPersonalLoanLedger_(readFinanceRows_({
    expenseRows: [
      expense("lend-tuan", "Cho cháu Tuấn mượn", "loan", "bank", 100000, "2026-09-03"),
      expense("pay-to", "Trả tiền mượn tố tháng trước (còn nợ 500)", "loan", "bank", 500000, "2026-09-07")
    ],
    otherIncomeRows: [
      income("tuan-return", "Cháu Tuấn trả nợ", "loan", "momo", 100000, "2026-09-05"),
      income("borrow-em", "Em cho mượn tiền", "loan", "bank", 500000, "2026-09-06")
    ]
  }), { loanCategoryIds: new Set(["loan"]) });

  assert.deepEqual(ledger.receivables[0], {
    party: "cháu tuấn", principal: 100000, repaid: 100000, outstanding: 0,
    openedBy: "lend-tuan", repaymentRows: ["tuan-return"]
  });
  assert.deepEqual(ledger.liabilities.find((item) => item.party === "em"), {
    party: "em", principal: 500000, repaid: 0, outstanding: 500000,
    openedBy: "borrow-em", repaymentRows: []
  });
  assert.equal(ledger.repayments.find((row) => row.id === "pay-to").party, "tố");
  assert.equal(ledger.liabilities.find((item) => item.party === "em").repaid, 0);
});
```

Add a separate test proving a generic 500,000 VND income and a generic 500,000 VND expense never match.

- [ ] **Step 2: Run the personal-loan tests and verify RED**

Run: `cd cloudflare-worker && node --test --test-name-pattern="Tuấn|generic.*never match" test/ledger.test.js`

Expected: FAIL because `buildPersonalLoanLedger_` does not exist.

- [ ] **Step 3: Implement explicit party extraction and FIFO matching**

Implement anchored patterns only after confirming the row belongs to `Vay Và Trả`:

```js
const PATTERNS = {
  lend: /^cho\s+(.+?)\s+muon(?:\s+tien)?(?:\s|$)/,
  borrowerReturn: /^(.+?)\s+tra(?:\s+no|\s+tien\s+muon|\s+lai)(?:\s|$)/,
  borrow: /^(.+?)\s+cho\s+muon(?:\s+tien)?(?:\s|$)/,
  liabilityPayment: /^tra(?:\s+lai)?\s+tien\s+muon\s+(?:cho\s+)?(.+?)(?:\s+thang|\s*\(|$)/
};
```

Normalize parties consistently, but do not remove meaningful kinship words such as `cháu` or `em`. Match a repayment only to an earlier open item with the same normalized party and direction. Apply partial repayments oldest-first; put explicit repayments with no open item into `unmatched` instead of attaching them to another party.

- [ ] **Step 4: Run the personal-loan tests and verify GREEN**

Run: `cd cloudflare-worker && node --test test/ledger.test.js`

Expected: PASS; Em remains 500,000 VND outstanding and no assertion relies on account, amount, or date matching.

- [ ] **Step 5: Commit the personal-loan ledger**

```bash
git add cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "feat(finance): doi ung vay tra ro rang"
```

---

### Task 4: Track Previous-month Advances Without Auto-repayment

**Files:**
- Modify: `cloudflare-worker/src/ledger.js`
- Modify: `cloudflare-worker/test/ledger.test.js`

**Interfaces:**
- Consumes: `OpeningPlan`, `SemanticRow[]`, account/category maps, and the personal-loan result.
- Produces: `buildPreviousMonthAdvanceLedger_(input): { totalOutstanding, accounts, unmatchedSources }`.
- Each account item contains `accountId`, `accountName`, `principal`, `repaid`, `outstanding`, `rows`, and `ambiguousRows`.

- [ ] **Step 1: Write the failing cash and Banking tests**

Use the actual September cash expenses as separate rows and literal totals:

```js
test("keeps cash expenses as spending and as unpaid previous-month advances", () => {
  const result = buildPreviousMonthAdvanceLedger_(septemberLedgerInput());
  const cash = result.accounts.find((item) => item.accountName === "Tiền Mặt");
  assert.equal(cash.principal, 1356000);
  assert.equal(cash.repaid, 0);
  assert.equal(cash.outstanding, 1356000);
  assert.deepEqual(cash.rows.map((row) => row.amount), [277000, 535000, 544000]);
});

test("only the explicit Tuấn return repays the 270000 Banking advance", () => {
  const result = buildPreviousMonthAdvanceLedger_(septemberLedgerInput());
  const bank = result.accounts.find((item) => item.accountName === "Banking");
  assert.equal(bank.principal, 270000);
  assert.equal(bank.repaid, 100000);
  assert.equal(bank.outstanding, 170000);
  assert.equal(bank.rows.find((row) => row.amount === 170000).title, "Mượn tiền nạp ví grap");
});
```

Add tests proving Momo's 100,000 VND expense on 01/09 remains outstanding and that Grab/Momo income plus current balances never reduce any advance.

- [ ] **Step 2: Run the advance tests and verify RED**

Run: `cd cloudflare-worker && node --test --test-name-pattern="previous-month|270000 Banking" test/ledger.test.js`

Expected: FAIL because `buildPreviousMonthAdvanceLedger_` is missing.

- [ ] **Step 3: Implement chronological cohort accounting**

For each of the four source accounts:

1. Start `openingAvailable` from `OpeningPlan.sourceAccounts`.
2. Mark explicit Nhà Trọ reserve transfers as `rentExemptUsed` up to the remaining 2,150,000 VND reserve.
3. Keep current earned inflows, pass-through receipts, borrowed cash, and returned receivables in separate counters.
4. When an outflow is explicitly marked as using or borrowing previous-month money, add that amount to principal.
5. Otherwise add only the amount forced to come from opening money because no non-opening cohort was available at that chronological point.
6. Never reduce principal for a generic inflow. Reduce it only when the personal-loan ledger or explicit `trả lại`, `hoàn lại`, or `cấp bù` row identifies the matching source.
7. If mixed cohorts prevent identifying individual rows, retain the minimum forced amount at account level and list the candidate rows under `ambiguousRows`.

Use a stable comparator of `date`, then `createdTime`, then `id`; no same-day array-order dependence is allowed.

- [ ] **Step 4: Run the advance tests and verify GREEN**

Run: `cd cloudflare-worker && node --test test/ledger.test.js`

Expected: PASS with 1,356,000 VND outstanding for Tiền Mặt, 170,000 VND outstanding for Banking after Tuấn's explicit return, and 100,000 VND outstanding for Momo.

- [ ] **Step 5: Commit the advance ledger**

```bash
git add cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "feat(finance): theo doi tien thang truoc"
```

---

### Task 5: Record Same-account Virtual-fund Loans as Allocation Plus Debt

**Files:**
- Modify: `cloudflare-worker/src/ledger.js`
- Modify: `cloudflare-worker/src/finance.js:527-994`
- Modify: `cloudflare-worker/test/ledger.test.js`
- Modify: `cloudflare-worker/test/finance-regression.test.js:862-1080`

**Interfaces:**
- Consumes: semantic transfer rows and Notion fund-group names/aliases.
- Produces: `buildFundLoanLedger_(rows, fundGroups): { loans, allocationAdjustments, unmatched }`.
- Each loan contains `borrowerGroupId`, `borrowerGroupName`, `lender`, `principal`, `repaid`, `outstanding`, `openedBy`, and `repaymentRows`.
- `allocationAdjustments` maps borrower group ID to the same-account amount that must count as allocated exactly once.

- [ ] **Step 1: Write the failing ledger and finance-level tests**

```js
test("same-account savings loan funds rent and remains a separate 750000 debt", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({
    transferRows: [transfer(
      "borrow-750",
      "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu",
      750000,
      "fund-account",
      "fund-account",
      "essential"
    )]
  }), [fundGroup("essential", "Nhu cầu thiết yếu", "fund-account")]);

  assert.equal(result.allocationAdjustments.essential, 750000);
  assert.deepEqual(result.loans[0], {
    borrowerGroupId: "essential",
    borrowerGroupName: "Nhu cầu thiết yếu",
    lender: "quỹ tiết kiệm",
    principal: 750000,
    repaid: 0,
    outstanding: 750000,
    openedBy: "borrow-750",
    repaymentRows: []
  });
});
```

Add a second test containing unrelated Grab/Momo income and positive balances; outstanding must remain 750,000 VND. Add a third test with an explicit later `Trả lại 200.000 cho quỹ tiết kiệm` transfer; outstanding must become 550,000 VND.

In `finance-regression.test.js`, also build Nhu cầu thiết yếu with a 2,150,000
VND Nhà Trọ child, a 1,400,004 VND Banking transfer, the 750,000 VND same-
account loan, and the 2,017,000 VND Quỹ Momo expense. Assert these hand-derived
values before touching production integration:

```js
assert.equal(essential.allocated, 2150004);
assert.equal(essential.paidFromFund, 2017000);
assert.equal(essential.fundBalance, 133004);
assert.equal(essential.fundRemaining, 133004);
assert.equal(essential.fundDebt, 0);
assert.equal(essential.explicitDebts[0].outstanding, 750000);
```

- [ ] **Step 2: Run the fund-loan tests and verify RED**

Run: `cd cloudflare-worker && node --test --test-name-pattern="same-account savings loan|explicit later|750000 internal loan" test/ledger.test.js test/finance-regression.test.js`

Expected: FAIL because `buildFundLoanLedger_` is missing.

- [ ] **Step 3: Implement explicit fund-loan and repayment parsing**

Use the structured `Nhóm Quỹ` relation as the borrower group. Parse the lender only from explicit text following `mượn`, `mượn tiền của`, or `lấy từ`; stop the lender phrase at connectors such as `chuyển`, `sang`, `cho`, or `để`. Preserve the display label from the transaction instead of guessing a six-jar relation.

Recognize repayment only when the transfer text contains `trả lại`, `hoàn lại`, or `trả nợ` and names the lender. A repayment relation identifies the receiving lender fund; if the text also identifies the borrower, match that exact pair. Otherwise match only when there is exactly one earlier open loan for the explicitly named lender. Apply partial repayments FIFO. An unidentifiable repayment goes to `unmatched`.

- [ ] **Step 4: Integrate the adjustment into fund arithmetic**

At the start of `buildAccountSpendingData_`, call a new orchestrator with this exact interface:

```js
const explicitLedger = buildFinanceLedger_({
  accountRows,
  incomeRows: options.incomeRows,
  otherIncomeRows: options.otherIncomeRows,
  expenseRows,
  transferRows,
  categoryRows,
  fundGroupRows,
  options
});
```

`buildFinanceLedger_` calls the four pure builders once and returns
`{ rows, openingPlan, personalLoans, previousMonthAdvances, fundLoans,
unmatched }`. Attach `openingPlan` and `explicitLedger` to the existing result
from `buildAccountSpendingData_`.

In the transfer loop, keep normal cross-account allocation unchanged. For a same-account fund loan, do not apply the existing `+amount` then `-amount` net; instead add `allocationAdjustments[groupId]` once to that borrower group's `netAllocated`.

Replace anonymous `fundDebt = Math.max(-fundBalance, 0)` debt creation. A negative unexplained fund balance becomes a funding shortfall/unmatched warning, not a debt. Preserve existing explicit expense-note debts such as `(lấy từ quỹ tích lũy)` and merge them with `fundLoanLedger.loans` under the borrower group.

- [ ] **Step 5: Update incompatible anonymous-debt expectations**

Update the old test that expected an anonymous 554,444 VND `fundDebt`: it must now expect a funding/unmatched warning unless the fixture explicitly names a lender. Keep the existing explicit `(lấy từ quỹ tích lũy)` assertions unchanged.

- [ ] **Step 6: Run ledger and finance tests and verify GREEN**

Run: `cd cloudflare-worker && node --test test/ledger.test.js test/finance-regression.test.js`

Expected: PASS; the 616,996 VND anonymous debt can no longer be produced by the September fixture.

- [ ] **Step 7: Commit virtual-fund loan support**

```bash
git add cloudflare-worker/src/ledger.js cloudflare-worker/src/finance.js cloudflare-worker/test/ledger.test.js cloudflare-worker/test/finance-regression.test.js
git commit -m "fix(quy): tach so du khoi no noi bo"
```

---

### Task 6: Render Opening Allocation, Explicit Debt, and Reimbursement Separately

**Files:**
- Modify: `cloudflare-worker/src/finance.js:1128-1273`
- Modify: `cloudflare-worker/test/finance-regression.test.js`

**Interfaces:**
- Consumes: `data.openingPlan`, `data.explicitLedger.fundLoans`, `data.explicitLedger.personalLoans`, `data.explicitLedger.previousMonthAdvances`, and `data.explicitLedger.unmatched`.
- Produces: the existing `fundBudgetText_(data): string` Telegram report.

- [ ] **Step 1: Write the failing rendering test**

Assert the behavior, not private helper text. The report must contain these independent facts:

```js
assert.match(text, /Nhà Trọ: 2\.017\.000đ \/ 2\.150\.000đ/);
assert.match(text, /quỹ còn 133\.004đ/);
assert.match(text, /Mượn quỹ tiết kiệm: 750\.000đ/);
assert.match(text, /Đã trả: 0đ · Còn nợ: 750\.000đ/);
assert.match(text, /Tiền Mặt: cần cấp bù 1\.356\.000đ/);
assert.match(text, /Banking: cần cấp bù 170\.000đ/);
assert.match(text, /Nợ Em: 500\.000đ/);
assert.doesNotMatch(text, /616\.996đ/);
assert.doesNotMatch(text, /đã trả 109\.000đ|có nguồn để trả/);
```

Add an ambiguity test that expects date, title, and amount for one unclassified row and confirms it does not alter any debt total.

- [ ] **Step 2: Run the rendering tests and verify RED**

Run: `cd cloudflare-worker && node --test --test-name-pattern="renders explicit ledger|unclassified semantic" test/finance-regression.test.js`

Expected: FAIL because the report has only the old generic `ỨNG TRƯỚC` section.

- [ ] **Step 3: Implement four compact report sections**

Keep the existing spending/budget block, then render:

```text
📅 TIỀN DƯ THÁNG TRƯỚC
4 nguồn: 3.849.710đ · Nhà trọ: 2.150.000đ
Ba lọ 10%: 566.570đ/lọ

🤝 NỢ GHI RÕ
Nhu cầu thiết yếu mượn quỹ tiết kiệm: 750.000đ
Đã trả: 0đ · Còn nợ: 750.000đ
Nợ Em: 500.000đ

♻️ CẦN CẤP BÙ TIỀN THÁNG TRƯỚC
Tiền Mặt: 1.356.000đ
Banking: 170.000đ
Momo: 100.000đ
```

Show a section only when it has data. Keep child fund balance on the fund line. Remove anonymous account-level debt from `collectDebts_`; only explicit debt items may enter `NỢ GHI RÕ`. Label unmatched rows `⚠️ CHƯA ĐỦ DỮ KIỆN`, never as debt or repayment.

- [ ] **Step 4: Run rendering and existing bot tests**

Run: `cd cloudflare-worker && node --test test/finance-regression.test.js test/bot.test.js`

Expected: PASS; Telegram callback keyboards and non-fund reports remain unchanged.

- [ ] **Step 5: Commit report rendering**

```bash
git add cloudflare-worker/src/finance.js cloudflare-worker/test/finance-regression.test.js
git commit -m "fix(bao-cao): hien no va cap bu rieng"
```

---

### Task 7: Lock the Complete September 2026 Regression and Verify the Worker

**Files:**
- Modify: `cloudflare-worker/test/finance-regression.test.js`
- Modify: `cloudflare-worker/test/repository.test.js`
- Modify only if behavior documentation is stale: `README.md`

**Interfaces:**
- Consumes: all production interfaces from Tasks 1-6.
- Produces: one end-to-end pure-data regression reproducing the live September snapshot and a green repository-wide test run.

- [ ] **Step 1: Add the complete September fixture**

Mirror every discussed live row, with full Notion property shapes and literal dates:

- Opening accounts: Tiền Mặt 2,021,000; Banking 1,670,004; Grap Tiền Mặt 0; Momo 158,706; Quỹ Momo 706,166.
- Main income: `Grap thu nhập ròng` 286,581.
- Other income: Grab QR 208,000 to Momo; Grab cash 394,000 to Grap Tiền Mặt; `Em cho mượn tiền` 500,000 to Banking; `Cháu Tuấn trả nợ` 100,000 to Momo.
- Transfers: Momo to Quỹ Momo savings 158,706; Banking to essential 1,400,004; same-account savings-to-essential loan 750,000.
- Expenses: 01/09 Momo 100,000; 01/09 Tiền Mặt 95,000, 17,000, 25,000, and 140,000; 02/09 Tiền Mặt 35,000 and 500,000; 03/09 Banking 100,000 `Cho cháu Tuấn mượn`; 06/09 Tiền Mặt 364,000, 10,000, and 170,000; 07/09 Banking 170,000 `Mượn tiền nạp ví grap` and 500,000 `Trả tiền mượn tố tháng trước`; 07/09 Momo 108,000; 07/09 Grap Tiền Mặt 35,000, 10,000, 100,000, and 60,000; 08/09 Grap Tiền Mặt 70,000, 17,000, and 93,000; 08/09 Quỹ Momo rent 2,017,000.

Expected values must be hand-written literals; do not compute expected totals with production helpers.

- [ ] **Step 2: Run the complete fixture before any expectation updates**

Run: `cd cloudflare-worker && node --test --test-name-pattern="September 2026 explicit ledger" test/finance-regression.test.js`

Expected: PASS. If any literal fails, fix the missing production wiring rather than weakening the fixture.

- [ ] **Step 3: Assert the entire acceptance contract**

The final test must assert:

```js
assert.equal(data.openingPlan.sourceTotal, 3849710);
assert.equal(data.openingPlan.rentReserve, 2150000);
assert.deepEqual(data.openingPlan.allocations.map((item) => item.amount), [566570, 566570, 566570]);
assert.equal(essential.allocated, 2150004);
assert.equal(essential.fundRemaining, 133004);
assert.equal(savingsLoan.outstanding, 750000);
assert.equal(bankAdvance.outstanding, 170000);
assert.equal(cashAdvance.outstanding, 1356000);
assert.equal(momoAdvance.outstanding, 100000);
assert.equal(emLiability.outstanding, 500000);
assert.equal(tuanReceivable.outstanding, 0);
```

Also assert that 286,581 VND net income, 602,000 VND Grab receipts, the current balances, and the independent Tố payment do not reduce those literal outstanding values.

- [ ] **Step 4: Run syntax and the full test suite**

Run: `cd cloudflare-worker && npm run check`

Expected: exit 0 with no syntax error.

Run: `cd cloudflare-worker && npm test`

Expected: exit 0, zero failed tests, and no unhandled warnings from the new ledger.

- [ ] **Step 5: Inspect the final diff and requirement coverage**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the files named in this plan are modified or created.

Manually compare the generated September text against every acceptance bullet in the spec. Do not claim live Telegram verification because this plan does not deploy.

- [ ] **Step 6: Commit the complete regression**

```bash
git add cloudflare-worker/test/finance-regression.test.js cloudflare-worker/test/repository.test.js README.md
git commit -m "test(finance): khoa so cai thang chin"
```

If `README.md` did not require an update, omit it from `git add`.

---

## Final Verification Gate

Before reporting completion during execution:

1. Re-run `cd cloudflare-worker && npm run check`.
2. Re-run `cd cloudflare-worker && npm test`.
3. Read the complete test summary and record the exact pass/fail count.
4. Run `git diff --check` and `git status --short`.
5. Confirm no Notion write, schema change, deployment, build artifact, or unrelated source change occurred.
6. State explicitly that automated local behavior is verified but live Telegram behavior remains unverified until a later approved deployment and real button press.
