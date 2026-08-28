import test from "node:test";
import assert from "node:assert/strict";
import { createBot } from "../src/bot.js";

const FALLBACK_TEXT = "Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.";
const HOME_KEYBOARD = {
  inline_keyboard: [[{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]]
};
const NOW = new Date("2026-07-29T03:15:00.000Z");

function cashflowFixture() {
  return {
    t: { y: 2026, m: 7, d: 29 },
    unknownAccount: {
      moneyIn: { count: 0, total: 0 },
      moneyOut: { count: 0, total: 0 }
    },
    accounts: [{
      token: "cash",
      name: "Grap Tiền Mặt",
      currentBalance: 2500000,
      moneyIn: {
        total: 700000,
        categories: [{
          token: "in-grab",
          name: "Grab - Tiền Về Ví",
          total: 700000,
          rows: [{
            name: "Grab về ví 28/7",
            amount: 700000,
            date: "2026-07-28",
            note: ""
          }]
        }]
      },
      moneyOut: {
        total: 2200000,
        categories: [{
          token: "out-rent",
          name: "Nhà Trọ",
          total: 2000000,
          rows: [{
            name: "Tiền phòng tháng 7",
            amount: 2000000,
            date: "2026-07-01",
            note: ""
          }]
        }, {
          token: "out-market",
          name: "Đi Chợ",
          total: 200000,
          rows: [{
            name: "Siêu thị cuối tuần",
            amount: 200000,
            date: "2026-07-26",
            note: ""
          }]
        }]
      },
      transfersIn: 0,
      transfersOut: 0
    }]
  };
}

function fundFixture() {
  return {
    t: { y: 2026, m: 7, d: 29 },
    fundGroups: [{
      name: "Thiết Yếu",
      budget: 2400000,
      spent: 2277400,
      over: 0,
      allocated: 2400000,
      transferNeeded: 0,
      requiresAllocation: true,
      unmatchedCategories: []
    }]
  };
}

function goalFixture(overrides = {}) {
  return {
    t: { y: 2026, m: 7, d: 29 },
    goal: 12000000,
    earnedMonth: 6000000,
    earnedToday: 300000,
    baseDaily: 387096.774,
    todayTarget: 500000,
    todayMet: false,
    remaining: 6000000,
    daysAfter: 2,
    tomorrowTarget: 3000000,
    ...overrides
  };
}

function messageUpdate(updateId, text, userId = 42, key = "message") {
  return {
    update_id: updateId,
    [key]: {
      text,
      from: { id: userId },
      chat: { id: 9001 }
    }
  };
}

function callbackUpdate(updateId, data, userId = 42) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      data,
      from: { id: userId },
      message: { chat: { id: 9001 } }
    }
  };
}

function createHarness({
  telegram: telegramOverrides = {},
  repository: repositoryOverrides = {},
  config: configOverrides = {},
  now = () => new Date(NOW)
} = {}) {
  const events = [];
  const sent = [];
  const repository = {
    async getMonthlyCashflow(forceRefresh = false) {
      events.push(["monthly", forceRefresh]);
      return structuredClone(cashflowFixture());
    },
    async getFundBudgetReport() {
      events.push(["fund"]);
      return structuredClone(fundFixture());
    },
    async getGoalStatus() {
      events.push(["goal"]);
      return structuredClone(goalFixture());
    },
    async addGrabIncome(updateId, dateISO, amount) {
      events.push(["addIncome", updateId, dateISO, amount]);
      return { created: true, page: { id: "income-page" } };
    },
    async findGrabIncomeByUpdateId() {
      return null;
    },
    ...repositoryOverrides
  };
  const telegram = {
    async answerCallbackQuery(callbackQueryId) {
      events.push(["ack", callbackQueryId]);
      return true;
    },
    async sendMessage(chatId, text, replyMarkup) {
      const message = { chatId, text };
      if (replyMarkup !== undefined) message.replyMarkup = structuredClone(replyMarkup);
      sent.push(message);
      events.push(["send", chatId]);
      return { message_id: sent.length };
    },
    ...telegramOverrides
  };
  const config = {
    allowedUserId: 42,
    timezone: "Asia/Ho_Chi_Minh",
    ...configOverrides
  };
  return {
    bot: createBot({ telegram, repository, config, now }),
    events,
    sent,
    repository,
    telegram
  };
}

