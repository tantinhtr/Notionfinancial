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

function validTransactionDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  return new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
}

function chronologyOnly_(text) {
  return /^(?:(?:cua|tu|vao)\s+)?(?:thang\s+(?:truoc|nay|sau|\d{1,2}(?:[/-]\d{4})?)(?:\s+nam\s+\d{4})?|ngay\s+(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?|\d{4}-\d{2}-\d{2})|\d{1,2}[/-](?:\d{1,2}[/-])?\d{4}|\d{4}-\d{2}-\d{2}|nam\s+(?:truoc|nay|\d{4})|truoc\s+do|hom\s+qua)?$/.test(text.trim());
}

function fundNameKey_(name) {
  return normalizeSearchText_(name).replace(/^quy\s+/, "").trim();
}

function positiveEvidenceText_(text) {
  // Decline the entire clause when negation makes its direction/action uncertain.
  // A comma separates clauses unless it is inside a written number.
  return text.split(/[|;]|(?<!\d),|,(?!\d)/).filter((clause) => !/\bkhong\b/.test(clause)).join(" | ").trim();
}

function resolveFund_(phrase, groups) {
  const key = fundNameKey_(phrase);
  if (!key) return null;
  const exact = groups.filter((group) => group.keys.includes(key));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const prefixes = groups.filter((group) => group.keys.some((alias) => alias.startsWith(key + " ")));
  return prefixes.length === 1 ? prefixes[0] : null;
}

