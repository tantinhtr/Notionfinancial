export function applyGroupFunding({
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
}) {
  // A group-level transfer can be assigned safely only when exactly one child
  // has spent more than its named allocations and the combined funding closes
  // that child's budget (allowing only sub-1,000đ bookkeeping drift).
  const activeUnfundedChildren = group.children.filter(
    (child) =>
      (childPaidFromFund[child.name] || 0) >
      Math.max(childAllocated[child.name] || 0, 0),
  );
  if (activeUnfundedChildren.length === 1) {
    const childName = activeUnfundedChildren[0].name;
    const unassignedTotal = unassignedAllocations.reduce(
      (sum, amount) => sum + amount,
      0,
    );
    const reconciledTotal =
      Math.max(childAllocated[childName] || 0, 0) + unassignedTotal;
    if (
      unassignedTotal > 0 &&
      Math.abs(reconciledTotal - activeUnfundedChildren[0].budget) < 1000
    ) {
      childAllocated[childName] = reconciledTotal;
    }
  }

  group.allocated = Math.max(netAllocated, 0);
  group.over = Math.max(group.spent - group.budget, 0);
  // Gross allocation includes borrowed funding; spendable money records both loan sides.
  group.fundBalance =
    netAllocated -
    loanAllocation +
    (explicitLedger.fundLoans.balanceAdjustments[fundGroupRow.id] || 0) -
    group.paidFromFund;
  // Hai khoản này khác bản chất, không được cộng chung:
  //   explicitDebts — only obligations with an explicitly identified lender.
  //   transferNeeded— phần ngân sách CHƯA tiêu, phải CẤP vào quỹ trước khi chi.
  // Đã chi rồi không cần cấp lần hai; nợ ứng trước vẫn được giữ riêng.
  if (requiresAllocation) {
    // Explicit internal movements explain balance changes, not unidentified spending.
    group.fundingShortfall = Math.max(group.paidFromFund - netAllocated, 0);
    const bucketToList = (bucket, key) =>
      Object.keys(bucket)
        .map((name) => ({
          [key]: name,
          amount: bucket[name].amount,
          rows: bucket[name].rows
            .slice()
            .sort((a, b) => (a.date < b.date ? -1 : 1)),
        }))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    group.borrowedFunds = bucketToList(borrowByFund, 'fund');
    group.explicitDebts.push(
      ...group.borrowedFunds.map((debt) => ({
        borrowerGroupId: fundGroupRow.id,
        borrowerGroupName: group.name,
        lender: debt.fund,
        principal: debt.amount,
        repaid: 0,
        outstanding: debt.amount,
        rows: debt.rows,
      })),
    );
    group.fundRemaining = Math.max(group.fundBalance, 0);
    for (const child of group.children) {
      const allocated = Math.max(childAllocated[child.name] || 0, 0);
      const paidFromFund = childPaidFromFund[child.name] || 0;
      const paidOutsideFund = Math.max(child.spent - paidFromFund, 0);
      child.allocated = allocated;
      child.paidFromFund = paidFromFund;
      child.paidOutsideFund = paidOutsideFund;
      child.covered = Math.max(allocated, paidFromFund) + paidOutsideFund;
      child.fundRemaining = Math.max(allocated - paidFromFund, 0);
      child.transferNeeded = 0;
    }
    // Đã cấp là số cấp gộp của nhãn, không giảm khi nhãn chi tiền. Chi thẳng
    // từ nguồn khác cũng đã bao phủ phần ngân sách đó; nghĩa vụ hoàn trả nằm ở nợ.
    fundedChildren.sort((a, b) => b.remaining - a.remaining);
    if (group.allocated < group.budget) {
      for (const plannedChild of fundedChildren) {
        const child = group.children.find(
          (entry) => entry.name === plannedChild.name,
        );
        if (!child) continue;
        const needed = Math.max(child.budget - child.covered, 0);
        child.transferNeeded = needed;
        if (needed <= 0) continue;
        group.transferPlan.push({ name: child.name, amount: needed });
        group.transferNeeded += needed;
      }
    }
    const attributedRemaining = group.children.reduce(
      (sum, child) => sum + (child.fundRemaining || 0),
      0,
    );
    group.unassignedFundRemaining = Math.max(
      group.fundRemaining - attributedRemaining,
      0,
    );
  }
}
