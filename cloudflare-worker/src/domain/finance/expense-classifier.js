import { normalizeSearchText_, num_ } from "./shared.js";

function isRoutineExpenseCategory_(normalizedCategory) {
  return !!{
    'di cho': true,
    'sieu thi': true,
    'an ngoai': true,
    'tap hoa': true,
    'dien thoai': true,
    'ca phe': true,
    'phi gui xe': true,
  }[normalizedCategory];
}

export function classifyExpenseNature_(
  categoryName,
  expenseName,
  expenseNote,
  isFixedBudget,
) {
  const normalizedCategory = normalizeSearchText_(categoryName);
  const normalizedName = normalizeSearchText_(expenseName);
  const normalizedNote = normalizeSearchText_(expenseNote);
  if (normalizedCategory === 'vay va tra') {
    let loanType = 'other';
    if (
      normalizedName.indexOf('cho ') === 0 &&
      normalizedName.indexOf(' muon') >= 0
    ) {
      loanType = 'lent';
    } else if (
      normalizedName.indexOf('tra') === 0 &&
      normalizedName.indexOf('muon') >= 0
    ) {
      loanType = 'repaid';
    }
    return { kind: 'loan', loanType, isUnusual: false };
  }
  if (normalizedCategory === 'grap' || normalizedCategory === 'grab') {
    const isCapital =
      (normalizedName.indexOf('nap') >= 0 &&
        (normalizedName.indexOf('grap') >= 0 ||
          normalizedName.indexOf('grab') >= 0)) ||
      (normalizedName.indexOf('chuyen tien') >= 0 &&
        normalizedName.indexOf('nap ho') >= 0);
    // Sua xe deo nhan Grap nhung khong phai von chay xe — tach ra de bao cao rieng.
    const isRepair = [
      'sua xe',
      'thay nhot',
      'va banh',
      'va 1 lo',
      'va xe',
      'thay ruot',
      'bom xe',
      'thay lop',
    ].some((keyword) => normalizedName.indexOf(keyword) >= 0);
    return {
      kind: 'grab',
      grabType: isRepair ? 'repair' : isCapital ? 'capital' : 'operating',
      isUnusual: false,
    };
  }
  return {
    kind: 'personal',
    isUnusual:
      normalizedCategory === 'phat sinh' ||
      normalizedNote.indexOf('quy phat sinh') >= 0 ||
      (!isFixedBudget && !isRoutineExpenseCategory_(normalizedCategory)),
  };
}

export function analyzeExpenseRows_(
  expenseRows,
  categoryNames,
  fixedIdMap,
  accountNames,
) {
  const summary = {
    cashOutflowTotal: 0,
    personalSpendingTotal: 0,
    unplannedTotal: 0,
    loanFlow: { total: 0, lent: 0, repaid: 0, other: 0 },
    grabFlow: { total: 0, capital: 0, operating: 0, repair: 0 },
    unusualSpending: { total: 0, rows: [] },
    rowsById: {},
  };
  categoryNames = categoryNames || {};
  fixedIdMap = fixedIdMap || {};
  accountNames = accountNames || {};

  for (const expenseRow of expenseRows) {
    const props = expenseRow.properties || {};
    const amount = num_(props['Số Tiền']);
    const categoryRelation =
      (props['Loại Chi Phí'] && props['Loại Chi Phí'].relation) || [];
    const accountRelation =
      (props['Phương Thức Thanh Toán'] &&
        props['Phương Thức Thanh Toán'].relation) ||
      [];
    const categoryId = categoryRelation.length
      ? categoryRelation[0].id
      : '(chưa phân loại)';
    const accountId = accountRelation.length
      ? accountRelation[0].id
      : '(chưa chọn tài khoản)';
    const categoryName = categoryNames[categoryId] || '(chưa phân loại)';
    const accountName = accountNames[accountId] || '(chưa chọn tài khoản)';
    const title =
      (props['Nội Dung Khoản Chi'] && props['Nội Dung Khoản Chi'].title) || [];
    const expenseName = title.length
      ? title[0].plain_text
      : '(không có nội dung)';
    const expenseDate =
      props['Ngày'] && props['Ngày'].date && props['Ngày'].date.start;
    const noteParts = (props['Ghi Chú'] && props['Ghi Chú'].rich_text) || [];
    let expenseNote = '';
    for (const notePart of noteParts) {
      expenseNote += notePart.plain_text || '';
    }
    const nature = classifyExpenseNature_(
      categoryName,
      expenseName,
      expenseNote,
      !!fixedIdMap[categoryId],
    );
    const rowInfo = {
      id: expenseRow.id,
      name: expenseName,
      amount,
      date: expenseDate || '',
      note: expenseNote,
      categoryId,
      categoryName,
      accountId,
      accountName,
      nature,
    };
    summary.rowsById[expenseRow.id] = rowInfo;
    summary.cashOutflowTotal += amount;

    if (nature.kind === 'loan') {
      summary.loanFlow.total += amount;
      summary.loanFlow[nature.loanType] += amount;
    } else if (nature.kind === 'grab') {
      summary.grabFlow.total += amount;
      summary.grabFlow[nature.grabType] += amount;
    } else {
      summary.personalSpendingTotal += amount;
      if (!fixedIdMap[categoryId]) summary.unplannedTotal += amount;
      if (nature.isUnusual) {
        summary.unusualSpending.total += amount;
        summary.unusualSpending.rows.push(rowInfo);
      }
    }
  }
  summary.unusualSpending.rows.sort((a, b) => b.amount - a.amount);
  return summary;
}
