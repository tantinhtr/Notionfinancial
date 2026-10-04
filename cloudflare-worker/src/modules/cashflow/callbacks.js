export function cashflowCallbackData_(value) {
  value = String(value || '');
  if (!value) return null;
  return new TextEncoder().encode(value).length < 64 ? value : null;
}

export function parseCashflowCategoryCallback_(value) {
  const match = /^cash_cat:([A-Za-z0-9-]+):(in|out):([A-Za-z0-9-]+)$/.exec(
    String(value || ''),
  );
  if (!match) return null;
  return {
    accountToken: match[1],
    direction: match[2],
    categoryToken: match[3],
  };
}

export function parseCashflowDirectionCallback_(value) {
  const match = /^cash_direction:([A-Za-z0-9-]+):(in|out)$/.exec(
    String(value || ''),
  );
  if (!match) return null;
  return { accountToken: match[1], direction: match[2] };
}
