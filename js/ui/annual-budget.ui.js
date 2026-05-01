import { MONTHS_ES } from '../domain/annual.engine.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent, formatUpdatedAt, labelForHealth } from '../utils/format.js';

export function renderAnnualBudgetView(root, ctx) {
  const budget = ctx.bundle.annualBudget?.budget;
  const annual = ctx.annualBudgetResult;
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Presupuesto anual</p><h2>Cronograma mensual de ingresos y gastos</h2></div>
      <div class="actions">
        ${scenarioSelector(ctx, budget)}
        ${budget ? '' : `<button class="btn btn-primary" id="createAnnualBudget" ${ctx.canWrite ? '' : 'disabled'}>Crear presupuesto anual base</button>`}
      </div>
    </section>
    ${!budget ? emptyBudget(ctx) : budgetView(ctx, annual)}
  `;
  root.querySelector('#createAnnualBudget')?.addEventListener('click', () => ctx.actions.createAnnualBudget());
  root.querySelector('#annualBaseScenario')?.addEventListener('change', (event) => ctx.actions.updateAnnualBudgetBaseScenario(event.target.value));
  root.querySelector('#cleanAnnualMonths')?.addEventListener('click', () => ctx.actions.cleanAnnualBudgetMonths());
  root.querySelector('#newAnnualCycle')?.addEventListener('click', () => ctx.actions.annualCycleForm());
  root.querySelectorAll('[data-edit-cycle]').forEach((button) => button.addEventListener('click', () => ctx.actions.annualCycleForm(ctx.bundle.annualBudget.cycles.find((cycle) => cycle.id === button.dataset.editCycle))));
  root.querySelectorAll('[data-del-cycle]').forEach((button) => button.addEventListener('click', () => ctx.actions.deleteAnnualCycle(ctx.bundle.annualBudget.cycles.find((cycle) => cycle.id === button.dataset.delCycle))));
  root.querySelectorAll('[data-edit-month]').forEach((button) => {
    button.addEventListener('click', () => {
      const month = annual.months.find((item) => item.yearMonth === button.dataset.editMonth);
      ctx.actions.annualMonthForm(month?.monthPlan);
    });
  });
}

export function annualMonthModalContent(ctx, monthPlan = {}) {
  const baseScenarioId = ctx.bundle.annualBudget?.budget?.baseScenarioId || ctx.activeScenario?.id || '';
  const activeScenario = ctx.bundle.scenarios.find((scenario) => scenario.id === baseScenarioId) || ctx.activeScenario;
  const items = activeScenario ? (ctx.bundle.scenarioItems.get(activeScenario.id) || []) : [];
  const baseScenarioName = activeScenario?.name || 'Escenario base';
  return `
    <div class="modal-head"><h3>${escapeHtml(MONTHS_ES[(monthPlan.monthIndex || 1) - 1])} ${escapeHtml(String(ctx.bundle.annualBudget?.budget?.year || 2026))}</h3><button class="btn btn-ghost" data-close-modal type="button">Cerrar</button></div>
    <form id="annualMonthForm">
      <div class="modal-body annual-month-form">
        <div class="form-grid">
          <label class="field"><span>Escenario base usado</span><input type="text" value="${escapeHtml(baseScenarioName)}" disabled></label>
          <label class="field"><span>Multiplicador de ingresos</span><input type="number" step="any" name="revenueMultiplier" value="${escapeHtml(monthPlan.revenueMultiplier ?? 1)}"></label>
          <label class="field"><span>Estudiantes/personas objetivo</span><input type="number" step="any" name="targetStudents" value="${escapeHtml(monthPlan.targetStudents ?? 0)}"></label>
          <label class="field field-wide"><span>Notas</span><textarea name="notes">${escapeHtml(monthPlan.notes || '')}</textarea></label>
        </div>
        ${entriesEditor('Ingresos extraordinarios', 'extraIncomes', monthPlan.extraIncomes)}
        ${entriesEditor('Gastos extraordinarios', 'extraExpenses', monthPlan.extraExpenses)}
        <section class="annual-service-overrides">
          <h4>Overrides básicos por servicio</h4>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Servicio</th><th>Clases</th><th>Paquetes</th><th>Suscriptores</th><th>Precio</th><th>Estudiantes/clase</th></tr></thead>
              <tbody>${items.map((item) => serviceOverrideRow(item, monthPlan.serviceOverrides?.[item.serviceId])).join('')}</tbody>
            </table>
          </div>
        </section>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-close-modal type="button">Cancelar</button>
        <button class="btn btn-primary" type="submit">Guardar mes</button>
      </div>
    </form>`;
}

export function readAnnualMonthForm(form, monthPlan = {}) {
  const serviceOverrides = {};
  form.querySelectorAll('[data-service-override]').forEach((row) => {
    const values = {};
    row.querySelectorAll('[data-override-field]').forEach((input) => {
      if (input.value !== '') values[input.dataset.overrideField] = Number(input.value);
    });
    if (Object.keys(values).length) serviceOverrides[row.dataset.serviceOverride] = values;
  });
  return {
    yearMonth: monthPlan.yearMonth,
    monthIndex: monthPlan.monthIndex,
    revenueMultiplier: Number(form.elements.revenueMultiplier.value) || 1,
    targetStudents: Number(form.elements.targetStudents.value) || 0,
    notes: form.elements.notes.value || '',
    extraIncomes: readEntries(form, 'extraIncomes'),
    extraExpenses: readEntries(form, 'extraExpenses'),
    serviceOverrides,
  };
}

export function annualCycleModalContent(ctx, cycle = null) {
  const packageServices = ctx.bundle.services.filter((service) => service.active !== false && service.pricingModel === 'package');
  const selectedService = packageServices.find((service) => service.id === cycle?.serviceId) || packageServices[0] || {};
  return `
    <div class="modal-head"><h3>${cycle ? 'Editar ciclo especial' : 'Crear ciclo especial'}</h3><button class="btn btn-ghost" data-close-modal type="button">Cerrar</button></div>
    <form id="annualCycleForm">
      <div class="modal-body form-grid">
        <label class="field field-wide"><span>Servicio</span><select name="serviceId">${packageServices.map((service) => `<option value="${service.id}" ${service.id === selectedService.id ? 'selected' : ''}>${escapeHtml(service.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Mes de inicio</span><select name="startMonth">${MONTHS_ES.map((month, index) => `<option value="${index + 1}" ${index + 1 === (cycle?.startMonth || selectedService.cycleStartMonths?.[0] || 1) ? 'selected' : ''}>${escapeHtml(month)}</option>`).join('')}</select></label>
        <label class="field"><span>Duracion</span><input type="number" step="any" name="durationMonths" value="${escapeHtml(cycle?.durationMonths ?? selectedService.packageDurationMonths ?? 1)}"></label>
        <label class="field"><span>Paquetes vendidos / inscritos / grupos</span><input type="number" step="any" name="packagesSold" value="${escapeHtml(cycle?.packagesSold ?? 0)}"></label>
        <p class="form-help">Los paquetes se cobran completos al inicio del ciclo.</p>
        <label class="field field-wide"><span>Notas</span><textarea name="notes">${escapeHtml(cycle?.notes || '')}</textarea></label>
      </div>
      <div class="modal-actions"><button class="btn btn-secondary" data-close-modal type="button">Cancelar</button><button class="btn btn-primary" type="submit">Guardar ciclo</button></div>
    </form>`;
}

export function readAnnualCycleForm(form) {
  const selected = form.elements.serviceId.selectedOptions[0];
  return {
    serviceId: form.elements.serviceId.value,
    serviceName: selected?.textContent || '',
    startMonth: Number(form.elements.startMonth.value) || 1,
    durationMonths: Number(form.elements.durationMonths.value) || 1,
    packagesSold: Number(form.elements.packagesSold.value) || 0,
    paymentMode: 'upfront',
    notes: form.elements.notes.value || '',
  };
}

function scenarioSelector(ctx, budget) {
  if (!ctx.bundle.scenarios.length) return '';
  return `
    <label class="field compact-field">
      <span>Escenario base</span>
      <select id="annualBaseScenario" ${budget && ctx.canWrite ? '' : 'disabled'}>
        ${ctx.bundle.scenarios.map((scenario) => `<option value="${scenario.id}" ${scenario.id === (budget?.baseScenarioId || ctx.activeScenario?.id) ? 'selected' : ''}>${escapeHtml(scenario.name)}</option>`).join('')}
      </select>
    </label>`;
}

function emptyBudget(ctx) {
  return `<section class="empty-state"><h2>No hay presupuesto anual creado</h2><p>Usa un escenario mensual como base y crea los 12 meses del presupuesto ${escapeHtml(ctx.bundle.plan?.year || 2026)}.</p></section>`;
}

function budgetView(ctx, annual) {
  return `
    ${staleMonthPlansWarning(ctx)}
    <section class="kpi-grid annual-kpis">
      ${kpi('Ingresos anuales', formatCurrency(annual.grossRevenue), `IVA ${formatCurrency(annual.vatAmount)}`)}
      ${kpi('Operativo sin IVA', formatCurrency(annual.operatingRevenue), `Retencion ${formatCurrency(annual.totalWithholdingAmount)}`)}
      ${kpi('Costos y gastos', formatCurrency(annual.totalVariableCosts + annual.fixedCostsBudgeted + annual.extraExpenses), `Fijos ${formatCurrency(annual.fixedCostsBudgeted)}`)}
      ${kpi('Utilidad neta anual', formatCurrency(annual.netProfit), `Impuesto anual ${formatCurrency(annual.incomeTax)}`)}
      ${kpi('Mejor mes', annual.bestMonth?.monthName || '-', annual.bestMonth ? formatCurrency(annual.bestMonth.netProfit) : '')}
      ${kpi('Peor mes', annual.worstMonth?.monthName || '-', annual.worstMonth ? formatCurrency(annual.worstMonth.netProfit) : '')}
      ${kpi('Meses en perdida', String(annual.lossMonths.length), annual.lossMonths.map((month) => month.monthName).join(', ') || 'Ninguno')}
      ${kpi('Debajo de meta', String(annual.belowTargetMonths.length), annual.belowTargetMonths.map((month) => month.monthName).join(', ') || 'Ninguno')}
      ${kpi('Caja cobrada', formatCurrency(annual.cashCollected), 'Flujo bruto del año')}
      ${kpi('Clases dictadas', String(Math.round(annual.totalClasses || 0)), `Pico activos ${Math.round(annual.activeStudentsPeak || 0)}`)}
    </section>
    <section class="reading healthy">
      <p>${annualExplanation(annual)}</p>
    </section>
    ${cyclesSection(ctx)}
    <section class="panel annual-table-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Mes</th><th>Estado</th><th class="num">Operativo</th><th class="num">Caja cobrada</th><th class="num">IVA</th><th class="num">Variables</th><th class="num">Fijos presup.</th><th class="num">Extra gastos</th><th class="num">Util. operativa</th><th class="num">Util. neta</th><th class="num">Clases</th><th class="num">Activos</th><th></th></tr>
          </thead>
          <tbody>${annual.months.map((month) => monthRow(month, ctx)).join('')}</tbody>
        </table>
      </div>
    </section>`;
}

function staleMonthPlansWarning(ctx) {
  const baseScenarioId = ctx.bundle.annualBudget?.budget?.baseScenarioId || '';
  const hasStaleMonths = (ctx.bundle.annualBudget?.months || []).some((month) => month.scenarioId && month.scenarioId !== baseScenarioId);
  if (!hasStaleMonths) return '';
  return `<section class="reading tight"><p>Hay meses guardados con un escenario anterior. El calculo actual ya usa el escenario base seleccionado, pero puedes regenerar los meses para limpiar esos datos.</p><div class="actions"><button class="btn btn-secondary" id="cleanAnnualMonths" ${ctx.canWrite ? '' : 'disabled'}>Limpiar meses del presupuesto</button></div></section>`;
}

function annualExplanation(annual) {
  if (annual.cycleOperatingRevenue > 0) {
    return `El presupuesto anual toma ${formatCurrency(annual.baseScenarioOperatingRevenue)} del escenario base seleccionado y ${formatCurrency(annual.cycleOperatingRevenue)} de ciclos de paquetes. La caja cobrada suma ${formatCurrency(annual.baseScenarioCashCollected)} del escenario base y ${formatCurrency(annual.cycleCashCollected)} de cobros al inicio de paquetes.`;
  }
  return `El presupuesto anual toma ${formatCurrency(annual.baseScenarioOperatingRevenue)} del escenario base seleccionado. No hay ciclos automaticos activos. La caja cobrada suma ${formatCurrency(annual.baseScenarioCashCollected)}.`;
}

function cyclesSection(ctx) {
  const cycles = ctx.annualBudgetResult?.cycles || [];
  return `<section class="panel annual-cycles">
    <div class="fixed-cost-list-head">
      <div><h3>Ciclos del presupuesto</h3><p class="muted">Los ciclos automaticos salen de los servicios con fechas fijas y del escenario base. Agrega uno manual solo para ajustes excepcionales.</p></div>
      <button class="btn btn-primary" id="newAnnualCycle" ${ctx.canWrite ? '' : 'disabled'}>Agregar ajuste manual</button>
    </div>
    ${cycles.length ? `<div class="table-wrap"><table><thead><tr><th>Servicio</th><th>Origen</th><th>Inicio</th><th>Duracion</th><th class="num">Paquetes</th><th>Pago</th><th>Notas</th><th>Ultima edicion</th><th></th></tr></thead><tbody>${cycles.map((cycle) => cycleRow(cycle, ctx)).join('')}</tbody></table></div>` : '<p class="muted">No hay ciclos automaticos ni ajustes manuales.</p>'}
  </section>`;
}

function cycleRow(cycle, ctx) {
  return `<tr>
    <td><strong>${escapeHtml(cycle.serviceName || 'Servicio')}</strong></td>
    <td><span class="badge ${cycle.source === 'automatic' ? 'healthy' : 'tight'}">${cycle.source === 'automatic' ? 'Automatico' : 'Manual'}</span></td>
    <td>${escapeHtml(MONTHS_ES[(cycle.startMonth || 1) - 1] || '')}</td>
    <td>${escapeHtml(String(cycle.durationMonths || 1))} meses</td>
    <td class="num">${escapeHtml(String(cycle.packagesSold || 0))}</td>
    <td>Inicio</td>
    <td>${escapeHtml(cycle.notes || '')}</td>
    <td class="nowrap"><small>${cycle.source === 'automatic' ? 'Desde servicio + escenario' : escapeHtml(formatUpdatedAt(cycle))}</small></td>
    <td class="nowrap">${cycle.source === 'automatic' ? '' : `<button class="btn btn-ghost" data-edit-cycle="${escapeHtml(cycle.id)}" ${ctx.canWrite ? '' : 'disabled'}>Editar</button><button class="btn btn-ghost" data-del-cycle="${escapeHtml(cycle.id)}" ${ctx.canWrite ? '' : 'disabled'}>Eliminar</button>`}</td>
  </tr>`;
}

function monthRow(month, ctx) {
  return `<tr>
    <td><strong>${escapeHtml(month.monthName)}</strong><br><small>${escapeHtml(month.yearMonth)}</small></td>
    <td><span class="badge ${month.healthStatus}">${escapeHtml(labelForHealth(month.healthStatus))}</span></td>
    <td class="num">${formatCurrency(month.operatingRevenue)}</td>
    <td class="num">${formatCurrency(month.cashCollected)}</td>
    <td class="num">${formatCurrency(month.vatAmount)}</td>
    <td class="num">${formatCurrency(month.totalVariableCosts)}</td>
    <td class="num">${formatCurrency(month.fixedCostsBudgeted)}</td>
    <td class="num">${formatCurrency(month.extraExpenses)}</td>
    <td class="num">${formatCurrency(month.operatingProfitBeforeIncomeTax)}</td>
    <td class="num"><strong>${formatCurrency(month.netProfit)}</strong><br><small>${formatPercent(month.scenarioResult.contributionMarginPct)}</small></td>
    <td class="num">${Math.round(month.totalClasses || 0)}</td>
    <td class="num">${Math.round(month.activeStudents || 0)}</td>
    <td><button class="btn btn-secondary" data-edit-month="${escapeHtml(month.yearMonth)}" ${ctx.canWrite ? '' : 'disabled'}>Editar</button></td>
  </tr>`;
}

function kpi(label, value, detail = '') {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</article>`;
}

function entriesEditor(title, name, entries = []) {
  const rows = [...(entries || []), { label: '', amount: '' }, { label: '', amount: '' }];
  return `<section class="annual-entry-editor"><h4>${escapeHtml(title)}</h4>${rows.map((entry) => `
    <div class="annual-entry-row" data-entry-group="${name}">
      <input type="text" data-entry-label placeholder="Concepto" value="${escapeHtml(entry.label || '')}">
      <input type="number" step="any" data-entry-amount placeholder="Valor" value="${escapeHtml(entry.amount ?? '')}">
    </div>`).join('')}</section>`;
}

function serviceOverrideRow(item, overrides = {}) {
  return `<tr data-service-override="${escapeHtml(item.serviceId)}">
    <td>${escapeHtml(item.serviceName || 'Servicio')}</td>
    ${overrideInput('expectedClassesPerMonth', overrides)}
    ${overrideInput('expectedPackagesPerMonth', overrides)}
    ${overrideInput('expectedSubscribersPerMonth', overrides)}
    ${overrideInput('customPrice', overrides)}
    ${overrideInput('expectedStudentsPerClass', overrides)}
  </tr>`;
}

function overrideInput(name, overrides) {
  return `<td><input class="table-input" type="number" step="any" data-override-field="${name}" value="${escapeHtml(overrides?.[name] ?? '')}"></td>`;
}

function readEntries(form, groupName) {
  return Array.from(form.querySelectorAll(`[data-entry-group="${groupName}"]`)).map((row) => ({
    label: row.querySelector('[data-entry-label]')?.value || '',
    amount: Number(row.querySelector('[data-entry-amount]')?.value) || 0,
  })).filter((entry) => entry.label || entry.amount);
}
