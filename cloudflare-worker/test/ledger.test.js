import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpeningPlan_,
  buildPersonalLoanLedger_,
  buildPreviousMonthAdvanceLedger_,
  readFinanceRows_
} from "../src/ledger.js";

const OPENING_OPTIONS = {
  sourceAccountNames: ["Tiền Mặt", "Banking", "Grap Tiền Mặt", "Momo"],
  rentReserveAmount: 2150000,
  rolloverFundNames: ["Tiết kiệm dài hạn", "Đầu tư tài chính", "Hưởng thụ"]
};

function account(id, name, opening, current) {
  return {
    id,
    properties: {
      "Phương Thức Thanh Toán": { title: [{ plain_text: name }] },
      "Số Dư Ban Đầu": { number: opening },
      "Số Dư Hiện Tại": { number: current }
    }
  };
}

function expense(id, title, categoryId, accountId, amount, date, note = "") {
  return {
    id,
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: title }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: date } },
      "Loại Chi Phí": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  };
}

function income(id, title, categoryId, accountId, amount, date, note = "") {
  return {
    id,
    properties: {
      "Tên Khoản Thu": { title: [{ plain_text: title }] },
      "Ghi Chú": { rich_text: note ? [{ plain_text: note }] : [] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: date } },
      "Loại Khoản Thu": { relation: [{ id: categoryId }] },
      "Phương Thức Thanh Toán": { relation: [{ id: accountId }] }
    }
  };
}

function transfer(id, title, fromAccountId, toAccountId, amount, date, createdTime) {
  return {
    id,
    created_time: createdTime,
    properties: {
      "Ghi Chú": { title: [{ plain_text: title }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: date } },
      "Loại Chuyển Đổi": { select: { name: "Giao Dịch Giữa Các Tài Khoản" } },
      "Từ Tài Khoản": { relation: [{ id: fromAccountId }] },
      "Đến Tài Khoản": { relation: [{ id: toAccountId }] }
    }
  };
}

function timed(page, createdTime) {
  return { ...page, created_time: createdTime };
}

function septemberLedgerInput() {
  const accountNamesById = new Map([
    ["cash", "Tiền Mặt"],
    ["bank", "Banking"],
    ["grab-cash", "Grap Tiền Mặt"],
    ["momo", "Momo"],
    ["fund", "Quỹ Momo"]
  ]);
  const rows = readFinanceRows_({
    incomeRows: [
      timed(income("grab-net", "Grap thu nhập ròng", "net-income", "momo", 286581, "2026-09-08"), "2026-09-08T08:00:00.000Z")
    ],
    otherIncomeRows: [
      timed(income("grab-qr", "Grab QR", "grab-receipt", "momo", 208000, "2026-09-01"), "2026-09-01T03:00:00.000Z"),
      timed(income("grab-cash-income", "Grab tiền mặt", "grab-receipt", "grab-cash", 394000, "2026-09-01"), "2026-09-01T03:30:00.000Z"),
      timed(income("borrow-em", "Em cho mượn tiền", "loan", "bank", 500000, "2026-09-06"), "2026-09-06T08:00:00.000Z"),
      timed(income("tuan-return", "Cháu Tuấn trả nợ", "loan", "momo", 100000, "2026-09-08"), "2026-09-08T07:00:00.000Z")
    ],
    expenseRows: [
      timed(expense("momo-opening-expense", "Chi Momo đầu tháng", "other", "momo", 100000, "2026-09-01"), "2026-09-01T01:00:00.000Z"),
      timed(expense("cash-day-1", "Chi tiền mặt ngày 1", "other", "cash", 277000, "2026-09-01"), "2026-09-01T02:00:00.000Z"),
      timed(expense("cash-day-2", "Chi tiền mặt ngày 2", "other", "cash", 535000, "2026-09-02"), "2026-09-02T02:00:00.000Z"),
      timed(expense("lend-tuan", "Cho cháu Tuấn mượn", "loan", "bank", 100000, "2026-09-03"), "2026-09-03T08:00:00.000Z"),
      timed(expense("cash-day-6", "Chi tiền mặt ngày 6", "other", "cash", 544000, "2026-09-06"), "2026-09-06T09:00:00.000Z"),
      timed(expense("pay-to", "Trả tiền mượn tố tháng trước (còn nợ 500)", "loan", "bank", 500000, "2026-09-07"), "2026-09-07T07:00:00.000Z"),
      timed(expense("wallet-topup", "Mượn tiền nạp ví grap", "grap", "bank", 170000, "2026-09-07"), "2026-09-07T08:00:00.000Z"),
      timed(expense("momo-current-expense", "Chi Momo từ tiền Grab", "other", "momo", 108000, "2026-09-07"), "2026-09-07T09:00:00.000Z"),
      timed(expense("grab-cash-expense", "Chi Grap tiền mặt", "other", "grab-cash", 385000, "2026-09-07"), "2026-09-07T10:00:00.000Z")
    ],
    transferRows: [
      transfer("rent-reserve", "Chuyển tiền vào quỹ Nhà Trọ", "bank", "fund", 1400004, "2026-09-01", "2026-09-01T00:00:00.000Z"),
      transfer("savings-allocation", "Chuyển tiền vào quỹ tích lũy", "momo", "fund", 158706, "2026-09-01", "2026-09-01T04:00:00.000Z")
    ]
  });
  const personalLoans = buildPersonalLoanLedger_(rows, {
    loanCategoryIds: new Set(["loan"]),
    accountNamesById
  });

  return {
    openingPlan: {
      rentReserve: 2150000,
      sourceAccounts: [
        { id: "cash", name: "Tiền Mặt", opening: 2021000 },
        { id: "bank", name: "Banking", opening: 1670004 },
        { id: "grab-cash", name: "Grap Tiền Mặt", opening: 0 },
        { id: "momo", name: "Momo", opening: 158706 }
      ]
    },
    rows,
    accountNamesById,
    categoryNamesById: new Map([["loan", "Vay Và Trả"]]),
    personalLoans,
    currentBalancesById: new Map([
      ["cash", 665000], ["bank", 9999999], ["grab-cash", 9000], ["momo", 9999999]
    ])
  };
}

