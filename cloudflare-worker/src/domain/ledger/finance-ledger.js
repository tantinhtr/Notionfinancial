import { propertyText_, validTransactionDate_, readFinanceRows_, mergeDataIssue_, missingFields_ } from "./rows.js";
import { chronologyOnly_, fundNameKey_, positiveEvidenceText_, resolveFund_, orderedFinanceRows_, isExplicitPreviousMonthUse_, isExplicitReimbursement_ } from "./evidence.js";
import { buildFundLoanLedger_ } from "./fund-loan-ledger.js";
import { personalIncomeFallback_, buildPersonalLoanLedger_ } from "./personal-loan-ledger.js";
import { buildOpeningPlan_ } from "./opening-plan.js";
import { buildPreviousMonthAdvanceLedger_ } from "./previous-month-ledger.js";
import { normalizeSearchText_ } from "../finance/shared.js";

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
  const actualOpeningPlan = buildOpeningPlan_(accountRows, options,
    previousMonthAdvances.rentReserveObserved ? previousMonthAdvances.rentReserveUsed : undefined);
  const dataIssues = [...issuesByKey.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime) || a.rowId.localeCompare(b.rowId));
  return {
    rows: currentRows, openingPlan: actualOpeningPlan, personalLoans, previousMonthAdvances, fundLoans,
    dataIssues,
    unmatched: [...personalLoans.unmatched, ...previousMonthAdvances.unmatchedSources, ...fundLoans.unmatched]
  };
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
