import { allocateScenarioByTargetStudents, calculateScenario } from './financial.engine.js';
import { normalizeSettings, withServiceDefaults } from './financial.models.js';
import { safeDivide, toNumber } from '../utils/numbers.js';

export const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function buildDefaultAnnualBudget(year = new Date().getFullYear(), baseScenarioId = '') {
  return {
    year: toNumber(year, new Date().getFullYear()),
    name: `Presupuesto anual ${year}`,
    baseScenarioId: baseScenarioId || '',
    status: 'active',
  };
}

export function buildDefaultMonthlyPlan(year, monthIndex, scenarioId = '') {
  const normalizedMonth = Math.max(1, Math.min(12, toNumber(monthIndex, 1)));
  return {
    yearMonth: `${year}-${String(normalizedMonth).padStart(2, '0')}`,
    monthIndex: normalizedMonth,
    scenarioId: scenarioId || '',
    revenueMultiplier: 1,
    targetStudents: 0,
    serviceOverrides: {},
    extraIncomes: [],
    extraExpenses: [],
    notes: '',
  };
}

export function applyMonthlyOverridesToScenarioItems(monthPlan = {}, scenarioItems = []) {
  const multiplier = Math.max(0, toNumber(monthPlan.revenueMultiplier, 1));
  const overrides = monthPlan.serviceOverrides || {};
  return scenarioItems.map((item) => {
    const serviceOverride = overrides[item.serviceId] || {};
    const adjusted = { ...item };
    applyScaledField(adjusted, 'expectedClassesPerMonth', multiplier);
    applyScaledField(adjusted, 'expectedPackagesPerMonth', multiplier);
    applyScaledField(adjusted, 'expectedSubscribersPerMonth', multiplier);
    applyScaledField(adjusted, 'generatedClassesPerMonth', multiplier);
    applyScaledField(adjusted, 'generatedPackagesPerMonth', multiplier);
    applyScaledField(adjusted, 'generatedSubscribersPerMonth', multiplier);
    applyScaledField(adjusted, 'generatedStudents', multiplier);
    applyScaledField(adjusted, 'generatedRevenue', multiplier);
    Object.entries(serviceOverride).forEach(([key, value]) => {
      if (value !== '' && value != null) adjusted[key] = toNumber(value);
    });
    return adjusted;
  });
}

