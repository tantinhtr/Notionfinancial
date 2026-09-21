import test from "node:test";
import assert from "node:assert/strict";
import { createNotionClient } from "../src/notion.js";
import { fundBudgetText_ } from "../src/finance.js";
import { createStateStore } from "../src/state.js";
import {
  AmbiguousIncomeWriteError,
  createFinanceRepository
} from "../src/repository.js";

const FIXED_NOW = () => new Date("2026-07-29T12:00:00.000Z");

const config = Object.freeze({
  timezone: "Asia/Ho_Chi_Minh",
  accountDb: "accounts",
  incomeDb: "income",
  otherIncomeDb: "other-income",
  expenseDb: "expenses",
  goalDb: "goals",
  otherIncomeCategoryDb: "other-income-categories",
  budgetDb: "budgets",
  transferDb: "transfers",
  fundGroupDb: "fund-groups",
  goalRelationPageId: "grab-goal",
  monthlyExpenseLimit: 5500000,
  sourceAccountNames: ["Tiền Mặt", "Banking", "Grap Tiền Mặt", "Momo"],
  rentReserveAmount: 2150000,
  rolloverFundNames: ["Tiết kiệm dài hạn", "Đầu tư tài chính", "Hưởng thụ"]
});

const monthFilter = {
  and: [
    { property: "Ngày", date: { on_or_after: "2026-07-01" } },
    { property: "Ngày", date: { on_or_before: "2026-07-29" } }
  ]
};

const previousMonthFilter = {
  and: [
    { property: "Ngày", date: { on_or_after: "2026-06-01" } },
    { property: "Ngày", date: { on_or_before: "2026-06-30" } }
  ]
};

function createState({ cached = null, getError, putError, deleteError } = {}) {
  const calls = [];
  return {
    calls,
    async getReportCache(key) {
      calls.push(["get", key]);
      if (getError) throw getError;
      return cached;
    },
    async putReportCache(key, value, ttl) {
      calls.push(["put", key, value, ttl]);
      if (putError) throw putError;
    },
    async deleteReportCache(key) {
      calls.push(["delete", key]);
      if (deleteError) throw deleteError;
    }
  };
}

function createNotion(rowsByDatabase = {}) {
  const calls = [];
  const created = [];
  return {
    calls,
    created,
    async queryDatabase(databaseId, filter) {
      calls.push([databaseId, filter]);
      return rowsByDatabase[databaseId] || [];
    },
    async createPage(databaseId, properties) {
      created.push([databaseId, properties]);
      return { id: "created-page" };
    }
  };
}

function row(id, properties) {
  return { id, properties };
}

function monthlyRows() {
  return {
    accounts: [row("account", {
      "Phương Thức Thanh Toán": { title: [{ plain_text: "Cash" }] },
      "Số Dư Hiện Tại": { number: 100 }
    })],
    income: [row("income-row", {
      "Tên Khoản Thu": { title: [{ plain_text: "Salary" }] },
      "Số Tiền": { number: 200 },
      "Ngày": { date: { start: "2026-07-01" } },
      "Loại Khoản Thu": { relation: [{ id: "income-category" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "account" }] }
    })],
    "other-income": [row("other-income-row", {
      "Tên Khoản Thu": { title: [{ plain_text: "Bonus" }] },
      "Số Tiền": { number: 50 },
      "Ngày": { date: { start: "2026-07-02" } },
      "Loại Khoản Thu": { relation: [{ id: "other-income-category" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "account" }] }
    })],
    expenses: [row("expense-row", {
      "Nội Dung Khoản Chi": { title: [{ plain_text: "Lunch" }] },
      "Số Tiền": { number: 75 },
      "Ngày": { date: { start: "2026-07-03" } },
      "Loại Chi Phí": { relation: [{ id: "expense-category" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "account" }] }
    })],
    goals: [row("income-category", {
      "Loại Khoản Thu": { title: [{ plain_text: "Salary" }] }
    })],
    "other-income-categories": [row("other-income-category", {
      "Loại Khoản Thu": { title: [{ plain_text: "Bonus" }] }
    })],
    budgets: [row("expense-category", {
      "Loại Chi Phí": { title: [{ plain_text: "Food" }] }
    })],
    transfers: [row("transfer-row", {
      "Số Tiền": { number: 25 },
      "Từ Tài Khoản": { relation: [{ id: "account" }] },
      "Đến Tài Khoản": { relation: [{ id: "account-2" }] }
    })]
  };
}

