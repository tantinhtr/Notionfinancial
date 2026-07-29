import test from "node:test";
import assert from "node:assert/strict";
import { createNotionClient } from "../src/notion.js";
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
  monthlyExpenseLimit: 5500000
});

const monthFilter = {
  and: [
    { property: "Ngày", date: { on_or_after: "2026-07-01" } },
    { property: "Ngày", date: { on_or_before: "2026-07-29" } }
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

test("fund report wires five concurrent Notion queries into the finance builder", async () => {
  const { notion, repository } = createRepository({ rows: {
    budgets: [], expenses: [], accounts: [], transfers: [], "fund-groups": []
  } });

  const model = await repository.getFundBudgetReport();

  assert.deepEqual(model.t, { y: 2026, m: 7, d: 29 });
  assert.deepEqual(notion.calls, [
    ["budgets", undefined],
    ["expenses", monthFilter],
    ["accounts", undefined],
    ["transfers", monthFilter],
    ["fund-groups", undefined]
  ]);
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
  assert.deepEqual(state.calls, [["delete", "monthly-cashflow:2026-07-29"]]);
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
