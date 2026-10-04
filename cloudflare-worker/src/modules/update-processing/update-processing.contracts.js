/**
 * Mô tả hợp đồng dữ liệu/phương thức của module xử lý update và chống ghi trùng.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {Object} UpdateProcessingPorts
 * @property {{get:(key:string)=>Promise<object|undefined>,put:(key:string,value:object)=>Promise<void>}} storage Trạng thái update được lưu bền vững, tách khỏi cache báo cáo.
 * @property {(work:Function)=>Promise<object>} runExclusive Tuần tự hóa việc xử lý cùng một update ID.
 * @property {(update:object)=>string} classifyUpdate
 * @property {(update:object)=>Promise<void>} executeUpdate Có thể phát sinh lỗi AMBIGUOUS_INCOME_WRITE khi chưa rõ kết quả ghi.
 * @property {(id:number)=>Promise<object|null>} reconcileIncome Null nghĩa là xác nhận chưa có; lỗi đối soát không cho phép tạo lại trang.
 * @property {(update:object)=>Promise<void>} completeReconciledIncome Chỉ xác nhận, không tạo khoản thu mới.
 * @property {(update:object,error:Error)=>Promise<void>} warnNeedsReconciliation
 * @property {()=>string} now Thời điểm do bên gọi cấp để ghi nhận chuyển trạng thái.
 */
export {};
