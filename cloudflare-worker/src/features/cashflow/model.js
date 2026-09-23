import { normalizeSearchText_, notionIdToken_, num_ } from "../../domain/finance/shared.js";

function cashflowPropertyText_(prop) {
  const parts = (prop && (prop.title || prop.rich_text)) || [];
  let text = '';
  for (const part of parts) {
    text += part.plain_text || (part.text && part.text.content) || '';
  }
  return text;
}

function cashflowFirstRelationId_(prop) {
  const relation = (prop && prop.relation) || [];
  return relation.length ? relation[0].id : '';
}

function cashflowDate_(prop) {
  return (prop && prop.date && prop.date.start) || '';
}

function cashflowNumber_(prop) {
  if (!prop) return 0;
  if (prop.number != null) return Number(prop.number) || 0;
  if (prop.formula && prop.formula.number != null)
    return Number(prop.formula.number) || 0;
  if (prop.rollup && prop.rollup.number != null)
    return Number(prop.rollup.number) || 0;
  return 0;
}

export function cashflowCategoryToken_(direction, normalizedName) {
  let hash = 2166136261;
  const text = String(normalizedName || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (
    String(direction || '').toLowerCase() + '-' + (hash >>> 0).toString(36)
  );
}

export function buildMonthlyCashflowData_(
  t,
  accountRows,
  incomeRows,
  otherIncomeRows,
  expenseRows,
  transferRows,
  incomeCategoryRows,
  otherIncomeCategoryRows,
  expenseCategoryRows,
  goalRelationPageId = '39c8ffb5-256b-806f-a710-e022aabf703d',
) {
  accountRows = accountRows || [];
  incomeRows = incomeRows || [];
  otherIncomeRows = otherIncomeRows || [];
  expenseRows = expenseRows || [];
  transferRows = transferRows || [];
  incomeCategoryRows = incomeCategoryRows || [];
  otherIncomeCategoryRows = otherIncomeCategoryRows || [];
  expenseCategoryRows = expenseCategoryRows || [];

  const model = {
    t,
    totalIn: 0,
    totalOut: 0,
    net: 0,
    unknownAccount: {
      moneyIn: { count: 0, total: 0 },
      moneyOut: { count: 0, total: 0 },
    },
    accounts: [],
  };
  const accountMap = {};

  function accountFor_(id, name, fallback, currentBalance) {
    const accountId = id || fallback;
    if (!accountMap[accountId]) {
      const account = {
        id: accountId,
        token: notionIdToken_(accountId, fallback),
        name: name || '(chưa chọn tài khoản)',
        currentBalance: Number(currentBalance) || 0,
        moneyIn: { total: 0, categories: [], categoryMap: {} },
        moneyOut: { total: 0, categories: [], categoryMap: {} },
        transfersIn: 0,
        transfersOut: 0,
      };
      accountMap[accountId] = account;
      model.accounts.push(account);
    } else if (currentBalance != null) {
      accountMap[accountId].currentBalance = Number(currentBalance) || 0;
    }
    return accountMap[accountId];
  }

  function categoryNames_(rows, propertyName) {
    const names = {};
    for (const row of rows) {
      const props = row.properties || {};
      names[row.id] =
        cashflowPropertyText_(props[propertyName]) || '(chưa phân loại)';
    }
    return names;
  }

  function addCategoryRow_(account, direction, categoryName, row) {
    const bucket = direction === 'in' ? account.moneyIn : account.moneyOut;
    const normalizedName = normalizeSearchText_(categoryName);
    let category = bucket.categoryMap[normalizedName];
    if (!category) {
      category = {
        token: cashflowCategoryToken_(direction, normalizedName),
        name: categoryName,
        total: 0,
        rows: [],
      };
      bucket.categoryMap[normalizedName] = category;
    }
    bucket.total += row.amount;
    category.total += row.amount;
    category.rows.push(row);
  }

  for (let index = 0; index < accountRows.length; index += 1) {
    const row = accountRows[index];
    const props = row.properties || {};
    accountFor_(
      row.id,
      cashflowPropertyText_(props['Phương Thức Thanh Toán']),
      'account-' + index,
      cashflowNumber_(props['Số Dư Hiện Tại']),
    );
  }

  const incomeCategoryNames = categoryNames_(
    incomeCategoryRows,
    'Loại Khoản Thu',
  );
  const otherIncomeCategoryNames = categoryNames_(
    otherIncomeCategoryRows,
    'Loại Khoản Thu',
  );
  const expenseCategoryNames = categoryNames_(
    expenseCategoryRows,
    'Loại Chi Phí',
  );

  function addIncomeRows_(rows, categoryNames) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const props = row.properties || {};
      const categoryId = cashflowFirstRelationId_(props['Loại Khoản Thu']);
      const accountId = cashflowFirstRelationId_(
        props['Phương Thức Thanh Toán'],
      );
      const amount = num_(props['Số Tiền']);
      if (categoryId === goalRelationPageId || amount <= 0) continue;
      if (!accountId) {
        model.unknownAccount.moneyIn.count += 1;
        model.unknownAccount.moneyIn.total += amount;
        continue;
      }
      const account = accountFor_(accountId, '', 'account-' + index);
      addCategoryRow_(
        account,
        'in',
        categoryNames[categoryId] || '(chưa phân loại)',
        {
          id: row.id,
          name:
            cashflowPropertyText_(props['Tên Khoản Thu']) ||
            '(không có nội dung)',
          amount,
          date: cashflowDate_(props['Ngày']),
          note: cashflowPropertyText_(props['Ghi Chú']),
        },
      );
      model.totalIn += amount;
    }
  }

  addIncomeRows_(incomeRows, incomeCategoryNames);
  addIncomeRows_(otherIncomeRows, otherIncomeCategoryNames);

  for (let index = 0; index < expenseRows.length; index += 1) {
    const row = expenseRows[index];
    const props = row.properties || {};
    const categoryId = cashflowFirstRelationId_(props['Loại Chi Phí']);
    const accountId = cashflowFirstRelationId_(props['Phương Thức Thanh Toán']);
    const amount = num_(props['Số Tiền']);
    if (!accountId) {
      model.unknownAccount.moneyOut.count += 1;
      model.unknownAccount.moneyOut.total += amount;
      continue;
    }
    const account = accountFor_(accountId, '', 'account-' + index);
    addCategoryRow_(
      account,
      'out',
      expenseCategoryNames[categoryId] || '(chưa phân loại)',
      {
        id: row.id,
        name:
          cashflowPropertyText_(props['Nội Dung Khoản Chi']) ||
          '(không có nội dung)',
        amount,
        date: cashflowDate_(props['Ngày']),
        note: cashflowPropertyText_(props['Ghi Chú']),
      },
    );
    model.totalOut += amount;
  }

  for (let index = 0; index < transferRows.length; index += 1) {
    const props = transferRows[index].properties || {};
    const amount = num_(props['Số Tiền']);
    const fromAccountId = cashflowFirstRelationId_(props['Từ Tài Khoản']);
    const toAccountId = cashflowFirstRelationId_(props['Đến Tài Khoản']);
    if (fromAccountId) {
      accountFor_(fromAccountId, '', 'transfer-from-' + index).transfersOut +=
        amount;
    }
    if (toAccountId) {
      accountFor_(toAccountId, '', 'transfer-to-' + index).transfersIn +=
        amount;
    }
  }

  for (const account of model.accounts) {
    for (const bucket of [account.moneyIn, account.moneyOut]) {
      for (const normalizedName in bucket.categoryMap) {
        const category = bucket.categoryMap[normalizedName];
        category.rows.sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
        );
        bucket.categories.push(category);
      }
      bucket.categories.sort((a, b) => b.total - a.total);
      delete bucket.categoryMap;
    }
  }

  model.net = model.totalIn - model.totalOut;
  return model;
}
