import { getConfig } from "../config.js";
import { createBotRouter } from "../bot.js";
import { createNotionClient } from "../adapters/notion.js";
import { createTelegramClient } from "../adapters/telegram.js";
import { createStateStore } from "../adapters/state.js";
import { createFinanceRepository } from "../repositories/finance-repository.js";
import { createCashflowComponent } from "../features/cashflow/component.js";
import { createFundBudgetComponent } from "../features/fund-budget/component.js";
import { createIncomeGoalComponent } from "../features/income-goal/component.js";

export function createRuntime(env, now = () => new Date()) {
  const config = getConfig(env);
  const telegram = createTelegramClient(config);
  const notion = createNotionClient(config);
  const state = createStateStore(config.botState);
  const repository = createFinanceRepository({ notion, state, config, now });
  const cashflow = createCashflowComponent({ repository, telegram });
  const fundBudget = createFundBudgetComponent({ repository, telegram });
  const incomeGoal = createIncomeGoalComponent({ repository, telegram, config, now });
  const bot = createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal });
  return { bot, config, repository, telegram };
}
