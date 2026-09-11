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

function fundNameKey_(name) {
  return normalizeSearchText_(name).replace(/^quy\s+/, "").trim();
}

function resolveFund_(phrase, groups) {
  const key = fundNameKey_(phrase);
  if (!key) return null;
  const exact = groups.filter((group) => group.keys.includes(key));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const prefixes = groups.filter((group) => group.keys.some((alias) => alias.startsWith(key + " ")));
  return prefixes.length === 1 ? prefixes[0] : null;
}

export function buildFundLoanLedger_(rows = [], fundGroups = []) {
  const groups = fundGroups.map((group) => {
    const props = group.properties || {};
    const name = propertyText_(props["Tên Nhóm Quỹ"]);
    return {
      id: group.id, name,
      accountId: relationId_(props["Tài Khoản Giữ Quỹ"]),
      keys: [name, ...propertyText_(props["Tên Cũ"]).split(",")].map(fundNameKey_).filter(Boolean)
    };
  });
  const loans = [];
  const allocationAdjustments = {};
  const balanceAdjustments = {};
  const moveBalance = (fromId, toId, amount) => {
    balanceAdjustments[fromId] = (balanceAdjustments[fromId] || 0) - amount;
    balanceAdjustments[toId] = (balanceAdjustments[toId] || 0) + amount;
  };
  const unmatched = [];
  const orderedRows = rows.slice().sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
      || (a.createdTime || "").localeCompare(b.createdTime || "")
      || a.id.localeCompare(b.id));

  for (const row of orderedRows) {
    if (row.kind !== "transfer" || row.amount <= 0) continue;
    const text = row.normalizedText;
    const repayment = /\b(tra lai|hoan lai|tra no)\b/.exec(text);
    if (repayment) {
      // A relation on a repayment names its receiving lender, never its borrower.
      const before = text.slice(0, repayment.index).trim().replace(/^tu\s+/, "");
      const after = text.slice(repayment.index + repayment[0].length).trim();
      const parts = after.replace(/^(?:[\d.,]+\s*(?:d|dong)?\s*)?(?:tien\s+)?(?:cho\s+)?/, "").split(/\s+tu\s+/);
      const lender = resolveFund_(parts[0], groups);
      const borrowerPhrases = [before, ...parts.slice(1)].filter(Boolean);
      const borrowers = borrowerPhrases.map((phrase) => resolveFund_(phrase, groups));
      const borrower = borrowers[0] || null;
      if (!lender || (row.fundGroupId && row.fundGroupId !== lender.id)
        || borrowers.some((resolved) => !resolved || resolved.id !== borrower?.id)) {
        unmatched.push({ ...row, unmatchedAmount: row.amount, reason: "unidentified-fund-repayment" });
        continue;
      }
      const candidates = loans.filter((loan) => loan.lender === lender.name && loan.outstanding > 0
        && (!borrower || loan.borrowerGroupId === borrower.id));
      if (!candidates.length || (!borrower && candidates.length !== 1)) {
        unmatched.push({ ...row, unmatchedAmount: row.amount, reason: "ambiguous-fund-repayment" });
        continue;
      }
      let remaining = row.amount;
      for (const loan of candidates) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, loan.outstanding);
        loan.repaid += applied;
        loan.outstanding -= applied;
        loan.repaymentRows.push(row.id);
        moveBalance(loan.borrowerGroupId, lender.id, applied);
        remaining -= applied;
      }
      if (remaining > 0) unmatched.push({ ...row, unmatchedAmount: remaining, reason: "excess-fund-repayment" });
      continue;
    }

    const opening = /\b(?:muon(?:\s+tien)?(?:\s+cua)?|lay tu)\s+(.+?)(?=\s+(?:chuyen|sang|cho|de)\b|$)/.exec(text);
    if (!opening) continue;
    const borrower = groups.find((group) => group.id === row.fundGroupId);
    const lender = resolveFund_(opening[1], groups);
    const sameAccount = row.fromAccountId && row.fromAccountId === row.toAccountId;
    if (!borrower || !lender || borrower.id === lender.id
      || (sameAccount && (borrower.accountId !== row.toAccountId || lender.accountId !== row.fromAccountId))) {
      unmatched.push({ ...row, unmatchedAmount: row.amount, reason: "unidentified-fund-loan" });
      continue;
    }
    loans.push({
      borrowerGroupId: borrower.id, borrowerGroupName: borrower.name, lender: lender.name,
      principal: row.amount, repaid: 0, outstanding: row.amount,
      openedBy: row.id, repaymentRows: []
    });
    allocationAdjustments[borrower.id] = (allocationAdjustments[borrower.id] || 0) + row.amount;
    moveBalance(lender.id, borrower.id, row.amount);
  }
  return { loans, allocationAdjustments, balanceAdjustments, unmatched };
}

