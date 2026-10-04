/**
 * Ánh xạ yêu cầu đọc/ghi thu nhập sang bộ lọc và thuộc tính Notion.
 * Mỗi thao tác tạo bản ghi chỉ gửi một lần; dịch vụ quyết định kiểm tra trùng và xử lý lỗi.
 */
import { iso_ } from "../shared/finance/shared.js";
import { MONTH_DATE_PROPERTY } from "../shared/finance/report-data.js";
const INCOME_CATEGORY_PROPERTY = "Loại Khoản Thu";
const GOAL_CATEGORY = "Thu Nhập Ròng Grab (App)";
const TELEGRAM_UPDATE_ID_PROPERTY = "Telegram Update ID";

/** @returns {import('./income-goal.contracts.js').IncomeDataRepository} */
export function createIncomeDataRepository({ notion, config }) {
  async function readGoalRows(t) {
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
    return { goalRows, incomeRows };
  }

  async function findByUpdateId(updateId) {
    const rows = await notion.queryDatabase(config.incomeDb, {
      property: TELEGRAM_UPDATE_ID_PROPERTY,
      rich_text: { equals: updateId }
    });
    return rows[0] ?? null;
  }

  async function insertRecord(updateId, dateISO, amount) {
    const properties = {
      "Tên Khoản Thu": { title: [{ text: { content: "Thu nhập Grab" } }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: dateISO } },
      "Loại Khoản Thu": { relation: [{ id: config.goalRelationPageId }] },
      "Telegram Update ID": { rich_text: [{ text: { content: updateId } }] }
    };
    return notion.createPage(config.incomeDb, properties);
  }
  return { readGoalRows, findByUpdateId, insertRecord };
}
