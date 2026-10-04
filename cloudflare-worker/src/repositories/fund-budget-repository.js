import { createBudgetDataRepository, createBudgetCalculator, createFundBudgetService } from "../modules/fund-budget/index.js";
import { evaluateFinanceLedger } from "../modules/financial-ledger/index.js";
import { reportCachePort } from "../modules/shared/cache/cache-port.js";
export { historyLookupRequired_ } from "../modules/fund-budget/index.js";
export function createFundBudgetRepository({ notion, notionAdapter = notion, state, kvCacheAdapter, config, now }) {
  const { getFundBudgetReport } = createFundBudgetService({ repository: createBudgetDataRepository({ notion: notionAdapter, config }), calculator: createBudgetCalculator(evaluateFinanceLedger), cache: reportCachePort({ kvCacheAdapter, state }), config, now });
  return { getFundBudgetReport };
}
