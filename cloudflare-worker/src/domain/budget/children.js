import { stripFundPrefix_ } from "./assignment.js";
import { debtTargetChildName_ } from "./child-matching.js";

export function buildGroupChildren({
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
}) {
  const groupRows = [];
  const fundedChildren = [];
  const debtChildCandidates = [];
  for (const fixed of fixedBudgets) {
    if (fixed.groupId !== fundGroupRow.id) continue;
    const paidOutsideByAccount = {};
    if (!fixed.skipsFund) {
      for (const spendRow of fixed.spendRows) {
        const lender =
          spendRow.lender !== '' &&
          ownKeys[stripFundPrefix_(spendRow.lender)] !== true
            ? spendRow.lender
            : '';
        const currentMonth = expenseSources[spendRow.id]?.currentMonth || 0;
        if (
          lender === '' &&
          currentMonth > 0 &&
          spendRow.account !== '' &&
          spendRow.account !== accountNames[destinationAccountId]
        ) {
          paidOutsideByAccount[spendRow.account] =
            (paidOutsideByAccount[spendRow.account] || 0) + currentMonth;
        }
      }
    }
    group.budget += fixed.budget;
    group.spent += fixed.spent;
    const child = {
      name: fixed.name,
      budget: fixed.budget,
      spent: fixed.spent,
      over: Math.max(fixed.spent - fixed.budget, 0),
    };
    const paidOutsideSources = Object.keys(paidOutsideByAccount)
      .map((account) => ({ account, amount: paidOutsideByAccount[account] }))
      .sort((a, b) => b.amount - a.amount);
    if (paidOutsideSources.length)
      child.paidOutsideSources = paidOutsideSources;
    group.children.push(child);
    debtChildCandidates.push({
      name: fixed.name,
      sources: [
        fixed.name,
        ...fixed.spendRows.map((row) =>
          row.name + ' ' + (ledgerRowsById[row.id]?.note || ''),
        ),
        ...(historicalChildSources[fixed.id] || []),
      ],
    });
    // Chi nhung nhan con thuc su phai di qua tai khoan giu quy moi tinh vao so
    // can cap them. Đi Chợ tra thang bang tien mat thi khong doi bom truoc.
    if (!fixed.skipsFund && fixed.budget > fixed.spent) {
      fundedChildren.push({
        name: fixed.name,
        remaining: fixed.budget - fixed.spent,
      });
    }
    for (const spendRow of fixed.spendRows) groupRows.push(spendRow);
  }
  // Khoan chi duoc ghi chu "tinh vao quy X" keo vao day, du Loai Chi Phi khac.
  for (const extraRow of extraRowsByGroupId[fundGroupRow.id] || []) {
    group.spent += extraRow.amount;
    const source = flowAnalysis.rowsById[extraRow.id];
    const childName =
      debtTargetChildName_(
        extraRow.name + ' ' + (source?.note || ''),
        debtChildCandidates,
      ) || (group.children.length === 1 ? group.children[0].name : '');
    if (childName) {
      extraRow.childName = childName;
      const child = group.children.find((entry) => entry.name === childName);
      child.spent += extraRow.amount;
      child.over = Math.max(child.spent - child.budget, 0);
      const funded = fundedChildren.find((entry) => entry.name === childName);
      if (funded)
        funded.remaining = Math.max(funded.remaining - extraRow.amount, 0);
    }
    groupRows.push(extraRow);
  }
  groupRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { groupRows, fundedChildren, debtChildCandidates };
}
