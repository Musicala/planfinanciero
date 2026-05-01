import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent, labelForHealth } from '../utils/format.js';

export function renderDashboard(root, ctx) {
  const r = ctx.calculatedScenario;
  if (!ctx.bundle.scenarios.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Dashboard</p><h2>Lectura ejecutiva</h2></div></section>
      <section class="empty-state"><h2>No hay escenarios cargados</h2><p>Crea servicios, costos fijos y un escenario para empezar a ver resultados.</p></section>`;
    return;
  }
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Dashboard</p><h2>Lectura ejecutiva</h2></div>
      <div class="actions">
        <select id="dashScenario">${ctx.bundle.scenarios.map((s) => `<option value="${s.id}" ${s.id === ctx.activeScenario?.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
      </div>
    </section>
    ${r ? teacherPaymentBadge(ctx) : ''}
    ${r ? reading(r) : '<section class="empty-state"><h2>Sin escenario activo</h2><p>Crea un escenario para ver la lectura financiera.</p></section>'}
    ${r ? `<section class="kpi-grid">${kpis(r, ctx)}</section>${fixedCostsBreakdown(r)}${rankings(r)}` : ''}`;
  document.querySelector('#dashScenario')?.addEventListener('change', (e) => ctx.actions.selectScenario(e.target.value));
}

function teacherPaymentBadge(ctx) {
  const payroll = ctx.bundle.settings.teacherPaymentStrategy === 'payroll';
  return `<section class="reading healthy"><p>Pago docente: ${payroll ? 'cubierto por nomina fija' : 'por servicio/clase'}.</p></section>`;
}

function reading(r) {
  let text = `Con este escenario, Musicala cubre sus costos fijos y supera la meta por ${formatCurrency(r.gapToTarget)}.`;
  if (r.netProfit < 0) text = `Con este escenario, Musicala pierde ${formatCurrency(Math.abs(r.netProfit))}. El modelo necesita ajustes.`;
  else if (r.gapToTarget < 0) text = 'Con este escenario, Musicala cubre operacion pero no alcanza la meta de utilidad.';
  return `<section class="reading ${r.healthStatus}"><p>${text}</p></section>`;
}

function kpis(r, ctx) {
  const servicesSummary = getServicesSummary(ctx);
  const netProfitPct = r.operatingRevenue ? r.netProfit / r.operatingRevenue : 0;
  const items = [
    ['Servicios cargados', servicesSummary.total, `${servicesSummary.active} activos · ${servicesSummary.inScenario} en escenario`],
    ['Ingresos cobrados/proyectados', formatCurrency(r.grossRevenue)],
    ['IVA estimado', formatCurrency(r.vatAmount)],
    ['Ingresos operativos sin IVA', formatCurrency(r.operatingRevenue)],
    ['Costos variables', formatCurrency(r.totalVariableCosts)],
    ['Retención estimada', formatCurrency(r.totalWithholdingAmount)],
    ['Margen contribucion', formatCurrency(r.totalContributionMargin), formatPercent(r.contributionMarginPct)],
    ['Total costos fijos', formatCurrency(r.totalFixedCosts)],
    ['Utilidad antes de impuesto sobre utilidad', formatCurrency(r.operatingProfitBeforeIncomeTax)],
    ['Impuesto sobre utilidad', formatCurrency(r.incomeTax)],
    ['Utilidad neta', formatCurrency(r.netProfit), formatPercent(netProfitPct)],
    ['Brecha contra meta', formatCurrency(r.gapToTarget)],
    ['Punto equilibrio ingresos', formatCurrency(r.breakEvenRevenue)],
    ['Punto equilibrio clases', r.breakEvenClasses == null ? 'Inviable' : Math.ceil(r.breakEvenClasses)],
    ['Punto equilibrio estudiantes', r.breakEvenStudents == null ? 'Inviable' : Math.ceil(r.breakEvenStudents), '4 clases/mes por estudiante'],
    ['Margen negativo', r.servicesWithNegativeMargin.length],
    ['Estado general', labelForHealth(r.healthStatus)],
  ];
  return items.map(([label, value, sub]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</article>`).join('');
}

function getServicesSummary(ctx) {
  const services = ctx.bundle.services || [];
  const scenarioItems = ctx.scenarioItems || [];
  return {
    total: services.length,
    active: services.filter((service) => service.active !== false).length,
    inScenario: new Set(scenarioItems.filter((item) => item.active !== false).map((item) => item.serviceId)).size,
  };
}

function fixedCostsBreakdown(r) {
  const payrollShare = r.totalFixedCosts ? r.payrollFixedCostsTotal / r.totalFixedCosts : 0;
  return `<section class="panel fixed-cost-breakdown">
    <div>
      <p class="eyebrow">Costos fijos mensuales</p>
      <h3>Equipo base y operación</h3>
    </div>
    <div class="breakdown-grid">
      <article><span>Nómina / Equipo base</span><strong>${formatCurrency(r.payrollFixedCostsTotal)}</strong><small>Trabajadores necesarios para operar</small></article>
      <article><span>Otros costos fijos</span><strong>${formatCurrency(r.otherFixedCostsTotal)}</strong><small>Operación sin contar nómina</small></article>
      <article><span>Total costos fijos</span><strong>${formatCurrency(r.totalFixedCosts)}</strong><small>${formatPercent(payrollShare)} corresponde a personas</small></article>
    </div>
  </section>`;
}

function rankings(r) {
  return `<section class="grid-2">
    <article class="panel"><h3>Servicios que mas sostienen el escenario</h3>${list(r.servicesRankingByContributionMargin.slice(0, 5))}</article>
    <article class="panel"><h3>Alertas</h3>${r.alerts.length ? `<div class="alerts">${r.alerts.slice(0, 8).map((a) => `<span>${escapeHtml(a)}</span>`).join('')}</div>` : '<p class="muted">Sin alertas criticas.</p>'}</article>
  </section>`;
}

function list(rows) {
  if (!rows.length) return '<p class="muted">Sin servicios en este escenario.</p>';
  return `<table><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.service.name)}</td><td class="num">${formatCurrency(row.contributionMargin)}</td></tr>`).join('')}</tbody></table>`;
}
