import {
  buildAccountSpendingData_,
  buildMonthlyCashflowData_,
  iso_
} from "./finance.js";

const MONTH_DATE_PROPERTY = "Ngày";
const INCOME_CATEGORY_PROPERTY = "Loại Khoản Thu";
const INCOME_AMOUNT_PROPERTY = "Số Tiền";
const INCOME_DATE_PROPERTY = "Ngày";
const GOAL_AMOUNT_PROPERTY = "Mục Tiêu Hàng Tháng";
const GOAL_CATEGORY = "Thu Nhập Ròng Grab (App)";
const TELEGRAM_UPDATE_ID_PROPERTY = "Telegram Update ID";

export class AmbiguousIncomeWriteError extends Error {
  constructor(updateId, { cause } = {}) {
    super(
      "Income write outcome is ambiguous and requires reconciliation",
      cause === undefined ? undefined : { cause }
    );
    this.name = "AmbiguousIncomeWriteError";
    this.code = "AMBIGUOUS_INCOME_WRITE";
    this.updateId = updateId;
  }
}

function validateFactoryDependencies({ notion, state, config, now }) {
  for (const method of ["queryDatabase", "createPage"]) {
    if (typeof notion?.[method] !== "function") {
      throw new TypeError(`Notion client must provide ${method}()`);
    }
  }
  for (const method of ["getReportCache", "putReportCache", "deleteReportCache"]) {
    if (typeof state?.[method] !== "function") {
      throw new TypeError(`State store must provide ${method}()`);
    }
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  for (const key of [
    "timezone",
    "accountDb",
    "incomeDb",
    "otherIncomeDb",
    "expenseDb",
    "goalDb",
    "otherIncomeCategoryDb",
    "budgetDb",
    "transferDb",
    "fundGroupDb",
    "goalRelationPageId"
  ]) {
    if (typeof config?.[key] !== "string" || config[key] === "") {
      throw new TypeError(`config.${key} must be a non-empty string`);
    }
  }
  if (!Number.isFinite(config.monthlyExpenseLimit)) {
    throw new TypeError("config.monthlyExpenseLimit must be a finite number");
  }
}

function createDateParts(now, dateFormatter) {
  const date = now();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("now must return a valid Date");
  }
  const parts = dateFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, Number(part.value)])
  );
  return { y: values.year, m: values.month, d: values.day };
}

function monthFilterFor(t) {
  return {
    and: [
      { property: MONTH_DATE_PROPERTY, date: { on_or_after: iso_(t.y, t.m, 1) } },
      { property: MONTH_DATE_PROPERTY, date: { on_or_before: iso_(t.y, t.m, t.d) } }
    ]
  };
}

function numericProperty(row, property) {
  const value = row?.properties?.[property]?.number;
  return Number.isFinite(value) ? value : 0;
}