test("/thang falls back while /chi is no longer a command", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(130, "/thang"));
  await harness.bot.processUpdate(messageUpdate(131, "/chi"));

  assert.deepEqual(harness.sent, [
    { chatId: 9001, text: FALLBACK_TEXT },
    { chatId: 9001, text: FALLBACK_TEXT }
  ]);
  assert.equal(harness.events.some(([name]) => name === "monthly"), false);
});

test("cash_refresh rerenders Level 1 with a forced reload after callback acknowledgment", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(132, "cash_refresh"));

  assert.deepEqual(harness.events.slice(0, 2), [
    ["ack", "callback-132"],
    ["monthly", true]
  ]);
  assert.equal(harness.sent[0].text, "📊 Dòng tiền tháng 7/2026");
});

test("cash_home rerenders Level 1 from the monthly cashflow cache", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(133, "cash_home"));

  assert.deepEqual(harness.events.slice(0, 2), [
    ["ack", "callback-133"],
    ["monthly", false]
  ]);
});

test("keeps fund report separate from Level 1 monthly cashflow", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(136, "show_funds"));

  assert.deepEqual(harness.events.slice(0, 2), [
    ["ack", "callback-136"],
    ["fund"]
  ]);
  assert.match(harness.sent[0].text, /Thiết Yếu: 2\.277\.400đ \/ 2\.400\.000đ/);
  assert.deepEqual(
    harness.sent[0].replyMarkup.inline_keyboard.flat().map((button) => button.callback_data),
    ["cash_home"]
  );
});

test("cash_direction callback routes to direction handling before account handling", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(138, "cash_direction:cash:out"));

  assert.deepEqual(harness.events.slice(0, 2), [
    ["ack", "callback-138"],
    ["monthly", false]
  ]);
  assert.equal(harness.sent[0].text, "💸 Grap Tiền Mặt — Tổng Chi");
});

test("cash_direction callback renders the selected direction from the cached model", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(139, "cash_direction:cash:in"));

  assert.deepEqual(harness.sent[0], {
    chatId: 9001,
    text: "📥 Grap Tiền Mặt — Tổng Thu",
    replyMarkup: {
      inline_keyboard: [
        [{
          text: "Grab - Tiền Về Ví · 700.000đ",
          callback_data: "cash_cat:cash:in:in-grab"
        }],
        [{ text: "⬅️ Grap Tiền Mặt", callback_data: "cash_account:cash" }],
        [{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]
      ]
    }
  });
});

test("zero-total cash_direction sends one heading with no categories and safe navigation", async () => {
  const data = cashflowFixture();
  data.accounts[0].moneyIn = { total: 0, categories: [] };
  const harness = createHarness({
    repository: {
      async getMonthlyCashflow(forceRefresh) {
        harness.events.push(["monthly", forceRefresh]);
        return structuredClone(data);
      }
    }
  });

  await harness.bot.processUpdate(callbackUpdate(182, "cash_direction:cash:in"));

  assert.equal(harness.sent[0].text, "📥 Grap Tiền Mặt — Tổng Thu");
  assert.deepEqual(harness.sent[0].replyMarkup.inline_keyboard.flat(), [
    { text: "⬅️ Grap Tiền Mặt", callback_data: "cash_account:cash" },
    { text: "🏠 Các tài khoản", callback_data: "cash_home" }
  ]);
});

test("cash_direction callbacks reject invalid and stale directions with safe home navigation", async () => {
  let loads = 0;
  const harness = createHarness({
    repository: {
      async getMonthlyCashflow() {
        loads += 1;
        return structuredClone(cashflowFixture());
      }
    }
  });

  await harness.bot.processUpdate(callbackUpdate(140, "cash_direction:cash:sideways"));
  await harness.bot.processUpdate(callbackUpdate(141, "cash_direction:missing:in"));

  assert.equal(loads, 1);
  for (const message of harness.sent) {
    assert.equal(
      message.text,
      "Hướng dòng tiền không còn tồn tại trong dữ liệu tháng này."
    );
    assert.deepEqual(message.replyMarkup, HOME_KEYBOARD);
  }
});

