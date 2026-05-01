export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateTime(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('es-CO') : '';
}
