# Structured Account Debt Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile account debts from structured Notion account relations and transaction meaning, without selecting debts by equal amounts.

**Architecture:** Keep account-debt reconciliation inside `ledger.js`. Enrich each open obligation with its originating expense evidence, resolve repayment intent and structured destination before applying money, then choose a purpose-specific debt or apply a deliberately general repayment FIFO. Reuse the same result for data-quality reporting so calculation and warnings cannot disagree.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Cloudflare Workers, Notion API data already normalized by `readFinanceRows_`.

**Spec:** `docs/superpowers/specs/2026-09-21-structured-account-debt-reconciliation-design.md`

## Global Constraints

- Structured Notion fields take precedence over free text.
- Equal amount, nearby date, account balance, and row proximity never identify a debt.
- `Số Tiền` is applied only after the target debt or general account ledger is resolved.
- Repayment cannot affect a debt opened after the repayment row.
- Ordinary transfers do not repay debt without explicit repayment meaning.
- Account debt and internal `Quỹ Momo` fund debt remain separate ledgers.
- Existing uncommitted changes in `cloudflare-worker/src/finance.js` and `cloudflare-worker/src/telegram.js` must not be overwritten or included accidentally.
- No new Notion properties or external dependencies are introduced.

---

### Task 1: Open explicit account debt and resolve repayment destination

**Files:**
- Modify: `cloudflare-worker/src/ledger.js:598-665,751-818`
- Test: `cloudflare-worker/test/ledger.test.js:1254-1346`

**Interfaces:**
- Consumes: normalized finance rows from `readFinanceRows_`; `states: Map<accountId, AccountAdvanceState>`; `accountNamesById`.
- Produces: `resolveAccountRepayment_(row, states, accountNamesById) -> { kind, state?, reason? }`, where `kind` is `none`, `account`, or `conflict`.
- Preserves: `applyAdvanceRepayment_(state, amount, openedBy?) -> unappliedAmount`.

- [ ] **Step 1: Add explicit debt-opening and structured partial repayment tests**

Add tests that prove `ứng tiền (nợ)` plus the payment-account relation opens the debt even when the opening-balance tracer has no money, and that destination plus repayment meaning are required while equal amount is irrelevant:

```js
test("explicit advance note opens debt for its structured payment account", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: { rentReserve: 0, sourceAccounts: [
      { id: "cash", name: "Tiền Mặt", opening: 0 }
    ] },
    categoryNamesById: new Map([["incidental", "Phát Sinh"]]),
    rows: [
      { id: "phone", kind: "expense", title: "Thay chân sạc điện thoại", note: "ứng tiền (nợ)", normalizedText: "thay chan sac dien thoai | ung tien no", amount: 550000, accountId: "cash", categoryId: "incidental", date: "2026-09-12", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] },
    fundLoans: { loans: [] }
  });
  assert.equal(result.outstandingByRow.phone, 550000);
  assert.equal(result.accounts[0].outstanding, 550000);
});

test("structured transfer partially repays its destination account without equal amounts", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: { rentReserve: 0, sourceAccounts: [
      { id: "cash", name: "Tiền Mặt", opening: 550000 },
      { id: "grab", name: "Grap Tiền Mặt", opening: 0 }
    ] },
    accountNamesById: new Map([["cash", "Tiền Mặt"], ["grab", "Grap Tiền Mặt"]]),
    rows: [
      { id: "phone", kind: "expense", title: "Thay chân sạc điện thoại", note: "ứng tiền (nợ)", normalizedText: "thay chan sac dien thoai | ung tien no", amount: 550000, accountId: "cash", categoryId: "incidental", date: "2026-09-12", createdTime: "" },
      { id: "repay", kind: "transfer", title: "Trả lại tiền sửa điện thoại hôm trước mượn tiền mặt", normalizedText: "tra lai tien sua dien thoai hom truoc muon tien mat", amount: 200000, fromAccountId: "grab", toAccountId: "cash", date: "2026-09-19", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] },
    fundLoans: { loans: [] }
  });
  assert.equal(result.outstandingByRow.phone, 350000);
  assert.equal(result.accounts.find((row) => row.accountId === "cash").repaid, 200000);
});

test("ordinary transfer into an indebted account does not repay it", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: { rentReserve: 0, sourceAccounts: [
      { id: "cash", name: "Tiền Mặt", opening: 550000 },
      { id: "grab", name: "Grap Tiền Mặt", opening: 0 }
    ] },
    accountNamesById: new Map([["cash", "Tiền Mặt"], ["grab", "Grap Tiền Mặt"]]),
    rows: [
      { id: "phone", kind: "expense", title: "Thay chân sạc điện thoại", note: "ứng tiền (nợ)", normalizedText: "thay chan sac dien thoai | ung tien no", amount: 550000, accountId: "cash", categoryId: "incidental", date: "2026-09-12", createdTime: "" },
      { id: "move", kind: "transfer", title: "Chuyển tiền sang tiền mặt", normalizedText: "chuyen tien sang tien mat", amount: 550000, fromAccountId: "grab", toAccountId: "cash", date: "2026-09-19", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] },
    fundLoans: { loans: [] }
  });
  assert.equal(result.outstandingByRow.phone, 550000);
});
```

