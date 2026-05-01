import { calculateMonthlyFixedCost, isPayrollFixedCost, normalizeFixedCostCategory } from '../domain/financial.engine.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent, formatUpdatedAt, labelForPeriodicity } from '../utils/format.js';

export function renderFixedCostsView(root, ctx) {
  const s = ctx.fixedSummary;
  const sortedCosts = sortedFixedCosts(ctx.bundle.fixedCosts);
  const payrollCount = sortedCosts.filter(isPayrollFixedCost).length;
  const otherCount = sortedCosts.length - payrollCount;
  root.innerHTML = `
    <section class="view-head"><div><p class="eyebrow">Costos fijos</p><h2>Base mensual equivalente</h2></div><button class="btn btn-primary" id="newCost" ${ctx.canWrite ? '' : 'disabled'}>Crear costo fijo</button></section>
    <section class="kpi-grid">
      <article class="metric-card"><span>Total mensual</span><strong>${formatCurrency(s.totalMonthly)}</strong></article>
      <article class="metric-card"><span>Nómina / Equipo base</span><strong>${formatCurrency(s.payrollFixedCostsTotal)}</strong><small>Trabajadores necesarios para operar</small></article>
      <article class="metric-card"><span>Otros costos fijos</span><strong>${formatCurrency(s.otherFixedCostsTotal)}</strong><small>Sin contar nómina</small></article>
      <article class="metric-card"><span>Esenciales</span><strong>${formatCurrency(s.totalEssential)}</strong></article>
      <article class="metric-card"><span>Reducibles</span><strong>${formatCurrency(s.totalReducible)}</strong><small>${formatPercent(s.reduciblePct)}</small></article>
    </section>
    <section class="panel fixed-cost-breakdown">
      <div>
        <p class="eyebrow">Separación analítica</p>
        <h3>Costos fijos mensuales</h3>
      </div>
      <div class="breakdown-grid">
        <article><span>Nómina / Equipo base</span><strong>${formatCurrency(s.payrollFixedCostsTotal)}</strong></article>
        <article><span>Otros costos fijos</span><strong>${formatCurrency(s.otherFixedCostsTotal)}</strong></article>
        <article><span>Total costos fijos</span><strong>${formatCurrency(s.totalFixedCosts)}</strong></article>
      </div>
    </section>
    <section class="panel fixed-cost-list-head">
      <div>
        <p class="eyebrow">Vista de costos</p>
        <h3 id="fixedCostViewTitle">Todos los costos fijos</h3>
        <p id="fixedCostViewHelp" class="muted">Nómina y operación en una sola lista.</p>
      </div>
      <div class="segmented" role="tablist" aria-label="Filtrar costos fijos">
        <button class="is-active" type="button" data-cost-filter="all">Todos <span>${sortedCosts.length}</span></button>
        <button type="button" data-cost-filter="payroll">Nómina / Equipo base <span>${payrollCount}</span></button>
        <button type="button" data-cost-filter="other">Otros costos fijos <span>${otherCount}</span></button>
      </div>
    </section>
    <section class="panel table-wrap"><table>
      <thead><tr><th>Costo</th><th>Categoria</th><th>Periodicidad</th><th class="num">Valor original</th><th class="num">Equivalente mensual</th><th>Esencial</th><th>Reducible</th><th>Ultima edicion</th><th>Estado</th><th></th></tr></thead>
      <tbody>${sortedCosts.map((cost) => row(cost)).join('')}</tbody>
    </table></section>`;
  document.querySelector('#newCost')?.addEventListener('click', () => ctx.actions.fixedCostForm());
  bindCostFilters();
  document.querySelectorAll('[data-edit-cost]').forEach((b) => b.addEventListener('click', () => ctx.actions.fixedCostForm(ctx.bundle.fixedCosts.find((c) => c.id === b.dataset.editCost))));
  document.querySelectorAll('[data-off-cost]').forEach((b) => b.addEventListener('click', () => ctx.actions.deactivateFixedCost(ctx.bundle.fixedCosts.find((c) => c.id === b.dataset.offCost))));
  document.querySelectorAll('[data-del-cost]').forEach((b) => b.addEventListener('click', () => ctx.actions.deleteFixedCost(ctx.bundle.fixedCosts.find((c) => c.id === b.dataset.delCost))));
}

function row(cost) {
  const category = normalizeFixedCostCategory(cost.category);
  const group = isPayrollFixedCost(cost) ? 'payroll' : 'other';
  const payrollBadge = isPayrollFixedCost(cost) ? '<br><span class="badge payroll">Nómina / Equipo base</span>' : '';
  return `<tr data-cost-group="${group}"><td><strong>${escapeHtml(cost.name)}</strong>${payrollBadge}</td><td>${escapeHtml(category)}</td><td>${labelForPeriodicity(cost.periodicity)}</td><td class="num">${formatCurrency(cost.amount)}</td><td class="num">${formatCurrency(calculateMonthlyFixedCost(cost))}</td><td>${cost.essential ? 'Si' : 'No'}</td><td>${cost.reducible ? 'Si' : 'No'}</td><td class="nowrap"><small>${escapeHtml(formatUpdatedAt(cost))}</small></td><td><span class="badge ${cost.active === false ? 'off' : 'healthy'}">${cost.active === false ? 'Inactivo' : 'Activo'}</span></td><td class="nowrap"><button class="btn btn-ghost" data-edit-cost="${cost.id}">Editar</button><button class="btn btn-ghost" data-off-cost="${cost.id}">Desactivar</button><button class="btn btn-ghost" data-del-cost="${cost.id}">Eliminar</button></td></tr>`;
}

function sortedFixedCosts(costs = []) {
  return [...costs].sort((a, b) => Number(isPayrollFixedCost(b)) - Number(isPayrollFixedCost(a)) || normalizeFixedCostCategory(a.category).localeCompare(normalizeFixedCostCategory(b.category)) || (a.name || '').localeCompare(b.name || ''));
}

function bindCostFilters() {
  const titles = {
    all: ['Todos los costos fijos', 'Nómina y operación en una sola lista.'],
    payroll: ['Nómina / Equipo base', 'Trabajadores necesarios para operar.'],
    other: ['Otros costos fijos', 'Costos de operación sin contar nómina.'],
  };
  document.querySelectorAll('[data-cost-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.costFilter;
      document.querySelectorAll('[data-cost-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
      document.querySelectorAll('[data-cost-group]').forEach((row) => {
        row.classList.toggle('hidden', filter !== 'all' && row.dataset.costGroup !== filter);
      });
      const [title, help] = titles[filter] || titles.all;
      const titleEl = document.querySelector('#fixedCostViewTitle');
      const helpEl = document.querySelector('#fixedCostViewHelp');
      if (titleEl) titleEl.textContent = title;
      if (helpEl) helpEl.textContent = help;
    });
  });
}
