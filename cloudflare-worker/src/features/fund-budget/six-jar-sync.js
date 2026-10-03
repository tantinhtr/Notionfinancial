import { normalizeSearchText_ } from "../../domain/finance/shared.js";

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

function titleOf(row) {
  return (row.properties?.["Tháng"]?.title ?? [])
    .map((part) => part.plain_text ?? part.text?.content ?? "")
    .join("")
    .trim();
}

export async function syncSixJarTable(notion, databaseId, report) {
  const month = report?.t?.m + "/" + report?.t?.y;
  if (!Number.isInteger(report?.t?.m) || !Number.isInteger(report?.t?.y)) {
    throw new Error("Missing report month");
  }

  const values = Object.fromEntries(COLUMNS.map(([fund, property, source]) => [
    property, { number: amountFor(report, fund, source) }
  ]));
  const database = await notion.retrieveDatabase(databaseId);
  const changes = {};
  for (const [, property] of COLUMNS) {
    const type = database.properties?.[property]?.type;
    if (type === "formula") changes[property] = { number: { format: "number" } };
    else if (type !== "number") throw new Error("Unexpected six-jar property: " + property);
  }
  if (database.properties?.["Tháng"]?.type !== "title") {
    throw new Error("Missing six-jar month title");
  }
  if (Object.keys(changes).length) {
    const updated = await notion.updateDatabase(databaseId, { properties: changes });
    for (const [, property] of COLUMNS) {
      if (updated.properties?.[property]?.type !== "number") {
        throw new Error("Six-jar schema did not become numeric: " + property);
      }
    }
  }

  const rows = await notion.queryDatabase(databaseId);
  const matching = rows.filter((row) => titleOf(row) === month);
  if (matching.length > 1) throw new Error("Duplicate six-jar month: " + month);
  let row = matching[0];
  if (!row) {
    const blank = rows.filter((entry) => titleOf(entry) === "");
    if (blank.length === 1) row = blank[0];
  }

  const properties = { ...values };
  if (!row || titleOf(row) !== month) {
    properties["Tháng"] = { title: [{ text: { content: month } }] };
  }
  if (!row) {
    await notion.createPage(databaseId, properties);
    return;
  }
  if (Object.keys(properties).every((key) =>
    key === "Tháng" || row.properties?.[key]?.number === properties[key].number
  ) && !properties["Tháng"]) return;
  await notion.updatePage(row.id, { properties });
}
