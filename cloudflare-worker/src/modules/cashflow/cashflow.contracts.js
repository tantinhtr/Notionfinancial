/**
 * @typedef {{accountRows:object[],incomeRows:object[],otherIncomeRows:object[],expenseRows:object[],transferRows:object[],incomeCategoryRows:object[],otherIncomeCategoryRows:object[],expenseCategoryRows:object[]}} CashflowRows
 * @typedef {{readMonth: (t:{y:number,m:number,d:number}) => Promise<CashflowRows>}} CashflowDataRepository Raw property rows; query errors propagate.
 * @typedef {{getMonthlyCashflow: (forceRefresh?:boolean) => Promise<object>, invalidate:(dateISO:string)=>Promise<void>}} CashflowService
 */
export {};
