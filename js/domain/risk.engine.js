import { safeDivide } from '../utils/numbers.js';

export const RISK_LEVEL = {
  HEALTHY: 'healthy',
  WATCH: 'watch',
  RISK: 'risk',
};

export function evaluateScenarioRisk(result, { cashProjection = null } = {}) {
  if (!result) return null;
  const revenue = result.totalRevenue;
  const netMarginPct = safeDivide(result.netProfit, revenue);
  const payrollShare = safeDivide(result.payrollFixedCostsTotal, revenue);
  const fixedCoverage = safeDivide(result.totalContributionMargin, result.totalFixedCosts);
  const breakEvenCushion = result.breakEvenRevenue == null ? 0 : safeDivide(revenue, result.breakEvenRevenue);
  const contributionPct = result.contributionMarginPct;

  const factors = [
    buildFactor({
      key: 'netMargin',
      name: 'Margen neto',
      value: netMarginPct,
      display: formatPct(netMarginPct),
      level: netMarginPct >= 0.10 ? RISK_LEVEL.HEALTHY : netMarginPct >= 0 ? RISK_LEVEL.WATCH : RISK_LEVEL.RISK,
      explain: {
        [RISK_LEVEL.HEALTHY]: `La utilidad neta representa el ${formatPct(netMarginPct)} de los ingresos: hay colchon real para crecer e invertir.`,
        [RISK_LEVEL.WATCH]: `La utilidad neta es apenas el ${formatPct(netMarginPct)} de los ingresos. El negocio gana, pero casi cualquier imprevisto se come la utilidad.`,
        [RISK_LEVEL.RISK]: `El escenario pierde plata: el margen neto es ${formatPct(netMarginPct)}. Cada mes en este escenario consume reservas.`,
      },
    }),
    buildFactor({
      key: 'payroll',
      name: 'Peso de la nomina',
      value: payrollShare,
      display: formatPct(payrollShare),
      level: payrollShare <= 0.40 ? RISK_LEVEL.HEALTHY : payrollShare <= 0.55 ? RISK_LEVEL.WATCH : RISK_LEVEL.RISK,
      explain: {
        [RISK_LEVEL.HEALTHY]: `La nomina fija representa el ${formatPct(payrollShare)} de los ingresos proyectados: un nivel manejable para una empresa de servicios educativos.`,
        [RISK_LEVEL.WATCH]: `La nomina fija representa el ${formatPct(payrollShare)} de los ingresos proyectados. En educacion es comun, pero por encima del 40% conviene vigilar cada contratacion.`,
        [RISK_LEVEL.RISK]: `La nomina fija representa el ${formatPct(payrollShare)} de los ingresos proyectados. Es el factor de riesgo clasico en educacion: si los ingresos caen, la nomina no cae con ellos.`,
      },
    }),
    buildFactor({
      key: 'fixedDependency',
      name: 'Cobertura de costos fijos',
      value: fixedCoverage,
      display: `${formatRatio(fixedCoverage)}x`,
      level: fixedCoverage >= 1.35 ? RISK_LEVEL.HEALTHY : fixedCoverage >= 1.05 ? RISK_LEVEL.WATCH : RISK_LEVEL.RISK,
      explain: {
        [RISK_LEVEL.HEALTHY]: `El margen de contribucion cubre ${formatRatio(fixedCoverage)} veces los costos fijos: la estructura fija esta bien soportada.`,
        [RISK_LEVEL.WATCH]: `El margen de contribucion cubre solo ${formatRatio(fixedCoverage)} veces los costos fijos. La estructura fija pesa mucho frente a lo que el negocio genera.`,
        [RISK_LEVEL.RISK]: `El margen de contribucion no alcanza a cubrir los costos fijos (${formatRatio(fixedCoverage)}x). La estructura actual es mas grande que el negocio que la sostiene.`,
      },
    }),
    buildFactor({
      key: 'breakEvenCushion',
      name: 'Colchon sobre el equilibrio',
      value: breakEvenCushion,
      display: result.breakEvenRevenue == null ? 'Inviable' : formatPct(breakEvenCushion - 1),
      level: breakEvenCushion >= 1.15 ? RISK_LEVEL.HEALTHY : breakEvenCushion >= 1 ? RISK_LEVEL.WATCH : RISK_LEVEL.RISK,
      explain: {
        [RISK_LEVEL.HEALTHY]: `Los ingresos superan el punto de equilibrio en ${formatPct(breakEvenCushion - 1)}: podrias perder hasta ese porcentaje de ingresos sin entrar en perdida.`,
        [RISK_LEVEL.WATCH]: `Los ingresos superan el punto de equilibrio por apenas ${formatPct(Math.max(0, breakEvenCushion - 1))}. Una caida pequena de estudiantes pone el mes en rojo.`,
        [RISK_LEVEL.RISK]: result.breakEvenRevenue == null
          ? 'Con el margen actual el punto de equilibrio es inalcanzable: los costos variables superan los ingresos.'
          : `Los ingresos estan ${formatPct(1 - breakEvenCushion)} por debajo del punto de equilibrio: el escenario opera en perdida estructural.`,
      },
    }),
    buildFactor({
      key: 'contribution',
      name: 'Margen de contribucion',
      value: contributionPct,
      display: formatPct(contributionPct),
      level: contributionPct >= 0.35 ? RISK_LEVEL.HEALTHY : contributionPct >= 0.25 ? RISK_LEVEL.WATCH : RISK_LEVEL.RISK,
      explain: {
        [RISK_LEVEL.HEALTHY]: `De cada peso que entra, ${formatPct(contributionPct)} queda libre despues de costos variables: buen poder de absorcion de fijos.`,
        [RISK_LEVEL.WATCH]: `De cada peso que entra, solo ${formatPct(contributionPct)} queda despues de costos variables. Hay poco combustible para cubrir fijos y dejar utilidad.`,
        [RISK_LEVEL.RISK]: `De cada peso que entra, solo ${formatPct(contributionPct)} sobrevive a los costos variables. Con margenes asi, crecer en volumen casi no ayuda: hay que revisar precios y costos por servicio.`,
      },
    }),
  ];

  if (cashProjection) {
    const negatives = cashProjection.negativeMonths?.length || 0;
    const minBalance = cashProjection.minBalance ?? 0;
    const monthsOfFixedCosts = safeDivide(minBalance, result.totalFixedCosts);
    const level = negatives > 0 ? RISK_LEVEL.RISK : monthsOfFixedCosts < 1 ? RISK_LEVEL.WATCH : RISK_LEVEL.HEALTHY;
    factors.push(buildFactor({
      key: 'liquidity',
      name: 'Liquidez proyectada',
      value: minBalance,
      display: formatMoney(minBalance),
      level,
      explain: {
        [RISK_LEVEL.HEALTHY]: `La caja proyectada nunca baja de ${formatMoney(minBalance)}: siempre hay mas de un mes de costos fijos en reserva.`,
        [RISK_LEVEL.WATCH]: `La caja proyectada llega a bajar a ${formatMoney(minBalance)}, menos de un mes de costos fijos. Un retraso en cobros puede generar un hueco.`,
        [RISK_LEVEL.RISK]: `La caja proyectada se vuelve negativa en ${negatives} mes${negatives > 1 ? 'es' : ''} del año (minimo: ${formatMoney(minBalance)}). El escenario no es financiable sin liquidez adicional.`,
      },
    }));
  }

  const riskCount = factors.filter((f) => f.level === RISK_LEVEL.RISK).length;
  const watchCount = factors.filter((f) => f.level === RISK_LEVEL.WATCH).length;
  const overall = riskCount > 0 ? RISK_LEVEL.RISK : watchCount > 0 ? RISK_LEVEL.WATCH : RISK_LEVEL.HEALTHY;
  return {
    overall,
    riskCount,
    watchCount,
    factors,
    headline: buildHeadline(overall, factors),
  };
}

function buildFactor({ key, name, value, display, level, explain }) {
  return { key, name, value, display, level, explanation: explain[level] };
}

function buildHeadline(overall, factors) {
  if (overall === RISK_LEVEL.HEALTHY) return 'El escenario es saludable: ningun indicador esta en zona de riesgo.';
  const worst = factors.filter((f) => f.level === (overall === RISK_LEVEL.RISK ? RISK_LEVEL.RISK : RISK_LEVEL.WATCH));
  const main = worst[0];
  const prefix = overall === RISK_LEVEL.RISK ? 'El riesgo es ALTO' : 'El escenario requiere atencion';
  return `${prefix}: ${lowerFirst(main.explanation)}${worst.length > 1 ? ` Ademas hay ${worst.length - 1} indicador${worst.length > 2 ? 'es' : ''} mas en alerta.` : ''}`;
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function formatPct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatRatio(value) {
  return (Math.round((Number(value) || 0) * 100) / 100).toLocaleString('es-CO');
}
