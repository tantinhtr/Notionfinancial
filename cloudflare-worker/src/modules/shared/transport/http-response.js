/**
 * Đọc JSON phản hồi và che token nếu upstream đưa token vào nội dung lỗi.
 * Dùng chung cho các adapter HTTP để không lộ thông tin xác thực.
 */
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
