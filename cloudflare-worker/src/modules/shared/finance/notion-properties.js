export function propertyText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || part.text?.content || "").join("");
}

export function relationId_(property) {
  const relation = property?.relation || [];
  return relation.length ? relation[0].id : "";
}