function openingAccountRows() {
  const account = (id, name, opening, current) => row(id, {
    "Phương Thức Thanh Toán": { title: [{ plain_text: name }] },
    "Số Dư Ban Đầu": { number: opening },
    "Số Dư Hiện Tại": { number: current }
  });
  return [
    account("cash", "Tiền Mặt", 2021000, 665000),
    account("bank", "Banking", 1670004, 0),
    account("grab-cash", "Grap Tiền Mặt", 0, 9000),
    account("momo", "Momo", 158706, 100000),
    account("fund", "Quỹ Momo", 706166, 247876)
  ];
}

function createRepository(options = {}) {
  const notion = options.notion || createNotion(options.rows);
  const state = options.state || createState(options.stateOptions);
  return {
    notion,
    state,
    repository: createFinanceRepository({ notion, state, config, now: options.now || FIXED_NOW })
  };
}

test("monthly cashflow sources use eight ordered requests and a shared month filter", async () => {
  const { notion, repository } = createRepository({ rows: monthlyRows() });

  await repository.getMonthlyCashflow(true);

  assert.deepEqual(notion.calls, [
    ["accounts", undefined],
    ["income", monthFilter],
    ["other-income", monthFilter],
    ["expenses", monthFilter],
    ["goals", undefined],
    ["other-income-categories", undefined],
    ["budgets", undefined],
    ["transfers", monthFilter]
  ]);
});

test("monthly cashflow forwards remaining Notion pages to its builder", async () => {
  const { repository } = createRepository({ rows: monthlyRows() });

  const model = await repository.getMonthlyCashflow(true);

  assert.equal(model.totalIn, 250);
  assert.equal(model.totalOut, 75);
  assert.equal(model.net, 175);
  assert.deepEqual(model.accounts[0].moneyIn.categories, [
    { token: model.accounts[0].moneyIn.categories[0].token, name: "Salary", total: 200, rows: [
      { id: "income-row", name: "Salary", amount: 200, date: "2026-07-01", note: "" }
    ] },
    { token: model.accounts[0].moneyIn.categories[1].token, name: "Bonus", total: 50, rows: [
      { id: "other-income-row", name: "Bonus", amount: 50, date: "2026-07-02", note: "" }
    ] }
  ]);
  assert.equal(model.accounts[0].transfersOut, 25);
  assert.equal(model.accounts.find((account) => account.id === "account-2").transfersIn, 25);
});

test("monthly cashflow cache reuses the final model unless refresh is forced", async () => {
  const cached = { cached: true };
  const { notion, state, repository } = createRepository({
    rows: monthlyRows(),
    stateOptions: { cached }
  });

  assert.equal(await repository.getMonthlyCashflow(), cached);
  assert.equal(notion.calls.length, 0);
  assert.deepEqual(state.calls, [["get", "monthly-cashflow:2026-07-29"]]);

  const fresh = await repository.getMonthlyCashflow(true);
  assert.equal(fresh.net, 175);
  assert.equal(notion.calls.length, 8);
  assert.equal(state.calls.filter(([method]) => method === "get").length, 1);
});

test("monthly cashflow returns its live model when cache storage fails", async () => {
  const { repository } = createRepository({
    rows: monthlyRows(),
    stateOptions: {
      getError: new Error("KV unavailable"),
      putError: new Error("KV unavailable")
    }
  });

  const model = await repository.getMonthlyCashflow();

  assert.equal(model.net, 175);
});

test("remaining Notion pages are loaded when the first page has more than 100 rows", async () => {
  const requests = [];
  const notion = createNotionClient(
    { notionToken: "test-token", notionVersion: "2022-06-28" },
    async (url, options) => {
      const payload = JSON.parse(options.body);
      const databaseId = url.split("/").at(-2);
      requests.push({ databaseId, payload });
      if (databaseId === "accounts") {
        const start = payload.start_cursor ? 100 : 0;
        return jsonResponse({
          results: Array.from({ length: start ? 1 : 100 }, (_value, index) => row(`account-${start + index}`, {
            "Phương Thức Thanh Toán": { title: [{ plain_text: `Account ${start + index}` }] }
          })),
          has_more: !start,
          next_cursor: start ? null : "account-page-2"
        });
      }
      return jsonResponse({ results: [], has_more: false, next_cursor: null });
    }
  );
  const { repository } = createRepository({ notion });

  const model = await repository.getMonthlyCashflow(true);

  assert.equal(model.accounts.length, 101);
  assert.deepEqual(requests.filter(({ databaseId }) => databaseId === "accounts").map(({ payload }) => payload), [
    { page_size: 100 },
    { page_size: 100, start_cursor: "account-page-2" }
  ]);
});

