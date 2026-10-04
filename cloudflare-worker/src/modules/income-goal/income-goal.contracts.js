/**
 * @typedef {Object} IncomeDataRepository
 * @property {(t: {y:number,m:number,d:number}) => Promise<{goalRows:object[],incomeRows:object[]}>} readGoalRows
 * @property {(updateId: string) => Promise<object|null>} findByUpdateId Returns null only for confirmed absence; errors propagate.
 * @property {(updateId:string,dateISO:string,amount:number) => Promise<object>} insertRecord Performs one write; never retries. May throw after server persistence.
 * @typedef {Object} IncomeService
 * @property {() => Promise<object>} getGoalStatus
 * @property {(updateId:number|string,amount:number) => Promise<object>} recordRevenue Returns goal status after successful creation/duplicate detection.
 * @property {(updateId:number|string) => Promise<object|null>} findGrabIncomeByUpdateId
 */
export {};
