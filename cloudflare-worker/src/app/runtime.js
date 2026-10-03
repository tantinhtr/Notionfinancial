import { PROCESSING_FAILURE_TEXT } from "./bot-presenter.js";
import { createCronReminder } from "../jobs/cron-reminder.js";
import { getConfig } from "../config.js";
import { createBotRouter } from "./bot-router.js";
import { createNotionAdapter } from "../adapters/notion-adapter.js";
import { createTelegramAdapter } from "../adapters/telegram-adapter.js";
import { createKvCacheAdapter } from "../adapters/kv-cache-adapter.js";
import { createTelegramPresenter } from "./telegram-presenter.js";
import { createFinanceRepositories } from "../repositories/finance-repository.js";
import { createCashflowComponent } from "../features/cashflow/index.js";
import { createFundBudgetComponent, syncSixJarTable } from "../features/fund-budget/index.js";
import { createSixJarSyncJob } from "../jobs/six-jar-sync.js";
import { createIncomeGoalComponent } from "../features/income-goal/index.js";

export function createRuntime(env, now = () => new Date()) {
  const config = getConfig(env);
  const telegram = createTelegramPresenter(createTelegramAdapter(config));
  const notion = createNotionAdapter(config);
  const kvCacheAdapter = createKvCacheAdapter(config.botState, { prefix: "report:" });
  const repositories = createFinanceRepositories({ notionAdapter: notion, kvCacheAdapter, config, now });
  const cashflow = createCashflowComponent({ repository: repositories.cashflow, telegram });
  const syncSixJar = (report) => syncSixJarTable(notion, config.sixJarDb, report);
  const fundBudget = createFundBudgetComponent({ repository: repositories.fundBudget, telegram, syncSixJar });
  const incomeGoal = createIncomeGoalComponent({ repository: repositories.incomeGoal, telegram, config, now });
  const bot = createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal });
  const syncLatestSixJar = createSixJarSyncJob({ repository: repositories.fundBudget, syncSixJar });
  const sendDailyReminder = createCronReminder({ incomeGoal });
  return { bot, config, repositories, telegram, syncLatestSixJar, sendDailyReminder };
}


// Error reporting requires only Telegram configuration, even when Notion/KV initialization fails.
export function createWebhookNotifier(env, fetchImpl = fetch) {
  const telegram = createTelegramAdapter({
    telegramToken: env.TELEGRAM_TOKEN,
    requestTimeoutMs: 5000
  }, fetchImpl);
  return async (update) => {
    const source = update?.callback_query ?? update?.message ?? update?.edited_message;
    const chatId = update?.callback_query?.message?.chat?.id ?? source?.chat?.id;
    const allowed = Number(env.ALLOWED_USER_ID);
    if (!Number.isFinite(allowed) || source?.from?.id !== allowed || chatId === null || chatId === undefined) return;
    await telegram.sendMessage(chatId, PROCESSING_FAILURE_TEXT);
  };
}
