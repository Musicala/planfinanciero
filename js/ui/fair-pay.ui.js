import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { getTeacherProfile, normalizeRanges, normalizeSalaryRangeControls, simulateSalaryRanges } from '../domain/fair-pay.engine.js';
import { showToast } from './toast.ui.js';

const STORAGE_KEY = 'musicala:salary-ranges';
let cachedState = null;
let hasUnsavedChanges = false;

export function renderFairPayView(root, focusState = null, options = {}) {
  if (!cachedState && !options.savedState && safeJson(window.localStorage?.getItem(STORAGE_KEY))) {
    hasUnsavedChanges = true;
  }
  const saved = readSavedState(options.savedState);
  const activeRanges = saved.rangesByTeacher[saved.teacherType] || [];
  const sim = simulateSalaryRanges({ ...saved.controls, teacherType: saved.teacherType }, activeRanges);
  const isDailyView = saved.payView === 'daily';
  const isVacationView = saved.payView === 'vacation';
  const serviceAdjustments = saved.serviceAdjustmentsByTeacher?.[saved.teacherType]?.[saved.payView] || {};

  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Rangos salariales</p><h2>${payViewTitle(saved.payView)}</h2></div>
      <div class="actions">
        ${payViewSwitch(saved.payView)}
        ${teacherSwitch(saved.teacherType)}
        <span class="muted salary-save-status">${hasUnsavedChanges ? 'Cambios de prueba sin guardar' : 'Guardado en Firebase'}</span>
        ${options.canWrite ? '<button class="btn btn-primary" id="salaryRangesSave" type="button">Guardar en Firebase</button>' : ''}
        <button class="btn btn-secondary" id="salaryRangesReset" type="button">Restaurar base</button>
      </div>
    </section>
    ${reading(sim, saved.payView)}
    ${controlPanel(sim.controls, saved.payView)}
    ${isDailyView ? dailyPayPanel(sim, serviceAdjustments) : isVacationView ? vacationPayPanel(sim, serviceAdjustments) : `
      ${legalRulesPanel(sim.controls)}
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
    </section>`}
    ${costNotes(saved.payView)}`;

  root.querySelectorAll('[data-salary-control], [data-salary-row], [data-service-row]').forEach((input) => {
    input.addEventListener('input', () => {
      saveFromDom(root, options, null, null, false, null, input.name);
      scheduleSalaryRangesRender(root, captureFocus(input));
    });
    input.addEventListener('change', () => {
      saveFromDom(root, options, null, null, false, null, input.name);
      renderFairPayView(root, captureFocus(input), options);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
  });
  root.querySelectorAll('[data-teacher-type]').forEach((button) => {
    button.addEventListener('click', () => {
      saveFromDom(root, options, button.dataset.teacherType);
      renderFairPayView(root, null, options);
    });
  });
  root.querySelectorAll('[data-pay-view]').forEach((button) => {
    button.addEventListener('click', () => {
      saveFromDom(root, options, null, null, false, button.dataset.payView);
      renderFairPayView(root, null, options);
    });
  });
  root.querySelectorAll('[data-delete-range]').forEach((button) => {
    button.addEventListener('click', () => {
      saveFromDom(root, options, null, Number(button.dataset.deleteRange));
      renderFairPayView(root, null, options);
    });
  });
  root.querySelector('#salaryRangeAdd')?.addEventListener('click', () => {
    saveFromDom(root, options, null, null, true);
    renderFairPayView(root, null, options);
  });
  root.querySelector('#salaryRangesReset')?.addEventListener('click', () => {
    const restored = readSavedState({}, true);
    persistLocalState(restored);
    renderFairPayView(root, null, { ...options, savedState: restored });
  });
  root.querySelector('#salaryRangesSave')?.addEventListener('click', async () => {
    const button = root.querySelector('#salaryRangesSave');
    if (!options.onSave || !options.canWrite || button?.disabled) return;
    button.disabled = true;
    button.textContent = 'Guardando…';
    try {
      await options.onSave(readSavedState());
      hasUnsavedChanges = false;
      showToast('Cambios guardados en Firebase. Ya los pueden ver los usuarios con acceso.');
      renderFairPayView(root, null, options);
    } catch (error) {
      console.error('No se pudo guardar la configuracion de pagos en Firebase.', error);
      showToast('No se pudo guardar en Firebase. Revisa tu conexion o permisos.', 'error');
      button.disabled = false;
      button.textContent = 'Guardar en Firebase';
    }
  });
  restoreFocus(root, focusState);
}

function payViewSwitch(activeView) {
  const views = [
    ['weekly', 'Horas semanales'],
    ['daily', 'Pago por jornadas'],
    ['vacation', 'Vacacionales'],
  ];
  return `<div class="segmented salary-view-switch" aria-label="Vista de pago">
    ${views.map(([view, label]) => `<button type="button" data-pay-view="${view}" class="${view === activeView ? 'is-active' : ''}">${escapeHtml(label)}</button>`).join('')}
  </div>`;
}

function payViewTitle(payView) {
  if (payView === 'daily') return 'Pago por jornadas';
  if (payView === 'vacation') return 'Pago para vacacionales';
  return 'Modelo porcentual por horas semanales';
}

function teacherSwitch(activeType) {
  return `<div class="segmented salary-teacher-switch" aria-label="Tipo de docente">
    ${['A', 'B'].map((type) => {
      const profile = getTeacherProfile(type);
      return `<button type="button" data-teacher-type="${type}" class="${type === activeType ? 'is-active' : ''}">${escapeHtml(profile.label)}</button>`;
    }).join('')}
  </div>`;
}

function reading(sim, payView) {
  const isServiceView = ['daily', 'vacation'].includes(payView);
  const text = isServiceView
    ? `Base actual: ${sim.controls.teacherLabel} usa ${formatCurrency(sim.controls.baseHourlyPay)} como valor hora de prestacion de servicios. No incluye nomina, prestaciones, auxilios ni aportes; solo baja el valor hora cuando aumenta el volumen.`
    : `Base actual: ${sim.controls.teacherLabel} usa ${formatCurrency(sim.controls.baseHourlyPay)} como costo final por hora en el rango de 28h. Los demas rangos salen de ese valor y el desglose separa salario, auxilio, aportes, prestaciones y extras.`;
  return `<section class="reading healthy"><p>${escapeHtml(text)}</p></section>`;
}

function controlPanel(controls, payView) {
  if (['daily', 'vacation'].includes(payView)) {
    return `<section class="panel salary-ranges-controls salary-service-controls">
      ${controlInput('baseHourlyPay', `Valor hora base prestacion ${controls.teacherLabel}`, controls.baseHourlyPay, '$', 100)}
    </section>`;
  }
  return `<section class="panel salary-ranges-controls">
    ${controlInput('baseHourlyPay', `Costo final hora base 28h ${controls.teacherLabel}`, controls.baseHourlyPay, '$', 100)}
    ${controlInput('smmlvMonthly', 'SMMLV mensual referencial', controls.smmlvMonthly, '$', 1000)}
    ${controlInput('transportSubsidy', 'Auxilio transporte', controls.transportSubsidy, '$', 1000)}
    ${controlInput('dotationAnnual', 'Dotacion anual', controls.dotationAnnual, '$', 1000)}
    ${controlInput('medicalExamAnnual', 'Examenes medicos anual', controls.medicalExamAnnual, '$', 1000)}
  </section>`;
}

function legalRulesPanel(controls) {
  const rate = (name, label) => ruleInput(name, label, controls.rates[name] * 100, '%', 0.01);
  return `<section class="panel salary-legal-rules">
    <div class="fixed-cost-list-head">
      <div>
        <h3>Reglas legales y supuestos</h3>
        <p class="muted">La base de aportes se toma como el mayor valor entre salario base y SMMLV. Los porcentajes quedan editables para revisar cambios normativos o ARL.</p>
      </div>
    </div>
    <div class="salary-rule-summary">
      <div><span>Base minima aportes</span><strong>max(salario base, SMMLV)</strong></div>
      <div><span>Prestaciones</span><strong>sobre salario base del rango</strong></div>
      <div><span>Auxilio, dotacion y examenes</span><strong>valores mensuales/anuales configurables</strong></div>
    </div>
    <div class="salary-rule-grid">
      ${rate('employeeHealth', 'Salud empleado')}
      ${rate('employeePension', 'Pension empleado')}
      ${rate('employerHealth', 'Salud empresa')}
      ${rate('employerPension', 'Pension empresa')}
      ${rate('arl', 'ARL')}
      ${rate('compensationFund', 'Caja compensacion')}
      ${rate('severance', 'Cesantias')}
      ${rate('severanceInterest', 'Intereses cesantias')}
      ${rate('bonus', 'Prima')}
      ${rate('vacation', 'Vacaciones')}
    </div>
  </section>`;
}

function dailyPayPanel(sim, adjustments = {}) {
  const rows = buildDailyPayRows(sim.controls, adjustments);
  return `<section class="panel salary-ranges-panel salary-daily-panel">
    <div class="fixed-cost-list-head">
      <div>
        <h3>Tabla de pago por jornadas</h3>
        <p class="muted">Prestacion de servicios por bloque. El valor hora parte de la base activa y baja por volumen.</p>
      </div>
      <span class="badge healthy">${escapeHtml(sim.controls.teacherLabel)}</span>
    </div>
    <div class="table-wrap"><table class="salary-daily-table">
      <thead>
        <tr>
          <th class="num">Horas bloque</th>
          <th class="num">Ajuste volumen</th>
          <th class="num">Valor hora final</th>
          <th class="num">Pago jornada</th>
          <th>Uso</th>
        </tr>
      </thead>
      <tbody>${rows.map((row) => `<tr>
        <td class="num">${row.hours}</td>
        <td class="num">${serviceRowInput(row.id, 'pct', row.volumeDiscountPct * 100, 0.5, '%')}</td>
        <td class="num">${serviceRowInput(row.id, 'value', row.hourlyPay, 100, '$')}</td>
        <td class="num"><strong>${formatCurrency(row.totalPay)}</strong></td>
        <td>${escapeHtml(row.label)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function buildDailyPayRows(controls, adjustments = {}) {
  return Array.from({ length: 7 }, (_item, index) => {
    const hours = index + 2;
    const id = `daily-${hours}`;
    const volumeDiscountPct = normalizeServiceDiscount(adjustments[id], dailyVolumeDiscount(hours));
    const hourlyPay = controls.baseHourlyPay * (1 - volumeDiscountPct);
    return {
      id,
      hours,
      volumeDiscountPct,
      hourlyPay,
      totalPay: hourlyPay * hours,
      label: `${hours} horas en una misma jornada`,
    };
  });
}

function dailyVolumeDiscount(hours) {
  return Math.max(0, (hours - 2) * 0.02);
}

function vacationPayPanel(sim, adjustments = {}) {
  const rows = buildVacationPayRows(sim.controls, adjustments);
  return `<section class="panel salary-ranges-panel salary-vacation-panel">
    <div class="fixed-cost-list-head">
      <div>
        <h3>Tabla de pago para vacacionales</h3>
        <p class="muted">Prestacion de servicios para paquetes de vacacionales. No suma cargas laborales; aplica descuento por volumen de horas.</p>
      </div>
      <span class="badge healthy">${escapeHtml(sim.controls.teacherLabel)}</span>
    </div>
    <div class="table-wrap"><table class="salary-vacation-table">
      <thead>
        <tr>
          <th>Opcion</th>
          <th class="num">Dias</th>
          <th class="num">Horas</th>
          <th class="num">Ajuste volumen</th>
          <th class="num">Valor hora final</th>
          <th class="num">Pago total</th>
        </tr>
      </thead>
      <tbody>${rows.map((row) => `<tr>
        <td><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.note)}</small></td>
        <td class="num">${row.days}</td>
        <td class="num">${row.hours}</td>
        <td class="num">${serviceRowInput(row.id, 'pct', row.volumeDiscountPct * 100, 0.5, '%')}</td>
        <td class="num">${serviceRowInput(row.id, 'value', row.hourlyPay, 100, '$')}</td>
        <td class="num"><strong>${formatCurrency(row.totalPay)}</strong></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function buildVacationPayRows(controls, adjustments = {}) {
  const dayHours = 4;
  const rows = [
    ['vacation-day', 'Por dia', 1, 0, '4 horas en un dia'],
    ['vacation-week-4', 'Semana 4 dias', 4, 0.05, '16 horas en la semana'],
    ['vacation-week-5', 'Semana 5 dias', 5, 0.07, '20 horas en la semana'],
    ['vacation-4-4', 'Dos semanas 4 + 4', 8, 0.1, '32 horas combinadas'],
    ['vacation-5-5', 'Dos semanas 5 + 5', 10, 0.14, '40 horas combinadas'],
    ['vacation-5-4', 'Dos semanas 5 + 4', 9, 0.12, '36 horas combinadas'],
    ['vacation-4-5', 'Dos semanas 4 + 5', 9, 0.12, '36 horas combinadas'],
  ];
  return rows.map(([id, label, days, defaultDiscountPct, note]) => {
    const hours = days * dayHours;
    const volumeDiscountPct = normalizeServiceDiscount(adjustments[id], defaultDiscountPct);
    const hourlyPay = controls.baseHourlyPay * (1 - volumeDiscountPct);
    return {
      id,
      label,
      days,
      hours,
      note,
      volumeDiscountPct,
      hourlyPay,
      totalPay: hourlyPay * hours,
    };
  });
}

function summaryCards(sim) {
  const items = [
    ['Salario base prom.', formatCurrency(sim.summary.averageSalary), 'Despues de reservar costos laborales'],
    ['Costo empresa prom.', formatCurrency(sim.summary.averageCompanyCost), 'Promedio simple de rangos'],
    ['Rangos semanales', String(sim.summary.reviewedRanges), 'Puedes agregar o quitar jornadas'],
    ['Costo final 28h', formatCurrency(sim.controls.baseHourlyPay), sim.controls.teacherLabel],
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
        <th class="num">Costo final/hora</th>
        <th class="num">Salario base</th>
        <th class="num">Costo real empresa</th>
        <th class="num">Costo/hora</th>
        <th>Desglose</th>
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
      <td>${breakdownDetails(row)}</td>
      <td class="num">${row.salaryDifference == null ? 'Base' : formatCurrency(row.salaryDifference)}</td>
      <td class="num">${row.costDifference == null ? 'Base' : formatCurrency(row.costDifference)}</td>
      <td class="num"><button class="btn btn-ghost" data-delete-range="${index}" type="button">Eliminar</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function costNotes(payView) {
  if (['daily', 'vacation'].includes(payView)) {
    return `<section class="panel salary-cost-notes">
      <h3>Como leerlo</h3>
      <div class="exec-quick">
        <div><span>Prestacion</span><strong>Solo calcula pago por servicios, sin nomina ni cargas legales</strong></div>
        <div><span>Valor hora base</span><strong>Es el punto de partida manual para ${payView === 'vacation' ? 'vacacionales' : 'jornadas'}</strong></div>
        <div><span>Volumen</span><strong>A mas horas contratadas, menor valor hora final</strong></div>
        <div><span>Total</span><strong>Valor hora final multiplicado por las horas del bloque</strong></div>
      </div>
    </section>`;
  }
  return `<section class="panel salary-cost-notes">
    <h3>Como leerlo</h3>
    <div class="exec-quick">
      <div><span>Horas semanales</span><strong>Unidad principal para crear y comparar rangos</strong></div>
      <div><span>Base manual</span><strong>El rango 28h define el costo final por hora</strong></div>
      <div><span>Diferenciales</span><strong>Comparan salario y costo contra el rango anterior</strong></div>
      <div><span>Costos</span><strong>Auxilio, aportes, prestaciones, dotacion y examenes</strong></div>
    </div>
  </section>`;
}

function breakdownDetails(row) {
  const items = [
    ['Salario base', row.salary],
    ['Base aportes', row.contributionBase],
    ['Auxilio transporte', row.transportSubsidy],
    ['Salud empleado', row.employeeHealth],
    ['Pension empleado', row.employeePension],
    ['Pago neto aprox.', row.netPay],
    ['Cesantias', row.severance],
    ['Intereses cesantias', row.severanceInterest],
    ['Prima', row.bonus],
    ['Vacaciones', row.vacation],
    ['Salud empresa', row.employerHealth],
    ['Pension empresa', row.employerPension],
    ['ARL', row.arl],
    ['Caja compensacion', row.compensationFund],
    ['Dotacion mensual', row.dotationMonthly],
    ['Examen mensual', row.medicalExamMonthly],
  ];
  return `<details class="salary-breakdown">
    <summary>Ver costos</summary>
    <dl>${items.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${formatCurrency(value)}</dd></div>`).join('')}</dl>
  </details>`;
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

function ruleInput(name, label, value, suffix, step) {
  return `<label class="field salary-range-field">
    <span>${escapeHtml(label)}</span>
    <div class="fair-pay-input-wrap">
      <input data-salary-control="${name}" name="rate:${name}" type="number" step="${step}" min="0" value="${escapeHtml(String(roundRate(value)))}" />
      <em>${escapeHtml(suffix)}</em>
    </div>
  </label>`;
}

function rowInput(index, name, value, step, suffix = '') {
  return `<span class="salary-row-input-wrap"><input class="table-input" data-salary-row="${index}:${name}" name="row:${index}:${name}" type="number" step="${step}" min="${name.includes('Pct') ? '-80' : '0'}" value="${escapeHtml(String(roundValue(value)))}" />${suffix ? `<em>${escapeHtml(suffix)}</em>` : ''}</span>`;
}

function serviceRowInput(rowId, field, value, step, suffix = '') {
  const displayValue = field === 'pct' ? roundRate(value) : roundValue(value);
  return `<span class="salary-row-input-wrap salary-service-input-wrap"><input class="table-input" data-service-row="${escapeHtml(`${rowId}:${field}`)}" name="service:${rowId}:${field}" type="number" step="${step}" min="0" value="${escapeHtml(String(displayValue))}" />${suffix ? `<em>${escapeHtml(suffix)}</em>` : ''}</span>`;
}

function readSavedState(source = null, preferSource = false) {
  const parsed = preferSource ? source : (cachedState || source || safeJson(window.localStorage?.getItem(STORAGE_KEY)));
  const teacherType = parsed?.teacherType === 'B' ? 'B' : 'A';
  const payView = ['daily', 'vacation'].includes(parsed?.payView) ? parsed.payView : 'weekly';
  const commonControls = normalizeLegacyControls(parsed?.controls || {});
  const teacherControls = normalizeLegacyTeacherControls(teacherType, commonControls, parsed?.controlsByTeacher?.[teacherType] || {});
  const controls = normalizeSalaryRangeControls({ ...commonControls, ...teacherControls, teacherType });
  return {
    teacherType,
    payView,
    controls,
    controlsByTeacher: parsed?.controlsByTeacher || {},
    rangesByTeacher: parsed?.rangesByTeacher || migrateLegacyRows(parsed),
    serviceAdjustmentsByTeacher: parsed?.serviceAdjustmentsByTeacher || {},
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

function saveFromDom(root, options, nextTeacherType = null, deleteIndex = null, addRange = false, nextPayView = null, lastEditedName = '') {
  const current = readSavedState(options.savedState);
  const activeTeacherType = root.querySelector('[data-teacher-type].is-active')?.dataset.teacherType || current.teacherType;
  const targetTeacherType = nextTeacherType || activeTeacherType;
  const activePayView = root.querySelector('[data-pay-view].is-active')?.dataset.payView || current.payView;
  const targetPayView = nextPayView || activePayView;
  const controls = {
    smmlvMonthly: valueOrCurrent(root, 'smmlvMonthly', current.controls.smmlvMonthly),
    transportSubsidy: valueOrCurrent(root, 'transportSubsidy', current.controls.transportSubsidy),
    dotationAnnual: valueOrCurrent(root, 'dotationAnnual', current.controls.dotationAnnual),
    medicalExamAnnual: valueOrCurrent(root, 'medicalExamAnnual', current.controls.medicalExamAnnual),
    rates: {
      employeeHealth: valueOrCurrent(root, 'rate:employeeHealth', current.controls.rates.employeeHealth * 100) / 100,
      employeePension: valueOrCurrent(root, 'rate:employeePension', current.controls.rates.employeePension * 100) / 100,
      employerHealth: valueOrCurrent(root, 'rate:employerHealth', current.controls.rates.employerHealth * 100) / 100,
      employerPension: valueOrCurrent(root, 'rate:employerPension', current.controls.rates.employerPension * 100) / 100,
      arl: valueOrCurrent(root, 'rate:arl', current.controls.rates.arl * 100) / 100,
      compensationFund: valueOrCurrent(root, 'rate:compensationFund', current.controls.rates.compensationFund * 100) / 100,
      severance: valueOrCurrent(root, 'rate:severance', current.controls.rates.severance * 100) / 100,
      severanceInterest: valueOrCurrent(root, 'rate:severanceInterest', current.controls.rates.severanceInterest * 100) / 100,
      bonus: valueOrCurrent(root, 'rate:bonus', current.controls.rates.bonus * 100) / 100,
      vacation: valueOrCurrent(root, 'rate:vacation', current.controls.rates.vacation * 100) / 100,
    },
  };
  const controlsByTeacher = {
    ...current.controlsByTeacher,
    [activeTeacherType]: {
      baseHourlyPay: valueOrCurrent(root, 'baseHourlyPay', current.controlsByTeacher?.[activeTeacherType]?.baseHourlyPay || current.controls.baseHourlyPay),
    },
  };
  const hasRangeRows = Boolean(root.querySelector('[data-salary-row]'));
  let ranges = hasRangeRows
    ? normalizeRanges(currentRangesFromDom(root, activeTeacherType), activeTeacherType)
    : (current.rangesByTeacher[activeTeacherType] || []);
  if (deleteIndex != null) ranges = ranges.filter((_range, index) => index !== deleteIndex);
  if (addRange) {
    const last = ranges[ranges.length - 1] || { weeklyHours: 28, payAdjustmentPct: 0 };
    ranges.push({ ...last, weeklyHours: last.weeklyHours + 2 });
  }
  const rangesByTeacher = {
    ...current.rangesByTeacher,
    [activeTeacherType]: ranges,
  };
  const hasServiceRows = Boolean(root.querySelector('[data-service-row]'));
  const serviceAdjustmentsByTeacher = {
    ...current.serviceAdjustmentsByTeacher,
  };
  if (hasServiceRows) {
    serviceAdjustmentsByTeacher[activeTeacherType] = {
      ...(serviceAdjustmentsByTeacher[activeTeacherType] || {}),
      [activePayView]: currentServiceAdjustmentsFromDom(root, activePayView, valueOrCurrent(root, 'baseHourlyPay', current.controls.baseHourlyPay), lastEditedName),
    };
  }
  persistLocalState({
    teacherType: targetTeacherType,
    payView: targetPayView,
    controls,
    controlsByTeacher,
    rangesByTeacher,
    serviceAdjustmentsByTeacher,
  }, options);
}

function persistLocalState(nextState) {
  // Los cambios se conservan para probarlos. Solo el boton explicito los envia a Firebase.
  window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(nextState));
  cachedState = nextState;
  hasUnsavedChanges = true;
}

function currentServiceAdjustmentsFromDom(root, payView, baseHourlyPay, lastEditedName) {
  const definitions = payView === 'vacation'
    ? buildVacationPayRows({ baseHourlyPay }, {})
    : buildDailyPayRows({ baseHourlyPay }, {});
  return Object.fromEntries(definitions.map((row) => {
    const pctName = `service:${row.id}:pct`;
    const valueName = `service:${row.id}:value`;
    const pctInput = root.querySelector(`[name="${CSS.escape(pctName)}"]`);
    const valueInput = root.querySelector(`[name="${CSS.escape(valueName)}"]`);
    const pctValue = Number(pctInput?.value || 0) / 100;
    const hourlyValue = Number(valueInput?.value || 0);
    const discount = lastEditedName === valueName
      ? 1 - safeDivideLocal(hourlyValue, baseHourlyPay)
      : pctValue;
    return [row.id, normalizeServiceDiscount(discount, row.volumeDiscountPct)];
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

function valueOrCurrent(root, name, currentValue) {
  const input = root.querySelector(`[name="${CSS.escape(name)}"]`);
  return input ? Number(input.value || 0) : currentValue;
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

function roundRate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : value;
}

function normalizeServiceDiscount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(0.8, n)) : fallback;
}

function safeDivideLocal(value, divisor) {
  return divisor ? value / divisor : 0;
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
