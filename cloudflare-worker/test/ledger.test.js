import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpeningPlan_,
  buildFundLoanLedger_,
  buildFinanceLedger_,
  buildPersonalLoanLedger_,
  buildPreviousMonthAdvanceLedger_,
  readFinanceRows_
} from "../src/ledger.js";

const OPENING_OPTIONS = {
  sourceAccountNames: ["Tiền Mặt", "Banking", "Grap Tiền Mặt", "Momo"],
  rentReserveAmount: 2150000,
  rolloverFundNames: ["Tiết kiệm dài hạn", "Đầu tư tài chính", "Hưởng thụ"]
};

function fundGroup(id, name, aliases = "") {
  return { id, properties: {
    "Tên Nhóm Quỹ": { title: [{ plain_text: name }] },
    "Tên Cũ": { rich_text: [{ plain_text: aliases }] },
    "Tài Khoản Giữ Quỹ": { relation: [{ id: "fund-account" }] }
  } };
}

const loanFunds = [
  fundGroup("essential", "Nhu cầu thiết yếu", "Thiết yếu"),
  fundGroup("savings", "Tiết kiệm dài hạn")
];

const loanCategories = [{ id: "loan", properties: {
  "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] }
} }];

test("explicit transfer account text conflicting with relations reports both values", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("cash", "Grap Tiền Mặt", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [transfer("conflict", "Chuyển từ Banking sang Momo", "cash", "momo", 500000, "2026-09-15", "")]
  });
  assert.deepEqual(result.dataIssues.map(({ type, details }) => ({ type, details })), [{
    type: "conflicting_data", details: ["Ghi chú: Banking; Từ Tài Khoản: Grap Tiền Mặt"]
  }]);
});

test("explicit destination conflicts merge per row and never compare the source with destination", () => {
  for (const direction of ["sang", "vào", "đến"]) {
    const result = buildFinanceLedger_({
      accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
      transferRows: [transfer("conflict", `Chuyển từ Momo ${direction} Banking`, "bank", "momo", 500000, "2026-09-15", "")]
    });
    assert.deepEqual(result.dataIssues.map((issue) => issue.details), [[
      "Ghi chú: Momo; Từ Tài Khoản: Banking", "Ghi chú: Banking; Đến Tài Khoản: Momo"
    ]]);
  }
});

test("explicit payment account compares only the payment relation for all income and expense kinds", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    incomeRows: [income("main", "Thu", "salary", "momo", 100, "2026-09-15", "Thanh toán bằng Banking")],
    otherIncomeRows: [income("other", "Thu khác", "gift", "momo", 200, "2026-09-15", "thanh toán bằng BANKING.")],
    expenseRows: [expense("expense", "Chi", "food", "momo", 300, "2026-09-15", "Thanh toán bằng Banking")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.details]), [
    ["expense", ["Ghi chú: Banking; Phương Thức Thanh Toán: Momo"]],
    ["main", ["Ghi chú: Banking; Phương Thức Thanh Toán: Momo"]],
    ["other", ["Ghi chú: Banking; Phương Thức Thanh Toán: Momo"]]
  ]);
});

test("vague text never overrides valid structured account and fund relations", () => {
  for (const title of ["Chuyển tiền chi tiêu", "Banking và Momo", "Chuyển từ ngân hàng lạ sang Momo", "Chuyển từ Bank sang Momo", "Chuyển từ Banking hoặc Momo sang Momo", "Chuyển từ Banking cá nhân sang Momo", "Chuyển từ Banking sang Momo"]) {
    const result = buildFinanceLedger_({
      accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
      transferRows: [transfer("valid", title, "bank", "momo", 500000, "2026-09-15", "")],
      expenseRows: [expense("valid-payment", "Momo", "food", "bank", 100, "2026-09-15", "Từ Momo sang Banking")]
    });
    assert.deepEqual(result.dataIssues, [], title);
  }
  const ambiguous = buildFinanceLedger_({
    accountRows: [account("a", "Banking", 0, 0), account("b", "BANKING", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [transfer("ambiguous", "Chuyển từ Banking sang Momo", "momo", "momo", 100, "2026-09-15", "")]
  });
  assert.deepEqual(ambiguous.dataIssues, []);
});

test("same-account Quỹ Momo requires structured group and one explicit counterpart even at zero amount", () => {
  for (const amount of [0, 999999]) {
    const result = buildFinanceLedger_({
      accountRows: [account("fund-account", "Quỹ Momo", 9000000, 1000000)], fundGroupRows: loanFunds,
      transferRows: [fundTransfer("missing", "Chuyển quỹ", amount, "")],
      historicalTransferRows: [fundTransfer("historical", "Chuyển quỹ", amount, "", "2026-08-01")]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.details]), [
      ["missing", "missing_required_data", ["Nhóm Quỹ", "Quỹ liên quan"]]
    ]);
  }
});

test("same-account Quỹ Momo distinguishes a same-fund conflict from absent or ambiguous counterpart", () => {
  for (const [title, groups, type] of [
    ["Mượn quỹ thiết yếu", loanFunds, "conflicting_data"],
    ["Chuyển từ quỹ thiết yếu sang quỹ thiết yếu", loanFunds, "conflicting_data"],
    ["Nhu cầu thiết yếu trả lại cho quỹ thiết yếu", loanFunds, "conflicting_data"],
    ["Chuyển quỹ", loanFunds, "missing_required_data"],
    ["Chuyển từ quỹ lạ", loanFunds, "missing_required_data"],
    ["Chuyển từ quỹ tiết kiệm", [...loanFunds, fundGroup("short", "Tiết kiệm ngắn hạn")], "missing_required_data"]
  ]) {
    const result = buildFinanceLedger_({
      accountRows: [account("fund-account", "Quỹ Momo", 0, 0)], fundGroupRows: groups,
      transferRows: [fundTransfer("row", title, 100000)]
    });
    assert.deepEqual(result.dataIssues.map((issue) => issue.type), [type], title);
    assert.match(result.dataIssues[0].details.join(" "), type === "conflicting_data" ? /Nhu cầu thiết yếu.*Nhóm Quỹ.*Nhu cầu thiết yếu/ : /Quỹ liên quan/);
  }
});

test("same-account Quỹ Momo resolves real fund aliases and compares the receiving fund", () => {
  for (const [title, group, conflict] of [
    ["Chuyển từ quỹ dự phòng sang quỹ thiết yếu", "essential", false],
    ["Chuyển từ quỹ dự phòng sang quỹ thiết yếu", "savings", true],
    ["Nhu cầu thiết yếu trả lại cho quỹ tiết kiệm", "essential", true]
  ]) {
    const result = buildFinanceLedger_({
      accountRows: [account("fund-account", "Quỹ Momo", 0, 0)],
      fundGroupRows: [...loanFunds, fundGroup("reserve", "Dự trữ", "Dự phòng")],
      transferRows: [fundTransfer("row", title, 200000, group)]
    });
    assert.deepEqual(result.dataIssues.map((issue) => issue.type), conflict ? ["conflicting_data"] : [], title);
    if (conflict) assert.match(result.dataIssues[0].details.join(" "), /Nhu cầu thiết yếu.*Tiết kiệm dài hạn|Tiết kiệm dài hạn.*Nhu cầu thiết yếu/);
  }
});

test("same-account Quỹ Momo requires explicit repayment source even when history has one borrower", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("fund-account", "Quỹ Momo", 0, 0)], fundGroupRows: loanFunds,
    historicalTransferRows: [fundTransfer("old", "Mượn quỹ tiết kiệm", 200000, "essential", "2026-08-01")],
    transferRows: [fundTransfer("repay", "Trả lại cho quỹ tiết kiệm", 200000, "savings")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.details]), [
    ["repay", "missing_required_data", ["Quỹ liên quan"]]
  ]);
  assert.equal(result.fundLoans.loans[0].outstanding, 0);
});

