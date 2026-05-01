import { PERIODICITY_DIVISORS, SCENARIO_HEALTH, SERVICE_HEALTH } from './financial.constants.js';
import { validateScenario, validateService } from './financial.validators.js';
import { withServiceDefaults, normalizeSettings } from './financial.models.js';
import { safeDivide, toNumber } from '../utils/numbers.js';

export { validateScenario, validateService };

export const PAYROLL_FIXED_COST_CATEGORY = 'Nómina / Equipo base';
export const OTHER_FIXED_COST_CATEGORY = 'Otros';

export function calculateServiceMetrics(service, overrides = {}, settings = {}) {
  const s = withServiceDefaults({ ...service, ...removeNullish(overrides) }, settings);
  if (s.pricingModel === 'monthly_subscription') return calculateSubscriptionMetrics(s);
  const expectedStudents = toNumber(overrides.expectedStudentsPerClass ?? s.expectedStudentsPerGroup, s.expectedStudentsPerGroup);
  const classesPerPackage = s.pricingModel === 'package' ? Math.max(1, s.classesPerPackage) : Math.max(1, s.classesPerPackage);
  const packageDurationMonths = s.pricingModel === 'package' ? Math.max(1, s.packageDurationMonths) : 1;
  const classesPerPackageMonth = s.classesPerMonthOverride != null ? Math.max(0, s.classesPerMonthOverride) : safeDivide(classesPerPackage, packageDurationMonths);
  const revenuePerPackage = s.pricingModel === 'package' ? s.price : 0;
  const recognizedRevenuePerPackageMonth = s.pricingModel === 'package' ? safeDivide(revenuePerPackage, packageDurationMonths) : 0;
  let revenuePerClass = 0;
  if (s.pricingModel === 'per_student') revenuePerClass = s.price * expectedStudents;
  if (s.pricingModel === 'per_class') revenuePerClass = s.price;
  if (s.pricingModel === 'package') {
    const expectedPackagesPerGroup = s.chargeUnit === 'group' ? 1 : expectedStudents;
    revenuePerClass = safeDivide(recognizedRevenuePerPackageMonth * expectedPackagesPerGroup, classesPerPackageMonth);
  }

  const paymentFeeAmountPerClass = revenuePerClass * s.paymentFeePct;
  const commissionAmountPerClass = revenuePerClass * s.commissionPct;
  const withholdingAmountPerClass = revenuePerClass * s.withholdingPct;
  const feesPerClass = paymentFeeAmountPerClass + commissionAmountPerClass;
  const variableCostPerClass = s.teacherCostPerClass + s.materialsCostPerClass + (s.materialsCostPerStudent * expectedStudents) + s.transportCostPerClass + s.otherVariableCostPerClass + feesPerClass;
  const contributionMarginPerClass = revenuePerClass - variableCostPerClass;
  const contributionMarginPct = safeDivide(contributionMarginPerClass, revenuePerClass);
  const variableCostPerPackage = variableCostPerClass * classesPerPackage;
  const contributionMarginPerPackage = contributionMarginPerClass * classesPerPackage;
  const contributionMarginPerStudent = safeDivide(contributionMarginPerClass, expectedStudents);
  const alerts = validateService({ ...s, expectedStudentsPerGroup: expectedStudents });
  if (contributionMarginPerClass <= 0) alerts.push('El margen de contribucion es negativo.');
  if (contributionMarginPct < 0.15) alerts.push('El margen de contribucion esta por debajo del 15%.');
  if (s.teacherPaymentStrategy === 'per_service' && s.teacherCostPerClass > revenuePerClass) alerts.push('El pago docente supera el ingreso por clase.');
  return {
    revenuePerClass,
    revenuePerPackage,
    paymentFeeAmountPerClass,
    commissionAmountPerClass,
    withholdingAmountPerClass,
    variableCostPerClass,
    variableCostPerPackage,
    contributionMarginPerClass,
    contributionMarginPerPackage,
    contributionMarginPct,
    contributionMarginPerStudent,
    breakEvenUnitsIfOnlyThisService: null,
    healthStatus: getServiceHealthStatus({ contributionMarginPerClass, contributionMarginPct }),
    alerts,
    pricingModel: s.pricingModel,
    chargeUnit: s.chargeUnit,
    rawTeacherCostPerClass: s.rawTeacherCostPerClass,
    teacherCostPerClass: s.teacherCostPerClass,
    teacherPaymentStrategy: s.teacherPaymentStrategy,
    expectedStudentsPerGroup: expectedStudents,
    classesPerPackage,
    packageDurationMonths,
    classesPerPackageMonth,
    recognizedRevenuePerPackageMonth,
    cashCollectionMode: s.cashCollectionMode,
  };
}

