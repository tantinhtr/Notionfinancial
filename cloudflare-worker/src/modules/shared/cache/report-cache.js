const REPORT_CACHE_TTL_SECONDS = 60;
export async function loadReport(state, key, forceRefresh, load) {
  if (!forceRefresh) {
    try {
      const cached = await state.get(key);
      if (cached !== null && cached !== undefined) return cached;
    } catch {
      // Cache is optional; a read failure must not block a live report.
    }
  }
  const report = await load();
  try {
    await state.set(key, report, REPORT_CACHE_TTL_SECONDS);
  } catch {
    // A live report remains valid when its optional cache write fails.
  }
  return report;
}
