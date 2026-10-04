/**
 * Trình bày ngân sách và chi tiêu theo tài khoản, gồm các khoản chi bất thường.
 * Các hàm chỉ đọc báo cáo đã tính và tạo nội dung/nút điều hướng.
 */
import { money_, notionIdToken_ } from "../../shared/finance/shared.js";

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
