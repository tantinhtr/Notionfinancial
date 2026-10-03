// Compatibility for callers supplying the previous state interface.
export function reportCachePort({ kvCacheAdapter, state }) {
  if (kvCacheAdapter) return kvCacheAdapter;
  return {
    get: (...args) => state.getReportCache(...args),
    set: (...args) => state.putReportCache(...args),
    delete: (...args) => state.deleteReportCache(...args)
  };
}