test("builds the September opening plan once from four free sources", () => {
  const accounts = [
    account("cash", "Tiền Mặt", 2021000, 665000),
    account("bank", "Banking", 1670004, 0),
    account("grab-cash", "Grap Tiền Mặt", 0, 9000),
    account("momo", "Momo", 158706, 100000),
    account("fund", "Quỹ Momo", 706166, 247876)
  ];
  const expected = {
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
  };

  assert.deepEqual(buildOpeningPlan_(accounts, OPENING_OPTIONS), expected);

  accounts[0].properties["Số Dư Hiện Tại"].number = 123456789;
  assert.deepEqual(buildOpeningPlan_(accounts, OPENING_OPTIONS), expected);
});

test("opening plan reads number formula and rollup opening balances", () => {
  const accounts = [
    account("cash", "Tiền Mặt", 10, 999),
    account("bank", "Banking", null, 999),
    account("grab-cash", "Grap Tiền Mặt", null, 999),
    account("momo", "Momo", 0, 999)
  ];
  accounts[1].properties["Số Dư Ban Đầu"] = { formula: { number: 20 } };
  accounts[2].properties["Số Dư Ban Đầu"] = { rollup: { number: 31 } };

  assert.deepEqual(buildOpeningPlan_(accounts, {
    ...OPENING_OPTIONS,
    rentReserveAmount: 0
  }).allocations, [
    { fund: "Tiết kiệm dài hạn", amount: 21 },
    { fund: "Đầu tư tài chính", amount: 20 },
    { fund: "Hưởng thụ", amount: 20 }
  ]);
});

