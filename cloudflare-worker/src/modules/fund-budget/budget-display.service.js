/**
 * Thực hiện đồng bộ báo cáo qua hàm được truyền vào và trả trạng thái thành công/thất bại.
 * Lỗi đồng bộ được ghi log; controller dùng trạng thái để giữ báo cáo và thêm cảnh báo cho người dùng.
 */
export function createBudgetDisplayService({ reportService, syncSixJar }) {
  async function synchronize(report) {
    if (!syncSixJar) return true;
    try { await syncSixJar(report); return true; }
    catch (error) { console.error("six_jar_sync_failed", error); return false; }
  }
  return { getFundBudgetReport: reportService.getFundBudgetReport, synchronize };
}
