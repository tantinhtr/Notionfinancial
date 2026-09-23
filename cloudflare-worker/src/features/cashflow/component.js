import { presentCashflowHome, presentCashflowAccount, presentCashflowDirection, presentCashflowCategory, cashflowCategoryKeyboard_ } from "./presenter.js";
import { parseCashflowCategoryCallback_, parseCashflowDirectionCallback_ } from "./callbacks.js";

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

function findAccount(accounts, token) {
  return (accounts ?? []).find((account) => account.token === token) ?? null;
}

function findCategory(account, direction, token) {
  const bucket = direction === "in" ? account?.moneyIn : account?.moneyOut;
  return (bucket?.categories ?? []).find((category) => category.token === token) ?? null;
}


export function createCashflowComponent({ repository, telegram }) {
  if (typeof repository?.getMonthlyCashflow !== "function") throw new TypeError("repository.getMonthlyCashflow must be a function");
  if (typeof telegram?.sendMessage !== "function") throw new TypeError("telegram.sendMessage must be a function");
  const send = (chatId, view) => telegram.sendMessage(chatId, view.text, view.replyMarkup);
  async function showHome(chatId, { refresh = false } = {}) {
    const data = await repository.getMonthlyCashflow(refresh);
    return send(chatId, presentCashflowHome(data));
  }
  async function showAccount(chatId, accountToken) {
    const data = await repository.getMonthlyCashflow(false);
    const account = findAccount(data.accounts, accountToken);
    if (account === null) return send(chatId, { text: ACCOUNT_ERROR_TEXT, replyMarkup: ACCOUNT_BACK_KEYBOARD });
    return send(chatId, presentCashflowAccount(data, account));
  }
  async function showDirection(chatId, callbackData) {
    const parsed = parseCashflowDirectionCallback_(callbackData);
    if (parsed === null) return send(chatId, { text: DIRECTION_ERROR_TEXT, replyMarkup: HOME_KEYBOARD });
    const data = await repository.getMonthlyCashflow(false);
    const account = findAccount(data.accounts, parsed.accountToken);
    if (account === null) return send(chatId, { text: DIRECTION_ERROR_TEXT, replyMarkup: HOME_KEYBOARD });
    return send(chatId, presentCashflowDirection(account, parsed.direction));
  }
  async function showCategory(chatId, callbackData) {
    const parsed = parseCashflowCategoryCallback_(callbackData);
    if (parsed === null) return send(chatId, { text: CATEGORY_ERROR_TEXT, replyMarkup: HOME_KEYBOARD });
    const data = await repository.getMonthlyCashflow(false);
    const account = findAccount(data.accounts, parsed.accountToken);
    if (account === null) return send(chatId, { text: CATEGORY_ERROR_TEXT, replyMarkup: HOME_KEYBOARD });
    const category = findCategory(account, parsed.direction, parsed.categoryToken);
    if (category === null) return send(chatId, { text: CATEGORY_ERROR_TEXT, replyMarkup: cashflowCategoryKeyboard_(account, parsed.direction) });
    return send(chatId, presentCashflowCategory(data, account, parsed.direction, category));
  }
  function handlesCallback(data) {
    return ["cash_refresh", "cash_home", "show_home", "cash_cat", "cash_direction"].includes(data)
      || ["cash_cat:", "cash_direction:", "cash_account:", "spend_account:", "spend_category:"].some(prefix => String(data).startsWith(prefix))
      || LEGACY_MONTH_CALLBACKS.has(data) || LEGACY_ACCOUNT_CALLBACKS.has(data);
  }
  async function handleCallback(chatId, data) {
    if (data === "cash_refresh") return showHome(chatId, { refresh: true });
    if (data === "cash_cat" || String(data).startsWith("cash_cat:")) return showCategory(chatId, data);
    if (data === "cash_direction" || String(data).startsWith("cash_direction:")) return showDirection(chatId, data);
    if (String(data).startsWith("cash_account:")) return showAccount(chatId, String(data).slice("cash_account:".length));
    return showHome(chatId, { refresh: false });
  }
  return { showHome, showAccount, showDirection, showCategory, handlesCallback, handleCallback };
}
