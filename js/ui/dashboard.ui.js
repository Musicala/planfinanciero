import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { evaluateScenarioRisk, RISK_LEVEL } from '../domain/risk.engine.js';
import { getBreakEvenZone, BREAK_EVEN_ZONE } from '../domain/simulation.engine.js';
import { calculateCashFlowProjection } from '../domain/cashflow.engine.js';
import { hintBox, bindHints } from './hints.ui.js';
import { scenarioSelect, bindScenarioSelect } from './scenario-select.ui.js';

const RISK_META = {
  [RISK_LEVEL.HEALTHY]: { emoji: '🟢', label: 'Saludable', tone: 'good' },
  [RISK_LEVEL.WATCH]: { emoji: '🟡', label: 'Atencion', tone: 'warn' },
  [RISK_LEVEL.RISK]: { emoji: '🔴', label: 'Riesgo', tone: 'bad' },
};

const ZONE_META = {
  [BREAK_EVEN_ZONE.ABOVE]: { tone: 'good', text: 'Por encima del equilibrio' },
  [BREAK_EVEN_ZONE.NEAR]: { tone: 'warn', text: 'Cerca del equilibrio' },
  [BREAK_EVEN_ZONE.BELOW]: { tone: 'bad', text: 'Debajo del equilibrio' },
};