test("level 3 detail navigation returns to the selected direction and cash home", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(135, "cash_cat:cash:out:out-market"));

  assert.match(harness.sent[0].text, /Đi Chợ: 200\.000đ/);
  assert.deepEqual(harness.sent[0].replyMarkup, {
    inline_keyboard: [
      [{ text: "⬅️ Tổng Chi", callback_data: "cash_direction:cash:out" }],
      [{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]
    ]
  });
});

test("level 3 callback rejects an invalid direction before loading data", async () => {
  let loads = 0;
  const harness = createHarness({
    repository: {
      async getMonthlyCashflow() {
        loads += 1;
        return structuredClone(cashflowFixture());
      }
    }
  });

  await harness.bot.processUpdate(callbackUpdate(136, "cash_cat:cash:sideways:out-market"));

  assert.equal(loads, 0);
  assert.equal(
    harness.sent[0].text,
    "Loại giao dịch không còn tồn tại trong dữ liệu tháng này."
  );
  assert.deepEqual(harness.sent[0].replyMarkup, HOME_KEYBOARD);
});

test("level 3 callback rejects stale account and category tokens", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(137, "cash_cat:missing:in:in-grab"));
  await harness.bot.processUpdate(callbackUpdate(138, "cash_cat:cash:in:stale-category"));

  assert.equal(harness.sent.length, 2);
  assert.ok(harness.sent.every((message) => (
    message.text === "Loại giao dịch không còn tồn tại trong dữ liệu tháng này."
  )));
  assert.deepEqual(harness.sent[0].replyMarkup, HOME_KEYBOARD);
  assert.deepEqual(harness.sent[1].replyMarkup, {
    inline_keyboard: [
      [{ text: "⬅️ Tổng Thu", callback_data: "cash_direction:cash:in" }],
      [{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]
    ]
  });
});

test("cash_account callback uses the cached monthly model and renders Level 2", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(143, "cash_account:cash"));

  assert.deepEqual(harness.events.slice(0, 2), [
    ["ack", "callback-143"],
    ["monthly", false]
  ]);
  assert.equal(harness.sent[0].text, "💳 Grap Tiền Mặt — tháng 7/2026");
  assert.deepEqual(
    harness.sent[0].replyMarkup.inline_keyboard.flat().map((button) => button.callback_data),
    ["cash_direction:cash:in", "cash_direction:cash:out", "cash_home"]
  );
});

test("cash_account callback reports a missing account with cash-home navigation", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(callbackUpdate(144, "cash_account:missing"));

  assert.equal(
    harness.sent[0].text,
    "Tài khoản không còn tồn tại trong dữ liệu tháng này."
  );
  assert.deepEqual(harness.sent[0].replyMarkup, {
    inline_keyboard: [[{ text: "⬅️ Các tài khoản", callback_data: "cash_home" }]]
  });
});

test("/start opens the cached monthly cashflow report", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(125, "/start"));

  assert.deepEqual(harness.events.slice(0, 2), [
    ["monthly", false],
    ["send", 9001]
  ]);
  assert.equal(harness.sent.length, 1);
});

test("start handling delegates once and never sends removed help text", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(126, "/start@finance_bot"));

  assert.equal(harness.events.filter(([name]) => name === "monthly").length, 1);
  assert.equal(harness.sent.length, 1);
  assert.doesNotMatch(harness.sent[0].text, /\/thang|tiền vào|tiền ra/i);
});

test("goal home and generic legacy callback fallback route to cached Level 1 once", async () => {
  for (const [index, callbackData] of ["show_home", "legacy_unknown_callback"].entries()) {
    const harness = createHarness();

    await harness.bot.processUpdate(callbackUpdate(180 + index, callbackData));

    assert.equal(harness.events.filter(([name]) => name === "monthly").length, 1);
    assert.equal(harness.sent[0].text, "📊 Dòng tiền tháng 7/2026");
  }
});

