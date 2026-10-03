import { buildFinanceLedger_ } from "../../domain/ledger/finance-ledger.js";
import { summarizeExpenses } from "./models/expenses.js";
import { buildFundGroups } from "./models/groups.js";
import { buildMonthlyBudget_, buildExcluded_, buildIncomeSplit_ } from "./models/totals.js";

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
  const { accountNames, fixedBudgets, totalFixedBudget, accounts, tiers, flowAnalysis, groupAliasKeys, historicalChildSources, extraRowsByGroupId } = summarizeExpenses({
    categoryRows, expenseRows, accountRows, fundGroupRows, options
  });
  const { fundGroups, knownGroupIds } = buildFundGroups({
    fundGroupRows, transferRows, fixedBudgets, accountNames, groupAliasKeys, explicitLedger, ledgerRowsById, historicalChildSources, extraRowsByGroupId, flowAnalysis
  });

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