- [ ] **Step 2: Run the focused tests and verify the partial repayment fails**

Run:

```powershell
node --test --test-name-pattern="explicit advance note|structured transfer partially|ordinary transfer into" test/ledger.test.js
```

Expected: the explicit opening test fails because `isExplicitAccountDebt_` does not recognize `ứng tiền (nợ)`, and the partial repayment test fails because `matchingSourceStates_` currently requires an exact beneficiary or an equal outstanding amount; the ordinary-transfer test passes.

- [ ] **Step 3: Recognize explicit account debt from the expense fields**

Update `isExplicitAccountDebt_` so the structured payment relation supplies the creditor and the normalized title/note supplies debt intent:

```js
function isExplicitAccountDebt_(row, state, categoryNamesById) {
  if (normalizeSearchText_(accountName_(categoryNamesById, row.categoryId)) === "vay va tra") return false;
  const text = positiveEvidenceText_(row.normalizedText
    || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  return /\b(?:no|ung(?:\s+truoc)?\s+tien|muon\s+tien)\b/.test(text);
}
```

The account remains `row.accountId`; do not parse a replacement creditor from the amount or balance. Conflict reporting for a separately named different account is added in Task 3.

- [ ] **Step 4: Implement repayment intent and structured destination resolution**

Replace `isExplicitReimbursement_` and `matchingSourceStates_` with one resolver whose first decision is the structured destination:

```js
function hasRepaymentMeaning_(row) {
  const text = positiveEvidenceText_(row.normalizedText
    || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  return /\b(?:tra(?:\s+(?:lai|no|tien))?|hoan(?:\s+(?:lai|tien))?|cap bu|bu lai)\b/.test(text);
}

function creditorAccountsNamedIn_(text, states) {
  return [...states.values()].filter((state) => {
    const account = normalizeSearchText_(state.account.accountName)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("\\b(?:no|muon(?:\\s+tien)?|tra(?:\\s+(?:lai|no|tien))?(?:\\s+cho)?|hoan(?:\\s+(?:lai|tien))?(?:\\s+cho)?|cap bu(?:\\s+cho)?)\\s+" + account + "\\b").test(text);
  });
}

function resolveAccountRepayment_(row, states) {
  if (row.kind !== "transfer" || !hasRepaymentMeaning_(row)) {
    return { kind: "none" };
  }
  const state = states.get(row.toAccountId);
  if (!state) return { kind: "conflict", reason: "missing_destination_account" };
  const text = positiveEvidenceText_(row.normalizedText
    || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  const named = creditorAccountsNamedIn_(text, states);
  if (named.length && !named.some((entry) => entry === state)) {
    return { kind: "conflict", state, reason: "named_creditor_differs_from_destination" };
  }
  return { kind: "account", state };
}
```

