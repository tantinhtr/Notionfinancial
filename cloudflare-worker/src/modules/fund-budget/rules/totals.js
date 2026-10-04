import { normalizeSearchText_, num_ } from "../../shared/finance/shared.js";
import { plainText_ } from "./assignment.js";
export function buildMonthlyBudget_(tiers, monthlyLimit) {
  const total = tiers.groupSpending + tiers.looseSpending;
  return {
    limit: monthlyLimit,
    groupSpending: tiers.groupSpending,
    looseSpending: tiers.looseSpending,
    outsideFundSpending: tiers.outsideFundSpending,
    looseByCategory: Object.keys(tiers.looseByCategory)
      .map((category) => ({
        category,
        amount: tiers.looseByCategory[category],
      }))
      .sort((a, b) => b.amount - a.amount),
    total,
    over: Math.max(total - monthlyLimit, 0),
    remaining: Math.max(monthlyLimit - total, 0),
  };
}

// Tien di qua duoc noi dung/loai nghiep vu xac nhan: khong tinh la chi tieu cua thang.
export function buildExcluded_(tiers) {
  const rows = tiers.excludedRows
    .slice()
    .sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

// Thu nhap that chi la bang Bao Cao Thu Nhap. Bang Khoan Thu Khac la tien chay qua:
// doanh thu gop Grab (doi ung voi chi phi nap vi/xang) va tien muon/tra/thu ho.
export function buildIncomeSplit_(incomeRows, otherIncomeRows) {
  const sum = (rows) =>
    (rows || []).reduce(
      (total, row) => total + num_((row.properties || {})['Số Tiền']),
      0,
    );
  let grabGross = 0;
  let other = 0;
  for (const row of otherIncomeRows || []) {
    const props = row.properties || {};
    const name = normalizeSearchText_(plainText_(props['Tên Khoản Thu']));
    const amount = num_(props['Số Tiền']);
    if (name.indexOf('grap') >= 0 || name.indexOf('grab') >= 0)
      grabGross += amount;
    else other += amount;
  }
  return { real: sum(incomeRows), grabGross, other };
}