test("reads title note type account and fund fields from every finance database", () => {
  const income = {
    id: "income-row",
    created_time: "2026-09-01T05:00:00.000Z",
    properties: {
      "Tên Khoản Thu": { title: [{ plain_text: "Thu nhập ròng app" }] },
      "Ghi Chú": { rich_text: [{ plain_text: "Tiền chạy Grab" }] },
      "Số Tiền": { number: 500000 },
      "Ngày": { date: { start: "2026-09-01" } },
      "Loại Khoản Thu": { relation: [{ id: "net-income" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "momo" }] },
      "Nhóm Quỹ": { relation: [{ id: "essential" }] }
    }
  };
  const otherIncome = {
    id: "other-income-row",
    created_time: "2026-09-02T05:00:00.000Z",
    properties: {
      "Tên Khoản Thu": { title: [{ plain_text: "Doanh thu gộp Grab" }] },
      "Ghi Chú": { rich_text: [{ plain_text: "Khách chuyển khoản" }] },
      "Số Tiền": { number: 700000 },
      "Ngày": { date: { start: "2026-09-02" } },
      "Loại Khoản Thu": { relation: [{ id: "gross-grab" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "banking" }] }
    }
  };
  const expense = {
    id: "expense-row",
    created_time: "2026-09-03T05:00:00.000Z",
    properties: {
      "Nội Dung Khoản Chi": { title: [{ plain_text: "Tiền nhà trọ" }] },
      "Ghi Chú": { rich_text: [{ plain_text: "Lấy từ quỹ thiết yếu" }] },
      "Số Tiền": { number: 2100000 },
      "Ngày": { date: { start: "2026-09-03" } },
      "Loại Chi Phí": { relation: [{ id: "rent" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "momo" }] },
      "Nhóm Quỹ": { relation: [{ id: "essential" }] }
    }
  };
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

  assert.deepEqual(readFinanceRows_({ incomeRows: [income], otherIncomeRows: [otherIncome], expenseRows: [expense], transferRows: [transfer] }), [
    {
      id: "income-row", kind: "income", title: "Thu nhập ròng app", note: "Tiền chạy Grab",
      text: "Thu nhập ròng app | Tiền chạy Grab", normalizedText: "thu nhap rong app | tien chay grab",
      amount: 500000, date: "2026-09-01", createdTime: "2026-09-01T05:00:00.000Z",
      categoryId: "net-income", accountId: "momo", fromAccountId: "", toAccountId: "", fundGroupId: "essential", transferType: ""
    },
    {
      id: "other-income-row", kind: "otherIncome", title: "Doanh thu gộp Grab", note: "Khách chuyển khoản",
      text: "Doanh thu gộp Grab | Khách chuyển khoản", normalizedText: "doanh thu gop grab | khach chuyen khoan",
      amount: 700000, date: "2026-09-02", createdTime: "2026-09-02T05:00:00.000Z",
      categoryId: "gross-grab", accountId: "banking", fromAccountId: "", toAccountId: "", fundGroupId: "", transferType: ""
    },
    {
      id: "expense-row", kind: "expense", title: "Tiền nhà trọ", note: "Lấy từ quỹ thiết yếu",
      text: "Tiền nhà trọ | Lấy từ quỹ thiết yếu", normalizedText: "tien nha tro | lay tu quy thiet yeu",
      amount: 2100000, date: "2026-09-03", createdTime: "2026-09-03T05:00:00.000Z",
      categoryId: "rent", accountId: "momo", fromAccountId: "", toAccountId: "", fundGroupId: "essential", transferType: ""
    },
    {
      id: "borrow-savings", kind: "transfer", title: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", note: "",
      text: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", normalizedText: "muon tien cua quy tiet kiem chuyen sang tien phong quy thiet yeu",
      amount: 750000, date: "2026-09-08", createdTime: "2026-09-08T05:00:00.000Z",
      categoryId: "", accountId: "", fromAccountId: "fund-account", toAccountId: "fund-account", fundGroupId: "essential", transferType: "Giao Dịch Giữa Các Tài Khoản"
    }
  ]);
});

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
  }), {
    loanCategoryIds: new Set(["loan"]),
    accountNamesById: new Map([["bank", "Banking"], ["momo", "Momo"]])
  });

  assert.deepEqual(ledger.receivables[0], {
    party: "cháu tuấn", principal: 100000, repaid: 100000, outstanding: 0,
    openedBy: "lend-tuan", repaymentRows: ["tuan-return"],
    sourceAccountId: "bank", sourceAccountName: "Banking"
  });
  assert.deepEqual(ledger.liabilities.find((item) => item.party === "em"), {
    party: "em", principal: 500000, repaid: 0, outstanding: 500000,
    openedBy: "borrow-em", repaymentRows: []
  });
  assert.equal(ledger.repayments.find((row) => row.id === "pay-to").party, "tố");
  assert.equal(ledger.liabilities.find((item) => item.party === "em").repaid, 0);
  assert.equal(ledger.unmatched.find((row) => row.id === "pay-to").party, "tố");
});

test("generic 500000 income and expense never match", () => {
  const ledger = buildPersonalLoanLedger_(readFinanceRows_({
    expenseRows: [
      expense("generic-expense", "Chi khác", "loan", "bank", 500000, "2026-09-08")
    ],
    otherIncomeRows: [
      income("generic-income", "Khoản thu khác", "loan", "bank", 500000, "2026-09-08")
    ]
  }), { loanCategoryIds: new Set(["loan"]) });

  assert.deepEqual(ledger, {
    receivables: [], liabilities: [], repayments: [], unmatched: []
  });
});