In `buildPreviousMonthAdvanceLedger_`, call the resolver before processing the transfer cohorts. For `kind === "account"`, apply the amount to the destination account's open obligations without comparing principal to transfer amount. Keep the transfer's normal cohort movement unchanged.

- [ ] **Step 5: Run focused and existing chronology tests**

Run:

```powershell
node --test --test-name-pattern="explicit advance note|structured transfer partially|ordinary transfer into|does not let reimbursement before" test/ledger.test.js
```

Expected: all selected tests pass, including the rule that repayment cannot close a future debt.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "fix(finance): doi soat tra no theo tai khoan dich"
```

---

### Task 2: Match a specific expense or apply a general repayment FIFO

**Files:**
- Modify: `cloudflare-worker/src/ledger.js:598-665,751-890`
- Test: `cloudflare-worker/test/ledger.test.js:1254-1475`

**Interfaces:**
- Consumes: Task 1 `resolveAccountRepayment_`; expense `categoryId`; `categoryNamesById`.
- Produces: obligations containing `{ rowId, principal, repaid, normalizedText, categoryId, date, createdTime }` and `selectAccountRepaymentObligations_(row, state, categoryNamesById) -> { kind, obligations }`.
- `kind` is `specific`, `general`, `ambiguous`, or `not_found`.

- [ ] **Step 1: Write tests for purpose-specific selection and general FIFO**

Add these cases with two debts to the same account:

```js
test("purpose-specific repayment selects phone debt instead of an older cash debt", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: { rentReserve: 0, sourceAccounts: [
      { id: "cash", name: "Tiền Mặt", opening: 650000 },
      { id: "grab", name: "Grap Tiền Mặt", opening: 0 }
    ] },
    accountNamesById: new Map([["cash", "Tiền Mặt"], ["grab", "Grap Tiền Mặt"]]),
    categoryNamesById: new Map([["other", "Khác"], ["incidental", "Phát Sinh"]]),
    rows: [
      { id: "older", kind: "expense", title: "Mua đồ gia dụng", normalizedText: "mua do gia dung", amount: 100000, accountId: "cash", categoryId: "other", date: "2026-09-02", createdTime: "" },
      { id: "phone", kind: "expense", title: "Thay chân sạc điện thoại và mua cáp sạc", note: "ứng tiền (nợ)", normalizedText: "thay chan sac dien thoai va mua cap sac | ung tien no", amount: 550000, accountId: "cash", categoryId: "incidental", date: "2026-09-12", createdTime: "" },
      { id: "repay", kind: "transfer", title: "Trả lại tiền sửa điện thoại hôm trước mượn tiền mặt", normalizedText: "tra lai tien sua dien thoai hom truoc muon tien mat", amount: 200000, fromAccountId: "grab", toAccountId: "cash", date: "2026-09-19", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] },
    fundLoans: { loans: [] }
  });
  assert.equal(result.outstandingByRow.older, 100000);
  assert.equal(result.outstandingByRow.phone, 350000);
});

test("general account repayment applies oldest open debt first", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: { rentReserve: 0, sourceAccounts: [
      { id: "bank", name: "Banking", opening: 450000 },
      { id: "momo", name: "Momo", opening: 0 }
    ] },
    accountNamesById: new Map([["bank", "Banking"], ["momo", "Momo"]]),
    categoryNamesById: new Map([["incidental", "Phát Sinh"], ["internet", "Internet"]]),
    rows: [
      { id: "first", kind: "expense", title: "Phát sinh đầu tháng", note: "ứng tiền (nợ)", normalizedText: "phat sinh dau thang | ung tien no", amount: 350000, accountId: "bank", categoryId: "incidental", date: "2026-09-01", createdTime: "" },
      { id: "second", kind: "expense", title: "Thanh toán Internet", note: "ứng tiền (nợ)", normalizedText: "thanh toan internet | ung tien no", amount: 100000, accountId: "bank", categoryId: "internet", date: "2026-09-02", createdTime: "" },
      { id: "repay", kind: "transfer", title: "Trả nợ Banking", normalizedText: "tra no banking", amount: 400000, fromAccountId: "momo", toAccountId: "bank", date: "2026-09-03", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] },
    fundLoans: { loans: [] }
  });
  assert.equal(result.outstandingByRow.first, 0);
  assert.equal(result.outstandingByRow.second, 50000);
});

