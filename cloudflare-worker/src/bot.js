import {
  cashflowAccountKeyboard_,
  cashflowAccountText_,
  cashflowCategoryKeyboard_,
  cashflowCategoryText_,
  cashflowDirectionKeyboard_,
  cashflowDirectionText_,
  fundBudgetKeyboard_,
  fundBudgetText_,
  iso_,
  money_,
  monthlyCashflowKeyboard_,
  monthlyCashflowText_,
  parseCashflowCategoryCallback_,
  parseCashflowDirectionCallback_,
  progressText_
} from "./finance.js";

const FALLBACK_TEXT = "Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.";
const DIRECTION_ERROR_TEXT =
  "Hướng dòng tiền không còn tồn tại trong dữ liệu tháng này.";
const CATEGORY_ERROR_TEXT =
  "Loại giao dịch không còn tồn tại trong dữ liệu tháng này.";
const ACCOUNT_ERROR_TEXT =
  "Tài khoản không còn tồn tại trong dữ liệu tháng này.";
const HOME_KEYBOARD = Object.freeze({
  inline_keyboard: Object.freeze([Object.freeze([
    Object.freeze({ text: "🏠 Các tài khoản", callback_data: "cash_home" })
  ])])
});
const ACCOUNT_BACK_KEYBOARD = Object.freeze({
  inline_keyboard: Object.freeze([Object.freeze([
    Object.freeze({ text: "⬅️ Các tài khoản", callback_data: "cash_home" })
  ])])
});
const LEGACY_ACCOUNT_CALLBACKS = new Set([
  "show_accounts",
  "refresh_accounts",
  "show_unusual"
]);
const LEGACY_MONTH_CALLBACKS = new Set(["show_month", "refresh_month"]);

function validateDependencies({ telegram, repository, config, now }) {
  for (const method of ["sendMessage", "answerCallbackQuery"]) {
    if (typeof telegram?.[method] !== "function") {
      throw new TypeError(`telegram.${method} must be a function`);
    }
  }
  for (const method of [
    "getMonthlyCashflow",
    "getFundBudgetReport",
    "getGoalStatus",
    "addGrabIncome"
  ]) {
    if (typeof repository?.[method] !== "function") {
      throw new TypeError(`repository.${method} must be a function`);
    }
  }
  if (!Number.isFinite(config?.allowedUserId)) {
    throw new TypeError("config.allowedUserId must be a finite number");
  }
  if (typeof config?.timezone !== "string" || config.timezone === "") {
    throw new TypeError("config.timezone must be a non-empty string");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
}

function parseAmount(text) {
  const value = String(text ?? "").trim();
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const amount = Number(value.replace(/[.,]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

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

function dateParts(date, timezone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid Date");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, Number(part.value)])
  );
  return { y: parts.year, m: parts.month, d: parts.day };
}

function goalKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📊 Dòng tiền", callback_data: "cash_home" }],
      [{ text: "📦 Quỹ & ngân sách", callback_data: "show_funds" }],
      [{ text: "🏠 Trang chính", callback_data: "show_home" }]
    ]
  };
}

function findAccount(accounts, token) {
  return (accounts ?? []).find((account) => account.token === token) ?? null;
}

function findCategory(account, direction, token) {
  const bucket = direction === "in" ? account?.moneyIn : account?.moneyOut;
  return (bucket?.categories ?? []).find((category) => category.token === token) ?? null;
}

function callbackErrorText(error) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return `Lỗi: ${message || "Không thể xử lý yêu cầu."}`;
}

function loggedText(amount, status) {
  const lines = [
    `Đã ghi ${money_(amount)} cho hôm nay ✅`,
    "",
    `Hôm nay kiếm: ${money_(status.earnedToday)}`,
    `Mục tiêu hôm nay: ${money_(status.todayTarget)}`,
    ""
  ];
  if (status.todayMet) {
    lines.push("🎉 Hôm nay ĐẠT chỉ tiêu! Ngày mai nhẹ nhàng hơn.");
  } else {
    lines.push(
      `⚠️ Hôm nay còn thiếu ${money_(status.todayTarget - status.earnedToday)} ` +
      "so với mục tiêu ngày."
    );
  }
  lines.push(
    status.daysAfter > 0
      ? `🔥 Ngày mai cần kiếm: ${money_(status.tomorrowTarget)}`
      : "🏁 Hết tháng rồi!"
  );
  return lines.join("\n");
}