export function buildFundLoanLedger_(rows = [], fundGroups = [], {
  currentRowIds = new Set(rows.map((row) => row.id)), onIssue = () => {}, accountNamesById = {}
} = {}) {
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
  const datedRowIds = new Set(rows.filter((row) => validTransactionDate_(row.date)).map((row) => row.id));
  const orderedRows = rows.slice().sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
      || (a.createdTime || "").localeCompare(b.createdTime || "")
      || a.id.localeCompare(b.id));

  for (const row of orderedRows) {
    if (row.kind !== "transfer" || row.amount <= 0) continue;
    const text = positiveEvidenceText_(row.normalizedText);
    const repayment = /\b(tra lai|hoan lai|tra no)\b/.exec(text);
    if (repayment) {
      // A relation on a repayment names its receiving lender, never its borrower.
      const before = text.slice(0, repayment.index).trim().replace(/^tu\s+/, "");
      const after = text.slice(repayment.index + repayment[0].length).trim();
      const parts = after.replace(/^(?:[\d.,]+(?![\d.,/-])\s*(?:d|dong)?\s*)?(?:tien\s+)?(?:cho\s+)?/, "").split(/\s+tu\s+/);
      const lender = resolveFund_(parts[0], groups);
      const borrowerPhrases = [before, ...parts.slice(1)].filter(Boolean);
      const borrowers = borrowerPhrases.map((phrase) => resolveFund_(phrase, groups));
      const borrower = borrowers[0] || null;
      const relatedGroup = groups.find((group) => group.id === row.fundGroupId);
      if (!lender && !row.fundGroupId && !/\bquy\b/.test(text)) continue;
      if (lender && relatedGroup && relatedGroup.id !== lender.id) {
        onIssue(row, "conflicting_data", [`Nội dung: ${lender.name}; Nhóm Quỹ: ${relatedGroup.name}`]);
      } else if (new Set(borrowers.filter(Boolean).map((resolved) => resolved.id)).size > 1) {
        onIssue(row, "conflicting_data", [`Quỹ liên quan: ${borrowers.filter(Boolean).map((group) => group.name).join("; ")}`]);
      } else if (!lender && chronologyOnly_(parts[0].replace(/^(?:tien|quy)\b\s*/, ""))) {
        onIssue(row, "missing_required_data", ["Quỹ liên quan"]);
      }
      const validatedVirtualMovement = row.fromAccountId && row.fromAccountId === row.toAccountId
        && normalizeSearchText_(accountName_(accountNamesById, row.fromAccountId)) === "quy momo";
      if (!lender || (validatedVirtualMovement && borrower?.id === lender.id) || (row.fundGroupId && row.fundGroupId !== lender.id)
        || borrowers.some((resolved) => !resolved || resolved.id !== borrower?.id)) {
        unmatched.push({ ...row, unmatchedAmount: row.amount, reason: "unidentified-fund-repayment" });
        continue;
      }
      const candidates = loans.filter((loan) => loan.lender === lender.name && loan.outstanding > 0
        && datedRowIds.has(loan.openedBy)
        && (!borrower || loan.borrowerGroupId === borrower.id));
      if (!candidates.length || (!borrower && new Set(candidates.map((loan) => loan.borrowerGroupId)).size > 1)) {
        unmatched.push({ ...row, unmatchedAmount: row.amount, reason: "ambiguous-fund-repayment" });
        onIssue(row, candidates.length ? "missing_required_data" : "history_not_found",
          candidates.length ? ["Quỹ liên quan"] : ["Không tìm thấy bản ghi gốc liên quan"]);
        continue;
      }
      let remaining = row.amount;
      for (const loan of candidates) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, loan.outstanding);
        loan.repaid += applied;
        loan.outstanding -= applied;
        loan.repaymentRows.push(row.id);
        if (currentRowIds.has(row.id)) moveBalance(loan.borrowerGroupId, lender.id, applied);
        remaining -= applied;
      }
      if (remaining > 0) {
        unmatched.push({ ...row, unmatchedAmount: remaining, reason: "fund-history-not-found" });
        onIssue(row, "history_not_found", ["Không tìm thấy bản ghi gốc liên quan"]);
      }
      continue;
    }

    const opening = /\b(?:muon(?:\s+tien)?(?:\s+cua)?|lay tu)\s+(.+?)(?=\s+(?:chuyen|sang|cho|de)\b|$)/.exec(text);
    if (!opening) continue;
    const borrower = groups.find((group) => group.id === row.fundGroupId);
    const lender = resolveFund_(opening[1], groups);
    const sameAccount = row.fromAccountId && row.fromAccountId === row.toAccountId;
    if (!borrower && sameAccount) onIssue(row, "missing_required_data", ["Nhóm Quỹ"]);
    if (sameAccount && !lender && chronologyOnly_(opening[1].replace(/^(?:tien|quy)\b\s*/, ""))) {
      onIssue(row, "missing_required_data", ["Quỹ liên quan"]);
    }
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
    if (currentRowIds.has(row.id)) {
      allocationAdjustments[borrower.id] = (allocationAdjustments[borrower.id] || 0) + row.amount;
      moveBalance(lender.id, borrower.id, row.amount);
    }
  }
  return { loans, allocationAdjustments, balanceAdjustments, unmatched };
}

