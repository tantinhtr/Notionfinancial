import { propertyText_, numericProperty_ } from "./rows.js";
import { normalizeSearchText_ } from "../finance/shared.js";

export function buildOpeningPlan_(accountRows = [], options = {}) {
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
  const rolloverCarryover = Number.isFinite(options.rolloverCarryoverAmount)
    ? Math.max(options.rolloverCarryoverAmount, 0)
    : 0;
  const available = sourceTotal + rolloverCarryover;
  const rentReserve = Math.min(available, rentReserveAmount);
  const rentShortfall = Math.max(rentReserveAmount - available, 0);
  const remainder = available - rentReserve;
  const rolloverFundNames = options.rolloverFundNames || [];
  let allocations;
  const weights = options.rolloverFundWeights;
  if (weights && weights.length === rolloverFundNames.length) {
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    const amounts = weights.map((weight) => Math.floor(remainder * weight / totalWeight));
    const unallocated = remainder - amounts.reduce((total, amount) => total + amount, 0);
    const order = weights.map((weight, index) => ({
      index,
      fraction: (remainder * weight) % totalWeight
    })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < unallocated; i++) amounts[order[i].index]++;
    allocations = rolloverFundNames.map((fund, index) => ({ fund, amount: amounts[index] }));
  } else {
    const equalShare = rolloverFundNames.length
      ? Math.floor(remainder / rolloverFundNames.length)
      : 0;
    const indivisibleRemainder = remainder - equalShare * rolloverFundNames.length;
    allocations = rolloverFundNames.map((fund, index) => ({
      fund,
      amount: equalShare + (index === 0 ? indivisibleRemainder : 0)
    }));
  }

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
