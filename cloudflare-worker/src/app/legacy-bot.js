import { createBotRouter } from "../modules/telegram-bot/index.js";
import { createCashflowComponent } from "../features/cashflow/index.js";
import { createFundBudgetComponent } from "../features/fund-budget/index.js";
import { createIncomeGoalComponent } from "../features/income-goal/index.js";

export function createBot({ telegram, repository, config, now = () => new Date() }) {
  const cashflow = createCashflowComponent({ repository, telegram });
  const fundBudget = createFundBudgetComponent({ repository, telegram });
  const incomeGoal = createIncomeGoalComponent({ repository, telegram, config, now });
  return createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal });
}
