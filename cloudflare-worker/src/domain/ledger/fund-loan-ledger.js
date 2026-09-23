import { propertyText_, relationId_, validTransactionDate_ } from "./rows.js";
import { chronologyOnly_, fundNameKey_, positiveEvidenceText_, resolveFund_, accountName_ } from "./evidence.js";
import { normalizeSearchText_ } from "../finance/shared.js";

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
