import { HISTORY_ACTION } from "../ledger/transaction-language.js";
import { iso_ } from "../finance/shared.js";
import { MONTH_DATE_PROPERTY } from "../finance/report-data.js";

export function historyBeforeMonthFilterFor(t) {
  const end = new Date(Date.UTC(t.y, t.m - 1, 0));
  return {
    property: MONTH_DATE_PROPERTY,
    date: { on_or_before: iso_(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()) }
  };
}

export function historyLookupRequired_(rows = []) {
  return rows.some((row) => HISTORY_ACTION.test(row.normalizedText));
}

export function fundChildAliasHistoryRequired_(transferRows = [], categoryRows = []) {
  const childCountByGroup = {};
  for (const row of categoryRows) {
    const props = row?.properties || {};
    if (props["Tính Trong 5,5 Triệu"]?.checkbox !== true) continue;
    const groupId = props["Nhóm Quỹ"]?.relation?.[0]?.id || "";
    if (groupId) childCountByGroup[groupId] = (childCountByGroup[groupId] || 0) + 1;
  }
  return transferRows.some((row) => {
    const groupId = row?.properties?.["Nhóm Quỹ"]?.relation?.[0]?.id || "";
    return (childCountByGroup[groupId] || 0) > 1;
  });
}
