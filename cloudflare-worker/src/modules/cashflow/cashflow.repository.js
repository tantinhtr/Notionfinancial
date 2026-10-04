import { monthFilterFor } from "../shared/finance/report-data.js";
/** @returns {import('./cashflow.contracts.js').CashflowDataRepository} */
export function createCashflowDataRepository({ notion, config }) {
  async function readMonth(t) {
    const filter = monthFilterFor(t);
      const [
        accountRows,
        incomeRows,
        otherIncomeRows,
        expenseRows,
        incomeCategoryRows,
        otherIncomeCategoryRows,
        expenseCategoryRows,
        transferRows
      ] = await Promise.all([
        notion.queryDatabase(config.accountDb),
        notion.queryDatabase(config.incomeDb, filter),
        notion.queryDatabase(config.otherIncomeDb, filter),
        notion.queryDatabase(config.expenseDb, filter),
        notion.queryDatabase(config.goalDb),
        notion.queryDatabase(config.otherIncomeCategoryDb),
        notion.queryDatabase(config.budgetDb),
        notion.queryDatabase(config.transferDb, filter)
      ]);
    return { accountRows, incomeRows, otherIncomeRows, expenseRows, transferRows, incomeCategoryRows, otherIncomeCategoryRows, expenseCategoryRows };
  }
  return { readMonth };
}
