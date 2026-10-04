/**
 * @typedef {{categoryRows:object[],expenseRows:object[],accountRows:object[],transferRows:object[],fundGroupRows:object[],incomeRows:object[],otherIncomeRows:object[],otherIncomeCategoryRows:object[]}} BudgetRows
 * @typedef {Object} BudgetDataRepository
 * @property {(t:{y:number,m:number,d:number})=>Promise<BudgetRows>} readMonth
 * @property {(t:{y:number,m:number,d:number},kinds:Array<'income'|'otherIncome'|'expense'|'transfer'>)=>Promise<object[][]>} readHistory Results preserve requested order; all reads before month start. Errors propagate.
 */
export {};
