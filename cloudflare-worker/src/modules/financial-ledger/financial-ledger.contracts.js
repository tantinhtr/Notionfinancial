/**
 * @typedef {Object} LedgerInput
 * @property {object} openingPlan Precomputed by budget owner; evaluator clones its returned plan.
 * @property {object[]} [accountRows]
 * @property {object[]} [incomeRows]
 * @property {object[]} [expenseRows]
 * @property {object[]} [transferRows]
 * @property {object[]} [historicalIncomeRows]
 * @property {object[]} [historicalOtherIncomeRows]
 * @property {object[]} [historicalExpenseRows]
 * @property {object[]} [historicalTransferRows]
 * @property {object} [options] Supplied financial policy; no env/clock lookup.
 * @typedef {(input:LedgerInput)=>{rows:object[],openingPlan:object,personalLoans:object,fundLoans:object,previousMonthAdvances:object,dataIssues:object[],unmatched:object[]}} LedgerEvaluator
 */
export {};
