/**
 * Đọc văn bản và ID quan hệ đầu tiên từ thuộc tính Notion.
 * Chỉ giải mã cấu trúc dữ liệu, không gọi API hoặc phân loại nghiệp vụ.
 */
export function propertyText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || part.text?.content || "").join("");
}

export function relationId_(property) {
  const relation = property?.relation || [];
  return relation.length ? relation[0].id : "";
}
