import { validateExplicitConflicts_, validateReimbursements_ } from "./validation.js";
import { PERSONAL_LOAN_HINT } from "./transaction-language.js";
import { propertyText_, validTransactionDate_, readFinanceRows_, mergeDataIssue_, missingFields_ } from "./rows.js";
import { chronologyOnly_ } from "./evidence.js";
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
    } else if (row.amount > 0 && PERSONAL_LOAN_HINT.test(row.normalizedText)) {
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
  const actualOpeningPlan = buildOpeningPlan_(accountRows, options);
  const dataIssues = [...issuesByKey.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime) || a.rowId.localeCompare(b.rowId));
  return {
    rows: currentRows, openingPlan: actualOpeningPlan, personalLoans, previousMonthAdvances, fundLoans,
    dataIssues,
    unmatched: [...personalLoans.unmatched, ...previousMonthAdvances.unmatchedSources, ...fundLoans.unmatched]
  };
}