export function buildFinanceLedger_({
  accountRows = [], incomeRows = [], otherIncomeRows = [], expenseRows = [],
  transferRows = [], historicalIncomeRows = [], historicalOtherIncomeRows = [],
  historicalExpenseRows = [], historicalTransferRows = [],
  categoryRows = [], otherIncomeCategoryRows = [], fundGroupRows = [], options = {}
} = {}) {
  const currentRows = readFinanceRows_({ incomeRows, otherIncomeRows, expenseRows, transferRows });
  const historicalRows = readFinanceRows_({
    incomeRows: historicalIncomeRows,
    otherIncomeRows: historicalOtherIncomeRows,
    expenseRows: historicalExpenseRows,
    transferRows: historicalTransferRows
  });
  const semanticRows = [...historicalRows.filter((row) => validTransactionDate_(row.date)), ...currentRows];
  const currentRowIds = new Set(currentRows.map((row) => row.id));
  const currentRowsById = new Map(currentRows.map((row) => [row.id, row]));
  const issuesByKey = new Map();
  const onIssue = (row, type, details) => mergeDataIssue_(issuesByKey, currentRowIds, currentRowsById.get(row.id) || row, type, details);
  for (const row of currentRows) {
    const missing = missingFields_(row, options.goalRelationPageId);
    if (missing.length) onIssue(row, "missing_required_data", missing);
  }
  const accountNamesById = new Map(accountRows.map((row) => [row.id, propertyText_(row.properties?.["Phương Thức Thanh Toán"])]));
  validateExplicitConflicts_(currentRows, accountNamesById, fundGroupRows, onIssue);
  const categoryNamesById = new Map(categoryRows.map((row) => [row.id, propertyText_(row.properties?.["Loại Chi Phí"])]));
  const otherIncomeCategoryNamesById = new Map(otherIncomeCategoryRows.map((row) => [row.id,
    propertyText_(row.properties?.["Loại Khoản Thu"])]));
  const loanCategoryIds = new Set([...categoryNamesById].filter(([, name]) => normalizeSearchText_(name) === "vay va tra").map(([id]) => id));
  const unresolvedPersonalRows = [];
  const personalRows = [];
  for (const row of semanticRows) {
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
  personalLoans.unmatched = personalLoans.unmatched.filter((row) => currentRowIds.has(row.id));
  for (const row of personalLoans.unmatched) {
    if (row.direction) onIssue(row, "history_not_found", ["Không tìm thấy bản ghi gốc liên quan"]);
  }
  for (const row of currentRows) {
    if (missingFields_(row, options.goalRelationPageId).length) continue;
    if (loanCategoryIds.has(row.categoryId) || unresolvedPersonalRows.some((item) => item.id === row.id)) {
      if ([row.title, row.note].some((text) => {
        const action = normalizeSearchText_(text).match(/^(?:tra(?: lai)? (?:no|tien muon)(?: cho)?|cho muon(?: tien)?|muon(?: tien)?|nhan (?:lai )?(?:tien )?(?:tra no|tra lai))(?:\s+(.+))?$/);
        return action && chronologyOnly_(action[1] || "");
      })) {
        onIssue(row, "missing_required_data", ["Người liên quan"]);
      }
    }
  }
  const fundLoans = buildFundLoanLedger_(semanticRows, fundGroupRows, { currentRowIds, onIssue, accountNamesById });
  fundLoans.unmatched = fundLoans.unmatched.filter((row) => currentRowIds.has(row.id));
  validateReimbursements_(semanticRows, accountNamesById, fundGroupRows, personalLoans, fundLoans, onIssue);
  const previousMonthAdvances = buildPreviousMonthAdvanceLedger_({ openingPlan, rows: currentRows,
    accountNamesById, categoryNamesById, otherIncomeCategoryNamesById, personalLoans, fundLoans,
    passThroughKeywords: options.passThroughKeywords, passThroughCategories: options.passThroughCategories });
  const dataIssues = [...issuesByKey.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime) || a.rowId.localeCompare(b.rowId));
  return {
    rows: currentRows, openingPlan, personalLoans, previousMonthAdvances, fundLoans,
    dataIssues,
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

function mergeDataIssue_(issuesByKey, currentRowIds, row, type, details) {
  if (!currentRowIds.has(row.id)) return;
  const key = row.id + ":" + type;
  const existing = issuesByKey.get(key);
  if (existing) existing.details = [...new Set([...existing.details, ...details])];
  else issuesByKey.set(key, dataIssue_(row, type, details));
}

function missingFields_(row, goalRelationPageId) {
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

function validateExplicitConflicts_(rows, accountNamesById, fundGroups, onIssue) {
  const accounts = [...accountNamesById].map(([id, name]) => ({ id, name, key: normalizeSearchText_(name) }));
  const groups = fundGroups.map((group) => ({
    id: group.id, name: propertyText_(group.properties?.["Tên Nhóm Quỹ"]),
    keys: [propertyText_(group.properties?.["Tên Nhóm Quỹ"]), ...propertyText_(group.properties?.["Tên Cũ"]).split(",")]
      .map(fundNameKey_).filter(Boolean)
  }));
  const clean = (phrase) => phrase.trim().replace(/[.,]+$/, "");
  for (const row of rows) {
    const text = positiveEvidenceText_(row.normalizedText);
    const directions = [...text.matchAll(/\b(tu|sang|vao|den|thanh toan bang)\s+(.+?)(?=\s+(?:tu|sang|vao|den|de|chuyen|thanh toan bang)\s+|[|;]|$)/g)];
    for (const [, direction, phrase] of directions) {
      const payment = direction === "thanh toan bang";
      if ((row.kind === "transfer") === payment) continue;
      const matches = accounts.filter((account) => account.key && account.key === clean(phrase));
      if (matches.length !== 1) continue;
      const relationId = payment ? row.accountId : direction === "tu" ? row.fromAccountId : row.toAccountId;
      const related = accounts.find((account) => account.id === relationId && account.name);
      if (!related || related.id === matches[0].id) continue;
      const field = payment ? "Phương Thức Thanh Toán" : direction === "tu" ? "Từ Tài Khoản" : "Đến Tài Khoản";
      onIssue(row, "conflicting_data", [`Ghi chú: ${matches[0].name}; ${field}: ${related.name}`]);
    }
    if (row.kind !== "transfer" || !row.fromAccountId || row.fromAccountId !== row.toAccountId
      || normalizeSearchText_(accountNamesById.get(row.fromAccountId)) !== "quy momo") continue;

    const related = groups.find((group) => group.id === row.fundGroupId);
    if (!row.fundGroupId) onIssue(row, "missing_required_data", ["Nhóm Quỹ"]);
    const sourcePhrases = directions.filter(([, direction]) => direction === "tu").map((match) => match[2]);
    const destinationPhrases = directions.filter(([, direction]) => ["sang", "vao", "den"].includes(direction)).map((match) => match[2]);
    for (const clause of text.split(/[|;]/)) {
      const opening = /\bmuon(?:\s+tien)?(?:\s+cua)?\s+(.+?)(?=\s+(?:chuyen|sang|cho|de)\b|$)/.exec(clause);
      if (opening) sourcePhrases.push(opening[1]);
      const repayment = /\b(?:tra lai|hoan lai|tra no)\b/.exec(clause);
      if (!repayment) continue;
      const before = clause.slice(0, repayment.index).trim().replace(/^tu\s+/, "");
      if (before) sourcePhrases.push(before);
      const after = clause.slice(repayment.index + repayment[0].length).trim()
        .replace(/^(?:[\d.,]+(?![\d.,/-])\s*(?:d|dong)?\s*)?(?:tien\s+)?(?:cho\s+)?/, "")
        .split(/\s+tu\s+/);
      destinationPhrases.push(after[0]);
    }
    const sources = sourcePhrases.map((phrase) => resolveFund_(clean(phrase), groups)).filter(Boolean);
    const destinations = destinationPhrases.map((phrase) => resolveFund_(clean(phrase), groups)).filter(Boolean);
    const conflictingDestinations = related ? destinations.filter((group) => group.id !== related.id) : [];
    if (conflictingDestinations.length) {
      onIssue(row, "conflicting_data", conflictingDestinations.map((group) => `Nội dung: ${group.name}; Nhóm Quỹ: ${related.name}`));
    }
    const sourceIds = new Set(sources.map((group) => group.id));
    if (related && sourceIds.size === 1 && sourceIds.has(related.id)) {
      onIssue(row, "conflicting_data", [`Quỹ liên quan: ${related.name}; Nhóm Quỹ: ${related.name} (cần hai quỹ khác nhau)`]);
    } else if (sourceIds.size !== 1) {
      onIssue(row, "missing_required_data", ["Quỹ liên quan"]);
    }
  }
}

const PERSONAL_LOAN_PATTERNS = {
  lend: /^cho\s+(.+?)\s+muon(?:\s+tien)?(?:\s|$)/,
  borrowerReturn: /^(.+?)\s+tra(?:\s+no|\s+tien\s+muon|\s+lai)(?:\s|$)/,
  borrow: /^(.+?)\s+cho\s+muon(?:\s+tien)?(?:\s|$)/,
  liabilityPayment: /^tra(?:\s+lai)?\s+(?:tien\s+muon|no)\s+(?:cho\s+)?(.+?)(?:\s+muon)?(?:\s+thang|\s*\(|$)/
};

const PERSONAL_LOAN_DISPLAY_PATTERNS = {
  lend: /^cho\s+(.+?)\s+(?:mượn|muon)(?:\s+(?:tiền|tien))?(?:\s|$)/iu,
  borrowerReturn: /^(.+?)\s+(?:trả|tra)(?:\s+(?:nợ|no)|\s+(?:tiền|tien)\s+(?:mượn|muon)|\s+(?:lại|lai))(?:\s|$)/iu,
  borrow: /^(.+?)\s+cho\s+(?:mượn|muon)(?:\s+(?:tiền|tien))?(?:\s|$)/iu,
  liabilityPayment: /^(?:trả|tra)(?:\s+(?:lại|lai))?\s+(?:(?:tiền|tien)\s+(?:mượn|muon)|(?:nợ|no))\s+(?:cho\s+)?(.+?)(?:\s+(?:mượn|muon))?(?:\s+(?:tháng|thang)|\s*\(|$)/iu
};

function personalLoanParty_(row, patternName) {
  for (const value of [row.title, row.note]) {
    const partyText = String(value || "").replace(/\s+(?:mượn|muon)\s+(?:trước đó|truoc do).*$/iu, "");
    const normalizedMatch = normalizeSearchText_(partyText).match(PERSONAL_LOAN_PATTERNS[patternName]);
    if (!normalizedMatch) continue;
    if (chronologyOnly_(normalizedMatch[1])) continue;

    const displayText = partyText.toLowerCase().replace(/\s+/g, " ").trim();
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
    if (entry.partyKey !== partyInfo.key || entry.item.outstanding <= 0 || !validTransactionDate_(entry.date)) continue;

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
        openReceivables.push({ item, partyKey: lender.key, date: row.date });
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
    openLiabilities.push({ item, partyKey: borrower.key, date: row.date });
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

function isExplicitAccountDebt_(row, state, categoryNamesById) {
  if (normalizeSearchText_(accountName_(categoryNamesById, row.categoryId)) === "vay va tra") return false;
  const account = normalizeSearchText_(state.account.accountName);
  const text = positiveEvidenceText_(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  const note = normalizeSearchText_(row.note);
  return /\bno\b/.test(text) && (text.includes("no " + account) || /^no(?:\s+\d[\d.,]*(?:\s*(?:d|dong))?)?$/.test(note));
}

function isNetAppTarget_(row, otherIncomeCategoryNamesById) {
  const text = normalizeSearchText_([row.title, row.note,
    accountName_(otherIncomeCategoryNamesById, row.categoryId)].filter(Boolean).join(" | "));
  return /\b(?:thu nhap rong (?:grap|grab)|(?:grap|grab) thu nhap rong)\b/.test(text);
}

function isCurrentMonthReceipt_(row, state, otherIncomeCategoryNamesById, passThroughKeywords, passThroughCategories) {
  const account = normalizeSearchText_(state.account.accountName);
  if (account !== "momo" && account !== "grap tien mat" && account !== "grab tien mat") return false;
  const text = positiveEvidenceText_(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  if (isNetAppTarget_(row, otherIncomeCategoryNamesById)) return false;
  if (row.kind === "income") return true;
  const category = normalizeSearchText_(accountName_(otherIncomeCategoryNamesById, row.categoryId));
  if ((passThroughKeywords || []).some((word) => text.includes(normalizeSearchText_(word)))
    || (passThroughCategories || []).some((name) => category === normalizeSearchText_(name))) return false;
  if (/\b(?:vay|muon|hoan|tam ung|pass through)\b/.test(category)
    || /\b(?:vay|muon|hoan lai|tra no|cap bu|chi ho|ung ho)\b/.test(text)) return false;
  return category !== "" || /\b(?:grap|grab)\s+(?:qr|tien mat)\b/.test(text);
}

function validateReimbursements_(rows, accountNamesById, fundGroups, personalLoans, fundLoans, onIssue) {
  const beneficiaries = [
    ...[...accountNamesById].map(([id, name]) => ({ id, name, keys: [normalizeSearchText_(name)], kind: "account" })),
    ...fundGroups.map((group) => ({
      id: group.id, name: propertyText_(group.properties?.["Tên Nhóm Quỹ"]), kind: "fund",
      keys: [propertyText_(group.properties?.["Tên Nhóm Quỹ"]), ...propertyText_(group.properties?.["Tên Cũ"]).split(",")]
        .map(fundNameKey_).filter(Boolean)
    }))
  ];
  const personalIds = new Set([
    ...personalLoans.repayments.map((row) => row.id),
    ...personalLoans.receivables.map((item) => item.openedBy),
    ...personalLoans.liabilities.map((item) => item.openedBy)
  ]);
  const fundIds = new Set([
    ...fundLoans.unmatched.map((row) => row.id),
    ...fundLoans.loans.flatMap((item) => [item.openedBy, ...item.repaymentRows])
  ]);
  const obligations = [];
  for (const row of orderedFinanceRows_(rows)) {
    if (validTransactionDate_(row.date) && isExplicitPreviousMonthUse_(row) && (row.kind === "expense" || row.kind === "transfer")) {
      obligations.push({ accountId: row.accountId || row.fromAccountId, fundId: row.fundGroupId, remaining: row.amount });
    }
    if (!isExplicitReimbursement_(row) || personalIds.has(row.id) || fundIds.has(row.id)) continue;
    const text = positiveEvidenceText_(row.normalizedText);
    if (!/\b(?:tra lai|hoan lai|cap bu)\b/.test(text)) continue;
    const phrases = [...text.matchAll(/\b(?:tra lai|hoan lai|cap bu)\s*(.*?)(?=\s+(?:tu|bang|thanh toan)\s+|[|;]|$)/g)]
      .flatMap((match) => match[1].replace(/^(?:[\d.,]+(?![\d.,/-])\s*(?:d|dong)?\s*)?(?:tien\s*)?(?:cho\s*)?/, "").split(/\s+(?:va|hoac)\s+/))
      .map((phrase) => phrase.trim().replace(/[.,]+$/, "")).filter(Boolean);
    const matches = [...new Set(phrases.flatMap((phrase) => {
      const exact = beneficiaries.filter((item) => item.keys.includes(item.kind === "fund" ? fundNameKey_(phrase) : phrase));
      if (exact.length) return exact.length === 1 ? exact : [];
      const prefixes = beneficiaries.filter((item) => item.kind === "fund" && item.keys.some((key) => key.startsWith(fundNameKey_(phrase) + " ")));
      return prefixes.length === 1 ? prefixes : [];
    }))];
    if (!matches.length && phrases.every(chronologyOnly_)) {
      onIssue(row, "missing_required_data", ["Tài khoản hoặc quỹ cần hoàn"]);
      continue;
    }
    if (matches.length > 1) {
      onIssue(row, "conflicting_data", [`Bên cần hoàn: ${matches.map((item) => item.name).join("; ")}`]);
      continue;
    }
    if (matches.length !== 1) continue;
    const beneficiary = matches[0];
    const relationId = beneficiary.kind === "fund" ? row.fundGroupId : row.kind === "transfer" ? row.toAccountId : row.accountId;
    const relation = beneficiaries.find((item) => item.kind === beneficiary.kind && item.id === relationId);
    if (relation && relation.id !== beneficiary.id) {
      onIssue(row, "conflicting_data", [`Bên cần hoàn: ${beneficiary.name}; Quan hệ: ${relation.name}`]);
      continue;
    }
    const matching = obligations.filter((item) => item.remaining > 0
      && (beneficiary.kind === "fund" ? item.fundId : item.accountId) === beneficiary.id);
    if (!matching.length) {
      onIssue(row, "history_not_found", ["Không tìm thấy bản ghi gốc liên quan"]);
      continue;
    }
    let remaining = row.amount;
    for (const item of matching) {
      const applied = Math.min(remaining, item.remaining);
      item.remaining -= applied;
      remaining -= applied;
      if (remaining <= 0) break;
    }
  }
}

export function buildPreviousMonthAdvanceLedger_({
  openingPlan = {},
  rows = [],
  accountNamesById = {},
  categoryNamesById = {},
  otherIncomeCategoryNamesById = {},
  passThroughKeywords = [],
  passThroughCategories = [],
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
  const expenseSources = {};
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
      if (isNetAppTarget_(row, otherIncomeCategoryNamesById)) continue;
      const cohort = liabilityOpeningIds.has(row.id)
          ? "borrowed"
          : returnedReceivableRowIds.has(row.id)
            ? "returned"
            : isCurrentMonthReceipt_(row, state, otherIncomeCategoryNamesById,
              passThroughKeywords, passThroughCategories) ? "earned" : "passThrough";
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

      const rentReserveTransfer = isRentReserveTransfer_(row, categoryNamesById);
      const openingUsed = consumeOpening_(fromState, row.amount);
      const currentUse = consumeNonOpening_(fromState, row.amount - openingUsed);
      if (toState && toState !== fromState) {
        toState.openingAvailable += openingUsed;
        for (const [cohort, amount] of Object.entries(currentUse.consumed)) {
          addCohort_(toState, cohort, amount);
        }
      }

      if (rentReserveTransfer) {
        const exempt = Math.min(openingUsed, rentExemptRemaining);
        rentExemptRemaining -= exempt;
        const advanceAmount = openingUsed - exempt;
        recordAdvance_(fromState, row, advanceAmount, advanceAmount !== row.amount);
      } else if (isExplicitPreviousMonthUse_(row)) {
        recordAdvance_(fromState, row, row.amount);
      }
      continue;
    }

    if (row.kind !== "expense") continue;
    const state = states.get(row.accountId);
    if (!state) continue;

    if (isExplicitPreviousMonthUse_(row) || isExplicitAccountDebt_(row, state, categoryNamesById)) {
      const openingUsed = consumeOpening_(state, row.amount);
      consumeNonOpening_(state, row.amount - openingUsed);
      expenseSources[row.id] = { currentMonth: 0, previousMonth: row.amount, unproven: 0 };
      recordAdvance_(state, row, row.amount);
      continue;
    }

    const currentUse = consumeNonOpening_(state, row.amount);
    const openingUsed = consumeOpening_(state, currentUse.remaining);
    expenseSources[row.id] = {
      currentMonth: currentUse.consumed.earned,
      previousMonth: openingUsed,
      unproven: row.amount - currentUse.consumed.earned - openingUsed
    };
    if (!liabilityRepaymentRowIds.has(row.id)) {
      recordAdvance_(state, row, openingUsed, openingUsed !== row.amount);
    }
  }

  for (const account of accounts) {
    account.outstanding = account.principal - account.repaid;
  }

  const outstandingByRow = {};
  for (const state of states.values()) {
    for (const obligation of state.obligations) {
      outstandingByRow[obligation.rowId] = (outstandingByRow[obligation.rowId] || 0)
        + obligation.principal - obligation.repaid;
    }
  }

  return {
    totalOutstanding: accounts.reduce((total, account) => total + account.outstanding, 0),
    accounts,
    unmatchedSources,
    expenseSources,
    outstandingByRow
  };
}
