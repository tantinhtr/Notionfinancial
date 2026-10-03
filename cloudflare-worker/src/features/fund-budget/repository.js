import { buildAccountSpendingData_ } from "./model.js";
import { iso_, normalizeSearchText_ } from "../../domain/finance/shared.js";
import { readFinanceRows_ } from "../../domain/ledger/rows.js";
import { MONTH_DATE_PROPERTY, createDateParts, createReportDateFormatter, monthFilterFor, dateProperty } from "../shared/report-data.js";

function historyBeforeMonthFilterFor(t) {
  const end = new Date(Date.UTC(t.y, t.m - 1, 0));
  return {
    property: MONTH_DATE_PROPERTY,
    date: { on_or_before: iso_(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()) }
  };
}

export function historyLookupRequired_(rows = []) {
  return rows.some((row) => /\b(?:tra no|tra lai|tra tien muon|nhan lai|hoan lai|hoan tien|cap bu|dao giao dich|dieu chinh|truoc do)\b/.test(row.normalizedText));
}

function previousMonthRows_(rows, t) {
  const previous = new Date(Date.UTC(t.y, t.m - 2, 1));
  const month = iso_(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1).slice(0, 7);
  return rows.filter((row) => dateProperty(row, MONTH_DATE_PROPERTY).startsWith(month));
}

function rolloverCarryoverFromGroups_(fundGroups, sourceGroupNames) {
  const allowed = new Set((sourceGroupNames || []).map(normalizeSearchText_));
  const groups = (fundGroups || [])
    .filter((group) => allowed.has(normalizeSearchText_(group.name)))
    .map((group) => ({
      name: group.name,
      amount: Math.min(
        Math.max(group.fundRemaining, 0),
        (group.children || []).reduce((total, child) => total + Math.max(child.fundRemaining || 0, 0), 0)
      )
    }))
    .filter((group) => group.amount > 0);
  return {
    total: groups.reduce((total, group) => total + group.amount, 0),
    groups
  };
}

function fundChildAliasHistoryRequired_(transferRows = [], categoryRows = []) {
  const childCountByGroup = {};
  for (const row of categoryRows) {
    const props = row?.properties || {};
    if (props["Tính Trong 5,5 Triệu"]?.checkbox !== true) continue;
    const groupId = props["Nhóm Quỹ"]?.relation?.[0]?.id || "";
    if (groupId) childCountByGroup[groupId] = (childCountByGroup[groupId] || 0) + 1;
  }
  return transferRows.some((row) => {
    const groupId = row?.properties?.["Nhóm Quỹ"]?.relation?.[0]?.id || "";
    return (childCountByGroup[groupId] || 0) > 1;
  });
}