test("explicit conflict validation excludes historical rows and does not replace missing-field issues", () => {
  const row = transfer("current", "Chuyển từ Banking sang Momo", "momo", "momo", 123, "2026-09-15", "");
  delete row.properties["Loại Chuyển Đổi"];
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [row],
    historicalTransferRows: [transfer("old", "Chuyển từ Banking sang Momo", "momo", "momo", 123, "2026-08-15", "")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.amount]), [
    ["current", "missing_required_data", 123], ["current", "conflicting_data", 123]
  ]);
});

test("review task 4 negated account directions and payment never become positive conflicts", () => {
  for (const note of ["Không thanh toán bằng Banking", "Không phải thanh toán bằng Banking", "Thanh toán không phải bằng Banking"]) {
    const result = buildFinanceLedger_({
      accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
      expenseRows: [expense("row", "Chi", "food", "momo", 100, "2026-09-15", note)]
    });
    assert.deepEqual(result.dataIssues, [], note);
  }
  for (const title of ["Không phải chuyển từ Banking sang Momo", "Không chuyển từ Momo sang Banking", "Chuyển từ Momo không phải sang Banking"]) {
    const result = buildFinanceLedger_({
      accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
      transferRows: [transfer("row", title, "momo", "momo", 100, "2026-09-15", "")]
    });
    assert.deepEqual(result.dataIssues, [], title);
  }
});

test("review task 4 negated fund actions cannot supply source destination or loan evidence", () => {
  for (const [title, group] of [
    ["Không mượn quỹ tiết kiệm", "savings"],
    ["Không phải mượn quỹ tiết kiệm", "essential"],
    ["Không trả lại cho quỹ tiết kiệm", "essential"],
    ["Nhu cầu thiết yếu không phải trả lại cho quỹ tiết kiệm", "essential"],
    ["Không hoàn lại cho quỹ tiết kiệm", "essential"],
    ["Không chuyển từ quỹ thiết yếu sang quỹ tiết kiệm", "essential"]
  ]) {
    const result = buildFinanceLedger_({
      accountRows: [account("fund-account", "Quỹ Momo", 0, 0)], fundGroupRows: loanFunds,
      transferRows: [fundTransfer("row", title, 100, group)]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.type, issue.details]), [
      ["missing_required_data", ["Quỹ liên quan"]]
    ], title);
    assert.deepEqual(result.fundLoans.loans, [], title);
  }
});

test("review task 4 destination conflict retains the independent missing counterpart issue", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("fund-account", "Quỹ Momo", 0, 0)], fundGroupRows: loanFunds,
    transferRows: [fundTransfer("row", "Trả lại cho quỹ tiết kiệm", 100, "essential")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.type, issue.details]), [
    ["conflicting_data", ["Nội dung: Tiết kiệm dài hạn; Nhóm Quỹ: Nhu cầu thiết yếu"]],
    ["missing_required_data", ["Quỹ liên quan"]]
  ]);
});

test("review task 4 same-fund history suppression stays inside the validated Quỹ Momo path", () => {
  for (const [from, to, expected] of [
    ["fund-account", "fund-account", "conflicting_data"],
    ["bank", "momo", "history_not_found"],
    ["momo", "momo", "history_not_found"]
  ]) {
    const row = fundTransfer("row", "Nhu cầu thiết yếu trả lại cho quỹ thiết yếu", 100);
    row.properties["Từ Tài Khoản"] = { relation: [{ id: from }] };
    row.properties["Đến Tài Khoản"] = { relation: [{ id: to }] };
    const result = buildFinanceLedger_({
      accountRows: [account("fund-account", "Quỹ Momo", 0, 0), account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
      fundGroupRows: loanFunds, transferRows: [row]
    });
    assert.deepEqual(result.dataIssues.map((issue) => issue.type), [expected], `${from} -> ${to}`);
  }
});

test("review task 4 unrelated fee negation retains positive transfer direction after a comma", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [transfer("row", "Không tính phí, chuyển từ Banking sang Momo", "momo", "momo", 100, "2026-09-15", "")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => issue.details), [["Ghi chú: Banking; Từ Tài Khoản: Momo"]]);
});