test("repays Tuấn receivables partially in FIFO order", () => {
  const ledger = buildPersonalLoanLedger_(readFinanceRows_({
    expenseRows: [
      expense("lend-tuan-old", "Cho Tuấn mượn", "loan", "bank", 70000, "2026-09-01"),
      expense("lend-tuan-new", "Cho Tuấn mượn tiền", "loan", "cash", 50000, "2026-09-02")
    ],
    otherIncomeRows: [
      income("tuan-partial-return", "Tuấn trả lại", "loan", "momo", 90000, "2026-09-03")
    ]
  }), {
    loanCategoryIds: new Set(["loan"]),
    accountNamesById: { bank: "Banking", cash: "Tiền Mặt" }
  });

  assert.deepEqual(ledger.receivables, [
    {
      party: "tuấn", principal: 70000, repaid: 70000, outstanding: 0,
      openedBy: "lend-tuan-old", repaymentRows: ["tuan-partial-return"],
      sourceAccountId: "bank", sourceAccountName: "Banking"
    },
    {
      party: "tuấn", principal: 50000, repaid: 20000, outstanding: 30000,
      openedBy: "lend-tuan-new", repaymentRows: ["tuan-partial-return"],
      sourceAccountId: "cash", sourceAccountName: "Tiền Mặt"
    }
  ]);
});

test("reads explicit loan opening and repayment phrases from Ghi Chú", () => {
  const ledger = buildPersonalLoanLedger_(readFinanceRows_({
    expenseRows: [
      expense("lend-lan-note", "Chi hộ", "loan", "bank", 150000, "2026-09-01", "Cho cô Lan mượn tiền")
    ],
    otherIncomeRows: [
      income("lan-return-note", "Khoản thu khác", "loan", "momo", 50000, "2026-09-02", "Cô Lan trả nợ")
    ]
  }), {
    loanCategoryIds: new Set(["loan"]),
    accountNamesById: { bank: "Banking" }
  });

  assert.deepEqual(ledger.receivables, [{
    party: "cô lan", principal: 150000, repaid: 50000, outstanding: 100000,
    openedBy: "lend-lan-note", repaymentRows: ["lan-return-note"],
    sourceAccountId: "bank", sourceAccountName: "Banking"
  }]);
  assert.deepEqual(ledger.unmatched, []);
});

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

test("keeps the Momo previous-month advance despite income and current balances", () => {
  const result = buildPreviousMonthAdvanceLedger_(septemberLedgerInput());
  const momo = result.accounts.find((item) => item.accountName === "Momo");
  const grabCash = result.accounts.find((item) => item.accountName === "Grap Tiền Mặt");
  assert.equal(momo.principal, 100000);
  assert.equal(momo.repaid, 0);
  assert.equal(momo.outstanding, 100000);
  assert.equal(grabCash.outstanding, 0);
  assert.equal(result.totalOutstanding, 1626000);
});

test("orders previous-month cohorts by date then createdTime then id", () => {
  const openingPlan = {
    rentReserve: 0,
    sourceAccounts: [{ id: "bank", name: "Banking", opening: 100 }]
  };
  const accountNamesById = { bank: "Banking" };
  const cases = [
    [
      { id: "income", kind: "income", amount: 100, accountId: "bank", date: "2026-09-02", createdTime: "2026-09-01T00:00:00.000Z", normalizedText: "income" },
      { id: "expense", kind: "expense", amount: 100, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-02T00:00:00.000Z", normalizedText: "expense" }
    ],
    [
      { id: "income", kind: "income", amount: 100, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T02:00:00.000Z", normalizedText: "income" },
      { id: "expense", kind: "expense", amount: 100, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T01:00:00.000Z", normalizedText: "expense" }
    ],
    [
      { id: "z-income", kind: "income", amount: 100, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T01:00:00.000Z", normalizedText: "income" },
      { id: "a-expense", kind: "expense", amount: 100, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T01:00:00.000Z", normalizedText: "expense" }
    ]
  ];

  for (const rows of cases) {
    const result = buildPreviousMonthAdvanceLedger_({
      openingPlan, rows, accountNamesById, personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] }
    });
    assert.equal(result.accounts[0].principal, 100);
  }
});

test("applies an explicit reimbursement to its named source account", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: {
      rentReserve: 0,
      sourceAccounts: [
        { id: "bank", name: "Banking", opening: 100000 },
        { id: "momo", name: "Momo", opening: 0 }
      ]
    },
    rows: [
      { id: "advance", kind: "expense", title: "Chi đầu tháng", normalizedText: "chi dau thang", amount: 100000, accountId: "bank", date: "2026-09-01", createdTime: "" },
      { id: "reimburse", kind: "otherIncome", title: "Cấp bù cho Banking", normalizedText: "cap bu cho banking", amount: 100000, accountId: "momo", date: "2026-09-02", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] }
  });

  const bank = result.accounts.find((item) => item.accountId === "bank");
  const momo = result.accounts.find((item) => item.accountId === "momo");
  assert.equal(bank.repaid, 100000);
  assert.equal(bank.outstanding, 0);
  assert.equal(momo.repaid, 0);
  assert.deepEqual(result.unmatchedSources, []);
});

