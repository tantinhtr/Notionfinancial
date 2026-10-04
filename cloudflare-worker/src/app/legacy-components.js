import { createCashflowController } from "../modules/cashflow/index.js";
import { createFundBudgetController, createBudgetDisplayService } from "../modules/fund-budget/index.js";
import { createIncomeGoalController } from "../modules/income-goal/index.js";
import { dateParts } from "../modules/income-goal/index.js";
import { iso_ } from "../modules/shared/finance/shared.js";
export function createCashflowComponent({ repository, telegram }) {
  return createCashflowController({ service: repository, telegram });
}
export function createFundBudgetComponent({ repository, telegram, syncSixJar }) {
  if (typeof repository?.getFundBudgetReport !== "function") throw new TypeError("repository.getFundBudgetReport must be a function");
  return createFundBudgetController({ service: createBudgetDisplayService({ reportService: repository, syncSixJar }), telegram });
}
export function createIncomeGoalComponent({ repository, telegram, config, now = () => new Date() }) {
  for (const method of ["getGoalStatus", "addGrabIncome"]) {
    if (typeof repository?.[method] !== "function") throw new TypeError("repository." + method + " must be a function");
  }
  const service = { ...repository, async recordRevenue(updateId, amount) {
    const t = dateParts(now(), config.timezone);
    await repository.addGrabIncome(updateId, iso_(t.y,t.m,t.d), amount);
    return repository.getGoalStatus();
  } };
  const controller = createIncomeGoalController({ service, telegram, config });
  if (typeof now !== "function") throw new TypeError("now must be a function");
  return controller;
}
