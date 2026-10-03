import test from "node:test";
import assert from "node:assert/strict";
import { createCashflowRepository } from "../src/features/cashflow/index.js";
import { createFundBudgetRepository } from "../src/features/fund-budget/index.js";
import { createIncomeGoalRepository } from "../src/features/income-goal/index.js";
import { createFinanceRepositories } from "../src/repositories/finance-repository.js";
import { createSixJarSyncJob } from "../src/jobs/six-jar-sync.js";

const config = {
  timezone: "Asia/Ho_Chi_Minh", accountDb: "accounts", incomeDb: "income",
  otherIncomeDb: "other", expenseDb: "expenses", goalDb: "goals",
  otherIncomeCategoryDb: "other-categories", budgetDb: "budgets",
  transferDb: "transfers", fundGroupDb: "groups", goalRelationPageId: "grab",
  monthlyExpenseLimit: 5500000
};
const now = () => new Date("2026-07-29T12:00:00Z");

test("read-only feature repositories work without an income-write or Telegram port", async () => {
  for (const [create, method, cachePrefix] of [
    [createCashflowRepository, "getMonthlyCashflow", "monthly-cashflow:"],
    [createFundBudgetRepository, "getFundBudgetReport", "fund-budget:"]
  ]) {
    let reads = 0;
    const cached = [];
    const repository = create({
      notion: { async queryDatabase() { reads++; return []; } },
      state: {
        async getReportCache() { return null; },
        async putReportCache(...args) { cached.push(args); }
      }, config, now
    });
    assert.deepEqual(Object.keys(repository), [method]);
    const report = await repository[method](true);
    assert.deepEqual(report.t, { y: 2026, m: 7, d: 29 });
    assert.equal(reads, 8);
    assert.equal(cached.length, 1);
    assert.equal(cached[0][0], cachePrefix + "2026-07-29");
    assert.equal(cached[0][1], report);
    assert.equal(cached[0][2], 60);
  }
});

test("income repository depends on a cache invalidation callback, not other features", async () => {
  const invalidated = [];
  let creates = 0;
  const repository = createIncomeGoalRepository({
    notion: {
      async queryDatabase() { return []; },
      async createPage() { creates++; return { id: "new" }; }
    }, config, now,
    async invalidateReports(date) { invalidated.push(date); }
  });
  assert.deepEqual(Object.keys(repository), ["getGoalStatus", "findGrabIncomeByUpdateId", "addGrabIncome"]);
  const result = await repository.addGrabIncome(21, "2026-07-29", 650000);
  assert.equal(result.created, true);
  assert.equal(creates, 1);
  assert.deepEqual(invalidated, ["2026-07-29"]);
  assert.equal((await repository.getGoalStatus()).earnedMonth, 0);
});

test("composition invalidates both report caches after income creation", async () => {
  const deleted = [];
  const repositories = createFinanceRepositories({
    notion: { async queryDatabase() { return []; }, async createPage() { return { id: "new" }; } },
    state: {
      async getReportCache() { return null; }, async putReportCache() {},
      async deleteReportCache(key) { deleted.push(key); }
    }, config, now
  });
  assert.deepEqual(Object.keys(repositories), ["cashflow", "fundBudget", "incomeGoal"]);
  assert.equal(repositories.cashflow.addGrabIncome, undefined);
  assert.equal(repositories.fundBudget.getGoalStatus, undefined);
  await repositories.incomeGoal.addGrabIncome(22, "2026-07-29", 50000);
  assert.deepEqual(deleted, ["monthly-cashflow:2026-07-29", "fund-budget:2026-07-29"]);
});

test("scheduled sync uses a fresh report and propagates sync failures", async () => {
  const report = { openingPlan: { allocations: [] } };
  const calls = [];
  const error = new Error("sync failed");
  const job = createSixJarSyncJob({
    repository: { async getFundBudgetReport(refresh) { calls.push(refresh); return report; } },
    async syncSixJar(data) { assert.equal(data, report); throw error; }
  });
  await assert.rejects(job(), value => value === error);
  assert.deepEqual(calls, [true]);
});
