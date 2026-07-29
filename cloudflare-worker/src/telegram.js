const TELEGRAM_TEXT_LIMIT = 3900;
const TRUNCATION_SUFFIX = "\n\n... Tin nhắn quá dài nên đã rút gọn.";

function truncateMessage(text) {
  const message = String(text);
  if (message.length <= TELEGRAM_TEXT_LIMIT) {
    return message;
  }
  return message.slice(0, TELEGRAM_TEXT_LIMIT - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function redactToken(text, token) {
  if (typeof text !== "string" || typeof token !== "string" || token === "") {
    return text;
  }
  return text.split(token).join("[REDACTED]");
}

function telegramError(method, status, description, telegramToken) {
  const details = [
    `Telegram ${method} failed`,
    status ? `HTTP ${status}` : null,
    typeof description === "string" && description !== ""
      ? redactToken(description, telegramToken)
      : null
  ].filter(Boolean);
  return new Error(details.join(": "));
}

export function createTelegramClient(config, fetchImpl = fetch) {
  const baseUrl = `https://api.telegram.org/bot${config.telegramToken}`;

  async function call(method, payload = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      throw telegramError(method, undefined, undefined, config.telegramToken);
    }

    const body = await parseJson(response);
    if (!response.ok || body?.ok !== true) {
      throw telegramError(method, response.status, body?.description, config.telegramToken);
    }
    return body.result;
  }

  return {
    call,
    sendMessage(chatId, text, replyMarkup) {
      const payload = { chat_id: chatId, text: truncateMessage(text) };
      if (replyMarkup !== undefined) {
        payload.reply_markup = replyMarkup;
      }
      return call("sendMessage", payload);
    },
    answerCallbackQuery(callbackQueryId) {
      return call("answerCallbackQuery", { callback_query_id: callbackQueryId });
    },
    setWebhook(url, secretToken) {
      return call("setWebhook", {
        url,
        secret_token: secretToken,
        allowed_updates: ["message", "edited_message", "callback_query"],
        drop_pending_updates: false
      });
    },
    getWebhookInfo() {
      return call("getWebhookInfo");
    },
    deleteWebhook() {
      return call("deleteWebhook", { drop_pending_updates: false });
    }
  };
}
