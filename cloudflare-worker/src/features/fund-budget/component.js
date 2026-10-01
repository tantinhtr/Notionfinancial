import { presentFundBudget } from "./presenter.js";

export function createFundBudgetComponent({ repository, telegram, syncSixJar }) {
  if (typeof repository?.getFundBudgetReport !== "function") throw new TypeError("repository.getFundBudgetReport must be a function");
  if (typeof telegram?.sendMessage !== "function") throw new TypeError("telegram.sendMessage must be a function");
  async function show(chatId, { refresh = false } = {}) {
    const data = await repository.getFundBudgetReport(refresh);
    const view = presentFundBudget(data);
    if (syncSixJar) {
      try {
        await syncSixJar(data);
      } catch (error) {
        console.error("six_jar_sync_failed", error);
        view.text += "\n⚠️ Bảng sáu lọ trên Notion chưa đồng bộ. Thử lại sau.";
      }
    }
    return telegram.sendMessage(chatId, view.text, view.replyMarkup);
  }
  const handlesCallback = data => data === "show_funds";
  async function handleCallback(chatId, data) {
    if (handlesCallback(data)) return show(chatId, { refresh: true });
  }
  return { show, handlesCallback, handleCallback };
}