test("callback error fallback exposes only current account-overview navigation", async () => {
  const harness = createHarness({
    repository: {
      async getGoalStatus() {
        throw new Error("goal unavailable");
      }
    }
  });

  await harness.bot.processUpdate(callbackUpdate(183, "show_goal"));

  assert.deepEqual(harness.sent, [{
    chatId: 9001,
    text: "Lỗi: goal unavailable",
    replyMarkup: HOME_KEYBOARD
  }]);
});

test("legacy account callbacks return to Level 1 without opening duplicate drill-down", async () => {
  for (const callbackData of [
    "show_accounts",
    "refresh_accounts",
    "show_unusual",
    "spend_account:abcdef12",
    "spend_category:abcdef12:12345678"
  ]) {
    const harness = createHarness({
      repository: {
        async getFundBudgetReport() {
          throw new Error("legacy account report must not load");
        }
      }
    });

    await harness.bot.processUpdate(callbackUpdate(200, callbackData));

    assert.equal(harness.events.filter(([name]) => name === "monthly").length, 1);
    assert.equal(
      harness.sent[0].replyMarkup.inline_keyboard.flat()
        .some((button) => button.callback_data.startsWith("spend_")),
      false
    );
  }
});

test("legacy month callbacks are acknowledged and return cached Level 1 navigation", async () => {
  for (const [index, callbackData] of ["show_month", "refresh_month"].entries()) {
    const harness = createHarness();

    await harness.bot.processUpdate(callbackUpdate(220 + index, callbackData));

    assert.deepEqual(harness.events.slice(0, 2), [
      ["ack", `callback-${220 + index}`],
      ["monthly", false]
    ]);
    assert.equal(
      harness.sent[0].replyMarkup.inline_keyboard.at(-1)[0].callback_data,
      "show_funds"
    );
  }
});

test("Telegram sendMessage rejection propagates to the coordinator boundary", async () => {
  const harness = createHarness({
    telegram: {
      async sendMessage() {
        throw new Error("Telegram sendMessage failed: HTTP 429");
      }
    }
  });

  await assert.rejects(
    () => harness.bot.processUpdate(messageUpdate(230, "/start")),
    /HTTP 429/
  );
});

test("/thang never invokes the removed legacy monthly summary", async () => {
  const harness = createHarness({
    repository: {
      async getMonthlyCashflow() {
        throw new Error("removed /thang report must not load");
      },
      async getFundBudgetReport() {
        throw new Error("removed /thang spending summary must not load");
      }
    }
  });

  await harness.bot.processUpdate(messageUpdate(231, "/thang"));

  assert.deepEqual(harness.sent, [{ chatId: 9001, text: FALLBACK_TEXT }]);
});

test("unauthorized messages and callbacks expose no data while callbacks are acknowledged", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(240, "/start", 7));
  await harness.bot.processUpdate(callbackUpdate(241, "cash_home", 7));

  assert.deepEqual(harness.events, [["ack", "callback-241"]]);
  assert.deepEqual(harness.sent, []);
});

test("a failed callback acknowledgment must not swallow the report", async () => {
  const harness = createHarness({
    telegram: {
      async answerCallbackQuery() {
        throw new Error("Telegram answerCallbackQuery failed: HTTP 400");
      }
    }
  });

  await harness.bot.processUpdate(callbackUpdate(243, "cash_home"));

  // Tat nut xoay hong khong duoc lam nguoi dung mat luon bao cao.
  const sent = harness.events.filter(([kind]) => kind === "send");
  assert.equal(sent.length, 1);
});

