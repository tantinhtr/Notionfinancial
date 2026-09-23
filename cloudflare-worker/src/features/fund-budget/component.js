import { presentFundBudget } from "./presenter.js";

export function createFundBudgetComponent({ repository, telegram }) {
  if (typeof repository?.getFundBudgetReport !== "function") throw new TypeError("repository.getFundBudgetReport must be a function");
  if (typeof telegram?.sendMessage !== "function") throw new TypeError("telegram.sendMessage must be a function");
  async function show(chatId, { refresh = false } = {}) {
    const data = await repository.getFundBudgetReport(refresh);
    const view = presentFundBudget(data);
    return telegram.sendMessage(chatId, view.text, view.replyMarkup);
  }
  const handlesCallback = data => data === "show_funds";
  async function handleCallback(chatId, data) {
    if (handlesCallback(data)) return show(chatId);
  }
  return { show, handlesCallback, handleCallback };
}
