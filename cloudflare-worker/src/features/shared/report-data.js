import { iso_ } from "../../domain/finance/shared.js";

export const MONTH_DATE_PROPERTY = "Ngày";

export function createDateParts(now, dateFormatter) {
  const date = now();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid Date");
  }
  const parts = dateFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, Number(part.value)])
  );
  return { y: values.year, m: values.month, d: values.day };
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

export function createReportDateFormatter(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}
