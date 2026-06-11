import { escapeHtml } from '../utils/dom.js';

// Selector de escenario compartido por las vistas de analisis.
export function scenarioSelect(id, ctx) {
  return `<select id="${id}">${ctx.bundle.scenarios.map((s) => `<option value="${s.id}" ${s.id === ctx.activeScenario?.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>`;
}

export function bindScenarioSelect(root, id, ctx, route) {
  root.querySelector(`#${id}`)?.addEventListener('change', (e) => ctx.actions.selectScenarioStay(e.target.value, route));
}
