import { money_, normalizeSearchText_ } from "../../domain/finance/shared.js";

function expenseBudgetOverviewLines_(data, monthlyLimit, heading) {
  const spendingTotal =
    data.personalSpendingTotal == null
      ? data.total
      : data.personalSpendingTotal;
  const unusualTotal = data.unusualSpending ? data.unusualSpending.total : 0;
  const routineTotal = Math.max(spendingTotal - unusualTotal, 0);
  const lines = [
    heading,
    'Hạn mức: ' + money_(monthlyLimit),
    'Đã dùng: ' + money_(spendingTotal),
  ];
  if (spendingTotal > monthlyLimit) {
    lines.push('⚠️ Vượt: ' + money_(spendingTotal - monthlyLimit));
  } else {
    lines.push('Còn: ' + money_(monthlyLimit - spendingTotal));
  }
  lines.push('', 'Trong số đã dùng:');
  lines.push('• Chi bình thường: ' + money_(routineTotal));
  if (unusualTotal > 0)
    lines.push('⚠️ Chi bất thường: ' + money_(unusualTotal));

  const hasNonBudgetFlow =
    (data.loanFlow && data.loanFlow.total > 0) ||
    (data.grabFlow && data.grabFlow.total > 0);
  if (hasNonBudgetFlow) lines.push('', 'Không tính vào ngân sách 5,5 triệu:');
  if (data.loanFlow && data.loanFlow.total > 0) {
    let line = '↔️ Cho mượn/trả nợ: ' + money_(data.loanFlow.total);
    const details = [];
    if (data.loanFlow.lent > 0)
      details.push('cho mượn ' + money_(data.loanFlow.lent));
    if (data.loanFlow.repaid > 0)
      details.push('trả nợ ' + money_(data.loanFlow.repaid));
    if (data.loanFlow.other > 0)
      details.push('khác ' + money_(data.loanFlow.other));
    if (details.length) line += ' (' + details.join('; ') + ')';
    lines.push(line);
  }
  if (data.grabFlow && data.grabFlow.total > 0) {
    let line = '🛵 Chạy Grab: ' + money_(data.grabFlow.total);
    const details = [];
    if (data.grabFlow.capital > 0)
      details.push('nạp ví ' + money_(data.grabFlow.capital));
    if (data.grabFlow.operating > 0)
      details.push('xăng/phí ' + money_(data.grabFlow.operating));
    if (details.length) line += ' (' + details.join('; ') + ')';
    lines.push(line);
  }
  return lines;
}

export function accountSpendingText_(data) {
  const lines = expenseBudgetOverviewLines_(
    data,
    data.monthlyLimit,
    '💰 Ngân sách tháng ' + data.t.m + '/' + data.t.y,
  );
  if (data.fundGroups && data.fundGroups.length) {
    lines.push('', '📦 Quỹ tháng này:');
    for (const group of data.fundGroups) {
      let row;
      if (group.over > 0) {
        row =
          '⛔ ' +
          group.name +
          ': ' +
          money_(group.spent) +
          ' / ' +
          money_(group.budget) +
          ' | vượt, cần hoàn ' +
          money_(group.over) +
          ' | DỪNG CHI';
      } else if (group.transferNeeded > 0) {
        row =
          '⚠️ ' +
          group.name +
          ': ' +
          money_(group.spent) +
          ' / ' +
          money_(group.budget) +
          ' | cần cấp ' +
          money_(group.transferNeeded);
      } else {
        row =
          '✅ ' +
          group.name +
          ': ' +
          money_(group.spent) +
          ' / ' +
          money_(group.budget);
        if (group.requiresAllocation && group.allocated > 0) {
          row += ' | đã cấp ' + money_(group.allocated);
        }
      }
      lines.push(row);
    }
  } else {
    lines.push('', '📌 Các khoản cố định:');
    for (const fixed of data.fixedBudgets) {
      let row =
        '• ' +
        fixed.name +
        ': ' +
        money_(fixed.spent) +
        ' / ' +
        money_(fixed.budget);
      if (fixed.over > 0) row += ' — vượt ' + money_(fixed.over);
      else row += ' — còn ' + money_(fixed.remaining);
      if (fixed.missingCategory) row += ' ⚠️ không tìm thấy loại chi';
      lines.push(row);
    }
  }
  lines.push('', 'Chọn tài khoản để xem tiền đã chi vào đâu:');
  return lines.join('\n');
}

export function accountSpendingKeyboard_(data) {
  const rows = [];
  if (data.unusualSpending && data.unusualSpending.total > 0) {
    rows.push([
      {
        text: '⚠️ Khoản bất thường — ' + money_(data.unusualSpending.total),
        callback_data: 'show_unusual',
      },
    ]);
  }
  for (const account of data.accounts) {
    rows.push([
      {
        text: '💳 ' + account.name + ' — tiền ra ' + money_(account.total),
        callback_data:
          'spend_account:' + notionIdToken_(account.id, 'noneacct'),
      },
    ]);
  }
  rows.push([{ text: '📊 Báo cáo tháng', callback_data: 'show_month' }]);
  rows.push([{ text: '🏠 Trang chính', callback_data: 'show_home' }]);
  return { inline_keyboard: rows };
}

