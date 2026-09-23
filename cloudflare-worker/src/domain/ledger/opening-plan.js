import { propertyText_, numericProperty_ } from "./rows.js";
import { normalizeSearchText_ } from "../finance/shared.js";

export function buildOpeningPlan_(accountRows = [], options = {}, rentReserveUsed) {
  const sourceAccountNames = options.sourceAccountNames || [];
  const sourceNameKeys = new Set(sourceAccountNames.map(normalizeSearchText_));
  const sourceAccounts = [];

  for (const accountRow of accountRows) {
    const props = accountRow.properties || {};
    const name = propertyText_(props["Phương Thức Thanh Toán"]);
    if (!sourceNameKeys.has(normalizeSearchText_(name))) continue;
    sourceAccounts.push({
      id: accountRow.id,
      name,
      opening: numericProperty_(props["Số Dư Ban Đầu"])
    });
  }

  const sourceTotal = sourceAccounts.reduce((total, account) => total + account.opening, 0);
  const rentReserveAmount = Number.isFinite(options.rentReserveAmount)
    ? options.rentReserveAmount
    : 0;
  const rentReserve = Number.isFinite(rentReserveUsed)
    ? Math.min(sourceTotal, rentReserveAmount, Math.max(rentReserveUsed, 0))
    : Math.min(sourceTotal, rentReserveAmount);
  const rentShortfall = Math.max(rentReserveAmount - sourceTotal, 0);
  const rolloverCarryover = Number.isFinite(options.rolloverCarryoverAmount)
    ? Math.max(options.rolloverCarryoverAmount, 0)
    : 0;
  const remainder = Math.max(sourceTotal - rentReserve, 0) + rolloverCarryover;
  const rolloverFundNames = options.rolloverFundNames || [];
  const equalShare = rolloverFundNames.length
    ? Math.floor(remainder / rolloverFundNames.length)
    : 0;
  const indivisibleRemainder = remainder - equalShare * rolloverFundNames.length;
  const allocations = rolloverFundNames.map((fund, index) => ({
    fund,
    amount: equalShare + (index === 0 ? indivisibleRemainder : 0)
  }));

  const plan = {
    sourceTotal,
    rentReserve,
    rentShortfall,
    remainder,
    sourceAccounts,
    allocations
  };
  if (rolloverCarryover > 0) plan.rolloverCarryover = rolloverCarryover;
  return plan;
}
