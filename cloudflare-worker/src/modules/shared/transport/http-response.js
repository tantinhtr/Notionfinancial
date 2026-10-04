export async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function redactToken(text, token) {
  if (typeof text !== "string" || typeof token !== "string" || token === "") {
    return text;
  }
  return text.split(token).join("[REDACTED]");
}
