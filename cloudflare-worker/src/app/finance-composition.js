/**
 * Ghép các phép tính thuần để giữ chữ ký hàm cũ cho các điểm gọi tương thích.
 * Logic thật nằm trong module ngân sách và ledger, không sao chép thuật toán vào đây.
 */
// Pure compatibility composition; canonical runtime injects the same evaluator.
import { createBudgetCalculator, buildOpeningPlan_ } from "../modules/fund-budget/index.js";
import { evaluateFinanceLedger } from "../modules/financial-ledger/index.js";
const calculator = createBudgetCalculator(evaluateFinanceLedger);
export const buildAccountSpendingData_ = calculator.buildReport;
export const calculateRollover = calculator.calculateRollover;
export function buildFinanceLedger_(input = {}) {
  return evaluateFinanceLedger({ ...input, openingPlan: buildOpeningPlan_(input.accountRows, input.options) });
}
