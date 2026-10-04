/**
 * Chuyển hợp đồng cache cũ sang get/set/delete để giữ tương thích.
 * Runtime mới truyền trực tiếp adapter KV; lớp này phục vụ các điểm gọi cũ.
 */
// Chuyển tiếp cho điểm gọi còn dùng hợp đồng state cũ.
export function reportCachePort({ kvCacheAdapter, state }) {
  if (kvCacheAdapter) return kvCacheAdapter;
  return {
    get: (...args) => state.getReportCache(...args),
    set: (...args) => state.putReportCache(...args),
    delete: (...args) => state.deleteReportCache(...args)
  };
}
