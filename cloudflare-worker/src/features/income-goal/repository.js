import { iso_ } from "../../domain/finance/shared.js";
import { MONTH_DATE_PROPERTY, createDateParts, createReportDateFormatter } from "../shared/report-data.js";
import { buildGoalStatus_ } from "./model.js";

const INCOME_CATEGORY_PROPERTY = "Loại Khoản Thu";
const GOAL_CATEGORY = "Thu Nhập Ròng Grab (App)";
const TELEGRAM_UPDATE_ID_PROPERTY = "Telegram Update ID";

export class AmbiguousIncomeWriteError extends Error {
  constructor(updateId, { cause } = {}) {
    super(
      "Income write outcome is ambiguous and requires reconciliation",
      cause === undefined ? undefined : { cause }
    );
    this.name = "AmbiguousIncomeWriteError";
    this.code = "AMBIGUOUS_INCOME_WRITE";
    this.updateId = updateId;
  }
}

function updateIdText(updateId) {
  if (updateId === null || updateId === undefined || String(updateId) === "") {
    throw new TypeError("updateId must stringify to a non-empty value");
  }
  return String(updateId);
}

export function createIncomeGoalRepository({ notion, config, invalidateReports, now = () => new Date() }) {
  if (typeof invalidateReports !== "function") throw new TypeError("invalidateReports must be a function");
  const dateFormatter = createReportDateFormatter(config.timezone);

  async function getGoalStatus() {
    const t = createDateParts(now, dateFormatter);
    const firstDay = iso_(t.y, t.m, 1);
    const todayISO = iso_(t.y, t.m, t.d);
    const incomeFilter = {
      and: [
        { property: MONTH_DATE_PROPERTY, date: { on_or_after: firstDay } },
        { property: MONTH_DATE_PROPERTY, date: { on_or_before: todayISO } },
        { property: INCOME_CATEGORY_PROPERTY, relation: { contains: config.goalRelationPageId } }
      ]
    };
    const [goalRows, incomeRows] = await Promise.all([
      notion.queryDatabase(config.goalDb, {
        property: INCOME_CATEGORY_PROPERTY,
        title: { equals: GOAL_CATEGORY }
      }),
      notion.queryDatabase(config.incomeDb, incomeFilter)
    ]);
    return buildGoalStatus_(t, goalRows, incomeRows);
  }

  async function findGrabIncomeByUpdateId(updateId) {
    const rows = await notion.queryDatabase(config.incomeDb, {
      property: TELEGRAM_UPDATE_ID_PROPERTY,
      rich_text: { equals: updateIdText(updateId) }
    });
    return rows[0] ?? null;
  }

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
    const properties = {
      "Tên Khoản Thu": { title: [{ text: { content: "Thu nhập Grab" } }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: dateISO } },
      "Loại Khoản Thu": { relation: [{ id: config.goalRelationPageId }] },
      "Telegram Update ID": { rich_text: [{ text: { content: normalizedUpdateId } }] }
    };
    let page;
    try {
      page = await notion.createPage(config.incomeDb, properties);
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

  return { getGoalStatus, findGrabIncomeByUpdateId, addGrabIncome };
}