test("monthly queries start before any of their promises resolve", async () => {
  const calls = [];
  const resolvers = [];
  const notion = {
    queryDatabase(databaseId, filter) {
      calls.push([databaseId, filter]);
      return new Promise((resolve) => resolvers.push(resolve));
    },
    createPage() {}
  };
  const { repository } = createRepository({ notion });

  const pending = repository.getMonthlyCashflow(true);
  assert.equal(calls.length, 8);
  for (const resolve of resolvers) resolve([]);
  await pending;
});

test("forced monthly refresh bypasses cache read", async () => {
  const { state, repository } = createRepository({
    rows: monthlyRows(),
    stateOptions: { cached: { stale: true } }
  });

  const model = await repository.getMonthlyCashflow(true);

  assert.equal(model.net, 175);
  assert.equal(state.calls.some(([method]) => method === "get"), false);
});

test("goal status calculates the month and today targets using configured timezone", async () => {
  const { notion, repository } = createRepository({
    now: () => new Date("2026-07-29T18:00:00.000Z"),
    rows: {
      goals: [row("goal", { "Mục Tiêu Hàng Tháng": { number: 31000 } })],
      income: [
        row("before", { "Số Tiền": { number: 20000 }, "Ngày": { date: { start: "2026-07-29" } } }),
        row("today", { "Số Tiền": { number: 1000 }, "Ngày": { date: { start: "2026-07-30" } } })
      ]
    }
  });

  const status = await repository.getGoalStatus();

  assert.deepEqual(status.t, { y: 2026, m: 7, d: 30 });
  assert.equal(status.goal, 31000);
  assert.equal(status.earnedMonth, 21000);
  assert.equal(status.earnedToday, 1000);
  assert.equal(status.baseDaily, 1000);
  assert.equal(status.todayTarget, 5500);
  assert.equal(status.todayMet, false);
  assert.equal(status.remaining, 10000);
  assert.equal(status.daysLeftIncludingToday, 2);
  assert.equal(status.requiredPerDay, 5000);
  assert.equal(status.daysAfter, 1);
  assert.equal(status.tomorrowTarget, 10000);
  assert.deepEqual(notion.calls, [
    ["goals", { property: "Loại Khoản Thu", title: { equals: "Thu Nhập Ròng Grab (App)" } }],
    ["income", {
      and: [
        { property: "Ngày", date: { on_or_after: "2026-07-01" } },
        { property: "Ngày", date: { on_or_before: "2026-07-30" } },
        { property: "Loại Khoản Thu", relation: { contains: "grab-goal" } }
      ]
    }]
  ]);
});

test("goal status counts February 29 in a leap year", async () => {
  const { repository } = createRepository({
    now: () => new Date("2028-02-27T18:00:00.000Z"),
    rows: {
      goals: [row("goal", { "Mục Tiêu Hàng Tháng": { number: 29000 } })],
      income: []
    }
  });

  const status = await repository.getGoalStatus();

  assert.deepEqual(status.t, { y: 2028, m: 2, d: 28 });
  assert.equal(status.daysLeftIncludingToday, 2);
  assert.equal(status.requiredPerDay, 14500);
});

test("fund report serves the cached model instead of re-querying Notion", async () => {
  const cached = { t: { y: 2026, m: 7, d: 29 }, fundGroups: [] };
  const { notion, repository, state } = createRepository({
    rows: {
      budgets: [], expenses: [], accounts: [], transfers: [], "fund-groups": [],
      income: [], "other-income": []
    },
    stateOptions: { cached }
  });

  // Bam lai trong vong 60 giay thi khong duoc goi lai cac truy van Notion.
  assert.equal(await repository.getFundBudgetReport(), cached);
  assert.equal(notion.calls.length, 0);
  assert.deepEqual(state.calls, [["get", "fund-budget:2026-07-29"]]);

  const fresh = await repository.getFundBudgetReport(true);
  assert.deepEqual(fresh.t, { y: 2026, m: 7, d: 29 });
  assert.equal(notion.calls.length, 8);
  const put = state.calls.at(-1);
  assert.equal(put[0], "put");
  assert.equal(put[1], "fund-budget:2026-07-29");
  assert.equal(put[3], 60);
});

test("fund report wires current and master Notion queries into the finance builder", async () => {
  const { notion, repository } = createRepository({ rows: {
    budgets: [], expenses: [], accounts: openingAccountRows(), transfers: [], "fund-groups": [],
    income: [], "other-income": []
  } });

  const model = await repository.getFundBudgetReport();

  assert.deepEqual(model.t, { y: 2026, m: 7, d: 29 });
  assert.deepEqual(model.openingPlan, {
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
  });
  // Bao cao can ca thu nhap de tach thu nhap that khoi tien chay qua.
  assert.deepEqual(notion.calls, [
    ["budgets", undefined],
    ["expenses", monthFilter],
    ["accounts", undefined],
    ["transfers", monthFilter],
    ["fund-groups", undefined],
    ["income", monthFilter],
    ["other-income", monthFilter],
    ["other-income-categories", undefined]
  ]);
});

