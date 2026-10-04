/**
 * Giới hạn độ dài nội dung trước khi chuyển cho adapter Telegram.
 * Giữ việc cắt nội dung ở tầng trình bày, không đặt trong HTTP client.
 */
const TELEGRAM_TEXT_LIMIT = 3900;
const TRUNCATION_SUFFIX = '\n\n... Tin nhắn quá dài nên đã rút gọn.';

export function truncateMessage(text) {
  const message = String(text);
  if (message.length <= TELEGRAM_TEXT_LIMIT) {
    return message;
  }
  return (
    message.slice(0, TELEGRAM_TEXT_LIMIT - TRUNCATION_SUFFIX.length) +
    TRUNCATION_SUFFIX
  );
}

export function createTelegramPresenter(telegramAdapter) {
  return {
    ...telegramAdapter,
    sendMessage(chatId, text, replyMarkup) {
      return telegramAdapter.sendMessage(chatId, truncateMessage(text), replyMarkup);
    }
  };
}
