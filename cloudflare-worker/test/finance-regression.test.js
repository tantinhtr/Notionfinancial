import assert from "node:assert/strict";
import test from "node:test";

import {
  accountSpendingKeyboard_,
  accountSpendingText_,
  buildAccountSpendingData_,
  buildMonthlyCashflowData_,
  cashflowAccountKeyboard_,
  cashflowAccountText_,
  cashflowCallbackData_,
  cashflowCategoryKeyboard_,
  cashflowCategoryText_,
  cashflowCategoryToken_,
  cashflowDirectionKeyboard_,
  cashflowDirectionText_,
  fundBudgetKeyboard_,
  fundBudgetText_,
  iso_,
  money_,
  monthlyCashflowKeyboard_,
  monthlyCashflowText_,
  normalizeSearchText_,
  parseCashflowCategoryCallback_,
  parseCashflowDirectionCallback_,
  progressText_,
  unusualSpendingKeyboard_,
  unusualSpendingText_
} from "../src/finance.js";

function expenseRow(id, categoryId, accountId, amount) {
  return {
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: id }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-07-20" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  };
}

function namedExpenseRow(id, name, categoryId, accountId, amount, note = "") {
  return {
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-07-20" } },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: accountId ? [{ id: accountId }] : [] }
    }
  };
}

function transferRow(id, note, amount, fromAccountId, toAccountId, fundGroupId) {
  return {
    id,
    properties: {
      "Ghi Chú": { title: [{ plain_text: note }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-07-04" } },
      "Loại Chuyển Đổi": { select: { name: "Giao Dịch Giữa Các Tài Khoản" } },
      "Từ Tài Khoản": { relation: [{ id: fromAccountId }] },
      "Đến Tài Khoản": { relation: [{ id: toAccountId }] },
      "Nhóm Quỹ": { relation: fundGroupId ? [{ id: fundGroupId }] : [] }
    }
  };
}

function trackedCategoryRow(id, name, budget, fundGroupId) {
  return {
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: budget },
      "Tính Trong 5,5 Triệu": { checkbox: true },
      "Nhóm Quỹ": { relation: fundGroupId ? [{ id: fundGroupId }] : [] }
    }
  };
}

function fundGroupRow(id, name, destinationAccountId, requiresAllocation) {
  return {
    id,
    properties: {
      "Tên Nhóm Quỹ": { title: [{ plain_text: name }] },
      "Tài Khoản Giữ Quỹ": { relation: destinationAccountId ? [{ id: destinationAccountId }] : [] },
      "Bắt Buộc Cấp Quỹ": { checkbox: requiresAllocation }
    }
  };
}

function cashflowIncomeRow(id, name, categoryId, accountId, amount, note = "") {
  return {
    id,
    properties: {
      "Tên Khoản Thu": { title: [{ plain_text: name }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-07-20" } },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Loại Khoản Thu": { relation: categoryId ? [{ id: categoryId }] : [] },
      "Phương Thức Thanh Toán": { relation: accountId ? [{ id: accountId }] : [] }
    }
  };
}

function cashflowAccountRow(id, name, currentBalance = 0) {
  return {
    id,
    properties: {
      "Phương Thức Thanh Toán": { title: [{ plain_text: name }] },
      "Số Dư Hiện Tại": { formula: { type: "number", number: currentBalance } }
    }
  };
}

function cashflowCategoryRow(id, property, name) {
  return {
    id,
    properties: {
      [property]: { title: [{ plain_text: name }] }
    }
  };
}

function levelOneCashflowData() {
  return {
    t: { y: 2026, m: 7, d: 28 },
    totalIn: 900000,
    totalOut: 2200000,
    net: -1300000,
    accounts: [
      {
        token: "momo",
        name: "Momo",
        currentBalance: 270000,
        moneyIn: {
          total: 200000,
          categories: [{ name: "Vay Va Tra", rows: [{ name: "Nguoi quen tra no" }] }]
        },
        moneyOut: { total: 0, categories: [] }
      },
      {
        token: "cash",
        name: "Grap Tien Mat",
        currentBalance: 2774000,
        moneyIn: {
          total: 700000,
          categories: [{ name: "Grab - Tien Ve Vi", rows: [{ name: "Grab ve vi 18/7" }] }]
        },
        moneyOut: {
          total: 2200000,
          categories: [
            { name: "Nha Tro", rows: [{ name: "Tien phong thang 7" }] },
            { name: "Di Cho", rows: [{ name: "Sieu thi cuoi tuan" }] }
          ]
        }
      },
      {
        token: "inactive",
        name: "Tai khoan trong",
        currentBalance: 0,
        moneyIn: { total: 0, categories: [] },
        moneyOut: { total: 0, categories: [] }
      }
    ]
  };
}

function levelTwoCashAccount() {
  return {
    token: "cash",
    name: "Grap Tiền Mặt",
    moneyIn: {
      total: 700000,
      categories: [{
        token: "in-grab",
        name: "Grab - Tiền Về Ví",
        total: 700000,
        rows: [{ name: "Grab về ví 18/7", date: "2026-07-18", note: "Không hiển thị" }]
      }]
    },
    moneyOut: {
      total: 2200000,
      categories: [
        {
          token: "out-market",
          name: "Đi Chợ",
          total: 200000,
          rows: [{ name: "Siêu thị cuối tuần", date: "2026-07-26", note: "Không hiển thị" }]
        },
        {
          token: "out-rent",
          name: "Nhà Trọ",
          total: 2000000,
          rows: [{ name: "Tiền phòng tháng 7", date: "2026-07-01", note: "Không hiển thị" }]
        },
        { token: "out-zero", name: "Không phát sinh", total: 0, rows: [] }
      ]
    },
    transfersIn: 400000,
    transfersOut: 0
  };
}

function levelTwoCashflowData() {
  return { t: { y: 2026, m: 7, d: 28 }, accounts: [levelTwoCashAccount()] };
}

function levelThreeCashflowData() {
  const account = levelTwoCashAccount();
  account.moneyIn = {
    total: 300000,
    categories: [{
      token: "in-loan",
      name: "Vay Và Trả",
      total: 300000,
      rows: [
        { name: "Quảng trả tiền mượn", amount: 100000, date: "2026-07-02" },
        { name: "Tố trả nợ", amount: 200000, date: "2026-07-14" }
      ]
    }]
  };
  account.moneyOut = {
    total: 200000,
    categories: [{
      token: "out-market",
      name: "Đi Chợ",
      total: 200000,
      rows: [{ name: "Đi chợ 2 ngày", amount: 73000, date: "2026-07-05" }]
    }]
  };
  return { t: { y: 2026, m: 7, d: 28 }, accounts: [account] };
}

test("builds account-first monthly cashflow", () => {
  const model = buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [
      cashflowAccountRow("momo", "Momo", 270000),
      cashflowAccountRow("cash", "Grap Tiền Mặt", 2774000)
    ],
    [
      cashflowIncomeRow(
        "grab-earned",
        "Thu nhập ròng Grap",
        "39c8ffb5-256b-806f-a710-e022aabf703d",
        null,
        500000
      ),
      cashflowIncomeRow("legacy-cash", "Grap tiền mặt", "grab-wallet", "cash", 300000)
    ],
    [
      cashflowIncomeRow("debt-return", "Tố trả nợ", "loan-return", "momo", 200000),
      cashflowIncomeRow("wallet-cash", "Grab tiền mặt", "grab-wallet-other", "cash", 400000)
    ],
    [
      namedExpenseRow("rent", "Tiền phòng", "rent-cat", "cash", 2000000),
      namedExpenseRow("market", "Đi chợ", "market-cat", "cash", 200000)
    ],
    [transferRow("withdraw", "Rút tiền", 400000, "momo", "cash")],
    [
      cashflowCategoryRow("grab-net", "Loại Khoản Thu", "Thu nhập ròng Grap"),
      cashflowCategoryRow("grab-wallet", "Loại Khoản Thu", "Grab - Tiền Về Ví")
    ],
    [
      cashflowCategoryRow("loan-return", "Loại Khoản Thu", "Vay Và Trả"),
      cashflowCategoryRow("grab-wallet-other", "Loại Khoản Thu", "  grab - tiền về ví  ")
    ],
    [
      cashflowCategoryRow("rent-cat", "Loại Chi Phí", "Nhà Trọ"),
      cashflowCategoryRow("market-cat", "Loại Chi Phí", "Đi Chợ")
    ]
  );

  const cash = model.accounts.find((account) => account.id === "cash");
  const momo = model.accounts.find((account) => account.id === "momo");
  const cashWallet = cash.moneyIn.categories.find((category) => category.name === "Grab - Tiền Về Ví");

  assert.equal(model.totalIn, 900000);
  assert.equal(model.totalOut, 2200000);
  assert.equal(model.net, -1300000);
  assert.equal(cash.moneyIn.total, 700000);
  assert.equal(cash.moneyOut.total, 2200000);
  assert.equal(cash.currentBalance, 2774000);
  assert.equal(momo.currentBalance, 270000);
  assert.equal(cash.transfersIn, 400000);
  assert.equal(momo.transfersOut, 400000);
  assert.deepEqual(model.unknownAccount, {
    moneyIn: { count: 0, total: 0 },
    moneyOut: { count: 0, total: 0 }
  });
  assert.equal(cashWallet.total, 700000);
  assert.equal(cashWallet.rows.length, 2);
  assert.equal(cashWallet.token, cashflowCategoryToken_("in", "grab - tien ve vi"));
});

test("configured Grab net goal income stays outside cashflow even with a payment account", () => {
  const model = buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow("cash", "Grap Tien Mat")],
    [
      cashflowIncomeRow(
        "grab-earned-with-account",
        "Thu Nhap Rong Grab App",
        "39c8ffb5-256b-806f-a710-e022aabf703d",
        "cash",
        500000
      )
    ],
    [],
    [],
    [],
    [cashflowCategoryRow(
      "39c8ffb5-256b-806f-a710-e022aabf703d",
      "Loại Khoản Thu",
      "Thu Nhap Rong Grab App"
    )],
    [],
    []
  );

  assert.equal(model.totalIn, 0);
  assert.equal(model.accounts[0].moneyIn.total, 0);
  assert.deepEqual(model.accounts[0].moneyIn.categories, []);
  assert.deepEqual(model.unknownAccount.moneyIn, { count: 0, total: 0 });
});

test("monthly cashflow ignores zero and negative income before account, category, and unknown aggregation", () => {
  const model = buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow("cash", "Grap Tien Mat")],
    [
      cashflowIncomeRow("main-zero-known", "Thu zero", "main-income", "cash", 0),
      cashflowIncomeRow("main-negative-unknown", "Thu am", "main-income", null, -120000)
    ],
    [
      cashflowIncomeRow("other-negative-known", "Thu khac am", "other-income", "cash", -230000),
      cashflowIncomeRow("other-zero-unknown", "Thu khac zero", "other-income", null, 0)
    ],
    [],
    [],
    [cashflowCategoryRow("main-income", "Loại Khoản Thu", "Thu Chinh")],
    [cashflowCategoryRow("other-income", "Loại Khoản Thu", "Thu Khac")],
    []
  );

  assert.equal(model.totalIn, 0);
  assert.equal(model.accounts[0].moneyIn.total, 0);
  assert.deepEqual(model.accounts[0].moneyIn.categories, []);
  assert.deepEqual(model.unknownAccount.moneyIn, { count: 0, total: 0 });
});

test("monthly cashflow preserves expense aggregation for zero and negative records", () => {
  const model = buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow("cash", "Grap Tien Mat")],
    [],
    [],
    [
      namedExpenseRow("negative-expense", "Hoan mot phan tien chi", "expense-cat", "cash", -50000),
      namedExpenseRow("zero-unknown-expense", "Chi zero chua ro tai khoan", "expense-cat", null, 0)
    ],
    [],
    [],
    [],
    [cashflowCategoryRow("expense-cat", "Loại Chi Phí", "Phat Sinh")]
  );

  assert.equal(model.totalOut, -50000);
  assert.equal(model.accounts[0].moneyOut.total, -50000);
  assert.equal(model.accounts[0].moneyOut.categories[0].total, -50000);
  assert.equal(model.accounts[0].moneyOut.categories[0].rows.length, 1);
  assert.deepEqual(model.unknownAccount.moneyOut, { count: 1, total: 0 });
});

test("monthly cashflow records real accountless rows as unknown", () => {
  const model = buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow("cash", "Grap Tiền Mặt")],
    [cashflowIncomeRow("unknown-income", "Thu chưa rõ", "misc-income", null, 123000)],
    [],
    [{
      id: "unknown-expense",
      properties: {
        "Nội Dung Khoản Chi": { title: [{ plain_text: "Chi chưa rõ" }] },
        "Số Tiền": { number: 456000 },
        "Ngày": { date: { start: "2026-07-20" } },
        "Loại Chi Phí": { relation: [{ id: "misc-expense" }] },
        "Phương Thức Thanh Toán": { relation: [] }
      }
    }],
    [],
    [cashflowCategoryRow("misc-income", "Loại Khoản Thu", "Thu Khác")],
    [],
    [cashflowCategoryRow("misc-expense", "Loại Chi Phí", "Phát Sinh")]
  );

  assert.equal(model.totalIn, 0);
  assert.equal(model.totalOut, 0);
  assert.deepEqual(model.unknownAccount, {
    moneyIn: { count: 1, total: 123000 },
    moneyOut: { count: 1, total: 456000 }
  });
});

test("level 1 cashflow text is the exact monthly account summary", () => {
  assert.equal(monthlyCashflowText_(levelOneCashflowData()), "📊 Dòng tiền tháng 7/2026");
});

test("level 1 cashflow adds one compact unknown-account warning with both directions", () => {
  const data = levelOneCashflowData();
  data.unknownAccount = {
    moneyIn: { count: 2, total: 123000 },
    moneyOut: { count: 3, total: 456000 }
  };

  const text = monthlyCashflowText_(data);
  assert.equal((text.match(/Chưa xác định tài khoản/g) || []).length, 1);
  assert.match(
    text,
    /\n\n⚠️ Chưa xác định tài khoản: Thu 2 giao dịch · 123\.000đ \| Chi 3 giao dịch · 456\.000đ$/
  );
  assert.doesNotMatch(text, /\b(?:Vào|Ra)\b/);
});

test("level 1 cashflow warning includes only the applicable unknown-account direction", () => {
  const data = levelOneCashflowData();
  data.unknownAccount = {
    moneyIn: { count: 0, total: 0 },
    moneyOut: { count: 1, total: 89000 }
  };

  const warning = monthlyCashflowText_(data).split("\n\n").at(-1);
  assert.equal(warning, "⚠️ Chưa xác định tài khoản: Chi 1 giao dịch · 89.000đ");
  assert.doesNotMatch(warning, /\b(?:Vào|Ra)\b/);
});

test("level 1 cashflow hides categories and transaction titles", () => {
  const text = monthlyCashflowText_(levelOneCashflowData());
  for (const detail of [
    "Vay Va Tra",
    "Nguoi quen tra no",
    "Grab - Tien Ve Vi",
    "Grab ve vi 18/7",
    "Nha Tro",
    "Tien phong thang 7",
    "Di Cho",
    "Sieu thi cuoi tuan",
    "Thiết Yếu",
    "Đi Chợ",
    "Làm YouTube",
    "Phát Sinh"
  ]) {
    assert.doesNotMatch(text, new RegExp(detail));
  }
});

test("level 1 cashflow keyboard lists active accounts followed by goal and fund navigation rows", () => {
  const keyboard = monthlyCashflowKeyboard_(levelOneCashflowData());
  assert.deepEqual(keyboard, {
    inline_keyboard: [
      [{ text: "Grap Tien Mat · 2.774.000đ", callback_data: "cash_account:cash" }],
      [{ text: "Momo · 270.000đ", callback_data: "cash_account:momo" }],
      [{ text: "🎯 Mục tiêu", callback_data: "show_goal" }],
      [{ text: "📦 Quỹ & ngân sách", callback_data: "show_funds" }]
    ]
  });
  assertCallbacksUnderLimit(keyboard);
});

