# Notion Transaction Data-Quality Filter Design

## Goal

Make `CHƯA ĐỦ DỮ KIỆN` a data-quality report built only from real Notion
records. The bot must validate every current-month income, other-income,
expense, and account-transfer row, while using older rows only when a
current-month transaction explicitly depends on history.

The section must never contain a synthetic transaction or an amount inferred
from balances, allocation gaps, source shortfalls, dates, or similar amounts.

## Scope

This design changes the Cloudflare Worker fund report and its semantic ledger.
It does not change the Notion schema, write to Notion, move money, create a
repayment, or use an AI model to guess transaction meaning.

The existing budget, fund-allocation, debt, and previous-month reimbursement
calculations remain separate from data-quality validation. They may calculate
totals from real rows, but their calculated differences cannot become
data-quality issues.

## Source Records

The validator reads all current-month rows from:

- Main income.
- Other income.
- Expenses.
- Account transfers.

For every row it preserves the Notion page ID, database kind, original title or
content, note, date, original amount, category relation, account relations,
fund-group relation, and transfer type. A user-facing issue always points to
one current-month Notion page and always displays that page's original amount.

Older rows can be queried to resolve an explicit historical reference. They
cannot appear as issues in the current-month report.

## User-Facing Issue Types

Only these three issue types can appear under `CHƯA ĐỦ DỮ KIỆN`.

### 1. Missing required data

A current-month row is incomplete when a property required for its database
kind is absent.

Properties required for every row:

- Display title or content.
- Transaction date.
- Numeric amount. Zero is a real value when explicitly stored; the validator
  tests presence and numeric validity rather than inventing a minimum amount.

Additional properties by database kind:

- Expense: `Loại Chi Phí` and `Phương Thức Thanh Toán`.
- Main income and other income: `Loại Khoản Thu` and
  `Phương Thức Thanh Toán`, except the main-income Grab App target identified
  by its `Loại Khoản Thu` relation does not require a payment account.
- Account transfer: `Loại Chuyển Đổi`, `Từ Tài Khoản`, and `Đến Tài Khoản`.
- A same-account Quỹ Momo movement between virtual funds: the structured
  `Nhóm Quỹ` relation and explicit text identifying the other virtual fund.

`Thu Nhập Ròng Grab (App)` is a target, not an account receipt. It still
requires its title, date, amount, and `Loại Khoản Thu` relation, but not
`Loại Chi Phí` or `Phương Thức Thanh Toán`.

One row with several missing properties produces one issue listing every
missing property. The existing inline `thiếu loại chi` warning is replaced by
this single common issue so the report does not duplicate the same problem.

### 2. Related history not found

This issue applies when a current-month row explicitly refers to an earlier
transaction, including:

- Paying or receiving repayment of a personal loan.
- Reimbursing money advanced from an account or from previous-month money.
- Repaying an internal fund loan.
- Refunding, reversing, or adjusting an earlier transaction.

The bot identifies the relation from the structured transaction kind plus the
explicit person, fund, source, or other party written in the title or note. It
then queries all relevant records dated before the current row, follows Notion
pagination, and searches backward without a one-month limit.

Matching uses the explicit transaction meaning and named party or fund.
Balances, equal amounts, nearby dates, and the mere presence of money in an
account are never proof that two rows belong together.

If the matching principal is not yet fully explained, the bot continues
searching older records. It never labels the situation `trả vượt khoản gốc`.
Only after the relevant history has been exhausted can the current row receive
`Không tìm thấy bản ghi gốc liên quan`.

Example: `Trả nợ Tố mượn tháng trước` searches earlier Tố loan records, finds
the 1,000,000 VND opening on 14 August, and applies the two explicit September
repayments of 500,000 VND. The result is zero outstanding and no data-quality
issue.

### 3. Conflicting Notion data

A current-month row has conflicting data only when two real, explicit pieces
of Notion data disagree. Examples include:

- The note explicitly names Banking while the account relation selects Momo.
- The note explicitly names one fund while `Nhóm Quỹ` selects another fund.
- The selected transfer type contradicts the explicit source/destination
  direction.
- A same-account transfer claims to move between virtual funds but its named
  funds and structured fund relation cannot describe one consistent movement.

