import { reportCachePort } from "../services/cache-port.js";
import { invalidateReportCaches } from "../services/report-cache.js";
import { createCashflowRepository } from "./cashflow-repository.js";
import { createFundBudgetRepository } from "./fund-budget-repository.js";
import { createGrabRepository } from "./grab-repository.js";
export { AmbiguousIncomeWriteError } from "./grab-repository.js";
export { historyLookupRequired_ } from "./fund-budget-repository.js";

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

export function createFinanceRepositories({ notion, notionAdapter = notion, state, kvCacheAdapter, config, now = () => new Date() }) {
  notion = notionAdapter;
  const cache = reportCachePort({ kvCacheAdapter, state });
  validateFactoryDependencies({ notion, state: state ?? {
    getReportCache: kvCacheAdapter?.get,
    putReportCache: kvCacheAdapter?.set,
    deleteReportCache: kvCacheAdapter?.delete
  }, config, now });
  const dependencies = { notionAdapter: notion, kvCacheAdapter: cache, config, now };
  return {
    cashflow: createCashflowRepository(dependencies),
    fundBudget: createFundBudgetRepository(dependencies),
    incomeGoal: createGrabRepository({
      notion, config, now,
      invalidateReports: (dateISO) => invalidateReportCaches(cache, dateISO)
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
