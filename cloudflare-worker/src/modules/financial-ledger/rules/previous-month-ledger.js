import { orderedFinanceRows_, isExplicitPreviousMonthUse_, isExplicitReimbursement_, accountName_ } from "./evidence.js";
import { normalizeSearchText_ } from "../../shared/finance/shared.js";
import { addCohort_, consumeNonOpening_, consumeOpening_, recordAdvance_, applyAdvanceRepayment_ } from "./advance-state.js";
import { isRentReserveTransfer_, matchingSourceStates_, isExplicitAccountDebt_, isCurrentMonthReceipt_, isNetAppTarget_ } from "./advance-evidence.js";

export function buildPreviousMonthAdvanceLedger_({
  openingPlan = {},
  rows = [],
  accountNamesById = {},
  categoryNamesById = {},
  otherIncomeCategoryNamesById = {},
  passThroughKeywords = [],
  passThroughCategories = [],
  personalLoans = {},
  fundLoans = {}
} = {}) {
  const accounts = (openingPlan.sourceAccounts || []).map((source) => ({
    accountId: source.id,
    accountName: source.name || accountName_(accountNamesById, source.id),
    principal: 0,
    repaid: 0,
    outstanding: 0,
    rows: [],
    ambiguousRows: []
  }));
  const states = new Map(accounts.map((account, index) => [account.accountId, {
    account,
    openingAvailable: Math.max(Number(openingPlan.sourceAccounts[index].opening) || 0, 0),
    cohorts: { earned: 0, passThrough: 0, borrowed: 0, returned: 0 },
    obligations: []
  }]));
  const unmatchedSources = [];
  const expenseSources = {};
  const liabilityOpeningIds = new Set((personalLoans.liabilities || []).map((item) => item.openedBy));
  const returnedReceivableRowIds = new Set(
    (personalLoans.receivables || []).flatMap((item) => item.repaymentRows || [])
  );
  const personalRepaymentsById = new Map((personalLoans.repayments || []).map((row) => [row.id, row]));
  const fundRepaymentRowIds = new Set(
    (fundLoans.loans || []).flatMap((item) => item.repaymentRows || [])
  );
  let rentExemptRemaining = Math.max(Number(openingPlan.rentReserve) || 0, 0);
  let rentReserveUsed = 0;
  let rentReserveObserved = false;

  for (const row of orderedFinanceRows_(rows)) {
    if (!(row.amount > 0)) continue;

    const personalRepayment = personalRepaymentsById.get(row.id);
    if (personalRepayment?.direction === "receivable") {
      for (const application of personalRepayment.applications) {
        const sourceState = states.get(application.sourceAccountId);
        if (sourceState) applyAdvanceRepayment_(sourceState, application.amount, application.openedBy);
        else unmatchedSources.push({ ...row, ...application, unmatchedAmount: application.amount });
      }
    }
    const transferDebtRepayment = row.kind === "transfer"
      && /\btra no\b/.test(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
    if (!personalRepayment && !fundRepaymentRowIds.has(row.id)
      && (isExplicitReimbursement_(row) || transferDebtRepayment)) {
      const matches = matchingSourceStates_(row, states);
      if (matches.length !== 1) {
        unmatchedSources.push({ ...row, unmatchedAmount: row.amount });
      } else {
        const remaining = applyAdvanceRepayment_(matches[0].state, row.amount, matches[0].openedBy);
        if (remaining > 0) unmatchedSources.push({ ...row, unmatchedAmount: remaining });
      }
    }

    if (row.kind === "income" || row.kind === "otherIncome") {
      const state = states.get(row.accountId);
      if (!state) continue;
      if (isNetAppTarget_(row, otherIncomeCategoryNamesById)) continue;
      const cohort = liabilityOpeningIds.has(row.id)
          ? "borrowed"
          : returnedReceivableRowIds.has(row.id)
            ? "returned"
            : isCurrentMonthReceipt_(row, state, otherIncomeCategoryNamesById,
              passThroughKeywords, passThroughCategories) ? "earned" : "passThrough";
      addCohort_(state, cohort, row.amount);
      continue;
    }

    if (row.kind === "transfer") {
      const rentReserveTransfer = isRentReserveTransfer_(row, categoryNamesById);
      if (rentReserveTransfer) rentReserveObserved = true;
      const fromState = states.get(row.fromAccountId);
      const toState = states.get(row.toAccountId);
      if (!fromState) {
        if (toState) addCohort_(toState, "passThrough", row.amount);
        continue;
      }

      const openingUsed = consumeOpening_(fromState, row.amount);
      const currentUse = consumeNonOpening_(fromState, row.amount - openingUsed);
      if (toState && toState !== fromState) {
        toState.openingAvailable += openingUsed;
        for (const [cohort, amount] of Object.entries(currentUse.consumed)) {
          addCohort_(toState, cohort, amount);
        }
      }

      if (rentReserveTransfer) {
        const exempt = Math.min(openingUsed, rentExemptRemaining);
        rentExemptRemaining -= exempt;
        rentReserveUsed += exempt;
        const advanceAmount = openingUsed - exempt;
        recordAdvance_(fromState, row, advanceAmount, advanceAmount !== row.amount);
      } else if (isExplicitPreviousMonthUse_(row)) {
        recordAdvance_(fromState, row, row.amount);
      }
      continue;
    }

    if (row.kind !== "expense") continue;
    const state = states.get(row.accountId);
    if (!state) continue;

    if (isExplicitPreviousMonthUse_(row) || isExplicitAccountDebt_(row, state, categoryNamesById)) {
      const openingUsed = consumeOpening_(state, row.amount);
      consumeNonOpening_(state, row.amount - openingUsed);
      expenseSources[row.id] = { currentMonth: 0, previousMonth: row.amount, unproven: 0 };
      recordAdvance_(state, row, row.amount);
      continue;
    }

    const currentUse = consumeNonOpening_(state, row.amount);
    const openingUsed = consumeOpening_(state, currentUse.remaining);
    expenseSources[row.id] = {
      currentMonth: currentUse.consumed.earned,
      previousMonth: openingUsed,
      unproven: row.amount - currentUse.consumed.earned - openingUsed
    };
    recordAdvance_(state, row, openingUsed, openingUsed !== row.amount);
  }

  for (const account of accounts) {
    account.outstanding = account.principal - account.repaid;
  }

  const outstandingByRow = {};
  for (const state of states.values()) {
    for (const obligation of state.obligations) {
      outstandingByRow[obligation.rowId] = (outstandingByRow[obligation.rowId] || 0)
        + obligation.principal - obligation.repaid;
    }
  }

  return {
    rentReserveUsed,
    rentReserveObserved,
    totalOutstanding: accounts.reduce((total, account) => total + account.outstanding, 0),
    accounts,
    unmatchedSources,
    expenseSources,
    outstandingByRow
  };
}
