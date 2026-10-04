/**
 * @typedef {Object} UpdateProcessingPorts
 * @property {{get:(key:string)=>Promise<object|undefined>,put:(key:string,value:object)=>Promise<void>}} storage Durable update record; not a report cache.
 * @property {(work:Function)=>Promise<object>} runExclusive Serializes same update ID.
 * @property {(update:object)=>string} classifyUpdate
 * @property {(update:object)=>Promise<void>} executeUpdate May throw AMBIGUOUS_INCOME_WRITE.
 * @property {(id:number)=>Promise<object|null>} reconcileIncome Null is confirmed absence; failures must not recreate a page.
 * @property {(update:object)=>Promise<void>} completeReconciledIncome Confirmation only, no new income write.
 * @property {(update:object,error:Error)=>Promise<void>} warnNeedsReconciliation
 * @property {()=>string} now Injected timestamp for record transitions.
 */
export {};
