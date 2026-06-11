import { safeDivide } from '../utils/numbers.js';

export const PROFITABILITY_LEVEL = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

// Umbral sobre margen neto (despues de asignar costos fijos por participacion en ingresos).
const HIGH_NET_MARGIN = 0.15;

export function calculateServiceProfitability(scenarioResult) {
  if (!scenarioResult || !scenarioResult.rows?.length) {
    return { rows: [], totals: null };
  }
  const totalRevenue = scenarioResult.totalRevenue;
  const totalFixedCosts = scenarioResult.totalFixedCosts;
  const rows = scenarioResult.rows.map((row) => {
    const revenueSharePct = safeDivide(row.revenue, totalRevenue);
    const allocatedFixedCosts = totalFixedCosts * revenueSharePct;
    const estimatedProfit = row.contributionMargin - allocatedFixedCosts;
    const netMarginPct = safeDivide(estimatedProfit, row.revenue);
    return {
      serviceId: row.service.id,
      serviceName: row.service.name,
      revenue: row.revenue,
      revenueSharePct,
      variableCosts: row.variableCosts,
      contributionMargin: row.contributionMargin,
      grossMarginPct: row.contributionMarginPct,
      allocatedFixedCosts,
      estimatedProfit,
      netMarginPct,
      level: levelForNetMargin(netMarginPct),
      healthStatus: row.metrics.healthStatus,
    };
  });
  return {
    rows,
    totals: {
      revenue: totalRevenue,
      contributionMargin: scenarioResult.totalContributionMargin,
      fixedCosts: totalFixedCosts,
      estimatedProfit: rows.reduce((sum, r) => sum + r.estimatedProfit, 0),
      profitableCount: rows.filter((r) => r.level === PROFITABILITY_LEVEL.HIGH).length,
      losingCount: rows.filter((r) => r.estimatedProfit < 0).length,
    },
  };
}

export function sortProfitabilityRows(rows, sortKey) {
  const key = ({ profit: 'estimatedProfit', margin: 'netMarginPct', revenue: 'revenue' })[sortKey] || 'estimatedProfit';
  return [...rows].sort((a, b) => b[key] - a[key]);
}

function levelForNetMargin(netMarginPct) {
  if (netMarginPct >= HIGH_NET_MARGIN) return PROFITABILITY_LEVEL.HIGH;
  if (netMarginPct >= 0) return PROFITABILITY_LEVEL.MEDIUM;
  return PROFITABILITY_LEVEL.LOW;
}
