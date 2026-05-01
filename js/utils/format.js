export const moneyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const numberFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
export const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export function formatCurrency(value) {
  return moneyFormatter.format(Number(value) || 0);
}

export function formatPercent(value) {
  return `${numberFormatter.format((Number(value) || 0) * 100)}%`;
}

export function formatDateTime(value) {
  const date = normalizeDate(value);
  return date ? dateTimeFormatter.format(date) : 'Sin registro';
}

export function formatUpdatedAt(record = {}) {
  return formatDateTime(record.updatedAt || record.createdAt);
}

export function labelForPricing(value) {
  if (value === 'monthly_subscription') return 'Suscripcion mensual';
  return ({
    per_student: 'Clase suelta · precio por estudiante',
    per_class: 'Clase suelta · precio por grupo',
    package: 'Paquete · precio total del paquete',
  })[value] || value || 'Sin definir';
}

export function labelForChargeUnit(value) {
  return ({
    student: 'Cada estudiante',
    group: 'Grupo / familia completa',
  })[value] || value || 'Cada estudiante';
}

export function labelForPeriodicity(value) {
  return ({ monthly: 'Mensual', bimonthly: 'Bimestral', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', one_time: 'Unico' })[value] || value || 'Mensual';
}

export function labelForHealth(value) {
  return ({
    negative_margin: 'Margen negativo',
    low_margin: 'Margen bajo',
    healthy: 'Saludable',
    strong: 'Fuerte',
    loss: 'Perdida',
    risky: 'Riesgoso',
    tight: 'Ajustado',
  })[value] || value || 'Sin estado';
}

export function labelForRole(value) {
  return ({ owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Solo lectura' })[value] || value || 'Sin rol';
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
