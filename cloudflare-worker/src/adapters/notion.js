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

function notionError(operation, status, message, notionToken) {
  const details = [
    `Notion ${operation} failed`,
    status ? `HTTP ${status}` : null,
    typeof message === "string" && message !== "" ? redactToken(message, notionToken) : null
  ].filter(Boolean);
  return new Error(details.join(": "));
}

export function createNotionClient(config, fetchImpl = fetch) {
  const headers = {
    Authorization: `Bearer ${config.notionToken}`,
    "Notion-Version": config.notionVersion,
    "Content-Type": "application/json"
  };

  // Notion cho trung binh 3 request/giay. Bao cao quy ban 7 truy van cung luc nen
  // dinh 429 la chuyen binh thuong — phai cho roi thu lai chu khong duoc bo cuoc.
  // 5xx cung the. Va moi request phai co han gio: khong co thi mot request treo se
  // treo luon nut bam, nguoi dung khong nhan duoc gi ca.
  // Chi thu lai 429. Loi 5xx van de noi len tren cho coordinator xu ly nhu cu:
  // no danh dau update la retryable roi Telegram gui lai, khong mat giao dich nao.
  const RETRY_STATUS = 429;
  // Tong thoi gian xau nhat phai nam gon trong han cho cua Telegram (~60 giay), khong
  // thi nguoi dung khong nhan duoc gi ca. 3 luot, 8 giay moi luot, backoff 0,4s va
  // 0,8s -> xau nhat khoang 25 giay.
  const MAX_ATTEMPTS = 3;
  const REQUEST_TIMEOUT_MS = 8000;

  function retryDelayMs(response, attempt) {
    // response co the la undefined khi luot truoc hong mang hoac het gio.
    const header = Number(response?.headers?.get?.("Retry-After"));
    if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 8000);
    return Math.min(400 * 2 ** attempt, 1600);
  }

  // retryable chi bat cho lenh DOC. Khong bao gio thu lai lenh ghi: mot lan ghi
  // lai la mot khoan thu trung, dung thu ma coordinator sinh ra de chong.
  async function request(operation, path, payload, retryable = false) {
    let response;
    let lastStatus;
    let lastMessage;
    const attempts = retryable ? MAX_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt - 1)));
      }
      try {
        response = await fetchImpl(`https://api.notion.com/v1${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch {
        // Het gio hoac loi mang: van con luot thi thu lai.
        response = undefined;
        lastStatus = undefined;
        lastMessage = undefined;
        continue;
      }
      if (response.status !== RETRY_STATUS) break;
      lastStatus = response.status;
      lastMessage = (await parseJson(response))?.message;
      response = undefined;
    }
    if (response === undefined) {
      throw notionError(operation, lastStatus, lastMessage, config.notionToken);
    }

    const body = await parseJson(response);
    if (!response.ok) {
      throw notionError(operation, response.status, body?.message, config.notionToken);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw notionError(operation, response.status, "malformed success response");
    }
    return body;
  }

  return {
    async queryDatabase(databaseId, filter) {
      const rows = [];
      let cursor;

      do {
        const payload = { page_size: 100 };
        if (filter !== undefined) {
          payload.filter = filter;
        }
        if (cursor !== undefined) {
          payload.start_cursor = cursor;
        }

        const body = await request(
          "queryDatabase",
          `/databases/${databaseId}/query`,
          payload,
          true
        );
        if (!Array.isArray(body.results) || typeof body.has_more !== "boolean") {
          throw notionError("queryDatabase", undefined, "malformed success response");
        }
        rows.push(...body.results);
        if (body.has_more && (typeof body.next_cursor !== "string" || body.next_cursor === "")) {
          throw notionError("queryDatabase", undefined, "malformed success response");
        }
        cursor = body.has_more ? body.next_cursor : undefined;
      } while (cursor !== undefined);

      return rows;
    },
    createPage(databaseId, properties) {
      return request("createPage", "/pages", {
        parent: { database_id: databaseId },
        properties
      });
    }
  };
}