test("review task 4 unrelated fee negation retains positive payment after a comma", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    expenseRows: [expense("row", "Chi", "food", "momo", 100, "2026-09-15", "Không thu phí, thanh toán bằng Banking")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => issue.details), [["Ghi chú: Banking; Phương Thức Thanh Toán: Momo"]]);
});

test("review task 4 unrelated interest negation retains positive fund opening after a comma", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("fund-account", "Quỹ Momo", 0, 0)], fundGroupRows: loanFunds,
    transferRows: [fundTransfer("row", "Không tính lãi, mượn quỹ tiết kiệm", 100000)]
  });
  assert.deepEqual(result.dataIssues, []);
  assert.equal(result.fundLoans.loans[0].lender, "Tiết kiệm dài hạn");
  assert.equal(result.fundLoans.loans[0].principal, 100000);
});

test("review task 4 comma negation boundary preserves positive repayments and numeric commas", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("fund-account", "Quỹ Momo", 0, 0), account("bank", "Banking", 0, 0)], fundGroupRows: loanFunds,
    historicalTransferRows: [fundTransfer("loan", "Mượn quỹ tiết kiệm", 100000, "essential", "2026-08-01")],
    historicalExpenseRows: [expense("advance", "Dùng tiền tháng trước", "food", "bank", 100000, "2026-08-01")],
    transferRows: [fundTransfer("repay", "Không tính lãi, Nhu cầu thiết yếu trả lại 100,000 cho quỹ tiết kiệm", 100000, "savings")],
    otherIncomeRows: [income("refund", "Không tính phí, Hoàn lại Banking", "refund", "bank", 100000, "2026-09-02")]
  });
  assert.deepEqual(result.dataIssues, []);
  assert.equal(result.fundLoans.loans[0].outstanding, 0);
});

test("current personal repayments report history_not_found only after all earlier principal", () => {
  for (const amount of [500000, 1100000]) {
    const result = buildFinanceLedger_({
      categoryRows: loanCategories,
      historicalOtherIncomeRows: amount === 500000 ? [] : [
        income("old-a", "Tố cho mượn tiền", "loan", "momo", 400000, "2026-07-01"),
        income("old-b", "Tố cho mượn tiền", "loan", "momo", 600000, "2026-08-01")
      ],
      expenseRows: [expense("repay", "Trả nợ Tố mượn tháng trước", "loan", "bank", amount, "2026-09-07")]
    });
    assert.deepEqual(result.dataIssues.map(({ type, rowId, details, amount }) => ({ type, rowId, details, amount })), [{
      type: "history_not_found", rowId: "repay", amount,
      details: ["Không tìm thấy bản ghi gốc liên quan"]
    }]);
  }
});

test("personal reconciliation consumes older openings and excludes historical issues", () => {
  const result = buildFinanceLedger_({
    categoryRows: loanCategories,
    historicalOtherIncomeRows: [
      income("old-a", "Tố cho mượn tiền", "loan", "momo", 400000, "2026-07-01"),
      income("old-b", "Tố cho mượn tiền", "loan", "momo", 600000, "2026-08-01"),
      income("old-unmatched", "Lan trả nợ", "loan", "bank", 100000, "2026-08-02")
    ],
    expenseRows: [expense("repay", "Trả nợ Tố mượn trước đó", "loan", "bank", 1000000, "2026-09-07")],
    otherIncomeRows: [income("return", "Tuấn trả nợ", "loan", "bank", 200000, "2026-09-08")]
  });
  assert.deepEqual(result.personalLoans.liabilities.map((item) => item.outstanding), [0, 0]);
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type]), [["return", "history_not_found"]]);
});

test("missing personal party is required data but unrecognized prose is not", () => {
  const result = buildFinanceLedger_({
    categoryRows: loanCategories,
    expenseRows: [
      expense("missing", "Trả nợ", "loan", "bank", 100000, "2026-09-07"),
      expense("unrecognized", "Giao dịch đã thống nhất", "loan", "bank", 100000, "2026-09-07")
    ]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.details]), [
    ["missing", "missing_required_data", ["Người liên quan"]]
  ]);
});

test("fund repayment scans multiple matching openings without an excess category", () => {
  for (const amount of [1000000, 1100000]) {
    const result = buildFinanceLedger_({
      fundGroupRows: loanFunds,
      historicalTransferRows: [
        fundTransfer("a", "Mượn quỹ tiết kiệm", 400000, "essential", "2026-07-01"),
        fundTransfer("b", "Mượn quỹ tiết kiệm", 600000, "essential", "2026-08-01")
      ],
      transferRows: [fundTransfer("repay", "Trả lại cho quỹ tiết kiệm", amount, "savings", "2026-09-07")]
    });
    assert.deepEqual(result.fundLoans.loans.map((item) => item.outstanding), [0, 0]);
    assert.deepEqual(result.dataIssues.map((issue) => [issue.type, issue.details]), amount === 1000000 ? [] : [
      ["history_not_found", ["Không tìm thấy bản ghi gốc liên quan"]]
    ]);
    assert.equal(JSON.stringify(result).includes("excess-fund-repayment"), false);
  }
});

test("fund reconciliation distinguishes absent history missing party and explicit conflict", () => {
  const result = buildFinanceLedger_({
    fundGroupRows: loanFunds,
    transferRows: [
      fundTransfer("history", "Trả nợ cho quỹ tiết kiệm", 100000, "savings"),
      fundTransfer("missing", "Trả lại tiền", 100000, "savings"),
      fundTransfer("conflict", "Trả lại cho quỹ tiết kiệm", 100000, "essential")
    ]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type]), [
    ["conflict", "conflicting_data"], ["history", "history_not_found"], ["missing", "missing_required_data"]
  ]);
  assert.match(result.dataIssues[0].details.join(" "), /Tiết kiệm dài hạn.*Nhu cầu thiết yếu/);
  assert.deepEqual(result.dataIssues[2].details, ["Quỹ liên quan"]);
});

