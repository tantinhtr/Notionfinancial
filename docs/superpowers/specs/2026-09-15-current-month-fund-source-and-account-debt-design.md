# Current-Month Fund Sources and Account Advances

## Goal

For every current-month expense, keep three different facts separate: what was
spent, what current-month money actually covered, and what source is still owed.
The fund report must not equate a payment account, a transfer into a fund, or a
current account balance with proof that an expense has been funded or a debt
has been repaid.

This design corrects the current `paidOutsideFund` rule, which reports money
paid from Tiền Mặt or Banking as `đã chi từ` without connecting that payment to
the month-of-origin ledger or a repayment obligation.

## Source-of-Money Rules

- Momo and Grap Tiền Mặt are the two ordinary sources used to fund this
  month's small funds. Actual current-month income/receipts recorded in Notion
  and received into those sources are eligible current-month money. The Grab
  app's `Thu Nhập Ròng Grab (App)` target is not a receipt into an account.
- A transfer preserves the source-of-money cohort. Current-month money moved
  from Momo or Grap Tiền Mặt into Tiền Mặt or Banking remains current-month
  money. A balance or equal-sized transfer is not evidence by itself: the bot
  must trace dated Notion income, other-income, and account-transfer records in
  order, without requiring a transfer amount to equal the later expense.
- The four opening balances of Tiền Mặt, Banking, Grap Tiền Mặt, and Momo are
  previous-month money. Quỹ Momo is excluded from that opening pool. Borrowed
  principal, returned loans, and pass-through receipts retain their own meaning
  and cannot silently become unrestricted income or close an advance.
- Explicit wording in the original Notion title or note that an expense is
  `nợ`, together with its structured payment-account relation, identifies
  that exact payment account as the account owed. It overrides an otherwise
  ambiguous cohort calculation. A 550,000-VND row paid from Tiền Mặt and
  explicitly marked as debt remains an obligation to Tiền Mặt for its original
  amount. The bot cannot reassign it
  to a person, another account, or a virtual fund by looking at balances.
- If the payment account contains mixed cohorts that cannot be assigned to a
  particular row, report only the account-level minimum proven to be
  previous-month money. Do not invent a row-level funding or debt amount.

## Expense and Fund Coverage

- All genuine current-month expenses continue to count under their Notion
  expense category and group, subject to the existing pass-through and budget
  exclusions. Source accounting does not change the spending amount.
- Most categories in the 5.5-million-VND group are intended to be paid online
  after Momo/Grap Tiền Mặt funds their Quỹ Momo small fund. Đi Chợ is the
  intentional direct-payment exception using Grap Tiền Mặt.
- A category normally funded through Quỹ Momo can nevertheless be paid
  directly from eligible current-month Momo or Grap Tiền Mặt money. That amount
  is covered for its category without another transfer into Quỹ Momo. Example:
  Cắt Tóc paid directly using 70,000 VND of current-month Grap Tiền Mặt money
  is spent and covered for 70,000 VND; it needs no second 70,000 VND funding
  transfer and creates no debt.
- If Tiền Mặt or Banking pays an expense using previous-month money, the
  expense is spent but that amount is **not** counted as funded by this month's
  two ordinary sources. It creates an account advance owed back to the exact
  payment account. The required fund transfer for the already-spent portion
  must not be requested a second time; repayment belongs in the account-debt
  line, not in the `CẦN CẤP THÊM` line.
- Only an explicit dated Notion reimbursement to the named account or fund,
  or an explicit personal-loan return matched to the original account advance,
  reduces that obligation. The latter may be received into another physical
  account, as with Tuấn's return received into Momo for a Banking loan.
  Available money, generic income, or an unrelated transfer does not count as
  repayment.

## The 550,000-VND Tiền Mặt Case

The `Phát Sinh` line can show 704,000 VND spent, comprising 550,000 VND paid
from Tiền Mặt and 154,000 VND paid from Grap Tiền Mặt. The 550,000-VND Notion
expense is explicitly recorded as owing Tiền Mặt. Therefore:

