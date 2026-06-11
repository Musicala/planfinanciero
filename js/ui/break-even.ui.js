import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { simulateScenarioWithDeltas, getBreakEvenZone, BREAK_EVEN_ZONE } from '../domain/simulation.engine.js';
import { hintBox, bindHints } from './hints.ui.js';
import { scenarioSelect, bindScenarioSelect } from './scenario-select.ui.js';

const SLIDERS = [
  ['pricePct', 'Precio promedio', -30, 30],
  ['studentsPct', 'Estudiantes', -50, 50],
  ['variableCostPct', 'Costos variables', -30, 30],
  ['payrollPct', 'Nomina', -50, 50],
  ['fixedPct', 'Otros gastos fijos', -50, 50],
];

const PRESETS = [
  ['Subo precios 10%', { pricePct: 10 }],
  ['Pierdo 20% de estudiantes', { studentsPct: -20 }],
  ['Crezco 20% en estudiantes', { studentsPct: 20 }],
  ['Nomina sube 15%', { payrollPct: 15 }],
  ['Recorto gastos fijos 10%', { fixedPct: -10 }],
];

const sliderState = { pricePct: 0, studentsPct: 0, variableCostPct: 0, payrollPct: 0, fixedPct: 0 };

export function renderBreakEvenView(root, ctx) {
  if (!ctx.activeScenario || !ctx.scenarioItems.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Punto de equilibrio</p><h2>Laboratorio de equilibrio</h2></div></section>
      <section class="empty-state"><h2>Sin escenario activo</h2><p>Crea un escenario con servicios para simular el punto de equilibrio.</p></section>`;
    return;
  }
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Punto de equilibrio</p><h2>Laboratorio de equilibrio</h2></div>
      <div class="actions">
        ${scenarioSelect('beScenario', ctx)}
      </div>
    </section>
    ${hintBox('break-even', 'Esto es un laboratorio: mueve los sliders o usa los botones de "¿Que pasa si...?" y mira el efecto al instante. Nada se guarda — tu escenario real queda intacto. Prueba comparar subir precios 10% contra crecer 10% en estudiantes.')}
    <section class="panel be-controls">
      <div class="fixed-cost-list-head" style="border:0;padding:0;margin-bottom:12px;">
        <div><h3>Mueve las palancas</h3><p class="muted">Cambia los parametros y mira el efecto inmediato. Nada se guarda: es un laboratorio.</p></div>
        <button class="btn btn-secondary" id="beReset" type="button">Restablecer</button>
      </div>
      <div class="be-sliders">
        ${SLIDERS.map(([key, label, min, max]) => `
          <label class="be-slider">
            <span>${label} <strong id="beVal-${key}">${sliderState[key] > 0 ? '+' : ''}${sliderState[key]}%</strong></span>
            <input type="range" id="beSlider-${key}" min="${min}" max="${max}" step="1" value="${sliderState[key]}" />
          </label>`).join('')}
      </div>
      <div class="be-presets">
        <span class="muted">¿Que pasa si...?</span>
        ${PRESETS.map(([label], i) => `<button class="btn btn-ghost" type="button" data-preset="${i}">${label}</button>`).join('')}
      </div>
    </section>
    <div id="beResults"></div>`;

  const update = () => updateResults(root.querySelector('#beResults'), ctx);
  SLIDERS.forEach(([key]) => {
    root.querySelector(`#beSlider-${key}`).addEventListener('input', (e) => {
      sliderState[key] = Number(e.target.value);
      root.querySelector(`#beVal-${key}`).textContent = `${sliderState[key] > 0 ? '+' : ''}${sliderState[key]}%`;
      update();
    });
  });
  root.querySelector('#beReset').addEventListener('click', () => {
    SLIDERS.forEach(([key]) => {
      sliderState[key] = 0;
      root.querySelector(`#beSlider-${key}`).value = 0;
      root.querySelector(`#beVal-${key}`).textContent = '0%';
    });
    update();
  });
  root.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const [, preset] = PRESETS[Number(button.dataset.preset)];
    SLIDERS.forEach(([key]) => {
      sliderState[key] = preset[key] || 0;
      root.querySelector(`#beSlider-${key}`).value = sliderState[key];
      root.querySelector(`#beVal-${key}`).textContent = `${sliderState[key] > 0 ? '+' : ''}${sliderState[key]}%`;
    });
    update();
  }));
  bindScenarioSelect(root, 'beScenario', ctx, 'break-even');
  bindHints(root);
  update();
}

