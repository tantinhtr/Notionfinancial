import { buildAccountSpendingData_ } from "./model.js";
import { iso_, normalizeSearchText_ } from "../finance/shared.js";
import { MONTH_DATE_PROPERTY, dateProperty } from "../finance/report-data.js";

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

export function calculateRollover({ t, categoryRows, accountRows, fundGroupRows, rolloverExpenseRows, rolloverTransferRows, config }) {
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
  let rolloverCarryover = rolloverCarryoverFromGroups_(
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

  return rolloverCarryover;
}