test("same-principal debts remain isolated by structured destination", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: { rentReserve: 0, sourceAccounts: [
      { id: "bank", name: "Banking", opening: 350000 },
      { id: "grab", name: "Grap Tiền Mặt", opening: 350000 },
      { id: "momo", name: "Momo", opening: 0 }
    ] },
    accountNamesById: new Map([["bank", "Banking"], ["grab", "Grap Tiền Mặt"], ["momo", "Momo"]]),
    rows: [
      { id: "bank-debt", kind: "expense", title: "Chi bằng Banking", note: "ứng tiền (nợ)", normalizedText: "chi bang banking | ung tien no", amount: 350000, accountId: "bank", date: "2026-09-01", createdTime: "" },
      { id: "grab-debt", kind: "expense", title: "Chi bằng Grap tiền mặt", note: "ứng tiền (nợ)", normalizedText: "chi bang grap tien mat | ung tien no", amount: 350000, accountId: "grab", date: "2026-09-01", createdTime: "2026-09-01T01:00:00.000Z" },
      { id: "repay-bank", kind: "transfer", title: "Trả nợ Banking", normalizedText: "tra no banking", amount: 200000, fromAccountId: "momo", toAccountId: "bank", date: "2026-09-02", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] },
    fundLoans: { loans: [] }
  });
  assert.equal(result.outstandingByRow["bank-debt"], 150000);
  assert.equal(result.outstandingByRow["grab-debt"], 350000);
});
```

Write the general test with complete row objects rather than referencing another test fixture. Also add a same-principal isolation case: Banking and Grap Tiền Mặt each owe 350,000 VND; a transfer to Banking changes only Banking.

- [ ] **Step 2: Run the new matching tests and verify failure**

Run:

```powershell
node --test --test-name-pattern="purpose-specific repayment|general account repayment|same-principal" test/ledger.test.js
```

Expected: the purpose-specific test fails because the current application is FIFO; the general and account-isolation assertions document the intended behavior.

- [ ] **Step 3: Store origin evidence on each obligation**

Change `recordAdvance_` to preserve evidence needed for matching:

```js
function recordAdvance_(state, row, amount, ambiguous = false) {
  if (amount <= 0) return;
  state.account.principal += amount;
  state.obligations.push({
    rowId: row.id,
    principal: amount,
    repaid: 0,
    normalizedText: row.normalizedText
      || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")),
    categoryId: row.categoryId || "",
    date: row.date || "",
    createdTime: row.createdTime || ""
  });
  // Preserve the existing rows / ambiguousRows behavior below.
}
```

- [ ] **Step 4: Implement deterministic specific-versus-general selection**

Add focused helpers:

```js
const REPAYMENT_NOISE_WORDS_ = new Set([
  "tra", "lai", "no", "tien", "hoan", "cap", "bu", "muon",
  "hom", "truoc", "thang", "nay", "cho", "vao", "tu", "cua"
]);

function informativeWords_(value, accountNames = []) {
  const accountWords = new Set(accountNames.flatMap((name) =>
    normalizeSearchText_(name).match(/[a-z0-9]+/g) || []));
  return (normalizeSearchText_(value).match(/[a-z0-9]+/g) || [])
    .filter((word) => !REPAYMENT_NOISE_WORDS_.has(word) && !accountWords.has(word));
}