test("fund report carries only funded child balances from the two rollover source groups into next-month allocations", async () => {
  const historicalFilter = {
    property: "Ngày",
    date: { on_or_before: "2026-06-30" }
  };
  const trackedCategory = (id, name, budget, groupId) => row(id, {
    "Loại Chi Phí": { title: [{ plain_text: name }] },
    "Ngân Sách Tháng": { number: budget },
    "Tính Trong 5,5 Triệu": { checkbox: true },
    "Nhóm Quỹ": { relation: [{ id: groupId }] }
  });
  const fundGroup = (id, name) => row(id, {
    "Tên Nhóm Quỹ": { title: [{ plain_text: name }] },
    "Tài Khoản Giữ Quỹ": { relation: [{ id: "fund" }] },
    "Bắt Buộc Cấp Quỹ": { checkbox: true }
  });
  const transfer = (id, name, amount, groupId) => row(id, {
    "Ghi Chú": { title: [{ plain_text: name }] },
    "Số Tiền": { number: amount },
    "Ngày": { date: { start: "2026-06-10" } },
    "Từ Tài Khoản": { relation: [{ id: "momo" }] },
    "Đến Tài Khoản": { relation: [{ id: "fund" }] },
    "Nhóm Quỹ": { relation: [{ id: groupId }] }
  });
  const expense = (id, name, amount, categoryId) => row(id, {
    "Nội Dung Khoản Chi": { title: [{ plain_text: name }] },
    "Số Tiền": { number: amount },
    "Ngày": { date: { start: "2026-06-20" } },
    "Loại Chi Phí": { relation: [{ id: categoryId }] },
    "Phương Thức Thanh Toán": { relation: [{ id: "fund" }] }
  });
  const rows = {
    budgets: [
      trackedCategory("internet", "Internet", 1000000, "essential"),
      trackedCategory("course", "Khóa học", 500000, "education"),
      trackedCategory("trip", "Du lịch", 900000, "enjoyment")
    ],
    accounts: openingAccountRows(),
    "fund-groups": [
      fundGroup("essential", "Nhu cầu thiết yếu"),
      fundGroup("education", "Giáo dục phát triển"),
      fundGroup("enjoyment", "Hưởng thụ")
    ],
    expenses: [
      expense("internet-paid", "Thanh toán Internet", 30000, "internet"),
      expense("course-paid", "Mua khóa học", 20000, "course")
    ],
    transfers: [
      transfer("internet-funded", "Cấp quỹ Internet", 180000, "essential"),
      transfer("course-funded", "Cấp quỹ Khóa học", 100000, "education"),
      transfer("trip-funded", "Cấp quỹ Du lịch", 900000, "enjoyment")
    ],
    income: [],
    "other-income": [],
    "other-income-categories": []
  };
  const notion = {
    async queryDatabase(databaseId, filter) {
      if (databaseId === "expenses" || databaseId === "transfers") {
        return filter?.date?.on_or_before === "2026-06-30" ? rows[databaseId] : [];
      }
      return rows[databaseId] || [];
    },
    async createPage() { return { id: "unused" }; }
  };
  const repository = createFinanceRepository({
    notion,
    state: createState(),
    config: {
      ...config,
      rolloverFundNames: ["Tiết kiệm dài hạn", "Đầu tư tài chính", "Hưởng thụ", "Cho đi"],
      rolloverSourceGroupNames: ["Nhu cầu thiết yếu", "Giáo dục phát triển"]
    },
    now: FIXED_NOW
  });

  const model = await repository.getFundBudgetReport(true);

  assert.equal(model.openingPlan.sourceTotal, 3849710);
  assert.equal(model.openingPlan.rolloverCarryover, 230000);
  assert.equal(model.openingPlan.remainder, 1929710);
  assert.deepEqual(model.openingPlan.allocations, [
    { fund: "Tiết kiệm dài hạn", amount: 482429 },
    { fund: "Đầu tư tài chính", amount: 482427 },
    { fund: "Hưởng thụ", amount: 482427 },
    { fund: "Cho đi", amount: 482427 }
  ]);
  assert.deepEqual(model.rolloverCarryover.groups, [
    { name: "Nhu cầu thiết yếu", amount: 150000 },
    { name: "Giáo dục phát triển", amount: 80000 }
  ]);
});

