import { escapeHtml } from '../utils/dom.js';
import { formatCurrency } from '../utils/format.js';
import { calculateCashFlowProjection, MONTH_LABELS } from '../domain/cashflow.engine.js';
import { hintBox, bindHints } from './hints.ui.js';
import { scenarioSelect, bindScenarioSelect } from './scenario-select.ui.js';

const GRANULARITIES = [['monthly', 'Mensual'], ['quarterly', 'Trimestral'], ['annual', 'Anual']];
const viewState = { granularity: 'monthly', includeScenario: true };

export function renderCashFlowView(root, ctx) {
  const items = ctx.bundle.cashFlowItems || [];
  const projection = calculateCashFlowProjection({
    scenarioResult: ctx.calculatedScenario,
    items,
    includeScenario: viewState.includeScenario,
  });
  const movements = items.filter((item) => item.kind !== 'initial');
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Caja</p><h2>Proyeccion de caja</h2></div>
      <div class="actions">
        ${scenarioSelect('cfScenario', ctx)}
        ${ctx.canWrite ? '<button class="btn btn-primary" id="cfAdd" type="button">+ Movimiento</button>' : ''}
      </div>
    </section>
    ${hintBox('cashflow', 'Utilidad no es lo mismo que caja: puedes ganar plata en el año y aun asi quedarte sin efectivo en un mes concreto (prima de diciembre, trimestre flojo, una inversion). Agrega aqui los movimientos que el escenario mensual no captura.')}
    ${alertBanner(projection)}
    <section class="panel cf-config">
      <div class="cf-config-grid">
        <label class="field"><span>Saldo inicial de caja</span>
          <input type="number" id="cfInitial" value="${projection.initialBalance}" ${ctx.canWrite ? '' : 'disabled'} />
        </label>
        ${ctx.canWrite ? '<button class="btn btn-secondary" id="cfSaveInitial" type="button">Guardar saldo</button>' : ''}
        <label class="cf-toggle"><input type="checkbox" id="cfIncludeScenario" ${viewState.includeScenario ? 'checked' : ''} />
          <span>Usar el escenario activo como base mensual (entradas: ${formatCurrency(projection.months[0].scenarioInflow)} · salidas: ${formatCurrency(projection.months[0].scenarioOutflow)})</span>
        </label>
      </div>
    </section>
    <section class="kpi-grid">
      <article class="metric-card"><span>Saldo inicial</span><strong>${formatCurrency(projection.initialBalance)}</strong></article>
      <article class="metric-card"><span>Entradas del año</span><strong>${formatCurrency(projection.totalInflows)}</strong></article>
      <article class="metric-card"><span>Salidas del año</span><strong>${formatCurrency(projection.totalOutflows)}</strong></article>
      <article class="metric-card"><span>Saldo final proyectado</span><strong class="${projection.endBalance < 0 ? 'cf-neg' : ''}">${formatCurrency(projection.endBalance)}</strong><small>Minimo en el año: ${formatCurrency(projection.minBalance)}</small></article>
    </section>
    <section class="panel" style="margin-bottom:16px;">
      <h3>Saldo acumulado</h3>
      ${chart(projection)}
    </section>
    <section class="panel" style="margin-bottom:16px;">
      <div class="fixed-cost-list-head" style="border:0;padding:0;margin-bottom:12px;">
        <h3>Flujo proyectado</h3>
        <div class="segmented" id="cfGranularity">
          ${GRANULARITIES.map(([key, label]) => `<button type="button" data-gran="${key}" class="${key === viewState.granularity ? 'is-active' : ''}">${label}</button>`).join('')}
        </div>
      </div>
      ${flowTable(projection)}
    </section>
    <section class="panel">
      <h3>Movimientos simulados</h3>
      <p class="muted" style="margin:0 0 12px;">Ingresos esperados, gastos, inversiones o pagos puntuales que se suman a la base del escenario. Todo es simulacion: no es contabilidad real.</p>
      ${movements.length ? movementsTable(movements, ctx) : '<p class="muted">Sin movimientos manuales. La proyeccion usa solo el escenario activo.</p>'}
    </section>`;

  bindScenarioSelect(root, 'cfScenario', ctx, 'cashflow');
  root.querySelector('#cfAdd')?.addEventListener('click', () => ctx.actions.cashFlowItemForm());
  bindHints(root);
  root.querySelector('#cfSaveInitial')?.addEventListener('click', () => {
    ctx.actions.saveInitialBalance(Number(root.querySelector('#cfInitial').value) || 0);
  });
  root.querySelector('#cfIncludeScenario')?.addEventListener('change', (e) => {
    viewState.includeScenario = e.target.checked;
    renderCashFlowView(root, ctx);
  });
  root.querySelectorAll('#cfGranularity [data-gran]').forEach((button) => button.addEventListener('click', () => {
    viewState.granularity = button.dataset.gran;
    renderCashFlowView(root, ctx);
  }));
  root.querySelectorAll('[data-edit-cf]').forEach((el) => el.addEventListener('click', () => {
    const item = movements.find((i) => i.id === el.dataset.editCf);
    if (item) ctx.actions.cashFlowItemForm(item);
  }));
  root.querySelectorAll('[data-toggle-cf]').forEach((el) => el.addEventListener('click', () => {
    const item = movements.find((i) => i.id === el.dataset.toggleCf);
    if (item) ctx.actions.toggleCashFlowItem(item);
  }));
  root.querySelectorAll('[data-delete-cf]').forEach((el) => el.addEventListener('click', () => {
    const item = movements.find((i) => i.id === el.dataset.deleteCf);
    if (item) ctx.actions.deleteCashFlowItem(item);
  }));
}

function alertBanner(projection) {
  if (!projection.negativeMonths.length) {
    return `<section class="reading healthy"><p>🟢 La caja proyectada se mantiene positiva todo el año. Saldo final estimado: ${formatCurrency(projection.endBalance)}.</p></section>`;
  }
  const first = projection.firstNegativeMonth;
  return `<section class="reading loss"><p>🔴 La caja proyectada se vuelve negativa en <strong>${first.label}</strong> (${formatCurrency(first.endBalance)}) y hay ${projection.negativeMonths.length} mes${projection.negativeMonths.length > 1 ? 'es' : ''} en rojo. Hay que adelantar cobros, recortar salidas o conseguir liquidez antes de ese mes.</p></section>`;
}

function flowTable(projection) {
  const rows = viewState.granularity === 'monthly' ? projection.months : viewState.granularity === 'quarterly' ? projection.quarters : projection.years;
  return `<div class="table-wrap"><table class="cf-table">
    <thead><tr><th>Periodo</th><th class="num">Saldo inicial</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Neto</th><th class="num">Saldo final</th></tr></thead>
    <tbody>${rows.map((row) => `<tr class="${(row.endBalance < 0 || row.hasNegative) ? 'cf-row-neg' : ''}">
      <td>${row.label}</td>
      <td class="num">${formatCurrency(row.startBalance)}</td>
      <td class="num">${formatCurrency(row.inflows)}</td>
      <td class="num">${formatCurrency(row.outflows)}</td>
      <td class="num ${row.net < 0 ? 'cf-neg' : ''}">${row.net > 0 ? '+' : ''}${formatCurrency(row.net)}</td>
      <td class="num ${row.endBalance < 0 ? 'cf-neg' : ''}">${formatCurrency(row.endBalance)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function movementsTable(movements, ctx) {
  return `<div class="table-wrap"><table class="cf-table">
    <thead><tr><th>Movimiento</th><th>Tipo</th><th class="num">Monto</th><th>Cuando</th><th>Estado</th>${ctx.canWrite ? '<th></th>' : ''}</tr></thead>
    <tbody>${movements.map((item) => {
      const off = item.active === false;
      return `<tr class="${off ? 'hire-off' : ''}">
        <td>${escapeHtml(item.name)}</td>
        <td><span class="badge ${item.kind === 'inflow' ? 'healthy' : 'negative_margin'}">${item.kind === 'inflow' ? 'Entrada' : 'Salida'}</span></td>
        <td class="num">${formatCurrency(item.amount)}</td>
        <td>${scheduleLabel(item)}</td>
        <td><span class="badge ${off ? 'off' : ''}">${off ? 'Pausado' : 'Activo'}</span></td>
        ${ctx.canWrite ? `<td class="num nowrap">
          <button class="btn btn-ghost" data-edit-cf="${item.id}" type="button">Editar</button>
          <button class="btn btn-ghost" data-toggle-cf="${item.id}" type="button">${off ? 'Activar' : 'Pausar'}</button>
          <button class="btn btn-ghost" data-delete-cf="${item.id}" type="button">Eliminar</button>
        </td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function scheduleLabel(item) {
  if (item.frequency === 'once') return `Solo en ${MONTH_LABELS[(Number(item.month) || 1) - 1]}`;
  const start = Number(item.startMonth) || 1;
  const end = Number(item.endMonth) || 12;
  if (start === 1 && end === 12) return 'Todos los meses';
  return `${MONTH_LABELS[start - 1]} a ${MONTH_LABELS[end - 1]}`;
}

function chart(projection) {
  const points = [{ label: 'Inicio', value: projection.initialBalance }, ...projection.months.map((m) => ({ label: m.label, value: m.endBalance }))];
  const values = points.map((p) => p.value);
  const maxV = Math.max(0, ...values) * 1.1 || 1;
  const minV = Math.min(0, ...values) * 1.1;
  const W = 720, H = 280, P = 56;
  const sx = (i) => P + (i / (points.length - 1)) * (W - P - 14);
  const sy = (v) => 16 + ((maxV - v) / (maxV - minV || 1)) * (H - 16 - 30);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${sx(points.length - 1).toFixed(1)},${sy(0).toFixed(1)} L${sx(0).toFixed(1)},${sy(0).toFixed(1)} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo de caja acumulado" style="width:100%;height:auto;">
    ${minV < 0 ? `<rect x="${P}" y="${sy(0)}" width="${W - P - 14}" height="${H - 30 - sy(0)}" fill="#fff1f1" />` : ''}
    <line x1="${P}" y1="${sy(0)}" x2="${W - 14}" y2="${sy(0)}" stroke="var(--muted)" stroke-dasharray="4 4" />
    <text x="${P - 6}" y="${sy(0) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">$0</text>
    <path d="${area}" fill="rgba(12,65,196,.08)" />
    <path d="${path}" fill="none" stroke="var(--blue)" stroke-width="2.5" />
    ${points.map((p, i) => `
      <circle cx="${sx(i)}" cy="${sy(p.value)}" r="3.5" fill="${p.value < 0 ? 'var(--bad)' : 'var(--blue)'}"><title>${p.label}: ${formatCurrency(p.value)}</title></circle>
      <text x="${sx(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${p.label}</text>`).join('')}
  </svg>`;
}
