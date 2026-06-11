import { calculateScenario, PAYROLL_FIXED_COST_CATEGORY } from './financial.engine.js';
import { toNumber, safeDivide } from '../utils/numbers.js';

export const CLASSES_PER_STUDENT_PER_MONTH = 4;

export function monthlyCostForRole(role) {
  return toNumber(role.salary) * Math.max(1, toNumber(role.benefitsFactor, 1));
}

// Simula el escenario activo con los cargos hipoteticos incluidos como nomina fija adicional.
export function simulateHiring(input, roles = []) {
  const { scenario, scenarioItems, services, fixedCosts, settings } = input;
  const activeRoles = roles.filter((role) => role.active !== false);
  const base = calculateScenario(scenario, scenarioItems, services, fixedCosts, settings);
  const extraCosts = activeRoles.map((role) => ({
    name: `[Simulado] ${role.name}`,
    category: PAYROLL_FIXED_COST_CATEGORY,
    amount: monthlyCostForRole(role),
    periodicity: 'monthly',
    active: true,
  }));
  const simulated = calculateScenario(scenario, scenarioItems, services, [...fixedCosts, ...extraCosts], settings);
  const totalMonthlyCost = extraCosts.reduce((sum, cost) => sum + cost.amount, 0);
  return {
    base,
    simulated,
    roles: activeRoles.map((role) => ({
      role,
      monthlyCost: monthlyCostForRole(role),
      requirements: requirementsForCost(monthlyCostForRole(role), base),
    })),
    totalMonthlyCost,
    totalRequirements: requirementsForCost(totalMonthlyCost, base),
    profitDelta: simulated.netProfit - base.netProfit,
    breakEvenRevenueDelta: simulated.breakEvenRevenue != null && base.breakEvenRevenue != null
      ? simulated.breakEvenRevenue - base.breakEvenRevenue
      : null,
  };
}

// Cuanto volumen adicional hay que vender para pagar un costo fijo mensual dado,
// usando el margen de contribucion promedio del escenario base.
export function requirementsForCost(monthlyCost, baseResult) {
  const cmPerClass = baseResult.averageContributionMarginPerClass;
  const cmPct = baseResult.contributionMarginPct;
  if (!cmPerClass || cmPerClass <= 0) {
    return { viable: false, extraClasses: null, extraStudents: null, extraGroups: null, extraHours: null, extraRevenue: null };
  }
  const extraClasses = monthlyCost / cmPerClass;
  return {
    viable: true,
    extraClasses,
    extraStudents: extraClasses / CLASSES_PER_STUDENT_PER_MONTH,
    extraGroups: extraClasses / CLASSES_PER_STUDENT_PER_MONTH,
    extraHours: extraClasses,
    extraRevenue: cmPct > 0 ? safeDivide(monthlyCost, cmPct) : null,
  };
}