test("fund report accepts an accountless Grab App target but still flags an accountless real receipt", async () => {
  const income = (id, categoryId) => row(id, {
    "Tên Khoản Thu": { title: [{ plain_text: "Grap thu nhập ròng" }] },
    "Số Tiền": { number: 286581 },
    "Ngày": { date: { start: "2026-07-07" } },
    "Loại Khoản Thu": { relation: [{ id: categoryId }] },
    "Phương Thức Thanh Toán": { relation: [] }
  });
  const { repository } = createRepository({ rows: {
    budgets: [], expenses: [], accounts: [], transfers: [], "fund-groups": [],
    income: [income("app-target", "grab-goal"), income("real-receipt", "ordinary")],
    "other-income": []
  } });

  const model = await repository.getFundBudgetReport();
  assert.equal(model.explicitLedger.dataIssues.some((issue) => issue.rowId === "app-target"), false);
  assert.deepEqual(model.explicitLedger.dataIssues.find((issue) => issue.rowId === "real-receipt")?.details,
    ["Phương Thức Thanh Toán"]);
});

test("fund report wires complete pre-month history", async () => {
  const currentFilter = {
    and: [
      { property: "Ngày", date: { on_or_after: "2026-09-01" } },
      { property: "Ngày", date: { on_or_before: "2026-09-14" } }
    ]
  };
  const historyFilter = {
    property: "Ngày",
    date: { on_or_before: "2026-08-31" }
  };
  const calls = [];
  const loanCategory = row("loan", {
    "Loại Chi Phí": { title: [{ plain_text: "Vay Và Trả" }] }
  });
  const accounts = [
    row("bank", { "Phương Thức Thanh Toán": { title: [{ plain_text: "Banking" }] } }),
    row("momo", { "Phương Thức Thanh Toán": { title: [{ plain_text: "Momo" }] } })
  ];
  const previousLoan = row("borrow-to", {
    "Tên Khoản Thu": { title: [{ plain_text: "Tố cho mượn tiền" }] },
    "Số Tiền": { number: 1000000 },
    "Ngày": { date: { start: "2026-08-14" } },
    "Loại Khoản Thu": { relation: [{ id: "loan" }] },
    "Phương Thức Thanh Toán": { relation: [{ id: "momo" }] }
  });
  const repayments = [
    row("repay-to-bank", {
      "Nội Dung Khoản Chi": { title: [{ plain_text: "Trả tiền mượn tố tháng trước ( còn nợ 500 )" }] },
      "Số Tiền": { number: 500000 },
      "Ngày": { date: { start: "2026-09-07" } },
      "Loại Chi Phí": { relation: [{ id: "loan" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "bank" }] }
    }),
    row("repay-to-momo", {
      "Nội Dung Khoản Chi": { title: [{ plain_text: "Trả nợ tố mượn tháng trước" }] },
      "Ghi Chú": { rich_text: [{ plain_text: "Hết nợ" }] },
      "Số Tiền": { number: 500000 },
      "Ngày": { date: { start: "2026-09-13" } },
      "Loại Chi Phí": { relation: [{ id: "loan" }] },
      "Phương Thức Thanh Toán": { relation: [{ id: "momo" }] }
    })
  ];
  const notion = {
    calls,
    async queryDatabase(databaseId, filter) {
      calls.push([databaseId, filter]);
      if (databaseId === "budgets") return [loanCategory];
      if (databaseId === "accounts") return accounts;
      if (databaseId === "expenses" && filter?.and?.[0]?.date?.on_or_after === "2026-09-01") return repayments;
      if (databaseId === "other-income" && filter?.date?.on_or_before === "2026-08-31") return [previousLoan];
      return [];
    },
    async createPage() { return { id: "unused" }; }
  };
  const { repository } = createRepository({
    notion,
    now: () => new Date("2026-09-14T12:00:00.000Z")
  });

  const model = await repository.getFundBudgetReport(true);

  assert.equal(model.explicitLedger.personalLoans.liabilities[0].principal, 1000000);
  assert.equal(model.explicitLedger.personalLoans.liabilities[0].repaid, 1000000);
  assert.equal(model.explicitLedger.personalLoans.liabilities[0].outstanding, 0);
  assert.deepEqual(model.explicitLedger.personalLoans.liabilities[0].repaymentRows, ["repay-to-bank", "repay-to-momo"]);
  assert.deepEqual(model.explicitLedger.personalLoans.unmatched, []);
  assert.equal(
    model.explicitLedger.unmatched.some((row) => row.reason !== "source-funding-shortfall"),
    false
  );
  assert.doesNotMatch(fundBudgetText_(model), /CHƯA ĐỦ DỮ KIỆN|Trả tiền mượn tố|Trả nợ tố/i);
  assert.deepEqual(calls, [
    ["budgets", undefined],
    ["expenses", currentFilter],
    ["accounts", undefined],
    ["transfers", currentFilter],
    ["fund-groups", undefined],
    ["income", currentFilter],
    ["other-income", currentFilter],
    ["other-income-categories", undefined],
    ["income", historyFilter],
    ["other-income", historyFilter],
    ["expenses", historyFilter],
    ["transfers", historyFilter]
  ]);
});

