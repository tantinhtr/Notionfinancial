import { buildMonthlyCashflowData_ } from "./model.js";
import { iso_ } from "../../domain/finance/shared.js";
import { createDateParts, createReportDateFormatter, monthFilterFor } from "../shared/report-data.js";

export function createCashflowRepository({ notion, state, config, now = () => new Date() }) {
  const dateFormatter = createReportDateFormatter(config.timezone);

  async function getMonthlyCashflow(forceRefresh = false) {
    const t = createDateParts(now, dateFormatter);
    const todayISO = iso_(t.y, t.m, t.d);
    const cacheKey = `monthly-cashflow:${todayISO}`;
    if (!forceRefresh) {
      try {
        const cached = await state.getReportCache(cacheKey);
        if (cached !== null && cached !== undefined) return cached;
      } catch {
        // Cache is optional; a read failure must not block a live report.
      }
    }

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
    const model = buildMonthlyCashflowData_(
      t,
      accountRows,
      incomeRows,
      otherIncomeRows,
      expenseRows,
      transferRows,
      incomeCategoryRows,
      otherIncomeCategoryRows,
      expenseCategoryRows,
      config.goalRelationPageId
    );
    try {
      await state.putReportCache(cacheKey, model, 60);
    } catch {
      // A live report remains valid when its optional cache write fails.
    }
    return model;
  }

  return { getMonthlyCashflow };
}
