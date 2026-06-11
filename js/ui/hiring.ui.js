import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { simulateHiring } from '../domain/hiring.engine.js';
import { hintBox, bindHints } from './hints.ui.js';
import { scenarioSelect, bindScenarioSelect } from './scenario-select.ui.js';

export function renderHiringView(root, ctx) {
  if (!ctx.activeScenario || !ctx.scenarioItems.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Contratacion</p><h2>Impacto de contratacion</h2></div></section>
      <section class="empty-state"><h2>Sin escenario activo</h2><p>Crea un escenario con servicios para simular contrataciones sobre el.</p></section>`;
    return;
  }
  const roles = ctx.bundle.hiringRoles || [];
  const sim = simulateHiring({
    scenario: ctx.activeScenario,
    scenarioItems: ctx.scenarioItems,
    services: ctx.bundle.services,
    fixedCosts: ctx.bundle.fixedCosts,
    settings: ctx.bundle.settings,
  }, roles);
  const activeCount = sim.roles.length;
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Contratacion</p><h2>Impacto de contratacion</h2></div>
      <div class="actions">
        ${scenarioSelect('hireScenario', ctx)}
        ${ctx.canWrite ? '<button class="btn btn-primary" id="hireAdd" type="button">+ Cargo hipotetico</button>' : ''}
      </div>
    </section>
    ${hintBox('hiring', 'El factor prestacional importa: en Colombia un salario de $2.500.000 cuesta realmente unos $3.750.000 al mes con prestaciones (factor 1.5). El simulador ya lo tiene en cuenta.')}
    ${activeCount ? summaryReading(sim) : `<section class="reading healthy"><p>Crea cargos hipoteticos (docentes, asistentes, coordinadores...) y mira cuanto le cuestan al escenario y cuanto tendrias que vender para pagarlos. Nada de esto toca tu nomina real.</p></section>`}
    ${activeCount ? comparisonCards(sim) : ''}
    <section class="panel" style="margin-bottom:16px;">
      <h3>Cargos hipoteticos</h3>
      ${roles.length ? rolesTable(roles, sim, ctx) : '<p class="muted">Aun no hay cargos simulados. Agrega el primero con el boton de arriba.</p>'}
    </section>
    ${activeCount ? requirementsPanel(sim) : ''}`;

  bindScenarioSelect(root, 'hireScenario', ctx, 'hiring');
  root.querySelector('#hireAdd')?.addEventListener('click', () => ctx.actions.hiringRoleForm());
  bindHints(root);
  root.querySelectorAll('[data-edit-role]').forEach((el) => el.addEventListener('click', () => {
    const role = roles.find((r) => r.id === el.dataset.editRole);
    if (role) ctx.actions.hiringRoleForm(role);
  }));
  root.querySelectorAll('[data-toggle-role]').forEach((el) => el.addEventListener('click', () => {
    const role = roles.find((r) => r.id === el.dataset.toggleRole);
    if (role) ctx.actions.toggleHiringRole(role);
  }));
  root.querySelectorAll('[data-delete-role]').forEach((el) => el.addEventListener('click', () => {
    const role = roles.find((r) => r.id === el.dataset.deleteRole);
    if (role) ctx.actions.deleteHiringRole(role);
  }));
}

function summaryReading(sim) {
  const { simulated, totalMonthlyCost, profitDelta } = sim;
  const stillProfitable = simulated.netProfit >= 0;
  const tone = stillProfitable ? (simulated.gapToTarget >= 0 ? 'healthy' : 'tight') : 'loss';
  let text = `Las contrataciones simuladas cuestan ${formatCurrency(totalMonthlyCost)} al mes y reducen la utilidad en ${formatCurrency(Math.abs(profitDelta))}.`;
  text += stillProfitable
    ? ` El escenario sigue siendo rentable: utilidad de ${formatCurrency(simulated.netProfit)} al mes.`
    : ` Con estos cargos el escenario entra en perdida: ${formatCurrency(simulated.netProfit)} al mes.`;
  return `<section class="reading ${tone}"><p>${escapeHtml(text)}</p></section>`;
}

function comparisonCards(sim) {
  const { base, simulated } = sim;
  const items = [
    ['Costo mensual adicional', formatCurrency(sim.totalMonthlyCost), 'Nomina simulada (salario x factor)'],
    ['Utilidad: antes → despues', `${formatCurrency(base.netProfit)} → ${formatCurrency(simulated.netProfit)}`, `${sim.profitDelta > 0 ? '+' : ''}${formatCurrency(sim.profitDelta)}`],
    ['Nuevo punto de equilibrio', simulated.breakEvenRevenue == null ? 'Inviable' : formatCurrency(simulated.breakEvenRevenue), sim.breakEvenRevenueDelta == null ? '' : `${sim.breakEvenRevenueDelta > 0 ? '+' : ''}${formatCurrency(sim.breakEvenRevenueDelta)} vs. hoy`],
    ['Equilibrio en estudiantes', simulated.breakEvenStudents == null ? 'Inviable' : Math.ceil(simulated.breakEvenStudents), base.breakEvenStudents == null ? '' : `Antes: ${Math.ceil(base.breakEvenStudents)}`],
  ];
  return `<section class="kpi-grid">${items.map(([label, value, sub]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</article>`).join('')}</section>`;
}

function rolesTable(roles, sim, ctx) {
  const reqById = new Map(sim.roles.map((entry) => [entry.role.id, entry]));
  return `<div class="table-wrap"><table class="hire-table">
    <thead><tr><th>Cargo</th><th class="num">Salario</th><th class="num">Factor</th><th class="num">Costo mensual</th><th class="num">Estudiantes extra</th><th class="num">Grupos extra</th><th class="num">Horas extra</th><th>Estado</th>${ctx.canWrite ? '<th></th>' : ''}</tr></thead>
    <tbody>${roles.map((role) => {
      const entry = reqById.get(role.id);
      const req = entry?.requirements;
      const off = role.active === false;
      return `<tr class="${off ? 'hire-off' : ''}">
        <td>${escapeHtml(role.name)}</td>
        <td class="num">${formatCurrency(role.salary)}</td>
        <td class="num">${(Number(role.benefitsFactor) || 1).toLocaleString('es-CO')}</td>
        <td class="num">${off ? '—' : formatCurrency(entry.monthlyCost)}</td>
        <td class="num">${off || !req?.viable ? '—' : Math.ceil(req.extraStudents)}</td>
        <td class="num">${off || !req?.viable ? '—' : Math.ceil(req.extraGroups)}</td>
        <td class="num">${off || !req?.viable ? '—' : Math.ceil(req.extraHours)}</td>
        <td><span class="badge ${off ? 'off' : 'healthy'}">${off ? 'Pausado' : 'Simulado'}</span></td>
        ${ctx.canWrite ? `<td class="num nowrap">
          <button class="btn btn-ghost" data-edit-role="${role.id}" type="button">Editar</button>
          <button class="btn btn-ghost" data-toggle-role="${role.id}" type="button">${off ? 'Activar' : 'Pausar'}</button>
          <button class="btn btn-ghost" data-delete-role="${role.id}" type="button">Eliminar</button>
        </td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function requirementsPanel(sim) {
  const req = sim.totalRequirements;
  if (!req.viable) {
    return `<section class="reading loss"><p>El margen de contribucion promedio del escenario es negativo: ninguna cantidad de ventas adicionales paga estas contrataciones. Primero hay que arreglar precios o costos variables.</p></section>`;
  }
  return `<section class="panel">
    <h3>¿Que tendria que vender Musicala para pagar todo esto?</h3>
    <p class="muted" style="margin:0 0 12px;">Calculado con el margen de contribucion promedio del escenario base (${formatPercent(sim.base.contributionMarginPct)}). Cada estudiante se estima en 4 clases al mes.</p>
    <div class="exec-quick" style="grid-template-columns:repeat(4,minmax(0,1fr));">
      <div><span>Estudiantes adicionales</span><strong>${Math.ceil(req.extraStudents)}</strong></div>
      <div><span>Grupos adicionales</span><strong>${Math.ceil(req.extraGroups)}</strong></div>
      <div><span>Horas / clases adicionales</span><strong>${Math.ceil(req.extraHours)}</strong></div>
      <div><span>Ingresos adicionales</span><strong>${req.extraRevenue == null ? '—' : formatCurrency(req.extraRevenue)}</strong></div>
    </div>
  </section>`;
}
