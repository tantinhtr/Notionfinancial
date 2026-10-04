/**
 * Điều phối kiểm tra trùng theo update ID, ghi thu nhập, xóa cache và tính mục tiêu.
 * Repository, đồng hồ và thao tác xóa báo cáo được truyền vào nên dịch vụ không cần tự tạo kết nối Notion.
 */
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
  // Đọc dữ liệu mục tiêu/thu nhập theo ngày được cấp, trả các mức cần kiếm đã tính.
  async function getGoalStatus() {
    const t = createDateParts(now, formatter);
    const { goalRows, incomeRows } = await repository.readGoalRows(t);
    return buildGoalStatus_(t, goalRows, incomeRows);
  }
  function findGrabIncomeByUpdateId(updateId) { return repository.findByUpdateId(updateIdText(updateId)); }
  // Nhận update ID, ngày ISO và số tiền; kiểm tra trùng trước khi ghi. Chỉ lỗi ghi mới được đánh dấu cần đối soát, lỗi cache được xử lý riêng.
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
      // Đã ghi Notion thành công thì lỗi xóa cache không được biến thành lỗi ghi thu nhập.
    }
    return { created: true, page };
  }
  // Xác định ngày theo múi giờ cấu hình, ghi khoản thu rồi lấy trạng thái để xác nhận.
  async function recordRevenue(updateId, amount) {
    const t = createDateParts(now, formatter);
    await addGrabIncome(updateId, iso_(t.y, t.m, t.d), amount);
    return getGoalStatus();
  }
  return { getGoalStatus, addGrabIncome, findGrabIncomeByUpdateId, recordRevenue };
}
