import { buildGroupChildren } from "./children.js";
import { collectGroupTransfers } from "./transfers.js";
import { applyGroupFunding } from "./funding.js";
import { stripFundPrefix_ } from "./assignment.js";
import { debtTargetChildName_ } from "./child-matching.js";

export function buildFundGroups({
  fundGroupRows,
  transferRows,
  fixedBudgets,
  accountNames,
  groupAliasKeys,
  explicitLedger,
  ledgerRowsById,
  historicalChildSources,
  extraRowsByGroupId,
  flowAnalysis,
}) {
  const fundGroups = [];
  const knownGroupIds = {};
  for (const row of fundGroupRows) knownGroupIds[row.id] = true;
  const fundLoanRowIds = new Set(
    explicitLedger.fundLoans.loans.flatMap((loan) => [
      loan.openedBy,
      ...loan.repaymentRows,
    ]),
  );
  const expenseSources =
    explicitLedger.previousMonthAdvances.expenseSources || {};
  const outstandingByRow =
    explicitLedger.previousMonthAdvances.outstandingByRow || {};

  for (const fundGroupRow of fundGroupRows) {
    const props = fundGroupRow.properties || {};
    const title = (props['Tên Nhóm Quỹ'] && props['Tên Nhóm Quỹ'].title) || [];
    const destinationRelation =
      (props['Tài Khoản Giữ Quỹ'] && props['Tài Khoản Giữ Quỹ'].relation) || [];
    const destinationAccountId = destinationRelation.length
      ? destinationRelation[0].id
      : '';
    const requiresAllocation = !!(
      props['Bắt Buộc Cấp Quỹ'] && props['Bắt Buộc Cấp Quỹ'].checkbox === true
    );
    const group = {
      name: title.length ? title[0].plain_text : '(nhóm quỹ chưa đặt tên)',
      destinationAccount: accountNames[destinationAccountId] || '',
      budget: 0,
      spent: 0,
      over: 0,
      allocated: 0,
      paidFromFund: 0,
      paidOutsideFund: 0,
      fundBalance: 0,
      fundRemaining: 0,
      fundDebt: 0,
      fundingShortfall: 0,
      explicitDebts: [],
      borrowedFunds: [],
      children: [],
      transferNeeded: 0,
      transferPlan: [],
      requiresAllocation,
    };
    const borrowByFund = {};
    const ownKeys = groupAliasKeys[fundGroupRow.id] || {};
    const addDebtRow = (bucket, key, spendRow, amount, partial) => {
      if (!bucket[key]) bucket[key] = { amount: 0, rows: [] };
      bucket[key].amount += amount;
      bucket[key].rows.push({
        name: spendRow.name,
        amount,
        date: spendRow.date,
        partial: partial === true,
      });
    };

    const { loanAllocation, netAllocated, allocationRows } = collectGroupTransfers({
      explicitLedger,
      fundGroupRow,
      transferRows,
      fundLoanRowIds,
      destinationAccountId,
      ledgerRowsById,
    });

    const { groupRows, fundedChildren, debtChildCandidates } = buildGroupChildren({
      group,
      fixedBudgets,
      fundGroupRow,
      ownKeys,
      expenseSources,
      accountNames,
      destinationAccountId,
      ledgerRowsById,
      historicalChildSources,
      extraRowsByGroupId,
      flowAnalysis,
    });

    const childAllocated = {};
    const unassignedAllocations = [];
    const assignAllocation = (amount, text) => {
      const childName =
        debtTargetChildName_(text, debtChildCandidates) ||
        (group.children.length === 1 ? group.children[0].name : '');
      if (childName) {
        childAllocated[childName] = (childAllocated[childName] || 0) + amount;
        return;
      }
      if (group.children.length > 1 && amount > 0)
        unassignedAllocations.push(amount);
    };
    for (const allocation of allocationRows)
      assignAllocation(allocation.amount, allocation.text);
    for (const loan of explicitLedger.fundLoans.loans) {
      if (
        loan.borrowerGroupId !== fundGroupRow.id ||
        !ledgerRowsById[loan.openedBy]
      )
        continue;
      assignAllocation(
        loan.principal,
        ledgerRowsById[loan.openedBy].normalizedText,
      );
    }
    const childPaidFromFund = {};

    for (const spendRow of groupRows) {
      // Ghi chu tro ve chinh nhom thi khong phai muon.
      const lender =
        spendRow.lender !== '' &&
        ownKeys[stripFundPrefix_(spendRow.lender)] !== true
          ? spendRow.lender
          : '';
      if (lender !== '') {
        addDebtRow(borrowByFund, lender, spendRow, spendRow.amount, false);
      } else if (spendRow.account === accountNames[destinationAccountId]) {
        group.paidFromFund += spendRow.amount;
        if (spendRow.childName) {
          childPaidFromFund[spendRow.childName] =
            (childPaidFromFund[spendRow.childName] || 0) + spendRow.amount;
        }
      } else {
        group.paidOutsideFund += spendRow.amount;
      }
      const outstanding = outstandingByRow[spendRow.id] || 0;
      if (outstanding > 0 && lender === '') {
        group.explicitDebts.push({
          kind: 'account',
          borrowerGroupId: fundGroupRow.id,
          borrowerGroupName: group.name,
          lender: spendRow.account,
          principal: expenseSources[spendRow.id]?.previousMonth || outstanding,
          repaid: Math.max(
            (expenseSources[spendRow.id]?.previousMonth || outstanding) -
              outstanding,
            0,
          ),
          outstanding,
          childName: spendRow.childName || '',
          rows: [
            { name: spendRow.name, amount: outstanding, date: spendRow.date },
          ],
        });
      }
    }

    applyGroupFunding({
      group,
      childPaidFromFund,
      childAllocated,
      unassignedAllocations,
      netAllocated,
      loanAllocation,
      explicitLedger,
      fundGroupRow,
      requiresAllocation,
      borrowByFund,
      fundedChildren,
    });
    group.explicitDebts.push(
      ...explicitLedger.fundLoans.loans.filter(
        (loan) => loan.borrowerGroupId === fundGroupRow.id
          && Object.hasOwn(ledgerRowsById, loan.openedBy),
      ),
    );
    for (const debt of group.explicitDebts) {
      const openingRow = ledgerRowsById[debt.openedBy];
      const debtText = openingRow
        ? openingRow.normalizedText
        : (debt.rows || []).map((row) => row.name).join(' ');
      const childName = debtTargetChildName_(debtText, debtChildCandidates);
      if (childName !== '') debt.childName = childName;
    }
    group.children.sort((a, b) => b.budget - a.budget);
    fundGroups.push(group);
  }

  return { fundGroups, knownGroupIds };
}
