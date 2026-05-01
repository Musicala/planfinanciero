import { $, escapeHtml } from '../utils/dom.js';
import { labelForRole } from '../utils/format.js';

const navItems = [
  ['dashboard', 'Dashboard'],
  ['services', 'Servicios'],
  ['fixed-costs', 'Costos fijos'],
  ['scenarios', 'Escenarios'],
  ['scenario-detail', 'Detalle escenario'],
  ['compare', 'Comparar'],
  ['annual-budget', 'Presupuesto anual'],
  ['settings', 'Configuracion'],
];

export function createLayout(root, { user, member, plan, route, onNavigate, onSignOut }) {
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img src="logo.png" alt="Musicala" />
          <div><strong>Plan Financiero</strong><span>${escapeHtml(plan?.name || 'Musicala 2026')}</span></div>
        </div>
        <nav class="nav">
          ${navItems.map(([id, label]) => `<button type="button" data-route="${id}" class="${id === route ? 'is-active' : ''}">${label}</button>`).join('')}
        </nav>
        <div class="user-box">
          <div><strong>${escapeHtml(user.displayName || user.email)}</strong><br><small>${escapeHtml(labelForRole(member?.role))}</small></div>
          <button class="btn btn-secondary" id="signOutBtn" type="button">Salir</button>
        </div>
      </aside>
      <section class="content">
        <header class="topbar">
          <div><h1>Musicala 2026</h1><p>Planeacion financiera, margen de contribucion y escenarios.</p></div>
          <div class="actions"><button class="btn btn-secondary" id="refreshBtn" type="button">Actualizar</button></div>
        </header>
        <main id="mainView" class="main-view"></main>
      </section>
    </div>`;
  root.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => onNavigate(button.dataset.route)));
  $('#signOutBtn')?.addEventListener('click', onSignOut);
  $('#refreshBtn')?.addEventListener('click', () => window.location.reload());
}

export function setActiveNav(route) {
  document.querySelectorAll('[data-route]').forEach((button) => button.classList.toggle('is-active', button.dataset.route === route));
}
