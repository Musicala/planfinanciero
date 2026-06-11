import { calculateScenario, isPayrollFixedCost } from './financial.engine.js';
import { toNumber, safeDivide } from '../utils/numbers.js';

export const BREAK_EVEN_ZONE = {
  ABOVE: 'above',
  NEAR: 'near',
  BELOW: 'below',
};

// deltas: { pricePct, studentsPct, variableCostPct, payrollPct, fixedPct } como fracciones (0.10 = +10%).
export function simulateScenarioWithDeltas(input, deltas = {}) {
  const { scenario, scenarioItems, services, fixedCosts, settings } = input;
  const d = normalizeDeltas(deltas);
  const base = calculateScenario(scenario, scenarioItems, services, fixedCosts, settings);
  const simulated = calculateScenario(
    scenario,
    adjustItems(scenarioItems, d),
    adjustServices(services, d),
    adjustFixedCosts(fixedCosts, d),
    settings,
  );
  return { base, simulated, deltas: d, impact: describeImpact(base, simulated) };
}

export function getBreakEvenZone(result) {
  if (!result || result.breakEvenRevenue == null) return BREAK_EVEN_ZONE.BELOW;
  const ratio = safeDivide(result.totalRevenue, result.breakEvenRevenue);
  if (ratio >= 1.1) return BREAK_EVEN_ZONE.ABOVE;
  if (ratio >= 0.9) return BREAK_EVEN_ZONE.NEAR;
  return BREAK_EVEN_ZONE.BELOW;
}

export function describeImpact(base, simulated) {
  const messages = [];
  const profitDelta = simulated.netProfit - base.netProfit;
  const profitPct = base.netProfit !== 0 ? profitDelta / Math.abs(base.netProfit) : null;
  if (Math.round(profitDelta) !== 0) {
    const direction = profitDelta > 0 ? 'aumenta' : 'reduce';
    const pctText = profitPct != null && Number.isFinite(profitPct) ? ` (${profitDelta > 0 ? '+' : ''}${Math.round(profitPct * 100)}%)` : '';
    messages.push({ tone: profitDelta > 0 ? 'good' : 'bad', text: `Esta decision ${direction} la utilidad proyectada${pctText}.` });
  }
  if (base.netProfit >= 0 && simulated.netProfit < 0) {
    messages.push({ tone: 'bad', text: 'Con estos cambios el escenario entra en perdida.' });
  }
  if (base.netProfit < 0 && simulated.netProfit >= 0) {
    messages.push({ tone: 'good', text: 'Con estos cambios el escenario pasa de perdida a utilidad.' });
  }
  const baseZone = getBreakEvenZone(base);
  const simZone = getBreakEvenZone(simulated);
  if (baseZone !== simZone) {
    if (simZone === BREAK_EVEN_ZONE.BELOW) messages.push({ tone: 'bad', text: 'Esta decision deja los ingresos por debajo del punto de equilibrio.' });
    if (simZone === BREAK_EVEN_ZONE.ABOVE && baseZone !== BREAK_EVEN_ZONE.ABOVE) messages.push({ tone: 'good', text: 'Esta decision deja el escenario comodamente por encima del equilibrio.' });
  }
  const marginDelta = simulated.contributionMarginPct - base.contributionMarginPct;
  if (marginDelta < -0.03) messages.push({ tone: 'warn', text: 'El margen de contribucion se deteriora: el riesgo financiero aumenta.' });
  return { profitDelta, profitPct, messages };
}

function normalizeDeltas(deltas) {
  return {
    pricePct: toNumber(deltas.pricePct),
    studentsPct: toNumber(deltas.studentsPct),
    variableCostPct: toNumber(deltas.variableCostPct),
    payrollPct: toNumber(deltas.payrollPct),
    fixedPct: toNumber(deltas.fixedPct),
  };
}

function adjustServices(services, d) {
  if (!d.pricePct && !d.variableCostPct) return services;
  const priceFactor = 1 + d.pricePct;
  const costFactor = 1 + d.variableCostPct;
  return services.map((service) => ({
    ...service,
    price: toNumber(service.price) * priceFactor,
    teacherCostPerClass: toNumber(service.teacherCostPerClass) * costFactor,
    materialsCostPerStudent: toNumber(service.materialsCostPerStudent) * costFactor,
    materialsCostPerClass: toNumber(service.materialsCostPerClass) * costFactor,
    transportCostPerClass: toNumber(service.transportCostPerClass) * costFactor,
    otherVariableCostPerClass: toNumber(service.otherVariableCostPerClass) * costFactor,
    variableCostPerSubscriber: toNumber(service.variableCostPerSubscriber) * costFactor,
  }));
}

function adjustItems(scenarioItems, d) {
  if (!d.studentsPct && !d.pricePct) return scenarioItems;
  const volumeFactor = 1 + d.studentsPct;
  const priceFactor = 1 + d.pricePct;
  const scaleVolume = (value) => (value == null || value === '' ? value : toNumber(value) * volumeFactor);
  return scenarioItems.map((item) => ({
    ...item,
    expectedClassesPerMonth: scaleVolume(item.expectedClassesPerMonth),
    expectedPackagesPerMonth: scaleVolume(item.expectedPackagesPerMonth),
    expectedSubscribersPerMonth: scaleVolume(item.expectedSubscribersPerMonth),
    generatedStudents: scaleVolume(item.generatedStudents),
    generatedPackagesPerMonth: scaleVolume(item.generatedPackagesPerMonth),
    generatedSubscribersPerMonth: scaleVolume(item.generatedSubscribersPerMonth),
    generatedClassesPerMonth: scaleVolume(item.generatedClassesPerMonth),
    generatedRevenue: item.generatedRevenue == null ? item.generatedRevenue : toNumber(item.generatedRevenue) * volumeFactor * priceFactor,
    customPrice: item.customPrice == null || item.customPrice === '' ? item.customPrice : toNumber(item.customPrice) * priceFactor,
  }));
}

function adjustFixedCosts(fixedCosts, d) {
  if (!d.payrollPct && !d.fixedPct) return fixedCosts;
  return fixedCosts.map((cost) => {
    const factor = isPayrollFixedCost(cost) ? 1 + d.payrollPct : 1 + d.fixedPct;
    return { ...cost, amount: toNumber(cost.amount) * factor };
  });
}
