export function createCronReminder({ getGoalStatus, deliver }) {
  return async () => deliver(await getGoalStatus());
}