test("fund report skips history without a current historical reference", async () => {
  const currentFilter = {
    and: [
      { property: "Ngày", date: { on_or_after: "2026-09-01" } },
      { property: "Ngày", date: { on_or_before: "2026-09-14" } }
    ]
  };
  const calls = [];
  const notion = {
    calls,
    async queryDatabase(databaseId, filter) {
      calls.push([databaseId, filter]);
      return [];
    },
    async createPage() { return { id: "unused" }; }
  };
  const { repository } = createRepository({
    notion,
    now: () => new Date("2026-09-14T12:00:00.000Z")
  });

  await repository.getFundBudgetReport(true);

  assert.deepEqual(calls, [
    ["budgets", undefined],
    ["expenses", currentFilter],
    ["accounts", undefined],
    ["transfers", currentFilter],
    ["fund-groups", undefined],
    ["income", currentFilter],
    ["other-income", currentFilter],
    ["other-income-categories", undefined]
  ]);
});

test("fund transfer loads expense history for child aliases without loading unrelated history", async () => {
  const currentFilter = {
    and: [
      { property: "Ngày", date: { on_or_after: "2026-09-01" } },
      { property: "Ngày", date: { on_or_before: "2026-09-14" } }
    ]
  };
  const historyFilter = {
    property: "Ngày",
    date: { on_or_before: "2026-08-31" }
  };
  const calls = [];
  const transfer = row("fund-wifi", {
    "Ghi Chú": { title: [{ plain_text: "Tiền wifi ở nhà" }] },
    "Số Tiền": { number: 180000 },
    "Ngày": { date: { start: "2026-09-16" } },
    "Loại Chuyển Đổi": { select: { name: "Giao Dịch Giữa Các Tài Khoản" } },
    "Từ Tài Khoản": { relation: [{ id: "momo" }] },
    "Đến Tài Khoản": { relation: [{ id: "fund" }] },
    "Nhóm Quỹ": { relation: [{ id: "essential" }] }
  });
  const notion = {
    calls,
    async queryDatabase(databaseId, filter) {
      calls.push([databaseId, filter]);
      if (databaseId === "budgets") return [
        row("rent", {
          "Loại Chi Phí": { title: [{ plain_text: "Nhà Trọ" }] },
          "Tính Trong 5,5 Triệu": { checkbox: true },
          "Nhóm Quỹ": { relation: [{ id: "essential" }] }
        }),
        row("internet", {
          "Loại Chi Phí": { title: [{ plain_text: "Internet" }] },
          "Tính Trong 5,5 Triệu": { checkbox: true },
          "Nhóm Quỹ": { relation: [{ id: "essential" }] }
        })
      ];
      if (databaseId === "transfers" && filter?.and) return [transfer];
      return [];
    },
    async createPage() { return { id: "unused" }; }
  };
  const { repository } = createRepository({
    notion,
    now: () => new Date("2026-09-14T12:00:00.000Z")
  });

  await repository.getFundBudgetReport(true);

  assert.deepEqual(calls, [
    ["budgets", undefined],
    ["expenses", currentFilter],
    ["accounts", undefined],
    ["transfers", currentFilter],
    ["fund-groups", undefined],
    ["income", currentFilter],
    ["other-income", currentFilter],
    ["other-income-categories", undefined],
    ["expenses", historyFilter]
  ]);
});

