import assert from "node:assert/strict";
import test from "node:test";
import { buildOpeningPlan_, readFinanceRows_ } from "../src/ledger.js";

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
