/**
 * Mô tả hợp đồng dữ liệu/phương thức của module đồng bộ bảng sáu lọ.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {Object} SixJarRepository
 * @property {()=>Promise<{properties:object}>} readSchema
 * @property {(properties:object)=>Promise<{properties:object}>} updateSchema Không thử lại; trả cấu trúc thuộc tính đã lưu.
 * @property {()=>Promise<object[]>} readRows Tất cả dòng tháng, gồm cả dòng có tiêu đề trống.
 * @property {(properties:object)=>Promise<object>} createRow Chỉ gửi một lần tạo dòng.
 * @property {(id:string,properties:object)=>Promise<object>} updateRow Chỉ gửi một lần cập nhật dòng.
 */
export {};
