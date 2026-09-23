import { validTransactionDate_ } from "./rows.js";
import { chronologyOnly_, accountName_ } from "./evidence.js";
import { normalizeSearchText_ } from "../finance/shared.js";

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

export function personalIncomeFallback_(row) {
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
