# Telegram Account-First Cashflow Report Design

## Goal

Replace long, mixed Telegram finance reports with a three-level drill-down:

1. Monthly totals and one button per payment account.
2. Income and expense categories for the selected account.
3. Individual transactions for the selected category.

The report must use the names and relations already stored in Notion. No Notion
schema changes are required.

## Accounting Rules

### Money earned

`Thu Nhập Ròng Grab (App)` is the amount earned from driving shown by the Grab
app. It has no payment account and is used only by `/muctieu`. It is not included
in account cashflow totals.

### Money in

Money in is any positive record from either income database that has a
`Phương Thức Thanh Toán` relation:

- `Báo Cáo Thu Nhập`
- `Báo Cáo Khoản Thu Khác`

The report preserves the related Notion income category. For example,
`Vay Và Trả` remains money returned by a borrower and is not renamed to income.

Records without a payment account are excluded from account totals and counted
in a compact `Chưa xác định tài khoản` warning.

### Money out

Money out is every record in `Báo Cáo Khoản Chi` with a payment account. It is
grouped by the related `Loại Chi Phí` exactly as stored in Notion.

Records without a payment account are excluded from account totals and counted
in a compact `Chưa xác định tài khoản` warning.

### Internal transfers

Transfers between the user's own accounts are not money in and are not money
out. They do not affect monthly income or expense totals.

At the account-detail level, non-zero transfers appear as one compact
reconciliation line:

`Chuyển nội bộ: vào X · ra Y`

They are never mixed into income or expense categories.

## Telegram Navigation

### Level 1: Monthly report

`/thang` and `/chi` open the same account-first cashflow summary:

```text
📊 Dòng tiền tháng 7/2026
Tổng tiền vào: X
Tổng tiền ra: Y
Chênh lệch: Z

Chọn tài khoản:
```

One button is rendered for each account with activity:

```text
Momo · Vào X · Ra Y
Grap Tiền Mặt · Vào X · Ra Y
Quỹ Momo · Vào X · Ra Y
```

Accounts with no money in, money out, or internal transfer activity are omitted.
If records are missing an account, the message adds only:

`⚠️ Chưa xác định tài khoản: N giao dịch · X`

The main report does not list categories or transactions.

### Level 2: Account report

Selecting an account shows:

```text
💳 Momo — tháng 7/2026
Tiền vào: X
• Grab - Tiền Về Ví: A
• Vay Và Trả: B

Tiền ra: Y
• Nhà Trọ: C
• Đi Chợ: D
• Mua Sắm: E

Chuyển nội bộ: vào F · ra G
```

Each non-zero income category and expense category has its own inline button.
The message shows category totals only, not individual transactions.

### Level 3: Category transactions

Selecting a category shows the individual records:

```text
📤 Momo → Vay Và Trả: 400.000đ
• 02/07 — Quảng trả tiền mượn: 100.000đ
• 14/07 — Tố trả nợ: 200.000đ
...
```

Expense details use `💸` and show date, transaction title, and amount. Notes are
shown only when needed to distinguish an unclear record.
The list is capped at 30 records, with a remaining-count message when truncated.

## Data Model

The Apps Script builds one monthly cashflow model per request:

```text
month
  totalIn
  totalOut
  net
  unknownAccount
  accounts[]
    accountId
    accountName
    moneyIn
      total
      categories[]
        sourceDatabase
        categoryId
        categoryName
        total
        transactions[]
    moneyOut
      total
      categories[]
        categoryId
        categoryName
        total
        transactions[]
    transfersIn
    transfersOut
```

Income categories from the two income databases remain separate internally by
`sourceDatabase + categoryId`. Categories with the same normalized visible name
are merged for display, and their transaction lists contain records from both
source keys.

## Callback Design

Callbacks use short tokens that fit Telegram's 64-byte callback limit:

- `cash_account:<account-token>`
- `cash_cat:<account-token>:in:<category-token>`
- `cash_cat:<account-token>:out:<category-token>`
- `cash_home`

Tokens are resolved against a freshly built monthly model. The bot never trusts
an amount embedded in callback data.

## Performance

The bot queries these databases in parallel:

- Accounts
- Main income
- Other income
- Expense
- Income category definitions
- Other-income category definitions
- Expense category definitions
- Internal transfers

All current-month rows are paginated beyond Notion's 100-row limit. The model is
cached briefly for callback navigation and refreshed on an explicit refresh.

## Error Handling

- Missing payment account: exclude from account totals and show one warning.
- Missing category: group under `Chưa phân loại` for that direction.
- Deleted callback target: return to the monthly report with a short warning.
- Notion or Telegram API error: preserve the existing explicit error response.
- Empty month: show zero totals and no account buttons.

## Compatibility

- `/muctieu` remains unchanged and continues using
  `Thu Nhập Ròng Grab (App)`.
- `/thang` becomes the canonical monthly account-first report.
- `/chi` opens the same monthly account-first report to avoid two conflicting
  calculations.
- Existing detailed account and category callbacks are replaced by the new
  direction-aware callbacks.
- Fund-budget warnings remain accessible through a separate
  `📦 Quỹ & ngân sách` button and are not printed in the main cashflow report.

## Verification

Automated tests must cover:

- Money earned without an account is excluded from account cashflow.
- Main income and other income are combined by payment account.
- Borrower repayments remain under `Vay Và Trả`.
- Expenses group by account and expense category.
- Internal transfers do not change total money in or total money out.
- Level 1 contains no category or transaction list.
- Level 2 contains category totals but no transaction rows.
- Level 3 contains only the selected category's transaction rows.
- Missing accounts and pagination are handled.
- Callback tokens stay below 64 bytes.

Live verification must confirm `/thang`, `/chi`, one income category, one expense
category, and one internal-transfer reconciliation on Telegram.