export function calculateMonthBudget({ budget, monthPlan, scenario, scenarioItems, services, fixedCosts, settings, cycleImpactsByMonth } = {}) {
  const config = normalizeSettings(settings);
  const year = budget?.year || new Date().getFullYear();
  const plan = { ...buildDefaultMonthlyPlan(year, monthPlan?.monthIndex || 1, scenario?.id || budget?.baseScenarioId || ''), ...monthPlan };
  const baseScenario = scenario || {};
  const scenarioForMonth = plan.targetStudents > 0 ? { ...baseScenario, targetStudents: plan.targetStudents } : baseScenario;
  const sourceItems = plan.targetStudents > 0 && baseScenario.autoDistributionEnabled === true && baseScenario.distributionMode === 'weighted_by_students'
    ? allocateScenarioByTargetStudents(scenarioForMonth, scenarioItems || [], services || [], config).rows.map((row) => ({ ...row.item, ...row.appliedItem }))
    : (scenarioItems || []);
  const adjustedItems = applyMonthlyOverridesToScenarioItems(plan, sourceItems);
  const calculated = calculateScenario(scenarioForMonth, adjustedItems, services || [], [], config);
  const cycleImpact = cycleImpactsByMonth?.get(plan.monthIndex) || emptyCycleImpact();
  const extraIncomes = sumEntries(plan.extraIncomes);
  const extraExpenses = sumEntries(plan.extraExpenses);
  const fixedCostsBudgeted = calculateBudgetedFixedCostsForMonth(fixedCosts || [], year, plan.monthIndex);
  const grossRevenue = calculated.grossRevenue + cycleImpact.operatingRevenue + extraIncomes;
  const cashCollected = calculated.cashCollected + cycleImpact.cashCollected + extraIncomes;
  const vatAmount = config.pricesIncludeVat
    ? grossRevenue - safeDivide(grossRevenue, 1 + config.vatPct)
    : grossRevenue * config.vatPct;
  const operatingRevenue = config.pricesIncludeVat ? grossRevenue - vatAmount : grossRevenue;
  const extraOperatingRevenue = config.pricesIncludeVat ? safeDivide(extraIncomes, 1 + config.vatPct) : extraIncomes;
  const totalVariableCosts = calculated.totalVariableCosts + cycleImpact.variableCosts;
  const totalWithholdingAmount = calculated.totalWithholdingAmount + cycleImpact.withholdingAmount;
  const operatingProfitBeforeIncomeTax = calculated.operatingProfitBeforeIncomeTax
    + extraOperatingRevenue
    + cycleImpact.operatingRevenue
    - cycleImpact.variableCosts
    + calculated.totalFixedCosts
    - fixedCostsBudgeted
    - extraExpenses;
  const incomeTax = Math.max(0, operatingProfitBeforeIncomeTax * config.incomeTaxPct);
  const netProfit = operatingProfitBeforeIncomeTax - incomeTax;
  const requiredProfit = operatingRevenue * config.targetProfitPct;
  const gapToTarget = netProfit - requiredProfit;
  return {
    budget,
    monthPlan: plan,
    scenario: baseScenario,
    scenarioResult: calculated,
    monthIndex: plan.monthIndex,
    monthName: MONTHS_ES[plan.monthIndex - 1],
    yearMonth: plan.yearMonth,
    grossRevenue,
    cashCollected,
    vatAmount,
    operatingRevenue,
    totalRevenue: operatingRevenue,
    totalAmountToCharge: config.pricesIncludeVat ? grossRevenue : grossRevenue + vatAmount,
    totalVariableCosts,
    totalWithholdingAmount,
    fixedCostsBudgeted,
    extraIncomes,
    extraExpenses,
    cycleImpact,
    baseScenarioOperatingRevenue: calculated.operatingRevenue,
    cycleOperatingRevenue: cycleImpact.operatingRevenue,
    baseScenarioCashCollected: calculated.cashCollected,
    cycleCashCollected: cycleImpact.cashCollected,
    totalClasses: calculated.totalClasses + cycleImpact.deliveredClasses,
    activeStudents: cycleImpact.activeStudents,
    activeGroups: cycleImpact.activeGroups,
    operatingProfitBeforeIncomeTax,
    incomeTax,
    netProfit,
    requiredProfit,
    gapToTarget,
    healthStatus: getMonthHealthStatus({ netProfit, gapToTarget, requiredProfit }),
  };
}

export function calculateAnnualBudget({ budget, monthPlans, cycles, scenarios, scenarioItemsByScenarioId, services, fixedCosts, settings } = {}) {
  const year = budget?.year || new Date().getFullYear();
  const baseScenarioId = budget?.baseScenarioId || scenarios?.[0]?.id || '';
  const plansByMonth = new Map((monthPlans || []).map((plan) => [toNumber(plan.monthIndex), plan]));
  const automaticCycles = buildAutomaticCyclesFromScenario({ budget, scenarios, scenarioItemsByScenarioId, services, settings });
  const allCycles = [...automaticCycles, ...(cycles || []).map((cycle) => ({ ...cycle, source: cycle.source || 'manual' }))];
  const cycleImpactsByMonth = calculateCycleImpactsByMonth(allCycles, services || [], settings || {});
  const serviceById = new Map((services || []).map((service) => [service.id, service]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const monthIndex = index + 1;
    const savedPlan = plansByMonth.get(monthIndex) || {};
    const plan = { ...buildDefaultMonthlyPlan(year, monthIndex, baseScenarioId), ...savedPlan, scenarioId: baseScenarioId };
    const scenarioId = baseScenarioId;
    const scenario = (scenarios || []).find((item) => item.id === scenarioId) || null;
    const scenarioItems = scenario ? removeFixedWindowPackageItems(scenarioItemsByScenarioId?.get(scenario.id) || [], serviceById) : [];
    return calculateMonthBudget({ budget, monthPlan: plan, scenario, scenarioItems, services, fixedCosts, settings, cycleImpactsByMonth });
  });
  const utilityBeforeAnnualTax = sum(months, 'operatingProfitBeforeIncomeTax');
  const annualIncomeTax = Math.max(0, utilityBeforeAnnualTax * normalizeSettings(settings).incomeTaxPct);
  const annualNetProfit = utilityBeforeAnnualTax - annualIncomeTax;
  return {
    budget,
    months,
    grossRevenue: sum(months, 'grossRevenue'),
    cashCollected: sum(months, 'cashCollected'),
    vatAmount: sum(months, 'vatAmount'),
    operatingRevenue: sum(months, 'operatingRevenue'),
    totalVariableCosts: sum(months, 'totalVariableCosts'),
    totalWithholdingAmount: sum(months, 'totalWithholdingAmount'),
    fixedCostsBudgeted: sum(months, 'fixedCostsBudgeted'),
    extraIncomes: sum(months, 'extraIncomes'),
    extraExpenses: sum(months, 'extraExpenses'),
    totalClasses: sum(months, 'totalClasses'),
    activeStudentsPeak: Math.max(...months.map((month) => month.activeStudents || 0), 0),
    cycles: allCycles,
    automaticCycles,
    cycleImpactsByMonth,
    baseScenarioOperatingRevenue: sum(months, 'baseScenarioOperatingRevenue'),
    cycleOperatingRevenue: sum(months, 'cycleOperatingRevenue'),
    baseScenarioCashCollected: sum(months, 'baseScenarioCashCollected'),
    cycleCashCollected: sum(months, 'cycleCashCollected'),
    operatingProfitBeforeIncomeTax: utilityBeforeAnnualTax,
    incomeTax: annualIncomeTax,
    netProfit: annualNetProfit,
    bestMonth: maxBy(months, 'netProfit'),
    worstMonth: minBy(months, 'netProfit'),
    lossMonths: months.filter((month) => month.netProfit < 0),
    belowTargetMonths: months.filter((month) => month.gapToTarget < 0),
  };
}

