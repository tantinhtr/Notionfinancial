/**
 * Tác vụ đồng bộ định kỳ: buộc lấy báo cáo ngân sách mới rồi chuyển cùng báo cáo đó sang Notion.
 * Lỗi đồng bộ được chuyển lên bên gọi để ghi nhận.
 */
export function createSixJarSyncJob({ repository, syncSixJar }) {
  return async function syncLatestSixJar() {
    return syncSixJar(await repository.getFundBudgetReport(true));
  };
}
