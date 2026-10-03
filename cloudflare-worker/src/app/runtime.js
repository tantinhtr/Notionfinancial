import { getConfig } from "../config.js";
import { createBotRouter } from "../bot.js";
import { createNotionClient } from "../adapters/notion.js";
import { createTelegramClient } from "../adapters/telegram.js";
import { createStateStore } from "../adapters/state.js";
import { createFinanceRepositories } from "../repositories/finance-repository.js";
import { createCashflowComponent } from "../features/cashflow/index.js";
import { createFundBudgetComponent, syncSixJarTable } from "../features/fund-budget/index.js";
import { createSixJarSyncJob } from "../jobs/six-jar-sync.js";
import { createIncomeGoalComponent } from "../features/income-goal/index.js";

export function createRuntime(env, now = () => new Date()) {
  const config = getConfig(env);
  const telegram = createTelegramClient(config);
  const notion = createNotionClient(config);
  const state = createStateStore(config.botState);
  const repositories = createFinanceRepositories({ notion, state, config, now });
  const cashflow = createCashflowComponent({ repository: repositories.cashflow, telegram });
  const syncSixJar = (report) => syncSixJarTable(notion, config.sixJarDb, report);
  const fundBudget = createFundBudgetComponent({ repository: repositories.fundBudget, telegram, syncSixJar });
  const incomeGoal = createIncomeGoalComponent({ repository: repositories.incomeGoal, telegram, config, now });
  const bot = createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal });
  const syncLatestSixJar = createSixJarSyncJob({ repository: repositories.fundBudget, syncSixJar });
  return { bot, config, repositories, telegram, syncLatestSixJar };
}
