import { normalizeSearchText_ } from "../shared/finance/shared.js";

const COLUMNS = [
  ["Nhu cầu thiết yếu", "Nhu cầu thiết yếu (55%)", "budget"],
  ["Giáo dục phát triển", "Giáo dục phát triển (10%)", "budget"],
  ["Tiết kiệm dài hạn", "Tiết kiệm dài hạn (10%)", "allocation"],
  ["Đầu tư tài chính", "Đầu tư tài chính (10%)", "allocation"],
  ["Hưởng thụ", "Hưởng thụ (10%)", "allocation"],
  ["Cho đi", "Cho đi (5%)", "allocation"]
];

function amountFor(report, fund, source) {
  const rows = source === "budget" ? report.fundGroups : report.openingPlan?.allocations;
  const item = rows?.find((row) => normalizeSearchText_(row.name ?? row.fund) === normalizeSearchText_(fund));
  const amount = source === "budget" ? item?.budget : item?.amount;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Missing valid six-jar amount for " + fund);
  }
  return amount;
}

export function projectSixJars(report) {
  const month = report?.t?.m + "/" + report?.t?.y;
  if (!Number.isInteger(report?.t?.m) || !Number.isInteger(report?.t?.y)) {
    throw new Error("Missing report month");
  }

  const values = Object.fromEntries(COLUMNS.map(([fund, property, source]) => [
    property, { number: amountFor(report, fund, source) }
  ]));
  return { month, values, columns: COLUMNS.map(([, name]) => name) };
}
