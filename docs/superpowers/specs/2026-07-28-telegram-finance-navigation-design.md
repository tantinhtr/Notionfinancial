# Telegram Finance Navigation Design

## Scope

Simplify the Telegram finance bot into a four-screen, button-first report. Remove
duplicate text, remove the `/thang` command, and make `/start` open the account
overview directly.

## Terminology

- Use `Thu` and `Chi` in all reader-facing text and buttons.
- Do not use `Tiền vào` or `Tiền ra`.
- Internal account transfers are balance movements, not Thu or Chi. They do not
  appear in the Thu/Chi drill-down.

## Level 1: Account Overview

`/start` opens the monthly account overview directly.

Message text:

```text
📊 Dòng tiền tháng 7/2026
```

Buttons:

```text
Tiền Mặt · <current balance>
Banking · <current balance>
Grap Tiền Mặt · <current balance>
Momo · <current balance>
Quỹ Momo · <current balance>
🎯 Mục tiêu
📦 Quỹ & ngân sách
```

Only active monthly accounts are shown. The preferred account order above is
preserved. The `/thang` command is removed from routing, help text, and fallback
guidance.

## Level 2: Account Totals

Selecting an account shows only the account heading:

```text
💳 Tiền Mặt — tháng 7/2026
```

Buttons:

```text
Tổng Thu · <amount>
Tổng Chi · <amount>
⬅️ Các tài khoản
```

The message body must not repeat totals, categories, transactions, or internal
transfer values. Both total buttons remain visible when their amount is zero.

## Level 3: Category Selection

Selecting `Tổng Thu` shows one button per nonzero income category:

```text
📥 Tiền Mặt — Tổng Thu

Khoản Thu Khác · <amount>
Grab - Tiền Về Ví · <amount>
```

Selecting `Tổng Chi` shows one button per nonzero expense category:

```text
💸 Tiền Mặt — Tổng Chi

Đi Chợ · <amount>
Phát Sinh · <amount>
```

The message body contains only the heading. Category values appear only on the
buttons. Each category screen includes navigation back to the selected account
and to the account overview.

## Level 4: Transaction Detail

Selecting a category shows a text report sorted newest first:

```text
📥 Tiền Mặt → Khoản Thu Khác: <category total>
• 18/07 — <transaction name>: <amount>
• 16/07 — <transaction name>: <amount>
```

This final level is text, not one button per transaction. Keep only navigation
buttons back to the selected account and account overview. Show a note only when
the transaction title is missing or unclear.

## Callback Flow

- `cash_home`: Level 1.
- `cash_account:<account>`: Level 2.
- `cash_direction:<account>:in|out`: Level 3.
- `cash_cat:<account>:in|out:<category>`: Level 4.
- `show_goal`: existing goal report.
- `show_funds`: existing fund and budget report.

All callback values must stay within Telegram's 64-byte limit.

## Error Handling

- A stale account callback returns a short error and a button to the account
  overview.
- A stale direction or category callback returns a short error and appropriate
  back navigation.
- A zero-total direction opens a heading with no category buttons and clear back
  navigation.

## Verification

Automated tests must cover:

- `/start` opens Level 1 and `/thang` no longer opens a report.
- Level 1 contains the five ordered balance buttons plus Goal and Funds.
- Level 2 contains only the heading and two total buttons.
- Level 3 contains category buttons without duplicate category text.
- Level 4 contains transaction rows and no transaction buttons.
- Internal transfers are excluded from Thu/Chi totals.
- Callback data stays within 64 UTF-8 bytes.

After tests pass, save the exact source to Google Apps Script and verify `/start`
and one account drill-down on Telegram. Do not click an unrelated account during
live verification.
