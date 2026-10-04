import { parseAmount } from "./income-input.js";
import { presentIncomeGoal, presentIncomeConfirmation, presentDailyReminder } from "./presenter.js";
export function createIncomeGoalController({ service, telegram, config }) {
  for (const method of ["getGoalStatus", "recordRevenue"]) {
    if (typeof service?.[method] !== "function") throw new TypeError("service." + method + " must be a function");
  }
  if (typeof telegram?.sendMessage !== "function") throw new TypeError("telegram.sendMessage must be a function");
  if (!Number.isFinite(config?.allowedUserId)) throw new TypeError("config.allowedUserId must be a finite number");
  if (typeof config?.timezone !== "string" || config.timezone === "") throw new TypeError("config.timezone must be a non-empty string");
  const send = (chatId, view) => telegram.sendMessage(chatId, view.text, view.replyMarkup);
  async function show(chatId) { return send(chatId, presentIncomeGoal(await service.getGoalStatus())); }
  function incomeMessage(update) {
    const message = update?.message ?? update?.edited_message ?? null;
    const amount = parseAmount(message?.text);
    if (message?.from?.id !== config.allowedUserId || message?.chat?.id === undefined || message?.chat?.id === null || amount === null) {
      throw new TypeError("reconciled income update is missing authorized numeric message data");
    }
    return { message, amount };
  }
  async function completeReconciledIncome(update) {
    const { message, amount } = incomeMessage(update);
    return send(message.chat.id, presentIncomeConfirmation(amount, await service.getGoalStatus()));
  }
  async function recordIncome(update) {
    const { message, amount } = incomeMessage(update);
    const status = await service.recordRevenue(update.update_id, amount);
    return send(message.chat.id, presentIncomeConfirmation(amount, status));
  }
  async function sendDailyReminder() {
    return send(config.allowedUserId, presentDailyReminder(await service.getGoalStatus()));
  }
  function handlesCommand(command) { return command === "/muctieu" || parseAmount(command) !== null; }
  return { show, recordIncome, completeReconciledIncome, sendDailyReminder, handlesCommand };
}
