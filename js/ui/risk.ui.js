import { escapeHtml } from '../utils/dom.js';
import { formatCurrency } from '../utils/format.js';
import { evaluateScenarioRisk, RISK_LEVEL } from '../domain/risk.engine.js';
import { calculateCashFlowProjection } from '../domain/cashflow.engine.js';
import { hintBox, bindHints } from './hints.ui.js';
import { scenarioSelect, bindScenarioSelect } from './scenario-select.ui.js';

const LEVEL_META = {
  [RISK_LEVEL.HEALTHY]: { emoji: '🟢', label: 'Saludable', tone: 'healthy' },
  [RISK_LEVEL.WATCH]: { emoji: '🟡', label: 'Atencion', tone: 'tight' },
  [RISK_LEVEL.RISK]: { emoji: '🔴', label: 'Riesgo', tone: 'loss' },
};

export function renderRiskView(root, ctx) {
  const result = ctx.calculatedScenario;
  if (!result || !result.rows.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Riesgo</p><h2>Semaforo de riesgo</h2></div></section>
      <section class="empty-state"><h2>Sin escenario para evaluar</h2><p>Crea un escenario con servicios y costos fijos para evaluar el riesgo financiero.</p></section>`;
    return;
  }
  const cashProjection = calculateCashFlowProjection({ scenarioResult: result, items: ctx.bundle.cashFlowItems || [] });
  const risk = evaluateScenarioRisk(result, { cashProjection });
  const meta = LEVEL_META[risk.overall];
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Riesgo</p><h2>Semaforo de riesgo</h2></div>
      <div class="actions">
        ${scenarioSelect('riskScenario', ctx)}
      </div>
    </section>
    ${hintBox('risk', 'El semaforo evalua 6 indicadores del escenario activo. Basta uno en rojo para que el conjunto este en riesgo: en finanzas, el eslabon mas debil define la cadena.')}
    <section class="panel risk-overall ${meta.tone}">
      <div class="risk-overall-badge">${meta.emoji}</div>
      <div>
        <h3>${meta.label}</h3>
        <p>${escapeHtml(risk.headline)}</p>
        <small class="muted">Utilidad neta del escenario: ${formatCurrency(result.netProfit)} / mes · ${risk.riskCount} en riesgo · ${risk.watchCount} en atencion</small>
      </div>
    </section>
    <section class="risk-factors">
      ${risk.factors.map((factor) => factorCard(factor)).join('')}
    </section>
    <section class="panel">
      <h3>Como leer este semaforo</h3>
      <p class="muted" style="margin:0;line-height:1.5;">Cada indicador se evalua sobre el escenario activo. El semaforo general toma el peor indicador: basta uno en rojo para que el escenario este en riesgo, porque en finanzas el eslabon mas debil define la cadena. La liquidez se evalua con la Proyeccion de Caja (saldo inicial y movimientos simulados de la pestaña Caja).</p>
    </section>`;
  bindScenarioSelect(root, 'riskScenario', ctx, 'risk');
  bindHints(root);
}

function factorCard(factor) {
  const meta = LEVEL_META[factor.level];
  return `<article class="panel risk-factor level-${factor.level}">
    <div class="risk-factor-head">
      <span class="risk-emoji">${meta.emoji}</span>
      <div><h4>${escapeHtml(factor.name)}</h4><strong>${escapeHtml(factor.display)}</strong></div>
    </div>
    <p>${escapeHtml(factor.explanation)}</p>
  </article>`;
}
