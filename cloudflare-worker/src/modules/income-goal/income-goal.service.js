import { createDateParts, createReportDateFormatter } from "../shared/finance/report-data.js";
import { iso_ } from "../shared/finance/shared.js";
import { buildGoalStatus_ } from "./income-goal.rules.js";
import { AmbiguousIncomeWriteError } from "./income-goal.errors.js";
function updateIdText(updateId) {
  if (updateId === null || updateId === undefined || String(updateId) === "") {
    throw new TypeError("updateId must stringify to a non-empty value");
  }
  return String(updateId);
}

/** @param {{repository: import('./income-goal.contracts.js').IncomeDataRepository, config: object, invalidateReports: (date: string) => Promise<void>, now?: () => Date}} dependencies */
export function createIncomeGoalService({ repository, config, invalidateReports, now = () => new Date() }) {
  if (typeof invalidateReports !== "function") throw new TypeError("invalidateReports must be a function");
  const formatter = createReportDateFormatter(config.timezone);
  async function getGoalStatus() {
    const t = createDateParts(now, formatter);
    const { goalRows, incomeRows } = await repository.readGoalRows(t);
    return buildGoalStatus_(t, goalRows, incomeRows);
  }
  function findGrabIncomeByUpdateId(updateId) { return repository.findByUpdateId(updateIdText(updateId)); }
  async function addGrabIncome(updateId, dateISO, amount) {
    const normalizedUpdateId = updateIdText(updateId);
    if (typeof dateISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      throw new TypeError("dateISO must match YYYY-MM-DD");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TypeError("amount must be a finite number greater than zero");
    }

    const existingPage = await findGrabIncomeByUpdateId(normalizedUpdateId);
    if (existingPage !== null) {
      return { created: false, page: existingPage };
    }
    let page;
    try {
      page = await repository.insertRecord(normalizedUpdateId, dateISO, amount);
    } catch (cause) {
      throw new AmbiguousIncomeWriteError(updateId, { cause });
    }
    try {
      await invalidateReports(dateISO);
    } catch {
      // A successful Notion write must not be reported as failed due to cache invalidation.
    }
    return { created: true, page };
  }
  async function recordRevenue(updateId, amount) {
    const t = createDateParts(now, formatter);
    await addGrabIncome(updateId, iso_(t.y, t.m, t.d), amount);
    return getGoalStatus();
  }
  return { getGoalStatus, addGrabIncome, findGrabIncomeByUpdateId, recordRevenue };
}
