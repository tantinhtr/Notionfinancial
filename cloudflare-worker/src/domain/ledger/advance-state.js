import { normalizeSearchText_ } from "../finance/shared.js";

export function addCohort_(state, cohort, amount) {
  if (amount > 0) state.cohorts[cohort] += amount;
}

export function consumeNonOpening_(state, amount) {
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

export function consumeOpening_(state, amount) {
  const used = Math.min(state.openingAvailable, amount);
  state.openingAvailable -= used;
  return used;
}

export function recordAdvance_(state, row, amount, ambiguous = false) {
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

export function applyAdvanceRepayment_(state, amount, openedBy = "") {
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
