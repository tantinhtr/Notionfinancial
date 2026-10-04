import { createCashflowDataRepository, createCashflowService } from "../modules/cashflow/index.js";
import { reportCachePort } from "../modules/shared/cache/cache-port.js";
export function createCashflowRepository({ notion, notionAdapter = notion, state, kvCacheAdapter, config, now }) {
  const { getMonthlyCashflow } = createCashflowService({ repository: createCashflowDataRepository({ notion: notionAdapter, config }), cache: reportCachePort({ kvCacheAdapter, state }), config, now });
  return { getMonthlyCashflow };
}
