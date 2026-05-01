import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatPercent, formatUpdatedAt, labelForChargeUnit, labelForHealth, labelForPricing } from '../utils/format.js';

export function renderServicesView(root, ctx) {
  const rows = ctx.serviceMetrics;
  if (!rows.length) {
    root.innerHTML = `
      <section class="view-head"><div><p class="eyebrow">Servicios</p><h2>Servicios financieros</h2></div><button class="btn btn-primary" id="newService" ${ctx.canWrite ? '' : 'disabled'}>Crear servicio</button></section>
      <section class="empty-state"><h2>No hay servicios cargados</h2><p>Crea el primer servicio real de Musicala para calcular margen de contribucion.</p></section>`;
    document.querySelector('#newService')?.addEventListener('click', () => ctx.actions.serviceForm());
    return;
  }
  root.innerHTML = `
    <section class="view-head"><div><p class="eyebrow">Servicios</p><h2>Margen de contribucion por servicio</h2></div><div class="actions"><button class="btn btn-danger" id="deleteAllServices" ${ctx.canWrite && rows.length ? '' : 'disabled'}>Eliminar todos</button><button class="btn btn-primary" id="newService" ${ctx.canWrite ? '' : 'disabled'}>Crear servicio</button></div></section>
    <section class="reading healthy"><p>Pago docente: ${ctx.bundle.settings.teacherPaymentStrategy === 'payroll' ? 'cubierto por nomina fija. Los valores guardados no se restan como costo variable.' : 'por servicio/clase. El pago docente guardado se resta como costo variable.'}</p></section>
    ${servicesSummary(rows)}
    <section class="panel table-wrap"><table>
      <thead><tr><th>Servicio</th><th>Linea</th><th>Modalidad</th><th>Modelo</th><th>Precio aplicado a</th><th class="num">Precio</th><th class="num">Unidad base</th><th class="num">Ingreso unidad</th><th class="num">Costo variable</th><th class="num">Margen unidad</th><th class="num">Margen %</th><th>Ultima edicion</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows.map(({ service, metrics }) => row(service, metrics, ctx)).join('')}</tbody>
    </table></section>`;
  document.querySelector('#newService')?.addEventListener('click', () => ctx.actions.serviceForm());
  document.querySelector('#deleteAllServices')?.addEventListener('click', ctx.actions.deleteAllServices);
  bindRows(ctx);
}

function servicesSummary(rows) {
  const total = rows.length;
  const active = rows.filter(({ service }) => service.active !== false).length;
  const subscriptions = rows.filter(({ metrics }) => metrics.pricingModel === 'monthly_subscription').length;
  const packages = rows.filter(({ metrics }) => metrics.pricingModel === 'package').length;
  return `<section class="kpi-grid">
    <article class="metric-card"><span>Servicios cargados</span><strong>${total}</strong></article>
    <article class="metric-card"><span>Servicios activos</span><strong>${active}</strong></article>
    <article class="metric-card"><span>Suscripciones mensuales</span><strong>${subscriptions}</strong></article>
    <article class="metric-card"><span>Paquetes con duracion</span><strong>${packages}</strong></article>
  </section>`;
}

function row(service, metrics, ctx) {
  const isSubscription = metrics.pricingModel === 'monthly_subscription';
  const isPackage = metrics.pricingModel === 'package';
  const unitLabel = isSubscription ? `${metrics.subscriptionDurationMonths || 1} mes(es)` : isPackage ? `${metrics.classesPerPackageMonth} clases/mes` : metrics.expectedStudentsPerGroup;
  const unitRevenue = isSubscription ? metrics.revenuePerSubscription : metrics.revenuePerClass;
  const unitCost = isSubscription ? metrics.variableCostPerSubscription : metrics.variableCostPerClass;
  const unitMargin = isSubscription ? metrics.contributionMarginPerSubscription : metrics.contributionMarginPerClass;
  return `<tr>
    <td><strong>${escapeHtml(service.name)}</strong><br><small>${escapeHtml(service.code || '')}</small>${isPackage ? `<br><small>${escapeHtml(String(metrics.packageDurationMonths))} meses · ${service.packageCycleMode === 'fixed_window' ? 'fechas fijas' : 'continuo'} · cobro inicio</small>` : ''}${isSubscription ? `<br><small>Duracion ${escapeHtml(String(metrics.subscriptionDurationMonths || 1))} mes(es)</small>` : ''}<br><small>${metrics.teacherPaymentStrategy === 'payroll' ? 'Pago docente guardado, no se resta por nomina.' : 'Pago docente se resta como variable.'}</small></td>
    <td>${escapeHtml(service.lineName || '')}</td><td>${escapeHtml(service.modality || '')}</td><td>${labelForPricing(metrics.pricingModel || service.pricingModel)}</td><td>${labelForChargeUnit(metrics.chargeUnit || service.chargeUnit || service.priceUnit || 'student')}</td>
    <td class="num">${formatCurrency(service.price)}</td><td class="num">${escapeHtml(String(unitLabel))}</td><td class="num">${formatCurrency(unitRevenue)}</td><td class="num">${formatCurrency(unitCost)}</td><td class="num">${formatCurrency(unitMargin)}</td><td class="num">${formatPercent(metrics.contributionMarginPct)}</td><td class="nowrap"><small>${escapeHtml(formatUpdatedAt(service))}</small></td>
    <td><span class="badge ${metrics.healthStatus}">${labelForHealth(metrics.healthStatus)}</span>${service.active === false ? '<br><span class="badge off">Inactivo</span>' : ''}</td>
    <td class="nowrap"><button class="btn btn-ghost" data-edit-service="${service.id}">Editar</button><button class="btn btn-ghost" data-off-service="${service.id}">Desactivar</button><button class="btn btn-ghost" data-del-service="${service.id}">Eliminar</button></td>
  </tr>`;
}

function bindRows(ctx) {
  document.querySelectorAll('[data-edit-service]').forEach((b) => b.addEventListener('click', () => ctx.actions.serviceForm(ctx.bundle.services.find((s) => s.id === b.dataset.editService))));
  document.querySelectorAll('[data-off-service]').forEach((b) => b.addEventListener('click', () => ctx.actions.deactivateService(ctx.bundle.services.find((s) => s.id === b.dataset.offService))));
  document.querySelectorAll('[data-del-service]').forEach((b) => b.addEventListener('click', () => ctx.actions.deleteService(ctx.bundle.services.find((s) => s.id === b.dataset.delService))));
}
