/**
 * Lưu nội dung phản hồi chung, bàn phím quay về và thông báo lỗi xử lý.
 * Chỉ cung cấp dữ liệu hiển thị cho router/webhook.
 */
export const FALLBACK_TEXT = "Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.";
export const HOME_KEYBOARD = Object.freeze({
  inline_keyboard: Object.freeze([Object.freeze([
    Object.freeze({ text: "🏠 Các tài khoản", callback_data: "cash_home" })
  ])])
});
export function callbackErrorText(error) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return `Lỗi: ${message || "Không thể xử lý yêu cầu."}`;
}


export const PROCESSING_FAILURE_TEXT =
  "⚠️ Bot chưa xác nhận được kết quả xử lý. Với khoản thu nhập, hãy kiểm tra Notion trước khi nhập lại để tránh ghi trùng.";
