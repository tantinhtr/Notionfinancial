/**
 * @typedef {Object} SixJarRepository
 * @property {()=>Promise<{properties:object}>} readSchema
 * @property {(properties:object)=>Promise<{properties:object}>} updateSchema No retry; returns persisted schema.
 * @property {()=>Promise<object[]>} readRows All month rows, including blank titles.
 * @property {(properties:object)=>Promise<object>} createRow One create attempt.
 * @property {(id:string,properties:object)=>Promise<object>} updateRow One update attempt.
 */
export {};
