/**
 * Cung cấp ngày báo cáo, bộ lọc tháng và cách đọc số/ngày từ dòng dữ liệu.
 * Giữ quy tắc giá trị mặc định hiện có để các báo cáo không hiểu khác nhau.
 */
import { calendarDateParts } from "./calendar.js";
export { createReportDateFormatter } from "./calendar.js";
import { iso_ } from "./shared.js";

export const MONTH_DATE_PROPERTY = "Ngày";

export function createDateParts(now, dateFormatter) {
  return calendarDateParts(now(), dateFormatter);
}

export function monthFilterFor(t) {
  return {
    and: [
      { property: MONTH_DATE_PROPERTY, date: { on_or_after: iso_(t.y, t.m, 1) } },
      { property: MONTH_DATE_PROPERTY, date: { on_or_before: iso_(t.y, t.m, t.d) } }
    ]
  };
}

export function numericProperty(row, property) {
  const value = row?.properties?.[property]?.number;
  return Number.isFinite(value) ? value : 0;
}

export function dateProperty(row, property) {
  return row?.properties?.[property]?.date?.start || "";
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
