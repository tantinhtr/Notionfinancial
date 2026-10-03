export function createSixJarSyncJob({ repository, syncSixJar }) {
  return async function syncLatestSixJar() {
    return syncSixJar(await repository.getFundBudgetReport(true));
  };
}