function calculateSubscriptionMetrics(s) {
  const subscriptionDurationMonths = Math.max(1, toNumber(s.subscriptionDurationMonths, 1));
  const revenuePerSubscription = safeDivide(s.price, subscriptionDurationMonths);
  const paymentFeeAmountPerSubscription = revenuePerSubscription * s.paymentFeePct;
  const commissionAmountPerSubscription = revenuePerSubscription * s.commissionPct;
  const withholdingAmountPerSubscription = revenuePerSubscription * s.withholdingPct;
  const variableCostPerSubscription = s.variableCostPerSubscriber + paymentFeeAmountPerSubscription + commissionAmountPerSubscription;
  const contributionMarginPerSubscription = revenuePerSubscription - variableCostPerSubscription;
  const contributionMarginPct = safeDivide(contributionMarginPerSubscription, revenuePerSubscription);
  const alerts = validateService(s);
  if (contributionMarginPerSubscription <= 0) alerts.push('El margen de contribucion es negativo.');
  if (contributionMarginPct < 0.15) alerts.push('El margen de contribucion esta por debajo del 15%.');
  return {
    revenuePerClass: 0,
    revenuePerPackage: 0,
    revenuePerSubscription,
    paymentFeeAmountPerClass: 0,
    commissionAmountPerClass: 0,
    withholdingAmountPerClass: 0,
    paymentFeeAmountPerSubscription,
    commissionAmountPerSubscription,
    withholdingAmountPerSubscription,
    variableCostPerClass: 0,
    variableCostPerPackage: 0,
    variableCostPerSubscription,
    contributionMarginPerClass: 0,
    contributionMarginPerPackage: 0,
    contributionMarginPerSubscription,
    contributionMarginPct,
    contributionMarginPerStudent: contributionMarginPerSubscription,
    breakEvenUnitsIfOnlyThisService: null,
    healthStatus: getServiceHealthStatus({ contributionMarginPerClass: contributionMarginPerSubscription, contributionMarginPct }),
    alerts,
    pricingModel: s.pricingModel,
    chargeUnit: s.chargeUnit,
    rawTeacherCostPerClass: s.rawTeacherCostPerClass,
    teacherCostPerClass: s.teacherCostPerClass,
    teacherPaymentStrategy: s.teacherPaymentStrategy,
    subscriptionDurationMonths,
    expectedStudentsPerGroup: 0,
    classesPerPackage: 0,
  };
}

export function calculateMonthlyFixedCost(fixedCost) {
  if (!fixedCost || fixedCost.active === false) return 0;
  const divisor = PERIODICITY_DIVISORS[fixedCost.periodicity || 'monthly'];
  if (!divisor) return 0;
  const monthlyAmount = toNumber(fixedCost.amount) / divisor;
  return isPayrollFixedCost(fixedCost) ? Math.max(0, monthlyAmount) : monthlyAmount;
}

export function calculateFixedCostsSummary(fixedCosts = []) {
  const active = fixedCosts.filter((cost) => cost.active !== false);
  const payroll = active.filter(isPayrollFixedCost);
  const other = active.filter((cost) => !isPayrollFixedCost(cost));
  const payrollFixedCostsTotal = payroll.reduce((sum, cost) => sum + calculateMonthlyFixedCost(cost), 0);
  const otherFixedCostsTotal = other.reduce((sum, cost) => sum + calculateMonthlyFixedCost(cost), 0);
  const totalMonthly = payrollFixedCostsTotal + otherFixedCostsTotal;
  const totalEssential = active.filter((cost) => cost.essential).reduce((sum, cost) => sum + calculateMonthlyFixedCost(cost), 0);
  const totalReducible = active.filter((cost) => cost.reducible).reduce((sum, cost) => sum + calculateMonthlyFixedCost(cost), 0);
  const byCategory = active.reduce((acc, cost) => {
    const key = normalizeFixedCostCategory(cost.category);
    acc[key] = (acc[key] || 0) + calculateMonthlyFixedCost(cost);
    return acc;
  }, {});
  return {
    totalMonthly,
    totalFixedCosts: totalMonthly,
    payrollFixedCostsTotal,
    otherFixedCostsTotal,
    totalEssential,
    totalReducible,
    reduciblePct: safeDivide(totalReducible, totalMonthly),
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount, pct: safeDivide(amount, totalMonthly) })).sort((a, b) => b.amount - a.amount),
  };
}

