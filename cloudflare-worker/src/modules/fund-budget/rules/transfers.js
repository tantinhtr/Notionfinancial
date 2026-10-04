/**
 * Thu thập tiền cấp vào/rút ra của từng nhóm quỹ và bằng chứng chuyển cho nhãn con.
 * Dữ liệu đầu vào đã được đọc từ Notion; hàm chỉ tổng hợp trong bộ nhớ.
 */
import { num_ } from "../../shared/finance/shared.js";
import { plainText_ } from "./assignment.js";

export function collectGroupTransfers({
  explicitLedger,
  fundGroupRow,
  transferRows,
  fundLoanRowIds,
  destinationAccountId,
  ledgerRowsById,
}) {
  const loanAllocation =
    explicitLedger.fundLoans.allocationAdjustments[fundGroupRow.id] || 0;
  let netAllocated = loanAllocation;
  const allocationRows = [];
  for (const transferRow of transferRows) {
    if (fundLoanRowIds.has(transferRow.id)) continue;
    const transferProps = transferRow.properties || {};
    const groupRelation =
      (transferProps['Nhóm Quỹ'] && transferProps['Nhóm Quỹ'].relation) || [];
    if (!groupRelation.length || groupRelation[0].id !== fundGroupRow.id)
      continue;
    const amount = num_(transferProps['Số Tiền']);
    const toRelation =
      (transferProps['Đến Tài Khoản'] &&
        transferProps['Đến Tài Khoản'].relation) ||
      [];
    const fromRelation =
      (transferProps['Từ Tài Khoản'] &&
        transferProps['Từ Tài Khoản'].relation) ||
      [];
    const toId = toRelation.length ? toRelation[0].id : '';
    const fromId = fromRelation.length ? fromRelation[0].id : '';
    if (toId === fromId) continue;
    if (toId === destinationAccountId) {
      netAllocated += amount;
      allocationRows.push({
        amount,
        text:
          ledgerRowsById[transferRow.id]?.normalizedText ||
          plainText_(transferProps['Ghi Chú']),
      });
    }
    if (fromId === destinationAccountId) {
      netAllocated -= amount;
      allocationRows.push({
        amount: -amount,
        text:
          ledgerRowsById[transferRow.id]?.normalizedText ||
          plainText_(transferProps['Ghi Chú']),
      });
    }
  }

    return { loanAllocation, netAllocated, allocationRows };
}