test("callback acknowledgment completes before any repository query", async () => {
  let releaseAck;
  const ackFinished = new Promise((resolve) => {
    releaseAck = resolve;
  });
  let repositoryStarted = false;
  const harness = createHarness({
    telegram: {
      async answerCallbackQuery(callbackQueryId) {
        harness.events.push(["ack-start", callbackQueryId]);
        await ackFinished;
        harness.events.push(["ack-finish", callbackQueryId]);
      }
    },
    repository: {
      async getMonthlyCashflow() {
        repositoryStarted = true;
        harness.events.push(["monthly", false]);
        return structuredClone(cashflowFixture());
      }
    }
  });

  const processing = harness.bot.processUpdate(callbackUpdate(242, "cash_home"));
  await Promise.resolve();
  assert.equal(repositoryStarted, false);

  releaseAck();
  await processing;

  assert.deepEqual(harness.events.slice(0, 3), [
    ["ack-start", "callback-242"],
    ["ack-finish", "callback-242"],
    ["monthly", false]
  ]);
});

test("numeric Grab income writes exact update ID, local date, and amount before confirmation", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(250, "650.000"));

  assert.deepEqual(harness.events.slice(0, 3), [
    ["addIncome", 250, "2026-07-29", 650000],
    ["goal"],
    ["send", 9001]
  ]);
  assert.match(harness.sent[0].text, /^Đã ghi 650\.000đ cho hôm nay ✅/);
});

test("reconciled Grab income completes confirmation without creating again", async () => {
  let createCalls = 0;
  const harness = createHarness({
    repository: {
      async addGrabIncome() {
        createCalls += 1;
        throw new Error("reconciled completion must not create");
      }
    }
  });
  const telegramUpdate = messageUpdate(2501, "650.000");

  await harness.bot.completeReconciledIncome(telegramUpdate);

  assert.equal(createCalls, 0);
  assert.deepEqual(harness.events, [
    ["goal"],
    ["send", 9001]
  ]);
  assert.match(harness.sent[0].text, /^Đã ghi 650\.000đ cho hôm nay ✅/);
});

test("unknown text receives only the concise numeric-income fallback", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(251, "xem báo cáo"));

  assert.deepEqual(harness.sent, [{ chatId: 9001, text: FALLBACK_TEXT }]);
  assert.deepEqual(harness.events, [["send", 9001]]);
});

test("/muctieu opens the exact Grab income target report", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(252, "/muctieu"));

  assert.match(
    harness.sent[0].text,
    /^📅 Mục tiêu Thu Nhập Ròng Grab \(App\) — tháng 7\/2026/
  );
  assert.deepEqual(
    harness.sent[0].replyMarkup.inline_keyboard.flat().map((button) => button.callback_data),
    ["cash_home", "show_funds", "show_home"]
  );
});

test("edited numeric messages use the same authorized income path", async () => {
  const harness = createHarness();

  await harness.bot.processUpdate(messageUpdate(253, "120,000", 42, "edited_message"));

  assert.deepEqual(harness.events[0], ["addIncome", 253, "2026-07-29", 120000]);
});

test("daily reminder text covers met, partial, and no-income states", async () => {
  const scenarios = [{
    status: goalFixture({ earnedToday: 600000, todayTarget: 500000, todayMet: true }),
    heading: "🎉 Hôm nay đã đạt chỉ tiêu! Kiếm được 600.000đ."
  }, {
    status: goalFixture({ earnedToday: 300000, todayTarget: 500000, todayMet: false }),
    heading: "💪 Hôm nay kiếm 300.000đ, còn thiếu 200.000đ."
  }, {
    status: goalFixture({ earnedToday: 0, todayTarget: 500000, todayMet: false }),
    heading: "📌 Hôm nay chưa ghi thu nhập nào. Nhắn số tiền để cập nhật nhé!"
  }];

  for (const scenario of scenarios) {
    const harness = createHarness({
      repository: {
        async getGoalStatus() {
          return structuredClone(scenario.status);
        }
      }
    });

    await harness.bot.sendDailyReminder();

    assert.equal(harness.sent[0].chatId, 42);
    assert.equal(harness.sent[0].text.split("\n\n")[0], scenario.heading);
    assert.match(harness.sent[0].text, /Mục tiêu Thu Nhập Ròng Grab \(App\)/);
  }
});
