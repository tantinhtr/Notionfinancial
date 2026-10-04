/** @returns {import('./six-jar-sync.contracts.js').SixJarRepository} */
export function createSixJarRepository({ notion, databaseId }) {
  return {
    readSchema: () => notion.retrieveDatabase(databaseId),
    updateSchema: properties => notion.updateDatabase(databaseId, { properties }),
    readRows: () => notion.queryDatabase(databaseId),
    createRow: properties => notion.createPage(databaseId, properties),
    updateRow: (id, properties) => notion.updatePage(id, { properties })
  };
}
