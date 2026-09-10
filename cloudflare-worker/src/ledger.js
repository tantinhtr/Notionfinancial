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
  for (const value of [row.title, row.note]) {
    const normalizedMatch = normalizeSearchText_(value).match(PERSONAL_LOAN_PATTERNS[patternName]);
    if (!normalizedMatch) continue;

    const displayText = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    const displayMatch = displayText.match(PERSONAL_LOAN_DISPLAY_PATTERNS[patternName]);
    const party = (displayMatch?.[1] || normalizedMatch[1]).replace(/\s+/g, " ").trim();
    return { party, key: normalizeSearchText_(party) };
  }

  return null;
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

function orderedFinanceRows_(rows) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const first = String(a.row.date || "").localeCompare(String(b.row.date || ""))
      || String(a.row.createdTime || "").localeCompare(String(b.row.createdTime || ""))
      || String(a.row.id || "").localeCompare(String(b.row.id || ""));
    return first || a.index - b.index;
  }).map((entry) => entry.row);
}

function addCohort_(state, cohort, amount) {
  if (amount > 0) state.cohorts[cohort] += amount;
}

function consumeNonOpening_(state, amount) {
  let remaining = amount;
  const consumed = { earned: 0, passThrough: 0, borrowed: 0, returned: 0 };

  for (const cohort of Object.keys(consumed)) {
    const used = Math.min(state.cohorts[cohort], remaining);
    state.cohorts[cohort] -= used;
    consumed[cohort] = used;
    remaining -= used;
    if (remaining <= 0) break;
  }

  return { consumed, remaining };
}

function consumeOpening_(state, amount) {
  const used = Math.min(state.openingAvailable, amount);
  state.openingAvailable -= used;
  return used;
}

function recordAdvance_(state, row, amount, ambiguous = false) {
  if (amount <= 0) return;
  state.account.principal += amount;
  state.obligations.push({ rowId: row.id, principal: amount, repaid: 0 });
  if (ambiguous) {
    state.account.ambiguousRows.push({ ...row, advanceAmount: amount });
  } else {
    state.account.rows.push(row);
  }
}

function applyAdvanceRepayment_(state, amount, openedBy = "") {
  let remaining = amount;
  for (const obligation of state.obligations) {
    if (remaining <= 0) break;
    if (openedBy && obligation.rowId !== openedBy) continue;
    const outstanding = obligation.principal - obligation.repaid;
    if (outstanding <= 0) continue;
    const applied = Math.min(outstanding, remaining);
    obligation.repaid += applied;
    state.account.repaid += applied;
    remaining -= applied;
  }
  return remaining;
}

function isExplicitPreviousMonthUse_(row) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  return /\b(?:lay|muon)(?:\s+tien)?(?:\s+(?:tu|cua))?\s+(?:tien\s+)?thang\s+truoc\b/.test(text);
}

function isExplicitReimbursement_(row) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  return /\b(?:tra lai|hoan lai|cap bu)\b/.test(text);
}

function isRentReserveTransfer_(row, categoryNamesById) {
  if (row.kind !== "transfer") return false;
  const category = normalizeSearchText_(accountName_(categoryNamesById, row.categoryId));
  const text = row.normalizedText || normalizeSearchText_(row.text || row.title);
  return category === "nha tro" || /\b(?:nha tro|tien phong)\b/.test(text);
}

function matchingSourceStates_(row, states) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  const matches = [...states.values()].filter((state) => {
    const key = normalizeSearchText_(state.account.accountName);
    if (!key) return false;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(text);
  });

  return matches.filter((candidate) => {
    const key = normalizeSearchText_(candidate.account.accountName);
    return !matches.some((other) => {
      const otherKey = normalizeSearchText_(other.account.accountName);
      return other !== candidate && otherKey.length > key.length && otherKey.includes(key);
    });
  });
}

