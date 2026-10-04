import { monthFilterFor } from "../shared/finance/report-data.js";
import { historyBeforeMonthFilterFor } from "./rules/history.js";
/** @returns {import('./fund-budget.contracts.js').BudgetDataRepository} */
export function createBudgetDataRepository({ notion, config }) {
  async function readMonth(t) {
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
    return { categoryRows, expenseRows, accountRows, transferRows, fundGroupRows, incomeRows, otherIncomeRows, otherIncomeCategoryRows };
  }
  async function readHistory(t, kinds) {
    return Promise.all(kinds.map(kind => notion.queryDatabase(config[kind + "Db"], historyBeforeMonthFilterFor(t))));
  }
  return { readMonth, readHistory };
}
