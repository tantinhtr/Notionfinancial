import { iso_ } from "./shared.js";
import { numericProperty, dateProperty, daysInMonth } from "./report-data.js";

const INCOME_AMOUNT_PROPERTY = "Số Tiền";
const INCOME_DATE_PROPERTY = "Ngày";
const GOAL_AMOUNT_PROPERTY = "Mục Tiêu Hàng Tháng";

export function buildGoalStatus_(t, goalRows, incomeRows) {
  const todayISO = iso_(t.y, t.m, t.d);
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
