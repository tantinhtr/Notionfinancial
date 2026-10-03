import { parseJson, redactToken } from "./http-response.js";

function telegramError(method, status, description, telegramToken) {
  const details = [
    `Telegram ${method} failed`,
    status ? `HTTP ${status}` : null,
    typeof description === 'string' && description !== ''
      ? redactToken(description, telegramToken)
      : null,
  ].filter(Boolean);
  return new Error(details.join(': '));
}

export function createTelegramAdapter(config, fetchImpl = fetch) {
  const baseUrl = `https://api.telegram.org/bot${config.telegramToken}`;

  async function call(method, payload = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        ...(config.requestTimeoutMs ? { signal: AbortSignal.timeout(config.requestTimeoutMs) } : {}),
      });
    } catch {
      throw telegramError(method, undefined, undefined, config.telegramToken);
    }

    const body = await parseJson(response);
    if (!response.ok || body?.ok !== true) {
      throw telegramError(
        method,
        response.status,
        body?.description,
        config.telegramToken,
      );
    }
    return body.result;
  }

  return {
    call,
    sendMessage(chatId, text, replyMarkup) {
      const payload = { chat_id: chatId, text };
      if (replyMarkup !== undefined) {
        payload.reply_markup = replyMarkup;
      }
      return call('sendMessage', payload);
    },
    answerCallbackQuery(callbackQueryId) {
      return call('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
      });
    },
    setWebhook(url, secretToken) {
      return call('setWebhook', {
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: false,
        max_connections: 1,
      });
    },
    getWebhookInfo() {
      return call('getWebhookInfo');
    },
    deleteWebhook() {
      return call('deleteWebhook', { drop_pending_updates: false });
    },
  };
}

export const createTelegramClient = createTelegramAdapter;
