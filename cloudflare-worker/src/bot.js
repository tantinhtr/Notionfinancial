import { parseAmount } from "./domain/finance/income-input.js";
import { createCashflowComponent } from "./features/cashflow/component.js";
import { createFundBudgetComponent } from "./features/fund-budget/component.js";
import { createIncomeGoalComponent } from "./features/income-goal/component.js";
import { FALLBACK_TEXT, HOME_KEYBOARD, callbackErrorText } from "./app/bot-presenter.js";

function messageFrom(update) {
  return update?.message ?? update?.edited_message ?? null;
}

export function classifyUpdate(update, allowedUserId) {
  const message = messageFrom(update);
  if (
    !message ||
    message.from?.id !== allowedUserId ||
    typeof message.text !== "string"
  ) {
    return "other";
  }
  return parseAmount(message.text) === null ? "other" : "income";
}

function commandFrom(text) {
  return String(text).trim().split(/\s+/)[0].split("@")[0].toLowerCase();
}


export function createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal }) {
  for (const method of ["sendMessage", "answerCallbackQuery"]) {
    if (typeof telegram?.[method] !== "function") throw new TypeError("telegram." + method + " must be a function");
  }
  if (!Number.isFinite(config?.allowedUserId)) throw new TypeError("config.allowedUserId must be a finite number");
  for (const [name, component, methods] of [
    ["cashflow", cashflow, ["showHome", "handlesCallback", "handleCallback"]],
    ["fundBudget", fundBudget, ["handlesCallback", "handleCallback"]],
    ["incomeGoal", incomeGoal, ["show", "recordIncome", "handlesCommand", "completeReconciledIncome", "sendDailyReminder"]]
  ]) {
    for (const method of methods) {
      if (typeof component?.[method] !== "function") throw new TypeError(name + "." + method + " must be a function");
    }
  }
  async function dispatchCallback(chatId, data) {
    if (data === "show_goal" || data === "refresh_goal") return incomeGoal.show(chatId);
    if (fundBudget.handlesCallback(data)) return fundBudget.handleCallback(chatId, data);
    if (cashflow.handlesCallback(data)) return cashflow.handleCallback(chatId, data);
    return cashflow.showHome(chatId, { refresh: false });
  }
  async function processCallback(callback) {
    // Tat nut xoay la viec phu. Hong o day thi van phai chay tiep, khong duoc de
    // nguoi dung bam xong roi khong nhan duoc gi.
    try {
      await telegram.answerCallbackQuery(callback.id);
    } catch {
      // ignored on purpose
    }
    const chatId = callback.message?.chat?.id;
    // Ba nhanh thoat im lang duoi day tung lam nguoi dung bam nut ma khong nhan duoc
    // gi, con Cloudflare thi bao 0 error. Ghi log de lan sau biet ngay la nhanh nao.
    if (callback.from?.id !== config.allowedUserId) {
      console.log(JSON.stringify({
        event: "callback_ignored",
        reason: "user_not_allowed",
        fromId: callback.from?.id ?? null,
        data: callback.data ?? null
      }));
      return;
    }
    if (chatId === undefined || chatId === null) {
      console.log(JSON.stringify({
        event: "callback_ignored",
        reason: "missing_chat_id",
        data: callback.data ?? null
      }));
      return;
    }
    const startedAt = Date.now();
    try {
      await dispatchCallback(chatId, callback.data);
      console.log(JSON.stringify({
        event: "callback_done",
        data: callback.data ?? null,
        ms: Date.now() - startedAt
      }));
    } catch (error) {
      console.log(JSON.stringify({
        event: "callback_failed",
        data: callback.data ?? null,
        ms: Date.now() - startedAt,
        message: String(error?.message || error)
      }));
      await telegram.sendMessage(chatId, callbackErrorText(error), HOME_KEYBOARD);
    }
  }

  async function processMessage(update, message) {
    if (
      typeof message?.text !== "string" ||
      message.from?.id !== config.allowedUserId ||
      message.chat?.id === undefined ||
      message.chat?.id === null
    ) {
      return;
    }
    const chatId = message.chat.id;
    const text = message.text.trim();
    const command = commandFrom(text);
    if (command === "/start") {
      await cashflow.showHome(chatId, { refresh: false });
      return;
    }
    if (incomeGoal.handlesCommand(command) && command === "/muctieu") {
      await incomeGoal.show(chatId);
      return;
    }
    const amount = parseAmount(text);
    if (amount === null) {
      await telegram.sendMessage(chatId, FALLBACK_TEXT);
      return;
    }
    await incomeGoal.recordIncome(update);
  }

  async function processUpdate(update) {
    if (update?.callback_query) {
      await processCallback(update.callback_query);
      return;
    }
    const message = messageFrom(update);
    if (message !== null) {
      await processMessage(update, message);
    }
  }


  return { processUpdate, completeReconciledIncome: incomeGoal.completeReconciledIncome, sendDailyReminder: incomeGoal.sendDailyReminder };
}

export function createBot({ telegram, repository, config, now = () => new Date() }) {
  const cashflow = createCashflowComponent({ repository, telegram });
  const fundBudget = createFundBudgetComponent({ repository, telegram });
  const incomeGoal = createIncomeGoalComponent({ repository, telegram, config, now });
  return createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal });
}
