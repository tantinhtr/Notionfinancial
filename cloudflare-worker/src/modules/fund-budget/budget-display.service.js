export function createBudgetDisplayService({ reportService, syncSixJar }) {
  async function synchronize(report) {
    if (!syncSixJar) return true;
    try { await syncSixJar(report); return true; }
    catch (error) { console.error("six_jar_sync_failed", error); return false; }
  }
  return { getFundBudgetReport: reportService.getFundBudgetReport, synchronize };
}
