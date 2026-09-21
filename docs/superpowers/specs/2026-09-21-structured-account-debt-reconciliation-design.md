# Structured Account Debt Reconciliation Design

**Date:** 2026-09-21

## Goal

Reconcile debts to physical accounts from the structured Notion transaction
fields already maintained by the user. Text explains transaction intent and
the related expense; equal amounts must never be the reason two records are
linked.

This design applies to account debts such as `Tiền Mặt`, `Banking`, and
`Grap Tiền Mặt`. Loans between virtual funds inside `Quỹ Momo` remain a
separate ledger because their physical source and destination account can be
the same.

## Source Records

### Opening an account debt

An expense opens an account debt when all of the following are true:

- It has a valid `Phương Thức Thanh Toán` relation.
- Its title or `Ghi Chú` explicitly says that the money was advanced or is
  owed, including natural forms such as `ứng tiền`, `nợ`, `mượn`, or an
  equivalent normalized Vietnamese phrase.
- It has a positive `Số Tiền`, a valid date, and a `Loại Chi Phí` relation.

The debt stores:

- The original expense row ID.
- The creditor account from `Phương Thức Thanh Toán`.
- The child budget label from `Loại Chi Phí`.
- The normalized title and note as matching evidence.
- Principal, repaid amount, outstanding amount, date, and creation time.

The debt is displayed on its child budget label. For example, an expense with
`Loại Chi Phí = Phát Sinh`, `Phương Thức Thanh Toán = Tiền Mặt`, and
`Ghi Chú = ứng tiền (nợ)` creates a debt to `Tiền Mặt` on `Phát Sinh`.

Existing source tracing for previous-month money continues to create account
debts even without an explicit debt note when the ledger proves that an
expense consumed previous-month money. It produces the same debt structure.

## Recognizing a Repayment

An account-transfer row is a repayment candidate when:

- `Loại Chuyển Đổi` identifies an account transfer.
- `Từ Tài Khoản`, `Đến Tài Khoản`, amount, and date are present.
- Its title or note explicitly communicates returning, repaying, reimbursing,
  or replacing previously advanced money. Recognition is semantic and is not
  limited to the exact phrases `trả lại`, `hoàn lại`, or `cấp bù`.

The structured `Đến Tài Khoản` is the creditor being repaid. The transfer is
eligible only for open debts whose creditor account equals that destination.
`Từ Tài Khoản` records where the repayment came from; merely having money in
an account is never proof of repayment.

The `Số Tiền` of the transfer is the amount to apply after a debt has been
identified. It is not an identity key and does not need to equal the original
principal.

## Matching Priority

Repayment candidates are matched only against earlier open debts for the
structured destination account.

1. Use explicit text referring to the original expense purpose, title, note,
   or real child label to select the related open debt.
2. When one related debt is identified, apply the repayment to that debt.
3. When the text deliberately refers to the account debt generally rather
   than one expense, apply it chronologically to open debts of that account,
   oldest first.
4. When the text appears to identify a particular expense but matches none or
   more than one, keep every debt unchanged and report the row as not
   reconciled.

Equal amount, nearby date, current balance, and transaction proximity are not
matching evidence. They may be shown diagnostically but cannot select a debt.

## Applying Repayments

A repayment reduces outstanding principal but never changes the original
expense, its spending category, or its budget total.

- Partial repayment is allowed.
- A general repayment may close one debt and continue into the next debt for
  the same creditor account in chronological order.
- A repayment cannot reduce total account debt below zero.
- Any unapplied remainder is reported as not reconciled; it is not converted
  into income or another debt.
- A fully repaid child debt disappears from the `còn nợ` text.

Example:

- `Phát Sinh` owes Banking 350,000 VND.
- `Internet` owes Banking 100,000 VND.
- A general 400,000 VND Banking repayment closes the 350,000 VND debt and
  reduces the Internet debt to 50,000 VND.
- A Grap Tiền Mặt debt with the same amount is unaffected because its creditor
  account is different.

## Conflicts and Missing Data

The bot does not silently resolve contradictory evidence.

- Repayment text names Banking but `Đến Tài Khoản` is Grap Tiền Mặt: report
  conflicting data and apply nothing.
- Repayment text describes one specific expense but two open debts match it:
  report that the related original record is ambiguous and apply nothing.
- A row says it is a repayment but has no destination account: report the
  missing structured field.
- An ordinary transfer into an account with no repayment meaning remains an
  ordinary transfer and does not reduce debt.
- A repayment names an account with no earlier open debt: report that no
  related original record was found.

Warnings use only real Notion records and their fields. The bot does not
invent transactions or infer repayment from account balances.

## Virtual Fund Loans

Internal fund debt remains separate from physical account debt. When both
`Từ Tài Khoản` and `Đến Tài Khoản` are `Quỹ Momo`, those fields cannot identify
which virtual fund lent the money. The existing `Nhóm Quỹ` relation plus the
explicitly named other fund are therefore still required to open or repay an
internal fund loan.

For example, repaying `Tiết kiệm dài hạn` from the `Nhà Trọ` allocation must
identify the participating virtual funds. The physical `Quỹ Momo → Quỹ Momo`
movement alone is insufficient.

## September Acceptance Case

Expense on 12/09/2026:

- Title: `Thay chân sạc điện thoại và mua cáp sạc`
- `Phương Thức Thanh Toán`: `Tiền Mặt`
- `Loại Chi Phí`: `Phát Sinh`
- `Ghi Chú`: `ứng tiền (nợ)`
- Amount: 550,000 VND

Transfer on 19/09/2026:

- Title: `Trả lại tiền sửa điện thoại hôm trước mượn tiền mặt`
- `Từ Tài Khoản`: `Grap Tiền Mặt`
- `Đến Tài Khoản`: `Tiền Mặt`
- Amount: 550,000 VND

The transfer matches the earlier phone-related `Phát Sinh` debt through its
repayment meaning, destination account, and expense-purpose text. The amount
then closes the 550,000 VND outstanding balance. The match must continue to
work if the repayment amount is smaller, and it must not depend on there being
exactly one debt with an equal amount.

## Verification

Regression tests must cover:

1. The September phone-repair repayment closes its related Tiền Mặt debt.
2. A partial repayment reduces but does not remove the debt.
3. Banking and Grap Tiền Mặt debts with equal principals remain independent.
4. A structured repayment to Banking affects only Banking debts.
5. A general account repayment is applied oldest first.
6. A purpose-specific repayment does not use FIFO when its purpose identifies
   another open debt.
7. A conflicting named account and destination relation changes no debt.
8. An ordinary transfer into an indebted account changes no debt.
9. An ambiguous purpose-specific repayment changes no debt and produces one
   concise data-quality warning.
10. Existing internal `Quỹ Momo` fund-loan behavior remains unchanged.

The full Worker test suite must pass before deployment. Live verification must
read the actual Notion rows and confirm that the `Phát Sinh` line no longer
shows the repaid 550,000 VND debt while unrelated debts remain visible.
