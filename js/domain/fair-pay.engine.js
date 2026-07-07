import { safeDivide, toNumber } from '../utils/numbers.js';

export const SALARY_RANGE_DEFAULTS = {
  teacherType: 'A',
  smmlvMonthly: 1750905,
  transportSubsidy: 249095,
  dotationAnnual: 126950,
  medicalExamAnnual: 115610,
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

const EMPLOYEE_HEALTH = 0.04;
const EMPLOYEE_PENSION = 0.04;
const SEVERANCE = 0.0833;
const SEVERANCE_INTEREST = 0.01;
const BONUS = 0.0833;
const VACATION = 0.0417;
const EMPLOYER_HEALTH = 0.085;
const EMPLOYER_PENSION = 0.12;
const ARL = 0.01044;
const COMPENSATION_FUND = 0.04;

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
      costDifference: previous ? row.companyCost - previous.companyCost : null,
    };
  });
  const averageSalary = safeDivide(rowsWithDifferentials.reduce((sum, row) => sum + row.salary, 0), rowsWithDifferentials.length);
  const averageCompanyCost = safeDivide(rowsWithDifferentials.reduce((sum, row) => sum + row.companyCost, 0), rowsWithDifferentials.length);

  return {
    controls: normalized,
    rows: rowsWithDifferentials,
    summary: {
      reviewedRanges: rowsWithDifferentials.length,
      averageSalary,
      averageCompanyCost,
    },
  };
}

export function normalizeSalaryRangeControls(controls = {}) {
  const teacherType = controls.teacherType === 'B' ? 'B' : 'A';
  const profile = getTeacherProfile(teacherType);
  return {
    teacherType,
    teacherLabel: profile.label,
    smmlvMonthly: Math.max(0, toNumber(controls.smmlvMonthly, SALARY_RANGE_DEFAULTS.smmlvMonthly)),
    baseHourlyPay: Math.max(0, toNumber(controls.baseHourlyPay, profile.baseHourlyPay)),
    transportSubsidy: Math.max(0, toNumber(controls.transportSubsidy, SALARY_RANGE_DEFAULTS.transportSubsidy)),
    dotationAnnual: Math.max(0, toNumber(controls.dotationAnnual, SALARY_RANGE_DEFAULTS.dotationAnnual)),
    medicalExamAnnual: Math.max(0, toNumber(controls.medicalExamAnnual, SALARY_RANGE_DEFAULTS.medicalExamAnnual)),
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
  const hourlyPay = controls.baseHourlyPay * (1 - range.payAdjustmentPct);
  const salary = Math.max(0, hourlyPay * monthlyHours);
  const costs = laborCosts(salary, controls);

  return {
    weeklyHours: range.weeklyHours,
    rangeHours: range.weeklyHours,
    monthlyHours,
    baseHourlyPay: controls.baseHourlyPay,
    payAdjustmentPct: range.payAdjustmentPct,
    hourlyPay,
    salary,
    ...costs,
    companyCostPerHour: safeDivide(costs.companyCost, monthlyHours),
  };
}

function laborCosts(salary, controls) {
  const transportSubsidy = controls.transportSubsidy;
  const employeeHealth = salary * EMPLOYEE_HEALTH;
  const employeePension = salary * EMPLOYEE_PENSION;
  const netPay = salary + transportSubsidy - employeeHealth - employeePension;
  const severance = salary * SEVERANCE;
  const severanceInterest = salary * SEVERANCE_INTEREST;
  const bonus = salary * BONUS;
  const vacation = salary * VACATION;
  const employerHealth = salary * EMPLOYER_HEALTH;
  const employerPension = salary * EMPLOYER_PENSION;
  const arl = salary * ARL;
  const compensationFund = salary * COMPENSATION_FUND;
  const dotationMonthly = safeDivide(controls.dotationAnnual, 12);
  const medicalExamMonthly = safeDivide(controls.medicalExamAnnual, 12);
  const companyCost = netPay
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
