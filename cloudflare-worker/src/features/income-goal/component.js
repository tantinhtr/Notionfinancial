import { iso_ } from "../../domain/finance/shared.js";
import { parseAmount, dateParts } from "../../domain/finance/income-input.js";
import { presentIncomeGoal, presentIncomeConfirmation, presentDailyReminder } from "./presenter.js";
export function createIncomeGoalComponent({ repository, telegram, config, now = () => new Date() }) {
  for (const method of ["getGoalStatus", "addGrabIncome"]) {
    if (typeof repository?.[method] !== "function") throw new TypeError("repository." + method + " must be a function");
  }
  if (typeof telegram?.sendMessage !== "function") throw new TypeError("telegram.sendMessage must be a function");
  if (!Number.isFinite(config?.allowedUserId)) throw new TypeError("config.allowedUserId must be a finite number");
  if (typeof config?.timezone !== "string" || config.timezone === "") throw new TypeError("config.timezone must be a non-empty string");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const send = (chatId, view) => telegram.sendMessage(chatId, view.text, view.replyMarkup);
  async function show(chatId) { return send(chatId, presentIncomeGoal(await repository.getGoalStatus())); }
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
    return send(message.chat.id, presentIncomeConfirmation(amount, await repository.getGoalStatus()));
  }
  async function recordIncome(update) {
    const { message, amount } = incomeMessage(update);
    const today = dateParts(now(), config.timezone);
    await repository.addGrabIncome(update.update_id, iso_(today.y, today.m, today.d), amount);
    return send(message.chat.id, presentIncomeConfirmation(amount, await repository.getGoalStatus()));
  }
  async function sendDailyReminder() {
    return send(config.allowedUserId, presentDailyReminder(await repository.getGoalStatus()));
  }
  function handlesCommand(command) { return command === "/muctieu" || parseAmount(command) !== null; }
  return { show, recordIncome, completeReconciledIncome, sendDailyReminder, handlesCommand };
}
