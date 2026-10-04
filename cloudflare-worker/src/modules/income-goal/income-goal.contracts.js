/**
 * Mô tả hợp đồng dữ liệu/phương thức của module thu nhập Grab và mục tiêu.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {Object} IncomeDataRepository
 * @property {(t: {y:number,m:number,d:number}) => Promise<{goalRows:object[],incomeRows:object[]}>} readGoalRows
 * @property {(updateId: string) => Promise<object|null>} findByUpdateId Chỉ trả null khi truy vấn xác nhận chưa có bản ghi; lỗi truy vấn phải được chuyển lên.
 * @property {(updateId:string,dateISO:string,amount:number) => Promise<object>} insertRecord Ghi một lần, không tự thử lại; vẫn có thể báo lỗi sau khi máy chủ đã lưu.
 * @typedef {Object} IncomeService
 * @property {() => Promise<object>} getGoalStatus
 * @property {(updateId:number|string,amount:number) => Promise<object>} recordRevenue Trả mục tiêu sau khi ghi thành công hoặc xác nhận bản ghi đã tồn tại.
 * @property {(updateId:number|string) => Promise<object|null>} findGrabIncomeByUpdateId
 */
export {};
