/**
 * Đọc số tiền từ tin nhắn theo định dạng hiện có và chuyển ngày theo múi giờ.
 * Chuỗi không hợp lệ hoặc số tiền không dương được trả về null để bên gọi từ chối.
 */
import { calendarDateParts, createReportDateFormatter } from "../shared/finance/calendar.js";

export function parseAmount(text) {
  const value = String(text ?? "").trim();
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const amount = Number(value.replace(/[.,]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function dateParts(date, timezone) {
  return calendarDateParts(date, createReportDateFormatter(timezone));
}
