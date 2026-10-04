/**
 * Mô tả hợp đồng dữ liệu/phương thức của cache dùng chung.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {Object} Cache
 * @property {(key:string)=>Promise<object|null|undefined>} get Không có cache thì trả null/undefined; lỗi kết nối có thể làm promise thất bại.
 * @property {(key:string,value:object,ttlSeconds:number)=>Promise<void>} set Lưu báo cáo đã tuần tự hóa trong thời hạn TTL được truyền vào.
 * @property {(key:string)=>Promise<void>} delete Xóa một khóa, không tác động các báo cáo khác.
 */
export {};
