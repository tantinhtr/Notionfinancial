import { money_, normalizeSearchText_ } from "../../domain/finance/shared.js";
import { cashflowCallbackData_ } from "./callbacks.js";

export function monthlyCashflowText_(data) {
  data = data || {};
  const t = data.t || {};
  let text = '📊 Dòng tiền tháng ' + t.m + '/' + t.y;
  const unknown = data.unknownAccount || {};
  const directions = [];
  const moneyIn = unknown.moneyIn || {};
  const moneyOut = unknown.moneyOut || {};
  if ((moneyIn.count || 0) > 0 || (moneyIn.total || 0) > 0) {
    directions.push(
      'Thu ' +
        (moneyIn.count || 0) +
        ' giao dịch · ' +
        money_(moneyIn.total || 0),
    );
  }
  if ((moneyOut.count || 0) > 0 || (moneyOut.total || 0) > 0) {
    directions.push(
      'Chi ' +
        (moneyOut.count || 0) +
        ' giao dịch · ' +
        money_(moneyOut.total || 0),
    );
  }
  if (directions.length) {
    text += '\n\n⚠️ Chưa xác định tài khoản: ' + directions.join(' | ');
  }
  return text;
}


export function monthlyCashflowKeyboard_(data) {
  const rows = [];
  const accounts = ((data && data.accounts) || []).slice();
  const preferredOrder = {
    'tien mat': 0,
    banking: 1,
    'grap tien mat': 2,
    momo: 3,
    'quy momo': 4,
  };
  accounts.sort((a, b) => {
    let aOrder = preferredOrder[normalizeSearchText_(a.name)];
    let bOrder = preferredOrder[normalizeSearchText_(b.name)];
    if (aOrder == null) aOrder = 100;
    if (bOrder == null) bOrder = 100;
    return aOrder - bOrder;
  });
  for (const account of accounts) {
    const moneyIn = (account.moneyIn && account.moneyIn.total) || 0;
    const moneyOut = (account.moneyOut && account.moneyOut.total) || 0;
    const transfersIn = account.transfersIn || 0;
    const transfersOut = account.transfersOut || 0;
    if (!moneyIn && !moneyOut && !transfersIn && !transfersOut) continue;
    const callbackData = cashflowCallbackData_(
      account.token ? 'cash_account:' + account.token : '',
    );
    if (!callbackData) continue;
    rows.push([
      {
        text: account.name + ' · ' + money_(account.currentBalance || 0),
        callback_data: callbackData,
      },
    ]);
  }
  rows.push([{ text: '🎯 Mục tiêu', callback_data: 'show_goal' }]);
  rows.push([{ text: '📦 Quỹ & ngân sách', callback_data: 'show_funds' }]);
  return { inline_keyboard: rows };
}

function cashflowAccountCategories_(bucket) {
  const visible = [];
  for (const category of (bucket && bucket.categories) || []) {
    if ((category.total || 0) > 0) visible.push(category);
  }
  visible.sort((a, b) => (b.total || 0) - (a.total || 0));
  return visible;
}

export function cashflowAccountText_(data, account) {
  const t = (data && data.t) || {};
  return '💳 ' + account.name + ' — tháng ' + t.m + '/' + t.y;
}

export function cashflowAccountKeyboard_(account) {
  const rows = [];
  const directions = [
    { key: 'in', bucket: account && account.moneyIn },
    { key: 'out', bucket: account && account.moneyOut },
  ];
  for (const direction of directions) {
    const callbackData = cashflowCallbackData_(
      account && account.token
        ? 'cash_direction:' + account.token + ':' + direction.key
        : '',
    );
    if (callbackData) {
      rows.push([
        {
          text:
            direction.key === 'in'
              ? 'Tổng Thu · ' +
                money_((direction.bucket && direction.bucket.total) || 0)
              : 'Tổng Chi · ' +
                money_((direction.bucket && direction.bucket.total) || 0),
          callback_data: callbackData,
        },
      ]);
    }
  }
  rows.push([{ text: '⬅️ Các tài khoản', callback_data: 'cash_home' }]);
  return { inline_keyboard: rows };
}

