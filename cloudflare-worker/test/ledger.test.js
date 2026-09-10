import assert from "node:assert/strict";
import test from "node:test";
import { readFinanceRows_ } from "../src/ledger.js";

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