test("explicit reimbursements distinguish beneficiary history and conflicting beneficiaries", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    otherIncomeRows: [
      income("history", "Hoàn lại Banking", "refund", "bank", 100000, "2026-09-07"),
      income("missing", "Cấp bù", "refund", "bank", 100000, "2026-09-07"),
      income("conflict", "Hoàn lại Banking và Momo", "refund", "bank", 100000, "2026-09-07")
    ]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type]), [
    ["conflict", "conflicting_data"], ["history", "history_not_found"], ["missing", "missing_required_data"]
  ]);
  assert.match(result.dataIssues[0].details.join(" "), /Banking.*Momo/);
  assert.deepEqual(result.dataIssues[2].details, ["Tài khoản hoặc quỹ cần hoàn"]);
});

test("reimbursement uses explicit historical obligations without calculated remainder issues", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0)],
    historicalExpenseRows: [expense("advance", "Dùng tiền tháng trước", "food", "bank", 50000, "2026-07-01")],
    otherIncomeRows: [income("reimburse", "Cấp bù Banking", "refund", "bank", 100000, "2026-09-07")],
    options: { sourceAccountNames: ["Banking"] }
  });
  assert.deepEqual(result.dataIssues, []);
  assert.equal(result.previousMonthAdvances.totalOutstanding, 0);
});

test("source funding shortfalls never become reconciliation warning rows", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0)],
    expenseRows: [expense("dinner", "Ăn tối", "food", "bank", 35000, "2026-09-07")],
    transferRows: [transfer("move", "Chuyển tiền", "bank", "momo", 100000, "2026-09-08", "")],
    options: { sourceAccountNames: ["Banking"] }
  });
  assert.deepEqual(result.dataIssues, []);
  assert.deepEqual(result.previousMonthAdvances.unmatchedSources, []);
});

test("reimbursement searches chronology and cannot reuse a settled obligation or infer one from a balance", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 500000, 500000)],
    historicalExpenseRows: [expense("old-spending", "Ăn tối", "food", "bank", 100000, "2026-06-01")],
    expenseRows: [expense("advance", "Dùng tiền tháng trước", "food", "bank", 50000, "2026-09-05")],
    otherIncomeRows: [
      income("early", "Hoàn lại Banking", "refund", "bank", 100000, "2026-09-01"),
      income("settle", "Hoàn lại Banking", "refund", "bank", 100000, "2026-09-06"),
      income("repeat", "Hoàn lại Banking", "refund", "bank", 100000, "2026-09-07")
    ]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type]), [
    ["early", "history_not_found"], ["repeat", "history_not_found"]
  ]);
});

test("missing fund evidence merges with required fields and history language is not a person", () => {
  const incomplete = fundTransfer("fund", "Mượn tiền", 100000, "");
  delete incomplete.properties["Loại Chuyển Đổi"];
  const result = buildFinanceLedger_({
    categoryRows: loanCategories, fundGroupRows: loanFunds,
    transferRows: [incomplete],
    expenseRows: [expense("person", "Trả nợ tháng trước", "loan", "bank", 100000, "2026-09-07")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.details]), [
    ["fund", "missing_required_data", ["Loại Chuyển Đổi", "Nhóm Quỹ", "Quỹ liên quan"]],
    ["person", "missing_required_data", ["Người liên quan"]]
  ]);
});

test("reimbursement transfer reports an explicit beneficiary conflicting with its receiving relation", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    transferRows: [transfer("conflict", "Cấp bù Banking", "momo", "momo", 100000, "2026-09-07", "")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.type, issue.details]), [
    ["conflicting_data", ["Bên cần hoàn: Banking; Quan hệ: Momo"]]
  ]);
});

test("personal fallback issues retain the original current Notion title", () => {
  const result = buildFinanceLedger_({
    otherIncomeRows: [income("return", "Nhận chuyển khoản", "unknown-loan", "bank", 100000, "2026-09-07", "Tuấn trả nợ")]
  });
  assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.title, issue.amount, issue.type]), [
    ["return", "Nhận chuyển khoản", 100000, "history_not_found"]
  ]);
});

test("an unresolved fund phrase does not invent a conflict with the only known borrower", () => {
  const result = buildFinanceLedger_({
    fundGroupRows: loanFunds,
    transferRows: [fundTransfer("unknown", "Quỹ lạ trả lại cho quỹ tiết kiệm từ quỹ thiết yếu", 100000, "savings")]
  });
  assert.deepEqual(result.dataIssues, []);
});

test("review reimbursement account conflicts apply to income and expense even with matching history", () => {
  for (const kind of ["incomeRows", "otherIncomeRows", "expenseRows"]) {
    const page = kind === "expenseRows"
      ? expense("refund", "Hoàn lại Banking", "refund", "momo", 100000, "2026-09-07")
      : income("refund", "Hoàn lại Banking", "refund", "momo", 100000, "2026-09-07");
    const result = buildFinanceLedger_({
      accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
      historicalExpenseRows: [expense("advance", "Dùng tiền tháng trước", "food", "bank", 100000, "2026-08-01")],
      [kind]: [page]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.type, issue.details]), [
      ["conflicting_data", ["Bên cần hoàn: Banking; Quan hệ: Momo"]]
    ], kind);
  }
});

test("review chronology alone does not identify a fund or reimbursement beneficiary", () => {
  for (const suffix of ["tháng trước", "tháng 8", "trước đó", "ngày 14/08/2026", "tháng 8 năm 2026", "hôm qua"]) {
    const result = buildFinanceLedger_({
      fundGroupRows: loanFunds,
      accountRows: [account("bank", "Banking", 0, 0)],
      transferRows: [
        fundTransfer("open", `Mượn tiền ${suffix}`, 100000),
        fundTransfer("repay", `Trả lại tiền ${suffix}`, 100000, "savings")
      ],
      otherIncomeRows: [income("refund", `Hoàn lại ${suffix}`, "refund", "bank", 100000, "2026-09-02")]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.details]), [
      ["open", "missing_required_data", ["Quỹ liên quan"]],
      ["repay", "missing_required_data", ["Quỹ liên quan"]],
      ["refund", "missing_required_data", ["Tài khoản hoặc quỹ cần hoàn"]]
    ], suffix);
  }
  const unknown = buildFinanceLedger_({
    fundGroupRows: loanFunds,
    transferRows: [fundTransfer("unknown", "Mượn tiền của quỹ chưa đặt tên", 100000)],
    otherIncomeRows: [income("refund", "Hoàn lại nơi đã ứng", "refund", "bank", 100000, "2026-09-02")]
  });
  assert.deepEqual(unknown.dataIssues, []);
});

