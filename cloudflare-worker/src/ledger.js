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

const PERSONAL_LOAN_PATTERNS = {
  lend: /^cho\s+(.+?)\s+muon(?:\s+tien)?(?:\s|$)/,
  borrowerReturn: /^(.+?)\s+tra(?:\s+no|\s+tien\s+muon|\s+lai)(?:\s|$)/,
  borrow: /^(.+?)\s+cho\s+muon(?:\s+tien)?(?:\s|$)/,
  liabilityPayment: /^tra(?:\s+lai)?\s+tien\s+muon\s+(?:cho\s+)?(.+?)(?:\s+thang|\s*\(|$)/
};

const PERSONAL_LOAN_DISPLAY_PATTERNS = {
  lend: /^cho\s+(.+?)\s+(?:mượn|muon)(?:\s+(?:tiền|tien))?(?:\s|$)/iu,
  borrowerReturn: /^(.+?)\s+(?:trả|tra)(?:\s+(?:nợ|no)|\s+(?:tiền|tien)\s+(?:mượn|muon)|\s+(?:lại|lai))(?:\s|$)/iu,
  borrow: /^(.+?)\s+cho\s+(?:mượn|muon)(?:\s+(?:tiền|tien))?(?:\s|$)/iu,
  liabilityPayment: /^(?:trả|tra)(?:\s+(?:lại|lai))?\s+(?:tiền|tien)\s+(?:mượn|muon)\s+(?:cho\s+)?(.+?)(?:\s+(?:tháng|thang)|\s*\(|$)/iu
};

function personalLoanParty_(row, patternName) {
  const normalizedMatch = normalizeSearchText_(row.title).match(PERSONAL_LOAN_PATTERNS[patternName]);
  if (!normalizedMatch) return null;

  const displayText = String(row.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const displayMatch = displayText.match(PERSONAL_LOAN_DISPLAY_PATTERNS[patternName]);
  const party = (displayMatch?.[1] || normalizedMatch[1]).replace(/\s+/g, " ").trim();
  return { party, key: normalizeSearchText_(party) };
}

function accountName_(accountNamesById, accountId) {
  if (accountNamesById instanceof Map) return accountNamesById.get(accountId) || "";
  return accountNamesById?.[accountId] || "";
}

function applyPersonalRepayment_(openItems, repaymentRow, partyInfo) {
  let remaining = repaymentRow.amount;

  for (const entry of openItems) {
    if (remaining <= 0) break;
    if (entry.partyKey !== partyInfo.key || entry.item.outstanding <= 0) continue;

    const applied = Math.min(remaining, entry.item.outstanding);
    entry.item.repaid += applied;
    entry.item.outstanding -= applied;
    entry.item.repaymentRows.push(repaymentRow.id);
    remaining -= applied;
  }

  return remaining;
}

export function buildPersonalLoanLedger_(rows = [], options = {}) {
  const loanCategoryIds = options.loanCategoryIds || new Set();
  const accountNamesById = options.accountNamesById || {};
  const receivables = [];
  const liabilities = [];
  const repayments = [];
  const unmatched = [];
  const openReceivables = [];
  const openLiabilities = [];
  const orderedRows = rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const first = a.row.date.localeCompare(b.row.date)
      || a.row.createdTime.localeCompare(b.row.createdTime)
      || a.row.id.localeCompare(b.row.id);
    return first || a.index - b.index;
  });

  for (const { row } of orderedRows) {
    if (!loanCategoryIds.has(row.categoryId) || row.amount <= 0) continue;

    if (row.kind === "expense") {
      const lender = personalLoanParty_(row, "lend");
      if (lender) {
        const item = {
          party: lender.party,
          principal: row.amount,
          repaid: 0,
          outstanding: row.amount,
          openedBy: row.id,
          repaymentRows: [],
          sourceAccountId: row.accountId,
          sourceAccountName: accountName_(accountNamesById, row.accountId)
        };
        receivables.push(item);
        openReceivables.push({ item, partyKey: lender.key });
        continue;
      }

      const payment = personalLoanParty_(row, "liabilityPayment");
      if (!payment) continue;
      const repayment = { ...row, party: payment.party };
      repayments.push(repayment);
      const remaining = applyPersonalRepayment_(openLiabilities, row, payment);
      if (remaining > 0) unmatched.push({ ...repayment, unmatchedAmount: remaining });
      continue;
    }

    if (row.kind !== "otherIncome") continue;

    const borrowerReturn = personalLoanParty_(row, "borrowerReturn");
    if (borrowerReturn) {
      const repayment = { ...row, party: borrowerReturn.party };
      repayments.push(repayment);
      const remaining = applyPersonalRepayment_(openReceivables, row, borrowerReturn);
      if (remaining > 0) unmatched.push({ ...repayment, unmatchedAmount: remaining });
      continue;
    }

    const borrower = personalLoanParty_(row, "borrow");
    if (!borrower) continue;
    const item = {
      party: borrower.party,
      principal: row.amount,
      repaid: 0,
      outstanding: row.amount,
      openedBy: row.id,
      repaymentRows: []
    };
    liabilities.push(item);
    openLiabilities.push({ item, partyKey: borrower.key });
  }

  return { receivables, liabilities, repayments, unmatched };
}