The bot resolves text only against real account, category, and fund names or
aliases loaded from Notion. A vague note does not override a valid structured
relation. The issue states the two conflicting values; the bot does not choose
one silently.

## Internal Conditions That Are Not Data Issues

The following conditions never enter `CHƯA ĐỦ DỮ KIỆN`:

- A calculated funding shortfall or source-account shortfall.
- A balance, allocation, or reimbursement difference calculated by the bot.
- A generated amount that does not exist on a Notion page.
- `Trả vượt khoản gốc`.
- A parser implementation that does not recognize an otherwise complete row.
- The current balance or presence of income in an account.
- An incomplete older row that is not part of the month being reported.

Parser failures are internal bot defects. They can be logged with the Notion
page ID and a bounded reason code, but cannot be presented as if the user
failed to provide data. Calculated shortfalls can remain in their legitimate
aggregate calculations, but cannot create semantic rows or warnings.

## Validation and Ledger Separation

The implementation separates two outputs:

1. The finance ledger calculates budgets, allocations, explicit debts, and
   reimbursements from real records.
2. The data-quality validator produces `dataIssues` only from current-month
   Notion rows and the three approved rules above.

Legacy `unmatched` collections can no longer feed the user-facing section
directly. Each legacy producer must either:

- Convert a real current-month row into one of the three approved issue types.
- Remain an internal reconciliation detail.
- Be removed when it represents a computed difference rather than a row.

This boundary prevents a calculation failure from being rendered as a fake
transaction.

## Report Format

Hide the section when there are no issues. Otherwise render one compact bullet
per current-month row:

```text
⚠️ CHƯA ĐỦ DỮ KIỆN
• 09/09 — Ăn tối — 35.000đ · thiếu Loại Chi Phí
• 12/09 — Hoàn lại Banking — 100.000đ · không tìm thấy bản ghi gốc liên quan
• 15/09 — Chuyển quỹ — 500.000đ · ghi chú: Banking; tài khoản: Momo
```

The date, title, and amount come directly from that row. Multiple reasons for
one row are combined into its single bullet. Issues are ordered by transaction
date, then Notion creation time, then page ID.

## Repository Query Rules

- Current-month queries load all four transaction databases for validation and
  reporting.
- Historical queries run only for transaction families that have an explicit
  current-month historical dependency.
- Historical queries have no one-month cutoff and must follow pagination.
- Historical rows affect reconciliation only; they are excluded from
  current-month spending and from current-month data-quality output.
- Cache keys remain month-specific. A forced refresh bypasses the report cache
  and re-reads Notion.

## Tests and Acceptance Criteria

Automated tests must prove:

- Each missing required property creates exactly one current-row issue with
  the correct property name.
- `Thu Nhập Ròng Grab (App)` never requires `Loại Chi Phí`.
- Income, other-income, expense, and transfer rows are all validated.
- A same-account Quỹ Momo transfer validates both physical-account fields and
  its virtual-fund evidence.
- Previous-month incomplete rows do not appear in the current report.
- An explicit current repayment searches beyond one month when necessary.
- The August Tố opening and two September repayments reconcile to zero.
- Explicit account/fund conflicts produce one conflict issue.
- Vague text does not override a valid structured relation.
- Calculated funding/source shortfalls never enter `dataIssues`.
- No generated amount is rendered as a Notion transaction.
- The renderer uses the original Notion date, title, and amount.
- Existing fund, budget, loan, reimbursement, cashflow, Telegram, cache, and
  Worker tests continue to pass.

After deployment, live verification is read-only:

1. Refresh the fund report so the Worker queries current Notion data.
2. Confirm the report contains only real current-month records.
3. Confirm the nonexistent `Ăn tối 26.000đ` does not appear.
4. Confirm the Tố repayments are reconciled against the August opening.
5. Do not create, edit, or delete Notion records during verification.

## Explicit Non-Goals

- No automatic correction of Notion records.
- No automatic creation of missing transactions.
- No inference that available money equals repayment.
- No schema changes or new mandatory Notion properties.
- No AI-generated accounting decisions.
- No unrelated report redesign.
