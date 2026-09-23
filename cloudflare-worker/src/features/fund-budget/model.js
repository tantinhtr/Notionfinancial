import { buildFinanceLedger_ } from "../../domain/ledger/finance-ledger.js";
import { normalizeSearchText_, num_ } from "../../domain/finance/shared.js";
import { analyzeExpenseRows_ } from "../../domain/finance/expense-classifier.js";

function plainText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || '').join('');
}

function stripFundPrefix_(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^qu\S*\s+/, '')
    .trim();
}

// Anh ghi chu bang tay theo quy uoc "( lay tu quy X )" / "( tinh vao quy X )".
// Uu tien doc phan trong ngoac, roi moi den ca cau. Chi nhan khi sau dong tu la
// mot chu bat dau bang "qu", nho vay loi go "quxy sua xe" van ve "quy sua xe",
// con "Tuan muon tien thi bang lai xe" khong de ra mot quy ma.
function fundMentionedAfter_(expenseRow, verbPattern, requireFundWord = true) {
  const props = expenseRow.properties || {};
  const text =
    plainText_(props['Nội Dung Khoản Chi']) +
    ' | ' +
    plainText_(props['Ghi Chú']);
  const candidates = [];
  const paren = /\(([^)]*)\)/g;
  let found;
  while ((found = paren.exec(text)) !== null) candidates.push(found[1]);
  candidates.push(text);
  for (const candidate of candidates) {
    const match = candidate.match(verbPattern);
    if (!match) continue;
    const cleaned = match[1].replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    const hasFundWord = /^qu\S*\s+/i.test(cleaned);
    if (requireFundWord && !hasFundWord) continue;
    const name = (hasFundWord ? cleaned.replace(/^qu\S*\s+/i, '') : cleaned)
      .trim()
      .slice(0, 60);
    if (name !== '') return 'quỹ ' + name;
  }
  return '';
}

// "lay tu / muon quy X" — khoan nay tieu tien cua quy X, sinh ra mon no voi quy do.
function borrowedFrom_(expenseRow) {
  return fundMentionedAfter_(
    expenseRow,
    /(?:lấy\s+từ|mượn(?:\s+từ)?)\s+(.+)$/i,
  );
}

// Khoan nay thuoc ngan sach nhom nao. Uu tien cum "tinh vao quy X"; neu khong co
// thi chi can tieu de/ghi chu NHAC TOI ten mot nhom quy co that la du — anh viet tat
// kieu "( phat sinh )" van phai an. Khong nhan khi ten do chinh la ben cho muon
// ("lay tu quy X"), vi do la nguon tien chu khong phai ngan sach.
// Ten nhom quy chi tinh la duoc nhac toi khi no DI SAU chu "quy" va KET THUC tron
// ven. Thieu hai dieu kien do thi "Gửi xe đi chợ" bi keo vao nhom Đi Chợ, va
// "( lấy từ quỹ đi chơi với em )" cung bi cat thanh "quỹ đi chợ".
function mentionsFund_(normalizedText, key) {
  const needle = normalizeSearchText_(key);
  if (needle === '') return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('qu\\S*\\s+' + escaped + '(?![a-z0-9])').test(
    normalizedText,
  );
}

