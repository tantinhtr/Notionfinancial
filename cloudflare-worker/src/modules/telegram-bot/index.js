/**
 * Điểm truy cập công khai của module giao tiếp Telegram.
 * Bên ngoài dùng các thành phần được công bố ở đây thay vì truy cập file nội bộ.
 */
export { createBotRouter, classifyUpdate } from "./bot-router.js";
export { createTelegramPresenter, truncateMessage } from "./telegram-presenter.js";
export { PROCESSING_FAILURE_TEXT } from "./bot-presenter.js";