- Keep the full original expense in `Phát Sinh` spending.
- Keep a separate 550,000-VND obligation to Tiền Mặt, until an explicit
  repayment transaction is recorded.
- Do **not** present that 550,000 VND as current-month money already granted to
  the small fund.
- Treat the 154,000-VND Grap Tiền Mặt portion as directly covered only to the
  extent dated Notion receipts and transfers prove it was current-month money.
  Do not infer coverage from the account name alone.
- Do not ask to transfer either already-spent portion into Quỹ Momo again.

## Nhà Trọ and Independent Fund Debt

The existing Nhà Trọ exception remains unchanged. At the start of the month,
2,150,000 VND from the previous-month opening pool may pay Nhà Trọ without an
account reimbursement. The September records show a real 1,400,004-VND
transfer into the essential fund plus a real 750,000-VND Quỹ tiết kiệm dài hạn
loan movement. The fund is covered for the actual 2,150,004 VND, but the
750,000-VND internal loan remains a separate debt to Quỹ tiết kiệm dài hạn.
Neither the 133,004-VND fund balance nor later money elsewhere repays that
loan; only an explicit matching Notion repayment does.

The 2,150,000-VND exemption does not exempt the separate 750,000-VND fund loan.
No new transfer, repayment, or expense record is manufactured to make the two
figures fit.

## Data Flow and Report Boundary

1. Read the actual current-month income, other-income, expense, and transfer
   rows plus account/category/fund names and aliases from Notion. Retain each
   page's title, note, date, amount, account relations, category relation, and
   transfer/fund relations. Historical rows are used only when a current row
   explicitly references them.
2. Extend the existing chronological source ledger to expose, for a real
   expense row, the portion covered by eligible current-month money, the
   previous-month advance owed to its payment account, and any portion whose
   provenance cannot be established. Use the existing explicit fund-loan and
   personal-loan ledgers for their distinct debts; do not merge them.
3. The fund builder consumes those real-row source applications. Direct
   current-money spending covers the corresponding child once. Account
   advances are displayed as debts to their payment accounts; they do not
   inflate gross fund allocation, existing fund balances, or the fund-loan
   principal.
4. Keep the Telegram report compact: a child shows its spending, any proved
   direct source used, and any unpaid account/fund obligation relevant to that
   child. Do not duplicate a debt in a second generic section, and do not show
   a speculative funding amount. `CHƯA ĐỦ DỮ KIỆN` remains a separate
   data-quality section based only on real current-month Notion rows.

## Acceptance Tests

- Cắt Tóc 70,000 VND paid directly from current-month Grap Tiền Mặt is covered
  once, with no second fund transfer or debt.
- Đi Chợ paid from its intended Grap Tiền Mặt source has no redundant source
  explanation or debt.
- An online child paid from current-month Momo is covered even when no separate
  Quỹ Momo transfer was recorded for its already-spent portion.
- Explicit 550,000-VND Tiền Mặt debt remains owed to Tiền Mặt and is excluded
  from current-month funded coverage; the 154,000-VND Grap Tiền Mặt spending
  is covered only when prior actual receipts prove its provenance.
- A Tiền Mặt/Banking expense after several dated transfers from current-month
  Momo/Grap Tiền Mặt is traced by cumulative source, not an equal-amount match.
  A transfer of previous-month money does not erase a debt.
- Mixed cohorts produce only a proven account-level advance, never an invented
  row-level amount; an explicit Notion debt note wins when present.
- Generic income, a positive balance, or an unrelated transfer never closes a
  debt; an explicit account/fund repayment or a matched personal-loan return
  does, and it is applied only once.
- Nhà Trọ remains covered by the real 1,400,004-VND transfer and 750,000-VND
  internal loan, with the separate 750,000-VND loan still outstanding. The
  existing 2,150,000-VND previous-month rent exemption remains intact.
- Existing fund, budget, loan, previous-month-advance, cashflow, data-quality,
  cache, Telegram, and Worker tests continue to pass.

## Non-Goals

No Notion schema or row changes; no automatic transfer or repayment; no
account-balance-based funding inference; no AI interpretation; no unrelated
budget/report redesign or change to the 5.5-million-VND ceiling.