export function calculateScenario(scenario = {}, scenarioItems = [], services = [], fixedCosts = [], settings = {}) {
  const config = normalizeSettings(settings);
  const fixedCostsSummary = calculateFixedCostsSummary(fixedCosts);
  const totalFixedCosts = fixedCostsSummary.totalFixedCosts;
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const rows = scenarioItems.filter((item) => item.active !== false).map((item) => {
    const base = serviceById.get(item.serviceId);
    if (!base || base.active === false) return null;
    const overrides = {
      price: item.customPrice,
      teacherCostPerClass: item.customTeacherCostPerClass,
      materialsCostPerStudent: item.customMaterialsCostPerStudent,
      transportCostPerClass: item.customTransportCostPerClass,
      commissionPct: item.customCommissionPct,
      paymentFeePct: item.customPaymentFeePct,
      withholdingPct: item.customWithholdingPct,
      expectedStudentsPerClass: item.expectedStudentsPerClass,
    };
    const metrics = calculateServiceMetrics(base, overrides, config);
    const normalizedBase = withServiceDefaults({ ...base, ...removeNullish(overrides) }, config);
    const classes = toNumber(item.expectedClassesPerMonth);
    const useGenerated = shouldUseGeneratedDistribution(scenario, item);
    const packages = useGenerated ? toNumber(item.generatedPackagesPerMonth) : toNumber(item.expectedPackagesPerMonth);
    const subscribers = useGenerated ? toNumber(item.generatedSubscribersPerMonth) : toNumber(item.expectedSubscribersPerMonth);
    const packageVolumes = calculatePackageMonthVolumes(normalizedBase, packages, metrics.classesPerPackageMonth);
    const classesFromPackages = packageVolumes.deliveredClasses;
    const totalClasses = normalizedBase.pricingModel === 'monthly_subscription' ? 0 : useGenerated ? toNumber(item.generatedClassesPerMonth) : classes + classesFromPackages;
    const estimatedPeopleServed = useGenerated
      ? toNumber(item.generatedStudents)
      : normalizedBase.pricingModel === 'monthly_subscription' ? subscribers : normalizedBase.pricingModel === 'package' ? packageVolumes.activeStudents : (classes + packages) * metrics.expectedStudentsPerGroup;
    const revenueFromClasses = metrics.revenuePerClass * classes;
    const revenueFromPackages = (metrics.recognizedRevenuePerPackageMonth || 0) * packages;
    const revenueFromSubscriptions = metrics.revenuePerSubscription ? metrics.revenuePerSubscription * subscribers : 0;
    const revenue = useGenerated ? toNumber(item.generatedRevenue) : revenueFromClasses + revenueFromPackages + revenueFromSubscriptions;
    const totalSubscriptions = subscribers;
    const totals = { revenue, deliveredClasses: totalClasses, estimatedPeople: estimatedPeopleServed, subscribers: totalSubscriptions };
    const variableCostsResult = useGenerated
      ? calculateVariableCostsFromTotals(base, overrides, totals, config)
      : {
        variableCosts: normalizedBase.pricingModel === 'monthly_subscription' ? (metrics.variableCostPerSubscription * subscribers) : metrics.variableCostPerClass * totalClasses,
        withholdingAmount: normalizedBase.pricingModel === 'monthly_subscription' ? (metrics.withholdingAmountPerSubscription * subscribers) : metrics.withholdingAmountPerClass * totalClasses,
      };
    const variableCosts = variableCostsResult.variableCosts;
    const withholdingAmount = variableCostsResult.withholdingAmount;
    const contributionMargin = revenue - variableCosts;
    const cashCollected = normalizedBase.pricingModel === 'package'
      ? (normalizedBase.cashCollectionMode === 'upfront' ? metrics.revenuePerPackage * packages : metrics.recognizedRevenuePerPackageMonth * packages)
      : revenue;
    return { item, service: base, metrics, totalClasses, deliveredClasses: totalClasses, totalPackages: packages, totalSubscriptions, estimatedPeopleServed, revenue, grossRevenue: revenue, cashCollected, variableCosts, withholdingAmount, contributionMargin, contributionMarginPct: safeDivide(contributionMargin, revenue), alerts: metrics.alerts };
  }).filter(Boolean);

  rows.forEach((row) => {
    row.operatingRevenue = config.pricesIncludeVat ? safeDivide(row.grossRevenue, 1 + config.vatPct) : row.grossRevenue;
    row.vatAmount = config.pricesIncludeVat ? row.grossRevenue - row.operatingRevenue : row.grossRevenue * config.vatPct;
    row.totalAmountToCharge = config.pricesIncludeVat ? row.grossRevenue : row.grossRevenue + row.vatAmount;
    row.revenue = row.operatingRevenue;
    row.contributionMargin = row.operatingRevenue - row.variableCosts;
    row.contributionMarginPct = safeDivide(row.contributionMargin, row.operatingRevenue);
  });
  const grossRevenue = sum(rows, 'grossRevenue');
  const cashCollected = sum(rows, 'cashCollected');
  const vatAmount = config.pricesIncludeVat
    ? grossRevenue - safeDivide(grossRevenue, 1 + config.vatPct)
    : grossRevenue * config.vatPct;
  const operatingRevenue = config.pricesIncludeVat ? grossRevenue - vatAmount : grossRevenue;
  const totalAmountToCharge = config.pricesIncludeVat ? grossRevenue : grossRevenue + vatAmount;
  const totalRevenue = operatingRevenue;
  const totalWithholdingAmount = sum(rows, 'withholdingAmount');
  const totalVariableCosts = sum(rows, 'variableCosts');
  const totalContributionMargin = totalRevenue - totalVariableCosts;
  const contributionMarginPct = safeDivide(totalContributionMargin, totalRevenue);
  const operatingProfitBeforeIncomeTax = totalContributionMargin - totalFixedCosts;
  const incomeTax = Math.max(0, operatingProfitBeforeIncomeTax * config.incomeTaxPct);
  const netProfit = operatingProfitBeforeIncomeTax - incomeTax;
  const requiredProfit = totalRevenue * config.targetProfitPct;
  const gapToTarget = netProfit - requiredProfit;
  const totalClasses = sum(rows, 'totalClasses');
  const totalPackages = sum(rows, 'totalPackages');
  const averageContributionMarginPerClass = safeDivide(totalContributionMargin, totalClasses);
  const breakEvenClasses = averageContributionMarginPerClass > 0 ? totalFixedCosts / averageContributionMarginPerClass : null;
  const breakEvenStudents = breakEvenClasses == null ? null : breakEvenClasses / 4;
  const breakEvenRevenue = contributionMarginPct > 0 ? totalFixedCosts / contributionMarginPct : null;
  const alerts = validateScenario(scenario, scenarioItems);
  if (averageContributionMarginPerClass <= 0) alerts.push('Modelo inviable: el margen promedio por clase no cubre costos variables.');
  rows.forEach((row) => row.alerts.forEach((alert) => alerts.push(`${row.service.name}: ${alert}`)));
  const result = {
    scenario,
    rows,
    grossRevenue,
    cashCollected,
    vatAmount,
    operatingRevenue,
    totalAmountToCharge,
    totalRevenue,
    totalWithholdingAmount,
    totalVariableCosts,
    totalContributionMargin,
    contributionMarginPct,
    totalFixedCosts,
    payrollFixedCostsTotal: fixedCostsSummary.payrollFixedCostsTotal,
    otherFixedCostsTotal: fixedCostsSummary.otherFixedCostsTotal,
    operatingProfitBeforeTax: operatingProfitBeforeIncomeTax,
    operatingProfitBeforeIncomeTax,
    taxes: incomeTax,
    incomeTax,
    netProfit,
    requiredProfit,
    gapToTarget,
    totalClasses,
    totalPackages,
    averageContributionMarginPerClass,
    breakEvenRevenue,
    breakEvenClasses,
    breakEvenStudents,
    breakEvenClassesPerStudentPerMonth: 4,
    breakEvenByAverageContributionMargin: breakEvenClasses,
    servicesRankingByContributionMargin: [...rows].sort((a, b) => b.contributionMargin - a.contributionMargin),
    servicesRankingByProfitability: [...rows].sort((a, b) => b.contributionMarginPct - a.contributionMarginPct),
    servicesWithNegativeMargin: rows.filter((row) => row.metrics.healthStatus === SERVICE_HEALTH.NEGATIVE),
    servicesWithLowMargin: rows.filter((row) => row.metrics.healthStatus === SERVICE_HEALTH.LOW),
    alerts,
  };
  result.healthStatus = getScenarioHealthStatus(result);
  return result;
}

