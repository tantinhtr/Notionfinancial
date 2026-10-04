import { createDateParts, createReportDateFormatter } from "../shared/finance/report-data.js";
import { iso_ } from "../shared/finance/shared.js";
import { readFinanceRows_ } from "../shared/finance/transaction-rows.js";
import { loadReport } from "../shared/cache/report-cache.js";
import { historyLookupRequired_, fundChildAliasHistoryRequired_ } from "./rules/history.js";
const cacheKey = date => "fund-budget:" + date;
/** @param {{repository: import('./fund-budget.contracts.js').BudgetDataRepository, cache: import('../shared/cache/cache.contracts.js').Cache, calculator: object, config: object, now?: () => Date}} dependencies */
export function createFundBudgetService({ repository, cache, calculator, config, now = () => new Date() }) {
  const formatter = createReportDateFormatter(config.timezone);
  async function getFundBudgetReport(forceRefresh = false) {
    const t = createDateParts(now, formatter);
    return loadReport(cache, cacheKey(iso_(t.y,t.m,t.d)), forceRefresh, async () => {
      const { categoryRows, expenseRows, accountRows, transferRows, fundGroupRows, incomeRows, otherIncomeRows, otherIncomeCategoryRows } = await repository.readMonth(t);
      const needsRolloverHistory = (config.rolloverSourceGroupNames || []).length > 0;
      let rolloverExpenseRows = [];
      let rolloverTransferRows = [];
      let historicalIncomeRows = [];
      let historicalOtherIncomeRows = [];
      let historicalExpenseRows = [];
      let historicalTransferRows = [];
      const currentRows = readFinanceRows_({ incomeRows, otherIncomeRows, expenseRows, transferRows });
      const needsChildAliasHistory = fundChildAliasHistoryRequired_(transferRows, categoryRows);
      if (historyLookupRequired_(currentRows)) {
        [historicalIncomeRows, historicalOtherIncomeRows, historicalExpenseRows, historicalTransferRows] = await repository.readHistory(t, ["income", "otherIncome", "expense", "transfer"]);
        rolloverExpenseRows = historicalExpenseRows;
        rolloverTransferRows = historicalTransferRows;
      } else if (needsRolloverHistory) {
        [rolloverExpenseRows, rolloverTransferRows] = await repository.readHistory(t, ["expense", "transfer"]);
      } else if (needsChildAliasHistory) {
        [historicalExpenseRows] = await repository.readHistory(t, ["expense"]);
      }
      if (needsRolloverHistory && needsChildAliasHistory && historicalExpenseRows.length === 0) {
        historicalExpenseRows = rolloverExpenseRows;
      }
      const rolloverCarryover = needsRolloverHistory
        ? calculator.calculateRollover({ t, categoryRows, accountRows, fundGroupRows, rolloverExpenseRows, rolloverTransferRows, config })
        : { total: 0, groups: [] };
      const model = calculator.buildReport(
        t,
        categoryRows,
        expenseRows,
        accountRows,
        config.monthlyExpenseLimit,
        transferRows,
        fundGroupRows,
        {
          incomeRows,
          otherIncomeRows,
          otherIncomeCategoryRows,
          historicalIncomeRows,
          historicalOtherIncomeRows,
          historicalExpenseRows,
          historicalTransferRows,
          passThroughKeywords: config.passThroughKeywords,
          passThroughCategories: config.passThroughCategories,
          spendableSubFunds: config.spendableSubFunds,
          sourceAccountNames: config.sourceAccountNames,
          goalRelationPageId: config.goalRelationPageId,
          rentReserveAmount: config.rentReserveAmount,
          rolloverFundNames: config.rolloverFundNames,
          rolloverFundWeights: config.rolloverFundWeights,
          rolloverCarryoverAmount: rolloverCarryover.total
        }
      );
      model.rolloverCarryover = rolloverCarryover;
      return model;
    });
  }

  return { getFundBudgetReport, invalidate: date => cache.delete(cacheKey(date)) };
}
