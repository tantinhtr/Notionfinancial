/**
 * Điều phối ngày báo cáo, cache và dữ liệu tháng qua repository được truyền vào.
 * Trả báo cáo đã tính; cung cấp thao tác xóa cache khi thu nhập thay đổi.
 */
import { createDateParts, createReportDateFormatter } from "../shared/finance/report-data.js";
import { iso_ } from "../shared/finance/shared.js";
import { loadReport } from "../shared/cache/report-cache.js";
import { buildMonthlyCashflowData_ } from "./cashflow.rules.js";
const cacheKey = date => "monthly-cashflow:" + date;
/** @param {{repository: import('./cashflow.contracts.js').CashflowDataRepository, cache: import('../shared/cache/cache.contracts.js').Cache, config: object, now?: () => Date}} dependencies */
export function createCashflowService({ repository, cache, config, now = () => new Date() }) {
  const formatter = createReportDateFormatter(config.timezone);
  // Lấy báo cáo tháng theo ngày hiện tại; forceRefresh bỏ qua lần đọc cache.
  async function getMonthlyCashflow(forceRefresh = false) {
    const t = createDateParts(now, formatter);
    return loadReport(cache, cacheKey(iso_(t.y,t.m,t.d)), forceRefresh, async () => {
      const { accountRows, incomeRows, otherIncomeRows, expenseRows, transferRows, incomeCategoryRows, otherIncomeCategoryRows, expenseCategoryRows } = await repository.readMonth(t);
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
      return model;
    });
  }
  return { getMonthlyCashflow, invalidate: date => cache.delete(cacheKey(date)) };
}
