export function createCronReminder({ incomeGoal }) {
  return () => incomeGoal.sendDailyReminder();
}