// Ghi chu co the goi ten LO ("quỹ nhu cầu thiết yếu") hoac ten NHAN CON
// ("quỹ phát sinh"). Ca hai deu hop le: nhan con thuoc lo nao thi khoan do ve lo do,
// va con duoc ghi dung vao dong con — nho vay bao cao khong mat chi tiet.
function assignedFund_(expenseRow, assignmentKeys) {
  // "tinh vao X" khong bat buoc phai co chu "quỹ": X da duoc doi chieu voi danh sach
  // ten co that ngay duoi, ten bia ra thi khong khop nen khong can canh gac do nua.
  // Viet "( tính vào phát triển bản thân )" phai an nhu "( tính vào quỹ phát sinh )".
  const explicit = stripFundPrefix_(
    fundMentionedAfter_(expenseRow, /tính\s+vào\s+(.+)$/i, false),
  );
  if (explicit !== '') {
    if (assignmentKeys[explicit]) return explicit;
    // Ghi chu con chu thua phia sau ("tính vào phát sinh nhé") thi lay ten dai nhat
    // ma cau do bat dau bang.
    const normalized = normalizeSearchText_(explicit);
    let matched = '';
    for (const key of Object.keys(assignmentKeys)) {
      const candidate = normalizeSearchText_(key);
      if (candidate === '' || !normalized.startsWith(candidate + ' ')) continue;
      if (candidate.length > matched.length) matched = key;
    }
    if (matched !== '') return matched;
  }
  const props = expenseRow.properties || {};
  const text = normalizeSearchText_(
    plainText_(props['Nội Dung Khoản Chi']) +
      ' ' +
      plainText_(props['Ghi Chú']),
  );
  const lenderKey = stripFundPrefix_(borrowedFrom_(expenseRow));
  let best = '';
  for (const key of Object.keys(assignmentKeys)) {
    if (key === '' || key === lenderKey) continue;
    if (!mentionsFund_(text, key)) continue;
    if (key.length > best.length) best = key;
  }
  return best;
}

const DEBT_TARGET_STOP_WORDS_ = new Set(['quy', 'tien', 'thang', 'nam']);

function debtTargetPhraseScore_(source, target) {
  const words = normalizeSearchText_(source).match(/[a-z0-9]+/g) || [];
  const targetWords = normalizeSearchText_(target).match(/[a-z0-9]+/g) || [];
  const haystack = ' ' + targetWords.join(' ') + ' ';
  for (let size = words.length; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const phraseWords = words.slice(start, start + size);
      if (
        phraseWords.every(
          (word) => DEBT_TARGET_STOP_WORDS_.has(word) || /^\d+$/.test(word),
        )
      )
        continue;
      if (haystack.includes(' ' + phraseWords.join(' ') + ' ')) return size;
    }
  }
  return 0;
}

function debtTargetChildName_(debtText, candidates) {
  let bestScore = 0;
  let matches = [];
  for (const candidate of candidates) {
    let score = 0;
    for (const source of candidate.sources) {
      score = Math.max(score, debtTargetPhraseScore_(source, debtText));
    }
    if (score > bestScore) {
      bestScore = score;
      matches = [candidate.name];
    } else if (score > 0 && score === bestScore) {
      matches.push(candidate.name);
    }
  }
  return matches.length === 1 ? matches[0] : '';
}