function dateProperty(row, property) {
  return row?.properties?.[property]?.date?.start || "";
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function updateIdText(updateId) {
  if (updateId === null || updateId === undefined || String(updateId) === "") {
    throw new TypeError("updateId must stringify to a non-empty value");
  }
  return String(updateId);
}

export function createFinanceRepository({ notion, state, config, now = () => new Date() }) {
  validateFactoryDependencies({ notion, state, config, now });
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  async function getMonthlyCashflow(forceRefresh = false) {
    const t = createDateParts(now, dateFormatter);
    const todayISO = iso_(t.y, t.m, t.d);
    const cacheKey = `monthly-cashflow:${todayISO}`;
    if (!forceRefresh) {
      try {
        const cached = await state.getReportCache(cacheKey);
        if (cached !== null && cached !== undefined) return cached;
      } catch {
        // Cache is optional; a read failure must not block a live report.
      }
    }

    const filter = monthFilterFor(t);
    const [
      accountRows,
      incomeRows,
      otherIncomeRows,
      expenseRows,
      incomeCategoryRows,
      otherIncomeCategoryRows,
      expenseCategoryRows,
      transferRows
    ] = await Promise.all([
      notion.queryDatabase(config.accountDb),
      notion.queryDatabase(config.incomeDb, filter),
      notion.queryDatabase(config.otherIncomeDb, filter),
      notion.queryDatabase(config.expenseDb, filter),
      notion.queryDatabase(config.goalDb),
      notion.queryDatabase(config.otherIncomeCategoryDb),
      notion.queryDatabase(config.budgetDb),
      notion.queryDatabase(config.transferDb, filter)
    ]);
    const model = buildMonthlyCashflowData_(
      t,
      accountRows,
      incomeRows,
      otherIncomeRows,
      expenseRows,
      transferRows,
      incomeCategoryRows,
      otherIncomeCategoryRows,
      expenseCategoryRows,
      config.goalRelationPageId
    );
    try {
      await state.putReportCache(cacheKey, model, 60);
    } catch {
      // A live report remains valid when its optional cache write fails.
    }
    return model;
  }

  async function getFundBudgetReport() {
    const t = createDateParts(now, dateFormatter);
    const filter = monthFilterFor(t);
    const [categoryRows, expenseRows, accountRows, transferRows, fundGroupRows] = await Promise.all([
      notion.queryDatabase(config.budgetDb),
      notion.queryDatabase(config.expenseDb, filter),
      notion.queryDatabase(config.accountDb),
      notion.queryDatabase(config.transferDb, filter),
      notion.queryDatabase(config.fundGroupDb)
    ]);
    return buildAccountSpendingData_(
      t,
      categoryRows,
      expenseRows,
      accountRows,
      config.monthlyExpenseLimit,
      transferRows,
      fundGroupRows
    );
  }

  async function getGoalStatus() {
    const t = createDateParts(now, dateFormatter);
    const firstDay = iso_(t.y, t.m, 1);
    const todayISO = iso_(t.y, t.m, t.d);
    const incomeFilter = {
      and: [
        { property: MONTH_DATE_PROPERTY, date: { on_or_after: firstDay } },
        { property: MONTH_DATE_PROPERTY, date: { on_or_before: todayISO } },
        { property: INCOME_CATEGORY_PROPERTY, relation: { contains: config.goalRelationPageId } }
      ]
    };
    const [goalRows, incomeRows] = await Promise.all([
      notion.queryDatabase(config.goalDb, {
        property: INCOME_CATEGORY_PROPERTY,
        title: { equals: GOAL_CATEGORY }
      }),
      notion.queryDatabase(config.incomeDb, incomeFilter)
    ]);
    let goal = 0;
    for (const row of goalRows) {
      const value = row?.properties?.[GOAL_AMOUNT_PROPERTY]?.number;
      if (value !== null && value !== undefined) {
        goal = Number.isFinite(value) ? value : 0;
        break;
      }
    }
    const earnedMonth = incomeRows.reduce(
      (total, row) => total + numericProperty(row, INCOME_AMOUNT_PROPERTY),
      0
    );
    const earnedToday = incomeRows.reduce(
      (total, row) => total + (dateProperty(row, INCOME_DATE_PROPERTY) === todayISO
        ? numericProperty(row, INCOME_AMOUNT_PROPERTY)
        : 0),
      0
    );
    const earnedBefore = earnedMonth - earnedToday;
    const dim = daysInMonth(t.y, t.m);
    const baseDaily = goal / dim;
    const daysLeftInclToday = dim - t.d + 1;
    const remainingBefore = Math.max(goal - earnedBefore, 0);
    const todayTarget = daysLeftInclToday > 0 ? remainingBefore / daysLeftInclToday : 0;
    const todayMet = earnedToday >= todayTarget;
    const remaining = Math.max(goal - earnedMonth, 0);
    const requiredPerDay = daysLeftInclToday > 0 ? remaining / daysLeftInclToday : 0;
    const daysAfter = dim - t.d;
    const tomorrowTarget = daysAfter > 0 ? remaining / daysAfter : 0;

    return {
      t,
      goal,
      earnedMonth,
      earnedToday,
      baseDaily,
      todayTarget,
      todayMet,
      remaining,
      daysLeftIncludingToday: daysLeftInclToday,
      requiredPerDay,
      daysAfter,
      tomorrowTarget
    };
  }

  async function findGrabIncomeByUpdateId(updateId) {
    const rows = await notion.queryDatabase(config.incomeDb, {
      property: TELEGRAM_UPDATE_ID_PROPERTY,
      rich_text: { equals: updateIdText(updateId) }
    });
    return rows[0] ?? null;
  }

  async function addGrabIncome(updateId, dateISO, amount) {
    const normalizedUpdateId = updateIdText(updateId);
    if (typeof dateISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      throw new TypeError("dateISO must match YYYY-MM-DD");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TypeError("amount must be a finite number greater than zero");
    }

    const existingPage = await findGrabIncomeByUpdateId(normalizedUpdateId);
    if (existingPage !== null) {
      return { created: false, page: existingPage };
    }
    const properties = {
      "Tên Khoản Thu": { title: [{ text: { content: "Thu nhập Grab" } }] },
      "Số Tiền": { number: amount },
      "Ngày": { date: { start: dateISO } },
      "Loại Khoản Thu": { relation: [{ id: config.goalRelationPageId }] },
      "Telegram Update ID": { rich_text: [{ text: { content: normalizedUpdateId } }] }
    };
    let page;
    try {
      page = await notion.createPage(config.incomeDb, properties);
    } catch (cause) {
      throw new AmbiguousIncomeWriteError(updateId, { cause });
    }
    try {
      await state.deleteReportCache(`monthly-cashflow:${dateISO}`);
    } catch {
      // A successful Notion write must not be reported as failed due to cache invalidation.
    }
    return { created: true, page };
  }

  return {
    getGoalStatus,
    getMonthlyCashflow,
    getFundBudgetReport,
    findGrabIncomeByUpdateId,
    addGrabIncome
  };
}