test("level 1 cashflow orders the five active accounts and shows balances only", () => {
  const account = (name, currentBalance, token, active = true) => ({
    name,
    currentBalance,
    token,
    moneyIn: { total: active ? 1 : 0, categories: [] },
    moneyOut: { total: 0, categories: [] },
    transfersIn: 0,
    transfersOut: 0
  });
  const keyboard = monthlyCashflowKeyboard_({
    accounts: [
      account("Quỹ Momo", 1342556, "fund"),
      account("PayPal", 0, "paypal", false),
      account("Momo", 1030000, "momo"),
      account("Grap Tiền Mặt", 2774000, "grab"),
      account("Banking", 150336, "banking"),
      account("Tiền Mặt", 400000, "cash")
    ]
  });
  const labels = keyboard.inline_keyboard.slice(0, -2).map((row) => row[0].text);

  assert.deepEqual(labels, [
    "Tiền Mặt · 400.000đ",
    "Banking · 150.336đ",
    "Grap Tiền Mặt · 2.774.000đ",
    "Momo · 1.030.000đ",
    "Quỹ Momo · 1.342.556đ"
  ]);
  assert.ok(labels.every((label) => !label.includes("Vào") && !label.includes("Ra")));
  assert.ok(labels.every((label) => !label.includes("PayPal")));
});

test("cashflow callback data accepts 63 UTF-8 bytes and rejects 64", () => {
  const accepted = "a".repeat(63);
  const rejected = "a".repeat(64);
  assert.equal(cashflowCallbackData_(accepted), accepted);
  assert.equal(cashflowCallbackData_(rejected), null);
});

test("level 2 account cashflow text is the exact heading only", () => {
  assert.equal(
    cashflowAccountText_(levelTwoCashflowData(), levelTwoCashAccount()),
    "💳 Grap Tiền Mặt — tháng 7/2026"
  );
});

test("level 2 account cashflow text excludes totals, categories, transactions, and transfers", () => {
  const text = cashflowAccountText_(levelTwoCashflowData(), levelTwoCashAccount());
  for (const detail of [
    "700.000đ",
    "2.200.000đ",
    "Tiền vào",
    "Tiền ra",
    "Grab - Tiền Về Ví",
    "Nhà Trọ",
    "Đi Chợ",
    "Chuyển nội bộ",
    "Grab về ví 18/7",
    "Siêu thị cuối tuần",
    "Tiền phòng tháng 7",
    "2026-07-18",
    "Không hiển thị",
    "Không phát sinh"
  ]) {
    assert.doesNotMatch(text, new RegExp(detail));
  }
});

test("level 2 account keyboard always shows total income, total expense, and account navigation", () => {
  const keyboard = cashflowAccountKeyboard_(levelTwoCashAccount());
  assert.deepEqual(keyboard, {
    inline_keyboard: [
      [{ text: "Tổng Thu · 700.000đ", callback_data: "cash_direction:cash:in" }],
      [{ text: "Tổng Chi · 2.200.000đ", callback_data: "cash_direction:cash:out" }],
      [{ text: "⬅️ Các tài khoản", callback_data: "cash_home" }]
    ]
  });
  assertCallbacksUnderLimit(keyboard);
});

test("level 2 account keyboard keeps zero-total direction buttons visible", () => {
  const account = levelTwoCashAccount();
  account.moneyIn.total = 0;
  account.moneyOut.total = 0;
  const keyboard = cashflowAccountKeyboard_(account);
  assert.deepEqual(keyboard.inline_keyboard.slice(0, 2), [
    [{ text: "Tổng Thu · 0đ", callback_data: "cash_direction:cash:in" }],
    [{ text: "Tổng Chi · 0đ", callback_data: "cash_direction:cash:out" }]
  ]);
  assertCallbacksUnderLimit(keyboard);
});

test("cashflow direction callback parser accepts only the exact account and direction format", () => {
  assert.deepEqual(parseCashflowDirectionCallback_("cash_direction:cash:in"), {
    accountToken: "cash",
    direction: "in"
  });
  for (const invalid of [
    "cash_direction:cash:out:extra",
    "cash_direction:cash:sideways",
    "cash_direction::in",
    "cash_account:cash"
  ]) {
    assert.equal(parseCashflowDirectionCallback_(invalid), null);
  }
});

test("level 3 direction text is the exact heading only", () => {
  const account = levelTwoCashAccount();
  assert.equal(cashflowDirectionText_(account, "in"), "📥 Grap Tiền Mặt — Tổng Thu");
  assert.equal(cashflowDirectionText_(account, "out"), "💸 Grap Tiền Mặt — Tổng Chi");
});