test("review chronology alone cannot become a personal repayment counterparty", () => {
  for (const suffix of ["tháng 8", "tháng 08/2026", "tháng 8 năm 2026", "ngày 14/08/2026", "ngày 2026-08-14", "hôm qua", "trước đó"]) {
    const result = buildFinanceLedger_({
      categoryRows: loanCategories,
      expenseRows: [expense("repay", `Trả nợ ${suffix}`, "loan", "bank", 100000, "2026-09-07")]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.type, issue.details]), [
      ["missing_required_data", ["Người liên quan"]]
    ], suffix);
    assert.deepEqual(result.personalLoans.repayments, []);
  }
});

test("review invalid historical dates cannot establish earlier principal in any ledger family", () => {
  for (const date of ["", "not-a-date", "2026-02-30", "2026-08-01"]) {
    const result = buildFinanceLedger_({
      categoryRows: loanCategories, fundGroupRows: loanFunds,
      accountRows: [account("bank", "Banking", 0, 0)],
      historicalExpenseRows: [expense("advance", "Dùng tiền tháng trước", "food", "bank", 100000, date)],
      historicalOtherIncomeRows: [income("personal-open", "Tố cho mượn tiền", "loan", "bank", 100000, date)],
      historicalTransferRows: [fundTransfer("fund-open", "Mượn quỹ tiết kiệm", 100000, "essential", date)],
      otherIncomeRows: [income("refund", "Hoàn lại Banking", "refund", "bank", 100000, "2026-09-07")],
      expenseRows: [expense("personal-pay", "Trả nợ Tố", "loan", "bank", 100000, "2026-09-07")],
      transferRows: [fundTransfer("fund-pay", "Trả lại cho quỹ tiết kiệm", 100000, "savings", "2026-09-07")]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type]), date === "2026-08-01" ? [] : [
      ["fund-pay", "history_not_found"], ["personal-pay", "history_not_found"], ["refund", "history_not_found"]
    ], date);
  }
});

test("review round 2 numeric-only chronology is never a party in any reconciliation family", () => {
  for (const suffix of ["14/08/2026", "08/2026", "14-08-2026", "08-2026", "2026-08-14"]) {
    const result = buildFinanceLedger_({
      categoryRows: loanCategories, fundGroupRows: loanFunds,
      accountRows: [account("bank", "Banking", 0, 0)],
      expenseRows: [expense("person", `Trả nợ ${suffix}`, "loan", "bank", 100000, "2026-09-07")],
      transferRows: [
        fundTransfer("open", `Mượn tiền ${suffix}`, 100000),
        fundTransfer("repay", `Trả lại tiền ${suffix}`, 100000, "savings")
      ],
      otherIncomeRows: [income("refund", `Hoàn lại ${suffix}`, "refund", "bank", 100000, "2026-09-07")]
    });
    assert.deepEqual(result.dataIssues.map((issue) => [issue.rowId, issue.type, issue.details]), [
      ["open", "missing_required_data", ["Quỹ liên quan"]],
      ["repay", "missing_required_data", ["Quỹ liên quan"]],
      ["person", "missing_required_data", ["Người liên quan"]],
      ["refund", "missing_required_data", ["Tài khoản hoặc quỹ cần hoàn"]]
    ], suffix);
    assert.deepEqual(result.personalLoans.repayments, []);
  }
});

test("review round 2 invalid current dates retain aggregates but cannot establish earlier principal", () => {
  for (const date of ["", "not-a-date", "2026-02-30", "2026-09-01"]) {
    const valid = date === "2026-09-01";
    const result = buildFinanceLedger_({
      categoryRows: loanCategories, fundGroupRows: loanFunds,
      accountRows: [account("bank", "Banking", 0, 0)],
      expenseRows: [
        expense("advance", "Dùng tiền tháng trước", "food", "bank", 100000, date),
        expense("personal-pay", "Trả nợ Tố", "loan", "bank", 100000, "2026-09-07")
      ],
      otherIncomeRows: [
        income("personal-open", "Tố cho mượn tiền", "loan", "bank", 100000, date),
        income("refund", "Hoàn lại Banking", "refund", "bank", 100000, "2026-09-07")
      ],
      transferRows: [
        fundTransfer("fund-open", "Mượn quỹ tiết kiệm", 100000, "essential", date),
        fundTransfer("fund-pay", "Trả lại cho quỹ tiết kiệm", 100000, "savings", "2026-09-07")
      ],
      options: { sourceAccountNames: ["Banking"] }
    });
    assert.deepEqual(result.dataIssues.filter((issue) => issue.type === "history_not_found").map((issue) => issue.rowId),
      valid ? [] : ["fund-pay", "personal-pay", "refund"], date);
    if (date === "") {
      assert.deepEqual(result.dataIssues.filter((issue) => issue.type === "missing_required_data").map((issue) => [issue.rowId, issue.details]), [
        ["advance", ["Ngày"]], ["fund-open", ["Ngày"]], ["personal-open", ["Ngày"]]
      ]);
    }
    assert.equal(result.rows.length, 6);
    assert.equal(result.rows.find((row) => row.id === "advance").amount, 100000);
    assert.equal(result.fundLoans.allocationAdjustments.essential, 100000);
    assert.equal(result.personalLoans.liabilities[0].principal, 100000);
    assert.equal(result.previousMonthAdvances.accounts[0].principal, 100000);
  }
});