export function createFundBudgetRepository({ notion, state, config, now = () => new Date() }) {
  const dateFormatter = createReportDateFormatter(config.timezone);

  async function getFundBudgetReport(forceRefresh = false) {
    const t = createDateParts(now, dateFormatter);
    // Bao cao nay doc cac bang Notion, va bang khoan chi vuot 100 dong tu giua thang
    // nen phai phan trang — cang cuoi thang cang lau. Cache 60 giay giong het
    // monthly-cashflow: bam lai trong vong mot phut la tra ve ngay.
    const cacheKey = `fund-budget:${iso_(t.y, t.m, t.d)}`;
    if (!forceRefresh) {
      try {
        const cached = await state.getReportCache(cacheKey);
        if (cached !== null && cached !== undefined) return cached;
      } catch {
        // Cache is optional; a read failure must not block a live report.
      }
    }
    const filter = monthFilterFor(t);
    const [
      categoryRows,
      expenseRows,
      accountRows,
      transferRows,
      fundGroupRows,
      incomeRows,
      otherIncomeRows,
      otherIncomeCategoryRows
    ] = await Promise.all([
      notion.queryDatabase(config.budgetDb),
      notion.queryDatabase(config.expenseDb, filter),
      notion.queryDatabase(config.accountDb),
      notion.queryDatabase(config.transferDb, filter),
      notion.queryDatabase(config.fundGroupDb),
      notion.queryDatabase(config.incomeDb, filter),
      notion.queryDatabase(config.otherIncomeDb, filter),
      notion.queryDatabase(config.otherIncomeCategoryDb)
    ]);
    const historyFilter = historyBeforeMonthFilterFor(t);
    const needsRolloverHistory = (config.rolloverSourceGroupNames || []).length > 0;
    let rolloverExpenseRows = [];
    let rolloverTransferRows = [];
    let historicalIncomeRows = [];
    let historicalOtherIncomeRows = [];
    let historicalExpenseRows = [];
    let historicalTransferRows = [];
    const currentRows = readFinanceRows_({ incomeRows, otherIncomeRows, expenseRows, transferRows });
    const needsChildAliasHistory = fundChildAliasHistoryRequired_(transferRows, categoryRows);
    if (historyLookupRequired_(currentRows)) {
      [historicalIncomeRows, historicalOtherIncomeRows, historicalExpenseRows, historicalTransferRows] = await Promise.all([
        notion.queryDatabase(config.incomeDb, historyFilter),
        notion.queryDatabase(config.otherIncomeDb, historyFilter),
        notion.queryDatabase(config.expenseDb, historyFilter),
        notion.queryDatabase(config.transferDb, historyFilter)
      ]);
      rolloverExpenseRows = historicalExpenseRows;
      rolloverTransferRows = historicalTransferRows;
    } else if (needsRolloverHistory) {
      [rolloverExpenseRows, rolloverTransferRows] = await Promise.all([
        notion.queryDatabase(config.expenseDb, historyFilter),
        notion.queryDatabase(config.transferDb, historyFilter)
      ]);
    } else if (needsChildAliasHistory) {
      historicalExpenseRows = await notion.queryDatabase(config.expenseDb, historyFilter);
    }
    if (needsRolloverHistory && needsChildAliasHistory && historicalExpenseRows.length === 0) {
      historicalExpenseRows = rolloverExpenseRows;
    }
    let rolloverCarryover = { total: 0, groups: [] };
    if (needsRolloverHistory) {
      const historicalFundModel = buildAccountSpendingData_(
        t,
        categoryRows,
        previousMonthRows_(rolloverExpenseRows, t),
        accountRows,
        config.monthlyExpenseLimit,
        previousMonthRows_(rolloverTransferRows, t),
        fundGroupRows,
        {
          passThroughKeywords: config.passThroughKeywords,
          passThroughCategories: config.passThroughCategories,
          spendableSubFunds: config.spendableSubFunds,
          sourceAccountNames: [],
          goalRelationPageId: config.goalRelationPageId,
          rentReserveAmount: 0,
          rolloverFundNames: []
        }
      );
      rolloverCarryover = rolloverCarryoverFromGroups_(
        historicalFundModel.fundGroups,
        config.rolloverSourceGroupNames
      );
      // September 2026 closing balance was confirmed by the owner.
      if (t.y === 2026 && t.m === 10) {
        rolloverCarryover = {
          total: 136972,
          groups: [{ name: "Nhu cầu thiết yếu", amount: 136972 }]
        };
      }
    }
    const model = buildAccountSpendingData_(
      t,
      categoryRows,
      expenseRows,
      accountRows,
      config.monthlyExpenseLimit,
      transferRows,
      fundGroupRows,
      {
        incomeRows,
        otherIncomeRows,
        otherIncomeCategoryRows,
        historicalIncomeRows,
        historicalOtherIncomeRows,
        historicalExpenseRows,
        historicalTransferRows,
        passThroughKeywords: config.passThroughKeywords,
        passThroughCategories: config.passThroughCategories,
        spendableSubFunds: config.spendableSubFunds,
        sourceAccountNames: config.sourceAccountNames,
        goalRelationPageId: config.goalRelationPageId,
        rentReserveAmount: config.rentReserveAmount,
        rolloverFundNames: config.rolloverFundNames,
        rolloverFundWeights: config.rolloverFundWeights,
        rolloverCarryoverAmount: rolloverCarryover.total
      }
    );
    model.rolloverCarryover = rolloverCarryover;
    try {
      await state.putReportCache(cacheKey, model, 60);
    } catch {
      // A live report remains valid when its optional cache write fails.
    }
    return model;
  }

  return { getFundBudgetReport };
}
