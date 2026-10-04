const PROCESSED_UPDATE_TTL_SECONDS = 604800;
const DEFAULT_REPORT_TTL_SECONDS = 60;

function validateKv(kv) {
  for (const method of ["get", "put", "delete"]) {
    if (typeof kv?.[method] !== "function") {
      throw new TypeError(`KV binding must provide ${method}()`);
    }
  }
}

export function createStateStore(kv) {
  validateKv(kv);

  return {
    async hasProcessedUpdate(updateId) {
      const value = await kv.get(`telegram:update:${updateId}`);
      return value !== null && value !== undefined;
    },
    markProcessedUpdate(updateId) {
      return kv.put(`telegram:update:${updateId}`, "1", {
        expirationTtl: PROCESSED_UPDATE_TTL_SECONDS
      });
    },
    async getReportCache(key) {
      const cacheKey = `report:${key}`;
      const value = await kv.get(cacheKey);
      if (value === null || value === undefined) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch {
        await kv.delete(cacheKey);
        return null;
      }
    },
    putReportCache(key, value, ttlSeconds = DEFAULT_REPORT_TTL_SECONDS) {
      return kv.put(`report:${key}`, JSON.stringify(value), { expirationTtl: ttlSeconds });
    },
    deleteReportCache(key) {
      return kv.delete(`report:${key}`);
    }
  };
}
