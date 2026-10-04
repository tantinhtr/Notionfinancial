/**
 * Dùng cache cho báo cáo trong 60 giây, hoặc đọc mới khi yêu cầu làm mới.
 * Cache là tùy chọn: đọc/ghi cache thất bại không chặn báo cáo lấy từ dữ liệu thật.
 */
const REPORT_CACHE_TTL_SECONDS = 60;
export async function loadReport(state, key, forceRefresh, load) {
  if (!forceRefresh) {
    try {
      const cached = await state.get(key);
      if (cached !== null && cached !== undefined) return cached;
    } catch {
      // Cache là tùy chọn; đọc cache lỗi thì tiếp tục lấy báo cáo từ dữ liệu thật.
    }
  }
  const report = await load();
  try {
    await state.set(key, report, REPORT_CACHE_TTL_SECONDS);
  } catch {
    // Ghi cache thất bại không làm mất báo cáo vừa tính từ dữ liệu thật.
  }
  return report;
}
