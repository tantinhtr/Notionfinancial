export function iso_(year, month, day) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

export function money_(value) {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

export function normalizeSearchText_(value) {
  let text = String(value || '').toLowerCase();
  if (text.normalize) {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return text.replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}
export function notionIdToken_(id, fallback) {
  const normalized = String(id || '').replace(/-/g, '');
  if (!normalized || normalized.charAt(0) === '(') return fallback;
  return normalized.slice(-8);
}
export function num_(prop) {
  return (prop && prop.number) || 0;
}
