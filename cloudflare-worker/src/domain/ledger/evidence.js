import { normalizeSearchText_ } from "../finance/shared.js";

export function chronologyOnly_(text) {
  return /^(?:(?:cua|tu|vao)\s+)?(?:thang\s+(?:truoc|nay|sau|\d{1,2}(?:[/-]\d{4})?)(?:\s+nam\s+\d{4})?|ngay\s+(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?|\d{4}-\d{2}-\d{2})|\d{1,2}[/-](?:\d{1,2}[/-])?\d{4}|\d{4}-\d{2}-\d{2}|nam\s+(?:truoc|nay|\d{4})|truoc\s+do|hom\s+qua)?$/.test(text.trim());
}

export function fundNameKey_(name) {
  return normalizeSearchText_(name).replace(/^quy\s+/, "").trim();
}

export function positiveEvidenceText_(text) {
  // Decline the entire clause when negation makes its direction/action uncertain.
  // A comma separates clauses unless it is inside a written number.
  return text.split(/[|;]|(?<!\d),|,(?!\d)/).filter((clause) => !/\bkhong\b/.test(clause)).join(" | ").trim();
}

export function resolveFund_(phrase, groups) {
  const key = fundNameKey_(phrase);
  if (!key) return null;
  const exact = groups.filter((group) => group.keys.includes(key));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const prefixes = groups.filter((group) => group.keys.some((alias) => alias.startsWith(key + " ")));
  return prefixes.length === 1 ? prefixes[0] : null;
}

export function accountName_(accountNamesById, accountId) {
  if (accountNamesById instanceof Map) return accountNamesById.get(accountId) || "";
  return accountNamesById?.[accountId] || "";
}

export function orderedFinanceRows_(rows) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const first = String(a.row.date || "").localeCompare(String(b.row.date || ""))
      || String(a.row.createdTime || "").localeCompare(String(b.row.createdTime || ""))
      || String(a.row.id || "").localeCompare(String(b.row.id || ""));
    return first || a.index - b.index;
  }).map((entry) => entry.row);
}

export function isExplicitPreviousMonthUse_(row) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  return positiveEvidenceText_(text).split("|").some((clause) => {
    if (/\b(?:lay|dung|su dung)(?:\s+tien)?(?:\s+(?:tu|cua))?\s+(?:tien\s+)?thang\s+truoc\b/.test(clause)) return true;
    const borrowing = /\bmuon(?:\s+tien)?(?:\s+(?:tu|cua))?\s+(?:tien\s+)?thang\s+truoc\b/.exec(clause);
    return Boolean(borrowing) && !/\b(?:tra|hoan|thanh toan)\b/.test(clause.slice(0, borrowing.index));
  });
}

export function isExplicitReimbursement_(row) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  return /\b(?:tra lai|hoan lai|cap bu)\b/.test(text);
}