test("keeps minimum forced previous-month money at account level when a row mixes cohorts", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: {
      rentReserve: 0,
      sourceAccounts: [{ id: "bank", name: "Banking", opening: 100000 }]
    },
    rows: [
      { id: "earned", kind: "income", normalizedText: "earned", amount: 50000, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T01:00:00.000Z" },
      { id: "mixed", kind: "expense", title: "Chi hỗn hợp", normalizedText: "chi hon hop", amount: 100000, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T02:00:00.000Z" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] }
  });
  const bank = result.accounts[0];

  assert.equal(bank.principal, 50000);
  assert.deepEqual(bank.rows, []);
  assert.equal(bank.ambiguousRows.length, 1);
  assert.equal(bank.ambiguousRows[0].id, "mixed");
  assert.equal(bank.ambiguousRows[0].advanceAmount, 50000);
});

test("tracks a transfer explicitly using previous-month money as an advance", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: {
      rentReserve: 0,
      sourceAccounts: [{ id: "bank", name: "Banking", opening: 100000 }]
    },
    rows: [{
      id: "explicit-transfer",
      kind: "transfer",
      title: "Mượn tiền tháng trước nạp quỹ sửa xe",
      normalizedText: "muon tien thang truoc nap quy sua xe",
      amount: 100000,
      fromAccountId: "bank",
      toAccountId: "fund",
      date: "2026-09-01",
      createdTime: ""
    }],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] }
  });

  assert.equal(result.accounts[0].principal, 100000);
  assert.equal(result.accounts[0].outstanding, 100000);
  assert.deepEqual(result.accounts[0].rows.map((row) => row.id), ["explicit-transfer"]);
});

test("does not let reimbursement before an advance repay that future obligation", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: {
      rentReserve: 0,
      sourceAccounts: [
        { id: "bank", name: "Banking", opening: 100000 },
        { id: "momo", name: "Momo", opening: 0 }
      ]
    },
    rows: [
      { id: "early-reimburse", kind: "otherIncome", title: "Cấp bù cho Banking", normalizedText: "cap bu cho banking", amount: 100000, accountId: "momo", date: "2026-09-01", createdTime: "" },
      { id: "later-advance", kind: "expense", title: "Mượn tiền tháng trước", normalizedText: "muon tien thang truoc", amount: 100000, accountId: "bank", date: "2026-09-02", createdTime: "" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] }
  });
  const bank = result.accounts.find((item) => item.accountId === "bank");

  assert.equal(bank.principal, 100000);
  assert.equal(bank.repaid, 0);
  assert.equal(bank.outstanding, 100000);
  assert.equal(result.unmatchedSources[0].id, "early-reimburse");
});

test("recognizes using previous-month money even when a current cohort is available", () => {
  const result = buildPreviousMonthAdvanceLedger_({
    openingPlan: {
      rentReserve: 0,
      sourceAccounts: [{ id: "bank", name: "Banking", opening: 100000 }]
    },
    rows: [
      { id: "earned", kind: "income", normalizedText: "earned", amount: 100000, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T01:00:00.000Z" },
      { id: "using-opening", kind: "expense", title: "Sử dụng tiền tháng trước", normalizedText: "su dung tien thang truoc", amount: 100000, accountId: "bank", date: "2026-09-01", createdTime: "2026-09-01T02:00:00.000Z" }
    ],
    personalLoans: { receivables: [], liabilities: [], repayments: [], unmatched: [] }
  });

  assert.equal(result.accounts[0].principal, 100000);
  assert.equal(result.accounts[0].outstanding, 100000);
  assert.deepEqual(result.accounts[0].rows.map((row) => row.id), ["using-opening"]);
});
