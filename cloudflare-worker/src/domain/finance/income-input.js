import { calendarDateParts, createReportDateFormatter } from "./calendar.js";

export function parseAmount(text) {
  const value = String(text ?? "").trim();
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const amount = Number(value.replace(/[.,]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function dateParts(date, timezone) {
  return calendarDateParts(date, createReportDateFormatter(timezone));
}
