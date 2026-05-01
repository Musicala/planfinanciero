import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent, labelForHealth } from '../utils/format.js';

export function renderCompareScenariosView(root, ctx) {
  root.innerHTML = `
    <section class="view-head"><div><p class="eyebrow">Comparador</p><h2>Comparar escenarios</h2></div></section>
    ${recommendation(ctx.compare)}
    <section class="panel table-wrap"><table>
      <thead><tr><th>Escenario</th><th class="num">Ingresos cobrados</th><th class="num">IVA</th><th class="num">Ingresos operativos</th><th class="num">Costos variables</th><th class="num">Retencion</th><th class="num">Margen</th><th class="num">Margen %</th><th class="num">Nomina</th><th class="num">Otros fijos</th><th class="num">Costos fijos</th><th class="num">Utilidad antes impuesto utilidad</th><th class="num">Utilidad neta</th><th class="num">Brecha</th><th class="num">Equilibrio</th><th>Negativos</th><th>Estado</th></tr></thead>
      <tbody>${ctx.calculatedScenarios.map(row).join('')}</tbody>
    </table></section>`;
}

function recommendation(compare) {
  if (!compare.bestByNetProfit) return '<section class="empty-state"><h2>No hay escenarios para comparar</h2></section>';
  return `<section class="grid-3">
    <article class="metric-card"><span>Mejor utilidad neta</span><strong>${escapeHtml(compare.bestByNetProfit.scenario.name)}</strong><small>${formatCurrency(compare.bestByNetProfit.netProfit)}</small></article>
    <article class="metric-card"><span>Mejor margen %</span><strong>${escapeHtml(compare.bestByMarginPct.scenario.name)}</strong><small>${formatPercent(compare.bestByMarginPct.contributionMarginPct)}</small></article>
    <article class="metric-card"><span>Mas riesgoso</span><strong>${escapeHtml(compare.riskiest.scenario.name)}</strong><small>${formatCurrency(compare.riskiest.netProfit)}</small></article>
  </section>`;
}

function row(r) {
  return `<tr><td><strong>${escapeHtml(r.scenario.name)}</strong></td><td class="num">${formatCurrency(r.grossRevenue)}</td><td class="num">${formatCurrency(r.vatAmount)}</td><td class="num">${formatCurrency(r.operatingRevenue)}</td><td class="num">${formatCurrency(r.totalVariableCosts)}</td><td class="num">${formatCurrency(r.totalWithholdingAmount)}</td><td class="num">${formatCurrency(r.totalContributionMargin)}</td><td class="num">${formatPercent(r.contributionMarginPct)}</td><td class="num">${formatCurrency(r.payrollFixedCostsTotal)}</td><td class="num">${formatCurrency(r.otherFixedCostsTotal)}</td><td class="num">${formatCurrency(r.totalFixedCosts)}</td><td class="num">${formatCurrency(r.operatingProfitBeforeIncomeTax)}</td><td class="num">${formatCurrency(r.netProfit)}</td><td class="num">${formatCurrency(r.gapToTarget)}</td><td class="num">${r.breakEvenClasses == null ? 'Inviable' : Math.ceil(r.breakEvenClasses)}</td><td>${r.servicesWithNegativeMargin.length}</td><td><span class="badge ${r.healthStatus}">${labelForHealth(r.healthStatus)}</span></td></tr>`;
}