function updateResults(container, ctx) {
  const deltas = Object.fromEntries(Object.entries(sliderState).map(([key, value]) => [key, value / 100]));
  const { base, simulated, impact } = simulateScenarioWithDeltas({
    scenario: ctx.activeScenario,
    scenarioItems: ctx.scenarioItems,
    services: ctx.bundle.services,
    fixedCosts: ctx.bundle.fixedCosts,
    settings: ctx.bundle.settings,
  }, deltas);
  const zone = getBreakEvenZone(simulated);
  const hasChanges = Object.values(sliderState).some((value) => value !== 0);
  container.innerHTML = `
    ${zoneBanner(zone, simulated)}
    ${hasChanges && impact.messages.length ? impactBlock(impact) : ''}
    <section class="kpi-grid">
      ${requirementCard('Ingreso minimo requerido', simulated.breakEvenRevenue == null ? 'Inviable' : formatCurrency(simulated.breakEvenRevenue), `Actual: ${formatCurrency(simulated.totalRevenue)}`)}
      ${requirementCard('Estudiantes requeridos', simulated.breakEvenStudents == null ? 'Inviable' : Math.ceil(simulated.breakEvenStudents), '4 clases/mes por estudiante')}
      ${requirementCard('Clases requeridas', simulated.breakEvenClasses == null ? 'Inviable' : Math.ceil(simulated.breakEvenClasses), `Actual: ${Math.round(simulated.totalClasses)} clases/mes`)}
      ${requirementCard('Horas requeridas', simulated.breakEvenClasses == null ? 'Inviable' : Math.ceil(simulated.breakEvenClasses), 'Estimando 1 hora por clase')}
    </section>
    ${hasChanges ? comparison(base, simulated) : ''}
    <section class="panel">
      <h3>Ingresos vs. costos</h3>
      ${chart(simulated)}
    </section>`;
}

function zoneBanner(zone, r) {
  const map = {
    [BREAK_EVEN_ZONE.ABOVE]: ['healthy', `🟢 Por encima del equilibrio. Los ingresos (${formatCurrency(r.totalRevenue)}) superan el punto de equilibrio (${formatCurrency(r.breakEvenRevenue)}) con holgura.`],
    [BREAK_EVEN_ZONE.NEAR]: ['tight', `🟡 Cerca del equilibrio. Los ingresos (${formatCurrency(r.totalRevenue)}) estan a menos del 10% del punto de equilibrio (${formatCurrency(r.breakEvenRevenue)}). Cualquier imprevisto duele.`],
    [BREAK_EVEN_ZONE.BELOW]: ['loss', `🔴 Debajo del equilibrio. Los ingresos (${formatCurrency(r.totalRevenue)}) no cubren los costos${r.breakEvenRevenue == null ? ' y el modelo es inviable con este margen' : ` (equilibrio: ${formatCurrency(r.breakEvenRevenue)})`}.`],
  };
  const [tone, text] = map[zone];
  return `<section class="reading ${tone}"><p>${text}</p></section>`;
}

function impactBlock(impact) {
  return `<section class="be-impact">${impact.messages.map((m) => `<span class="be-impact-msg ${m.tone}">${escapeHtml(m.text)}</span>`).join('')}</section>`;
}

function requirementCard(label, value, sub) {
  return `<article class="metric-card"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</article>`;
}