function fundTransfer(id, title, amount, groupId = "essential", date = "2026-09-01") {
  const page = transfer(id, title, "fund-account", "fund-account", amount, date, "");
  page.properties["Nhóm Quỹ"] = { relation: groupId ? [{ id: groupId }] : [] };
  return page;
}

test("same-account savings loan funds rent and remains a separate 750000 debt", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
    fundTransfer("borrow-750", "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", 750000)
  ] }), loanFunds);
  assert.deepEqual(result.allocationAdjustments, { essential: 750000 });
  assert.deepEqual(result.loans, [{
    borrowerGroupId: "essential", borrowerGroupName: "Nhu cầu thiết yếu",
    lender: "Tiết kiệm dài hạn", principal: 750000, repaid: 0,
    outstanding: 750000, openedBy: "borrow-750", repaymentRows: []
  }]);
  assert.deepEqual(result.unmatched, []);
});

test("finance ledger passes opening sources and loan category names to its component ledgers", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 100000, 9999999)],
    categoryRows: [{ id: "loan", properties: { "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] } } }],
    expenseRows: [expense("lend", "Cho cháu Tuấn mượn", "loan", "bank", 100000, "2026-09-01")],
    // The current caller supplies expense-category names only. Keep this distinct ID visible.
    otherIncomeRows: [income("grab", "Grab thu nhập", "other-income-category", "bank", 900000, "2026-09-02")],
    options: { sourceAccountNames: ["Banking"], rentReserveAmount: 0 }
  });
  assert.equal(result.openingPlan.sourceTotal, 100000);
  assert.equal(result.personalLoans.receivables[0].sourceAccountName, "Banking");
  assert.equal(result.personalLoans.receivables[0].outstanding, 100000);
  assert.equal(result.previousMonthAdvances.totalOutstanding, 100000);
  assert.equal(result.rows.find((row) => row.id === "grab").categoryId, "other-income-category");
});

test("historical fund loans reconcile without changing current allocation", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
    fundTransfer("july-borrow", "Mượn quỹ tiết kiệm", 750000, "essential", "2026-07-10"),
    fundTransfer("september-repay", "Nhu cầu thiết yếu trả lại 750.000 cho quỹ tiết kiệm", 750000, "savings", "2026-09-07")
  ] }), loanFunds, { currentRowIds: new Set(["september-repay"]) });

  assert.equal(result.loans[0].outstanding, 0);
  assert.deepEqual(result.allocationAdjustments, {});
  assert.deepEqual(result.balanceAdjustments, { essential: -750000, savings: 750000 });
});

test("historical loan reconciliation excludes old rows from current ledger output", () => {
  const result = buildFinanceLedger_({
    accountRows: [account("bank", "Banking", 0, 0), account("momo", "Momo", 0, 0)],
    categoryRows: [{ id: "loan", properties: {
      "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] }
    } }],
    historicalOtherIncomeRows: [
      income("july-loan", "Tố cho mượn tiền", "loan", "momo", 1000000, "2026-07-10")
    ],
    historicalExpenseRows: [
      expense("august-expense", "Ăn tối", "food", "bank", 35000, "2026-08-09")
    ],
    expenseRows: [
      expense("september-repayment", "Trả nợ Tố mượn tháng trước", "loan", "bank", 1000000, "2026-09-07")
    ]
  });

  assert.equal(result.personalLoans.liabilities[0].outstanding, 0);
  assert.deepEqual(result.rows.map((row) => row.id), ["september-repayment"]);
  assert.equal(result.dataIssues.some((issue) => issue.rowId === "august-expense"), false);
});

test("current rows report their exact missing required Notion properties once", () => {
  const incomeRow = income("income", "Thu chính", "", "", 100000, "2026-09-02");
  const otherRow = income("other", "Thu khác", "", "", 200000, "2026-09-03");
  const expenseRow = expense("expense", "Ăn tối", "", "", 35000, "2026-09-01");
  const transferRow = transfer("transfer", "Chuyển tiền", "", "", 50000, "2026-09-04", "");
  transferRow.properties["Loại Chuyển Đổi"] = { select: null };

  const { dataIssues } = buildFinanceLedger_({
    accountRows: [],
    categoryRows: [],
    incomeRows: [incomeRow],
    otherIncomeRows: [otherRow],
    expenseRows: [expenseRow],
    transferRows: [transferRow]
  });

  assert.deepEqual(dataIssues.map(({ rowId, type, details }) => ({ rowId, type, details })), [
    { rowId: "expense", type: "missing_required_data", details: ["Loại Chi Phí", "Phương Thức Thanh Toán"] },
    { rowId: "income", type: "missing_required_data", details: ["Loại Khoản Thu", "Phương Thức Thanh Toán"] },
    { rowId: "other", type: "missing_required_data", details: ["Loại Khoản Thu", "Phương Thức Thanh Toán"] },
    { rowId: "transfer", type: "missing_required_data", details: ["Loại Chuyển Đổi", "Từ Tài Khoản", "Đến Tài Khoản"] }
  ]);
});

test("current rows report missing common required Notion properties with the stored zero amount", () => {
  const row = expense("missing-common", "", "food", "cash", 0, "");
  row.properties["Số Tiền"] = { number: null };

  const { dataIssues } = buildFinanceLedger_({ expenseRows: [row] });

  assert.deepEqual(dataIssues, [{
    type: "missing_required_data",
    rowId: "missing-common",
    date: "",
    createdTime: "",
    title: "",
    amount: 0,
    details: ["Nội dung", "Ngày", "Số Tiền"]
  }]);
});

test("current rows treat a stored zero as an amount, not missing data", () => {
  const row = expense("zero-amount", "Ăn tối", "", "cash", 0, "2026-09-05");

  const { dataIssues } = buildFinanceLedger_({ expenseRows: [row] });

  assert.deepEqual(dataIssues, [{
    type: "missing_required_data",
    rowId: "zero-amount",
    date: "2026-09-05",
    createdTime: "",
    title: "Ăn tối",
    amount: 0,
    details: ["Loại Chi Phí"]
  }]);
});

