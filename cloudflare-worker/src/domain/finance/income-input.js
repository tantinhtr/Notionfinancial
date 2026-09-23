export function parseAmount(text) {
  const value = String(text ?? "").trim();
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const amount = Number(value.replace(/[.,]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function dateParts(date, timezone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid Date");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, Number(part.value)])
  );
  return { y: parts.year, m: parts.month, d: parts.day };
}