test("September 2026 explicit ledger renders one debt after the repository JSON cache round-trip", async () => {
  const cachedValues = new Map();
  const state = createStateStore({
    async get(key) { return cachedValues.get(key) ?? null; },
    async put(key, value) { cachedValues.set(key, value); },
    async delete(key) { cachedValues.delete(key); }
  });
  const { repository, notion } = createRepository({
    now: () => new Date("2026-09-10T12:00:00.000Z"),
    state,
    rows: {
      accounts: openingAccountRows(),
      budgets: [row("rent", {
        "Loại Chi Phí": { title: [{ plain_text: "Nhà Trọ" }] },
        "Ngân Sách Tháng": { number: 2150000 },
        "Tính Trong 5,5 Triệu": { checkbox: true },
        "Nhóm Quỹ": { relation: [{ id: "essential" }] }
      })],
      "fund-groups": [
        row("essential", {
          "Tên Nhóm Quỹ": { title: [{ plain_text: "Nhu cầu thiết yếu" }] },
          "Tài Khoản Giữ Quỹ": { relation: [{ id: "fund" }] },
          "Bắt Buộc Cấp Quỹ": { checkbox: true }
        }),
        row("savings", {
          "Tên Nhóm Quỹ": { title: [{ plain_text: "Tiết kiệm dài hạn" }] },
          "Tài Khoản Giữ Quỹ": { relation: [{ id: "fund" }] },
          "Bắt Buộc Cấp Quỹ": { checkbox: true }
        })
      ],
      expenses: [{
        id: "rent-paid", created_time: "2026-09-08T10:00:00.000Z",
        properties: {
          "Nội Dung Khoản Chi": { title: [{ plain_text: "Tiền phòng tháng 9" }] },
          "Ghi Chú": { rich_text: [] },
          "Số Tiền": { number: 2017000 },
          "Ngày": { date: { start: "2026-09-08" } },
          "Loại Chi Phí": { relation: [{ id: "rent" }] },
          "Phương Thức Thanh Toán": { relation: [{ id: "fund" }] }
        }
      }],
      transfers: [
        {
          id: "rent-allocation", created_time: "2026-09-01T00:00:00.000Z",
          properties: {
            "Ghi Chú": { title: [{ plain_text: "Chuyển tiền vào quỹ Nhà Trọ" }] },
            "Số Tiền": { number: 1400004 },
            "Ngày": { date: { start: "2026-09-01" } },
            "Loại Chuyển Đổi": { select: { name: "Giao Dịch Giữa Các Tài Khoản" } },
            "Từ Tài Khoản": { relation: [{ id: "bank" }] },
            "Đến Tài Khoản": { relation: [{ id: "fund" }] },
            "Nhóm Quỹ": { relation: [{ id: "essential" }] }
          }
        },
        {
          id: "borrow-750", created_time: "2026-09-08T05:00:00.000Z",
          properties: {
            "Ghi Chú": { title: [{ plain_text: "Mượn tiền của quỹ tiết kiệm chuyển sang tiền phòng quỹ thiết yếu" }] },
            "Số Tiền": { number: 750000 },
            "Ngày": { date: { start: "2026-09-08" } },
            "Loại Chuyển Đổi": { select: { name: "Giao Dịch Giữa Các Tài Khoản" } },
            "Từ Tài Khoản": { relation: [{ id: "fund" }] },
            "Đến Tài Khoản": { relation: [{ id: "fund" }] },
            "Nhóm Quỹ": { relation: [{ id: "essential" }] }
          }
        }
      ],
      income: [],
      "other-income": []
    }
  });

  const fresh = await repository.getFundBudgetReport(true);
  assert.equal(notion.calls.length, 8);
  assert.deepEqual(notion.created, []);
  assert.equal(typeof cachedValues.get("report:fund-budget:2026-09-10"), "string");
  const cached = await repository.getFundBudgetReport();
  assert.equal(notion.calls.length, 8);
  assert.notEqual(cached, fresh);
  assert.deepEqual(cached, fresh);
  assert.equal(cached.openingPlan.sourceTotal, 3849710);
  assert.equal(cached.fundGroups[0].fundRemaining, 133004);
  assert.equal(cached.explicitLedger.fundLoans.loans[0].outstanding, 750000);
  for (const model of [fresh, cached]) {
    const text = fundBudgetText_(model);
    assert.equal(text.split("còn nợ Quỹ Tiết kiệm dài hạn 750.000đ").length - 1, 1);
    assert.doesNotMatch(text, /🤝 NỢ GHI RÕ|Đã trả:|Nhu cầu thiết yếu mượn/);
    assert.doesNotMatch(text, /616\.996đ|đã trả:? 109\.000đ|có nguồn để trả/i);
  }
  assert.equal(fundBudgetText_(cached), fundBudgetText_(fresh));
});

test("an existing Telegram Update ID prevents an income page creation", async () => {
  const existing = row("existing-page", {});
  const { notion, repository } = createRepository({ rows: { income: [existing] } });

  const result = await repository.addGrabIncome(123, "2026-07-29", 500000);

  assert.deepEqual(result, { created: false, page: existing });
  assert.deepEqual(notion.calls, [["income", {
    property: "Telegram Update ID",
    rich_text: { equals: "123" }
  }]]);
  assert.deepEqual(notion.created, []);
});