function comparison(base, simulated) {
  const rows = [
    ['Ingresos operativos', base.totalRevenue, simulated.totalRevenue],
    ['Costos variables', base.totalVariableCosts, simulated.totalVariableCosts],
    ['Costos fijos', base.totalFixedCosts, simulated.totalFixedCosts],
    ['Utilidad neta', base.netProfit, simulated.netProfit],
    ['Punto de equilibrio (ingresos)', base.breakEvenRevenue, simulated.breakEvenRevenue],
  ];
  return `<section class="panel be-compare">
    <h3>Antes vs. despues</h3>
    <div class="table-wrap"><table class="be-compare-table">
      <thead><tr><th>Indicador</th><th class="num">Escenario base</th><th class="num">Simulado</th><th class="num">Diferencia</th></tr></thead>
      <tbody>${rows.map(([label, a, b]) => {
        if (a == null || b == null) return `<tr><td>${label}</td><td class="num">${a == null ? 'Inviable' : formatCurrency(a)}</td><td class="num">${b == null ? 'Inviable' : formatCurrency(b)}</td><td class="num">—</td></tr>`;
        const diff = b - a;
        const cls = diff === 0 ? '' : (label.includes('Costos') || label.includes('equilibrio') ? (diff > 0 ? 'be-worse' : 'be-better') : (diff > 0 ? 'be-better' : 'be-worse'));
        return `<tr><td>${label}</td><td class="num">${formatCurrency(a)}</td><td class="num">${formatCurrency(b)}</td><td class="num ${cls}">${diff > 0 ? '+' : ''}${formatCurrency(diff)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
  </section>`;
}

function chart(r) {
  const totalClasses = r.totalClasses;
  if (!totalClasses || r.averageContributionMarginPerClass == null) {
    return '<p class="muted">Este escenario no tiene clases mensuales (solo suscripciones), asi que el grafico por clases no aplica.</p>';
  }
  const revenuePerClass = r.totalRevenue / totalClasses;
  const varCostPerClass = r.totalVariableCosts / totalClasses;
  const fixed = r.totalFixedCosts;
  const beClasses = r.breakEvenClasses;
  const xMax = Math.max(totalClasses * 1.5, beClasses ? beClasses * 1.25 : 0, 10);
  const yMax = Math.max(revenuePerClass * xMax, fixed + varCostPerClass * xMax) * 1.08;
  const W = 720, H = 300, P = 46;
  const sx = (x) => P + (x / xMax) * (W - P - 16);
  const sy = (y) => H - 34 - (y / yMax) * (H - 34 - 14);
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => Math.round(xMax * f));
  const bePoint = beClasses != null && beClasses <= xMax
    ? `<circle cx="${sx(beClasses)}" cy="${sy(revenuePerClass * beClasses)}" r="5.5" fill="var(--violet)" /><text x="${sx(beClasses)}" y="${sy(revenuePerClass * beClasses) - 11}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--violet)">Equilibrio: ${Math.ceil(beClasses)} clases</text>`
    : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico de punto de equilibrio" style="width:100%;height:auto;">
    <line x1="${P}" y1="${sy(0)}" x2="${W - 16}" y2="${sy(0)}" stroke="var(--line)" />
    <line x1="${P}" y1="14" x2="${P}" y2="${sy(0)}" stroke="var(--line)" />
    ${ticks.map((t) => `<text x="${sx(t)}" y="${H - 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${t}</text>`).join('')}
    <text x="${W - 16}" y="${H - 2}" text-anchor="end" font-size="11" fill="var(--muted)">clases / mes</text>
    <line x1="${P}" y1="${sy(fixed)}" x2="${W - 16}" y2="${sy(fixed)}" stroke="var(--muted)" stroke-dasharray="5 4" />
    <text x="${P + 6}" y="${sy(fixed) - 6}" font-size="11" fill="var(--muted)">Costos fijos ${formatCurrency(fixed)}</text>
    <line x1="${sx(0)}" y1="${sy(fixed)}" x2="${sx(xMax)}" y2="${sy(fixed + varCostPerClass * xMax)}" stroke="var(--bad)" stroke-width="2.5" />
    <line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(xMax)}" y2="${sy(revenuePerClass * xMax)}" stroke="var(--ok)" stroke-width="2.5" />
    <line x1="${sx(totalClasses)}" y1="${sy(0)}" x2="${sx(totalClasses)}" y2="${sy(revenuePerClass * totalClasses)}" stroke="var(--blue)" stroke-dasharray="4 4" />
    <text x="${sx(totalClasses)}" y="${sy(revenuePerClass * totalClasses) - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--blue)">Hoy: ${Math.round(totalClasses)} clases</text>
    ${bePoint}
    <text x="${W - 16}" y="${sy(revenuePerClass * xMax) + 14}" text-anchor="end" font-size="11" font-weight="700" fill="var(--ok)">Ingresos</text>
    <text x="${W - 16}" y="${sy(fixed + varCostPerClass * xMax) - 6}" text-anchor="end" font-size="11" font-weight="700" fill="var(--bad)">Costos totales</text>
  </svg>
  <p class="muted" style="font-size:12px;margin:8px 0 0;">${formatPercent(r.contributionMarginPct)} de cada peso de ingreso queda para cubrir costos fijos y utilidad.</p>`;
}
