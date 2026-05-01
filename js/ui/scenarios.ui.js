import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent, formatUpdatedAt, labelForHealth } from '../utils/format.js';

export function renderScenariosView(root, ctx) {
  root.innerHTML = `
    <section class="view-head"><div><p class="eyebrow">Escenarios</p><h2>Simulaciones financieras</h2></div><button class="btn btn-primary" id="newScenario" ${ctx.canWrite ? '' : 'disabled'}>Crear escenario</button></section>
    <section class="panel table-wrap"><table>
      <thead><tr><th>Escenario</th><th>Tipo</th><th>Estado</th><th class="num">Ingresos</th><th class="num">Margen %</th><th class="num">Utilidad neta</th><th class="num">Brecha</th><th>Ultima edicion</th><th>Salud</th><th></th></tr></thead>
      <tbody>${ctx.calculatedScenarios.map((r) => row(r)).join('')}</tbody>
    </table></section>`;
  document.querySelector('#newScenario')?.addEventListener('click', () => ctx.actions.scenarioForm());
  document.querySelectorAll('[data-open-scenario]').forEach((b) => b.addEventListener('click', () => ctx.actions.selectScenario(b.dataset.openScenario)));
  document.querySelectorAll('[data-edit-scenario]').forEach((b) => b.addEventListener('click', () => ctx.actions.scenarioForm(ctx.bundle.scenarios.find((s) => s.id === b.dataset.editScenario))));
  document.querySelectorAll('[data-copy-scenario]').forEach((b) => b.addEventListener('click', () => ctx.actions.duplicateScenario(ctx.bundle.scenarios.find((s) => s.id === b.dataset.copyScenario))));
  document.querySelectorAll('[data-archive-scenario]').forEach((b) => b.addEventListener('click', () => ctx.actions.archiveScenario(ctx.bundle.scenarios.find((s) => s.id === b.dataset.archiveScenario))));
}

function row(r) {
  const s = r.scenario;
  return `<tr><td><strong>${escapeHtml(s.name)}</strong><br><small>${escapeHtml(s.description || '')}</small></td><td>${escapeHtml(s.type || '')}</td><td>${escapeHtml(s.status || '')}</td><td class="num">${formatCurrency(r.totalRevenue)}</td><td class="num">${formatPercent(r.contributionMarginPct)}</td><td class="num">${formatCurrency(r.netProfit)}</td><td class="num">${formatCurrency(r.gapToTarget)}</td><td class="nowrap"><small>${escapeHtml(formatUpdatedAt(s))}</small></td><td><span class="badge ${r.healthStatus}">${labelForHealth(r.healthStatus)}</span></td><td class="nowrap"><button class="btn btn-ghost" data-open-scenario="${s.id}">Abrir</button><button class="btn btn-ghost" data-edit-scenario="${s.id}">Editar</button><button class="btn btn-ghost" data-copy-scenario="${s.id}">Duplicar</button><button class="btn btn-ghost" data-archive-scenario="${s.id}">Archivar</button></td></tr>`;
}
