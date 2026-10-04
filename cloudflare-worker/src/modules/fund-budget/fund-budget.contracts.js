/**
 * Mô tả hợp đồng dữ liệu/phương thức của module ngân sách và nhãn quỹ.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {{categoryRows:object[],expenseRows:object[],accountRows:object[],transferRows:object[],fundGroupRows:object[],incomeRows:object[],otherIncomeRows:object[],otherIncomeCategoryRows:object[]}} BudgetRows
 * @typedef {Object} BudgetDataRepository
 * @property {(t:{y:number,m:number,d:number})=>Promise<BudgetRows>} readMonth
 * @property {(t:{y:number,m:number,d:number},kinds:Array<'income'|'otherIncome'|'expense'|'transfer'>)=>Promise<object[][]>} readHistory Kết quả theo đúng thứ tự loại được yêu cầu, chỉ lấy trước đầu tháng; lỗi được chuyển lên.
 */
export {};
