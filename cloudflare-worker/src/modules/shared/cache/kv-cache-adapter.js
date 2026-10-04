/**
 * Bọc Cloudflare KV bằng get/set/delete, thêm tiền tố và chuyển đổi JSON.
 * Giá trị JSON hỏng được xóa và coi như chưa có cache.
 */
export function createKvCacheAdapter(kv, { prefix = "" } = {}) {
  for (const method of ["get", "put", "delete"]) {
    if (typeof kv?.[method] !== "function") throw new TypeError("KV binding must provide " + method + "()");
  }
  return {
    async get(key) {
      const value = await kv.get(prefix + key);
      if (value === null || value === undefined) return null;
      try { return JSON.parse(value); }
      catch {
        await kv.delete(prefix + key);
        return null;
      }
    },
    set(key, value, ttlSeconds) {
      return kv.put(prefix + key, JSON.stringify(value), { expirationTtl: ttlSeconds });
    },
    delete(key) { return kv.delete(prefix + key); }
  };
}