export function buildAutomaticCyclesFromScenario({ budget, scenarios, scenarioItemsByScenarioId, services, settings } = {}) {
  const baseScenarioId = budget?.baseScenarioId || scenarios?.[0]?.id || '';
  const scenario = (scenarios || []).find((item) => item.id === baseScenarioId);
  const serviceById = new Map((services || []).map((service) => [service.id, service]));
  const items = scenario ? (scenarioItemsByScenarioId?.get(scenario.id) || []) : [];
  return items.flatMap((item) => {
    if (item.active === false) return [];
    const base = serviceById.get(item.serviceId);
    if (!base || base.active === false) return [];
    const service = withServiceDefaults(base, settings);
    if (service.pricingModel !== 'package' || service.packageCycleMode !== 'fixed_window' || !service.cycleStartMonths.length) return [];
    const packagesSold = Math.max(0, toNumber(item.generatedPackagesPerMonth ?? item.expectedPackagesPerMonth));
    if (!packagesSold) return [];
    return service.cycleStartMonths.map((startMonth) => ({
      id: `auto-${service.id}-${startMonth}`,
      source: 'automatic',
      serviceId: service.id,
      serviceName: service.name,
      startMonth,
      durationMonths: service.packageDurationMonths,
      packagesSold,
      paymentMode: 'upfront',
      notes: `Generado desde ${scenario.name || 'escenario base'}`,
    }));
  });
}

export function buildDefaultCycle(service = {}, year = new Date().getFullYear()) {
  const s = withServiceDefaults(service, {});
  return {
    serviceId: service.id || '',
    serviceName: service.name || '',
    startMonth: s.cycleStartMonths?.[0] || 1,
    durationMonths: s.packageDurationMonths || 1,
    packagesSold: 0,
    paymentMode: 'upfront',
    notes: '',
    year,
  };
}