test("data issues sort same-date rows by creation time then row ID", () => {
  const rows = [
    timed(expense("row-b", "B", "", "cash", 1000, "2026-09-05"), "2026-09-05T08:00:00.000Z"),
    timed(expense("row-a", "A", "", "cash", 1000, "2026-09-05"), "2026-09-05T08:00:00.000Z"),
    timed(expense("row-earlier", "Earlier", "", "cash", 1000, "2026-09-05"), "2026-09-05T07:00:00.000Z")
  ];

  const { dataIssues } = buildFinanceLedger_({ expenseRows: rows });

  assert.deepEqual(dataIssues.map((issue) => issue.rowId), ["row-earlier", "row-a", "row-b"]);
});

test("Grab net income does not require expense-only properties", () => {
  const result = buildFinanceLedger_({
    incomeRows: [income("grab-net", "Thu Nhập Ròng Grab (App)", "goalRelationPageId", "momo", 286581, "2026-09-08")]
  });

  assert.equal(result.dataIssues.some((issue) => issue.rowId === "grab-net"), false);
});

test("integrated unknown income categories use explicit personal-loan wording", () => {
  const result = buildFinanceLedger_({
    categoryRows: [{ id: "expense-loan", properties: { "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] } } }],
    expenseRows: [expense("lend-tuan", "Cho cháu Tuấn mượn", "expense-loan", "bank", 100000, "2026-09-01")],
    otherIncomeRows: [
      income("borrow-em", "Em cho mượn tiền", "income-loan", "bank", 500000, "2026-09-02", "Cháu Tuấn trả nợ"),
      income("return-tuan", "Cháu Tuấn trả nợ", "income-return", "momo", 100000, "2026-09-03"),
      income("generic", "Khoản thu khác", "income-loan", "bank", 500000, "2026-09-04"),
      income("note-lan", "Khoản thu khác", "income-loan", "bank", 200000, "2026-09-05", "Cô Lan cho mượn tiền"),
      income("ambiguous-shared-category", "Em cho mượn tiền và Tố trả nợ", "income-loan", "bank", 500000, "2026-09-06")
    ]
  });
  assert.deepEqual(result.personalLoans.liabilities.map(({ party, outstanding }) => ({ party, outstanding })), [
    { party: "em", outstanding: 500000 }, { party: "cô lan", outstanding: 200000 }
  ]);
  assert.equal(result.personalLoans.receivables[0].outstanding, 0);
  assert.deepEqual(result.personalLoans.receivables[0].repaymentRows, ["return-tuan"]);
  assert.equal(result.personalLoans.repayments.length, 1);
  assert.deepEqual(result.personalLoans.unmatched.map((row) => row.id), ["ambiguous-shared-category"]);
});

test("integrated unknown income fallback keeps unresolved wording unmatched and known categories authoritative", () => {
  const result = buildFinanceLedger_({
    categoryRows: [{ id: "known-other", properties: { "Loại Chi Phí": { title: [{ plain_text: "Khác" }] } } }],
    otherIncomeRows: [
      income("known", "Em cho mượn tiền", "known-other", "bank", 500000, "2026-09-01"),
      income("generic", "Khoản thu khác", "unknown", "bank", 500000, "2026-09-02"),
      income("missing-party", "Tiền mượn", "unknown", "bank", 500000, "2026-09-03"),
      income("ambiguous", "Em cho mượn tiền và Tố trả nợ", "unknown", "bank", 500000, "2026-09-04")
    ]
  });
  assert.deepEqual(result.personalLoans.liabilities, []);
  assert.deepEqual(result.personalLoans.receivables, []);
  assert.deepEqual(result.personalLoans.repayments, []);
  assert.deepEqual(result.personalLoans.unmatched.map((row) => row.id), ["missing-party", "ambiguous"]);
  assert.deepEqual(result.unmatched.map((row) => row.id), ["missing-party", "ambiguous"]);
});

test("fund repayment rejects conflicting borrower identities before and after the action", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
    fundTransfer("borrow", "Mượn quỹ tiết kiệm", 750000),
    fundTransfer("conflicting-pair", "Nhu cầu thiết yếu trả lại 200.000 cho quỹ tiết kiệm từ Giáo dục", 200000, "savings", "2026-09-02")
  ] }), [...loanFunds, fundGroup("education", "Giáo dục")]);
  assert.equal(result.loans[0].outstanding, 750000);
  assert.equal(result.loans[0].repaid, 0);
  assert.deepEqual(result.loans[0].repaymentRows, []);
  assert.equal(result.unmatched[0].id, "conflicting-pair");
});

test("fund repayment accepts two borrower identities only when their resolved aliases agree", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
    fundTransfer("borrow", "Mượn quỹ tiết kiệm", 750000),
    fundTransfer("same-pair", "Nhu cầu thiết yếu trả lại 200.000 cho quỹ tiết kiệm từ quỹ thiết yếu", 200000, "savings", "2026-09-02")
  ] }), loanFunds);
  assert.equal(result.loans[0].outstanding, 550000);
  assert.deepEqual(result.unmatched, []);
});

test("same-account savings loan ignores unrelated income and balances", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({
    transferRows: [fundTransfer("borrow", "Lấy từ quỹ tiết kiệm để trả tiền phòng", 750000)],
    incomeRows: [income("grab", "Grab thu nhập ròng", "net", "momo", 900000, "2026-09-02")],
    otherIncomeRows: [income("momo", "Momo nhận tiền", "other", "momo", 800000, "2026-09-03")]
  }), loanFunds);
  assert.equal(result.loans[0].outstanding, 750000);
});

