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
  assert.equal(accountSpendingKeyboard_(data).inline_keyboard[0][0].callback_data, "show_unusual");
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
    budget: 2400000,
    spent: 2277400,
    over: 0,
    allocated: 2400000,
    paidOutsideFund: 0,
    transferNeeded: 0,
    requiresAllocation: true,
    unmatchedCategories: []
  });
  assert.equal(youtube.allocated, 555000);
  assert.equal(youtube.spent, 554444);
  assert.equal(youtube.over, 54444);
  assert.equal(youtube.transferNeeded, 0);
  assert.equal(incidental.allocated, 200000);
  assert.equal(incidental.spent, 861790);
  assert.equal(incidental.over, 261790);
  assert.equal(incidental.paidOutsideFund, 715790);
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
    daysAfter: 12,
    tomorrowTarget: 750000
  });
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
