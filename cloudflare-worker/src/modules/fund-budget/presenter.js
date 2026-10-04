/**
 * Ghép tiêu đề, nhóm quỹ, nhãn con và các vấn đề dữ liệu thành báo cáo Telegram.
 * Giữ phần tiền còn ở nhãn con theo quy tắc hiển thị, không tự tính lại phân bổ.
 */
import { money_, normalizeSearchText_ } from "../shared/finance/shared.js";
import { budgetLine_, childLines_ } from "./presenters/group-lines.js";
import { appendDataIssues_ } from "./presenters/data-issues.js";
export { accountSpendingText_, accountSpendingKeyboard_, unusualSpendingText_, unusualSpendingKeyboard_ } from "./presenters/account-spending.js";

function budgetHeadline_(budget, groups) {
  const spent = (groups || []).reduce(
    (sum, group) => sum + (group.spent || 0),
    0,
  );
  const planned = (groups || []).reduce(
    (sum, group) => sum + (group.budget || 0),
    0,
  );
  const diff = planned - spent;
  const mark = diff < 0 ? ' · ⛔ vượt ' + money_(-diff) : '';
  return '📊 NHÓM QUỸ — ' + money_(spent) + ' / ' + money_(planned) + mark;
}

export function fundBudgetText_(data) {
  data = data || {};
  const t = data.t || {};
  const groups = data.fundGroups || [];
  const allocationTargets = new Map(
    (data.openingPlan?.allocations || []).map((allocation) => [
      normalizeSearchText_(allocation.fund),
      allocation.amount,
    ]),
  );
  const lines = ['📦 QUỸ & NGÂN SÁCH — tháng ' + t.m + '/' + t.y];

  const budget = data.monthlyBudget;
  if (groups.length) {
    lines.push('', budgetHeadline_(budget || { total: 0, limit: 0 }, groups));
    const outsideFundLine = Number.isFinite(budget?.outsideFundSpending)
      ? '• Tổng chi ngoài quỹ: ' + money_(budget.outsideFundSpending)
      : '';
    let outsideFundInserted = false;
    for (const [groupIndex, group] of groups.entries()) {
      if (groupIndex > 0) lines.push('');
      lines.push(
        budgetLine_(group, allocationTargets.get(normalizeSearchText_(group.name))),
      );
      for (const childLine of childLines_(group)) lines.push(childLine);
      if (outsideFundLine && normalizeSearchText_(group.name) === 'huong thu') {
        lines.push('', outsideFundLine);
        outsideFundInserted = true;
      }
    }
    if (outsideFundLine && !outsideFundInserted) lines.push(outsideFundLine);
  }

  const ledger = data.explicitLedger || {};
  appendDataIssues_(lines, ledger.dataIssues);

  if (!groups.length && !budget && lines.length === 1) {
    lines.push('', 'Chưa có dữ liệu tháng này.');
  }
  return lines.join('\n');
}

export function fundBudgetKeyboard_() {
  return {
    inline_keyboard: [[{ text: '⬅️ Dòng tiền', callback_data: 'cash_home' }]],
  };
}


export function presentFundBudget(data) {
  return { text: fundBudgetText_(data), replyMarkup: fundBudgetKeyboard_() };
}
