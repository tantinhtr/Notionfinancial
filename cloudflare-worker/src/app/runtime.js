import { getConfig } from "../config.js";
import { createNotionAdapter } from "../modules/shared/transport/notion-adapter.js";
import { createTelegramAdapter } from "../modules/shared/transport/telegram-adapter.js";
import { createKvCacheAdapter } from "../modules/shared/cache/kv-cache-adapter.js";
import { createBotRouter, createTelegramPresenter, PROCESSING_FAILURE_TEXT } from "../modules/telegram-bot/index.js";
import { createCashflowDataRepository, createCashflowService, createCashflowController } from "../modules/cashflow/index.js";
import { createBudgetDataRepository, createBudgetCalculator, createFundBudgetService, createBudgetDisplayService, createFundBudgetController } from "../modules/fund-budget/index.js";
import { createIncomeDataRepository, createIncomeGoalService, createIncomeGoalController, presentDailyReminder } from "../modules/income-goal/index.js";
import { evaluateFinanceLedger } from "../modules/financial-ledger/index.js";
import { createSixJarRepository, createSixJarSyncService } from "../modules/six-jar-sync/index.js";
import { createSixJarSyncJob } from "../jobs/six-jar-sync.js";
import { createCronReminder } from "../jobs/cron-reminder.js";

export function createRuntime(env, now = () => new Date()) {
  const config = getConfig(env);
  const telegram = createTelegramPresenter(createTelegramAdapter(config));
  const notion = createNotionAdapter(config);
  const cache = createKvCacheAdapter(config.botState, { prefix: "report:" });
  const cashflowService = createCashflowService({ repository: createCashflowDataRepository({ notion, config }), cache, config, now });
  const fundBudgetService = createFundBudgetService({ repository: createBudgetDataRepository({ notion, config }), cache, calculator: createBudgetCalculator(evaluateFinanceLedger), config, now });
  const invalidateReports = async date => {
    await cashflowService.invalidate(date);
    await fundBudgetService.invalidate(date);
  };
  const incomeService = createIncomeGoalService({ repository: createIncomeDataRepository({ notion, config }), config, now, invalidateReports });
  const syncService = createSixJarSyncService({ repository: createSixJarRepository({ notion, databaseId: config.sixJarDb }) });
  const cashflow = createCashflowController({ service: cashflowService, telegram });
  const fundBudget = createFundBudgetController({ service: createBudgetDisplayService({ reportService: fundBudgetService, syncSixJar: syncService.sync }), telegram });
  const incomeGoal = createIncomeGoalController({ service: incomeService, telegram, config });
  const bot = createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal });
  const syncLatestSixJar = createSixJarSyncJob({ repository: fundBudgetService, syncSixJar: syncService.sync });
  const sendDailyReminder = createCronReminder({ getGoalStatus: incomeService.getGoalStatus, deliver: status => {
    const view = presentDailyReminder(status);
    return telegram.sendMessage(config.allowedUserId, view.text, view.replyMarkup);
  } });
  const repositories = { cashflow: cashflowService, fundBudget: fundBudgetService, incomeGoal: incomeService };
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
