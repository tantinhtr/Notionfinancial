/**
 * Đánh dấu lần ghi thu nhập có kết quả chưa chắc chắn.
 * Bộ xử lý update dựa vào mã lỗi này để tìm lại giao dịch trước khi cho phép xử lý tiếp.
 */
export class AmbiguousIncomeWriteError extends Error {
  constructor(updateId, { cause } = {}) {
    super(
      "Income write outcome is ambiguous and requires reconciliation",
      cause === undefined ? undefined : { cause }
    );
    this.name = "AmbiguousIncomeWriteError";
    this.code = "AMBIGUOUS_INCOME_WRITE";
    this.updateId = updateId;
  }
}