function purposeScore_(rowText, obligationText, accountNames) {
  const rowWords = informativeWords_(rowText, accountNames);
  const debtWords = informativeWords_(obligationText, accountNames);
  let longest = 0;
  for (let left = 0; left < rowWords.length; left += 1) {
    for (let right = 0; right < debtWords.length; right += 1) {
      let length = 0;
      while (rowWords[left + length] && rowWords[left + length] === debtWords[right + length]) length += 1;
      longest = Math.max(longest, length);
    }
  }
  return longest;
}
```

`selectAccountRepaymentObligations_` must:

1. Consider only obligations with positive outstanding at that point in chronological processing.
2. Treat an exact real category name in repayment text as explicit category evidence.
3. Otherwise require a shared informative phrase of at least two words for a purpose-specific match.
4. Return one obligation when there is one best specific match.
5. Return `ambiguous` when multiple obligations tie for the best specific evidence.
6. Return all open obligations in chronological order as `general` when no purpose/category evidence remains after repayment and account wording is removed.
7. Return `not_found` when purpose words exist but match no obligation.

Pass every real account name from `states` into `purposeScore_` so a general
title such as `Trả nợ Banking` has no leftover purpose token.

Call `applyAdvanceRepayment_` with `openedBy` for a specific match. For a general repayment, call it without `openedBy` so the existing chronological order performs FIFO and can span multiple debts.

- [ ] **Step 5: Run all previous-month advance tests**

Run:

```powershell
node --test --test-name-pattern="repayment|reimbursement|previous-month|purpose-specific|general account|same-principal" test/ledger.test.js
```

Expected: all selected tests pass; no test relies on equal amounts to select a row.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "fix(finance): ghep tra no voi khoan ung goc"
```

---

### Task 3: Unify debt calculation and data-quality decisions

**Files:**
- Modify: `cloudflare-worker/src/ledger.js:220-236,684-750,751-890`
- Test: `cloudflare-worker/test/ledger.test.js:330-470,1254-1475`

**Interfaces:**
- Consumes: Task 1 `resolveAccountRepayment_`; Task 2 `selectAccountRepaymentObligations_`.
- Produces: `buildPreviousMonthAdvanceLedger_({ ..., onIssue })`; one issue at most per repayment row from the shared resolution result.
- Produces: `validateExplicitConflicts_(...) -> Set<rowId>` and `accountDebtConflictRowIds` input for the advance ledger.
- Preserves: fund-loan and personal-loan rows are excluded before account-debt reconciliation.

- [ ] **Step 1: Add failing conflict, ambiguity, and missing-history tests**

Add tests through `buildFinanceLedger_` so they validate user-visible data issues:

```js
test("repayment creditor conflicting with destination changes no debt", () => {
  const ledger = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 350000), account("grab", "Grap Tiền Mặt", 0, 0)],
    categoryRows: [{ id: "incidental", properties: { "Loại Chi Phí": { title: [{ plain_text: "Phát Sinh" }] } } }],
    expenseRows: [expense("debt", "Sửa xe", "incidental", "bank", 350000, "2026-09-01", "ứng tiền (nợ)")],
    transferRows: [transfer("wrong", "Trả nợ Banking", "grab", "grab", 200000, "2026-09-02", "")],
    options: { sourceAccountNames: ["Banking", "Grap Tiền Mặt"], rentReserveAmount: 0 }
  });
  assert.equal(ledger.previousMonthAdvances.outstandingByRow.debt, 350000);
  assert.deepEqual(ledger.dataIssues.map(({ rowId, type }) => ({ rowId, type })), [
    { rowId: "wrong", type: "conflicting_data" }
  ]);
});

test("expense debt account text conflicting with payment relation changes no ledger", () => {
  const ledger = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 350000, 0), account("cash", "Tiền Mặt", 350000, 0)],
    categoryRows: [{ id: "incidental", properties: { "Loại Chi Phí": { title: [{ plain_text: "Phát Sinh" }] } } }],
    expenseRows: [expense("conflict-debt", "Sửa xe", "incidental", "cash", 350000, "2026-09-01", "ứng tiền, nợ Banking")],
    options: { sourceAccountNames: ["Banking", "Tiền Mặt"], rentReserveAmount: 0 }
  });
  assert.deepEqual(ledger.dataIssues.map(({ rowId, type }) => ({ rowId, type })), [
    { rowId: "conflict-debt", type: "conflicting_data" }
  ]);
  assert.equal(ledger.previousMonthAdvances.outstandingByRow["conflict-debt"] || 0, 0);
});
```