function cashflowUnclearTitle_(value) {
  const normalized = normalizeSearchText_(value);
  return (
    !normalized ||
    normalized === '(khong co noi dung)' ||
    /^(khong ro|chua ro|khong biet|cha biet)$/.test(normalized)
  );
}

export function cashflowCategoryText_(data, account, direction, category) {
  const rows = ((category && category.rows) || []).slice();
  rows.sort((a, b) => {
    const aDate = String(a.date || '');
    const bDate = String(b.date || '');
    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
  });
  const lines = [
    (direction === 'in' ? '📥 ' : '💸 ') +
      account.name +
      ' → ' +
      category.name +
      ': ' +
      money_(category.total || 0),
  ];
  const limit = Math.min(rows.length, 30);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    const date = String(row.date || '');
    const displayDate = /^\d{4}-\d{2}-\d{2}/.test(date)
      ? date.slice(8, 10) + '/' + date.slice(5, 7)
      : date || '(không ngày)';
    const rowName = String(row.name || '') || '(không có nội dung)';
    let line =
      '• ' + displayDate + ' — ' + rowName + ': ' + money_(row.amount || 0);
    const note = String(row.note || '').trim();
    if (note && cashflowUnclearTitle_(row.name)) line += ' · Ghi chú: ' + note;
    lines.push(line);
  }
  if (rows.length > limit)
    lines.push('... còn ' + (rows.length - limit) + ' giao dịch.');
  return lines.join('\n');
}

export function cashflowCategoryKeyboard_(account, direction) {
  const rows = [];
  const directionLabel =
    direction === 'in' ? 'Tổng Thu' : direction === 'out' ? 'Tổng Chi' : '';
  const directionCallback = cashflowCallbackData_(
    account && account.token && directionLabel
      ? 'cash_direction:' + account.token + ':' + direction
      : '',
  );
  if (directionCallback) {
    rows.push([
      { text: '⬅️ ' + directionLabel, callback_data: directionCallback },
    ]);
  }
  rows.push([{ text: '🏠 Các tài khoản', callback_data: 'cash_home' }]);
  return { inline_keyboard: rows };
}



export function cashflowDirectionText_(account, direction) {
  return (
    (direction === 'in' ? '📥 ' : '💸 ') +
    account.name +
    ' — ' +
    (direction === 'in' ? 'Tổng Thu' : 'Tổng Chi')
  );
}

export function cashflowDirectionKeyboard_(account, direction) {
  const rows = [];
  const bucket =
    direction === 'in'
      ? account && account.moneyIn
      : account && account.moneyOut;
  for (const category of cashflowAccountCategories_(bucket)) {
    const callbackData = cashflowCallbackData_(
      account && account.token && category.token
        ? 'cash_cat:' + account.token + ':' + direction + ':' + category.token
        : '',
    );
    if (!callbackData) continue;
    rows.push([
      {
        text: category.name + ' · ' + money_(category.total),
        callback_data: callbackData,
      },
    ]);
  }
  const accountCallback = cashflowCallbackData_(
    account && account.token ? 'cash_account:' + account.token : '',
  );
  if (accountCallback) {
    rows.push([{ text: '⬅️ ' + account.name, callback_data: accountCallback }]);
  }
  rows.push([{ text: '🏠 Các tài khoản', callback_data: 'cash_home' }]);
  return { inline_keyboard: rows };
}

export function presentCashflowHome(data) {
  return { text: monthlyCashflowText_(data), replyMarkup: monthlyCashflowKeyboard_(data) };
}
export function presentCashflowAccount(data, account) {
  return { text: cashflowAccountText_(data, account), replyMarkup: cashflowAccountKeyboard_(account) };
}
export function presentCashflowDirection(account, direction) {
  return { text: cashflowDirectionText_(account, direction), replyMarkup: cashflowDirectionKeyboard_(account, direction) };
}
export function presentCashflowCategory(data, account, direction, category) {
  return { text: cashflowCategoryText_(data, account, direction, category), replyMarkup: cashflowCategoryKeyboard_(account, direction) };
}
