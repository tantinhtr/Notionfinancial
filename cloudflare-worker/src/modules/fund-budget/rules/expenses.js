import { buildBudgetCatalog } from "./catalog.js";
import { normalizeSearchText_ } from "../../shared/finance/shared.js";
import { analyzeExpenseRows_ } from "./expense-classifier.js";
import { stripFundPrefix_, borrowedFrom_, assignedFund_ } from "./assignment.js";

export function summarizeExpenses({ categoryRows, expenseRows, accountRows, fundGroupRows, options }) {
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
  const { categoryNames, categoryGroupIds, fundGroupIdByName, groupAliasKeys, assignmentKeys, fixedIdMap, fixedBudgets, totalFixedBudget, historicalChildSources, accountNames, groupIdSet } = buildBudgetCatalog({
    categoryRows,
    accountRows,
    fundGroupRows,
    options,
  });
  const extraRowsByGroupId = {};
  const globalCategoryTotals = {};
  const accountMap = {};
  const tiers = {
    groupSpending: 0,
    looseSpending: 0,
    outsideFundSpending: 0,
    looseByCategory: {},
    excludedRows: [],
  };

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

  return { accountNames, fixedBudgets, totalFixedBudget, accounts, tiers, flowAnalysis, groupAliasKeys, historicalChildSources, extraRowsByGroupId };
}
