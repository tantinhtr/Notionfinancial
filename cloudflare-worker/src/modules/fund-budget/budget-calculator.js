import { buildAccountSpendingData_ } from "./rules/model.js";
import { calculateRollover } from "./rules/rollover.js";
export function createBudgetCalculator(evaluateLedger) {
  const buildReport = (t, categories, expenses, accounts, limit, transfers, groups, options) =>
    buildAccountSpendingData_(t, categories, expenses, accounts, limit, transfers, groups, options, evaluateLedger);
  return { buildReport, calculateRollover: input => calculateRollover({ ...input, buildBudgetReport: buildReport }) };
}