test("income reconciliation finder uses the exact rich-text filter and returns first or null", async () => {
  const first = row("first-page", {});
  const second = row("second-page", {});
  const found = createRepository({ rows: { income: [first, second] } });
  const missing = createRepository();

  assert.equal(await found.repository.findGrabIncomeByUpdateId(321), first);
  assert.equal(await missing.repository.findGrabIncomeByUpdateId(654), null);
  assert.deepEqual(found.notion.calls, [["income", {
    property: "Telegram Update ID",
    rich_text: { equals: "321" }
  }]]);
  assert.deepEqual(missing.notion.calls, [["income", {
    property: "Telegram Update ID",
    rich_text: { equals: "654" }
  }]]);
});

test("new Grab income writes the approved properties and clears its daily cache", async () => {
  const { notion, state, repository } = createRepository();

  const result = await repository.addGrabIncome("update-42", "2026-07-29", 500000);

  assert.deepEqual(result, { created: true, page: { id: "created-page" } });
  assert.deepEqual(notion.created, [["income", {
    "Tên Khoản Thu": { title: [{ text: { content: "Thu nhập Grab" } }] },
    "Số Tiền": { number: 500000 },
    "Ngày": { date: { start: "2026-07-29" } },
    "Loại Khoản Thu": { relation: [{ id: "grab-goal" }] },
    "Telegram Update ID": { rich_text: [{ text: { content: "update-42" } }] }
  }]]);
  // Thu nhap moi lam sai ca hai bao cao trong ngay, phai xoa ca hai cache.
  assert.deepEqual(state.calls, [
    ["delete", "monthly-cashflow:2026-07-29"],
    ["delete", "fund-budget:2026-07-29"]
  ]);
});

test("Notion create errors become redacted ambiguous income write errors", async () => {
  const cause = new Error(
    "Notion body contains notion-sensitive-token and amount 500000"
  );
  const notion = createNotion();
  notion.createPage = async () => {
    throw cause;
  };
  const { repository } = createRepository({ notion });

  await assert.rejects(
    () => repository.addGrabIncome(777, "2026-07-29", 500000),
    (error) => {
      assert.equal(error instanceof AmbiguousIncomeWriteError, true);
      assert.equal(error.name, "AmbiguousIncomeWriteError");
      assert.equal(error.code, "AMBIGUOUS_INCOME_WRITE");
      assert.equal(error.updateId, 777);
      assert.equal(error.cause, cause);
      assert.doesNotMatch(error.message, /notion-sensitive-token|500000|Notion body/);
      return true;
    }
  );
});

test("income lookup errors remain ordinary and never attempt creation", async () => {
  const lookupError = new Error("lookup failed");
  const notion = createNotion();
  notion.queryDatabase = async () => {
    throw lookupError;
  };
  const originalCreatePage = notion.createPage;
  let createCalls = 0;
  notion.createPage = async (...args) => {
    createCalls += 1;
    return originalCreatePage(...args);
  };
  const { repository } = createRepository({ notion });

  await assert.rejects(
    () => repository.addGrabIncome(778, "2026-07-29", 500000),
    (error) => error === lookupError
  );
  assert.equal(createCalls, 0);
});

test("cache deletion failure does not fail a successful income write", async () => {
  const { repository } = createRepository({
    stateOptions: { deleteError: new Error("KV unavailable") }
  });

  const result = await repository.addGrabIncome("update-42", "2026-07-29", 500000);

  assert.deepEqual(result, { created: true, page: { id: "created-page" } });
});

test("invalid update IDs, dates, and amounts are rejected before Notion access", async () => {
  const { notion, repository } = createRepository();
  const invalidCalls = [
    () => repository.addGrabIncome(null, "2026-07-29", 1),
    () => repository.addGrabIncome("", "2026-07-29", 1),
    () => repository.addGrabIncome("update", "2026-7-29", 1),
    () => repository.addGrabIncome("update", "2026-07-29", 0),
    () => repository.addGrabIncome("update", "2026-07-29", Number.NaN)
  ];

  for (const invalidCall of invalidCalls) {
    await assert.rejects(invalidCall, TypeError);
  }
  assert.deepEqual(notion.calls, []);
  assert.deepEqual(notion.created, []);
});

test("repository validates its required dependencies", () => {
  assert.throws(
    () => createFinanceRepository({ notion: {}, state: createState(), config }),
    /queryDatabase/
  );
  assert.throws(
    () => createFinanceRepository({ notion: createNotion(), state: {}, config }),
    /getReportCache/
  );
});

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}