test("explicit later lender repayment reduces only that fund loan", () => {
  const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
    fundTransfer("borrow", "Mượn quỹ tiết kiệm chuyển sang tiền phòng", 750000),
    fundTransfer("repay", "Trả lại 200.000 cho quỹ tiết kiệm", 200000, "savings", "2026-09-02")
  ] }), loanFunds);
  assert.equal(result.loans[0].outstanding, 550000);
  assert.equal(result.loans[0].repaid, 200000);
  assert.deepEqual(result.loans[0].repaymentRows, ["repay"]);
  assert.deepEqual(result.allocationAdjustments, { essential: 750000 });
});

test("fund lender resolution accepts full aliases and rejects ambiguous or unknown prefixes", () => {
  for (const [label, groups, expected] of [
    ["quỹ dự phòng", [...loanFunds, fundGroup("reserve", "Dự trữ", "Dự phòng")], "Dự trữ"],
    ["quỹ tiết kiệm", [...loanFunds, fundGroup("short", "Tiết kiệm ngắn hạn")], null],
    ["quỹ tiết k", loanFunds, null],
    ["quỹ lạ", loanFunds, null]
  ]) {
    const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
      fundTransfer("borrow", `Mượn tiền của ${label} chuyển sang tiền phòng`, 750000)
    ] }), groups);
    if (expected) assert.equal(result.loans[0].lender, expected);
    else {
      assert.deepEqual(result.loans, []);
      assert.deepEqual(result.allocationAdjustments, {});
      assert.equal(result.unmatched[0].id, "borrow");
    }
  }
});

test("explicit pair repays FIFO while ambiguous missing or conflicting identities stay unmatched", () => {
  const groups = [...loanFunds, fundGroup("education", "Giáo dục")];
  const result = buildFundLoanLedger_(readFinanceRows_({ transferRows: [
    fundTransfer("early", "Trả nợ cho quỹ tiết kiệm", 10000, "savings", "2026-08-31"),
    fundTransfer("a", "Mượn quỹ tiết kiệm", 100000),
    fundTransfer("b", "Mượn quỹ tiết kiệm", 200000, "essential", "2026-09-02"),
    fundTransfer("c", "Mượn quỹ tiết kiệm", 300000, "education", "2026-09-03"),
    fundTransfer("ambiguous", "Trả lại cho quỹ tiết kiệm", 100000, "savings", "2026-09-04"),
    fundTransfer("conflict", "Nhu cầu thiết yếu trả nợ cho quỹ tiết kiệm", 100000, "education", "2026-09-05"),
    fundTransfer("pair", "Nhu cầu thiết yếu hoàn lại 150.000 cho quỹ tiết kiệm", 150000, "savings", "2026-09-06"),
    fundTransfer("missing", "Trả lại tiền", 100000, "savings", "2026-09-07"),
    fundTransfer("unknown-borrower", "Quỹ lạ trả nợ cho quỹ tiết kiệm", 100000, "savings", "2026-09-08")
  ] }), groups);
  assert.deepEqual(result.loans.map((loan) => loan.outstanding), [0, 150000, 300000]);
  assert.deepEqual(result.loans.slice(0, 2).map((loan) => loan.repaymentRows), [["pair"], ["pair"]]);
  assert.deepEqual(result.unmatched.map((row) => row.id), ["early", "ambiguous", "conflict", "missing", "unknown-borrower"]);
});

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
      amount: 500000, amountPresent: true, date: "2026-09-01", datePresent: true, titlePresent: true, createdTime: "2026-09-01T05:00:00.000Z",
      categoryId: "net-income", accountId: "momo", fromAccountId: "", toAccountId: "", fundGroupId: "essential", transferType: ""
    },
    {
      id: "other-income-row", kind: "otherIncome", title: "Doanh thu gộp Grab", note: "Khách chuyển khoản",
      text: "Doanh thu gộp Grab | Khách chuyển khoản", normalizedText: "doanh thu gop grab | khach chuyen khoan",
      amount: 700000, amountPresent: true, date: "2026-09-02", datePresent: true, titlePresent: true, createdTime: "2026-09-02T05:00:00.000Z",
      categoryId: "gross-grab", accountId: "banking", fromAccountId: "", toAccountId: "", fundGroupId: "", transferType: ""
    },
    {
      id: "expense-row", kind: "expense", title: "Tiền nhà trọ", note: "Lấy từ quỹ thiết yếu",
      text: "Tiền nhà trọ | Lấy từ quỹ thiết yếu", normalizedText: "tien nha tro | lay tu quy thiet yeu",
      amount: 2100000, amountPresent: true, date: "2026-09-03", datePresent: true, titlePresent: true, createdTime: "2026-09-03T05:00:00.000Z",
      categoryId: "rent", accountId: "momo", fromAccountId: "", toAccountId: "", fundGroupId: "essential", transferType: ""
    },
    {
      id: "borrow-savings", kind: "transfer", title: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", note: "",
      text: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu", normalizedText: "muon tien cua quy tiet kiem chuyen sang tien phong quy thiet yeu",
      amount: 750000, amountPresent: true, date: "2026-09-08", datePresent: true, titlePresent: true, createdTime: "2026-09-08T05:00:00.000Z",
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

test("final review receivable repayments retain exact per-row amounts and original sources", () => {
  const ledger = buildPersonalLoanLedger_(readFinanceRows_({
    expenseRows: [
      expense("bank-lend", "Cho Tuấn mượn", "loan", "bank", 70000, "2026-09-01"),
      expense("cash-lend", "Cho Tuấn mượn", "loan", "cash", 50000, "2026-09-02")
    ],
    otherIncomeRows: [
      income("return-first", "Tuấn trả lại", "loan", "momo", 90000, "2026-09-03"),
      income("return-second", "Tuấn trả lại", "loan", "momo", 30000, "2026-09-04")
    ]
  }), { loanCategoryIds: new Set(["loan"]) });
  assert.deepEqual(ledger.repayments.map((row) => row.applications), [
    [{ openedBy: "bank-lend", sourceAccountId: "bank", amount: 70000 }, { openedBy: "cash-lend", sourceAccountId: "cash", amount: 20000 }],
    [{ openedBy: "cash-lend", sourceAccountId: "cash", amount: 30000 }]
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
