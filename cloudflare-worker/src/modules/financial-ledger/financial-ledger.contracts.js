/**
 * Mô tả hợp đồng dữ liệu/phương thức của module đối soát nghĩa vụ tài chính.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {Object} LedgerInput
 * @property {object} openingPlan Do module ngân sách tính trước; bộ đối soát trả bản sao của phương án.
 * @property {object[]} [accountRows]
 * @property {object[]} [incomeRows]
 * @property {object[]} [expenseRows]
 * @property {object[]} [transferRows]
 * @property {object[]} [historicalIncomeRows]
 * @property {object[]} [historicalOtherIncomeRows]
 * @property {object[]} [historicalExpenseRows]
 * @property {object[]} [historicalTransferRows]
 * @property {object} [options] Chính sách tài chính được truyền vào; không tự đọc môi trường hoặc đồng hồ.
 * @typedef {(input:LedgerInput)=>{rows:object[],openingPlan:object,personalLoans:object,fundLoans:object,previousMonthAdvances:object,dataIssues:object[],unmatched:object[]}} LedgerEvaluator
 */
export {};
