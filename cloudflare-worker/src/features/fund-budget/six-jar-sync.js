import { createSixJarRepository, createSixJarSyncService } from "../../modules/six-jar-sync/index.js";
export function syncSixJarTable(notion, databaseId, report) {
  return createSixJarSyncService({ repository: createSixJarRepository({ notion, databaseId }) }).sync(report);
}