export function allocateScenarioByTargetStudents(scenario = {}, scenarioItems = [], services = [], settings = {}) {
  const targetStudents = Math.max(0, toNumber(scenario.targetStudents));
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const activeItems = scenarioItems.filter((item) => item.active !== false);
  const rawWeights = activeItems.map((item) => Math.max(0, toNumber(item.weightPct)));
  const rawWeightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
  const fallbackWeight = activeItems.length ? 100 / activeItems.length : 0;
  const normalized = activeItems.map((item, index) => {
    const rawWeightPct = rawWeightTotal > 0 ? rawWeights[index] : fallbackWeight;
    const normalizedWeightPct = rawWeightTotal > 0 ? (rawWeightPct / rawWeightTotal) * 100 : fallbackWeight;
    return { item, rawWeightPct, normalizedWeightPct };
  });
  const rows = normalized.map(({ item, rawWeightPct, normalizedWeightPct }) => {
    const service = serviceById.get(item.serviceId);
    if (!service || service.active === false) return null;
    const overrides = {
      price: item.customPrice,
      teacherCostPerClass: item.customTeacherCostPerClass,
      materialsCostPerStudent: item.customMaterialsCostPerStudent,
      transportCostPerClass: item.customTransportCostPerClass,
      commissionPct: item.customCommissionPct,
      paymentFeePct: item.customPaymentFeePct,
      withholdingPct: item.customWithholdingPct,
      expectedStudentsPerClass: item.expectedStudentsPerClass,
    };
    const s = withServiceDefaults({ ...service, ...removeNullish(overrides) }, settings);
    const assignedStudents = targetStudents * (normalizedWeightPct / 100);
    const allocation = calculateAllocationForService(s, assignedStudents);
    const variableCostsResult = calculateVariableCostsFromTotals(service, overrides, {
      revenue: allocation.revenue,
      deliveredClasses: allocation.generatedClassesPerMonth,
      estimatedPeople: allocation.generatedStudents,
      subscribers: allocation.generatedSubscribersPerMonth,
    }, settings);
    const variableCosts = variableCostsResult.variableCosts;
    const contributionMargin = allocation.revenue - variableCosts;
    return {
      item,
      service,
      rawWeightPct,
      normalizedWeightPct,
      assignedStudents,
      ...allocation,
      variableCosts,
      withholdingAmount: variableCostsResult.withholdingAmount,
      contributionMargin,
      contributionMarginPct: safeDivide(contributionMargin, allocation.revenue),
      appliedItem: {
        expectedPackagesPerMonth: allocation.generatedPackagesPerMonth,
        expectedSubscribersPerMonth: allocation.generatedSubscribersPerMonth || 0,
        expectedClassesPerMonth: allocation.generatedExpectedClassesPerMonth,
        expectedStudentsPerClass: s.expectedStudentsPerGroup,
        weightPct: rawWeightPct,
        autoGenerated: true,
        lockedManualValues: false,
        generatedStudents: allocation.generatedStudents,
        generatedPackagesPerMonth: allocation.generatedPackagesPerMonth,
        generatedSubscribersPerMonth: allocation.generatedSubscribersPerMonth || 0,
        generatedClassesPerMonth: allocation.generatedClassesPerMonth,
        generatedRevenue: allocation.revenue,
      },
    };
  }).filter(Boolean);
  const estimatedPeople = rows.reduce((sum, row) => sum + row.generatedStudents, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const variableCosts = rows.reduce((sum, row) => sum + row.variableCosts, 0);
  const deliveredClasses = rows.reduce((sum, row) => sum + row.generatedClassesPerMonth, 0);
  const weightsWereNormalized = activeItems.length > 0 && Math.abs(rawWeightTotal - 100) > 0.01;
  return {
    targetStudents,
    rows,
    rawWeightTotal,
    weightsWereNormalized,
    estimatedPeople,
    difference: estimatedPeople - targetStudents,
    revenue,
    variableCosts,
    contributionMargin: revenue - variableCosts,
    contributionMarginPct: safeDivide(revenue - variableCosts, revenue),
    deliveredClasses,
    alerts: [
      ...(weightsWereNormalized ? ['Los pesos fueron normalizados para sumar 100%.'] : []),
      ...(estimatedPeople !== targetStudents ? [`Por redondeo de grupos, este escenario atiende aproximadamente ${estimatedPeople} personas.`] : []),
    ],
  };
}

function calculateAllocationForService(service, assignedStudents) {
  const expectedGroupSize = Math.max(1, toNumber(service.expectedStudentsPerGroup, 1));
  const classesPerPackage = Math.max(1, toNumber(service.classesPerPackage, 1));
  const price = toNumber(service.price);
  const isPackage = service.pricingModel === 'package';
  const isPerStudent = service.chargeUnit === 'student';
  const roundedStudents = Math.max(0, Math.round(assignedStudents));
  if (service.pricingModel === 'monthly_subscription') {
    return {
      generatedStudents: roundedStudents,
      generatedPackagesPerMonth: 0,
      generatedSubscribersPerMonth: roundedStudents,
      generatedGroupsPerMonth: 0,
      generatedExpectedClassesPerMonth: 0,
      generatedClassesPerMonth: 0,
      revenue: roundedStudents * price,
    };
  }
  if (isPackage && isPerStudent) {
    const packages = roundedStudents;
    const groupsNeeded = Math.max(0, Math.ceil(packages / expectedGroupSize));
    const looksGrouped = service.capacityMax > 1 || expectedGroupSize > 1;
    const classesPerPackageMonth = service.classesPerMonthOverride != null ? Math.max(0, toNumber(service.classesPerMonthOverride)) : safeDivide(classesPerPackage, service.packageDurationMonths);
    const deliveredClasses = (looksGrouped ? groupsNeeded : packages) * classesPerPackageMonth;
    return {
      generatedStudents: packages,
      generatedPackagesPerMonth: packages,
      generatedGroupsPerMonth: looksGrouped ? groupsNeeded : packages,
      generatedExpectedClassesPerMonth: 0,
      generatedClassesPerMonth: deliveredClasses,
      revenue: packages * safeDivide(price, service.packageDurationMonths),
    };
  }
  if (isPackage && service.chargeUnit === 'group') {
    const groups = Math.max(0, Math.ceil(assignedStudents / expectedGroupSize));
    const classesPerPackageMonth = service.classesPerMonthOverride != null ? Math.max(0, toNumber(service.classesPerMonthOverride)) : safeDivide(classesPerPackage, service.packageDurationMonths);
    return {
      generatedStudents: groups * expectedGroupSize,
      generatedPackagesPerMonth: groups,
      generatedGroupsPerMonth: groups,
      generatedExpectedClassesPerMonth: 0,
      generatedClassesPerMonth: groups * classesPerPackageMonth,
      revenue: groups * safeDivide(price, service.packageDurationMonths),
    };
  }
  if (service.pricingModel === 'per_student') {
    const classesPerStudent = 1;
    return {
      generatedStudents: roundedStudents,
      generatedPackagesPerMonth: 0,
      generatedGroupsPerMonth: roundedStudents,
      generatedExpectedClassesPerMonth: roundedStudents * classesPerStudent,
      generatedClassesPerMonth: roundedStudents * classesPerStudent,
      revenue: roundedStudents * classesPerStudent * price,
    };
  }
  const groups = Math.max(0, Math.ceil(assignedStudents / expectedGroupSize));
  const generatedStudents = service.chargeUnit === 'group' ? groups * expectedGroupSize : roundedStudents;
  return {
    generatedStudents,
    generatedPackagesPerMonth: 0,
    generatedGroupsPerMonth: groups,
    generatedExpectedClassesPerMonth: groups,
    generatedClassesPerMonth: groups,
    revenue: service.chargeUnit === 'group' ? groups * price : roundedStudents * price,
  };
}

function calculateVariableCostsFromTotals(service, overrides, totals, settings) {
  const s = withServiceDefaults({ ...service, ...removeNullish(overrides) }, settings);
  const deliveredClasses = toNumber(totals.deliveredClasses);
  const estimatedPeople = toNumber(totals.estimatedPeople);
  const revenue = toNumber(totals.revenue);
  const variableCosts = (deliveredClasses * s.teacherCostPerClass)
    + (deliveredClasses * s.transportCostPerClass)
    + (deliveredClasses * s.materialsCostPerClass)
    + (estimatedPeople * s.materialsCostPerStudent)
    + (deliveredClasses * s.otherVariableCostPerClass)
    + (toNumber(totals.subscribers) * s.variableCostPerSubscriber)
    + (revenue * (s.paymentFeePct + s.commissionPct));
  return {
    variableCosts,
    withholdingAmount: revenue * s.withholdingPct,
  };
}

function calculatePackageMonthVolumes(service, packages, classesPerPackageMonth) {
  if (service.pricingModel !== 'package') return { deliveredClasses: 0, activeStudents: 0, activeGroups: 0 };
  if (service.chargeUnit === 'group') {
    const activeGroups = packages;
    return {
      activeGroups,
      activeStudents: activeGroups * service.expectedStudentsPerGroup,
      deliveredClasses: activeGroups * classesPerPackageMonth,
    };
  }
  const activeStudents = packages;
  const activeGroups = Math.ceil(safeDivide(activeStudents, Math.max(1, service.expectedStudentsPerGroup)));
  return {
    activeGroups,
    activeStudents,
    deliveredClasses: activeGroups * classesPerPackageMonth,
  };
}

function shouldUseGeneratedDistribution(scenario, item) {
  return scenario?.autoDistributionEnabled === true
    && scenario?.distributionMode === 'weighted_by_students'
    && item?.autoGenerated === true;
}

export function compareScenarios(calculatedScenarios = []) {
  const valid = calculatedScenarios.filter(Boolean);
  return {
    bestByNetProfit: maxBy(valid, 'netProfit'),
    bestByMarginPct: maxBy(valid, 'contributionMarginPct'),
    riskiest: [...valid].sort((a, b) => a.netProfit - b.netProfit)[0] || null,
    reachesTarget: valid.filter((item) => item.gapToTarget >= 0),
    missesTarget: valid.filter((item) => item.gapToTarget < 0),
  };
}

export function getServiceHealthStatus(metrics) {
  if (metrics.contributionMarginPerClass <= 0) return SERVICE_HEALTH.NEGATIVE;
  if (metrics.contributionMarginPct < 0.15) return SERVICE_HEALTH.LOW;
  if (metrics.contributionMarginPct < 0.35) return SERVICE_HEALTH.HEALTHY;
  return SERVICE_HEALTH.STRONG;
}

export function getScenarioHealthStatus(result) {
  if (result.netProfit < 0) return SCENARIO_HEALTH.LOSS;
  if (result.gapToTarget > result.requiredProfit * 0.25 && result.contributionMarginPct >= 0.40) return SCENARIO_HEALTH.STRONG;
  if (result.gapToTarget >= 0 && result.contributionMarginPct >= 0.30) return SCENARIO_HEALTH.HEALTHY;
  if (result.contributionMarginPct < 0.25) return SCENARIO_HEALTH.RISKY;
  if (result.gapToTarget < 0) return SCENARIO_HEALTH.TIGHT;
  return SCENARIO_HEALTH.HEALTHY;
}

function removeNullish(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value != null && value !== ''));
}

export function normalizeFixedCostCategory(category) {
  const value = String(category || '').trim();
  if (!value) return OTHER_FIXED_COST_CATEGORY;
  return isPayrollCategory(value) ? PAYROLL_FIXED_COST_CATEGORY : value;
}

export function isPayrollFixedCost(cost = {}) {
  return isPayrollCategory(cost.type) || isPayrollCategory(cost.category);
}

function isPayrollCategory(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['nomina', 'salario', 'sueldo', 'equipo base', 'trabajador', 'personal'].some((keyword) => normalized.includes(keyword));
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

function maxBy(rows, key) {
  return [...rows].sort((a, b) => (b[key] || 0) - (a[key] || 0))[0] || null;
}
