// Normalized text only. Recognition is separate from account/fund matching.
// Shared fragments keep history loading aware of the repayment vocabulary.
export const RETURN_ACTIONS = "tra lai|hoan lai";
export const FUND_REPAYMENT_ACTIONS = RETURN_ACTIONS + "|tra no";
export const REIMBURSEMENT_ACTIONS = RETURN_ACTIONS + "|cap bu";

export const FUND_REPAYMENT = new RegExp("\\b(?:" + FUND_REPAYMENT_ACTIONS + ")\\b");
export const REIMBURSEMENT = new RegExp("\\b(?:" + REIMBURSEMENT_ACTIONS + ")\\b");
export const PERSONAL_LOAN_HINT = new RegExp("\\b(?:muon|" + FUND_REPAYMENT_ACTIONS + ")\\b");
export const HISTORY_ACTION = new RegExp("\\b(?:" + FUND_REPAYMENT_ACTIONS + "|" +
  REIMBURSEMENT_ACTIONS + "|tra tien muon|nhan lai|hoan tien|dao giao dich|dieu chinh|truoc do)\\b");