export function buildPreviousMonthAdvanceLedger_({
  openingPlan = {},
  rows = [],
  accountNamesById = {},
  categoryNamesById = {},
  personalLoans = {}
} = {}) {
  const accounts = (openingPlan.sourceAccounts || []).map((source) => ({
    accountId: source.id,
    accountName: source.name || accountName_(accountNamesById, source.id),
    principal: 0,
    repaid: 0,
    outstanding: 0,
    rows: [],
    ambiguousRows: []
  }));
  const states = new Map(accounts.map((account, index) => [account.accountId, {
    account,
    openingAvailable: Math.max(Number(openingPlan.sourceAccounts[index].opening) || 0, 0),
    cohorts: { earned: 0, passThrough: 0, borrowed: 0, returned: 0 },
    obligations: []
  }]));
  const unmatchedSources = [];
  const liabilityOpeningIds = new Set((personalLoans.liabilities || []).map((item) => item.openedBy));
  const returnedReceivableRowIds = new Set(
    (personalLoans.receivables || []).flatMap((item) => item.repaymentRows || [])
  );
  const liabilityRepaymentRowIds = new Set(
    (personalLoans.liabilities || []).flatMap((item) => item.repaymentRows || [])
  );
  const personalRepaymentRowIds = new Set(
    (personalLoans.receivables || []).flatMap((item) => item.repaymentRows || [])
  );
  let rentExemptRemaining = Math.max(Number(openingPlan.rentReserve) || 0, 0);

  for (const row of orderedFinanceRows_(rows)) {
    if (!(row.amount > 0)) continue;

    if (row.kind === "income" || row.kind === "otherIncome") {
      const state = states.get(row.accountId);
      if (!state) continue;
      const cohort = row.kind === "income"
        ? "earned"
        : liabilityOpeningIds.has(row.id)
          ? "borrowed"
          : returnedReceivableRowIds.has(row.id)
            ? "returned"
            : "passThrough";
      addCohort_(state, cohort, row.amount);
      continue;
    }

    if (row.kind === "transfer") {
      const fromState = states.get(row.fromAccountId);
      const toState = states.get(row.toAccountId);
      if (!fromState) {
        if (toState) addCohort_(toState, "passThrough", row.amount);
        continue;
      }

      const openingUsed = consumeOpening_(fromState, row.amount);
      const currentUse = consumeNonOpening_(fromState, row.amount - openingUsed);
      if (toState && toState !== fromState) {
        toState.openingAvailable += openingUsed;
        for (const [cohort, amount] of Object.entries(currentUse.consumed)) {
          addCohort_(toState, cohort, amount);
        }
      }

      if (isRentReserveTransfer_(row, categoryNamesById)) {
        const exempt = Math.min(openingUsed, rentExemptRemaining);
        rentExemptRemaining -= exempt;
        const advanceAmount = openingUsed - exempt;
        recordAdvance_(fromState, row, advanceAmount, advanceAmount !== row.amount);
      } else if (isExplicitPreviousMonthUse_(row)) {
        recordAdvance_(fromState, row, row.amount);
      }
      if (currentUse.remaining > 0) {
        unmatchedSources.push({ ...row, unmatchedAmount: currentUse.remaining });
      }
      continue;
    }

    if (row.kind !== "expense") continue;
    const state = states.get(row.accountId);
    if (!state) continue;

    if (isExplicitPreviousMonthUse_(row)) {
      consumeOpening_(state, row.amount);
      recordAdvance_(state, row, row.amount);
      continue;
    }

    const currentUse = consumeNonOpening_(state, row.amount);
    const openingUsed = consumeOpening_(state, currentUse.remaining);
    if (!liabilityRepaymentRowIds.has(row.id)) {
      recordAdvance_(state, row, openingUsed, openingUsed !== row.amount);
    }
    if (currentUse.remaining - openingUsed > 0) {
      unmatchedSources.push({ ...row, unmatchedAmount: currentUse.remaining - openingUsed });
    }
  }

  for (const receivable of personalLoans.receivables || []) {
    if (!(receivable.repaid > 0)) continue;
    const sourceState = states.get(receivable.sourceAccountId);
    if (!sourceState) {
      unmatchedSources.push({
        openedBy: receivable.openedBy,
        sourceAccountId: receivable.sourceAccountId,
        unmatchedAmount: receivable.repaid
      });
      continue;
    }
    applyAdvanceRepayment_(sourceState, receivable.repaid, receivable.openedBy);
  }

  for (const row of orderedFinanceRows_(rows)) {
    if (!(row.amount > 0) || personalRepaymentRowIds.has(row.id) || !isExplicitReimbursement_(row)) continue;
    const matches = matchingSourceStates_(row, states);
    if (matches.length !== 1) {
      unmatchedSources.push({ ...row, unmatchedAmount: row.amount });
      continue;
    }
    const remaining = applyAdvanceRepayment_(matches[0], row.amount);
    if (remaining > 0) unmatchedSources.push({ ...row, unmatchedAmount: remaining });
  }

  for (const account of accounts) {
    account.outstanding = account.principal - account.repaid;
  }

  return {
    totalOutstanding: accounts.reduce((total, account) => total + account.outstanding, 0),
    accounts,
    unmatchedSources
  };
}
