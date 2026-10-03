import { invalidateReportCaches } from "../services/report-cache.js";
import { createCashflowRepository } from "../features/cashflow/index.js";
import { createFundBudgetRepository } from "../features/fund-budget/index.js";
import { createIncomeGoalRepository } from "../features/income-goal/index.js";
export { AmbiguousIncomeWriteError } from "../features/income-goal/index.js";
export { historyLookupRequired_ } from "../features/fund-budget/index.js";

function validateFactoryDependencies({ notion, state, config, now }) {
  for (const method of ["queryDatabase", "createPage"]) {
    if (typeof notion?.[method] !== "function") {
      throw new TypeError(`Notion client must provide ${method}()`);
    }
  }
  for (const method of ["getReportCache", "putReportCache", "deleteReportCache"]) {
    if (typeof state?.[method] !== "function") {
      throw new TypeError(`State store must provide ${method}()`);
    }
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  for (const key of [
    "timezone",
    "accountDb",
    "incomeDb",
    "otherIncomeDb",
    "expenseDb",
    "goalDb",
    "otherIncomeCategoryDb",
    "budgetDb",
    "transferDb",
    "fundGroupDb",
    "goalRelationPageId"
  ]) {
    if (typeof config?.[key] !== "string" || config[key] === "") {
      throw new TypeError(`config.${key} must be a non-empty string`);
    }
  }
  if (!Number.isFinite(config.monthlyExpenseLimit)) {
    throw new TypeError("config.monthlyExpenseLimit must be a finite number");
  }
}

export function createFinanceRepositories({ notion, state, config, now = () => new Date() }) {
  validateFactoryDependencies({ notion, state, config, now });
  const dependencies = { notion, state, config, now };
  return {
    cashflow: createCashflowRepository(dependencies),
    fundBudget: createFundBudgetRepository(dependencies),
    incomeGoal: createIncomeGoalRepository({
      notion, config, now,
      invalidateReports: (dateISO) => invalidateReportCaches(state, dateISO)
    })
  };
}

// Compatibility for existing consumers. New application code injects a feature port.
export function createFinanceRepository(dependencies) {
  const { cashflow, fundBudget, incomeGoal } = createFinanceRepositories(dependencies);
  return {
    getGoalStatus: incomeGoal.getGoalStatus,
    getMonthlyCashflow: cashflow.getMonthlyCashflow,
    getFundBudgetReport: fundBudget.getFundBudgetReport,
    findGrabIncomeByUpdateId: incomeGoal.findGrabIncomeByUpdateId,
    addGrabIncome: incomeGoal.addGrabIncome
  };
}
