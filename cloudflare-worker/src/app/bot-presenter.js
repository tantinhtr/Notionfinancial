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