export function buildFinanceLedger_({
  accountRows = [], incomeRows = [], otherIncomeRows = [], expenseRows = [],
  transferRows = [], categoryRows = [], fundGroupRows = [], options = {}
} = {}) {
  const rows = readFinanceRows_({ incomeRows, otherIncomeRows, expenseRows, transferRows });
  const accountNamesById = new Map(accountRows.map((row) => [row.id, propertyText_(row.properties?.["Phương Thức Thanh Toán"])]));
  const categoryNamesById = new Map(categoryRows.map((row) => [row.id, propertyText_(row.properties?.["Loại Chi Phí"])]));
  const loanCategoryIds = new Set([...categoryNamesById].filter(([, name]) => normalizeSearchText_(name) === "vay va tra").map(([id]) => id));
  const unresolvedPersonalRows = [];
  const personalRows = [];
  for (const row of rows) {
    if (row.kind !== "otherIncome" || categoryNamesById.get(row.categoryId)) {
      personalRows.push(row);
      continue;
    }
    const fallback = row.categoryId && row.amount > 0 ? personalIncomeFallback_(row) : null;
    if (fallback) {
      // This is row-specific evidence, not a classification of every row with this category ID.
      loanCategoryIds.add(row.categoryId);
      personalRows.push(fallback);
    } else if (row.amount > 0 && /\b(?:muon|tra no|tra lai|hoan lai)\b/.test(row.normalizedText)) {
      unresolvedPersonalRows.push({ ...row, unmatchedAmount: row.amount, reason: "unidentified-personal-income" });
    }
  }
  const openingPlan = buildOpeningPlan_(accountRows, options);
  const personalLoans = buildPersonalLoanLedger_(personalRows, { loanCategoryIds, accountNamesById });
  personalLoans.unmatched.push(...unresolvedPersonalRows);
  const fundLoans = buildFundLoanLedger_(rows, fundGroupRows);
  const previousMonthAdvances = buildPreviousMonthAdvanceLedger_({ openingPlan, rows, accountNamesById, categoryNamesById, personalLoans, fundLoans });
  return {
    rows, openingPlan, personalLoans, previousMonthAdvances, fundLoans,
    unmatched: [...personalLoans.unmatched, ...previousMonthAdvances.unmatchedSources, ...fundLoans.unmatched]
  };
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

function personalIncomeFallback_(row) {
  for (const value of [row.title, row.note]) {
    const text = normalizeSearchText_(value);
    const matches = ["borrowerReturn", "borrow"].map((pattern) => text.match(PERSONAL_LOAN_PATTERNS[pattern]))
      .filter((match) => match && match[0].length === text.length
        && !/\b(?:va|hoac|cho|muon|tra|no)\b/.test(match[1]));
    if (matches.length === 1) return { ...row, title: value, note: "" };
    if (/\b(?:muon|tra no|tra lai|hoan lai)\b/.test(text)) return null;
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
    repaymentRow.applications.push({
      openedBy: entry.item.openedBy,
      ...(entry.item.sourceAccountId ? { sourceAccountId: entry.item.sourceAccountId } : {}),
      amount: applied
    });
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
      const repayment = { ...row, party: payment.party, direction: "liability", applications: [] };
      repayments.push(repayment);
      const remaining = applyPersonalRepayment_(openLiabilities, repayment, payment);
      if (remaining > 0) unmatched.push({ ...repayment, unmatchedAmount: remaining });
      continue;
    }

    if (row.kind !== "otherIncome") continue;

    const borrowerReturn = personalLoanParty_(row, "borrowerReturn");
    if (borrowerReturn) {
      const repayment = { ...row, party: borrowerReturn.party, direction: "receivable", applications: [] };
      repayments.push(repayment);
      const remaining = applyPersonalRepayment_(openReceivables, repayment, borrowerReturn);
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
  return /\b(?:lay|muon|dung|su dung)(?:\s+tien)?(?:\s+(?:tu|cua))?\s+(?:tien\s+)?thang\s+truoc\b/.test(text);
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
  const beneficiaries = [...text.matchAll(/\b(?:tra lai|hoan lai|cap bu)\s+(?:[\d.,]+\s*(?:d|dong)?\s*)?(?:tien\s+)?(?:cho\s+)?(.+?)(?=\s+(?:tu|bang|thanh toan)\s+|[|;]|$)/g)]
    .map((match) => match[1].trim().replace(/[.,]+$/, ""));
  return [...states.values()].filter((state) => beneficiaries.includes(normalizeSearchText_(state.account.accountName)));
}

export function buildPreviousMonthAdvanceLedger_({
  openingPlan = {},
  rows = [],
  accountNamesById = {},
  categoryNamesById = {},
  personalLoans = {},
  fundLoans = {}
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
    (personalLoans.repayments || []).filter((row) => row.direction === "liability").map((row) => row.id)
  );
  const personalRepaymentsById = new Map((personalLoans.repayments || []).map((row) => [row.id, row]));
  const fundRepaymentRowIds = new Set(
    (fundLoans.loans || []).flatMap((item) => item.repaymentRows || [])
  );
  let rentExemptRemaining = Math.max(Number(openingPlan.rentReserve) || 0, 0);

  for (const row of orderedFinanceRows_(rows)) {
    if (!(row.amount > 0)) continue;

    const personalRepayment = personalRepaymentsById.get(row.id);
    if (personalRepayment?.direction === "receivable") {
      for (const application of personalRepayment.applications) {
        const sourceState = states.get(application.sourceAccountId);
        if (sourceState) applyAdvanceRepayment_(sourceState, application.amount, application.openedBy);
        else unmatchedSources.push({ ...row, ...application, unmatchedAmount: application.amount });
      }
    }
    if (!personalRepayment && !fundRepaymentRowIds.has(row.id) && isExplicitReimbursement_(row)) {
      const matches = matchingSourceStates_(row, states);
      if (matches.length !== 1) {
        unmatchedSources.push({ ...row, unmatchedAmount: row.amount });
      } else {
        const remaining = applyAdvanceRepayment_(matches[0], row.amount);
        if (remaining > 0) unmatchedSources.push({ ...row, unmatchedAmount: remaining });
      }
    }

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

  for (const account of accounts) {
    account.outstanding = account.principal - account.repaid;
  }

  return {
    totalOutstanding: accounts.reduce((total, account) => total + account.outstanding, 0),
    accounts,
    unmatchedSources
  };
}