export function unusualSpendingText_(data) {
  const unusual = data.unusualSpending || { total: 0, rows: [] };
  const lines = [
    '⚠️ Chi không thường xuyên — tháng ' + data.t.m + '/' + data.t.y,
    'Tổng: ' + money_(unusual.total),
  ];
  const maxRows = 20;
  for (
    let index = 0;
    index < unusual.rows.length && index < maxRows;
    index += 1
  ) {
    const row = unusual.rows[index];
    const dateText =
      row.date && row.date.length >= 10
        ? row.date.slice(8, 10) + '/' + row.date.slice(5, 7)
        : '(không ngày)';
    lines.push('• ' + dateText + ' — ' + row.name + ': ' + money_(row.amount));
  }
  if (!unusual.rows.length) lines.push('Không có khoản nào.');
  if (unusual.rows.length > maxRows) {
    lines.push(
      '... còn ' + (unusual.rows.length - maxRows) + ' giao dịch khác.',
    );
  }
  return lines.join('\n');
}

export function unusualSpendingKeyboard_() {
  return {
    inline_keyboard: [
      [{ text: '⬅️ Dòng tiền', callback_data: 'show_accounts' }],
      [{ text: '🏠 Trang chính', callback_data: 'show_home' }],
    ],
  };
}

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

function budgetLine_(group, allocationTarget) {
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
  } else if (group.requiresAllocation && !showsMonthlyAllocation) {
    // Nhóm có quỹ riêng thì "còn" phải là TIỀN THẬT đang nằm trong tài khoản giữ
    // quỹ, không phải ngân sách trừ đã tiêu. Phần ngân sách chưa cấp vào quỹ thì
    // chưa phải tiền của nhóm — nó nằm ở mục CẦN CẤP THÊM cho tới khi được cấp.
    const hasChildFunding = children.some((child) =>
      Object.hasOwn(child, 'allocated'),
    );
    const attributed = children.reduce(
      (sum, child) => sum + (child.fundRemaining || 0), 0,
    );
    const held =
      children.length > 1 && hasChildFunding
        ? attributed || group.unassignedFundRemaining || 0
        : group.fundRemaining || 0;
    if (held > 0 && (hasChildFunding || legacyFundBalanceChildName_(group) === '')) {
      row += ' · quỹ còn ' + money_(held);
    }
  } else if (!showsMonthlyAllocation) {
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
function childLines_(group) {
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

function appendPreviousMonthAdvances_(
  lines,
  previousMonthAdvances,
  groups = [],
) {
  const shown = {};
  for (const group of groups) {
    for (const debt of group.explicitDebts || []) {
      if (debt.kind !== 'account') continue;
      shown[debt.lender] = (shown[debt.lender] || 0) + debt.outstanding;
    }
  }
  const accounts = ((previousMonthAdvances || {}).accounts || [])
    .map((account) => ({
      ...account,
      outstanding: Math.max(
        (account.outstanding || 0) - (shown[account.accountName] || 0),
        0,
      ),
    }))
    .filter((account) => account.outstanding > 0);
  if (!accounts.length) return false;

  lines.push('', '♻️ CẦN CẤP BÙ TIỀN THÁNG TRƯỚC');
  for (const account of accounts) {
    lines.push(
      account.accountName + ': cần cấp bù ' + money_(account.outstanding),
    );
  }
  return true;
}

function appendDataIssues_(lines, dataIssues) {
  const byRowId = new Map();
  for (const issue of dataIssues || []) {
    const existing = byRowId.get(issue.rowId);
    if (existing) {
      existing.details.push(
        ...(issue.details || []).map((detail) => ({
          type: issue.type,
          detail,
        })),
      );
      continue;
    }
    byRowId.set(issue.rowId, {
      rowId: issue.rowId,
      date: issue.date,
      createdTime: issue.createdTime,
      title: issue.title,
      amount: issue.amount,
      details: (issue.details || []).map((detail) => ({
        type: issue.type,
        detail,
      })),
    });
  }
  const visible = [...byRowId.values()].sort(
    (a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.createdTime || '').localeCompare(String(b.createdTime || '')) ||
      String(a.rowId || '').localeCompare(String(b.rowId || '')),
  );
  if (!visible.length) return false;
  lines.push('', '⚠️ CHƯA ĐỦ DỮ KIỆN');
  for (const row of visible) {
    const day =
      typeof row.date === 'string' && row.date.length >= 10
        ? row.date.slice(8, 10) + '/' + row.date.slice(5, 7)
        : '(không ngày)';
    const details = row.details.map(({ type, detail }) =>
      type === 'missing_required_data'
        ? 'thiếu ' + detail
        : String(detail || '').replace(/^./, (character) =>
            character.toLocaleLowerCase('vi-VN'),
          ),
    );
    lines.push(
      '• ' +
        day +
        ' — ' +
        (row.title || '(không nội dung)') +
        ' — ' +
        money_(row.amount || 0) +
        (details.length ? ' · ' + details.join(', ') : ''),
    );
  }
  return true;
}

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

  const funding = groups.filter((group) => (group.transferNeeded || 0) > 0);
  if (funding.length) {
    lines.push('', '💰 CẦN CẤP THÊM');
    for (const group of funding) {
      lines.push(
        '• ' +
          group.name +
          ' → ' +
          (group.destinationAccount || 'Tài khoản giữ quỹ') +
          ': ' +
          money_(group.transferNeeded),
      );
      // Lo nao co nhieu nhan con thi noi ro cuc tien do danh cho nhan nao.
      const plan = group.transferPlan || [];
      if ((group.children || []).length > 1) {
        for (const entry of plan) {
          lines.push('    ' + entry.name + ': ' + money_(entry.amount));
        }
      }
    }
  }

  const ledger = data.explicitLedger || {};
  appendPreviousMonthAdvances_(lines, ledger.previousMonthAdvances, groups);
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