export function calculateCycleImpactsByMonth(cycles = [], services = [], settings = {}) {
  const impacts = new Map(Array.from({ length: 12 }, (_, index) => [index + 1, emptyCycleImpact()]));
  const serviceById = new Map(services.map((service) => [service.id, service]));
  cycles.forEach((cycle) => {
    const base = serviceById.get(cycle.serviceId);
    if (!base || base.active === false) return;
    const service = withServiceDefaults(base, settings);
    if (service.pricingModel !== 'package') return;
    const startMonth = Math.max(1, Math.min(12, toNumber(cycle.startMonth, 1)));
    const durationMonths = Math.max(1, toNumber(cycle.durationMonths, service.packageDurationMonths));
    const packagesSold = Math.max(0, toNumber(cycle.packagesSold));
    const paymentMode = 'upfront';
    const classesPerPackageMonth = service.classesPerMonthOverride != null ? service.classesPerMonthOverride : safeDivide(service.classesPerPackage, durationMonths);
    const activeStudents = service.chargeUnit === 'student' ? packagesSold : packagesSold * service.expectedStudentsPerGroup;
    const activeGroups = service.chargeUnit === 'group' ? packagesSold : Math.ceil(safeDivide(activeStudents, service.expectedStudentsPerGroup));
    const deliveredClasses = service.chargeUnit === 'group' ? packagesSold * classesPerPackageMonth : activeGroups * classesPerPackageMonth;
    const operatingRevenue = packagesSold * safeDivide(service.price, durationMonths);
    const monthlyCash = paymentMode === 'upfront' ? 0 : operatingRevenue;
    const upfrontCash = packagesSold * service.price;
    for (let offset = 0; offset < durationMonths; offset += 1) {
      const monthIndex = startMonth + offset;
      if (monthIndex < 1 || monthIndex > 12) continue;
      const impact = impacts.get(monthIndex) || emptyCycleImpact();
      const cashCollected = offset === 0 && paymentMode === 'upfront' ? upfrontCash : monthlyCash;
      const variableCosts = (deliveredClasses * service.teacherCostPerClass)
        + (deliveredClasses * service.transportCostPerClass)
        + (deliveredClasses * service.materialsCostPerClass)
        + (activeStudents * service.materialsCostPerStudent)
        + (deliveredClasses * service.otherVariableCostPerClass)
        + (operatingRevenue * (service.paymentFeePct + service.commissionPct));
      impact.operatingRevenue += operatingRevenue;
      impact.cashCollected += cashCollected;
      impact.variableCosts += variableCosts;
      impact.withholdingAmount += operatingRevenue * service.withholdingPct;
      impact.deliveredClasses += deliveredClasses;
      impact.activeStudents += activeStudents;
      impact.activeGroups += activeGroups;
      impact.cycles.push({ ...cycle, serviceName: cycle.serviceName || service.name });
    }
  });
  return impacts;
}

function emptyCycleImpact() {
  return { operatingRevenue: 0, cashCollected: 0, variableCosts: 0, withholdingAmount: 0, deliveredClasses: 0, activeStudents: 0, activeGroups: 0, cycles: [] };
}

function removeFixedWindowPackageItems(items = [], serviceById = new Map()) {
  return items.map((item) => {
    const service = serviceById.get(item.serviceId);
    if (!service || service.pricingModel !== 'package' || service.packageCycleMode !== 'fixed_window') return item;
    return {
      ...item,
      expectedPackagesPerMonth: 0,
      generatedPackagesPerMonth: 0,
      generatedClassesPerMonth: 0,
      generatedStudents: 0,
      generatedRevenue: 0,
    };
  });
}

function calculateBudgetedFixedCostsForMonth(fixedCosts, year, monthIndex) {
  return fixedCosts
    .filter((cost) => cost.active !== false)
    .reduce((sum, cost) => sum + fixedCostAmountForMonth(cost, year, monthIndex), 0);
}

function fixedCostAmountForMonth(cost, year, monthIndex) {
  const amount = toNumber(cost.amount);
  const startMonth = monthFromDate(cost.startDate);
  const endMonth = monthFromDate(cost.endDate);
  if (startMonth && monthIndex < startMonth) return 0;
  if (endMonth && monthIndex > endMonth) return 0;
  const periodicity = cost.periodicity || 'monthly';
  if (periodicity === 'monthly') return amount;
  if (periodicity === 'bimonthly') return monthIndex % 2 === 0 ? amount : 0;
  if (periodicity === 'quarterly') return monthIndex % 3 === 0 ? amount : 0;
  if (periodicity === 'semiannual') return monthIndex === 6 || monthIndex === 12 ? amount : 0;
  if (periodicity === 'annual') return monthIndex === (startMonth || 12) ? amount : 0;
  if (periodicity === 'one_time') return monthIndex === (startMonth || 1) ? amount : 0;
  return 0;
}

function monthFromDate(value) {
  if (!value) return null;
  const parts = String(value).split('-');
  const month = toNumber(parts[1]);
  return month >= 1 && month <= 12 ? month : null;
}

function sumEntries(entries = []) {
  return (entries || []).reduce((total, entry) => total + toNumber(entry.amount), 0);
}

function applyScaledField(target, key, multiplier) {
  if (target[key] != null && target[key] !== '') target[key] = toNumber(target[key]) * multiplier;
}

function getMonthHealthStatus(month) {
  if (month.netProfit < 0) return 'loss';
  if (month.gapToTarget < 0) return 'tight';
  if (month.gapToTarget > month.requiredProfit * 0.25) return 'strong';
  return 'healthy';
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

function maxBy(rows, key) {
  return [...rows].sort((a, b) => (b[key] || 0) - (a[key] || 0))[0] || null;
}

function minBy(rows, key) {
  return [...rows].sort((a, b) => (a[key] || 0) - (b[key] || 0))[0] || null;
}
