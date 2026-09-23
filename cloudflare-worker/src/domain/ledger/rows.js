import { normalizeSearchText_ } from "../finance/shared.js";

export function propertyText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || part.text?.content || "").join("");
}

export function relationId_(property) {
  const relation = property?.relation || [];
  return relation.length ? relation[0].id : "";
}

function amount_(property) {
  return Number(property?.number) || 0;
}

export function numericProperty_(property) {
  const value = property?.number ?? property?.formula?.number ?? property?.rollup?.number;
  return Number.isFinite(value) ? value : 0;
}

export function validTransactionDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  return new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
}

function row_(kind, page, titleProperty) {
  const props = page.properties || {};
  const title = propertyText_(props[titleProperty]);
  const amountProperty = props["Số Tiền"];
  const note = titleProperty === "Ghi Chú" ? "" : propertyText_(props["Ghi Chú"]);
  const text = [title, note].filter(Boolean).join(" | ");
  return {
    id: page.id,
    kind,
    title,
    note,
    text,
    normalizedText: normalizeSearchText_(text),
    amount: amount_(amountProperty),
    amountPresent: Number.isFinite(amountProperty?.number),
    date: props["Ngày"]?.date?.start || "",
    datePresent: typeof props["Ngày"]?.date?.start === "string" && props["Ngày"].date.start !== "",
    titlePresent: title.trim() !== "",
    createdTime: page.created_time || "",
    categoryId: relationId_(props[kind === "expense" ? "Loại Chi Phí" : "Loại Khoản Thu"]),
    accountId: relationId_(props["Phương Thức Thanh Toán"]),
    fromAccountId: relationId_(props["Từ Tài Khoản"]),
    toAccountId: relationId_(props["Đến Tài Khoản"]),
    fundGroupId: relationId_(props["Nhóm Quỹ"]),
    transferType: props["Loại Chuyển Đổi"]?.select?.name || ""
  };
}

export function readFinanceRows_({
  incomeRows = [], otherIncomeRows = [], expenseRows = [], transferRows = []
} = {}) {
  return [
    ...incomeRows.map((page) => row_("income", page, "Tên Khoản Thu")),
    ...otherIncomeRows.map((page) => row_("otherIncome", page, "Tên Khoản Thu")),
    ...expenseRows.map((page) => row_("expense", page, "Nội Dung Khoản Chi")),
    ...transferRows.map((page) => row_("transfer", page, "Ghi Chú"))
  ].sort((a, b) => (a.date + a.createdTime).localeCompare(b.date + b.createdTime));
}

function dataIssue_(row, type, details) {
  return {
    type,
    rowId: row.id,
    date: row.date,
    createdTime: row.createdTime,
    title: row.title,
    amount: row.amount,
    details: [...new Set(details)]
  };
}

export function mergeDataIssue_(issuesByKey, currentRowIds, row, type, details) {
  if (!currentRowIds.has(row.id)) return;
  const key = row.id + ":" + type;
  const existing = issuesByKey.get(key);
  if (existing) existing.details = [...new Set([...existing.details, ...details])];
  else issuesByKey.set(key, dataIssue_(row, type, details));
}

export function missingFields_(row, goalRelationPageId) {
  const missing = [];
  if (!row.titlePresent) missing.push("Nội dung");
  if (!row.datePresent) missing.push("Ngày");
  if (!row.amountPresent) missing.push("Số Tiền");
  if (row.kind === "expense") {
    if (!row.categoryId) missing.push("Loại Chi Phí");
    if (!row.accountId) missing.push("Phương Thức Thanh Toán");
  }
  if (row.kind === "income" || row.kind === "otherIncome") {
    if (!row.categoryId) missing.push("Loại Khoản Thu");
    if (!row.accountId && !(row.kind === "income" && row.categoryId === goalRelationPageId)) {
      missing.push("Phương Thức Thanh Toán");
    }
  }
  if (row.kind === "transfer") {
    if (!row.transferType) missing.push("Loại Chuyển Đổi");
    if (!row.fromAccountId) missing.push("Từ Tài Khoản");
    if (!row.toAccountId) missing.push("Đến Tài Khoản");
  }
  return missing;
}
