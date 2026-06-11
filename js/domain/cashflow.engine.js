import { toNumber } from '../utils/numbers.js';

export const CASH_ITEM_KINDS = ['inflow', 'outflow', 'initial'];
export const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function getInitialBalance(items = []) {
  const initial = items.find((item) => item.kind === 'initial');
  return initial ? toNumber(initial.amount) : 0;
}

// Proyecta 12 meses de caja simulada: escenario activo como base (opcional) + movimientos manuales.
export function calculateCashFlowProjection({ scenarioResult = null, items = [], includeScenario = true } = {}) {
  const initialBalance = getInitialBalance(items);
  const movements = items.filter((item) => item.kind !== 'initial' && item.active !== false);
  const scenarioInflow = includeScenario && scenarioResult ? toNumber(scenarioResult.cashCollected) : 0;
  const scenarioOutflow = includeScenario && scenarioResult
    ? toNumber(scenarioResult.totalVariableCosts) + toNumber(scenarioResult.totalFixedCosts) + toNumber(scenarioResult.incomeTax)
    : 0;
  const months = [];
  let balance = initialBalance;
  for (let m = 1; m <= 12; m += 1) {
    const customIn = sumMovements(movements, 'inflow', m);
    const customOut = sumMovements(movements, 'outflow', m);
    const inflows = scenarioInflow + customIn;
    const outflows = scenarioOutflow + customOut;
    const startBalance = balance;
    balance = startBalance + inflows - outflows;
    months.push({
      month: m,
      label: MONTH_LABELS[m - 1],
      startBalance,
      inflows,
      outflows,
      scenarioInflow,
      scenarioOutflow,
      customIn,
      customOut,
      net: inflows - outflows,
      endBalance: balance,
    });
  }
  const negativeMonths = months.filter((month) => month.endBalance < 0);
  const minBalance = Math.min(initialBalance, ...months.map((month) => month.endBalance));
  return {
    initialBalance,
    months,
    quarters: aggregate(months, 3),
    years: aggregate(months, 12),
    endBalance: balance,
    totalInflows: months.reduce((sum, month) => sum + month.inflows, 0),
    totalOutflows: months.reduce((sum, month) => sum + month.outflows, 0),
    negativeMonths,
    firstNegativeMonth: negativeMonths[0] || null,
    minBalance,
  };
}

function sumMovements(movements, kind, month) {
  return movements
    .filter((item) => item.kind === kind && appliesToMonth(item, month))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
}

export function appliesToMonth(item, month) {
  if (item.frequency === 'once') return toNumber(item.month, 1) === month;
  const start = toNumber(item.startMonth, 1) || 1;
  const end = toNumber(item.endMonth, 12) || 12;
  return month >= start && month <= end;
}

function aggregate(months, size) {
  const groups = [];
  for (let i = 0; i < months.length; i += size) {
    const chunk = months.slice(i, i + size);
    groups.push({
      label: size === 12 ? 'Año completo' : `T${groups.length + 1}`,
      startBalance: chunk[0].startBalance,
      inflows: chunk.reduce((sum, month) => sum + month.inflows, 0),
      outflows: chunk.reduce((sum, month) => sum + month.outflows, 0),
      net: chunk.reduce((sum, month) => sum + month.net, 0),
      endBalance: chunk[chunk.length - 1].endBalance,
      hasNegative: chunk.some((month) => month.endBalance < 0),
    });
  }
  return groups;
}