function buildMonthlyBudget_(tiers, monthlyLimit) {
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
function buildExcluded_(tiers) {
  const rows = tiers.excludedRows
    .slice()
    .sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

// Thu nhap that chi la bang Bao Cao Thu Nhap. Bang Khoan Thu Khac la tien chay qua:
// doanh thu gop Grab (doi ung voi chi phi nap vi/xang) va tien muon/tra/thu ho.
function buildIncomeSplit_(incomeRows, otherIncomeRows) {
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

export function buildAccountSpendingData_(
  t,
  categoryRows,
  expenseRows,
  accountRows,
  monthlyLimit,
  transferRows,
  fundGroupRows,
  options,
) {
  transferRows = transferRows || [];
  fundGroupRows = fundGroupRows || [];
  options = options || {};
  const explicitLedger = buildFinanceLedger_({
    accountRows,
    incomeRows: options.incomeRows,
    otherIncomeRows: options.otherIncomeRows,
    historicalIncomeRows: options.historicalIncomeRows,
    historicalOtherIncomeRows: options.historicalOtherIncomeRows,
    historicalExpenseRows: options.historicalExpenseRows,
    historicalTransferRows: options.historicalTransferRows,
    expenseRows,
    transferRows,
    categoryRows,
    otherIncomeCategoryRows: options.otherIncomeCategoryRows,
    fundGroupRows,
    options,
  });
  const ledgerRowsById = Object.fromEntries(
    explicitLedger.rows.map((row) => [row.id, row]),
  );
  const spendableSubFundKeys = {};
  for (const name of options.spendableSubFunds || []) {
    spendableSubFundKeys[normalizeSearchText_(stripFundPrefix_(name))] = true;
  }
  const passThroughCategoryKeys = {};
  for (const name of options.passThroughCategories || []) {
    passThroughCategoryKeys[normalizeSearchText_(name)] = true;
  }
  const passThroughNeedles = (options.passThroughKeywords || [])
    .map((word) => normalizeSearchText_(word))
    .filter((word) => word !== '');
  const isPassThrough = (text) => {
    if (!passThroughNeedles.length) return false;
    const haystack = normalizeSearchText_(text);
    return passThroughNeedles.some((needle) => haystack.indexOf(needle) >= 0);
  };
  const categoryNames = {};
  const categoryGroupIds = {};
  const fundGroupIdByName = {};
  const pendingAliases = [];
  const extraRowsByGroupId = {};
  // Doi ten lo thi ghi chu cu ("lấy từ quỹ thiết yếu") van phai khop. Cot "Tên Cũ"
  // trong Notion liet ke cac ten cu, cach nhau bang dau phay.
  const groupAliasKeys = {};
  for (const fundGroupRow of fundGroupRows) {
    const props = fundGroupRow.properties || {};
    const title = (props['Tên Nhóm Quỹ'] && props['Tên Nhóm Quỹ'].title) || [];
    if (!title.length) continue;
    const realKey = stripFundPrefix_(title[0].plain_text);
    fundGroupIdByName[realKey] = fundGroupRow.id;
    groupAliasKeys[fundGroupRow.id] = { [realKey]: true };
    for (const alias of plainText_(props['Tên Cũ']).split(',')) {
      const key = stripFundPrefix_(alias);
      if (key === '') continue;
      groupAliasKeys[fundGroupRow.id][key] = true;
      pendingAliases.push({ key, groupId: fundGroupRow.id });
    }
  }
  const groupNameKeys = Object.keys(fundGroupIdByName);
  const groupIdSet = {};
  for (const key of groupNameKeys) groupIdSet[fundGroupIdByName[key]] = true;
  // Ten goi duoc phep viet trong ghi chu: ten lo -> ca lo, ten nhan con -> dung nhan do.
  const assignmentKeys = {};
  for (const key of groupNameKeys) {
    assignmentKeys[key] = { groupId: fundGroupIdByName[key], categoryId: '' };
  }
  const tiers = {
    groupSpending: 0,
    looseSpending: 0,
    outsideFundSpending: 0,
    looseByCategory: {},
    excludedRows: [],
  };
  const accountNames = {};
  const globalCategoryTotals = {};
  const accountMap = {};
  const fixedIdMap = {};
  const fixedBudgets = [];
  let totalFixedBudget = 0;
  const historicalChildSources = {};
  for (const expenseRow of options.historicalExpenseRows || []) {
    const props = expenseRow.properties || {};
    const categoryId =
      ((props['Loại Chi Phí'] && props['Loại Chi Phí'].relation) || [])[0]
        ?.id || '';
    const source = (
      plainText_(props['Nội Dung Khoản Chi']) +
      ' ' +
      plainText_(props['Ghi Chú'])
    ).trim();
    if (!categoryId || !source) continue;
    if (!historicalChildSources[categoryId])
      historicalChildSources[categoryId] = [];
    historicalChildSources[categoryId].push(source);
  }

  for (const categoryRow of categoryRows) {
    const props = categoryRow.properties || {};
    const title = (props['Loại Chi Phí'] && props['Loại Chi Phí'].title) || [];
    const name = title.length ? title[0].plain_text : '(chưa phân loại)';
    categoryNames[categoryRow.id] = name;
    const groupRelation =
      (props['Nhóm Quỹ'] && props['Nhóm Quỹ'].relation) || [];
    categoryGroupIds[categoryRow.id] = groupRelation.length
      ? groupRelation[0].id
      : '';
    if (
      !(
        props['Tính Trong 5,5 Triệu'] &&
        props['Tính Trong 5,5 Triệu'].checkbox === true
      )
    ) {
      continue;
    }
    const budget = num_(props['Ngân Sách Tháng']);
    // Nhan con tick "Chi Thang Khong Qua Quy" thi khong bao gio can bom truoc vao
    // tai khoan giu quy — vi du Đi Chợ tra thang bang tien mat. Notion tra ve false
    // cho o chua tick, nen phai hoi nguoc kieu nay: mac dinh la VAN theo co cua lo.
    const skipsFund = !!(
      props['Chi Thẳng Không Qua Quỹ'] &&
      props['Chi Thẳng Không Qua Quỹ'].checkbox === true
    );
    const fixed = {
      id: categoryRow.id,
      groupId: categoryGroupIds[categoryRow.id],
      name,
      budget,
      skipsFund,
      spent: 0,
      remaining: budget,
      over: 0,
      missingCategory: false,
      paidByAccount: {},
      accountBreakdown: [],
      spendRows: [],
    };
    fixedBudgets.push(fixed);
    fixedIdMap[fixed.id] = fixed;
    totalFixedBudget += fixed.budget;
    const childKey = stripFundPrefix_(name);
    // Ten lo uu tien hon: neu trung ten thi giu nghia "ca lo".
    if (childKey !== '' && !assignmentKeys[childKey]) {
      assignmentKeys[childKey] = {
        groupId: fixed.groupId,
        categoryId: fixed.id,
      };
    }
  }

  // Ten cu cua lo chi duoc dung khi khong dung ten nhan con nao. Vi du doi ten
  // "Phát Sinh" tu lo thanh nhan con: ghi chu "quỹ phát sinh" phai ve dung nhan do,
  // khong duoc ve chung ca lo.
  for (const alias of pendingAliases) {
    if (!assignmentKeys[alias.key]) {
      assignmentKeys[alias.key] = { groupId: alias.groupId, categoryId: '' };
    }
  }

  for (const accountRow of accountRows) {
    const props = accountRow.properties || {};
    const title =
      (props['Phương Thức Thanh Toán'] &&
        props['Phương Thức Thanh Toán'].title) ||
      [];
    accountNames[accountRow.id] = title.length
      ? title[0].plain_text
      : '(chưa chọn tài khoản)';
  }

  // Ghi chu "lay tu quy X" ma X khong phai mot lo, cung khong phai tui duoc nap tu
  // thu nhap thang nay, thi do la tien de danh tu truoc — tieu no khong tinh vao
  // chi tieu cua thang. Rieng quy sua xe thi co, vi thang nao nap thang do.
  const spentFromSavedPot = (lender) => {
    if (lender === '') return false;
    const key = stripFundPrefix_(lender);
    if (key === '' || fundGroupIdByName[key] !== undefined) return false;
    return spendableSubFundKeys[normalizeSearchText_(key)] !== true;
  };

  const flowAnalysis = analyzeExpenseRows_(
    expenseRows,
    categoryNames,
    fixedIdMap,
    accountNames,
  );
  for (const expenseRow of expenseRows) {
    const rowInfo = flowAnalysis.rowsById[expenseRow.id];
    const { amount, categoryId, accountId, categoryName, accountName } =
      rowInfo;
    const lender = borrowedFrom_(expenseRow);
    const assignedName = assignedFund_(expenseRow, assignmentKeys);
    const assigned = assignedName === '' ? null : assignmentKeys[assignedName];
    const assignedGroupId = assigned ? assigned.groupId : '';
    const assignedCategoryId = assigned ? assigned.categoryId : '';
    // Ghi chu keu tinh vao cho khac thi khoan nay ROI KHOI nhan cua no hoan toan:
    // khong cong vao tong cua loai chi do nua, chi tinh cho noi duoc chi dinh.
    const movedAway =
      assignedCategoryId !== ''
        ? assignedCategoryId !== categoryId
        : assignedGroupId !== '' &&
          categoryGroupIds[categoryId] !== assignedGroupId;
    const spendRow = {
      id: expenseRow.id,
      account: accountName,
      amount,
      lender,
      name: rowInfo.name,
      date: rowInfo.date,
    };
    if (
      movedAway &&
      assignedCategoryId !== '' &&
      fixedIdMap[assignedCategoryId]
    ) {
      // Ghi chu goi ten mot nhan con co that -> khoan nay chinh la chi tieu cua nhan do.
      const target = fixedIdMap[assignedCategoryId];
      globalCategoryTotals[target.name] =
        (globalCategoryTotals[target.name] || 0) + amount;
      target.paidByAccount[accountName] =
        (target.paidByAccount[accountName] || 0) + amount;
      target.spendRows.push(spendRow);
      spendRow.childName = target.name;
    } else if (movedAway) {
      if (!extraRowsByGroupId[assignedGroupId])
        extraRowsByGroupId[assignedGroupId] = [];
      extraRowsByGroupId[assignedGroupId].push(spendRow);
    } else {
      globalCategoryTotals[categoryName] =
        (globalCategoryTotals[categoryName] || 0) + amount;
      if (fixedIdMap[categoryId]) {
        const fixed = fixedIdMap[categoryId];
        fixed.paidByAccount[accountName] =
          (fixed.paidByAccount[accountName] || 0) + amount;
        fixed.spendRows.push(spendRow);
        spendRow.childName = fixed.name;
      }
    }

    // Hai nhom duy nhat: trong nhom quy va ngoai nhom quy.
    // So tien va nhan Grab khong quyet dinh viec loai. Chi loai khi noi dung hoac
    // loai nghiep vu noi ro day la tien di qua nhu ung code, mua ho hay vay/tra.
    const ownGroupId =
      fixedIdMap[categoryId] && groupIdSet[categoryGroupIds[categoryId]]
        ? categoryGroupIds[categoryId]
        : '';
    if (ownGroupId !== '' || assignedGroupId !== '') {
      tiers.groupSpending += amount;
    } else {
      const isPassThroughExpense =
        passThroughCategoryKeys[normalizeSearchText_(categoryName)] === true ||
        isPassThrough(rowInfo.name + ' ' + rowInfo.note) ||
        spentFromSavedPot(lender);
      if (!isPassThroughExpense) tiers.outsideFundSpending += amount;
      if (isPassThroughExpense) {
        tiers.excludedRows.push({
          name: rowInfo.name,
          amount,
          date: rowInfo.date,
          account: accountName,
          category: categoryName,
        });
      } else {
        tiers.looseSpending += amount;
        tiers.looseByCategory[categoryName] =
          (tiers.looseByCategory[categoryName] || 0) + amount;
      }
    }

    if (!accountMap[accountId]) {
      accountMap[accountId] = {
        id: accountId,
        name: accountName,
        total: 0,
        personalTotal: 0,
        unusualTotal: 0,
        loanTotal: 0,
        grabTotal: 0,
        categoryMap: {},
        categories: [],
      };
    }
    const account = accountMap[accountId];
    account.total += amount;
    if (rowInfo.nature.kind === 'loan') {
      account.loanTotal += amount;
    } else if (rowInfo.nature.kind === 'grab') {
      account.grabTotal += amount;
    } else {
      account.personalTotal += amount;
      if (rowInfo.nature.isUnusual) account.unusualTotal += amount;
    }
    if (!account.categoryMap[categoryId]) {
      account.categoryMap[categoryId] = {
        id: categoryId,
        name: categoryName,
        total: 0,
        rows: [],
      };
    }
    const category = account.categoryMap[categoryId];
    category.total += amount;
    category.rows.push({
      id: expenseRow.id,
      name: rowInfo.name,
      amount,
      date: rowInfo.date,
      nature: rowInfo.nature.kind,
      isUnusual: rowInfo.nature.isUnusual,
    });
  }

  for (const fixed of fixedBudgets) {
    fixed.spent = globalCategoryTotals[fixed.name] || 0;
    fixed.remaining = Math.max(fixed.budget - fixed.spent, 0);
    fixed.over = Math.max(fixed.spent - fixed.budget, 0);
    for (const accountName in fixed.paidByAccount) {
      const amount = fixed.paidByAccount[accountName];
      if (amount > 0)
        fixed.accountBreakdown.push({ account: accountName, amount });
    }
    fixed.accountBreakdown.sort((a, b) => b.amount - a.amount);
    delete fixed.paidByAccount;
  }

  const accounts = [];
  for (const accountId in accountMap) {
    const account = accountMap[accountId];
    for (const categoryId in account.categoryMap) {
      const category = account.categoryMap[categoryId];
      category.rows.sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      );
      account.categories.push(category);
    }
    account.categories.sort((a, b) => b.total - a.total);
    delete account.categoryMap;
    accounts.push(account);
  }
  accounts.sort((a, b) => b.total - a.total);

  const fundGroups = [];
  const knownGroupIds = {};
  for (const row of fundGroupRows) knownGroupIds[row.id] = true;
  const fundLoanRowIds = new Set(
    explicitLedger.fundLoans.loans.flatMap((loan) => [
      loan.openedBy,
      ...loan.repaymentRows,
    ]),
  );
  const expenseSources =
    explicitLedger.previousMonthAdvances.expenseSources || {};
  const outstandingByRow =
    explicitLedger.previousMonthAdvances.outstandingByRow || {};

  for (const fundGroupRow of fundGroupRows) {
    const props = fundGroupRow.properties || {};
    const title = (props['Tên Nhóm Quỹ'] && props['Tên Nhóm Quỹ'].title) || [];
    const destinationRelation =
      (props['Tài Khoản Giữ Quỹ'] && props['Tài Khoản Giữ Quỹ'].relation) || [];
    const destinationAccountId = destinationRelation.length
      ? destinationRelation[0].id
      : '';
    const requiresAllocation = !!(
      props['Bắt Buộc Cấp Quỹ'] && props['Bắt Buộc Cấp Quỹ'].checkbox === true
    );
    const group = {
      name: title.length ? title[0].plain_text : '(nhóm quỹ chưa đặt tên)',
      destinationAccount: accountNames[destinationAccountId] || '',
      budget: 0,
      spent: 0,
      over: 0,
      allocated: 0,
      paidFromFund: 0,
      paidOutsideFund: 0,
      fundBalance: 0,
      fundRemaining: 0,
      fundDebt: 0,
      fundingShortfall: 0,
      explicitDebts: [],
      borrowedFunds: [],
      children: [],
      transferNeeded: 0,
      transferPlan: [],
      requiresAllocation,
    };
    const borrowByFund = {};
    const ownKeys = groupAliasKeys[fundGroupRow.id] || {};
    const addDebtRow = (bucket, key, spendRow, amount, partial) => {
      if (!bucket[key]) bucket[key] = { amount: 0, rows: [] };
      bucket[key].amount += amount;
      bucket[key].rows.push({
        name: spendRow.name,
        amount,
        date: spendRow.date,
        partial: partial === true,
      });
    };

    const loanAllocation =
      explicitLedger.fundLoans.allocationAdjustments[fundGroupRow.id] || 0;
    let netAllocated = loanAllocation;
    const allocationRows = [];
    for (const transferRow of transferRows) {
      if (fundLoanRowIds.has(transferRow.id)) continue;
      const transferProps = transferRow.properties || {};
      const groupRelation =
        (transferProps['Nhóm Quỹ'] && transferProps['Nhóm Quỹ'].relation) || [];
      if (!groupRelation.length || groupRelation[0].id !== fundGroupRow.id)
        continue;
      const amount = num_(transferProps['Số Tiền']);
      const toRelation =
        (transferProps['Đến Tài Khoản'] &&
          transferProps['Đến Tài Khoản'].relation) ||
        [];
      const fromRelation =
        (transferProps['Từ Tài Khoản'] &&
          transferProps['Từ Tài Khoản'].relation) ||
        [];
      const toId = toRelation.length ? toRelation[0].id : '';
      const fromId = fromRelation.length ? fromRelation[0].id : '';
      if (toId === fromId) continue;
      if (toId === destinationAccountId) {
        netAllocated += amount;
        allocationRows.push({
          rowId: transferRow.id,
          amount,
          text:
            ledgerRowsById[transferRow.id]?.normalizedText ||
            plainText_(transferProps['Ghi Chú']),
        });
      }
      if (fromId === destinationAccountId) {
        netAllocated -= amount;
        allocationRows.push({
          rowId: transferRow.id,
          amount: -amount,
          text:
            ledgerRowsById[transferRow.id]?.normalizedText ||
            plainText_(transferProps['Ghi Chú']),
        });
      }
    }

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

    const childAllocated = {};
    const unassignedAllocations = [];
    const addMissingChildIssue = (rowId) => {
      const row = ledgerRowsById[rowId];
      if (!row) return;
      const existing = explicitLedger.dataIssues.find(
        (issue) =>
          issue.rowId === rowId && issue.type === 'missing_required_data',
      );
      if (existing) {
        if (!existing.details.includes('Nhãn quỹ con'))
          existing.details.push('Nhãn quỹ con');
        return;
      }
      explicitLedger.dataIssues.push({
        type: 'missing_required_data',
        rowId,
        date: row.date,
        createdTime: row.createdTime,
        title: row.title,
        amount: row.amount,
        details: ['Nhãn quỹ con'],
      });
    };
    const resolveMissingChildIssue = (rowId) => {
      const issueIndex = explicitLedger.dataIssues.findIndex(
        (issue) =>
          issue.rowId === rowId && issue.type === 'missing_required_data',
      );
      if (issueIndex < 0) return;
      const issue = explicitLedger.dataIssues[issueIndex];
      issue.details = issue.details.filter(
        (detail) => detail !== 'Nhãn quỹ con',
      );
      if (issue.details.length === 0)
        explicitLedger.dataIssues.splice(issueIndex, 1);
    };
    const assignAllocation = (amount, text, rowId) => {
      const childName =
        debtTargetChildName_(text, debtChildCandidates) ||
        (group.children.length === 1 ? group.children[0].name : '');
      if (childName) {
        childAllocated[childName] = (childAllocated[childName] || 0) + amount;
        return;
      }
      if (group.children.length > 1) {
        if (amount > 0) unassignedAllocations.push({ rowId, amount });
        addMissingChildIssue(rowId);
      }
    };
    for (const allocation of allocationRows)
      assignAllocation(allocation.amount, allocation.text, allocation.rowId);
    for (const loan of explicitLedger.fundLoans.loans) {
      if (
        loan.borrowerGroupId !== fundGroupRow.id ||
        !ledgerRowsById[loan.openedBy]
      )
        continue;
      assignAllocation(
        loan.principal,
        ledgerRowsById[loan.openedBy].normalizedText,
        loan.openedBy,
      );
    }
    const childPaidFromFund = {};

    for (const spendRow of groupRows) {
      // Ghi chu tro ve chinh nhom thi khong phai muon.
      const lender =
        spendRow.lender !== '' &&
        ownKeys[stripFundPrefix_(spendRow.lender)] !== true
          ? spendRow.lender
          : '';
      if (lender !== '') {
        addDebtRow(borrowByFund, lender, spendRow, spendRow.amount, false);
      } else if (spendRow.account === accountNames[destinationAccountId]) {
        group.paidFromFund += spendRow.amount;
        if (spendRow.childName) {
          childPaidFromFund[spendRow.childName] =
            (childPaidFromFund[spendRow.childName] || 0) + spendRow.amount;
        }
      } else {
        group.paidOutsideFund += spendRow.amount;
      }
      const outstanding = outstandingByRow[spendRow.id] || 0;
      if (outstanding > 0 && lender === '') {
        group.explicitDebts.push({
          kind: 'account',
          borrowerGroupId: fundGroupRow.id,
          borrowerGroupName: group.name,
          lender: spendRow.account,
          principal: expenseSources[spendRow.id]?.previousMonth || outstanding,
          repaid: Math.max(
            (expenseSources[spendRow.id]?.previousMonth || outstanding) -
              outstanding,
            0,
          ),
          outstanding,
          childName: spendRow.childName || '',
          rows: [
            { name: spendRow.name, amount: outstanding, date: spendRow.date },
          ],
        });
      }
    }

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
        (sum, allocation) => sum + allocation.amount,
        0,
      );
      const reconciledTotal =
        Math.max(childAllocated[childName] || 0, 0) + unassignedTotal;
      if (
        unassignedTotal > 0 &&
        Math.abs(reconciledTotal - activeUnfundedChildren[0].budget) < 1000
      ) {
        childAllocated[childName] = reconciledTotal;
        for (const allocation of unassignedAllocations)
          resolveMissingChildIssue(allocation.rowId);
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
    group.explicitDebts.push(
      ...explicitLedger.fundLoans.loans.filter(
        (loan) => loan.borrowerGroupId === fundGroupRow.id,
      ),
    );
    for (const debt of group.explicitDebts) {
      const openingRow = ledgerRowsById[debt.openedBy];
      const debtText = openingRow
        ? openingRow.normalizedText
        : (debt.rows || []).map((row) => row.name).join(' ');
      const childName = debtTargetChildName_(debtText, debtChildCandidates);
      if (childName !== '') debt.childName = childName;
    }
    group.children.sort((a, b) => b.budget - a.budget);
    fundGroups.push(group);
  }

  explicitLedger.dataIssues.sort(
    (a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.createdTime || '').localeCompare(String(b.createdTime || '')) ||
      String(a.rowId || '').localeCompare(String(b.rowId || '')),
  );

  for (const fixed of fixedBudgets) {
    if (fixed.groupId && !knownGroupIds[fixed.groupId])
      fixed.missingCategory = true;
    delete fixed.id;
    delete fixed.groupId;
    delete fixed.spendRows;
  }

  return {
    t,
    total: flowAnalysis.cashOutflowTotal,
    cashOutflowTotal: flowAnalysis.cashOutflowTotal,
    personalSpendingTotal: flowAnalysis.personalSpendingTotal,
    loanFlow: flowAnalysis.loanFlow,
    grabFlow: flowAnalysis.grabFlow,
    unusualSpending: flowAnalysis.unusualSpending,
    accounts,
    fixedBudgets,
    unplannedTotal: flowAnalysis.unplannedTotal,
    unallocatedBudget: Math.max(monthlyLimit - totalFixedBudget, 0),
    monthlyLimit,
    fundGroups,
    monthlyBudget: buildMonthlyBudget_(tiers, monthlyLimit),
    excluded: buildExcluded_(tiers),
    income: buildIncomeSplit_(options.incomeRows, options.otherIncomeRows),
    openingPlan: explicitLedger.openingPlan,
    explicitLedger,
  };
}