test("level 3 direction keyboard lists nonzero categories in descending totals with account navigation", () => {
  const keyboard = cashflowDirectionKeyboard_(levelTwoCashAccount(), "out");
  assert.deepEqual(keyboard, {
    inline_keyboard: [
      [{ text: "Nhà Trọ · 2.000.000đ", callback_data: "cash_cat:cash:out:out-rent" }],
      [{ text: "Đi Chợ · 200.000đ", callback_data: "cash_cat:cash:out:out-market" }],
      [{ text: "⬅️ Grap Tiền Mặt", callback_data: "cash_account:cash" }],
      [{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]
    ]
  });
  assertCallbacksUnderLimit(keyboard);
});

test("level 3 income detail sorts transactions by date descending", () => {
  const data = levelThreeCashflowData();
  const account = data.accounts[0];
  assert.equal(
    cashflowCategoryText_(data, account, "in", account.moneyIn.categories[0]),
    "📥 Grap Tiền Mặt → Vay Và Trả: 300.000đ\n" +
      "• 14/07 — Tố trả nợ: 200.000đ\n" +
      "• 02/07 — Quảng trả tiền mượn: 100.000đ"
  );
});

test("level 3 expense detail renders the selected expense category", () => {
  const data = levelThreeCashflowData();
  const account = data.accounts[0];
  assert.equal(
    cashflowCategoryText_(data, account, "out", account.moneyOut.categories[0]),
    "💸 Grap Tiền Mặt → Đi Chợ: 200.000đ\n" +
      "• 05/07 — Đi chợ 2 ngày: 73.000đ"
  );
});

test("level 3 shows notes for normalized unclear titles, including an empty title", () => {
  const category = {
    name: "Thu khac",
    total: 150000,
    rows: [
      { name: "Không rõ", amount: 10000, date: "2026-07-01", note: "Tien dien" },
      { name: "CHƯA RÕ", amount: 20000, date: "2026-07-02", note: "Tien nuoc" },
      { name: "Không biết", amount: 30000, date: "2026-07-03", note: "Tien mang" },
      { name: "Chả biết", amount: 40000, date: "2026-07-04", note: "Tien sua xe" },
      { name: "", amount: 50000, date: "2026-07-05", note: "Tien gui xe" }
    ]
  };
  const text = cashflowCategoryText_(
    { t: { y: 2026, m: 7, d: 28 } },
    { name: "Momo" },
    "in",
    category
  );

  for (const note of ["Tien dien", "Tien nuoc", "Tien mang", "Tien sua xe", "Tien gui xe"]) {
    assert.match(text, new RegExp("Ghi chú: " + note));
  }
  assert.match(text, /\(không có nội dung\): 50\.000đ · Ghi chú: Tien gui xe/);
});

test("level 3 hides notes for a normal transaction title", () => {
  const text = cashflowCategoryText_(
    { t: { y: 2026, m: 7, d: 28 } },
    { name: "Momo" },
    "out",
    {
      name: "Di Cho",
      total: 73000,
      rows: [{
        name: "Di cho 2 ngay",
        amount: 73000,
        date: "2026-07-05",
        note: "Ghi chu noi bo khong can hien thi"
      }]
    }
  );
  assert.doesNotMatch(text, /Ghi chú/);
  assert.doesNotMatch(text, /Ghi chu noi bo khong can hien thi/);
});

test("level 3 caps transaction details at 30 rows and reports the remainder", () => {
  const rows = Array.from({ length: 31 }, (_value, index) => ({
    name: `Giao dịch ${index + 1}`,
    amount: 1000,
    date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`
  }));
  const category = { token: "in-many", name: "Thu khác", total: 31000, rows };
  const text = cashflowCategoryText_(
    { t: { y: 2026, m: 7, d: 28 } },
    { name: "Momo" },
    "in",
    category
  );
  assert.equal(text.match(/^• /gm).length, 30);
  assert.match(text, /\.\.\. còn 1 giao dịch\.$/);
});

test("level 3 detail keyboard uses the matching direction and never transaction buttons", () => {
  const account = levelThreeCashflowData().accounts[0];
  for (const direction of ["in", "out"]) {
    const buttons = cashflowCategoryKeyboard_(account, direction).inline_keyboard.flat();
    const directionLabel = direction === "in" ? "Tổng Thu" : "Tổng Chi";
    assert.deepEqual(buttons, [
      { text: "⬅️ " + directionLabel, callback_data: "cash_direction:cash:" + direction },
      { text: "🏠 Các tài khoản", callback_data: "cash_home" }
    ]);
    assert.ok(buttons.every((button) => !button.callback_data.startsWith("cash_cat:")));
  }
});

test("callback length stays strictly below 64 UTF-8 bytes for every generated Level 3 button", () => {
  const data = levelThreeCashflowData();
  const account = data.accounts[0];
  for (const keyboard of [
    monthlyCashflowKeyboard_(data),
    cashflowAccountKeyboard_(account),
    cashflowDirectionKeyboard_(account, "in"),
    cashflowDirectionKeyboard_(account, "out"),
    cashflowCategoryKeyboard_(account, "in"),
    cashflowCategoryKeyboard_(account, "out")
  ]) {
    assertCallbacksUnderLimit(keyboard);
  }
});

function assertCallbacksUnderLimit(keyboard) {
  const encoder = new TextEncoder();
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) {
      assert.ok(encoder.encode(button.callback_data).length < 64);
    }
  }
}

test("account spending keeps fixed budget progress global and account categories separate", () => {
  const categoryRows = [
    trackedCategoryRow("market", "Đi Chợ", 1300000, "market-fund"),
    { id: "grab", properties: { "Loại Chi Phí": { title: [{ plain_text: "Grap" }] } } },
    { id: "other", properties: { "Loại Chi Phí": { title: [{ plain_text: "Khác" }] } } }
  ];
  const accountRows = [
    { id: "cash-account", properties: { "Phương Thức Thanh Toán": { title: [{ plain_text: "Grab Tiền Mặt" }] } } },
    { id: "momo-account", properties: { "Phương Thức Thanh Toán": { title: [{ plain_text: "Momo" }] } } }
  ];
  const expenseRows = [
    namedExpenseRow("cash-market", "Đi chợ tiền mặt", "market", "cash-account", 758000),
    namedExpenseRow("momo-market", "Đi chợ QR", "market", "momo-account", 43000),
    namedExpenseRow("cash-grab", "Đổ xăng", "grab", "cash-account", 763000),
    namedExpenseRow("cash-other", "Mua cốc nước", "other", "cash-account", 10000)
  ];
  const data = buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    [],
    [fundGroupRow("market-fund", "Đi Chợ", "cash-account", false)]
  );

  const marketBudget = data.fixedBudgets.find((item) => item.name === "Đi Chợ");
  const cash = data.accounts.find((item) => item.name === "Grab Tiền Mặt");
  assert.equal(marketBudget.spent, 801000);
  assert.equal(marketBudget.remaining, 499000);
  assert.equal(cash.total, 1531000);
  assert.equal(cash.categories.find((item) => item.name === "Đi Chợ").total, 758000);
  assert.equal(cash.categories.find((item) => item.name === "Grap").total, 763000);
  assert.equal(data.unplannedTotal, 10000);
});

test("cash-flow analysis separates personal spending, loans, Grab capital and unusual spending", () => {
  const categoryRows = [
    trackedCategoryRow("rent", "Nhà Trọ", 2200000, "essential"),
    trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund"),
    { id: "loan", properties: { "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] } } },
    { id: "grab", properties: { "Loại Chi Phí": { title: [{ plain_text: "Grap" }] } } },
    { id: "relative", properties: { "Loại Chi Phí": { title: [{ plain_text: "Người Thân" }] } } },
    { id: "market", properties: { "Loại Chi Phí": { title: [{ plain_text: "Đi Chợ" }] } } },
    { id: "coffee", properties: { "Loại Chi Phí": { title: [{ plain_text: "Cà Phê" }] } } }
  ];
  const accountRows = [
    { id: "cash", properties: { "Phương Thức Thanh Toán": { title: [{ plain_text: "Grap Tiền Mặt" }] } } },
    { id: "momo", properties: { "Phương Thức Thanh Toán": { title: [{ plain_text: "Momo" }] } } }
  ];
  const expenseRows = [
    namedExpenseRow("rent-row", "Tiền phòng", "rent", "momo", 2101000),
    namedExpenseRow("market-row", "Đi chợ", "market", "cash", 800000),
    namedExpenseRow("lend-row", "Cho Bình mượn tiền", "loan", "momo", 1500000),
    namedExpenseRow("repay-row", "Trả lại tiền mượn cho em", "loan", "momo", 150000),
    namedExpenseRow("grab-topup", "Nạp tiền vào ví grap", "grab", "momo", 186000),
    namedExpenseRow("fuel-row", "Đổ xăng", "grab", "cash", 50000),
    namedExpenseRow("knife-row", "Mua bộ dao", "incidental", "momo", 155200),
    namedExpenseRow("relative-row", "Cho em", "relative", "momo", 200000),
    namedExpenseRow("tea-row", "Mua ly trà tắc", "coffee", "cash", 10000, "thuộc quỹ phát sinh")
  ];

  const data = buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    [],
    []
  );

  assert.equal(data.cashOutflowTotal, 5152200);
  assert.equal(data.personalSpendingTotal, 3266200);
  assert.equal(data.loanFlow.total, 1650000);
  assert.equal(data.loanFlow.lent, 1500000);
  assert.equal(data.loanFlow.repaid, 150000);
  assert.equal(data.grabFlow.total, 236000);
  assert.equal(data.grabFlow.capital, 186000);
  assert.equal(data.grabFlow.operating, 50000);
  assert.equal(data.unusualSpending.total, 365200);
  const momoAccount = data.accounts.find((item) => item.name === "Momo");
  assert.equal(momoAccount.personalTotal, 2456200);
  assert.equal(momoAccount.unusualTotal, 355200);
  assert.equal(momoAccount.loanTotal, 1650000);
  assert.equal(momoAccount.grabTotal, 186000);

  const text = accountSpendingText_(data);
  assert.match(text, /Hạn mức: 5\.500\.000đ[\s\S]*Đã dùng: 3\.266\.200đ[\s\S]*Còn: 2\.233\.800đ/);
  assert.match(text, /Chi bình thường: 2\.901\.000đ/);
  assert.match(text, /Chi bất thường: 365\.200đ/);
  assert.match(text, /Cho mượn\/trả nợ: 1\.650\.000đ .*cho mượn 1\.500\.000đ.*trả nợ 150\.000đ/);
  assert.match(text, /Chạy Grab: 236\.000đ .*nạp ví 186\.000đ.*xăng\/phí 50\.000đ/);
  assert.doesNotMatch(text, /Vượt hạn mức tổng/);
  assert.match(unusualSpendingText_(data), /Mua bộ dao: 155\.200đ/);
  const spendingButtons = accountSpendingKeyboard_(data).inline_keyboard.flat();
  assert.equal(spendingButtons[0].callback_data, "show_unusual");
  assert.ok(spendingButtons.every((button) => button.callback_data !== "refresh_accounts"));
  assert.ok(spendingButtons.every((button) => !button.text.includes("Cập nhật")));
});

test("Phát Sinh is a virtual budget and shows where the overspend was paid from", () => {
  const categoryRows = [trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund")];
  const accountRows = [
    cashflowAccountRow("fund", "Quỹ Momo"),
    cashflowAccountRow("momo", "Momo"),
    cashflowAccountRow("cash", "Grap Tiền Mặt")
  ];
  const expenseRows = [
    namedExpenseRow("fund-paid", "Quỹ trả trực tiếp", "incidental", "fund", 146000),
    namedExpenseRow("momo-paid", "Momo trả hộ", "incidental", "momo", 571790),
    namedExpenseRow("cash-paid", "Tiền mặt trả hộ", "incidental", "cash", 144000)
  ];
  const data = buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    [],
    [fundGroupRow("incidental-fund", "Phát Sinh", "fund", true)]
  );

  const incidental = data.fixedBudgets.find((item) => item.name === "Phát Sinh");
  assert.equal(incidental.budget, 600000);
  assert.equal(incidental.spent, 861790);
  assert.equal(incidental.over, 261790);
  assert.deepEqual(incidental.accountBreakdown, [
    { account: "Momo", amount: 571790 },
    { account: "Quỹ Momo", amount: 146000 },
    { account: "Grap Tiền Mặt", amount: 144000 }
  ]);

  const text = accountSpendingText_(data);
  assert.match(text, /⛔ Phát Sinh: 861\.790đ \/ 600\.000đ \| vượt, cần hoàn 261\.790đ \| DỪNG CHI/);
  assert.equal((text.match(/Phát Sinh/g) || []).length, 1);
  assert.doesNotMatch(text, /Momo: 571\.790đ|Quỹ Momo: 146\.000đ|Grap Tiền Mặt: 144\.000đ/);
  assert.doesNotMatch(text, /trả hộ|Thiếu nguồn/);
});

test("fund groups reconcile Notion transfers with spending paid outside the virtual fund", () => {
  const categoryRows = [
    trackedCategoryRow("rent", "Nhà Trọ", 2200000, "essential-fund"),
    trackedCategoryRow("internet", "Internet", 200000, "essential-fund"),
    trackedCategoryRow("affiliate", "Affiilate", 500000, "youtube-fund"),
    trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund")
  ];
  const accountRows = [
    cashflowAccountRow("fund", "Quỹ Momo"),
    cashflowAccountRow("momo", "Momo"),
    cashflowAccountRow("cash", "Grap Tiền Mặt")
  ];
  const expenseRows = [
    expenseRow("rent-paid", "rent", "fund", 2101000),
    expenseRow("internet-paid", "internet", "fund", 176400),
    expenseRow("affiliate-paid", "affiliate", "fund", 554444),
    expenseRow("incidental-fund", "incidental", "fund", 146000),
    expenseRow("incidental-momo", "incidental", "momo", 571790),
    expenseRow("incidental-cash", "incidental", "cash", 144000)
  ];
  const transferRows = [
    transferRow("essential", "Không cần từ khóa", 2400000, "momo", "fund", "essential-fund"),
    transferRow("youtube", "Nội dung tùy ý", 500000, "momo", "fund", "youtube-fund"),
    transferRow("youtube-extra", "Khoản bổ sung", 55000, "momo", "fund", "youtube-fund"),
    transferRow("incidental", "Cấp một phần", 200000, "momo", "fund", "incidental-fund"),
    transferRow("unrelated", "Chuyển tiền vào quỹ tích lũy", 100000, "momo", "fund")
  ];
  const fundGroups = [
    fundGroupRow("essential-fund", "Thiết Yếu", "fund", true),
    fundGroupRow("youtube-fund", "Làm YouTube", "fund", true),
    fundGroupRow("incidental-fund", "Phát Sinh", "fund", true)
  ];

  const data = buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    transferRows,
    fundGroups
  );

  const essential = data.fundGroups.find((group) => group.name === "Thiết Yếu");
  const youtube = data.fundGroups.find((group) => group.name === "Làm YouTube");
  const incidental = data.fundGroups.find((group) => group.name === "Phát Sinh");
  assert.deepEqual(essential, {
    name: "Thiết Yếu",
    destinationAccount: "Quỹ Momo",
    budget: 2400000,
    spent: 2277400,
    over: 0,
    allocated: 2400000,
    paidFromFund: 2277400,
    paidOutsideFund: 0,
    fundBalance: 122600,
    fundRemaining: 122600,
    fundDebt: 0,
    fundingShortfall: 0,
    explicitDebts: [],
    borrowedFunds: [],
    children: [
      {
        name: "Nhà Trọ", budget: 2200000, spent: 2101000, over: 0,
        allocated: 0, paidFromFund: 2101000, paidOutsideFund: 0,
        covered: 2101000, fundRemaining: 0, transferNeeded: 0
      },
      {
        name: "Internet", budget: 200000, spent: 176400, over: 0,
        allocated: 0, paidFromFund: 176400, paidOutsideFund: 0,
        covered: 176400, fundRemaining: 0, transferNeeded: 0
      }
    ],
    transferNeeded: 0,
    transferPlan: [],
    requiresAllocation: true,
    unassignedFundRemaining: 122600
  });
  assert.equal(youtube.allocated, 555000);
  assert.equal(youtube.spent, 554444);
  assert.equal(youtube.over, 54444);
  assert.equal(youtube.transferNeeded, 0);
  assert.equal(incidental.allocated, 200000);
  assert.equal(incidental.spent, 861790);
  assert.equal(incidental.over, 261790);
  assert.equal(incidental.paidOutsideFund, 715790);
  // Da tieu qua ngan sach roi thi khong con gi de cap truoc nua.
  assert.equal(incidental.transferNeeded, 0);
  assert.equal(data.unallocatedBudget, 2000000);

  const text = accountSpendingText_(data);
  assert.match(text, /✅ Thiết Yếu: 2\.277\.400đ \/ 2\.400\.000đ \| đã cấp 2\.400\.000đ/);
  assert.match(text, /⛔ Làm YouTube: 554\.444đ \/ 500\.000đ \| vượt, cần hoàn 54\.444đ \| DỪNG CHI/);
  assert.match(text, /⛔ Phát Sinh: 861\.790đ \/ 600\.000đ \| vượt, cần hoàn 261\.790đ \| DỪNG CHI/);
  assert.equal((text.match(/Thiết Yếu/g) || []).length, 1);
  assert.equal((text.match(/Làm YouTube/g) || []).length, 1);
  assert.equal((text.match(/Phát Sinh/g) || []).length, 1);
  assert.doesNotMatch(text, /quỹ tích lũy/);
});

test("a managed fund with no transfer or outside spending warns the amount to transfer", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    [trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund")],
    [],
    [cashflowAccountRow("fund", "Quỹ Momo")],
    5500000,
    [],
    [fundGroupRow("incidental-fund", "Phát Sinh", "fund", true)]
  );
  assert.equal(data.fundGroups[0].transferNeeded, 600000);
  assert.match(accountSpendingText_(data), /⚠️ Phát Sinh: 0đ \/ 600\.000đ \| cần cấp 600\.000đ/);
});

test("a fund that spent without identified funding reports a shortfall instead of debt", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 17 },
    [trackedCategoryRow("affiliate", "Affiilate", 500000, "youtube-fund")],
    [
      expenseRow("claude-pro", "affiliate", "fund", 554444),
      expenseRow("telegram-wallet", "affiliate", "cash", 20000)
    ],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("cash", "Grap Tiền Mặt")],
    5500000,
    [],
    [fundGroupRow("youtube-fund", "Làm YouTube", "fund", true)]
  );

  const youtube = data.fundGroups[0];
  assert.equal(youtube.allocated, 0);
  assert.equal(youtube.paidFromFund, 554444);
  assert.equal(youtube.paidOutsideFund, 20000);
  // Quỹ đã chi hộ 554.444đ mà chưa được cấp đồng nào, nên nó đang âm đúng số đó.
  assert.equal(youtube.fundBalance, -554444);
  assert.equal(youtube.over, 74444);
  assert.equal(youtube.fundDebt, 0);
  assert.equal(youtube.fundingShortfall, 554444);
  assert.equal(data.explicitLedger.unmatched.some((row) => row.fundGroupId === "youtube-fund"), false);
  // 574.444 da tieu bang tui khac cung coi nhu da cap, ma con vuot ngan sach roi
  // nen khong con gi de cap them; viec phai lam la tra lai cho da ung.
  assert.equal(youtube.transferNeeded, 0);
  // Grap Tien Mat la tien cua chinh minh — tra bang no khong sinh mon no nao.
  assert.deepEqual(youtube.borrowedFunds, []);

  assert.equal(
    fundBudgetText_(data),
    "📦 QUỸ & NGÂN SÁCH — tháng 8/2026\n" +
      "\n" +
      "📊 NHÓM QUỸ — 574.444đ / 500.000đ · ⛔ vượt 74.444đ\n" +
      "⛔ Làm YouTube: 574.444đ / 500.000đ · vượt 74.444đ · chưa cấp\n" +
      "• Tổng chi ngoài quỹ: 0đ"
  );
});

test("750000 internal loan adds allocation once and keeps debt despite the 133004 balance", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 10 },
    [trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential")],
    [expenseRow("rent-paid", "rent", "fund", 2017000)],
    [cashflowAccountRow("fund", "Quỹ Momo", 133004), cashflowAccountRow("bank", "Banking"), cashflowAccountRow("momo", "Momo", 999999)],
    5500000,
    [
      transferRow("bank-allocation", "Tiền phòng", 1400004, "bank", "fund", "essential"),
      transferRow("borrow-750", "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", 750000, "fund", "fund", "essential")
    ],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true), fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true)],
    { incomeRows: [cashflowIncomeRow("grab-income", "Grab thu nhập ròng", "net", "momo", 999999)] }
  );
  const essential = data.fundGroups.find((group) => group.name === "Nhu cầu thiết yếu");
  assert.equal(essential.allocated, 2150004);
  assert.equal(essential.paidFromFund, 2017000);
  assert.equal(essential.fundBalance, 133004);
  assert.equal(essential.fundRemaining, 133004);
  assert.equal(essential.fundDebt, 0);
  assert.equal(essential.explicitDebts[0].outstanding, 750000);
  assert.equal(essential.explicitDebts[0].lender, "Tiết kiệm dài hạn");
  assert.equal(data.openingPlan, data.explicitLedger.openingPlan);
  assert.equal(data.explicitLedger.rows.find((row) => row.id === "grab-income").amount, 999999);
});

test("Internet needs its full unfunded 180000 even when rent and other money remain in Quỹ Momo", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 10 },
    [trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential"),
      trackedCategoryRow("internet", "Internet", 180000, "essential")],
    [namedExpenseRow("rent-paid", "Tiền phòng Nhà Trọ", "rent", "fund", 2017000)],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("bank", "Banking"),
      cashflowAccountRow("momo", "Momo")],
    5500000,
    [transferRow("bank-allocation", "Tiền phòng", 1400004, "bank", "fund", "essential"),
      transferRow("other-allocation", "Tiền quỹ khác", 104000, "momo", "fund", "essential"),
      transferRow("borrow-750", "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", 750000, "fund", "fund", "essential")],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true),
      fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true)]
  );

  const essential = data.fundGroups.find((group) => group.name === "Nhu cầu thiết yếu");
  assert.equal(essential.fundBalance, 237004);
  assert.equal(essential.transferNeeded, 180000);
  assert.deepEqual(essential.transferPlan, [{ name: "Internet", amount: 180000 }]);
  assert.equal(essential.explicitDebts[0].outstanding, 750000);
  assert.match(fundBudgetText_(data), /Internet: 180\.000đ/);
  assert.doesNotMatch(fundBudgetText_(data), /Internet: 75\.996đ/);
});

function finalReviewDatedRow(page, day) {
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  return { ...page, created_time: `${date}T08:00:00.000Z`, properties: {
    ...page.properties, "Ngày": { date: { start: date } }
  } };
}

function finalReviewData({ expenses = [], receipts = [], transfers = [], groups = [] } = {}) {
  const bank = cashflowAccountRow("bank", "Banking");
  bank.properties["Số Dư Ban Đầu"] = { number: 200000 };
  return buildAccountSpendingData_(
    { y: 2026, m: 9, d: 10 },
    [cashflowCategoryRow("loan", "Loại Chi Phí", "Vay Và Trả"), cashflowCategoryRow("other", "Loại Chi Phí", "Khác")],
    expenses,
    [bank, cashflowAccountRow("momo", "Momo"), cashflowAccountRow("fund", "Quỹ Momo")],
    5500000, transfers, groups,
    { sourceAccountNames: ["Banking", "Momo"], rentReserveAmount: 0, otherIncomeRows: receipts }
  );
}

test("final review internal lend and repay conserve virtual balances independently of gross allocation", () => {
  const groups = [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true), fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true)];
  const transfers = [
    finalReviewDatedRow(transferRow("fund-savings", "Cấp quỹ tiết kiệm", 1000000, "external", "fund", "savings"), 1),
    finalReviewDatedRow(transferRow("borrow", "Mượn quỹ tiết kiệm", 750000, "fund", "fund", "essential"), 2)
  ];
  const before = finalReviewData({ transfers, groups });
  const after = finalReviewData({ groups, transfers: [
    ...transfers,
    finalReviewDatedRow(transferRow("repay", "Trả lại 200.000 cho quỹ tiết kiệm", 200000, "fund", "fund", "savings"), 3)
  ] });
  assert.deepEqual(after.fundGroups.map((group) => group.allocated), [750000, 1000000]);
  assert.deepEqual(after.fundGroups.map((group) => group.fundBalance), [550000, 450000]);
  assert.deepEqual(before.fundGroups.map((group) => group.fundBalance), [750000, 250000]);
  assert.deepEqual(after.fundGroups.map((group) => group.fundRemaining), [550000, 450000]);
  assert.equal(after.fundGroups.reduce((total, group) => total + group.fundBalance, 0), 1000000);
  assert.equal(after.explicitLedger.fundLoans.loans[0].outstanding, 550000);
});

test("final review liability payment through Banking cannot reimburse a Banking advance", () => {
  const data = finalReviewData({
    expenses: [
      finalReviewDatedRow(namedExpenseRow("advance", "Chi đầu tháng", "other", "bank", 100000), 1),
      finalReviewDatedRow(namedExpenseRow("pay-em", "Trả lại tiền mượn Em", "loan", "bank", 500000, "Thanh toán bằng Banking"), 3)
    ],
    receipts: [finalReviewDatedRow(cashflowIncomeRow("borrow-em", "Em cho mượn tiền", "loan", "bank", 500000), 2)]
  });
  const bank = data.explicitLedger.previousMonthAdvances.accounts.find((item) => item.accountId === "bank");
  assert.equal(data.explicitLedger.personalLoans.liabilities[0].outstanding, 0);
  assert.equal(bank.principal, 100000);
  assert.equal(bank.repaid, 0);
  assert.equal(bank.outstanding, 100000);
  assert.deepEqual(data.explicitLedger.unmatched, []);
});

test("final review source reimbursement requires a beneficiary instead of a payment-account mention", () => {
  const advance = finalReviewDatedRow(namedExpenseRow("advance", "Chi đầu tháng", "other", "bank", 100000), 1);
  const unaddressed = finalReviewData({ expenses: [advance], receipts: [
    finalReviewDatedRow(cashflowIncomeRow("return", "Trả lại tiền mua hộ", "other", "momo", 100000, "Thanh toán bằng Banking"), 2)
  ] });
  assert.equal(unaddressed.explicitLedger.previousMonthAdvances.accounts[0].outstanding, 100000);
  assert.equal(unaddressed.explicitLedger.unmatched[0].id, "return");
  const addressed = finalReviewData({ expenses: [advance], receipts: [
    finalReviewDatedRow(cashflowIncomeRow("reimburse", "Cấp bù cho Banking", "other", "momo", 100000, "Thanh toán bằng Momo"), 2)
  ] });
  assert.equal(addressed.explicitLedger.previousMonthAdvances.accounts[0].outstanding, 0);
  assert.deepEqual(addressed.explicitLedger.unmatched, []);
});

test("final review Tuấn return settles its opening advance before a later Banking reimbursement", () => {
  const data = finalReviewData({ expenses: [
    finalReviewDatedRow(namedExpenseRow("lend-tuan", "Cho cháu Tuấn mượn", "loan", "bank", 100000), 1),
    finalReviewDatedRow(namedExpenseRow("later-advance", "Chi đầu tháng", "other", "bank", 100000), 3)
  ], receipts: [
    finalReviewDatedRow(cashflowIncomeRow("return-tuan", "Cháu Tuấn trả nợ", "loan", "momo", 100000), 2),
    finalReviewDatedRow(cashflowIncomeRow("reimburse", "Cấp bù cho Banking", "other", "momo", 100000), 4)
  ] });
  const bank = data.explicitLedger.previousMonthAdvances.accounts.find((item) => item.accountId === "bank");
  assert.equal(data.explicitLedger.personalLoans.receivables[0].outstanding, 0);
  assert.equal(bank.principal, 200000);
  assert.equal(bank.repaid, 200000);
  assert.equal(bank.outstanding, 0);
  assert.deepEqual(data.explicitLedger.unmatched, []);
});

test("final review matched fund repayment has no duplicate source warning while ambiguous repayment stays visible", () => {
  const data = finalReviewData({
    groups: [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true), fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true)],
    transfers: [
      finalReviewDatedRow(transferRow("fund-savings", "Cấp quỹ tiết kiệm", 1000000, "external", "fund", "savings"), 1),
      finalReviewDatedRow(transferRow("borrow", "Mượn quỹ tiết kiệm", 750000, "fund", "fund", "essential"), 2),
      finalReviewDatedRow(transferRow("repay", "Trả lại 200.000 cho quỹ tiết kiệm", 200000, "fund", "fund", "savings"), 3),
      finalReviewDatedRow(transferRow("ambiguous", "Trả lại tiền", 10000, "fund", "fund", ""), 4)
    ]
  });
  assert.equal(data.explicitLedger.fundLoans.loans[0].repaid, 200000);
  assert.equal(data.explicitLedger.unmatched.some((row) => row.id === "repay"), false);
  assert.equal(data.explicitLedger.unmatched.some((row) => row.id === "ambiguous"), true);
  assert.equal(data.explicitLedger.previousMonthAdvances.totalOutstanding, 0);
});

test("September 2026 explicit ledger preserves the complete snapshot and independent debts", () => {
  // Literal snapshot amounts/dates; neutral titles stand in for undisclosed expense titles.
  const dated = (page, date, time) => ({
    ...page,
    object: "page",
    created_time: `${date}T${time}:00.000Z`,
    properties: { ...page.properties, "Ngày": { type: "date", date: { start: date, end: null, time_zone: null } } }
  });
  const expense = (id, title, category, account, amount, date, time) =>
    dated(namedExpenseRow(id, title, category, account, amount), date, time);
  const income = (id, title, category, account, amount, date, time) =>
    dated(cashflowIncomeRow(id, title, category, account, amount), date, time);
  const transfer = (id, title, amount, from, to, group, date, time) =>
    dated(transferRow(id, title, amount, from, to, group), date, time);
  const accounts = [
    ["cash", "Tiền Mặt", 2021000, 665000],
    ["bank", "Banking", 1670004, 0],
    ["grab-cash", "Grap Tiền Mặt", 0, 9000],
    ["momo", "Momo", 158706, 100000],
    ["fund", "Quỹ Momo", 706166, 247876]
  ].map(([id, name, opening, current]) => {
    const page = cashflowAccountRow(id, name, current);
    page.properties["Số Dư Ban Đầu"] = { type: "number", number: opening };
    return page;
  });
  const categories = [
    trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential"),
    trackedCategoryRow("market", "Đi Chợ", 1400000, "essential"),
    trackedCategoryRow("incidental", "Phát Sinh", 600000, "essential"),
    trackedCategoryRow("internet", "Internet", 180000, "essential"),
    trackedCategoryRow("misc", "Khác", 70000, "essential"),
    trackedCategoryRow("affiliate", "Affiilate", 600000, "education"),
    trackedCategoryRow("development", "Phát triển bản thân", 500000, "education"),
    cashflowCategoryRow("loan", "Loại Chi Phí", "Vay Và Trả"),
    cashflowCategoryRow("grap", "Loại Chi Phí", "Grap"),
    cashflowCategoryRow("other", "Loại Chi Phí", "Chi khác")
  ];
  const expenses = [
    expense("momo-opening", "Chi Momo đầu tháng", "other", "momo", 100000, "2026-09-01", "01:00"),
    expense("cash-01-95", "Chi tiền mặt", "other", "cash", 95000, "2026-09-01", "02:00"),
    expense("cash-01-17", "Chi tiền mặt", "other", "cash", 17000, "2026-09-01", "02:01"),
    expense("cash-01-25", "Chi tiền mặt", "other", "cash", 25000, "2026-09-01", "02:02"),
    expense("cash-01-140", "Chi tiền mặt", "other", "cash", 140000, "2026-09-01", "02:03"),
    expense("cash-02-35", "Chi tiền mặt", "other", "cash", 35000, "2026-09-02", "02:00"),
    expense("cash-02-500", "Chi tiền mặt", "other", "cash", 500000, "2026-09-02", "02:01"),
    expense("lend-tuan", "Cho cháu Tuấn mượn", "loan", "bank", 100000, "2026-09-03", "08:00"),
    expense("cash-06-364", "Chi tiền mặt", "other", "cash", 364000, "2026-09-06", "09:00"),
    expense("cash-06-10", "Chi tiền mặt", "other", "cash", 10000, "2026-09-06", "09:01"),
    expense("cash-06-170", "Chi tiền mặt", "other", "cash", 170000, "2026-09-06", "09:02"),
    expense("pay-to", "Trả tiền mượn tố tháng trước", "loan", "bank", 500000, "2026-09-07", "07:00"),
    expense("wallet-topup", "Mượn tiền nạp ví grap", "grap", "bank", 170000, "2026-09-07", "08:00"),
    expense("momo-current", "Chi Momo", "other", "momo", 108000, "2026-09-07", "09:00"),
    expense("grab-07-35", "Chi Grap tiền mặt", "other", "grab-cash", 35000, "2026-09-07", "10:00"),
    expense("grab-07-10", "Chi Grap tiền mặt", "other", "grab-cash", 10000, "2026-09-07", "10:01"),
    expense("grab-07-100", "Chi Grap tiền mặt", "other", "grab-cash", 100000, "2026-09-07", "10:02"),
    expense("grab-07-60", "Chi Grap tiền mặt", "other", "grab-cash", 60000, "2026-09-07", "10:03"),
    expense("grab-08-70", "Chi Grap tiền mặt", "other", "grab-cash", 70000, "2026-09-08", "09:00"),
    expense("grab-08-17", "Chi Grap tiền mặt", "other", "grab-cash", 17000, "2026-09-08", "09:01"),
    expense("grab-08-93", "Chi Grap tiền mặt", "other", "grab-cash", 93000, "2026-09-08", "09:02"),
    expense("rent-paid", "Tiền phòng tháng 9", "rent", "fund", 2017000, "2026-09-08", "10:00")
  ];
  const transfers = [
    transfer("rent-allocation", "Chuyển tiền vào quỹ Nhà Trọ", 1400004, "bank", "fund", "essential", "2026-09-01", "00:00"),
    transfer("savings-allocation", "Chuyển tiền vào quỹ tiết kiệm", 158706, "momo", "fund", "savings", "2026-09-01", "04:00"),
    transfer("borrow-750", "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", 750000, "fund", "fund", "essential", "2026-09-08", "05:00")
  ];
  const groups = [
    fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true),
    fundGroupRow("education", "Giáo dục phát triển", "fund", true),
    fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true),
    fundGroupRow("investment", "Đầu tư tài chính", "fund", true),
    fundGroupRow("enjoyment", "Hưởng thụ", "fund", true),
    fundGroupRow("giving", "Cho đi", "fund", true)
  ];
  const options = {
    sourceAccountNames: ["Tiền Mặt", "Banking", "Grap Tiền Mặt", "Momo"],
    rentReserveAmount: 2150000,
    rolloverFundNames: ["Tiết kiệm dài hạn", "Đầu tư tài chính", "Hưởng thụ", "Cho đi"],
    passThroughKeywords: ["code"],
    passThroughCategories: ["Vay Và Trả"],
    spendableSubFunds: ["sửa xe"],
    incomeRows: [income("grab-net", "Grap thu nhập ròng", "net-income", "momo", 286581, "2026-09-08", "08:00")],
    // Other-income category IDs are absent from expense categories, as in the repository.
    otherIncomeRows: [
      income("grab-qr", "Grab QR", "grab-receipt", "momo", 208000, "2026-09-01", "03:00"),
      income("grab-cash-income", "Grab tiền mặt", "grab-receipt", "grab-cash", 394000, "2026-09-01", "03:30"),
      income("borrow-em", "Em cho mượn tiền", "other-loan", "bank", 500000, "2026-09-06", "08:00"),
      income("tuan-return", "Cháu Tuấn trả nợ", "other-return", "momo", 100000, "2026-09-08", "07:00")
    ],
    historicalOtherIncomeRows: [
      income("to-opening", "Tố cho mượn tiền", "other-loan", "momo", 500000, "2026-08-14", "01:00")
    ]
  };
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 10 }, categories, expenses, accounts, 5500000, transfers, groups, options
  );
  assert.deepEqual(data.fundGroups.map((group) => group.name), [
    "Nhu cầu thiết yếu",
    "Giáo dục phát triển",
    "Tiết kiệm dài hạn",
    "Đầu tư tài chính",
    "Hưởng thụ",
    "Cho đi"
  ]);
  const ledger = data.explicitLedger;
  const essential = data.fundGroups.find((group) => group.name === "Nhu cầu thiết yếu");
  const savingsLoan = ledger.fundLoans.loans.find((loan) => loan.openedBy === "borrow-750");
  const bankAdvance = ledger.previousMonthAdvances.accounts.find((account) => account.accountName === "Banking");
  const cashAdvance = ledger.previousMonthAdvances.accounts.find((account) => account.accountName === "Tiền Mặt");
  const momoAdvance = ledger.previousMonthAdvances.accounts.find((account) => account.accountName === "Momo");
  const emLiability = ledger.personalLoans.liabilities.find((loan) => loan.party === "em");
  const toLiability = ledger.personalLoans.liabilities.find((loan) => loan.party === "tố");
  const tuanReceivable = ledger.personalLoans.receivables.find((loan) => loan.party === "cháu tuấn");

  assert.equal(ledger.rows.length, 30);
  assert.equal(data.openingPlan.sourceTotal, 3849710);
  assert.equal(data.openingPlan.rentReserve, 1400004);
  assert.equal(data.openingPlan.remainder, 2449706);
  assert.deepEqual(data.openingPlan.sourceAccounts.map((account) => account.name), ["Tiền Mặt", "Banking", "Grap Tiền Mặt", "Momo"]);
  assert.deepEqual(data.openingPlan.allocations, [
    { fund: "Tiết kiệm dài hạn", amount: 612428 },
    { fund: "Đầu tư tài chính", amount: 612426 },
    { fund: "Hưởng thụ", amount: 612426 },
    { fund: "Cho đi", amount: 612426 }
  ]);
  assert.equal(essential.budget, 4400000);
  assert.equal(essential.allocated, 2150004);
  assert.equal(essential.paidFromFund, 2017000);
  assert.equal(essential.fundRemaining, 133004);
  assert.equal(
    essential.transferPlan.find((entry) => entry.name === "Nhà Trọ"),
    undefined
  );
  const rentChild = essential.children.find((child) => child.name === "Nhà Trọ");
  assert.equal(rentChild.allocated, 2150004);
  assert.equal(rentChild.fundRemaining, 133004);
  assert.equal(rentChild.transferNeeded, 0);
  assert.equal(savingsLoan.lender, "Tiết kiệm dài hạn");
  assert.equal(savingsLoan.principal, 750000);
  assert.equal(savingsLoan.repaid, 0);
  assert.equal(savingsLoan.outstanding, 750000);
  assert.equal(bankAdvance.principal, 270000);
  assert.equal(bankAdvance.repaid, 100000);
  assert.equal(bankAdvance.outstanding, 170000);
  assert.equal(cashAdvance.principal, 1356000);
  assert.equal(cashAdvance.repaid, 0);
  assert.equal(cashAdvance.outstanding, 1356000);
  assert.deepEqual(cashAdvance.rows.map((row) => row.amount), [95000, 17000, 25000, 140000, 35000, 500000, 364000, 10000, 170000]);
  assert.equal(momoAdvance.principal, 100000);
  assert.equal(momoAdvance.repaid, 0);
  assert.equal(momoAdvance.outstanding, 100000);
  assert.equal(ledger.previousMonthAdvances.totalOutstanding, 1626000);
  assert.equal(ledger.previousMonthAdvances.accounts.find((account) => account.accountName === "Grap Tiền Mặt").outstanding, 0);
  assert.equal(emLiability.outstanding, 500000);
  assert.equal(emLiability.repaid, 0);
  assert.deepEqual(emLiability.repaymentRows, []);
  assert.equal(toLiability.outstanding, 0);
  assert.deepEqual(toLiability.repaymentRows, ["pay-to"]);
  assert.equal(tuanReceivable.principal, 100000);
  assert.equal(tuanReceivable.repaid, 100000);
  assert.equal(tuanReceivable.outstanding, 0);
  assert.equal(tuanReceivable.sourceAccountId, "bank");
  assert.deepEqual(tuanReceivable.repaymentRows, ["tuan-return"]);
  assert.equal(ledger.rows.find((row) => row.id === "tuan-return").accountId, "momo");
  assert.deepEqual(ledger.personalLoans.repayments.map((row) => [row.id, row.party, row.amount]), [
    ["pay-to", "tố", 500000], ["tuan-return", "cháu tuấn", 100000]
  ]);
  assert.deepEqual(ledger.dataIssues, []);
  assert.deepEqual(data.income, { real: 286581, grabGross: 602000, other: 600000 });
  assert.equal(data.cashOutflowTotal, 4736000);
  assert.equal(data.personalSpendingTotal, 3966000);
  assert.deepEqual(data.loanFlow, { total: 600000, lent: 100000, repaid: 500000, other: 0 });

  // Current balances cannot alter the opening baseline or repay any ledger.
  const changedBalances = accounts.map((page) => ({
    ...page, properties: { ...page.properties, "Số Dư Hiện Tại": { formula: { type: "number", number: 9999999 } } }
  }));
  const withChangedBalances = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 10 }, categories, expenses, changedBalances, 5500000, transfers, groups, options
  );
  assert.deepEqual(withChangedBalances.explicitLedger, ledger);
  const text = fundBudgetText_(data);
  assert.match(text, /Nhà Trọ: 2\.017\.000đ \/ 2\.150\.000đ/);
  assert.match(text, /Nhu cầu thiết yếu:[^\n]*quỹ còn 133\.004đ/);
  assert.match(text, /Tiết kiệm dài hạn: 158\.706đ \/ 612\.428đ/);
  assert.match(text, /Đầu tư tài chính: 0đ \/ 612\.426đ/);
  assert.match(text, /Hưởng thụ: 0đ \/ 612\.426đ/);
  assert.match(text, /Cho đi: 0đ \/ 612\.426đ/);
  assert.doesNotMatch(text, /Tiết kiệm dài hạn:[^\n]*(?:đã cấp|quỹ còn|· còn)/);
  assert.doesNotMatch(text, /Nhu cầu thiết yếu:[^\n]*đã cấp 2\.150\.004đ/);
  assert.doesNotMatch(text, /Nhu cầu thiết yếu:[^\n]*còn nợ/);
  assert.doesNotMatch(text, /↳ đã cấp/);
  assert.match(
    text,
    /Nhà Trọ: 2\.017\.000đ \/ 2\.150\.000đ · quỹ còn 133\.004đ · còn nợ Quỹ Tiết kiệm dài hạn 750\.000đ/
  );
  assert.doesNotMatch(text, /TIỀN DƯ THÁNG TRƯỚC|4 nguồn:|Ba lọ 10%:/);
  assert.doesNotMatch(text, /🤝 NỢ GHI RÕ|Nhu cầu thiết yếu mượn|Đã trả:|Nợ Em:/);
  assert.match(text, /Tiền Mặt: cần cấp bù 1\.356\.000đ/);
  assert.match(text, /Banking: cần cấp bù 170\.000đ/);
  assert.match(text, /Momo: cần cấp bù 100\.000đ/);
  assert.doesNotMatch(text, /CHƯA ĐỦ DỮ KIỆN|Tố|26\.000đ/);
  assert.doesNotMatch(text, /616\.996đ|đã trả:? 109\.000đ|có nguồn để trả/i);
});

test("fund budget omits the repeated debt section while keeping advance warnings", () => {
  const text = fundBudgetText_({
    t: { y: 2026, m: 9, d: 10 },
    fundGroups: [{
      name: "Nhu cầu thiết yếu",
      budget: 2330000,
      spent: 2017000,
      over: 0,
      allocated: 2150004,
      fundRemaining: 133004,
      requiresAllocation: true,
      transferNeeded: 0,
      unmatchedCategories: [],
      children: [
        { name: "Nhà Trọ", budget: 2150000, spent: 2017000, over: 0 },
        { name: "Internet", budget: 180000, spent: 0, over: 0 }
      ]
    }],
    openingPlan: {
      sourceTotal: 3849710,
      rentReserve: 2150000,
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
    },
    explicitLedger: {
      fundLoans: { loans: [{
        borrowerGroupId: "essential",
        borrowerGroupName: "Nhu cầu thiết yếu",
        lender: "Tiết kiệm dài hạn",
        principal: 750000,
        repaid: 0,
        outstanding: 750000,
        openedBy: "borrow-750",
        repaymentRows: []
      }] },
      personalLoans: { receivables: [], liabilities: [{
        party: "em",
        principal: 500000,
        repaid: 0,
        outstanding: 500000,
        openedBy: "borrow-em",
        repaymentRows: []
      }], repayments: [], unmatched: [] },
      previousMonthAdvances: {
        totalOutstanding: 1626000,
        accounts: [
          { accountName: "Tiền Mặt", principal: 1356000, repaid: 0, outstanding: 1356000 },
          { accountName: "Banking", principal: 270000, repaid: 100000, outstanding: 170000 },
          { accountName: "Momo", principal: 100000, repaid: 0, outstanding: 100000 }
        ],
        unmatchedSources: []
      },
      unmatched: []
    }
  });

  assert.match(text, /Nhà Trọ: 2\.017\.000đ \/ 2\.150\.000đ/);
  assert.match(text, /quỹ còn 133\.004đ/);
  assert.doesNotMatch(text, /TIỀN DƯ THÁNG TRƯỚC|4 nguồn:|Ba lọ 10%:/);
  assert.doesNotMatch(text, /🤝 NỢ GHI RÕ|Nhu cầu thiết yếu mượn|Đã trả:|Nợ Em:/);
  assert.match(text, /Tiền Mặt: cần cấp bù 1\.356\.000đ/);
  assert.match(text, /Banking: cần cấp bù 170\.000đ/);
  assert.match(text, /Momo: cần cấp bù 100\.000đ/);
  assert.doesNotMatch(text, /616\.996đ/);
  assert.doesNotMatch(text, /đã trả 109\.000đ|có nguồn để trả/);
});

test("renders only approved current-row data issues", () => {
  const text = fundBudgetText_({
    t: { y: 2026, m: 9, d: 15 },
    fundGroups: [],
    explicitLedger: {
      previousMonthAdvances: { accounts: [] },
      unmatched: [{
        id: "legacy-warning",
        date: "2026-09-01",
        title: "Synthetic legacy warning",
        amount: 26000,
        reason: "source-funding-shortfall"
      }],
      dataIssues: [
        {
          type: "missing_required_data",
          rowId: "dinner",
          date: "2026-09-09",
          createdTime: "2026-09-09T01:00:00.000Z",
          title: "Ăn tối",
          amount: 35000,
          details: ["Loại Chi Phí"]
        },
        {
          type: "history_not_found",
          rowId: "refund",
          date: "2026-09-12",
          createdTime: "2026-09-12T01:00:00.000Z",
          title: "Hoàn lại Banking",
          amount: 100000,
          details: ["Không tìm thấy bản ghi gốc liên quan"]
        },
        {
          type: "conflicting_data",
          rowId: "fund-transfer",
          date: "2026-09-15",
          createdTime: "2026-09-15T01:00:00.000Z",
          title: "Chuyển quỹ",
          amount: 500000,
          details: ["ghi chú: Banking; tài khoản: Momo"]
        }
      ]
    }
  });

  assert.equal(text,
    "📦 QUỸ & NGÂN SÁCH — tháng 9/2026\n" +
      "\n" +
      "⚠️ CHƯA ĐỦ DỮ KIỆN\n" +
      "• 09/09 — Ăn tối — 35.000đ · thiếu Loại Chi Phí\n" +
      "• 12/09 — Hoàn lại Banking — 100.000đ · không tìm thấy bản ghi gốc liên quan\n" +
      "• 15/09 — Chuyển quỹ — 500.000đ · ghi chú: Banking; tài khoản: Momo"
  );
  assert.doesNotMatch(text, /26\.000đ|trả vượt|source-funding-shortfall|⚠️ thiếu loại chi/);
});

test("does not duplicate missing category in budget lines", () => {
  const text = fundBudgetText_({
    t: { y: 2026, m: 9, d: 9 },
    fundGroups: [{
      name: "Chưa Ghép",
      budget: 100000,
      spent: 25000,
      over: 0,
      allocated: 0,
      transferNeeded: 0,
      requiresAllocation: false,
      unmatchedCategories: ["missing-category"]
    }],
    explicitLedger: {
      previousMonthAdvances: { accounts: [] },
      dataIssues: [{
        type: "missing_required_data",
        rowId: "unclassified",
        date: "2026-09-09",
        createdTime: "2026-09-09T01:00:00.000Z",
        title: "Chi chưa phân loại",
        amount: 25000,
        details: ["Loại Chi Phí"]
      }]
    }
  });

  assert.match(text, /• 09\/09 — Chi chưa phân loại — 25\.000đ · thiếu Loại Chi Phí/);
  assert.doesNotMatch(text, /⚠️ thiếu loại chi/);
});

test("fund budget renders missing personal data without changing debt totals", () => {
  const fundLoan = {
    borrowerGroupName: "Nhu cầu thiết yếu",
    lender: "Tiết kiệm dài hạn",
    principal: 750000,
    repaid: 0,
    outstanding: 750000
  };
  const personalLiability = { party: "em", principal: 500000, repaid: 0, outstanding: 500000 };
  const text = fundBudgetText_({
    t: { y: 2026, m: 9, d: 10 },
    fundGroups: [],
    explicitLedger: {
      fundLoans: { loans: [fundLoan] },
      personalLoans: { liabilities: [personalLiability] },
      previousMonthAdvances: { accounts: [] },
      dataIssues: [{
        type: "missing_required_data",
        rowId: "ambiguous",
        date: "2026-09-10",
        createdTime: "2026-09-10T01:00:00.000Z",
        title: "Em cho mượn tiền và Tố trả nợ",
        amount: 500000,
        details: ["Người liên quan"]
      }]
    }
  });

  assert.match(text, /⚠️ CHƯA ĐỦ DỮ KIỆN/);
  assert.match(text, /10\/09 — Em cho mượn tiền và Tố trả nợ — 500\.000đ · thiếu Người liên quan/);
  assert.doesNotMatch(text, /🤝 NỢ GHI RÕ|Còn nợ:|Nợ Em:/);
  assert.equal(fundLoan.outstanding, 750000);
  assert.equal(personalLiability.outstanding, 500000);
  assert.doesNotMatch(text, /Đã trả: 500\.000đ|Còn nợ: 250\.000đ/);
});

test("fund budget never presents a computed source shortfall as a Notion transaction", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 9 },
    [],
    [namedExpenseRow("dinner", "Ăn tối", "food", "grab-cash", 35000)],
    [cashflowAccountRow("grab-cash", "Grap Tiền Mặt")],
    5500000,
    [],
    [],
    {
      sourceAccountNames: ["Grap Tiền Mặt"],
      rentReserveAmount: 0,
      otherIncomeRows: [cashflowIncomeRow("available-cash", "Grap tiền mặt", "grab", "grab-cash", 9000)]
    }
  );

  assert.equal(data.explicitLedger.unmatched.some((row) => row.id === "dinner" || row.reason === "source-funding-shortfall"), false);
  const text = fundBudgetText_(data);
  assert.doesNotMatch(text, /Ăn tối|26\.000đ|CHƯA ĐỦ DỮ KIỆN/);
});

test("fund budget uses the original Notion amount for a displayed data issue", () => {
  const text = fundBudgetText_({
    t: { y: 2026, m: 9, d: 9 },
    fundGroups: [],
    explicitLedger: {
      previousMonthAdvances: { accounts: [] },
      dataIssues: [{
        type: "history_not_found",
        rowId: "unresolved-repayment",
        date: "2026-09-09",
        createdTime: "2026-09-09T01:00:00.000Z",
        title: "Trả tiền mượn",
        amount: 500000,
        details: ["Không tìm thấy bản ghi gốc liên quan"]
      }]
    }
  });

  assert.match(text, /09\/09 — Trả tiền mượn — 500\.000đ · không tìm thấy bản ghi gốc liên quan/);
  assert.doesNotMatch(text, /100\.000đ/);
});

test("spending notes name the fund that was borrowed from", () => {
  const noted = (id, name, categoryId, accountId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-02" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 22 },
    [
      trackedCategoryRow("affiliate", "Affiilate", 500000, "youtube-fund"),
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential-fund"),
      trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund")
    ],
    [
      noted("claude", "Claude pro ( lấy từ quỹ tích lũy)", "affiliate", "fund", 554444),
      noted("tyre", "Thay nhớt ( lấy từ quxy sửa xe )", "affiliate", "fund", 150000),
      noted("wifi", "Wifi ( lấy từ quỹ thiết yếu )", "rent", "fund", 176400),
      noted("coffee", "Mua bạc xỉu ( tính vào quỹ phát sinh )", "incidental", "cash", 15000)
    ],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("cash", "Grap Tiền Mặt")],
    5500000,
    [transferRow("essential", "Cấp quỹ thiết yếu", 2150000, "cash", "fund", "essential-fund")],
    [
      fundGroupRow("youtube-fund", "Làm YouTube", "fund", true),
      fundGroupRow("essential-fund", "Thiết Yếu", "fund", true),
      fundGroupRow("incidental-fund", "Phát Sinh", "fund", true)
    ]
  );

  const youtube = data.fundGroups.find((group) => group.name === "Làm YouTube");
  const essential = data.fundGroups.find((group) => group.name === "Thiết Yếu");
  const incidental = data.fundGroups.find((group) => group.name === "Phát Sinh");

  // "lấy từ quỹ X" là mượn, và lỗi gõ "quxy" vẫn về đúng tên quỹ.
  assert.deepEqual(
    youtube.borrowedFunds.map((entry) => ({ fund: entry.fund, amount: entry.amount })),
    [
      { fund: "quỹ tích lũy", amount: 554444 },
      { fund: "quỹ sửa xe", amount: 150000 }
    ]
  );
  // Moi mon no phai chi ra duoc no den tu giao dich nao.
  assert.deepEqual(youtube.borrowedFunds[0].rows, [
    {
      name: "Claude pro ( lấy từ quỹ tích lũy)",
      amount: 554444,
      date: "2026-08-02",
      partial: false
    }
  ]);
  // Đã ghi rõ mượn quỹ khác thì không tính là tiêu tiền của quỹ giữ.
  assert.equal(youtube.paidFromFund, 0);
  assert.equal(youtube.fundDebt, 0);

  // Ghi chú trỏ về chính nhóm đó thì không phải mượn.
  assert.deepEqual(essential.borrowedFunds, []);
  assert.equal(essential.paidFromFund, 176400);

  // "tính vào" chỉ là phân loại ngân sách, không phải mượn.
  assert.deepEqual(incidental.borrowedFunds, []);
  // Tra bang Grap Tien Mat khong sinh mon no: do la tien cua chinh minh.
  assert.deepEqual(incidental.borrowedFunds, []);

  const text = fundBudgetText_(data);
  assert.match(
    text,
    /Làm YouTube:[^\n]*còn nợ quỹ tích lũy 554\.444đ, còn nợ quỹ sửa xe 150\.000đ/
  );
  assert.doesNotMatch(text, /🤝 NỢ GHI RÕ/);
  assert.doesNotMatch(text, /quxy/);
});

test("a spending note assigns the expense to that fund even from another category", () => {
  const noted = (id, name, categoryId, accountId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-12" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });
  const looseCategoryRow = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 22 },
    [
      trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund"),
      looseCategoryRow("cafe", "Cà Phê"),
      looseCategoryRow("grocery", "Tạp Hóa")
    ],
    [
      noted("own", "Mua thùng mì tôm", "incidental", "cash", 109000),
      // Loại Chi Phí là Cà Phê / Tạp Hóa, hoàn toàn ngoài nhóm quỹ, nhưng ghi chú
      // nói rõ tính vào quỹ phát sinh nên vẫn phải đắp vào ngân sách đó.
      noted("coffee", "Mua bạc xỉu ( tính vào quỹ phát sinh )", "cafe", "cash", 15000),
      noted("water", "Đổi bình nước 20L ( tính vào quỹ phát sinh )", "grocery", "cash", 20000),
      noted("shopee", "Đơn hàng shoppe ( mua đồ cho em )", "grocery", "momo", 277000,
        "Tính vào quỹ phát sinh")
    ],
    [
      cashflowAccountRow("fund", "Quỹ Momo"),
      cashflowAccountRow("cash", "Grap Tiền Mặt"),
      cashflowAccountRow("momo", "Momo")
    ],
    5500000,
    [],
    [fundGroupRow("incidental-fund", "Phát Sinh", "fund", true)]
  );

  const incidental = data.fundGroups[0];
  // 109.000 của chính loại Phát Sinh, cộng 312.000 được ghi chú kéo về từ Cà Phê
  // và Tạp Hóa — những loại vốn nằm ngoài mọi nhóm quỹ.
  assert.equal(incidental.spent, 421000);
  assert.equal(incidental.over, 0);
  assert.deepEqual(incidental.borrowedFunds, []);
  // 421.000 tieu bang tui khac coi nhu da cap; con 179.000 ngan sach chua dung toi.
  assert.equal(incidental.transferNeeded, 179000);

  const text = fundBudgetText_(data);
  // Quy chua duoc cap dong nao nen khong khoe "con 179.000" — do la ngan sach,
  // khong phai tien dang nam trong tai khoan giu quy.
  assert.match(text, /✅ Phát Sinh: 421\.000đ \/ 600\.000đ · chưa cấp\n/);
  assert.doesNotMatch(text, /quỹ còn/);
  // Ghi chu "tinh vao quy phat sinh" chi doi ngan sach, khong phai muon quy khac.
  assert.doesNotMatch(text, /→ quỹ /);
  assert.doesNotMatch(text, /ỨNG TRƯỚC/);
});

test("a group only reports as spare the money actually sitting in its fund", () => {
  const paid = (id, name, categoryId, amount, date) => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: date } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "fund" }] }
    }
  });
  // Thiết Yếu 2.400.000 = Nhà Trọ 2.150.000 + Internet 180.000 + Cắt Tóc 70.000.
  // Đã cấp tiền trọ và wifi vào Quỹ Momo rồi tiêu hết 2.298.400 từ chính quỹ đó.
  // Riêng 70.000 cắt tóc thì chưa cấp, mà cũng chưa cắt.
  const build = (transfers) => buildAccountSpendingData_(
    { y: 2026, m: 8, d: 25 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential-fund"),
      trackedCategoryRow("net", "Internet", 180000, "essential-fund"),
      trackedCategoryRow("hair", "Cắt Tóc", 70000, "essential-fund")
    ],
    [
      paid("rent-aug", "Tiền phòng và tiền điện nước", "rent", 2122000, "2026-08-01"),
      paid("net-aug", "Thanh toán tiền wifi ở nhà", "net", 176400, "2026-08-18")
    ],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("momo", "Momo")],
    5500000,
    transfers,
    [fundGroupRow("essential-fund", "Thiết Yếu", "fund", true)]
  );

  const supplied = [
    transferRow("cap-tro", "Tiền phòng tháng này", 2150000, "momo", "fund", "essential-fund"),
    transferRow("cap-net", "Tiền wifi", 180000, "momo", "fund", "essential-fund")
  ];

  const before = build(supplied);
  assert.equal(before.fundGroups[0].allocated, 2330000);
  assert.equal(before.fundGroups[0].spent, 2298400);
  assert.equal(before.fundGroups[0].fundRemaining, 31600);
  assert.equal(before.fundGroups[0].transferNeeded, 70000);

  const beforeText = fundBudgetText_(before);
  // Chua cap 70.000 thi khong duoc khoe "con 101.600" — trong quy chi co 31.600 that.
  assert.match(beforeText, /✅ Thiết Yếu:[^\n]*quỹ còn 31\.600đ/);
  assert.match(beforeText, /Nhà Trọ:[^\n]*quỹ còn 28\.000đ/);
  assert.match(beforeText, /Internet:[^\n]*quỹ còn 3\.600đ/);
  assert.doesNotMatch(beforeText, /Nhà Trọ:[^\n]*đã cấp/);
  assert.doesNotMatch(beforeText, /Internet:[^\n]*đã cấp/);
  assert.doesNotMatch(beforeText, /Thiết Yếu:[^\n]*đã cấp 2\.330\.000đ/);
  assert.doesNotMatch(beforeText, /↳ đã cấp/);
  assert.match(beforeText, /• Thiết Yếu → Quỹ Momo: 70\.000đ/);
  assert.doesNotMatch(beforeText, /101\.600đ · quỹ/);

  // Cấp nốt 70.000 vào đúng nhãn Cắt Tóc thì không còn yêu cầu cấp thêm.
  const afterText = fundBudgetText_(build(supplied.concat([
    transferRow("cap-toc", "Tiền cắt tóc", 70000, "momo", "fund", "essential-fund")
  ])));
  assert.match(afterText, /Cắt Tóc: 0đ \/ 70\.000đ/);
  assert.doesNotMatch(afterText, /Cắt Tóc:[^\n]*đã cấp/);
  assert.doesNotMatch(afterText, /Thiết Yếu:[^\n]*đã cấp 2\.400\.000đ/);
  assert.doesNotMatch(afterText, /↳ đã cấp/);
  assert.doesNotMatch(afterText, /CẦN CẤP THÊM/);
});

test("historical child aliases allocate funding across every multi-child group before current spending", () => {
  const model = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 16 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 100000, "essential"),
      trackedCategoryRow("internet", "Internet", 180000, "essential"),
      trackedCategoryRow("affiliate", "Affiilate", 600000, "education"),
      trackedCategoryRow("self", "Phát triển bản thân", 500000, "education")
    ],
    [],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("momo", "Momo")],
    5500000,
    [
      transferRow("cap-wifi", "Tiền wifi ở nhà", 180000, "momo", "fund", "essential"),
      transferRow("cap-course", "Tiền mua khóa học", 500000, "momo", "fund", "education")
    ],
    [
      fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true),
      fundGroupRow("education", "Giáo dục phát triển", "fund", true)
    ],
    {
      historicalExpenseRows: [
        namedExpenseRow("old-wifi", "Thanh toán tiền wifi ở nhà", "internet", "fund", 176400),
        namedExpenseRow("old-course", "Thanh toán", "self", "fund", 450000, "Mua khóa học chỉnh sửa video")
      ]
    }
  );

  const essential = model.fundGroups.find((group) => group.name === "Nhu cầu thiết yếu");
  const education = model.fundGroups.find((group) => group.name === "Giáo dục phát triển");
  const internet = essential.children.find((child) => child.name === "Internet");
  assert.equal(essential.allocated, 180000);
  assert.equal(essential.transferNeeded, 100000);
  assert.deepEqual(essential.transferPlan, [{ name: "Nhà Trọ", amount: 100000 }]);
  assert.equal(internet.allocated, 180000);
  assert.equal(internet.fundRemaining, 180000);
  assert.equal(internet.transferNeeded, 0);
  assert.equal(education.allocated, 500000);
  assert.equal(education.transferNeeded, 600000);
  assert.deepEqual(education.transferPlan, [{ name: "Affiilate", amount: 600000 }]);
  const text = fundBudgetText_(model);
  assert.match(text, /Internet: 0đ \/ 180\.000đ/);
  assert.doesNotMatch(text, /Internet:[^\n]*đã cấp/);
  assert.doesNotMatch(text, /Internet:[^\n]*quỹ còn 180\.000đ/);
  assert.doesNotMatch(text, /Internet: 180\.000đ|Phát triển bản thân: 500\.000đ/);
});

test("unassigned group funding covers the only child already spending from the shared fund", () => {
  const model = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 17 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential"),
      trackedCategoryRow("internet", "Internet", 180000, "essential"),
      trackedCategoryRow("incidental", "Phát Sinh", 600000, "essential")
    ],
    [namedExpenseRow("rent-paid", "Tiền phòng tháng 9", "rent", "fund", 2017000)],
    [
      cashflowAccountRow("fund", "Quỹ Momo"),
      cashflowAccountRow("bank", "Banking"),
      cashflowAccountRow("momo", "Momo")
    ],
    5500000,
    [
      transferRow("rent-group-funding", "Cấp quỹ thiết yếu", 1400004, "bank", "fund", "essential"),
      transferRow("internet-funding", "Internet", 180000, "momo", "fund", "essential"),
      transferRow(
        "rent-loan",
        "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu",
        750000,
        "fund",
        "fund",
        "essential"
      )
    ],
    [
      fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true),
      fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true)
    ]
  );

  const essential = model.fundGroups.find((group) => group.name === "Nhu cầu thiết yếu");
  const rent = essential.children.find((child) => child.name === "Nhà Trọ");
  assert.equal(rent.allocated, 2150004);
  assert.equal(rent.fundRemaining, 133004);
  assert.equal(rent.transferNeeded, 0);
  assert.deepEqual(essential.transferPlan, [{ name: "Phát Sinh", amount: 600000 }]);
  assert.equal(
    model.explicitLedger.dataIssues.some((issue) => issue.rowId === "rent-group-funding"),
    false
  );
  assert.doesNotMatch(fundBudgetText_(model), /Nhà Trọ: 133\.000đ/);
});

test("unresolved child allocation stays at group level without fabricating a funded label", () => {
  const model = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 16 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential"),
      trackedCategoryRow("internet", "Internet", 180000, "essential")
    ],
    [],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("momo", "Momo")],
    5500000,
    [transferRow("generic-funding", "Cấp quỹ thiết yếu", 180000, "momo", "fund", "essential")],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true)]
  );

  const essential = model.fundGroups[0];
  assert.equal(essential.allocated, 180000);
  assert.equal(essential.transferNeeded, 2330000);
  assert.deepEqual(essential.transferPlan, [
    { name: "Nhà Trọ", amount: 2150000 },
    { name: "Internet", amount: 180000 }
  ]);
  assert.deepEqual(
    model.explicitLedger.dataIssues.find((issue) => issue.rowId === "generic-funding")?.details,
    ["Nhãn quỹ con"]
  );
  const text = fundBudgetText_(model);
  assert.match(text, /CHƯA ĐỦ DỮ KIỆN/);
  assert.match(text, /Cấp quỹ thiết yếu[^\n]*thiếu Nhãn quỹ con/);
  assert.match(text, /Internet: 180\.000đ/);
});

test("a child paid directly outside its fund is covered and names the source", () => {
  const expense = (id, name, categoryId, accountId, amount) => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-09-08" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });
  const receipt = cashflowIncomeRow("grab-receipt", "Grap tiền mặt", "grab-receipt", "grab-cash", 70000);
  receipt.properties["Ngày"] = { date: { start: "2026-09-01" } };
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 11 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential"),
      trackedCategoryRow("hair", "Cắt Tóc", 70000, "essential")
    ],
    [
      expense("rent-fund", "Tiền phòng", "rent", "fund", 2017000),
      expense("hair-cash", "Cắt tóc", "hair", "grab-cash", 70000)
    ],
    [
      cashflowAccountRow("fund", "Quỹ Momo"),
      cashflowAccountRow("grab-cash", "Grap Tiền Mặt")
    ],
    5500000,
    [transferRow("fund-rent", "Cấp tiền phòng", 2150000, "momo", "fund", "essential")],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true)],
    {
      sourceAccountNames: ["Grap Tiền Mặt"],
      otherIncomeRows: [receipt]
    }
  );

  const essential = data.fundGroups[0];
  assert.equal(essential.paidOutsideFund, 70000);
  assert.equal(essential.transferNeeded, 0);
  assert.match(
    fundBudgetText_(data),
    /• Cắt Tóc: 70\.000đ \/ 70\.000đ · đã chi từ Grap Tiền Mặt: 70\.000đ/
  );
});

test("a fund name only counts when it is written out in full after the word quy", () => {
  const noted = (id, name, categoryId, accountId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-09" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });
  const loose = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });
  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 25 },
    [
      trackedCategoryRow("market", "Đi Chợ", 1400000, "market-fund"),
      loose("parking", "Phí Gửi Xe"),
      loose("danang", "Đà Nẵng")
    ],
    [
      noted("m1", "Đi chợ", "market", "cash", 60000),
      // "đi chợ" nằm trong tiêu đề nhưng không đứng sau chữ "quỹ" — đây là phí gửi xe.
      noted("p1", "Gửi xe đi chợ", "parking", "cash", 2000),
      // "quỹ đi chơi với em" bắt đầu bằng "quỹ đi chơ..." nhưng không phải "quỹ Đi Chợ".
      noted("d1", "Mua hoa tặng em", "danang", "cash", 220000, "( lấy từ quỹ đi chơi với em )")
    ],
    [cashflowAccountRow("cash", "Grap Tiền Mặt")],
    5500000,
    [],
    [fundGroupRow("market-fund", "Đi Chợ", "cash", false)]
  );

  assert.equal(data.fundGroups[0].spent, 60000);
  const text = fundBudgetText_(data);
  assert.match(text, /✅ Đi Chợ: 60\.000đ \/ 1\.400\.000đ/);
  // Bao cao quy khong con liet ke chi tieu ngoai lo — do la viec cua nut Dong tien.
  assert.equal(data.monthlyBudget.looseByCategory.find((e) => e.category === "Phí Gửi Xe").amount, 2000);
  // Khong bi keo vao lo Đi Chợ, va cung khong tinh la chi tieu: "quỹ đi chơi với em"
  // la tien de danh tu truoc, khong phai tien kiem duoc thang nay.
  assert.doesNotMatch(text, /Đà Nẵng/);
  assert.equal(data.excluded.total, 220000);
});

test("a jar keeps its children visible and honours old names in notes", () => {
  const groupRow = (id, name, oldNames, accountId) => ({
    id,
    properties: {
      "Tên Nhóm Quỹ": { title: [{ plain_text: name }] },
      "Tên Cũ": { rich_text: oldNames ? [{ plain_text: oldNames }] : [] },
      "Tài Khoản Giữ Quỹ": { relation: [{ id: accountId }] },
      "Bắt Buộc Cấp Quỹ": { checkbox: true }
    }
  });
  const child = (id, name, budget, groupId, needsFund) => {
    const row = trackedCategoryRow(id, name, budget, groupId);
    if (needsFund === false) {
      row.properties["Chi Thẳng Không Qua Quỹ"] = { checkbox: true };
    }
    return row;
  };
  const loose = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });
  const noted = (id, name, categoryId, accountId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-12" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 25 },
    [
      child("rent", "Nhà Trọ", 2150000, "nec"),
      child("market", "Đi Chợ", 1400000, "nec", false),
      child("incidental", "Phát Sinh", 600000, "nec"),
      loose("cafe", "Cà Phê")
    ],
    [
      noted("rent-aug", "Tiền phòng", "rent", "fund", 2122000),
      // Ghi chu dung TEN CU cua lo -> khong phai muon quy khac, van la tien cua lo.
      noted("wifi", "Wifi ( lấy từ quỹ thiết yếu )", "rent", "fund", 8000),
      noted("market-aug", "Đi chợ", "market", "cash", 669000),
      // "quỹ phát sinh" la ten NHAN CON -> phai ghi dung vao dong con do.
      noted("cafe-aug", "Mua bạc xỉu ( tính vào quỹ phát sinh )", "cafe", "cash", 45000)
    ],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("cash", "Grap Tiền Mặt")],
    5500000,
    [transferRow("cap", "Cấp quỹ", 2200000, "cash", "fund", "nec")],
    [groupRow("nec", "Nhu cầu thiết yếu", "Thiết Yếu, Phát Sinh", "fund")],
  );

  const nec = data.fundGroups[0];
  assert.equal(nec.budget, 4150000);
  assert.equal(nec.spent, 2844000);
  // Ten cu "thiết yếu" tro ve chinh lo nay nen khong sinh mon no.
  assert.deepEqual(nec.borrowedFunds, []);
  assert.equal(nec.paidFromFund, 2130000);
  // 45.000 Cà Phê phai nam o dong con Phát Sinh, khong bi gom chung vao lo.
  assert.deepEqual(nec.children.map(({ name, budget, spent, over }) => ({ name, budget, spent, over })), [
    { name: "Nhà Trọ", budget: 2150000, spent: 2130000, over: 0 },
    { name: "Đi Chợ", budget: 1400000, spent: 669000, over: 0 },
    { name: "Phát Sinh", budget: 600000, spent: 45000, over: 0 }
  ]);
  // Đi Chợ tick "Chi Thẳng Không Qua Quỹ" nen 731.000 chua tieu khong bi doi cap.
  // Ghi chú "Cấp quỹ" không nói 70.000đ còn lại thuộc nhãn nào, nên không
  // tự lấy số dư chung bù cho Phát Sinh hay Nhà Trọ.
  assert.equal(nec.fundBalance, 70000);
  assert.equal(nec.transferNeeded, 575000);
  assert.deepEqual(nec.transferPlan, [
    { name: "Phát Sinh", amount: 555000 }, { name: "Nhà Trọ", amount: 20000 }
  ]);

  const text = fundBudgetText_(data);
  assert.match(text, /✅ Nhu cầu thiết yếu: 2\.844\.000đ \/ 4\.150\.000đ · quỹ còn 70\.000đ/);
  assert.match(text, /   • Nhà Trọ: 2\.130\.000đ \/ 2\.150\.000đ/);
  assert.doesNotMatch(text, /Đi Chợ:[^\n]*đã chi từ/);
  assert.match(text, /   • Phát Sinh: 45\.000đ \/ 600\.000đ/);
  assert.doesNotMatch(text, /Phát Sinh:[^\n]*đã chi từ Grap Tiền Mặt: 45\.000đ/);
  assert.doesNotMatch(text, /ỨNG TRƯỚC/);
});

test("a code advance is pass-through money, excluded at any size", () => {
  const noted = (id, name, categoryId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-12" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "cash" }] }
    }
  });
  const loose = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 25 },
    [loose("grap", "Grap"), loose("market", "Siêu Thị"), loose("loan", "Vay Và Trả")],
    [
      // Tien ung mua ho khach phai loai du so tien lon hay nho.
      noted("advance", "Nạp ví grap ( trừ tiền ứng code )", "grap", 120000),
      // Ghi chu o cot Ghi Chu cung tinh.
      noted("advance2", "Nạp ví grap", "grap", 80000, "ứng code đơn hàng"),
      noted("fuel", "Đổ xăng", "grap", 60000),
      // Nap vi Grab la tien that ra khoi vi de chay xe -> van la chi tieu.
      noted("wallet", "Nạp tiền ví grap", "grap", 175000),
      // "trứng" co chua chuoi "ứng" — khong duoc nham thanh tien ung code.
      noted("eggs", "Đi chợ", "market", 29000, "1 vỉ trứng gà"),
      // Cho muon roi doi lai: tien di roi ve, khong phai tieu mat.
      noted("loan", "Cho Tuấn mượn", "loan", 150000)
    ],
    [cashflowAccountRow("cash", "Grap Tiền Mặt")],
    5500000,
    [],
    [],
    {
      passThroughKeywords: ["code"],
      passThroughCategories: ["Vay Và Trả"]
    }
  );

  assert.equal(data.excluded.total, 350000);
  assert.deepEqual(
    data.excluded.rows.map((row) => row.amount).sort((a, b) => b - a),
    [150000, 120000, 80000]
  );
  // Đổ xăng, nap vi Grab va vi trung ga deu la chi tieu that.
  assert.equal(data.monthlyBudget.looseSpending, 264000);
  assert.deepEqual(
    data.monthlyBudget.looseByCategory,
    [{ category: "Grap", amount: 235000 }, { category: "Siêu Thị", amount: 29000 }]
  );
});

test("tính vào works without the word quỹ, but a made-up name still matches nothing", () => {
  const noted = (id, name, categoryId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-26" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "momo" }] }
    }
  });
  const loose = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 26 },
    [
      trackedCategoryRow("self", "Phát triển bản thân", 500000, "edu"),
      trackedCategoryRow("affiliate", "Affiilate", 600000, "edu"),
      loose("tiktok", "TikTok Shop")
    ],
    [
      // Khong co chu "quỹ" — van phai ve dung nhan con Phát triển bản thân.
      noted("order", "Thanh toán đơn hàng tiktok", "tiktok", 128392,
        "tính vào phát triển bản thân"),
      // Con chu thua phia sau van nhan ra.
      noted("book", "Mua sách", "tiktok", 90000, "tính vào phát triển bản thân nhé"),
      // Ten bia ra thi khong khop cai gi ca, nam nguyen o nhan cua no.
      noted("ghost", "Mua linh tinh", "tiktok", 15000, "tính vào quỹ du thuyền")
    ],
    [cashflowAccountRow("momo", "Momo")],
    5500000,
    [],
    [{
      id: "edu",
      properties: {
        "Tên Nhóm Quỹ": { title: [{ plain_text: "Giáo dục phát triển" }] },
        "Tài Khoản Giữ Quỹ": { relation: [{ id: "momo" }] },
        "Bắt Buộc Cấp Quỹ": { checkbox: true }
      }
    }]
  );

  const edu = data.fundGroups[0];
  assert.equal(edu.spent, 218392);
  assert.deepEqual(edu.children.map(({ name, budget, spent, over }) => ({ name, budget, spent, over })), [
    { name: "Affiilate", budget: 600000, spent: 0, over: 0 },
    { name: "Phát triển bản thân", budget: 500000, spent: 218392, over: 0 }
  ]);
  const text = fundBudgetText_(data);
  assert.match(text, /• Phát triển bản thân: 218\.392đ \/ 500\.000đ/);
  assert.equal(data.monthlyBudget.looseByCategory[0].category, "TikTok Shop");
  assert.equal(data.monthlyBudget.looseByCategory[0].amount, 15000);
});

test("only a sub fund funded this month counts as spending when drawn on", () => {
  const noted = (id, name, categoryId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-12" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "fund" }] }
    }
  });
  const loose = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 25 },
    [loose("grap", "Grap"), loose("danang", "Đà Nẵng")],
    [
      // Quy sua xe duoc nap tu thu nhap thang nay -> tieu no la chi tieu that.
      noted("tire", "Thay ruột xe", "grap", 100000, "( quỹ sửa xe )"),
      // Quy di choi voi em la tien de danh tu truoc -> khong tinh vao thang nay.
      noted("flower", "Mua hoa tặng em", "danang", 220000, "( lấy từ quỹ đi chơi với em )")
    ],
    [cashflowAccountRow("fund", "Quỹ Momo")],
    5500000,
    [],
    [],
    { spendableSubFunds: ["sửa xe"] }
  );

  assert.equal(data.monthlyBudget.looseSpending, 100000);
  assert.deepEqual(data.monthlyBudget.looseByCategory, [{ category: "Grap", amount: 100000 }]);
  assert.equal(data.excluded.total, 220000);
  assert.equal(data.excluded.rows[0].name, "Mua hoa tặng em");
});

test("the funding line says which child label the money is for", () => {
  const noted = (id, name, categoryId, amount) => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-26" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "momo" }] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 26 },
    [
      trackedCategoryRow("affiliate", "Affiilate", 600000, "edu"),
      trackedCategoryRow("self", "Phát triển bản thân", 500000, "edu")
    ],
    [
      noted("claude", "Claude Pro", "affiliate", 574444),
      noted("order", "Đơn hàng tiktok", "self", 128392)
    ],
    [cashflowAccountRow("momo", "Momo"), cashflowAccountRow("fund", "Quỹ Momo")],
    5500000,
    [],
    [{
      id: "edu",
      properties: {
        "Tên Nhóm Quỹ": { title: [{ plain_text: "Giáo dục phát triển" }] },
        "Tài Khoản Giữ Quỹ": { relation: [{ id: "fund" }] },
        "Bắt Buộc Cấp Quỹ": { checkbox: true }
      }
    }],
  );

  const edu = data.fundGroups[0];
  assert.equal(edu.transferNeeded, 397164);
  // Chia theo phan ngan sach con lai, nhan thieu nhieu nhat truoc. Tong cac dong
  // con luon bang dung so cua ca lo.
  assert.deepEqual(edu.transferPlan, [
    { name: "Phát triển bản thân", amount: 371608 },
    { name: "Affiilate", amount: 25556 }
  ]);
  assert.equal(
    edu.transferPlan.reduce((sum, entry) => sum + entry.amount, 0),
    edu.transferNeeded
  );

  const text = fundBudgetText_(data);
  assert.match(text, /• Giáo dục phát triển → Quỹ Momo: 397\.164đ\n    Phát triển bản thân: 371\.608đ\n    Affiilate: 25\.556đ/);
});

test("a named fund loan stays distinct when no earlier account funding is proven", () => {
  const paid = (id, name, categoryId, accountId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-29" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 30 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential-fund"),
      trackedCategoryRow("incidental", "Phát Sinh", 600000, "essential-fund")
    ],
    [
      // No opening cohort or earlier receipt is supplied for these accounts.
      paid("party", "Tiền đi thôi nôi con a Nguyện", "incidental", "bank", 300000),
      paid("rent-aug", "Tiền phòng", "rent", "cash", 2122000),
      // Chi bang chinh tai khoan giu quy va ghi chu noi lay tu mot quy con khong
      // thuoc lo nao -> day moi la mon no.
      paid("claude", "Claude Pro", "incidental", "fund", 100000, "( lấy từ quỹ tích lũy )")
    ],
    [
      cashflowAccountRow("fund", "Quỹ Momo"),
      cashflowAccountRow("bank", "Banking"),
      cashflowAccountRow("cash", "Tiền Mặt")
    ],
    5500000,
    [transferRow("cap", "Cấp quỹ", 2400000, "bank", "fund", "essential-fund")],
    [fundGroupRow("essential-fund", "Nhu cầu thiết yếu", "fund", true)]
  );

  const essential = data.fundGroups[0];
  assert.deepEqual(
    essential.borrowedFunds.map((entry) => ({ fund: entry.fund, amount: entry.amount })),
    [{ fund: "quỹ tích lũy", amount: 100000 }]
  );
  // Quy da cap 2.400.000, chua tieu dong nao tu chinh no -> con nguyen.
  assert.equal(essential.fundBalance, 2400000);
  assert.equal(essential.fundRemaining, 2400000);

  const text = fundBudgetText_(data);
  assert.match(text, /Phát Sinh:[^\n]*còn nợ quỹ tích lũy 100\.000đ/);
  assert.doesNotMatch(text, /🤝 NỢ GHI RÕ/);
  assert.doesNotMatch(text, /→ Banking/);
  assert.doesNotMatch(text, /→ Tiền Mặt/);
});

test("September direct Grab expenses are covered once while 550000 Tiền Mặt remains a named account debt", () => {
  const dated = (page, day, hour) => ({
    ...page, created_time: `2026-09-${day}T${hour}:00:00.000Z`,
    properties: { ...page.properties, "Ngày": { date: { start: `2026-09-${day}` } } }
  });
  const categoryRows = [
    trackedCategoryRow("incidental", "Phát Sinh", 600000, "essential"),
    trackedCategoryRow("haircut", "Cắt Tóc", 70000, "essential"),
    trackedCategoryRow("market", "Đi Chợ", 1400000, "essential")
  ];
  categoryRows[2].properties["Chi Thẳng Không Qua Quỹ"] = { checkbox: true };
  const accounts = [
    cashflowAccountRow("cash", "Tiền Mặt"), cashflowAccountRow("grab", "Grap Tiền Mặt"),
    cashflowAccountRow("momo", "Momo"), cashflowAccountRow("fund", "Quỹ Momo")
  ];
  accounts[0].properties["Số Dư Ban Đầu"] = { number: 550000 };
  const expenses = [
    dated(namedExpenseRow("owed", "Phát Sinh", "incidental", "cash", 550000, "nợ Tiền Mặt"), "02", "02"),
    dated(namedExpenseRow("grab-154", "Phát Sinh", "incidental", "grab", 154000), "03", "02"),
    dated(namedExpenseRow("haircut-70", "Cắt tóc", "haircut", "grab", 70000), "04", "02"),
    dated(namedExpenseRow("market-63", "Đi chợ", "market", "grab", 63000), "05", "02")
  ];
  const income = dated(cashflowIncomeRow("grab-income", "Grap tiền mặt", "grab-receipt", "grab", 300000), "01", "01");
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 6 }, categoryRows, expenses, accounts, 5500000, [],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true)],
    { sourceAccountNames: ["Tiền Mặt", "Grap Tiền Mặt", "Momo"], otherIncomeRows: [income], rentReserveAmount: 0 }
  );
  const group = data.fundGroups[0];
  assert.equal(group.spent, 837000);
  assert.equal(group.allocated, 0);
  assert.equal(group.transferNeeded, 0);
  assert.deepEqual(group.explicitDebts.map((debt) => ({ lender: debt.lender, outstanding: debt.outstanding, childName: debt.childName })),
    [{ lender: "Tiền Mặt", outstanding: 550000, childName: "Phát Sinh" }]);
  assert.deepEqual(group.children.find((child) => child.name === "Phát Sinh").paidOutsideSources,
    [{ account: "Grap Tiền Mặt", amount: 154000 }]);
  assert.deepEqual(group.children.find((child) => child.name === "Cắt Tóc").paidOutsideSources,
    [{ account: "Grap Tiền Mặt", amount: 70000 }]);
  assert.equal(group.children.find((child) => child.name === "Đi Chợ").paidOutsideSources, undefined);
  const report = fundBudgetText_(data);
  assert.match(report, /Phát Sinh:[^\n]*còn nợ Tiền Mặt 550\.000đ/);
  assert.doesNotMatch(report, /Tiền Mặt: cần cấp bù 550\.000đ/);
  assert.doesNotMatch(report, /CẦN CẤP THÊM/);
});

test("an explicit transfer partially repays the matching Phát Sinh cash debt", () => {
  const cash = cashflowAccountRow("cash", "Tiền Mặt");
  cash.properties["Số Dư Ban Đầu"] = { number: 650000 };
  const earlier = namedExpenseRow("earlier-cash", "Khoản chi tiền mặt khác", "other", "cash", 100000);
  earlier.properties["Ngày"] = { date: { start: "2026-09-02" } };
  const expense = namedExpenseRow("phone-repair", "Thay chân sạc điện thoại và mua cáp sạc", "incidental", "cash", 550000, "ứng tiền ( nợ )");
  expense.properties["Ngày"] = { date: { start: "2026-09-12" } };
  const repayment = transferRow("repay-cash", "Trả lại tiền sửa điện thoại hôm trước mượn tiền mặt", 200000, "grab", "cash", "");
  repayment.properties["Ngày"] = { date: { start: "2026-09-19" } };
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 20 },
    [trackedCategoryRow("incidental", "Phát Sinh", 600000, "essential"),
      trackedCategoryRow("other", "Khác", 100000, "essential")],
    [earlier, expense],
    [cash, cashflowAccountRow("grab", "Grap Tiền Mặt"), cashflowAccountRow("fund", "Quỹ Momo")],
    5500000, [repayment], [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true)],
    { sourceAccountNames: ["Tiền Mặt", "Grap Tiền Mặt"], rentReserveAmount: 0 }
  );
  assert.equal(data.explicitLedger.previousMonthAdvances.outstandingByRow["phone-repair"], 350000);
  assert.equal(data.explicitLedger.previousMonthAdvances.outstandingByRow["earlier-cash"], 100000);
  assert.match(fundBudgetText_(data), /Phát Sinh:[^\n]*còn nợ Tiền Mặt 350\.000đ/);
});

test("group quỹ còn sums funded child labels and keeps an evidenced debt on its child", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 20 },
    [trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential"),
      trackedCategoryRow("internet", "Internet", 180000, "essential")],
    [namedExpenseRow("rent-paid", "Tiền phòng", "rent", "fund", 2017000, "nợ quỹ tiết kiệm 750")],
    [cashflowAccountRow("fund", "Quỹ Momo"), cashflowAccountRow("bank", "Banking"), cashflowAccountRow("momo", "Momo")],
    5500000,
    [transferRow("rent-allocation", "Tiền phòng", 1400004, "bank", "fund", "essential"),
      transferRow("internet-allocation", "Cấp quỹ Internet", 180000, "momo", "fund", "essential"),
      transferRow("borrow-rent", "Mượn quỹ tiết kiệm cho quỹ thiết yếu", 750000, "fund", "fund", "essential")],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true),
      fundGroupRow("savings", "Tiết kiệm dài hạn", "fund", true)]
  );
  const group = data.fundGroups.find((entry) => entry.name === "Nhu cầu thiết yếu");
  assert.equal(group.children.find((child) => child.name === "Nhà Trọ").fundRemaining, 133004);
  assert.equal(group.children.find((child) => child.name === "Internet").fundRemaining, 180000);
  assert.equal(group.children.reduce((sum, child) => sum + child.fundRemaining, 0), 313004);
  const report = fundBudgetText_(data);
  assert.match(report, /Nhu cầu thiết yếu:[^\n]*quỹ còn 313\.004đ/);
  assert.doesNotMatch(report, /Nhu cầu thiết yếu:[^\n]*còn nợ/);
  assert.match(report, /Nhà Trọ:[^\n]*còn nợ Quỹ Tiết kiệm dài hạn 750\.000đ/);
});

test("an ordinary fund expense using previous-month Tiền Mặt owes that account even without a debt note", () => {
  const cash = cashflowAccountRow("cash", "Tiền Mặt");
  cash.properties["Số Dư Ban Đầu"] = { number: 70000 };
  const expense = namedExpenseRow("spent", "Cắt tóc", "haircut", "cash", 70000);
  expense.properties["Ngày"] = { date: { start: "2026-09-02" } };
  const data = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 3 }, [trackedCategoryRow("haircut", "Cắt Tóc", 70000, "essential")],
    [expense], [cash, cashflowAccountRow("fund", "Quỹ Momo")], 5500000, [],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", true)],
    { sourceAccountNames: ["Tiền Mặt"], rentReserveAmount: 0 }
  );
  assert.deepEqual(data.fundGroups[0].explicitDebts.map((debt) => ({ lender: debt.lender, outstanding: debt.outstanding })),
    [{ lender: "Tiền Mặt", outstanding: 70000 }]);
  const report = fundBudgetText_(data);
  assert.match(report, /còn nợ Tiền Mặt 70\.000đ/);
  assert.doesNotMatch(report, /Tiền Mặt: cần cấp bù 70\.000đ|CẦN CẤP THÊM/);
});

test("large outside-fund expenses count unless the record says they are pass-through", () => {
  const spend = (id, name, categoryId, accountId, amount) => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-12" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  });
  const loose = (id, name) => ({
    id,
    properties: {
      "Loại Chi Phí": { title: [{ plain_text: name }] },
      "Ngân Sách Tháng": { number: 0 },
      "Tính Trong 5,5 Triệu": { checkbox: false },
      "Nhóm Quỹ": { relation: [] }
    }
  });
  const earn = (id, name, amount) => ({
    id,
    properties: {
      "Tên Khoản Thu": { title: [{ plain_text: name }] },
      "Số Tiền": { number: amount }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 22 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential-fund"),
      loose("grap", "Grap"),
      loose("loan", "Vay Và Trả"),
      loose("cafe", "Cà Phê"),
      loose("danang", "Đà Nẵng")
    ],
    [
      spend("r", "Tiền phòng", "rent", "fund", 2000000),
      spend("g1", "Nạp tiền ví grap", "grap", "momo", 650000),
      spend("g2", "Đổ xăng", "grap", "cash", 60000),
      spend("g3", "Thay nhớt + vá bánh sau", "grap", "cash", 150000),
      spend("l", "Cho c Thủy mượn", "loan", "fund", 3000000),
      spend("c", "Mua bạc xỉu", "cafe", "cash", 15000),
      spend("d", "Đi ăn với em", "danang", "cash", 850000)
    ],
    [
      cashflowAccountRow("fund", "Quỹ Momo"),
      cashflowAccountRow("cash", "Grap Tiền Mặt"),
      cashflowAccountRow("momo", "Momo")
    ],
    5500000,
    [],
    [fundGroupRow("essential-fund", "Thiết Yếu", "fund", true)],
    {
      incomeRows: [earn("i1", "Thu nhập ròng Grab", 7876709)],
      otherIncomeRows: [
        earn("o1", "Grap tiền mặt", 1310000),
        earn("o2", "Bình cho mượn tiền", 1000000)
      ],
      passThroughCategories: ["Vay Và Trả"]
    }
  );

  assert.equal(data.monthlyBudget.groupSpending, 2000000);
  // So tien khong quyet dinh viec loai: nap vi Grab 650k va an uong 850k van la chi that.
  assert.equal(data.monthlyBudget.looseSpending, 1725000);
  assert.equal(data.monthlyBudget.total, 3725000);

  assert.deepEqual(
    data.excluded.rows.map((row) => ({ name: row.name, amount: row.amount })),
    [{ name: "Cho c Thủy mượn", amount: 3000000 }]
  );
  assert.equal(data.excluded.total, 3000000);

  // Thu nhap that chi la bang Bao Cao Thu Nhap; Grab gop va tien muon khong tinh.
  assert.deepEqual(data.income, { real: 7876709, grabGross: 1310000, other: 1000000 });

  const text = fundBudgetText_(data);
  // Thu nhap van duoc tinh de tach thu nhap that khoi tien chay qua, nhung bao cao
  // quy khong in ra — con so do da co o nut khac.
  assert.doesNotMatch(text, /Thu nhập thật/);
  assert.match(text, /📊 NHÓM QUỸ — 2\.000\.000đ \/ 2\.150\.000đ\n/);
  // Bao cao quy chi noi ve quy. Chi tieu ngoai lo va tong chi tieu da co o nut
  // Dong tien roi, in lai o day la thua.
  assert.doesNotMatch(text, /NGOÀI NHÓM QUỸ/);
  assert.doesNotMatch(text, /TỔNG CHI TIÊU/);
  assert.doesNotMatch(text, /Không tính/);
});

test("a note pointing at another fund pulls the expense out of its own label", () => {
  const noted = (id, name, categoryId, amount, note = "") => ({
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: "2026-08-12" } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "cash" }] }
    }
  });

  const data = buildAccountSpendingData_(
    { y: 2026, m: 8, d: 22 },
    [
      trackedCategoryRow("rent", "Nhà Trọ", 2150000, "essential-fund"),
      trackedCategoryRow("incidental", "Phát Sinh", 600000, "incidental-fund")
    ],
    [
      noted("a", "Tiền phòng", "rent", 2000000),
      // Nhan la Nha Tro (nhom Thiet Yeu) nhung ghi chu keu tinh vao Phat Sinh:
      // phai roi hoan toan khoi Thiet Yeu, khong duoc dem ca hai noi.
      noted("b", "Sửa vòi nước", "rent", 300000, "Tính vào quỹ phát sinh")
    ],
    [cashflowAccountRow("cash", "Grap Tiền Mặt"), cashflowAccountRow("fund", "Quỹ Momo")],
    5500000,
    [],
    [
      fundGroupRow("essential-fund", "Thiết Yếu", "fund", true),
      fundGroupRow("incidental-fund", "Phát Sinh", "fund", true)
    ]
  );

  const essential = data.fundGroups.find((group) => group.name === "Thiết Yếu");
  const incidental = data.fundGroups.find((group) => group.name === "Phát Sinh");
  assert.equal(essential.spent, 2000000);
  assert.equal(incidental.spent, 300000);
  // Tong hai nhom bang dung tong chi, khong dem trung 300.000.
  assert.equal(data.monthlyBudget.groupSpending, 2300000);

  const rent = data.fixedBudgets.find((fixed) => fixed.name === "Nhà Trọ");
  assert.equal(rent.spent, 2000000);
});

test("a fund that does not require allocation never asks for a transfer", () => {
  const data = buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    [trackedCategoryRow("market", "Đi Chợ", 1300000, "market-fund")],
    [],
    [cashflowAccountRow("cash", "Grab Tiền Mặt")],
    5500000,
    [],
    [fundGroupRow("market-fund", "Đi Chợ", "cash", false)]
  );
  assert.equal(data.fundGroups[0].requiresAllocation, false);
  assert.equal(data.fundGroups[0].transferNeeded, 0);
  const text = accountSpendingText_(data);
  assert.match(text, /✅ Đi Chợ: 0đ \/ 1\.300\.000đ/);
  assert.doesNotMatch(text, /Cần chuyển thêm vào Đi Chợ/);
});

test("/muctieu names the exact income target being tracked", () => {
  const text = progressText_({
    t: { y: 2026, m: 7 },
    goal: 10000000,
    earnedMonth: 1000000,
    remaining: 9000000,
    baseDaily: 322581,
    daysLeftIncludingToday: 13,
    requiredPerDay: 692307.69,
    daysAfter: 12,
    tomorrowTarget: 750000
  });
  assert.match(text, /13 .*692\.308/);
  assert.match(text, /Mục tiêu Thu Nhập Ròng Grab \(App\)/);
  assert.match(text, /Tiến độ: 10,0%/);
  assert.doesNotMatch(text, /[█░]/);
});

test("pure utility exports preserve deterministic formatting and normalization", () => {
  assert.equal(iso_(2026, 7, 9), "2026-07-09");
  assert.equal(money_(1234567.4), "1.234.567đ");
  assert.equal(normalizeSearchText_("  Quỹ PHÁT SINH  "), "quy phat sinh");
});

test("cashflow category callback parser accepts only the exact format", () => {
  assert.deepEqual(parseCashflowCategoryCallback_("cash_cat:cash:out:out-market"), {
    accountToken: "cash",
    direction: "out",
    categoryToken: "out-market"
  });
  for (const invalid of [
    "cash_cat:cash:out",
    "cash_cat:cash:sideways:out-market",
    "cash_cat::out:out-market",
    "cash_cat:cash:out:out-market:extra"
  ]) {
    assert.equal(parseCashflowCategoryCallback_(invalid), null);
  }
});

test("unusual spending keyboard preserves approved navigation", () => {
  assert.deepEqual(unusualSpendingKeyboard_(), {
    inline_keyboard: [
      [{ text: "⬅️ Dòng tiền", callback_data: "show_accounts" }],
      [{ text: "🏠 Trang chính", callback_data: "show_home" }]
    ]
  });
});

test("fund budget text preserves approved fund statuses and heading", () => {
  const text = fundBudgetText_({
    t: { y: 2026, m: 7, d: 28 },
    fundGroups: [
      {
        name: "Thiết Yếu",
        destinationAccount: "Quỹ Momo",
        budget: 2400000,
        spent: 2277400,
        over: 0,
        allocated: 2400000,
        fundBalance: 122600,
        fundRemaining: 122600,
        transferNeeded: 0,
        requiresAllocation: true,
        unmatchedCategories: []
      },
      {
        name: "Đi Chợ",
        budget: 1300000,
        spent: 801000,
        over: 0,
        allocated: 0,
        transferNeeded: 0,
        requiresAllocation: false,
        unmatchedCategories: []
      },
      {
        name: "Phát Sinh",
        destinationAccount: "Quỹ Momo",
        budget: 600000,
        spent: 0,
        over: 0,
        allocated: 0,
        fundBalance: 0,
        transferNeeded: 600000,
        requiresAllocation: true,
        unmatchedCategories: []
      },
      {
        name: "Làm YouTube",
        destinationAccount: "Quỹ Momo",
        budget: 500000,
        spent: 554444,
        over: 54444,
        allocated: 555000,
        fundBalance: 556,
        fundRemaining: 556,
        transferNeeded: 0,
        requiresAllocation: true,
        unmatchedCategories: []
      },
      {
        name: "Chưa Ghép",
        budget: 100000,
        spent: 25000,
        over: 0,
        allocated: 0,
        transferNeeded: 0,
        requiresAllocation: false,
        unmatchedCategories: ["missing-category"]
      }
    ]
  });

  assert.equal(
    text,
    "📦 QUỸ & NGÂN SÁCH — tháng 7/2026\n" +
      "\n" +
      "📊 NHÓM QUỸ — 3.657.844đ / 4.900.000đ\n" +
      "✅ Thiết Yếu: 2.277.400đ / 2.400.000đ · quỹ còn 122.600đ · đã cấp 2.400.000đ\n\n" +
      "✅ Đi Chợ: 801.000đ / 1.300.000đ · còn 499.000đ\n\n" +
      "✅ Phát Sinh: 0đ / 600.000đ · chưa cấp\n\n" +
      "⛔ Làm YouTube: 554.444đ / 500.000đ · vượt 54.444đ · đã cấp 555.000đ\n\n" +
      "✅ Chưa Ghép: 25.000đ / 100.000đ · còn 75.000đ\n" +
      "\n" +
      "💰 CẦN CẤP THÊM\n" +
      "• Phát Sinh → Quỹ Momo: 600.000đ"
  );
});

test("fund report totals every real expense outside the jars regardless of amount", () => {
  const model = buildAccountSpendingData_(
    { y: 2026, m: 9, d: 21 },
    [
      trackedCategoryRow("inside", "Nhà Trọ", 0, "essential"),
      cashflowCategoryRow("grab", "Loại Chi Phí", "Grap"),
      cashflowCategoryRow("family", "Loại Chi Phí", "Người Thân"),
      cashflowCategoryRow("loan", "Loại Chi Phí", "Vay Và Trả"),
      cashflowCategoryRow("other", "Loại Chi Phí", "Khác")
    ],
    [
      namedExpenseRow("grab-topup", "Nạp ví Grap", "grab", "momo", 501000),
      namedExpenseRow("family-gift", "Cho má tiền", "family", "cash", 500000),
      namedExpenseRow("loan-payment", "Trả nợ", "loan", "momo", 900000),
      namedExpenseRow("customer-code", "Tiền code đơn hàng", "other", "momo", 200000),
      namedExpenseRow("saved-pot", "Mua máy tính", "other", "momo", 300000, "lấy từ quỹ máy tính")
    ],
    [
      cashflowAccountRow("momo", "Momo"),
      cashflowAccountRow("cash", "Tiền Mặt"),
      cashflowAccountRow("fund", "Quỹ Momo")
    ],
    5500000,
    [],
    [fundGroupRow("essential", "Nhu cầu thiết yếu", "fund", false)],
    {
      passThroughKeywords: ["code"],
      passThroughCategories: ["Vay Và Trả"]
    }
  );

  assert.equal(model.monthlyBudget.outsideFundSpending, 1001000);
  assert.match(fundBudgetText_(model), /\n• Tổng chi ngoài quỹ: 1\.001\.000đ\n/);
});

test("fund report separates jar groups and keeps the outside-fund total after Hưởng thụ", () => {
  const fund = (name) => ({
    name,
    spent: 0,
    budget: 0,
    over: 0,
    allocated: 0,
    transferNeeded: 0,
    requiresAllocation: false,
    children: []
  });
  const lines = fundBudgetText_({
    t: { y: 2026, m: 9, d: 21 },
    monthlyBudget: { outsideFundSpending: 5484000 },
    fundGroups: [fund("Nhu cầu thiết yếu"), fund("Hưởng thụ"), fund("Cho đi")]
  }).split("\n");

  const enjoymentIndex = lines.findIndex((line) => line.includes("Hưởng thụ:"));
  assert.equal(lines[enjoymentIndex - 1], "");
  assert.equal(lines[enjoymentIndex + 1], "• Tổng chi ngoài quỹ: 5.484.000đ");
  assert.equal(lines[enjoymentIndex + 2], "");
  assert.match(lines[enjoymentIndex + 3], /Cho đi:/);
});

test("rollover fund line shows money held against this month's target without allocated text", () => {
  const text = fundBudgetText_({
    t: { y: 2026, m: 9, d: 21 },
    fundGroups: [{
      name: "Tiết kiệm dài hạn",
      spent: 0,
      budget: 0,
      over: 0,
      allocated: 158706,
      fundRemaining: 0,
      transferNeeded: 0,
      requiresAllocation: true,
      children: []
    }],
    openingPlan: {
      allocations: [{ fund: "Tiết kiệm dài hạn", amount: 566570 }]
    }
  });

  assert.match(text, /Tiết kiệm dài hạn: 158\.706đ \/ 566\.570đ/);
  assert.doesNotMatch(text, /Tiết kiệm dài hạn:[^\n]*(?:đã cấp|quỹ còn|· còn)/);
});

test("fund budget text preserves the approved empty state", () => {
  assert.equal(
    fundBudgetText_({ t: { y: 2026, m: 7, d: 28 }, fundGroups: [] }),
    "📦 QUỸ & NGÂN SÁCH — tháng 7/2026\n\nChưa có dữ liệu tháng này."
  );
});

test("fund budget hides a zero opening plan in an empty month", () => {
  assert.equal(
    fundBudgetText_({
      t: { y: 2026, m: 9, d: 30 },
      fundGroups: [],
      openingPlan: {
        sourceTotal: 0,
        rentReserve: 0,
        sourceAccounts: [
          { id: "cash", name: "Tiền Mặt", opening: 0 },
          { id: "bank", name: "Banking", opening: 0 },
          { id: "grab-cash", name: "Grap Tiền Mặt", opening: 0 },
          { id: "momo", name: "Momo", opening: 0 }
        ],
        allocations: [
          { fund: "Tiết kiệm dài hạn", amount: 0 },
          { fund: "Đầu tư tài chính", amount: 0 },
          { fund: "Hưởng thụ", amount: 0 }
        ]
      }
    }),
    "📦 QUỸ & NGÂN SÁCH — tháng 9/2026\n\nChưa có dữ liệu tháng này."
  );
});

test("fund budget keyboard keeps only the cashflow navigation", () => {
  assert.deepEqual(fundBudgetKeyboard_(), {
    inline_keyboard: [
      [{ text: "⬅️ Dòng tiền", callback_data: "cash_home" }]
    ]
  });
});
