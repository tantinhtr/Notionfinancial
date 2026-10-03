import { reportCachePort } from "../services/cache-port.js";
import { historyBeforeMonthFilterFor, historyLookupRequired_, fundChildAliasHistoryRequired_ } from "../domain/budget/history.js";
import { calculateRollover } from "../domain/budget/rollover.js";
export { historyLookupRequired_ } from "../domain/budget/history.js";
import { reportCacheKey, loadReport } from "../services/report-cache.js";
import { buildAccountSpendingData_ } from "../domain/finance-rules.js";
import { iso_ } from "../domain/finance/shared.js";
import { readFinanceRows_ } from "../domain/ledger/rows.js";
import { createDateParts, createReportDateFormatter, monthFilterFor } from "../domain/finance/report-data.js";

export function createFundBudgetRepository({ notion, notionAdapter = notion, state, kvCacheAdapter, config, now = () => new Date() }) {
  notion = notionAdapter;
  const cache = reportCachePort({ kvCacheAdapter, state });
  const dateFormatter = createReportDateFormatter(config.timezone);

  async function getFundBudgetReport(forceRefresh = false) {
    const t = createDateParts(now, dateFormatter);
    const cacheKey = reportCacheKey("fundBudget", iso_(t.y, t.m, t.d));
    return loadReport(cache, cacheKey, forceRefresh, async () => {
      const filter = monthFilterFor(t);
      const [
        categoryRows,
        expenseRows,
        accountRows,
        transferRows,
        fundGroupRows,
        incomeRows,
        otherIncomeRows,
        otherIncomeCategoryRows
      ] = await Promise.all([
        notion.queryDatabase(config.budgetDb),
        notion.queryDatabase(config.expenseDb, filter),
        notion.queryDatabase(config.accountDb),
        notion.queryDatabase(config.transferDb, filter),
        notion.queryDatabase(config.fundGroupDb),
        notion.queryDatabase(config.incomeDb, filter),
        notion.queryDatabase(config.otherIncomeDb, filter),
        notion.queryDatabase(config.otherIncomeCategoryDb)
      ]);
      const historyFilter = historyBeforeMonthFilterFor(t);
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
        [historicalIncomeRows, historicalOtherIncomeRows, historicalExpenseRows, historicalTransferRows] = await Promise.all([
          notion.queryDatabase(config.incomeDb, historyFilter),
          notion.queryDatabase(config.otherIncomeDb, historyFilter),
          notion.queryDatabase(config.expenseDb, historyFilter),
          notion.queryDatabase(config.transferDb, historyFilter)
        ]);
        rolloverExpenseRows = historicalExpenseRows;
        rolloverTransferRows = historicalTransferRows;
      } else if (needsRolloverHistory) {
        [rolloverExpenseRows, rolloverTransferRows] = await Promise.all([
          notion.queryDatabase(config.expenseDb, historyFilter),
          notion.queryDatabase(config.transferDb, historyFilter)
        ]);
      } else if (needsChildAliasHistory) {
        historicalExpenseRows = await notion.queryDatabase(config.expenseDb, historyFilter);
      }
      if (needsRolloverHistory && needsChildAliasHistory && historicalExpenseRows.length === 0) {
        historicalExpenseRows = rolloverExpenseRows;
      }
      const rolloverCarryover = needsRolloverHistory
        ? calculateRollover({ t, categoryRows, accountRows, fundGroupRows, rolloverExpenseRows, rolloverTransferRows, config })
        : { total: 0, groups: [] };
      const model = buildAccountSpendingData_(
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

  return { getFundBudgetReport };
}