export function createBot({
  telegram,
  repository,
  config,
  now = () => new Date()
}) {
  validateDependencies({ telegram, repository, config, now });

  async function sendMonthlyCashflow(chatId, forceRefresh) {
    const data = await repository.getMonthlyCashflow(forceRefresh);
    await telegram.sendMessage(
      chatId,
      monthlyCashflowText_(data),
      monthlyCashflowKeyboard_(data)
    );
  }

  async function sendGoal(chatId) {
    const status = await repository.getGoalStatus();
    await telegram.sendMessage(chatId, progressText_(status), goalKeyboard());
  }

  async function completeIncomeConfirmation(chatId, amount) {
    const status = await repository.getGoalStatus();
    await telegram.sendMessage(chatId, loggedText(amount, status));
  }

  async function completeReconciledIncome(update) {
    const message = messageFrom(update);
    const amount = parseAmount(message?.text);
    if (
      message?.from?.id !== config.allowedUserId ||
      message?.chat?.id === undefined ||
      message?.chat?.id === null ||
      amount === null
    ) {
      throw new TypeError("reconciled income update is missing authorized numeric message data");
    }
    await completeIncomeConfirmation(message.chat.id, amount);
  }

  async function sendFundBudget(chatId) {
    const data = await repository.getFundBudgetReport();
    await telegram.sendMessage(chatId, fundBudgetText_(data), fundBudgetKeyboard_());
  }

  async function sendCashflowAccount(chatId, accountToken) {
    const data = await repository.getMonthlyCashflow(false);
    const account = findAccount(data.accounts, accountToken);
    if (account === null) {
      await telegram.sendMessage(chatId, ACCOUNT_ERROR_TEXT, ACCOUNT_BACK_KEYBOARD);
      return;
    }
    await telegram.sendMessage(
      chatId,
      cashflowAccountText_(data, account),
      cashflowAccountKeyboard_(account)
    );
  }

  async function sendCashflowDirection(chatId, parsed) {
    if (parsed === null) {
      await telegram.sendMessage(chatId, DIRECTION_ERROR_TEXT, HOME_KEYBOARD);
      return;
    }
    const data = await repository.getMonthlyCashflow(false);
    const account = findAccount(data.accounts, parsed.accountToken);
    if (account === null) {
      await telegram.sendMessage(chatId, DIRECTION_ERROR_TEXT, HOME_KEYBOARD);
      return;
    }
    await telegram.sendMessage(
      chatId,
      cashflowDirectionText_(account, parsed.direction),
      cashflowDirectionKeyboard_(account, parsed.direction)
    );
  }

  async function sendCashflowCategory(chatId, parsed) {
    if (parsed === null) {
      await telegram.sendMessage(chatId, CATEGORY_ERROR_TEXT, HOME_KEYBOARD);
      return;
    }
    const data = await repository.getMonthlyCashflow(false);
    const account = findAccount(data.accounts, parsed.accountToken);
    if (account === null) {
      await telegram.sendMessage(chatId, CATEGORY_ERROR_TEXT, HOME_KEYBOARD);
      return;
    }
    const category = findCategory(account, parsed.direction, parsed.categoryToken);
    if (category === null) {
      await telegram.sendMessage(
        chatId,
        CATEGORY_ERROR_TEXT,
        cashflowCategoryKeyboard_(account, parsed.direction)
      );
      return;
    }
    await telegram.sendMessage(
      chatId,
      cashflowCategoryText_(data, account, parsed.direction, category),
      cashflowCategoryKeyboard_(account, parsed.direction)
    );
  }

  async function dispatchCallback(chatId, data) {
    if (data === "show_goal" || data === "refresh_goal") {
      await sendGoal(chatId);
    } else if (data === "cash_refresh") {
      await sendMonthlyCashflow(chatId, true);
    } else if (data === "cash_home" || data === "show_home") {
      await sendMonthlyCashflow(chatId, false);
    } else if (data === "show_funds") {
      await sendFundBudget(chatId);
    } else if (data === "cash_cat" || String(data).startsWith("cash_cat:")) {
      await sendCashflowCategory(chatId, parseCashflowCategoryCallback_(data));
    } else if (
      data === "cash_direction" ||
      String(data).startsWith("cash_direction:")
    ) {
      await sendCashflowDirection(chatId, parseCashflowDirectionCallback_(data));
    } else if (String(data).startsWith("cash_account:")) {
      await sendCashflowAccount(chatId, String(data).slice("cash_account:".length));
    } else if (
      LEGACY_MONTH_CALLBACKS.has(data) ||
      LEGACY_ACCOUNT_CALLBACKS.has(data) ||
      String(data).startsWith("spend_account:") ||
      String(data).startsWith("spend_category:")
    ) {
      await sendMonthlyCashflow(chatId, false);
    } else {
      await sendMonthlyCashflow(chatId, false);
    }
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
    if (callback.from?.id !== config.allowedUserId || chatId === undefined || chatId === null) {
      return;
    }
    try {
      await dispatchCallback(chatId, callback.data);
    } catch (error) {
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
      await sendMonthlyCashflow(chatId, false);
      return;
    }
    if (command === "/muctieu") {
      await sendGoal(chatId);
      return;
    }
    const amount = parseAmount(text);
    if (amount === null) {
      await telegram.sendMessage(chatId, FALLBACK_TEXT);
      return;
    }
    const today = dateParts(now(), config.timezone);
    await repository.addGrabIncome(
      update.update_id,
      iso_(today.y, today.m, today.d),
      amount
    );
    await completeIncomeConfirmation(chatId, amount);
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

  async function sendDailyReminder() {
    const status = await repository.getGoalStatus();
    let heading;
    if (status.todayMet) {
      heading = `🎉 Hôm nay đã đạt chỉ tiêu! Kiếm được ${money_(status.earnedToday)}.`;
    } else if (status.earnedToday > 0) {
      heading =
        `💪 Hôm nay kiếm ${money_(status.earnedToday)}, còn thiếu ` +
        `${money_(status.todayTarget - status.earnedToday)}.`;
    } else {
      heading = "📌 Hôm nay chưa ghi thu nhập nào. Nhắn số tiền để cập nhật nhé!";
    }
    await telegram.sendMessage(
      config.allowedUserId,
      `${heading}\n\n${progressText_(status)}`
    );
  }

  return { processUpdate, completeReconciledIncome, sendDailyReminder };
}