Add the ambiguity and missing-history fixtures explicitly:

```js
test("purpose-specific text matching two debts changes neither debt", () => {
  const ledger = buildFinanceLedger_({
    accountRows: [account("cash", "Tiền Mặt", 200000, 0), account("grab", "Grap Tiền Mặt", 0, 0)],
    categoryRows: [{ id: "incidental", properties: { "Loại Chi Phí": { title: [{ plain_text: "Phát Sinh" }] } } }],
    expenseRows: [
      expense("phone-a", "Sửa điện thoại A", "incidental", "cash", 100000, "2026-09-01", "ứng tiền (nợ)"),
      expense("phone-b", "Sửa điện thoại B", "incidental", "cash", 100000, "2026-09-02", "ứng tiền (nợ)")
    ],
    transferRows: [transfer("ambiguous", "Trả tiền sửa điện thoại", "grab", "cash", 100000, "2026-09-03", "")],
    options: { sourceAccountNames: ["Tiền Mặt", "Grap Tiền Mặt"], rentReserveAmount: 0 }
  });
  assert.equal(ledger.previousMonthAdvances.outstandingByRow["phone-a"], 100000);
  assert.equal(ledger.previousMonthAdvances.outstandingByRow["phone-b"], 100000);
  assert.deepEqual(ledger.dataIssues.map(({ rowId, type, details }) => ({ rowId, type, details })), [{
    rowId: "ambiguous", type: "missing_required_data", details: ["Khoản nợ gốc liên quan"]
  }]);
});

test("repayment with no earlier account debt reports missing history", () => {
  const ledger = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [transfer("orphan", "Trả nợ Banking", "momo", "bank", 100000, "2026-09-03", "")],
    options: { sourceAccountNames: ["Banking", "Momo"], rentReserveAmount: 0 }
  });
  assert.deepEqual(ledger.dataIssues.map(({ rowId, type }) => ({ rowId, type })), [
    { rowId: "orphan", type: "history_not_found" }
  ]);
});
```

Add the missing-destination case with the relation removed from a real transfer page:

```js
test("repayment missing destination produces only the common missing-field issue", () => {
  const repayment = transfer("missing-destination", "Trả nợ Banking", "momo", "bank", 100000, "2026-09-03", "");
  repayment.properties["Đến Tài Khoản"] = { relation: [] };
  const ledger = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 100000, 0), account("momo", "Momo", 0, 0)],
    categoryRows: [{ id: "incidental", properties: { "Loại Chi Phí": { title: [{ plain_text: "Phát Sinh" }] } } }],
    expenseRows: [expense("debt", "Sửa xe", "incidental", "bank", 100000, "2026-09-01", "ứng tiền (nợ)")],
    transferRows: [repayment],
    options: { sourceAccountNames: ["Banking", "Momo"], rentReserveAmount: 0 }
  });
  assert.deepEqual(ledger.dataIssues.map(({ rowId, type, details }) => ({ rowId, type, details })), [{
    rowId: "missing-destination", type: "missing_required_data", details: ["Đến Tài Khoản"]
  }]);
  assert.equal(ledger.previousMonthAdvances.outstandingByRow.debt, 100000);
});
```

- [ ] **Step 2: Run the data-quality tests and verify failures**

Run:

```powershell
node --test --test-name-pattern="repayment creditor conflicting|purpose-specific text matching|repayment to an account with no earlier" test/ledger.test.js
```

