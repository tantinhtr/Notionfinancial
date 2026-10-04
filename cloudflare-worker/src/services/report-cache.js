export { loadReport } from "../modules/shared/cache/report-cache.js";
const REPORT_PREFIXES = { cashflow: "monthly-cashflow", fundBudget: "fund-budget" };

export function reportCacheKey(kind, dateISO) {
  return REPORT_PREFIXES[kind] + ":" + dateISO;
}

export async function invalidateReportCaches(state, dateISO) {
  for (const kind of Object.keys(REPORT_PREFIXES)) {
    await state.delete(reportCacheKey(kind, dateISO));
  }
}
