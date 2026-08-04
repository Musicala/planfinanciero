import { safeDivide, toNumber } from '../utils/numbers.js';

export const SALARY_RANGE_DEFAULTS = {
  teacherType: 'A',
  partialContract: false,
  fullTimeWeeklyHours: 42,
  smmlvMonthly: 1750905,
  transportSubsidy: 249095,
  dotationAnnual: 126950,
  medicalExamAnnual: 115610,
  rates: {
    employeeHealth: 0.04,
    employeePension: 0.04,
    severance: 0.0833,
    severanceInterest: 0.01,
    bonus: 0.0833,
    vacation: 0.0417,
    employerHealth: 0.085,
    employerPension: 0.12,
    arl: 0.01044,
    compensationFund: 0.04,
  },
  teacherProfiles: {
    A: {
      label: 'Docente A',
      baseHourlyPay: 23675,
      ranges: [
        { hours: 8, payAdjustmentPct: -0.18 },
        { hours: 12, payAdjustmentPct: -0.14 },
        { hours: 14, payAdjustmentPct: -0.1 },
        { hours: 20, payAdjustmentPct: -0.06 },
        { hours: 24, payAdjustmentPct: -0.03 },
        { hours: 28, payAdjustmentPct: 0 },
        { hours: 30, payAdjustmentPct: 0.02 },
        { hours: 34, payAdjustmentPct: 0.04 },
        { hours: 40, payAdjustmentPct: 0.06 },
        { hours: 42, payAdjustmentPct: 0.07 },
      ],
    },
    B: {
      label: 'Docente B',
      baseHourlyPay: 20518,
      ranges: [
        { hours: 8, payAdjustmentPct: -0.18 },
        { hours: 12, payAdjustmentPct: -0.14 },
        { hours: 14, payAdjustmentPct: -0.1 },
        { hours: 20, payAdjustmentPct: -0.06 },
        { hours: 24, payAdjustmentPct: -0.03 },
        { hours: 28, payAdjustmentPct: 0 },
        { hours: 30, payAdjustmentPct: 0.02 },
        { hours: 34, payAdjustmentPct: 0.04 },
        { hours: 40, payAdjustmentPct: 0.06 },
        { hours: 42, payAdjustmentPct: 0.07 },
      ],
    },
  },
};

export function simulateSalaryRanges(controls = {}, rangesInput = []) {
  const normalized = normalizeSalaryRangeControls(controls);
  const ranges = normalizeRanges(rangesInput, normalized.teacherType);
  const rows = ranges
    .sort((a, b) => a.weeklyHours - b.weeklyHours)
    .map((range) => buildSalaryRangeRow(range, normalized));
  const rowsWithDifferentials = rows.map((row, index) => {
    const previous = rows[index - 1];
    return {
      ...row,
      salaryDifference: previous ? row.salary - previous.salary : null,
      netPayDifference: previous ? row.netPay - previous.netPay : null,
      costDifference: previous ? row.companyCost - previous.companyCost : null,
    };
  });
  const averageSalary = safeDivide(rowsWithDifferentials.reduce((sum, row) => sum + row.salary, 0), rowsWithDifferentials.length);
  const averageNetPay = safeDivide(rowsWithDifferentials.reduce((sum, row) => sum + row.netPay, 0), rowsWithDifferentials.length);
  const averageCompanyCost = safeDivide(rowsWithDifferentials.reduce((sum, row) => sum + row.companyCost, 0), rowsWithDifferentials.length);

  return {
    controls: normalized,
    rows: rowsWithDifferentials,
    summary: {
      reviewedRanges: rowsWithDifferentials.length,
      averageSalary,
      averageNetPay,
      averageCompanyCost,
      rangesBelowMinimum: rowsWithDifferentials.filter((row) => row.belowLegalMinimum).length,
    },
  };
}

export function normalizeSalaryRangeControls(controls = {}) {
  const teacherType = controls.teacherType === 'B' ? 'B' : 'A';
  const profile = getTeacherProfile(teacherType);
  return {
    teacherType,
    teacherLabel: profile.label,
    partialContract: Boolean(controls.partialContract),
    fullTimeWeeklyHours: clamp(toNumber(controls.fullTimeWeeklyHours, SALARY_RANGE_DEFAULTS.fullTimeWeeklyHours), 1, 60),
    smmlvMonthly: Math.max(0, toNumber(controls.smmlvMonthly, SALARY_RANGE_DEFAULTS.smmlvMonthly)),
    baseHourlyPay: Math.max(0, toNumber(controls.baseHourlyPay, profile.baseHourlyPay)),
    transportSubsidy: Math.max(0, toNumber(controls.transportSubsidy, SALARY_RANGE_DEFAULTS.transportSubsidy)),
    dotationAnnual: Math.max(0, toNumber(controls.dotationAnnual, SALARY_RANGE_DEFAULTS.dotationAnnual)),
    medicalExamAnnual: Math.max(0, toNumber(controls.medicalExamAnnual, SALARY_RANGE_DEFAULTS.medicalExamAnnual)),
    rates: normalizeRates(controls.rates || controls),
  };
}

export function getTeacherProfile(teacherType = SALARY_RANGE_DEFAULTS.teacherType) {
  return SALARY_RANGE_DEFAULTS.teacherProfiles[teacherType] || SALARY_RANGE_DEFAULTS.teacherProfiles.A;
}