Expected: failures show that `validateReimbursements_` and the advance ledger currently make independent decisions, fail to emit the required issue, or still record an explicitly conflicting debt.

- [ ] **Step 3: Make the advance ledger the single account-repayment authority**

Extend the public builder signature:

```js
export function buildPreviousMonthAdvanceLedger_({
  openingPlan = {}, rows = [], accountNamesById = {}, categoryNamesById = {},
  otherIncomeCategoryNamesById = {}, passThroughKeywords = [],
  passThroughCategories = [], personalLoans = {}, fundLoans = {},
  onIssue = () => {}
} = {}) { /* existing body */ }
```

Pass the existing `onIssue` callback from `buildFinanceLedger_`. Before applying a repayment:

- `conflict` → `onIssue(row, "conflicting_data", [named value and structured destination])`.
- `ambiguous` → `onIssue(row, "missing_required_data", ["Khoản nợ gốc liên quan"])`.
- `not_found` → `onIssue(row, "history_not_found", ["Không tìm thấy bản ghi gốc liên quan"])`.
- Apply no money for all three outcomes.

Remove account repayment handling from `validateReimbursements_`; retain only validation not already owned by the personal-loan, fund-loan, or account-advance ledgers. This prevents duplicate warnings and calculation/report disagreements.

Extend `validateExplicitConflicts_` to create and return an
`accountDebtConflictRowIds` set. Add only an expense row to this set when
`nợ <account>`, `mượn tiền
<account>`, or `ứng tiền từ <account>` names an account different from
`Phương Thức Thanh Toán`, and emit `conflicting_data`.

Pass that set as `accountDebtConflictRowIds` to
`buildPreviousMonthAdvanceLedger_`. For a conflicting expense, still consume
its account cohorts in chronological tracing, but skip `recordAdvance_` so the
bot does not choose either contradictory creditor. Preserve its
`expenseSources` calculation for spending attribution.

- [ ] **Step 4: Run ledger tests and confirm exactly one issue per row**

Run:

```powershell
node --test test/ledger.test.js
```

Expected: every ledger test passes, and new assertions see exactly one issue for each invalid repayment row.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- cloudflare-worker/src/ledger.js cloudflare-worker/test/ledger.test.js
git commit -m "fix(finance): thong nhat canh bao doi soat no"
```

---

### Task 4: Lock the September report regression and remove the amount-based patch

**Files:**
- Modify: `cloudflare-worker/test/finance-regression.test.js:2442-2495`
- Modify: `README.md:117-129`
- Verify only: `cloudflare-worker/src/finance.js`

**Interfaces:**
- Consumes: `previousMonthAdvances.outstandingByRow` produced by Tasks 1-3.
- Produces: report regression proving the repaid `Phát Sinh` debt disappears while unrelated child debts remain.
- Does not change: fund budget aggregation or internal fund-loan rendering.

- [ ] **Step 1: Replace the existing equal-amount regression with the real structured scenario**

Change the test introduced for the 550,000 VND incident so it includes:

- An older unrelated Tiền Mặt debt with a different amount.
- The exact 12/09 phone expense fields and note.
- The exact 19/09 Grap Tiền Mặt → Tiền Mặt repayment fields and title.
- A repayment amount of 200,000 VND in one assertion, proving partial repayment selects the phone debt.
- A second build with the remaining 350,000 VND repayment, proving the `Phát Sinh` debt disappears.
- An unrelated debt on another child label that remains visible.

The final report assertions must include:

```js
assert.doesNotMatch(report, /Phát Sinh:[^\n]*còn nợ Tiền Mặt/);
assert.match(report, /Khác:[^\n]*còn nợ Tiền Mặt 100\.000đ/);
assert.doesNotMatch(report, /Tiền Mặt: cần cấp bù 550\.000đ/);
```

Delete the assertion or fixture behavior that requires exactly one obligation whose outstanding amount equals the repayment amount.

- [ ] **Step 2: Run the focused finance regression**

Run:

```powershell
node --test --test-name-pattern="structured account debt|Phát Sinh debt|phone" test/finance-regression.test.js
```

Expected: PASS using ledger output only; no new special case is added to `finance.js`.

- [ ] **Step 3: Update the README account-debt rule**

Document these exact points near the existing `quỹ còn` and debt explanation:

```markdown
### Hoàn nợ tài khoản

