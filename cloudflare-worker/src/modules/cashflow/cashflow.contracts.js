/**
 * Mô tả hợp đồng dữ liệu/phương thức của module dòng tiền và tài khoản.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {{accountRows:object[],incomeRows:object[],otherIncomeRows:object[],expenseRows:object[],transferRows:object[],incomeCategoryRows:object[],otherIncomeCategoryRows:object[],expenseCategoryRows:object[]}} CashflowRows
 * @typedef {{readMonth: (t:{y:number,m:number,d:number}) => Promise<CashflowRows>}} CashflowDataRepository Trả các dòng thuộc tính gốc; lỗi truy vấn được chuyển lên.
 * @typedef {{getMonthlyCashflow: (forceRefresh?:boolean) => Promise<object>, invalidate:(dateISO:string)=>Promise<void>}} CashflowService
 */
export {};
