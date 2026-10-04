/**
 * Gắn bộ đối soát được truyền vào với phép tính ngân sách và rollover.
 * Cả báo cáo hiện tại lẫn dữ liệu tháng trước dùng cùng bộ tính, không để ledger phụ thuộc ngược vào ngân sách.
 */
import { buildAccountSpendingData_ } from "./rules/model.js";
import { calculateRollover } from "./rules/rollover.js";
export function createBudgetCalculator(evaluateLedger) {
  const buildReport = (t, categories, expenses, accounts, limit, transfers, groups, options) =>
    buildAccountSpendingData_(t, categories, expenses, accounts, limit, transfers, groups, options, evaluateLedger);
  return { buildReport, calculateRollover: input => calculateRollover({ ...input, buildBudgetReport: buildReport }) };
}
