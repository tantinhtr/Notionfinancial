/**
 * Tạo dòng hiển thị cho nhóm quỹ và từng nhãn con, gồm thông tin nợ đã có bằng chứng.
 * Quy tắc hiển thị số dư nhãn con tập trung ở đây.
 */
import { money_ } from "../../shared/finance/shared.js";

function legacyFundBalanceChildName_(group) {
  const children = group.children || [];
  if (children.some((child) => Object.hasOwn(child, 'fundRemaining'))) return '';
  const held = Math.max(group.fundRemaining || 0, 0);
  if (children.length < 2 || held <= 0) return '';
  const matches = children.filter((child) => {
    const remaining = Math.max((child.budget || 0) - (child.spent || 0), 0);
    return remaining > 0 && held >= remaining && held - remaining < 1000;
  });
  return matches.length === 1 ? matches[0].name : '';
}

function debtInlineTexts_(debts) {
  return (debts || [])
    .filter((debt) => (debt.outstanding || 0) > 0)
    .map((debt) => {
      const lender = String(debt.lender || '(chưa rõ quỹ)').trim();
      const fundName =
        debt.kind === 'account'
          ? lender
          : /^quỹ(?:\s|$)/i.test(lender)
            ? lender
            : 'Quỹ ' + lender;
      return 'còn nợ ' + fundName + ' ' + money_(debt.outstanding);
    });
}

export function budgetLine_(group, allocationTarget) {
  const over = group.over || 0;
  const children = group.children || [];
  const showsMonthlyAllocation =
    group.requiresAllocation &&
    children.length < 2 &&
    Number.isFinite(allocationTarget);
  let row =
    (over > 0 ? '⛔ ' : '✅ ') +
    group.name +
    ': ' +
    money_(showsMonthlyAllocation ? group.allocated || 0 : group.spent) +
    ' / ' +
    money_(showsMonthlyAllocation ? allocationTarget : group.budget);
  if (over > 0) {
    row += ' · vượt ' + money_(over);
  } else if (!group.requiresAllocation && !showsMonthlyAllocation) {
    row +=
      ' · còn ' + money_(Math.max((group.budget || 0) - (group.spent || 0), 0));
  }
  if (group.requiresAllocation && children.length < 2 && !showsMonthlyAllocation) {
    row +=
      (group.allocated || 0) > 0
        ? ' · đã cấp ' + money_(group.allocated)
        : ' · chưa cấp';
  }
  const childNames = new Set(children.map((child) => child.name));
  const debts = debtInlineTexts_(
    (group.explicitDebts || []).filter(
      (debt) =>
        children.length < 2 ||
        !debt.childName ||
        !childNames.has(debt.childName),
    ),
  );
  if (debts.length) row += ' · ' + debts.join(', ');
  return row;
}

// Lo la ten lon, nhan Notion la con cua lo. Lo nao co nhieu hon mot nhan thi in
// them dong con, khong thi dong tong da noi du roi.
export function childLines_(group) {
  const children = group.children || [];
  if (children.length < 2) return [];
  const legacyBalanceChildName = legacyFundBalanceChildName_(group);
  return children.map((child) => {
    const outsideSources = (child.paidOutsideSources || []).map(
      (source) => source.account + ': ' + money_(source.amount),
    );
    const debts = debtInlineTexts_(
      (group.explicitDebts || []).filter(
        (debt) => debt.childName === child.name,
      ),
    );
    return (
      '   • ' +
      child.name +
      ': ' +
      money_(child.spent) +
      ' / ' +
      money_(child.budget) +
      (child.over > 0 ? ' ⛔ vượt ' + money_(child.over) : '') +
      ((child.spent || 0) > 0 &&
      ((child.fundRemaining || 0) > 0 || child.name === legacyBalanceChildName)
        ? ' · quỹ còn ' +
          money_(
            child.name === legacyBalanceChildName
              ? group.fundRemaining
              : child.fundRemaining,
          )
        : '') +
      (debts.length ? ' · ' + debts.join(', ') : '') +
      (outsideSources.length ? ' · đã chi từ ' + outsideSources.join(', ') : '')
    );
  });
}
