export function validateService(service) {
  const alerts = [];
  if (service.price <= 0) alerts.push('El precio debe ser mayor a cero.');
  if (service.variableCostPerSubscriber < 0) alerts.push('El costo variable por suscriptor no puede ser negativo.');
  if (service.pricingModel !== 'monthly_subscription' && service.capacityMin > service.capacityMax) alerts.push('La capacidad minima no puede superar la maxima.');
  if (service.pricingModel !== 'monthly_subscription' && service.expectedStudentsPerGroup < service.capacityMin) alerts.push('Los estudiantes esperados estan por debajo de la capacidad minima.');
  if (service.pricingModel !== 'monthly_subscription' && service.expectedStudentsPerGroup > service.capacityMax) alerts.push('Los estudiantes esperados superan la capacidad maxima.');
  if (service.pricingModel === 'package' && service.classesPerPackage <= 0) alerts.push('Los paquetes necesitan clases por paquete mayor a cero.');
  if (!['student', 'group'].includes(service.chargeUnit || 'student')) alerts.push('La unidad de cobro debe ser estudiante o grupo/familia.');
  return alerts;
}

export function validateScenario(_scenario, items) {
  const alerts = [];
  if (!items?.some((item) => item.active !== false)) alerts.push('Este escenario no tiene servicios activos.');
  return alerts;
}
