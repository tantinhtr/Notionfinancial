function normalizeSearchText_(value) {
  let text = String(value || "").toLowerCase();
  if (text.normalize) text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return text.replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function propertyText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || part.text?.content || "").join("");
}

function relationId_(property) {
  const relation = property?.relation || [];
  return relation.length ? relation[0].id : "";
}

function amount_(property) {
  return Number(property?.number) || 0;
}

function numericProperty_(property) {
  const value = property?.number ?? property?.formula?.number ?? property?.rollup?.number;
  return Number.isFinite(value) ? value : 0;
}

export function buildOpeningPlan_(accountRows = [], options = {}) {
  const sourceAccountNames = options.sourceAccountNames || [];
  const sourceNameKeys = new Set(sourceAccountNames.map(normalizeSearchText_));
  const sourceAccounts = [];

  for (const accountRow of accountRows) {
    const props = accountRow.properties || {};
    const name = propertyText_(props["Phương Thức Thanh Toán"]);
    if (!sourceNameKeys.has(normalizeSearchText_(name))) continue;
    sourceAccounts.push({
      id: accountRow.id,
      name,
      opening: numericProperty_(props["Số Dư Ban Đầu"])
    });
  }

  const sourceTotal = sourceAccounts.reduce((total, account) => total + account.opening, 0);
  const rentReserveAmount = Number.isFinite(options.rentReserveAmount)
    ? options.rentReserveAmount
    : 0;
  const rentReserve = Math.min(sourceTotal, rentReserveAmount);
  const rentShortfall = Math.max(rentReserveAmount - sourceTotal, 0);
  const remainder = Math.max(sourceTotal - rentReserve, 0);
  const rolloverFundNames = options.rolloverFundNames || [];
  const equalShare = rolloverFundNames.length
    ? Math.floor(remainder / rolloverFundNames.length)
    : 0;
  const indivisibleRemainder = remainder - equalShare * rolloverFundNames.length;
  const allocations = rolloverFundNames.map((fund, index) => ({
    fund,
    amount: equalShare + (index === 0 ? indivisibleRemainder : 0)
  }));

  return {
    sourceTotal,
    rentReserve,
    rentShortfall,
    remainder,
    sourceAccounts,
    allocations
  };
}

function row_(kind, page, titleProperty) {
  const props = page.properties || {};
  const title = propertyText_(props[titleProperty]);
  const note = titleProperty === "Ghi Chú" ? "" : propertyText_(props["Ghi Chú"]);
  const text = [title, note].filter(Boolean).join(" | ");
  return {
    id: page.id,
    kind,
    title,
    note,
    text,
    normalizedText: normalizeSearchText_(text),
    amount: amount_(props["Số Tiền"]),
    date: props["Ngày"]?.date?.start || "",
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
