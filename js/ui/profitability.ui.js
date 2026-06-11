import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { calculateServiceProfitability, sortProfitabilityRows, PROFITABILITY_LEVEL } from '../domain/profitability.engine.js';
import { hintBox, bindHints } from './hints.ui.js';
import { scenarioSelect, bindScenarioSelect } from './scenario-select.ui.js';

const SORT_OPTIONS = [
  ['profit', 'Utilidad'],
  ['margin', 'Margen'],
  ['revenue', 'Ingresos'],
];

let currentSort = 'profit';

export function renderProfitabilityView(root, ctx) {
  const result = ctx.calculatedScenario;
  if (!result || !result.rows.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Rentabilidad</p><h2>Rentabilidad de servicios</h2></div></section>
      <section class="empty-state"><h2>Sin datos para analizar</h2><p>Agrega servicios al escenario activo para ver su rentabilidad.</p></section>`;
    return;
  }
  const { rows, totals } = calculateServiceProfitability(result);
  const sorted = sortProfitabilityRows(rows, currentSort);
  root.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Rentabilidad</p><h2>Rentabilidad de servicios</h2></div>
      <div class="actions">
        ${scenarioSelect('profScenario', ctx)}
      </div>
    </section>
    ${hintBox('profitability', 'Un servicio puede tener buen margen bruto y aun asi perder plata cuando carga su parte de arriendo y nomina. Aqui cada servicio recibe su porcion de costos fijos segun lo que aporta en ingresos: eso es la utilidad estimada real.')}
    ${readingBlock(sorted, totals)}
    <section class="kpi-grid">
      <article class="metric-card"><span>Servicios analizados</span><strong>${rows.length}</strong><small>${totals.profitableCount} con alta rentabilidad · ${totals.losingCount} en perdida</small></article>
      <article class="metric-card"><span>Ingresos del escenario</span><strong>${formatCurrency(totals.revenue)}</strong></article>
      <article class="metric-card"><span>Margen de contribucion</span><strong>${formatCurrency(totals.contributionMargin)}</strong></article>
      <article class="metric-card"><span>Utilidad estimada total</span><strong>${formatCurrency(totals.estimatedProfit)}</strong><small>Despues de costos fijos asignados</small></article>
    </section>
    <section class="panel prof-panel">
      <div class="fixed-cost-list-head" style="border:0;padding:0;margin-bottom:14px;">
        <div><h3>Ranking de servicios</h3><p class="muted">Los costos fijos se reparten segun la participacion de cada servicio en los ingresos.</p></div>
        <div class="segmented" id="profSort">
          ${SORT_OPTIONS.map(([key, label]) => `<button type="button" data-sort="${key}" class="${key === currentSort ? 'is-active' : ''}">${label}</button>`).join('')}
        </div>
      </div>
      ${barChart(sorted)}
    </section>
    <section class="grid-2">
      <article class="panel"><h3>Mapa de calor · margen neto</h3>${heatmap(sorted)}</article>
      <article class="panel"><h3>Participacion en ingresos</h3>${shareBars(sorted)}</article>
    </section>
    <section class="panel table-wrap prof-table">
      <table>
        <thead><tr><th>Servicio</th><th class="num">Ingresos</th><th class="num">% ingresos</th><th class="num"><span data-tip="Lo que queda de los ingresos despues de costos variables (docente, materiales, comisiones), antes de costos fijos." tabindex="0">Margen bruto</span></th><th class="num"><span data-tip="La porcion de arriendo, nomina y demas costos fijos que le corresponde a este servicio segun su participacion en los ingresos." tabindex="0">Fijos asignados</span></th><th class="num"><span data-tip="Margen de contribucion menos los costos fijos asignados: la ganancia o perdida real estimada de este servicio cada mes." tabindex="0">Utilidad estimada</span></th><th class="num"><span data-tip="Utilidad estimada como porcentaje de los ingresos del servicio. Verde desde 15%." tabindex="0">Margen neto</span></th><th>Nivel</th></tr></thead>
        <tbody>
          ${sorted.map((r) => `<tr>
            <td>${escapeHtml(r.serviceName)}</td>
            <td class="num">${formatCurrency(r.revenue)}</td>
            <td class="num">${formatPercent(r.revenueSharePct)}</td>
            <td class="num">${formatPercent(r.grossMarginPct)}</td>
            <td class="num">${formatCurrency(r.allocatedFixedCosts)}</td>
            <td class="num">${formatCurrency(r.estimatedProfit)}</td>
            <td class="num">${formatPercent(r.netMarginPct)}</td>
            <td>${levelBadge(r.level)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  bindScenarioSelect(root, 'profScenario', ctx, 'profitability');
  root.querySelectorAll('#profSort [data-sort]').forEach((button) => button.addEventListener('click', () => {
    currentSort = button.dataset.sort;
    renderProfitabilityView(root, ctx);
  }));
  bindHints(root);
}

function readingBlock(sorted, totals) {
  const best = sorted[0];
  const losers = sorted.filter((r) => r.estimatedProfit < 0);
  let tone = 'healthy';
  let text = `"${best.serviceName}" es el servicio que mas sostiene el negocio (${formatCurrency(best.estimatedProfit)} de utilidad estimada).`;
  if (losers.length) {
    tone = losers.length > sorted.length / 2 ? 'loss' : 'tight';
    const worst = losers[losers.length - 1];
    text += ` Ojo: ${losers.length === 1 ? `"${worst.serviceName}" pierde` : `${losers.length} servicios pierden`} plata despues de asignar costos fijos — ${losers.length === 1 ? `${formatCurrency(Math.abs(worst.estimatedProfit))} al mes` : `${formatCurrency(Math.abs(losers.reduce((s, r) => s + r.estimatedProfit, 0)))} al mes en total`}.`;
  } else if (totals.estimatedProfit > 0) {
    text += ' Todos los servicios cubren su parte de los costos fijos.';
  }
  return `<section class="reading ${tone}"><p>${escapeHtml(text)}</p></section>`;
}

function barChart(rows) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.estimatedProfit)));
  return `<div class="prof-bars">
    ${rows.map((r) => {
      const width = Math.max(2, Math.round((Math.abs(r.estimatedProfit) / maxAbs) * 100));
      return `<div class="prof-bar-row" title="Margen neto: ${formatPercent(r.netMarginPct)}">
        <span class="prof-bar-label">${escapeHtml(r.serviceName)}</span>
        <div class="prof-bar-track"><div class="prof-bar level-${r.level}" style="width:${width}%"></div></div>
        <span class="prof-bar-value">${formatCurrency(r.estimatedProfit)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function heatmap(rows) {
  return `<div class="prof-heatmap">
    ${rows.map((r) => `<div class="prof-cell level-${r.level}" title="${escapeHtml(r.serviceName)}: margen neto ${formatPercent(r.netMarginPct)}, utilidad ${formatCurrency(r.estimatedProfit)}">
      <strong>${escapeHtml(r.serviceName)}</strong>
      <span>${formatPercent(r.netMarginPct)}</span>
    </div>`).join('')}
  </div>
  <p class="muted prof-legend">🟢 margen neto ≥ 15% · 🟡 entre 0% y 15% · 🔴 negativo</p>`;
}

function shareBars(rows) {
  const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue);
  return `<div class="prof-bars">
    ${byRevenue.map((r) => `<div class="prof-bar-row" title="${formatCurrency(r.revenue)}">
      <span class="prof-bar-label">${escapeHtml(r.serviceName)}</span>
      <div class="prof-bar-track"><div class="prof-bar level-share" style="width:${Math.max(2, Math.round(r.revenueSharePct * 100))}%"></div></div>
      <span class="prof-bar-value">${formatPercent(r.revenueSharePct)}</span>
    </div>`).join('')}
  </div>`;
}

function levelBadge(level) {
  if (level === PROFITABILITY_LEVEL.HIGH) return '<span class="badge healthy">Alta</span>';
  if (level === PROFITABILITY_LEVEL.MEDIUM) return '<span class="badge low_margin">Media</span>';
  return '<span class="badge negative_margin">Baja</span>';
}