Khoản chi ghi `ứng/nợ` lấy `Phương Thức Thanh Toán` làm tài khoản đã ứng và
`Loại Chi Phí` làm nhãn chịu nợ. Giao dịch trả lấy `Đến Tài Khoản` làm bên
được hoàn; tiêu đề/ghi chú xác nhận ý nghĩa trả nợ và khoản chi liên quan.
`Số Tiền` chỉ là số được trừ sau khi đối chiếu, không dùng để chọn khoản nợ.
Chuyển tiền thông thường hoặc số dư tăng không tự xóa nợ.
```

- [ ] **Step 4: Run the complete local verification suite**

Run:

```powershell
npm test
```

Expected: all tests pass with zero failures. Record the exact total in the completion report rather than assuming it remains 255.

- [ ] **Step 5: Inspect the scoped diff**

Run:

```powershell
git diff --check
git diff --stat
git status --short
```

Expected: only `ledger.js`, the two test files, and `README.md` belong to this implementation. Preserve and exclude pre-existing unrelated working-tree changes.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- cloudflare-worker/test/finance-regression.test.js README.md
git commit -m "test(finance): khoa doi soat no tai khoan"
```

---

### Task 5: Review, publish, and verify the live Worker

**Files:**
- Verify: commits and staged diff from Tasks 1-4
- Verify: `.github/workflows/ci.yml`
- Verify: `cloudflare-worker/wrangler.jsonc`

**Interfaces:**
- Consumes: all implementation commits and a green local test suite.
- Produces: reviewed `main`, green GitHub CI, a 100% Cloudflare deployment, and a live Notion-backed report check.

- [ ] **Step 1: Run the verification-before-completion checklist**

Invoke `superpowers:verification-before-completion`, then rerun:

```powershell
npm test
git diff --check HEAD~4..HEAD
git status -sb
```

Expected: tests pass; committed implementation has no whitespace errors; unrelated pre-existing working-tree changes remain uncommitted.

- [ ] **Step 2: Run an independent code review**

Invoke `superpowers:requesting-code-review`. The reviewer must check:

- No amount-equality matching remains in account repayment selection.
- Structured destination is authoritative.
- Purpose-specific and general FIFO paths cannot both apply one transfer.
- Invalid repayment rows leave all debts unchanged.
- Personal and internal fund loans remain unaffected.

Resolve every correctness finding and rerun the full suite before continuing.

- [ ] **Step 3: Push `main` and verify GitHub CI**

```powershell
git push origin main
gh run list --limit 5
```

Expected: the CI run for the pushed head SHA completes with `success`.

- [ ] **Step 4: Verify Cloudflare deployment**

```powershell
npx wrangler deployments list
```

Expected: the newest deployment is created after the pushed commit and shows one Worker version receiving `100%` traffic.

- [ ] **Step 5: Verify the live Notion-backed report**

Read the live Notion expense and transfer rows, then request a fresh Telegram fund report. Confirm:

- `Phát Sinh` no longer shows `còn nợ Tiền Mặt 550.000đ`.
- No unrelated debt disappears.
- The report does not add a fabricated transaction or data-quality warning.
- The Nhà Trọ debt to `Quỹ Tiết kiệm dài hạn` remains on Nhà Trọ until an actual internal-fund repayment record exists.

- [ ] **Step 6: Report completion evidence**

Provide the commit SHA, exact local test count, GitHub Actions URL, Cloudflare deployment version, and observed live report result. If live Telegram verification cannot be triggered, state that boundary explicitly instead of claiming the bot output was verified.