export function renderDashboard(root, ctx) {
  const r = ctx.calculatedScenario;
  if (!ctx.bundle.scenarios.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Dashboard</p><h2>Panel ejecutivo</h2></div></section>
      <section class="empty-state"><h2>No hay escenarios cargados</h2><p>Crea servicios, costos fijos y un escenario para empezar a ver resultados.</p></section>`;
    return;
  }
  if (!r) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Dashboard</p><h2>Panel ejecutivo</h2></div></section>
      <section class="empty-state"><h2>Sin escenario activo</h2><p>Crea un escenario para ver la lectura financiera.</p></section>`;
    return;
  }
  const cashProjection = calculateCashFlowProjection({ scenarioResult: r, items: ctx.bundle.cashFlowItems || [] });
  const risk = evaluateScenarioRisk(r, { cashProjection });
  const zone = getBreakEvenZone(r);
  const riskMeta = RISK_META[risk.overall];
  const zoneMeta = ZONE_META[zone];
  const netProfitPct = r.operatingRevenue ? r.netProfit / r.operatingRevenue : 0;
  const totalCosts = r.totalVariableCosts + r.totalFixedCosts;
  const cushion = r.breakEvenRevenue ? r.totalRevenue / r.breakEvenRevenue - 1 : null;
  const payrollShare = r.totalRevenue ? r.payrollFixedCostsTotal / r.totalRevenue : 0;

  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Dashboard</p><h2>Panel ejecutivo</h2></div>
      <div class="actions">
        ${scenarioSelect('dashScenario', ctx)}
      </div>
    </section>
    ${hintBox('dashboard', 'Cada tarjeta es clicable: te lleva al modulo donde puedes profundizar y simular. Los colores del borde indican el estado (verde bien, amarillo atencion, rojo problema).')}
    ${reading(r)}
    <section class="exec-grid">
      ${heroCard('💰', 'Ingresos proyectados', formatCurrency(r.totalRevenue), `${formatCurrency(r.grossRevenue)} cobrados con IVA`, null, 'scenario-detail')}
      ${heroCard('💸', 'Costos proyectados', formatCurrency(totalCosts), `${formatCurrency(r.totalVariableCosts)} variables · ${formatCurrency(r.totalFixedCosts)} fijos`, payrollShare > 0.55 ? 'bad' : payrollShare > 0.4 ? 'warn' : null, 'fixed-costs', `Nomina = ${formatPercent(payrollShare)} de ingresos`)}
      ${heroCard('📈', 'Utilidad proyectada', formatCurrency(r.netProfit), `${formatPercent(netProfitPct)} de los ingresos · meta: ${formatCurrency(r.requiredProfit)}`, r.netProfit < 0 ? 'bad' : r.gapToTarget < 0 ? 'warn' : 'good', 'profitability', gapText(r))}
      ${heroCard('🎯', 'Punto de equilibrio', r.breakEvenRevenue == null ? 'Inviable' : formatCurrency(r.breakEvenRevenue), cushion == null ? 'El margen actual no permite alcanzarlo' : `Colchon actual: ${formatPercent(cushion)}`, zoneMeta.tone, 'break-even', zoneMeta.text)}
      ${heroCard('🏦', 'Caja proyectada (fin de año)', formatCurrency(cashProjection.endBalance), cashProjection.negativeMonths.length ? `Se vuelve negativa en ${cashProjection.firstNegativeMonth.label}` : `Minimo del año: ${formatCurrency(cashProjection.minBalance)}`, cashProjection.negativeMonths.length ? 'bad' : cashProjection.minBalance < r.totalFixedCosts ? 'warn' : 'good', 'cashflow')}
      ${heroCard(riskMeta.emoji, 'Riesgo general', riskMeta.label, escapeHtml(shortHeadline(risk.headline)), riskMeta.tone, 'risk', `${risk.riskCount} en riesgo · ${risk.watchCount} en atencion`)}
    </section>
    <section class="grid-2">
      <article class="panel">
        <h3>Servicios que mas sostienen el escenario</h3>
        ${topServices(r)}
        <button class="btn btn-ghost" data-go="profitability" type="button">Ver rentabilidad completa →</button>
      </article>
      <article class="panel">
        <h3>Indicadores rapidos</h3>
        ${quickIndicators(r, payrollShare)}
        ${alertsBlock(r)}
      </article>
    </section>`;
  bindScenarioSelect(root, 'dashScenario', ctx, 'dashboard');
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => ctx.actions.goTo(el.dataset.go)));
  bindHints(root);
}

function heroCard(emoji, label, value, sub, tone, route, badge) {
  return `<article class="exec-card ${tone ? `tone-${tone}` : ''}" data-go="${route}" role="button" tabindex="0">
    <div class="exec-card-head"><span class="exec-emoji">${emoji}</span><span class="exec-label">${label}</span></div>
    <strong class="exec-value">${value}</strong>
    ${badge ? `<span class="exec-badge ${tone ? `tone-${tone}` : ''}">${badge}</span>` : ''}
    <small>${sub}</small>
  </article>`;
}

function reading(r) {
  let text = `Con este escenario, Musicala cubre sus costos fijos y supera la meta por ${formatCurrency(r.gapToTarget)}.`;
  if (r.netProfit < 0) text = `Con este escenario, Musicala pierde ${formatCurrency(Math.abs(r.netProfit))} al mes. El modelo necesita ajustes.`;
  else if (r.gapToTarget < 0) text = `Con este escenario, Musicala gana ${formatCurrency(r.netProfit)} al mes, pero faltan ${formatCurrency(Math.abs(r.gapToTarget))} para la meta de utilidad.`;
  return `<section class="reading ${r.healthStatus}"><p>${text}</p></section>`;
}

function gapText(r) {
  if (r.netProfit < 0) return 'En perdida';
  return r.gapToTarget >= 0 ? 'Meta cumplida' : 'Debajo de la meta';
}

function shortHeadline(headline) {
  return headline.length > 110 ? `${headline.slice(0, 107)}...` : headline;
}

function topServices(r) {
  const rows = r.servicesRankingByContributionMargin.slice(0, 3);
  if (!rows.length) return '<p class="muted">Sin servicios en este escenario.</p>';
  const max = Math.max(1, ...rows.map((row) => row.contributionMargin));
  return `<div class="prof-bars" style="margin-bottom:12px;">
    ${rows.map((row) => `<div class="prof-bar-row">
      <span class="prof-bar-label">${escapeHtml(row.service.name)}</span>
      <div class="prof-bar-track"><div class="prof-bar level-share" style="width:${Math.max(2, Math.round((row.contributionMargin / max) * 100))}%"></div></div>
      <span class="prof-bar-value">${formatCurrency(row.contributionMargin)}</span>
    </div>`).join('')}
  </div>`;
}

function quickIndicators(r, payrollShare) {
  const items = [
    ['Margen de contribucion', formatPercent(r.contributionMarginPct), 'De cada peso que entra, cuanto queda libre despues de pagar los costos variables (docentes, materiales, comisiones).'],
    ['Peso de nomina', formatPercent(payrollShare), 'Que porcentaje de los ingresos se va en nomina fija. En educacion, por encima del 40% hay que vigilarlo de cerca.'],
    ['Clases / mes', Math.round(r.totalClasses), 'Total de clases mensuales que el escenario asume vender y dictar.'],
    ['Equilibrio en estudiantes', r.breakEvenStudents == null ? 'Inviable' : Math.ceil(r.breakEvenStudents), 'Cuantos estudiantes (a 4 clases/mes) se necesitan para no perder plata. Por debajo de esto, el mes da perdida.'],
  ];
  return `<div class="exec-quick">${items.map(([label, value, tip]) => `<div><span ${tip ? `data-tip="${tip}" tabindex="0"` : ''}>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
}

function alertsBlock(r) {
  if (!r.alerts.length) return '<p class="muted" style="margin:12px 0 0;">Sin alertas criticas.</p>';
  return `<div class="alerts" style="margin-top:12px;max-width:none;">${r.alerts.slice(0, 4).map((a) => `<span>⚠️ ${escapeHtml(a)}</span>`).join('')}${r.alerts.length > 4 ? `<span class="muted">y ${r.alerts.length - 4} alertas mas...</span>` : ''}</div>`;
}
