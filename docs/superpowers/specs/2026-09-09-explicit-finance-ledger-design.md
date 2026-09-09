# Explicit Finance Ledger Design

## Goal

Make the fund report explain money from the actual Notion records instead of
inferring repayment from balances, equal amounts, dates, or payment accounts.
The report must read the title, note, type, amount, date, account relations, and
fund relation of every income, other-income, expense, and transfer row.

This design covers all accounting corrections agreed in the September 2026
conversation, not only the incorrect 616,996 VND fund debt.

## Non-goals

- Do not write to Notion or change its schema.
- Do not move money or create repayment transactions automatically.
- Do not infer that one transaction funded another merely because their dates,
  amounts, or accounts match.
- Do not treat account balance or available income as proof of repayment.

## Source Data and Precedence

For every row, build a normalized semantic text from all user-authored text
fields plus the structured properties relevant to that database:

- Main income: `Tên Khoản Thu`, `Ghi Chú`, category, account, amount, date.
- Other income: `Tên Khoản Thu`, `Ghi Chú`, category, account, amount, date.
- Expense: `Nội Dung Khoản Chi`, `Ghi Chú`, category, account, amount, date.
- Transfer: `Ghi Chú` (the title property), any separate note property if one
  exists, transfer type, source account, destination account, fund group,
  amount, and date.

Interpretation precedence is:

1. Explicit structured relations and types.
2. Explicit wording in the title and note, matched against real account, fund,
   category, and alias names from Notion.
3. If the row remains ambiguous, report it as unmatched. Never guess from
   amount, date, balance, or account proximity.

Text matching is deterministic. It recognizes explicit phrases such as
`mượn từ`, `lấy từ`, `trả lại`, `hoàn lại`, `cấp bù`, `cho X mượn`, and `X trả`,
including normalized Vietnamese accents and configured aliases. A phrase that
does not identify both the transaction meaning and its party is not a
repayment.

## Monthly Opening Allocation

The previous-month pool is calculated once from `Số Dư Ban Đầu` of exactly four
accounts:

- Tiền Mặt
- Banking
- Grap Tiền Mặt
- Momo

`Quỹ Momo` is excluded because it contains existing virtual sub-funds.

At the beginning of the month:

1. Reserve 2,150,000 VND for Nhà Trọ. This is the one permitted use of
   previous-month money that does not require reimbursement.
2. Split the remainder equally among Tiết kiệm dài hạn, Đầu tư tài chính, and
   Hưởng thụ. These are the three equal 10% jars.
3. Nhu cầu thiết yếu and Giáo dục phát triển continue to use their fixed child
   budgets; they are not recalculated from a percentage.

This allocation is a fixed monthly baseline. Current balances, including the
665,000 VND remaining in Tiền Mặt, never trigger another split.

## Previous-month Advances

An expense is still an expense in its category. Separately, if its payment
source is previous-month money, it creates a reimbursement obligation for the
same amount.

Source tracing processes transactions by transaction date and uses Notion
`created_time` only to order rows that have the same transaction date. Current-
month earned money, pass-through receipts, borrowed money, and previous-month
money remain separate cohorts even when they share one physical account.

The model reports a specific expense as using previous-month money only when
that fact is explicit in its text or forced by the account ledger (for example,
Tiền Mặt has no current-month inflow before the expense). When mixed cohorts
make the source unknowable, it reports only the minimum account-level amount
that must have come from previous-month money and marks the individual rows as
source-ambiguous. It never claims that one named inflow funded one named
expense. Explicit wording in a row overrides this fallback.

A repayment only closes an obligation when a Notion row explicitly says it is
a repayment or reimbursement and identifies the party or source being repaid.

The 2,150,000 VND Nhà Trọ reserve is exempt. Any amount borrowed from another
fund to complete that reserve is still a separate debt to the lending fund.

## Internal Quỹ Momo Loans

Quỹ Momo is one physical account that contains several virtual funds. A
same-account transfer can therefore be a real transfer between two virtual
funds and must not net to zero at the fund-ledger level.

For an explicit transfer such as:

`Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu`

the model records two independent effects:

1. Nhu cầu thiết yếu/Nhà Trọ receives an allocation of 750,000 VND.
2. Nhu cầu thiết yếu/Nhà Trọ owes Tiết kiệm dài hạn 750,000 VND.

Fund balance and debt principal are independent:

- Allocation: 1,400,004 + 750,000 = 2,150,004 VND.
- Nhà Trọ expense: 2,017,000 VND.
- Nhà Trọ fund balance: 133,004 VND.
- Debt to Tiết kiệm dài hạn: 750,000 VND.

The 133,004 VND balance never reduces the 750,000 VND debt. Only an explicit
repayment transfer can reduce the debt. Repayments are applied to matching open
principal in chronological order and cannot reduce it below zero.

## Personal Loans and Repayments

Personal loans are a ledger separate from income, expenses, fund balances, and
previous-month reimbursements.

- `Cho cháu Tuấn mượn 100.000` from Banking opens a receivable from Tuấn.
- `Cháu Tuấn trả nợ 100.000` into Momo closes that receivable even though the
  destination account differs, because the transaction explicitly identifies
  Tuấn and the repayment.
- `Em cho mượn tiền 500.000` opens a 500,000 VND liability to Em.
- A separate 500,000 VND payment to Tố changes only the Tố ledger. The model
  must not claim that Em's money funded the payment to Tố.

Income or cash appearing in Momo, Banking, or Grap Tiền Mặt never closes a loan
without an explicit repayment record.

## Reporting

The fund report separates four concepts:

1. Spending versus budget.
2. Money currently remaining in each virtual fund.
3. Explicit debts and repayments.
4. Previous-month advances that still require reimbursement.

For the current Nhà Trọ example, the report must communicate:

```text
Nhà Trọ: 2.017.000đ / 2.150.000đ
Quỹ còn: 133.004đ
Mượn Tiết kiệm dài hạn: 750.000đ
Đã trả: 0đ · Còn nợ: 750.000đ
```

It must not print `Nhu cầu thiết yếu → Quỹ Momo: 616.996đ`.

An unmatched semantic row produces a compact warning containing its date,
title, and amount so the user can clarify the Notion text. It does not silently
change balances or debts.

## September 2026 Acceptance Fixture

Regression tests will reproduce the live records discussed with the user and
prove all of the following:

- Opening free-source total is 3,849,710 VND; Quỹ Momo is excluded.
- The 2,150,000 VND rent reserve is taken once.
- The 1,699,710 VND remainder is allocated once as 566,570 VND to each of the
  three 10% jars; the ending 665,000 VND cash is not split again.
- Nhà Trọ has 133,004 VND remaining after its explicit 750,000 VND internal
  loan allocation and 2,017,000 VND expense.
- The debt to Tiết kiệm dài hạn remains exactly 750,000 VND because no explicit
  repayment transfer exists.
- Of the 270,000 VND advanced from Banking, the explicit 100,000 VND Tuấn
  repayment is recognized across accounts; the 170,000 VND Grab-wallet advance
  remains unpaid because no repayment record exists.
- The 1,356,000 VND of current-month expenses paid from opening Tiền Mặt is
  reported both as spending and as requiring reimbursement.
- The 100,000 VND current-month expense paid from opening Momo is likewise
  tracked until an explicit reimbursement exists.
- The 500,000 VND borrowed from Em remains an independent liability. No causal
  link to the separate Tố transaction is invented.
- Grab income, Grab cash receipts, Momo receipts, and current account balances
  do not automatically repay any obligation.

## Implementation Scope

The implementation will remain inside the existing Cloudflare Worker flow:

- Extend `cloudflare-worker/src/finance.js` with semantic row extraction and
  explicit ledgers.
- Pass existing account opening balances and all already-fetched transaction
  rows through the fund model; no new Notion database is required.
- Extend `cloudflare-worker/test/finance-regression.test.js` with focused unit
  tests and the complete September fixture.
- Update report rendering only where needed to display the separated ledgers.

No deployment, Notion mutation, or schema change is part of this change.
