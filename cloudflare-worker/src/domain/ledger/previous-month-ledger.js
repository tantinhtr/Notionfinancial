import { positiveEvidenceText_, accountName_, orderedFinanceRows_, isExplicitPreviousMonthUse_, isExplicitReimbursement_ } from "./evidence.js";
import { normalizeSearchText_ } from "../finance/shared.js";

function addCohort_(state, cohort, amount) {
  if (amount > 0) state.cohorts[cohort] += amount;
}

function consumeNonOpening_(state, amount) {
  let remaining = amount;
  const consumed = { earned: 0, passThrough: 0, borrowed: 0, returned: 0 };

  for (const cohort of Object.keys(consumed)) {
    const used = Math.min(state.cohorts[cohort], remaining);
    state.cohorts[cohort] -= used;
    consumed[cohort] = used;
    remaining -= used;
    if (remaining <= 0) break;
  }

  return { consumed, remaining };
}

function consumeOpening_(state, amount) {
  const used = Math.min(state.openingAvailable, amount);
  state.openingAvailable -= used;
  return used;
}

function recordAdvance_(state, row, amount, ambiguous = false) {
  if (amount <= 0) return;
  state.account.principal += amount;
  state.obligations.push({
    rowId: row.id,
    principal: amount,
    repaid: 0,
    normalizedText: row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | "))
  });
  if (ambiguous) {
    state.account.ambiguousRows.push({ ...row, advanceAmount: amount });
  } else {
    state.account.rows.push(row);
  }
}

function applyAdvanceRepayment_(state, amount, openedBy = "") {
  let remaining = amount;
  for (const obligation of state.obligations) {
    if (remaining <= 0) break;
    if (openedBy && obligation.rowId !== openedBy) continue;
    const outstanding = obligation.principal - obligation.repaid;
    if (outstanding <= 0) continue;
    const applied = Math.min(outstanding, remaining);
    obligation.repaid += applied;
    state.account.repaid += applied;
    remaining -= applied;
  }
  return remaining;
}

function isRentReserveTransfer_(row, categoryNamesById) {
  if (row.kind !== "transfer") return false;
  const category = normalizeSearchText_(accountName_(categoryNamesById, row.categoryId));
  const text = row.normalizedText || normalizeSearchText_(row.text || row.title);
  return category === "nha tro" || /\b(?:nha tro|tien phong)\b/.test(text);
}

function matchingSourceStates_(row, states) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  const beneficiaries = [...text.matchAll(/\b(?:tra lai|hoan lai|cap bu)\s+(?:[\d.,]+\s*(?:d|dong)?\s*)?(?:tien\s+)?(?:cho\s+)?(.+?)(?=\s+(?:tu|bang|thanh toan)\s+|[|;]|$)/g)]
    .map((match) => match[1].trim().replace(/[.,]+$/, ""));
  const named = [...states.values()].filter((state) => beneficiaries.includes(normalizeSearchText_(state.account.accountName)));
  if (named.length || row.kind !== "transfer") return named.map((state) => ({ state }));
  const destination = states.get(row.toAccountId);
  if (!destination) return [];
  const account = normalizeSearchText_(destination.account.accountName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp("\\bmuon(?:\\s+tien)?\\s+" + account + "\\b").test(text)) return [];
  const noise = new Set(["tra", "lai", "tien", "no", "muon", "hom", "truoc", "ung", "cho", "cap", "bu", "hoan"]);
  const accountWords = new Set(normalizeSearchText_(destination.account.accountName).match(/[a-z0-9]+/g) || []);
  const words = (value) => (normalizeSearchText_(value).match(/[a-z0-9]+/g) || [])
    .filter((word) => !noise.has(word) && !accountWords.has(word));
  const repaymentWords = words(text);
  const phraseScore = (obligation) => {
    const debtWords = words(obligation.normalizedText);
    let best = 0;
    for (let left = 0; left < repaymentWords.length; left += 1) {
      for (let right = 0; right < debtWords.length; right += 1) {
        let length = 0;
        while (repaymentWords[left + length]
          && repaymentWords[left + length] === debtWords[right + length]) length += 1;
        best = Math.max(best, length);
      }
    }
    return best;
  };
  const ranked = destination.obligations
    .filter((obligation) => obligation.principal - obligation.repaid > 0)
    .map((obligation) => ({ obligation, score: phraseScore(obligation) }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[1].score === ranked[0].score)) return [];
  return [{ state: destination, openedBy: ranked[0].obligation.rowId }];
}

function isExplicitAccountDebt_(row, state, categoryNamesById) {
  if (normalizeSearchText_(accountName_(categoryNamesById, row.categoryId)) === "vay va tra") return false;
  const account = normalizeSearchText_(state.account.accountName);
  const text = positiveEvidenceText_(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  const note = normalizeSearchText_(row.note);
  return /\bung(?:\s+truoc)?\s+tien\b/.test(text)
    || (/\bno\b/.test(text) && (text.includes("no " + account) || /^no(?:\s+\d[\d.,]*(?:\s*(?:d|dong))?)?$/.test(note)));
}

function isNetAppTarget_(row, otherIncomeCategoryNamesById) {
  const text = normalizeSearchText_([row.title, row.note,
    accountName_(otherIncomeCategoryNamesById, row.categoryId)].filter(Boolean).join(" | "));
  return /\b(?:thu nhap rong (?:grap|grab)|(?:grap|grab) thu nhap rong)\b/.test(text);
}

function isCurrentMonthReceipt_(row, state, otherIncomeCategoryNamesById, passThroughKeywords, passThroughCategories) {
  const account = normalizeSearchText_(state.account.accountName);
  if (account !== "momo" && account !== "grap tien mat" && account !== "grab tien mat") return false;
  const text = positiveEvidenceText_(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  if (isNetAppTarget_(row, otherIncomeCategoryNamesById)) return false;
  if (row.kind === "income") return true;
  const category = normalizeSearchText_(accountName_(otherIncomeCategoryNamesById, row.categoryId));
  if ((passThroughKeywords || []).some((word) => text.includes(normalizeSearchText_(word)))
    || (passThroughCategories || []).some((name) => category === normalizeSearchText_(name))) return false;
  if (/\b(?:vay|muon|hoan|tam ung|pass through)\b/.test(category)
    || /\b(?:vay|muon|hoan lai|tra no|cap bu|chi ho|ung ho)\b/.test(text)) return false;
  return category !== "" || /\b(?:grap|grab)\s+(?:qr|tien mat)\b/.test(text);
}

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
    if (!personalRepayment && !fundRepaymentRowIds.has(row.id) && isExplicitReimbursement_(row)) {
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
