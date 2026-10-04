/**
 * Nhận yêu cầu xem quỹ, chuẩn bị nội dung rồi yêu cầu dịch vụ đồng bộ Notion.
 * Nếu đồng bộ lỗi, vẫn gửi báo cáo kèm cảnh báo đã thống nhất.
 */
import { presentFundBudget } from "./presenter.js";

export function createFundBudgetController({ service, telegram }) {
  const repository = service;
  if (typeof repository?.getFundBudgetReport !== "function") throw new TypeError("repository.getFundBudgetReport must be a function");
  if (typeof telegram?.sendMessage !== "function") throw new TypeError("telegram.sendMessage must be a function");
  async function show(chatId, { refresh = false } = {}) {
    const data = await repository.getFundBudgetReport(refresh);
    const view = presentFundBudget(data);
    if (!await service.synchronize(data)) {
      view.text += "\n⚠️ Bảng sáu lọ trên Notion chưa đồng bộ. Thử lại sau.";
    }
    return telegram.sendMessage(chatId, view.text, view.replyMarkup);
  }
  const handlesCallback = data => data === "show_funds";
  async function handleCallback(chatId, data) {
    if (handlesCallback(data)) return show(chatId, { refresh: true });
  }
  return { show, handlesCallback, handleCallback };
}
