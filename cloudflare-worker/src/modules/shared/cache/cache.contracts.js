/**
 * @typedef {Object} Cache
 * @property {(key:string)=>Promise<object|null|undefined>} get Miss is null/undefined; transport errors may reject.
 * @property {(key:string,value:object,ttlSeconds:number)=>Promise<void>} set Stores serialized report for the supplied TTL.
 * @property {(key:string)=>Promise<void>} delete Removes one key; no effect on unrelated reports.
 */
export {};
