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

  async function request(operation, path, payload) {
    let response;
    try {
      response = await fetchImpl(`https://api.notion.com/v1${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    } catch {
      throw notionError(operation, undefined, undefined, config.notionToken);
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

        const body = await request("queryDatabase", `/databases/${databaseId}/query`, payload);
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
