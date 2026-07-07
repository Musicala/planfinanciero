import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { getTeacherProfile, normalizeRanges, simulateSalaryRanges } from '../domain/fair-pay.engine.js';

const STORAGE_KEY = 'musicala:salary-ranges';

export function renderFairPayView(root, focusState = null) {
  const saved = readSavedState();
  const activeRanges = saved.rangesByTeacher[saved.teacherType] || [];
  const sim = simulateSalaryRanges({ ...saved.controls, teacherType: saved.teacherType }, activeRanges);

  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Rangos salariales</p><h2>Modelo porcentual por horas semanales</h2></div>
      <div class="actions">
        ${teacherSwitch(saved.teacherType)}
        <button class="btn btn-secondary" id="salaryRangesReset" type="button">Restaurar base</button>
      </div>
    </section>
    ${reading(sim)}
    ${controlPanel(sim.controls)}
    ${summaryCards(sim)}
    <section class="panel salary-ranges-panel">
      <div class="fixed-cost-list-head">
        <div>
          <h3>Reglas porcentuales por rango</h3>
          <p class="muted">Define horas semanales; la app convierte a equivalente mensual solo para calcular salario y costo real empresa.</p>
        </div>
        <button class="btn btn-primary" id="salaryRangeAdd" type="button">+ Rango</button>
      </div>
      ${salaryRangesTable(sim.rows)}
    </section>
    ${costNotes()}`;

  root.querySelectorAll('[data-salary-control], [data-salary-row]').forEach((input) => {
    input.addEventListener('input', () => {
      saveFromDom(root);
      scheduleSalaryRangesRender(root, captureFocus(input));
    });
    input.addEventListener('change', () => {
      saveFromDom(root);
      renderFairPayView(root, captureFocus(input));
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
  });
  root.querySelectorAll('[data-teacher-type]').forEach((button) => {
    button.addEventListener('click', () => {
      saveFromDom(root, button.dataset.teacherType);
      renderFairPayView(root);
    });
  });
  root.querySelectorAll('[data-delete-range]').forEach((button) => {
    button.addEventListener('click', () => {
      saveFromDom(root, null, Number(button.dataset.deleteRange));
      renderFairPayView(root);
    });
  });
  root.querySelector('#salaryRangeAdd')?.addEventListener('click', () => {
    saveFromDom(root, null, null, true);
    renderFairPayView(root);
  });
  root.querySelector('#salaryRangesReset')?.addEventListener('click', () => {
    window.localStorage?.removeItem(STORAGE_KEY);
    renderFairPayView(root);
  });
  restoreFocus(root, focusState);
}

function teacherSwitch(activeType) {
  return `<div class="segmented salary-teacher-switch" aria-label="Tipo de docente">
    ${['A', 'B'].map((type) => {
      const profile = getTeacherProfile(type);
      return `<button type="button" data-teacher-type="${type}" class="${type === activeType ? 'is-active' : ''}">${escapeHtml(profile.label)}</button>`;
    }).join('')}
  </div>`;
}

function reading(sim) {
  const text = `Base actual: ${sim.controls.teacherLabel} usa ${formatCurrency(sim.controls.baseHourlyPay)} por hora en el rango de 28h. Los demas rangos salen de ese valor y del % pago rango.`;
  return `<section class="reading healthy"><p>${escapeHtml(text)}</p></section>`;
}

function controlPanel(controls) {
  return `<section class="panel salary-ranges-controls">
    ${controlInput('baseHourlyPay', `Valor hora base 28h ${controls.teacherLabel}`, controls.baseHourlyPay, '$', 100)}
    ${controlInput('smmlvMonthly', 'SMMLV mensual referencial', controls.smmlvMonthly, '$', 1000)}
    ${controlInput('transportSubsidy', 'Auxilio transporte', controls.transportSubsidy, '$', 1000)}
    ${controlInput('dotationAnnual', 'Dotacion anual', controls.dotationAnnual, '$', 1000)}
    ${controlInput('medicalExamAnnual', 'Examenes medicos anual', controls.medicalExamAnnual, '$', 1000)}
  </section>`;
}

function summaryCards(sim) {
  const items = [
    ['Salario mensual prom.', formatCurrency(sim.summary.averageSalary), 'Promedio simple de rangos'],
    ['Costo empresa prom.', formatCurrency(sim.summary.averageCompanyCost), 'Promedio simple de rangos'],
    ['Rangos semanales', String(sim.summary.reviewedRanges), 'Puedes agregar o quitar jornadas'],
    ['Base 28h', formatCurrency(sim.controls.baseHourlyPay), sim.controls.teacherLabel],
  ];
  return `<section class="kpi-grid salary-ranges-kpis">${items.map(([label, value, sub]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`).join('')}</section>`;
}

function salaryRangesTable(rows) {
  return `<div class="table-wrap"><table class="salary-ranges-table">
    <thead>
      <tr>
        <th class="num">Horas sem.</th>
        <th class="num">Equiv. mes</th>
        <th class="num">% pago rango</th>
        <th class="num">Pago/hora</th>
        <th class="num">Salario mensual</th>
        <th class="num">Costo real empresa</th>
        <th class="num">Costo/hora</th>
        <th class="num">Dif. salario</th>
        <th class="num">Dif. costo</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows.map((row, index) => `<tr>
      <td class="num">${rowInput(index, 'weeklyHours', row.weeklyHours, 1)}</td>
      <td class="num">${row.monthlyHours}</td>
      <td class="num">${rowInput(index, 'payAdjustmentPct', Math.round(row.payAdjustmentPct * 100), 1, '%')}</td>
      <td class="num">${formatCurrency(row.hourlyPay)}</td>
      <td class="num">${formatCurrency(row.salary)}</td>
      <td class="num">${formatCurrency(row.companyCost)}</td>
      <td class="num">${formatCurrency(row.companyCostPerHour)}</td>
      <td class="num">${row.salaryDifference == null ? 'Base' : formatCurrency(row.salaryDifference)}</td>
      <td class="num">${row.costDifference == null ? 'Base' : formatCurrency(row.costDifference)}</td>
      <td class="num"><button class="btn btn-ghost" data-delete-range="${index}" type="button">Eliminar</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function costNotes() {
  return `<section class="panel salary-cost-notes">
    <h3>Como leerlo</h3>
    <div class="exec-quick">
      <div><span>Horas semanales</span><strong>Unidad principal para crear y comparar rangos</strong></div>
      <div><span>Base manual</span><strong>El rango 28h define el valor hora base</strong></div>
      <div><span>Diferenciales</span><strong>Comparan salario y costo contra el rango anterior</strong></div>
      <div><span>Costos</span><strong>Auxilio, aportes, prestaciones, dotacion y examenes</strong></div>
    </div>
  </section>`;
}

function controlInput(name, label, value, suffix, step) {
  return `<label class="field salary-range-field">
    <span>${escapeHtml(label)}</span>
    <div class="fair-pay-input-wrap">
      <input data-salary-control="${name}" name="${name}" type="number" step="${step}" min="0" value="${escapeHtml(String(roundValue(value)))}" />
      <em>${escapeHtml(suffix)}</em>
    </div>
  </label>`;
}

function rowInput(index, name, value, step, suffix = '') {
  return `<span class="salary-row-input-wrap"><input class="table-input" data-salary-row="${index}:${name}" name="row:${index}:${name}" type="number" step="${step}" min="${name.includes('Pct') ? '-80' : '0'}" value="${escapeHtml(String(roundValue(value)))}" />${suffix ? `<em>${escapeHtml(suffix)}</em>` : ''}</span>`;
}

function readSavedState() {
  const parsed = safeJson(window.localStorage?.getItem(STORAGE_KEY));
  const teacherType = parsed?.teacherType === 'B' ? 'B' : 'A';
  const commonControls = normalizeLegacyControls(parsed?.controls || {});
  const teacherControls = normalizeLegacyTeacherControls(teacherType, commonControls, parsed?.controlsByTeacher?.[teacherType] || {});
  return {
    teacherType,
    controls: { ...commonControls, ...teacherControls, teacherType },
    controlsByTeacher: parsed?.controlsByTeacher || {},
    rangesByTeacher: parsed?.rangesByTeacher || migrateLegacyRows(parsed),
  };
}

function normalizeLegacyControls(controls) {
  const next = { ...controls };
  delete next.legalMonthlyHours;
  delete next.legalWeeklyHours;
  return next;
}

function normalizeLegacyTeacherControls(teacherType, commonControls, teacherControls) {
  if (teacherControls.baseHourlyPay) return teacherControls;
  const profile = getTeacherProfile(teacherType);
  if (teacherControls.teacherPremiumPct != null) {
    const smmlv = Number(commonControls.smmlvMonthly) || 0;
    const base = smmlv ? (smmlv / (48 * 4)) * (1 + Number(teacherControls.teacherPremiumPct)) : profile.baseHourlyPay;
    return { ...teacherControls, baseHourlyPay: Math.round(base) };
  }
  return { ...teacherControls, baseHourlyPay: profile.baseHourlyPay };
}

function saveFromDom(root, nextTeacherType = null, deleteIndex = null, addRange = false) {
  const current = readSavedState();
  const activeTeacherType = root.querySelector('[data-teacher-type].is-active')?.dataset.teacherType || current.teacherType;
  const targetTeacherType = nextTeacherType || activeTeacherType;
  const controls = {
    smmlvMonthly: valueOf(root, 'smmlvMonthly'),
    transportSubsidy: valueOf(root, 'transportSubsidy'),
    dotationAnnual: valueOf(root, 'dotationAnnual'),
    medicalExamAnnual: valueOf(root, 'medicalExamAnnual'),
  };
  const controlsByTeacher = {
    ...current.controlsByTeacher,
    [activeTeacherType]: {
      baseHourlyPay: valueOf(root, 'baseHourlyPay'),
    },
  };
  let ranges = normalizeRanges(currentRangesFromDom(root, activeTeacherType), activeTeacherType);
  if (deleteIndex != null) ranges = ranges.filter((_range, index) => index !== deleteIndex);
  if (addRange) {
    const last = ranges[ranges.length - 1] || { weeklyHours: 28, payAdjustmentPct: 0 };
    ranges.push({ ...last, weeklyHours: last.weeklyHours + 2 });
  }
  const rangesByTeacher = {
    ...current.rangesByTeacher,
    [activeTeacherType]: ranges,
  };
  window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
    teacherType: targetTeacherType,
    controls,
    controlsByTeacher,
    rangesByTeacher,
  }));
}

function currentRangesFromDom(root, teacherType) {
  const profile = getTeacherProfile(teacherType);
  const indexes = Array.from(root.querySelectorAll('[data-salary-row]'))
    .map((input) => Number(input.dataset.salaryRow.split(':')[0]))
    .filter((index) => Number.isInteger(index));
  const maxIndex = indexes.length ? Math.max(...indexes) : profile.ranges.length - 1;
  return Array.from({ length: maxIndex + 1 }, (_item, index) => ({
    weeklyHours: valueOf(root, `row:${index}:weeklyHours`),
    payAdjustmentPct: valueOf(root, `row:${index}:payAdjustmentPct`) / 100,
  })).filter((range) => range.weeklyHours);
}

function migrateLegacyRows(parsed) {
  if (parsed?.rowsByTeacher) {
    return {
      A: mergeLegacyRows('A', parsed.rowsByTeacher.A),
      B: mergeLegacyRows('B', parsed.rowsByTeacher.B),
    };
  }
  const legacy = Array.isArray(parsed?.rows) ? parsed.rows : [];
  return {
    A: mergeLegacyRows('A', legacy),
    B: [],
  };
}

function mergeLegacyRows(teacherType, rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row, index) => ({
    ...getTeacherProfile(teacherType).ranges[index],
    weeklyHours: row.weeklyHours ?? row.hours,
    payAdjustmentPct: row.payAdjustmentPct ?? row.adjustmentPct,
  }));
}

function valueOf(root, name) {
  return Number(root.querySelector(`[name="${CSS.escape(name)}"]`)?.value || 0);
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function roundValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : value;
}

function scheduleSalaryRangesRender(root, focusState) {
  window.clearTimeout(root.__salaryRangesRenderTimer);
  root.__salaryRangesRenderTimer = window.setTimeout(() => {
    renderFairPayView(root, focusState);
  }, 350);
}

function captureFocus(input) {
  const state = { name: input.name, value: input.value };
  try {
    state.selectionStart = input.selectionStart;
    state.selectionEnd = input.selectionEnd;
  } catch {
    state.selectionStart = null;
    state.selectionEnd = null;
  }
  return state;
}

function restoreFocus(root, focusState) {
  if (!focusState?.name) return;
  const input = root.querySelector(`[name="${CSS.escape(focusState.name)}"]`);
  if (!input) return;
  input.focus();
  if (focusState.selectionStart == null || document.activeElement !== input) return;
  try {
    const cursor = Math.min(String(input.value).length, focusState.selectionStart);
    input.setSelectionRange(cursor, cursor);
  } catch {
    // Number inputs do not support selection ranges in every browser.
  }
}
