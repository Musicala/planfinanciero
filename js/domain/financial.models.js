import { clampPercent, toNumber } from '../utils/numbers.js';

export function normalizeSettings(settings = {}) {
  return {
    vatPct: clampPercent(settings.vatPct ?? settings.taxPct ?? 0.19),
    pricesIncludeVat: settings.pricesIncludeVat === true,
    incomeTaxPct: clampPercent(settings.incomeTaxPct ?? 0),
    taxPct: clampPercent(settings.taxPct ?? settings.vatPct ?? 0.19),
    targetProfitPct: clampPercent(settings.targetProfitPct ?? settings.targetProfitMarginPct ?? 0.15),
    defaultPaymentFeePct: clampPercent(settings.defaultPaymentFeePct ?? 0),
    defaultWithholdingPct: clampPercent(settings.defaultWithholdingPct ?? 0),
    defaultCommissionPct: clampPercent(settings.defaultCommissionPct ?? 0),
    defaultExpectedStudentsPerGroup: toNumber(settings.defaultExpectedStudentsPerGroup, 6),
    teacherPaymentStrategy: ['per_service', 'payroll'].includes(settings.teacherPaymentStrategy) ? settings.teacherPaymentStrategy : 'per_service',
    notes: settings.notes || '',
  };
}

export function withServiceDefaults(service = {}, settings = {}) {
  const s = normalizeSettings(settings);
  const pricingModel = normalizePricingModel(service.pricingModel || service.billingModel);
  const rawTeacherCostPerClass = toNumber(service.teacherCostPerClass);
  const teacherCostPerClass = s.teacherPaymentStrategy === 'payroll' ? 0 : rawTeacherCostPerClass;
  return {
    name: service.name || '',
    code: service.code || '',
    lineId: service.lineId || '',
    lineName: service.lineName || '',
    modality: service.modality || '',
    active: service.active !== false,
    pricingModel,
    billingModel: service.billingModel || pricingModel,
    chargeUnit: service.chargeUnit || service.priceUnit || defaultChargeUnitForPricing(pricingModel),
    price: toNumber(service.price),
    classesPerPackage: pricingModel === 'monthly_subscription' ? 0 : Math.max(1, toNumber(service.classesPerPackage, 1)),
    packageDurationMonths: pricingModel === 'package' ? Math.max(1, toNumber(service.packageDurationMonths, 1)) : 1,
    packageCycleMode: ['rolling', 'fixed_window'].includes(service.packageCycleMode) ? service.packageCycleMode : 'rolling',
    cycleStartMonths: normalizeCycleStartMonths(service.cycleStartMonths),
    cashCollectionMode: pricingModel === 'package' ? 'upfront' : 'monthly_installments',
    classesPerMonthOverride: service.classesPerMonthOverride == null || service.classesPerMonthOverride === '' ? null : Math.max(0, toNumber(service.classesPerMonthOverride)),
    subscriptionDurationMonths: pricingModel === 'monthly_subscription' ? Math.max(1, toNumber(service.subscriptionDurationMonths, 1)) : 1,
    capacityMin: toNumber(service.capacityMin, 1),
    capacityMax: toNumber(service.capacityMax, 8),
    expectedStudentsPerGroup: toNumber(service.expectedStudentsPerGroup, s.defaultExpectedStudentsPerGroup),
    rawTeacherCostPerClass,
    teacherCostPerClass,
    teacherPaymentStrategy: s.teacherPaymentStrategy,
    materialsCostPerStudent: toNumber(service.materialsCostPerStudent),
    materialsCostPerClass: toNumber(service.materialsCostPerClass),
    transportCostPerClass: toNumber(service.transportCostPerClass),
    variableCostPerSubscriber: toNumber(service.variableCostPerSubscriber),
    commissionPct: clampPercent(service.commissionPct ?? s.defaultCommissionPct),
    paymentFeePct: clampPercent(service.paymentFeePct ?? s.defaultPaymentFeePct),
    withholdingPct: clampPercent(service.withholdingPct ?? s.defaultWithholdingPct),
    otherVariableCostPerClass: toNumber(service.otherVariableCostPerClass),
    notes: service.notes || '',
    id: service.id,
  };
}

function normalizeCycleStartMonths(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return raw.map((item) => toNumber(item)).filter((month) => month >= 1 && month <= 12);
}

function defaultChargeUnitForPricing(pricingModel) {
  if (pricingModel === 'monthly_subscription') return 'student';
  return pricingModel === 'per_class' ? 'group' : 'student';
}

function normalizePricingModel(value) {
  if (value === 'package_total') return 'package';
  if (value === 'class_per_student') return 'per_student';
  if (value === 'class_total') return 'per_class';
  if (value === 'subscription' || value === 'monthly') return 'monthly_subscription';
  return value || 'per_student';
}
