import { projectSixJars } from "./six-jar-sync.rules.js";
function titleOf(row) {
  return (row.properties?.["Tháng"]?.title ?? [])
    .map((part) => part.plain_text ?? part.text?.content ?? "")
    .join("")
    .trim();
}

/** @param {{repository: import('./six-jar-sync.contracts.js').SixJarRepository}} dependencies */
export function createSixJarSyncService({ repository }) {
  async function sync(report) {
    const { month, values, columns } = projectSixJars(report);
    const database = await repository.readSchema();
    const changes = {};
    for (const property of columns) {
      const type = database.properties?.[property]?.type;
      if (type === "formula") changes[property] = { number: { format: "number" } };
      else if (type !== "number") throw new Error("Unexpected six-jar property: " + property);
    }
    if (database.properties?.["Tháng"]?.type !== "title") {
      throw new Error("Missing six-jar month title");
    }
    if (Object.keys(changes).length) {
      const updated = await repository.updateSchema(changes);
      for (const property of columns) {
        if (updated.properties?.[property]?.type !== "number") {
          throw new Error("Six-jar schema did not become numeric: " + property);
        }
      }
    }

    const rows = await repository.readRows();
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
      await repository.createRow(properties);
      return;
    }
    if (Object.keys(properties).every((key) =>
      key === "Tháng" || row.properties?.[key]?.number === properties[key].number
    ) && !properties["Tháng"]) return;
    await repository.updateRow(row.id, properties);
  }
  return { sync };
}
