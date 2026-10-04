import { createIncomeDataRepository, createIncomeGoalService } from "../modules/income-goal/index.js";
export { AmbiguousIncomeWriteError } from "../modules/income-goal/index.js";
// Legacy aggregate signature; production uses separate data and application ports.
export function createGrabRepository({ notion, notionAdapter = notion, config, invalidateReports, now }) {
  const { getGoalStatus, findGrabIncomeByUpdateId, addGrabIncome } = createIncomeGoalService({ repository: createIncomeDataRepository({ notion: notionAdapter, config }), config, invalidateReports, now });
  return { getGoalStatus, findGrabIncomeByUpdateId, addGrabIncome };
}
export const createIncomeGoalRepository = createGrabRepository;