export function normalizeRanges(rangesInput = [], teacherType = SALARY_RANGE_DEFAULTS.teacherType) {
  const source = Array.isArray(rangesInput) && rangesInput.length ? rangesInput : getTeacherProfile(teacherType).ranges;
  return source
    .map((range) => ({
      weeklyHours: Math.max(1, toNumber(range.weeklyHours ?? range.hours)),
      payAdjustmentPct: clamp(toNumber(range.payAdjustmentPct ?? range.adjustmentPct), -0.8, 2),
    }))
    .filter((range) => range.weeklyHours > 0);
}

function buildSalaryRangeRow(range, controls) {
  const monthlyHours = range.weeklyHours * 4;
  const context = rangeContext(range, controls);
  const finalHourlyCost = controls.baseHourlyPay * (1 - range.payAdjustmentPct);
  const targetCompanyCost = Math.max(0, finalHourlyCost * monthlyHours);
  const salary = grossSalaryFromCompanyCost(targetCompanyCost, controls, context);
  const costs = laborCosts(salary, controls, context);

  return {
    weeklyHours: range.weeklyHours,
    rangeHours: range.weeklyHours,
    monthlyHours,
    baseHourlyPay: controls.baseHourlyPay,
    payAdjustmentPct: range.payAdjustmentPct,
    hourlyPay: finalHourlyCost,
    finalHourlyCost,
    salaryHourlyPay: safeDivide(salary, monthlyHours),
    salary,
    ...costs,
    workdayFactor: context.workdayFactor,
    legalMinimumSalary: context.legalMinimumSalary,
    belowLegalMinimum: salary + 1 < context.legalMinimumSalary,
    targetCompanyCost,
    companyCostPerHour: safeDivide(costs.companyCost, monthlyHours),
    netPayPerHour: safeDivide(costs.netPay, monthlyHours),
  };
}

// En contrato parcial el minimo legal, el piso de aportes y el auxilio de transporte
// se prorratean segun la fraccion de jornada contratada. En contrato pleno el factor es 1
// y todo se comporta igual que antes.
function rangeContext(range, controls) {
  const workdayFactor = controls.partialContract
    ? Math.max(0, Math.min(1, safeDivide(range.weeklyHours, controls.fullTimeWeeklyHours)))
    : 1;
  return {
    workdayFactor,
    legalMinimumSalary: controls.smmlvMonthly * workdayFactor,
    contributionFloor: controls.smmlvMonthly * workdayFactor,
    transportSubsidy: controls.transportSubsidy * workdayFactor,
  };
}

function grossSalaryFromCompanyCost(companyCost, controls, context) {
  const rates = controls.rates;
  const fixedMonthlyCosts = context.transportSubsidy
    + safeDivide(controls.dotationAnnual, 12)
    + safeDivide(controls.medicalExamAnnual, 12);
  const employerContributionRate = rates.employerHealth + rates.employerPension + rates.arl + rates.compensationFund;
  const benefitsFactor = rates.severance + rates.severanceInterest + rates.bonus + rates.vacation;
  const salaryWhenIbcIsMinimum = companyCost
    - fixedMonthlyCosts
    - (context.contributionFloor * employerContributionRate);
  // El salario resultante -no el numerador- es el que define si el IBC queda en el piso.
  if (salaryWhenIbcIsMinimum <= context.contributionFloor * (1 + benefitsFactor)) {
    return Math.max(0, safeDivide(salaryWhenIbcIsMinimum, 1 + benefitsFactor));
  }
  const variableFactor = 1
    + rates.severance
    + rates.severanceInterest
    + rates.bonus
    + rates.vacation
    + rates.employerHealth
    + rates.employerPension
    + rates.arl
    + rates.compensationFund;
  return Math.max(0, safeDivide(companyCost - fixedMonthlyCosts, variableFactor));
}

function laborCosts(salary, controls, context) {
  const rates = controls.rates;
  const transportSubsidy = context.transportSubsidy;
  const contributionBase = Math.max(salary, context.contributionFloor);
  const employeeHealth = contributionBase * rates.employeeHealth;
  const employeePension = contributionBase * rates.employeePension;
  const netPay = salary + transportSubsidy - employeeHealth - employeePension;
  const severance = salary * rates.severance;
  const severanceInterest = salary * rates.severanceInterest;
  const bonus = salary * rates.bonus;
  const vacation = salary * rates.vacation;
  const employerHealth = contributionBase * rates.employerHealth;
  const employerPension = contributionBase * rates.employerPension;
  const arl = contributionBase * rates.arl;
  const compensationFund = contributionBase * rates.compensationFund;
  const dotationMonthly = safeDivide(controls.dotationAnnual, 12);
  const medicalExamMonthly = safeDivide(controls.medicalExamAnnual, 12);
  const companyCost = salary
    + transportSubsidy
    + severance
    + severanceInterest
    + bonus
    + vacation
    + employerHealth
    + employerPension
    + arl
    + compensationFund
    + dotationMonthly
    + medicalExamMonthly;

  return {
    transportSubsidy,
    contributionBase,
    employeeHealth,
    employeePension,
    netPay,
    severance,
    severanceInterest,
    bonus,
    vacation,
    employerHealth,
    employerPension,
    arl,
    compensationFund,
    dotationMonthly,
    medicalExamMonthly,
    companyCost,
  };
}

function normalizeRates(input = {}) {
  return Object.fromEntries(Object.entries(SALARY_RANGE_DEFAULTS.rates).map(([key, value]) => [
    key,
    clamp(toNumber(input[key], value), 0, 1),
  ]));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
