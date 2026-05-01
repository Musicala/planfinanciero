import { APP_CONFIG, DEFAULT_PLAN_ID, ORG_ID, isAllowedEmail } from './js/config/app.config.js';
import { initFirebase } from './js/services/firebase.service.js';
import { observeAuth, signInWithGoogle, signOutUser } from './js/services/auth.service.js';
import { bootstrapAllowedMember, ensureOrganizationAndPlan, getMember, getPlanBundle, updateSettings } from './js/services/financial-plan.service.js';
import { createService as createServiceDoc, deactivateService as deactivateServiceDoc, deleteAllServices as deleteAllServicesDoc, deleteService as deleteServiceDoc, updateService as updateServiceDoc } from './js/services/services.service.js';
import { createFixedCost as createFixedCostDoc, deactivateFixedCost as deactivateFixedCostDoc, deleteFixedCost as deleteFixedCostDoc, updateFixedCost as updateFixedCostDoc } from './js/services/fixed-costs.service.js';
import { archiveScenario as archiveScenarioDoc, createScenario as createScenarioDoc, createScenarioItem as createScenarioItemDoc, deleteScenarioItem as deleteScenarioItemDoc, duplicateScenario as duplicateScenarioDoc, updateScenario as updateScenarioDoc, updateScenarioItem as updateScenarioItemDoc } from './js/services/scenarios.service.js';
import { createAnnualBudgetBase as createAnnualBudgetBaseDoc, createAnnualBudgetCycle as createAnnualBudgetCycleDoc, deleteAnnualBudgetCycle as deleteAnnualBudgetCycleDoc, resetAnnualBudgetMonths as resetAnnualBudgetMonthsDoc, updateAnnualBudget as updateAnnualBudgetDoc, updateAnnualBudgetCycle as updateAnnualBudgetCycleDoc, updateAnnualBudgetMonth as updateAnnualBudgetMonthDoc } from './js/services/annual-budget.service.js';
import { PAYROLL_FIXED_COST_CATEGORY, allocateScenarioByTargetStudents, calculateFixedCostsSummary, calculateScenario, calculateServiceMetrics, compareScenarios, isPayrollFixedCost } from './js/domain/financial.engine.js';
import { calculateAnnualBudget } from './js/domain/annual.engine.js';
import { normalizeSettings } from './js/domain/financial.models.js';
import { $, escapeHtml } from './js/utils/dom.js';
import { formatCurrency, formatPercent, labelForChargeUnit, labelForPricing, labelForRole } from './js/utils/format.js';
import { toNumber } from './js/utils/numbers.js';
import { createLayout, setActiveNav } from './js/ui/layout.ui.js';
import { renderDashboard } from './js/ui/dashboard.ui.js';
import { renderServicesView } from './js/ui/services.ui.js';
import { renderFixedCostsView } from './js/ui/fixed-costs.ui.js';
import { renderScenariosView } from './js/ui/scenarios.ui.js';
import { renderScenarioDetailView } from './js/ui/scenario-detail.ui.js';
import { renderCompareScenariosView } from './js/ui/compare-scenarios.ui.js';
import { annualCycleModalContent, annualMonthModalContent, readAnnualCycleForm, readAnnualMonthForm, renderAnnualBudgetView } from './js/ui/annual-budget.ui.js';
import { formModal } from './js/ui/forms.ui.js';
import { confirmModal, closeModal, openModal } from './js/ui/modals.ui.js';
import { showToast } from './js/ui/toast.ui.js';

const app = $('#app');

const state = {
  user: null,
  member: null,
  route: 'dashboard',
  selectedScenarioId: null,
  bundle: emptyBundle(),
  loading: true,
};

initFirebase();
observeAuth({
  onSignedOut: renderLogin,
  onSignedIn: async (user) => {
    state.user = user;
    await bootAuthenticated();
  },
});

function emptyBundle() {
  return { plan: null, settings: normalizeSettings({}), serviceLines: [], services: [], fixedCosts: [], scenarios: [], scenarioItems: new Map(), snapshots: new Map(), annualBudget: { budget: null, months: [], cycles: [] } };
}

async function bootAuthenticated() {
  try {
    state.member = await getMember(state.user.uid);
    if (!state.member && isAllowedEmail(state.user.email)) {
      state.member = await bootstrapAllowedMember(state.user);
    }
    if (!state.member?.active) {
      renderUnauthorized();
      return;
    }
    await ensureOrganizationAndPlan(state.user);
    await refreshData();
    renderApp();
  } catch (error) {
    console.error(error);
    if (isPermissionError(error)) {
      renderAccessSetup(error);
      return;
    }
    renderFatal('No se pudo cargar la informacion financiera.');
  }
}

async function refreshData() {
  state.loading = true;
  state.bundle = await getPlanBundle(DEFAULT_PLAN_ID);
  state.bundle.settings = normalizeSettings(state.bundle.settings);
  if (!state.selectedScenarioId) {
    state.selectedScenarioId = state.bundle.scenarios.find((s) => s.status === 'active')?.id || state.bundle.scenarios[0]?.id || null;
  }
  state.loading = false;
}

function canWrite() {
  return ['owner', 'admin', 'editor'].includes(state.member?.role);
}

function canAdmin() {
  return ['owner', 'admin'].includes(state.member?.role);
}

function cleanCategory(value) {
  return String(value || '').trim() || 'Sin categoria';
}

function categoryKey(value) {
  return cleanCategory(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function serviceCategoryLabel(service) {
  return cleanCategory(service?.lineName || service?.modality || 'Sin categoria');
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-card">
        <img src="logo.png" alt="Musicala" class="login-logo" />
        <h1>Plan Financiero 2026</h1>
        <p>Planeacion, escenarios y rentabilidad interna para Musicala.</p>
        <button class="btn btn-primary" id="loginBtn" type="button">Ingresar con Google</button>
      </section>
    </main>`;
  $('#loginBtn').addEventListener('click', () => signInWithGoogle().catch(handleError));
}

function renderUnauthorized() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-card">
        <img src="logo.png" alt="Musicala" class="login-logo" />
        <h1>Acceso no autorizado</h1>
        <p>Tu cuenta esta autenticada, pero no aparece como miembro activo de ${ORG_ID}.</p>
        <button class="btn btn-secondary" id="logoutBtn" type="button">Salir</button>
      </section>
    </main>`;
  $('#logoutBtn').addEventListener('click', signOutUser);
}

function renderAccessSetup(error) {
  const uid = state.user?.uid || '';
  const email = state.user?.email || '';
  const allowed = APP_CONFIG.allowedEmails.join('\n');
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-card">
        <img src="logo.png" alt="Musicala" class="login-logo" />
        <h1>Falta activar tu acceso</h1>
        <p>Firebase ya autentico tu cuenta, pero este correo no pudo completar el acceso automatico.</p>
        <div class="setup-box">
          <strong>Correos autorizados</strong>
          <pre>${escapeHtml(allowed)}</pre>
          <strong>Documento de respaldo</strong>
          <code>organizations/musicala/members/${escapeHtml(uid)}</code>
          <strong>Datos sugeridos</strong>
          <pre>{
  "uid": "${escapeHtml(uid)}",
  "email": "${escapeHtml(email)}",
  "name": "${escapeHtml(state.user?.displayName || '')}",
  "role": "owner",
  "active": true
}</pre>
        </div>
        <button class="btn btn-primary" id="retryBtn" type="button">Reintentar</button>
        <button class="btn btn-secondary" id="logoutBtn" type="button">Salir</button>
      </section>
    </main>`;
  $('#retryBtn').addEventListener('click', bootAuthenticated);
  $('#logoutBtn').addEventListener('click', signOutUser);
  console.error('[access-setup]', error);
}

function renderFatal(message) {
  app.innerHTML = `<main class="login-screen"><section class="login-card"><h1>No se pudo iniciar</h1><p>${escapeHtml(message)}</p><button id="retryBtn" class="btn btn-primary">Reintentar</button></section></main>`;
  $('#retryBtn').addEventListener('click', bootAuthenticated);
}

function isPermissionError(error) {
  return error?.code === 'permission-denied' || String(error?.message || '').toLowerCase().includes('permission');
}

function renderApp() {
  createLayout(app, {
    user: state.user,
    member: state.member,
    plan: state.bundle.plan,
    route: state.route,
    canWrite: canWrite(),
    onNavigate: (route) => {
      state.route = route;
      setActiveNav(route);
      renderRoute();
    },
    onSignOut: signOutUser,
  });
  renderRoute();
}

function renderRoute() {
  const main = $('#mainView');
  if (!main) return;
  setActiveNav(state.route);
  const ctx = buildContext();
  if (!state.bundle.plan) {
    renderPlanCreating(main);
    return;
  }
  if (state.route === 'services') renderServicesView(main, ctx);
  else if (state.route === 'fixed-costs') renderFixedCostsView(main, ctx);
  else if (state.route === 'scenarios') renderScenariosView(main, ctx);
  else if (state.route === 'scenario-detail') renderScenarioDetailView(main, ctx);
  else if (state.route === 'compare') renderCompareScenariosView(main, ctx);
  else if (state.route === 'annual-budget') renderAnnualBudgetView(main, ctx);
  else if (state.route === 'settings') renderSettings(main);
  else renderDashboard(main, ctx);
}

function buildContext() {
  const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId) || state.bundle.scenarios[0] || null;
  const scenarioItems = activeScenario ? (state.bundle.scenarioItems.get(activeScenario.id) || []) : [];
  const calculatedScenario = activeScenario ? calculateScenario(activeScenario, scenarioItems, state.bundle.services, state.bundle.fixedCosts, state.bundle.settings) : null;
  const distributionPreview = activeScenario ? allocateScenarioByTargetStudents(activeScenario, scenarioItems, state.bundle.services, state.bundle.settings) : null;
  const calculatedScenarios = state.bundle.scenarios
    .filter((scenario) => scenario.status !== 'archived')
    .map((scenario) => calculateScenario(scenario, state.bundle.scenarioItems.get(scenario.id) || [], state.bundle.services, state.bundle.fixedCosts, state.bundle.settings));
  const annualBudgetResult = state.bundle.annualBudget?.budget ? calculateAnnualBudget({
    budget: state.bundle.annualBudget.budget,
    monthPlans: state.bundle.annualBudget.months,
    cycles: state.bundle.annualBudget.cycles,
    scenarios: state.bundle.scenarios,
    scenarioItemsByScenarioId: state.bundle.scenarioItems,
    services: state.bundle.services,
    fixedCosts: state.bundle.fixedCosts,
    settings: state.bundle.settings,
  }) : null;
  return {
    APP_CONFIG,
    bundle: state.bundle,
    user: state.user,
    member: state.member,
    canWrite: canWrite(),
    canAdmin: canAdmin(),
    activeScenario,
    scenarioItems,
    calculatedScenario,
    distributionPreview,
    calculatedScenarios,
    annualBudgetResult,
    fixedSummary: calculateFixedCostsSummary(state.bundle.fixedCosts),
    compare: compareScenarios(calculatedScenarios),
    serviceMetrics: state.bundle.services.map((service) => ({ service, metrics: calculateServiceMetrics(service, {}, state.bundle.settings) })),
    actions,
  };
}

const actions = {
  selectScenario(id) {
    state.selectedScenarioId = id;
    state.route = 'scenario-detail';
    renderRoute();
  },
  async refresh() {
    await refreshData();
    renderRoute();
  },
  serviceForm(service = null) {
    if (!guardWrite()) return;
    openModal(formModal({
      title: service ? 'Editar servicio' : 'Crear servicio',
      fields: serviceFields(service),
      submitLabel: service ? 'Guardar cambios' : 'Crear servicio',
      onReady: bindServiceForm,
      onSubmit: async (values) => {
        const payload = normalizeServiceForm(values);
        if (service) await updateServiceDoc(service.id, payload, { before: service, user: state.user });
        else await createServiceDoc(payload, { user: state.user });
        await afterSave('Servicio guardado.');
      },
    }));
  },
  async deactivateService(service) {
    if (!guardWrite()) return;
    if (await confirmModal('Desactivar servicio', `Se desactivara "${service.name}".`)) {
      await deactivateServiceDoc(service.id, { before: service, user: state.user });
      await afterSave('Servicio desactivado.');
    }
  },
  async deleteService(service) {
    if (!guardWrite()) return;
    if (await confirmModal('Eliminar servicio', `Solo elimina servicios que no tengan uso historico. Eliminar "${service.name}"?`)) {
      await deleteServiceDoc(service.id, { before: service, user: state.user });
      state.bundle.services = state.bundle.services.filter((item) => item.id !== service.id);
      state.bundle.scenarioItems.forEach((items, scenarioId) => {
        state.bundle.scenarioItems.set(scenarioId, items.filter((item) => item.serviceId !== service.id));
      });
      closeModal();
      renderRoute();
      showToast('Servicio eliminado.', 'ok');
    }
  },
  async deleteAllServices() {
    if (!guardWrite()) return;
    if (await confirmModal('Eliminar todos los servicios', 'Esto borra todos los servicios y los quita de los escenarios actuales.')) {
      await deleteAllServicesDoc({ user: state.user });
      state.bundle.services = [];
      state.bundle.scenarioItems.forEach((_items, scenarioId) => state.bundle.scenarioItems.set(scenarioId, []));
      closeModal();
      renderRoute();
      showToast('Servicios eliminados.', 'ok');
    }
  },
  fixedCostForm(cost = null) {
    if (!guardWrite()) return;
    openModal(formModal({
      title: cost ? 'Editar costo fijo' : 'Crear costo fijo',
      fields: fixedCostFields(cost),
      submitLabel: cost ? 'Guardar cambios' : 'Crear costo',
      onSubmit: async (values) => {
        const payload = normalizeFixedCostForm(values);
        if (cost) await updateFixedCostDoc(cost.id, payload, { before: cost, user: state.user });
        else await createFixedCostDoc(payload, { user: state.user });
        await afterSave('Costo fijo guardado.');
      },
    }));
  },
  async deactivateFixedCost(cost) {
    if (!guardWrite()) return;
    if (await confirmModal('Desactivar costo fijo', `Se desactivara "${cost.name}".`)) {
      await deactivateFixedCostDoc(cost.id, { before: cost, user: state.user });
      await afterSave('Costo fijo desactivado.');
    }
  },
  async deleteFixedCost(cost) {
    if (!guardWrite()) return;
    if (await confirmModal('Eliminar costo fijo', `Eliminar "${cost.name}"?`)) {
      await deleteFixedCostDoc(cost.id, { before: cost, user: state.user });
      await afterSave('Costo fijo eliminado.');
    }
  },
  scenarioForm(scenario = null) {
    if (!guardWrite()) return;
    openModal(formModal({
      title: scenario ? 'Editar escenario' : 'Crear escenario',
      fields: scenarioFields(scenario),
      submitLabel: scenario ? 'Guardar cambios' : 'Crear escenario',
      onSubmit: async (values) => {
        const payload = normalizeScenarioForm(values);
        if (scenario) await updateScenarioDoc(scenario.id, payload, { before: scenario, user: state.user });
        else await createScenarioDoc(payload, { user: state.user });
        await afterSave('Escenario guardado.');
      },
    }));
  },
  async duplicateScenario(scenario) {
    if (!guardWrite()) return;
    await duplicateScenarioDoc(scenario.id, { name: `${scenario.name} copia`, user: state.user });
    await afterSave('Escenario duplicado.');
  },
  async archiveScenario(scenario) {
    if (!guardWrite()) return;
    await archiveScenarioDoc(scenario.id, { before: scenario, user: state.user });
    await afterSave('Escenario archivado.');
  },
  scenarioItemForm(item = null) {
    if (!guardWrite()) return;
    const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    if (!activeScenario) return showToast('Crea o selecciona un escenario primero.', 'warn');
    openModal(formModal({
      title: item ? 'Editar item del escenario' : 'Agregar servicio al escenario',
      fields: scenarioItemFields(item),
      submitLabel: item ? 'Guardar item' : 'Agregar servicio',
      extraActions: item ? '' : `<button class="btn btn-secondary" id="addAllAvailableServices" type="button">Agregar todos los disponibles</button>`,
      onReady: (form) => bindScenarioItemForm(form, activeScenario),
      onSubmit: async (values) => {
        const payload = normalizeScenarioItemForm(values);
        const items = state.bundle.scenarioItems.get(activeScenario.id) || [];
        const duplicated = items.some((existing) => existing.serviceId === payload.serviceId && existing.id !== item?.id);
        if (duplicated) return showToast('Ese servicio ya esta agregado al escenario.', 'warn');
        const selectedService = state.bundle.services.find((s) => s.id === payload.serviceId);
        payload.serviceName = selectedService?.name || payload.serviceName || 'Servicio';
        if (item) await updateScenarioItemDoc(activeScenario.id, item.id, payload, { before: item, user: state.user });
        else await createScenarioItemDoc(activeScenario.id, payload, { user: state.user });
        await afterSave('Item guardado.');
      },
    }));
  },
  async addAllAvailableScenarioItems(activeScenario) {
    if (!guardWrite()) return;
    const scenario = activeScenario || state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    if (!scenario) return showToast('Selecciona un escenario primero.', 'warn');
    const items = state.bundle.scenarioItems.get(scenario.id) || [];
    const usedServiceIds = new Set(items.map((item) => item.serviceId));
    const availableServices = state.bundle.services.filter((service) => service.active !== false && !usedServiceIds.has(service.id));
    if (!availableServices.length) return showToast('No hay servicios disponibles para agregar.', 'warn');
    await Promise.all(availableServices.map((service) => createScenarioItemDoc(scenario.id, defaultScenarioItemForService(service), { user: state.user })));
    await afterSave(`${availableServices.length} servicios agregados al escenario.`);
  },
  async deleteScenarioItem(item) {
    if (!guardWrite()) return;
    await deleteScenarioItemDoc(state.selectedScenarioId, item.id, { before: item, user: state.user });
    await afterSave('Servicio quitado del escenario.');
  },
  async updateScenarioDistribution(values) {
    if (!guardWrite()) return;
    const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    if (!activeScenario) return showToast('Selecciona un escenario primero.', 'warn');
    const mode = values.mode || 'manual';
    const targetStudents = toNumber(values.targetStudents);
    const focusCategory = String(values.focusCategory || activeScenario.focusCategory || '').trim();
    if (mode === 'weighted_by_students' && focusCategory) {
      await actions.weightScenarioByCategory(targetStudents, focusCategory);
      return;
    }
    await updateScenarioDoc(activeScenario.id, {
      autoDistributionEnabled: mode === 'weighted_by_students',
      distributionMode: mode,
      targetStudents,
      focusCategory,
    }, { before: activeScenario, user: state.user });
    await afterSave(mode === 'weighted_by_students' ? 'Distribucion asistida activada.' : 'Modo manual activado.');
  },
  async updateScenarioItemWeight(item, weightPct) {
    if (!guardWrite() || !item) return;
    const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    const items = activeScenario ? (state.bundle.scenarioItems.get(activeScenario.id) || []) : [];
    const updatedItems = items.map((current) => current.id === item.id ? { ...current, weightPct: toNumber(weightPct) } : current);
    if (activeScenario?.autoDistributionEnabled === true && activeScenario.distributionMode === 'weighted_by_students') {
      const preview = allocateScenarioByTargetStudents(activeScenario, updatedItems, state.bundle.services, state.bundle.settings);
      await Promise.all(preview.rows.map((row) => updateScenarioItemDoc(activeScenario.id, row.item.id, row.appliedItem, { before: row.item, user: state.user })));
      await updateScenarioDoc(activeScenario.id, { distributionUpdatedAt: new Date().toISOString() }, { before: activeScenario, user: state.user });
      await afterSave('Peso actualizado y distribucion recalculada.');
      return;
    }
    await updateScenarioItemDoc(state.selectedScenarioId, item.id, { weightPct: toNumber(weightPct) }, { before: item, user: state.user });
    await afterSave('Peso actualizado.');
  },
  async applyScenarioDistribution(targetStudentsOverride = null, focusCategoryOverride = '') {
    if (!guardWrite()) return;
    const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    const items = activeScenario ? (state.bundle.scenarioItems.get(activeScenario.id) || []) : [];
    if (!activeScenario) return showToast('Selecciona un escenario primero.', 'warn');
    if (toNumber(targetStudentsOverride ?? activeScenario.targetStudents) <= 0) return showToast('Pon primero estudiantes/personas objetivo mayores a cero.', 'warn');
    const focusCategory = String(focusCategoryOverride || activeScenario.focusCategory || '').trim();
    const preview = allocateScenarioByTargetStudents({ ...activeScenario, targetStudents: targetStudentsOverride ?? activeScenario.targetStudents, autoDistributionEnabled: true, distributionMode: 'weighted_by_students' }, items, state.bundle.services, state.bundle.settings);
    if (!preview.rows.length) return showToast('Agrega servicios activos antes de aplicar la distribucion.', 'warn');
    await updateScenarioDoc(activeScenario.id, {
      autoDistributionEnabled: true,
      distributionMode: 'weighted_by_students',
      focusCategory,
      targetStudents: preview.targetStudents,
      distributionUpdatedAt: new Date().toISOString(),
    }, { before: activeScenario, user: state.user });
    await Promise.all(preview.rows.map((row) => updateScenarioItemDoc(activeScenario.id, row.item.id, row.appliedItem, { before: row.item, user: state.user })));
    await afterSave('Distribucion aplicada al escenario.');
  },
  async equalizeScenarioDistribution(targetStudentsOverride = null) {
    if (!guardWrite()) return;
    const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    const items = activeScenario ? (state.bundle.scenarioItems.get(activeScenario.id) || []).filter((item) => item.active !== false) : [];
    if (!activeScenario) return showToast('Selecciona un escenario primero.', 'warn');
    if (!items.length) return showToast('Agrega servicios activos antes de repartir pesos.', 'warn');
    if (toNumber(targetStudentsOverride ?? activeScenario.targetStudents) <= 0) return showToast('Pon primero estudiantes/personas objetivo mayores a cero.', 'warn');
    const weightPct = 100 / items.length;
    const equalizedItems = items.map((item) => ({ ...item, weightPct }));
    const preview = allocateScenarioByTargetStudents({
      ...activeScenario,
      targetStudents: targetStudentsOverride ?? activeScenario.targetStudents,
      autoDistributionEnabled: true,
      distributionMode: 'weighted_by_students',
    }, equalizedItems, state.bundle.services, state.bundle.settings);
    await updateScenarioDoc(activeScenario.id, {
      autoDistributionEnabled: true,
      distributionMode: 'weighted_by_students',
      targetStudents: preview.targetStudents,
      distributionUpdatedAt: new Date().toISOString(),
    }, { before: activeScenario, user: state.user });
    await Promise.all(preview.rows.map((row) => updateScenarioItemDoc(activeScenario.id, row.item.id, row.appliedItem, { before: row.item, user: state.user })));
    await afterSave('Pesos repartidos por igual y distribucion recalculada.');
  },
  async weightScenarioByCategory(targetStudentsOverride = null, focusCategory = '') {
    if (!guardWrite()) return;
    const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
    const items = activeScenario ? (state.bundle.scenarioItems.get(activeScenario.id) || []).filter((item) => item.active !== false) : [];
    if (!activeScenario) return showToast('Selecciona un escenario primero.', 'warn');
    if (!items.length) return showToast('Agrega servicios activos antes de repartir por categoria.', 'warn');
    if (toNumber(targetStudentsOverride ?? activeScenario.targetStudents) <= 0) return showToast('Pon primero estudiantes/personas objetivo mayores a cero.', 'warn');
    const cleanedFocusCategory = cleanCategory(focusCategory || activeScenario.focusCategory || '');
    const focusKey = categoryKey(cleanedFocusCategory);
    if (!focusKey) return showToast('Elige primero la categoria con mas peso.', 'warn');
    const servicesById = new Map(state.bundle.services.map((service) => [service.id, service]));
    const groups = new Map();
    items.forEach((item) => {
      const service = servicesById.get(item.serviceId);
      const label = serviceCategoryLabel(service);
      const key = categoryKey(label);
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key).items.push(item);
    });
    const focusGroup = groups.get(focusKey);
    if (!focusGroup) return showToast(`La categoria "${cleanedFocusCategory}" no esta en los servicios del escenario.`, 'warn');
    const otherGroups = [...groups.values()].filter((group) => group.key !== focusKey);
    const maxOtherGroupSize = Math.max(1, ...otherGroups.map((group) => group.items.length));
    const focusGroupSize = Math.max(1, focusGroup.items.length);
    const focusMultiplier = Math.max(3, Math.ceil(maxOtherGroupSize / focusGroupSize) + 1);
    const scoredItems = items.map((item) => {
      const service = servicesById.get(item.serviceId);
      const itemCategoryKey = categoryKey(serviceCategoryLabel(service));
      return { item, score: itemCategoryKey === focusKey ? focusMultiplier : 1 };
    });
    const totalScore = scoredItems.reduce((sum, row) => sum + row.score, 0);
    const weightedItems = scoredItems.map(({ item, score }) => {
      return { ...item, weightPct: totalScore > 0 ? (score / totalScore) * 100 : 0 };
    });
    const preview = allocateScenarioByTargetStudents({
      ...activeScenario,
      targetStudents: targetStudentsOverride ?? activeScenario.targetStudents,
      autoDistributionEnabled: true,
      distributionMode: 'weighted_by_students',
    }, weightedItems, state.bundle.services, state.bundle.settings);
    await updateScenarioDoc(activeScenario.id, {
      autoDistributionEnabled: true,
      distributionMode: 'weighted_by_students',
      focusCategory: focusGroup.label,
      targetStudents: preview.targetStudents,
      distributionUpdatedAt: new Date().toISOString(),
    }, { before: activeScenario, user: state.user });
    await Promise.all(preview.rows.map((row) => updateScenarioItemDoc(activeScenario.id, row.item.id, row.appliedItem, { before: row.item, user: state.user })));
    await afterSave(`Categoria "${focusGroup.label}" priorizada y distribucion recalculada.`);
  },
  async createAnnualBudget() {
    if (!guardWrite()) return;
    const year = state.bundle.plan?.year || DEFAULT_PLAN_ID;
    const baseScenarioId = state.bundle.annualBudget?.budget?.baseScenarioId || state.selectedScenarioId || state.bundle.scenarios[0]?.id || '';
    await createAnnualBudgetBaseDoc(year, baseScenarioId, { user: state.user });
    await afterSave('Presupuesto anual base creado.');
  },
  async updateAnnualBudgetBaseScenario(baseScenarioId) {
    if (!guardWrite()) return;
    const budget = state.bundle.annualBudget?.budget;
    if (!budget) return;
    await updateAnnualBudgetDoc(budget.id || String(budget.year), { baseScenarioId }, { before: budget, user: state.user });
    await afterSave('Escenario base actualizado.');
  },
  async cleanAnnualBudgetMonths() {
    if (!guardWrite()) return;
    const budget = state.bundle.annualBudget?.budget;
    if (!budget) return showToast('Crea primero el presupuesto anual.', 'warn');
    if (await confirmModal('Limpiar meses del presupuesto', 'Esto reinicia los 12 meses y borra multiplicadores, overrides, ingresos/gastos extra y notas mensuales. Los ciclos y el escenario base se conservan.')) {
      await resetAnnualBudgetMonthsDoc(budget.id || String(budget.year), budget.year, budget.baseScenarioId || state.selectedScenarioId || '', { user: state.user });
      await afterSave('Meses del presupuesto limpiados.');
    }
  },
  annualMonthForm(monthPlan) {
    if (!guardWrite() || !monthPlan) return;
    const budget = state.bundle.annualBudget?.budget;
    if (!budget) return showToast('Crea primero el presupuesto anual.', 'warn');
    const modal = openModal(annualMonthModalContent(buildContext(), monthPlan));
    const form = modal.querySelector('#annualMonthForm');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = readAnnualMonthForm(form, monthPlan);
      payload.scenarioId = budget.baseScenarioId || '';
      await updateAnnualBudgetMonthDoc(budget.id || String(budget.year), monthPlan.yearMonth, payload, { before: monthPlan, user: state.user });
      await afterSave('Mes actualizado.');
    });
  },
  annualCycleForm(cycle = null) {
    if (!guardWrite()) return;
    const budget = state.bundle.annualBudget?.budget;
    if (!budget) return showToast('Crea primero el presupuesto anual.', 'warn');
    const modal = openModal(annualCycleModalContent(buildContext(), cycle));
    const form = modal.querySelector('#annualCycleForm');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = readAnnualCycleForm(form);
      if (cycle) await updateAnnualBudgetCycleDoc(budget.id || String(budget.year), cycle.id, payload, { before: cycle, user: state.user });
      else await createAnnualBudgetCycleDoc(budget.id || String(budget.year), payload, { user: state.user });
      await afterSave('Ciclo especial guardado.');
    });
  },
  async deleteAnnualCycle(cycle) {
    if (!guardWrite() || !cycle) return;
    const budget = state.bundle.annualBudget?.budget;
    if (!budget) return;
    if (await confirmModal('Eliminar ciclo especial', `Eliminar "${cycle.serviceName || 'ciclo'}"?`)) {
      await deleteAnnualBudgetCycleDoc(budget.id || String(budget.year), cycle.id, { before: cycle, user: state.user });
      await afterSave('Ciclo especial eliminado.');
    }
  },
  settingsForm() {
    if (!canAdmin()) return showToast('Solo admin u owner puede editar configuracion.', 'warn');
    const settings = state.bundle.settings;
    openModal(formModal({
      title: 'Configuracion del plan',
      fields: settingsFields(settings),
      submitLabel: 'Guardar configuracion',
      onSubmit: async (values) => {
        await updateSettings(normalizeSettingsForm(values), { before: settings, user: state.user });
        await afterSave('Configuracion guardada.');
      },
    }));
  },
};

function renderPlanCreating(main) {
  main.innerHTML = `
    <section class="empty-state">
      <h2>Preparando plan financiero</h2>
      <p>No se encontro el plan ${DEFAULT_PLAN_ID}. Recarga para crearlo vacio con tu usuario autorizado.</p>
    </section>`;
}

function renderSettings(main) {
  const s = state.bundle.settings;
  main.innerHTML = `
    <section class="view-head">
      <div><p class="eyebrow">Configuracion</p><h2>Plan financiero ${escapeHtml(state.bundle.plan?.year || DEFAULT_PLAN_ID)}</h2></div>
      <div class="actions">
        <button class="btn btn-primary" id="editSettings" ${canAdmin() ? '' : 'disabled'}>Editar configuracion</button>
      </div>
    </section>
    <section class="panel settings-grid">
      ${settingCard('Meta utilidad', formatPercent(s.targetProfitPct))}
      ${settingCard('IVA estimado', formatPercent(s.vatPct))}
      ${settingCard('Precios incluyen IVA', s.pricesIncludeVat ? 'Si' : 'No')}
      ${settingCard('Impuesto sobre utilidad', formatPercent(s.incomeTaxPct))}
      ${settingCard('Fee pasarela', formatPercent(s.defaultPaymentFeePct))}
      ${settingCard('Comision', formatPercent(s.defaultCommissionPct))}
      ${settingCard('Retencion', formatPercent(s.defaultWithholdingPct))}
      ${settingCard('Estudiantes esperados por grupo', s.defaultExpectedStudentsPerGroup)}
      ${settingCard('Pago docente', teacherPaymentLabel(s.teacherPaymentStrategy))}
      ${settingCard('Rol actual', labelForRole(state.member?.role))}
    </section>`;
  $('#editSettings')?.addEventListener('click', actions.settingsForm);
}

function settingCard(label, value) {
  return `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function teacherPaymentLabel(value) {
  return value === 'payroll' ? 'Cubierto por nomina fija' : 'Por servicio/clase';
}

function guardWrite() {
  if (canWrite()) return true;
  showToast('No tienes permisos para editar.', 'warn');
  return false;
}

async function afterSave(message) {
  closeModal();
  await refreshData();
  renderRoute();
  showToast(message, 'ok');
}

function handleError(error) {
  console.error(error);
  const message = error?.code === 'permission-denied'
    ? 'Firebase no dio permiso para borrar. Revisa que hayas publicado las rules actualizadas.'
    : error?.message || error?.friendlyMessage || 'No se pudo completar la operacion.';
  showToast(message, 'error');
}

window.addEventListener('unhandledrejection', (event) => handleError(event.reason));

function serviceFields(service) {
  const pricingOptions = ['per_student', 'per_class', 'package', 'monthly_subscription'].map((value) => ({ value, label: labelForPricing(value) }));
  const chargeUnitOptions = [
    { value: 'student', label: 'Cada estudiante' },
    { value: 'group', label: 'Grupo / familia completa' },
  ];
  return [
    ['name', 'Nombre', 'text', service?.name, true],
    ['code', 'Codigo', 'text', service?.code, true],
    ['lineName', 'Linea', 'text', service?.lineName || '', true],
    ['modality', 'Modalidad', 'text', service?.modality || 'Presencial', true],
    ['pricingModel', 'Modelo de cobro', 'select', service?.pricingModel || 'per_student', true, pricingOptions],
    ['chargeUnit', 'Precio aplicado a', 'select', service?.chargeUnit || service?.priceUnit || defaultChargeUnitForService(service), true, chargeUnitOptions],
    ['chargeUnitHelp', 'Usa grupo/familia cuando el precio sea el mismo sin importar si asisten 2, 4 o más personas.', 'help', '', false],
    ['price', 'Precio base', 'number', service?.price ?? 0, true],
    ['classesPerPackage', 'Clases por paquete (solo si es paquete)', 'number', service?.classesPerPackage ?? 1, true],
    ['packageSettings', 'Configuracion de paquetes', 'section', 'Estos campos aplican solo cuando el modelo de cobro es paquete.', false],
    ['packageDurationMonths', 'Duracion del paquete en meses', 'number', service?.packageDurationMonths ?? 1, false],
    ['packageCycleMode', 'Ciclo del paquete', 'select', service?.packageCycleMode || 'rolling', false, [{ value: 'rolling', label: 'Continuo' }, { value: 'fixed_window', label: 'Fechas fijas' }]],
    ['cycleStartMonths', 'Meses de inicio permitidos', 'month-multiselect', service?.cycleStartMonths || [], false, { help: 'Marca los meses donde puede iniciar el ciclo. Ejemplo: Preuniversitario en febrero y agosto.' }],
    ['classesPerMonthOverride', 'Clases promedio por mes opcional', 'number', service?.classesPerMonthOverride ?? '', false],
    ['subscriptionSettings', 'Configuracion de suscripcion', 'section', 'Estos campos aplican solo cuando el modelo de cobro es suscripcion mensual.', false],
    ['subscriptionDurationMonths', 'Duracion de la suscripcion en meses', 'number', service?.subscriptionDurationMonths ?? 1, false],
    ['capacityMin', 'Capacidad mínima de estudiantes', 'number', service?.capacityMin ?? 1, true],
    ['capacityMax', 'Capacidad máxima de estudiantes', 'number', service?.capacityMax ?? 8, true],
    ['expectedStudentsPerGroup', 'Estudiantes esperados por grupo', 'number', service?.expectedStudentsPerGroup ?? state.bundle.settings.defaultExpectedStudentsPerGroup, true],
    ['teacherCostPerClass', 'Pago docente por clase', 'number', service?.teacherCostPerClass ?? 0, false],
    ['materialsCostPerStudent', 'Materiales por estudiante', 'number', service?.materialsCostPerStudent ?? 0, false],
    ['materialsCostPerClass', 'Materiales por clase', 'number', service?.materialsCostPerClass ?? 0, false],
    ['transportCostPerClass', 'Transporte por clase', 'number', service?.transportCostPerClass ?? 0, false],
    ['variableCostPerSubscriber', 'Costo variable por suscriptor al mes', 'number', service?.variableCostPerSubscriber ?? 0, false],
    ['commissionPct', 'Comision %', 'number', (service?.commissionPct ?? state.bundle.settings.defaultCommissionPct) * 100, false],
    ['paymentFeePct', 'Fee pasarela %', 'number', (service?.paymentFeePct ?? state.bundle.settings.defaultPaymentFeePct) * 100, false],
    ['withholdingPct', 'Retencion %', 'number', (service?.withholdingPct ?? state.bundle.settings.defaultWithholdingPct) * 100, false],
    ['otherVariableCostPerClass', 'Otros costos variables', 'number', service?.otherVariableCostPerClass ?? 0, false],
    ['notes', 'Notas', 'textarea', service?.notes || '', false],
    ['active', 'Activo', 'checkbox', service?.active ?? true, false],
  ];
}

function defaultChargeUnitForService(service) {
  if (service?.pricingModel === 'monthly_subscription') return 'student';
  return service?.pricingModel === 'per_class' || service?.billingModel === 'class_total' ? 'group' : 'student';
}

function bindServiceForm(form) {
  const pricing = form.elements.pricingModel;
  const packageNames = ['packageSettings', 'packageDurationMonths', 'packageCycleMode', 'cycleStartMonths', 'classesPerMonthOverride'];
  const subscriptionNames = ['subscriptionSettings', 'subscriptionDurationMonths'];
  const packageFields = packageNames.map((name) => form.querySelector(`[data-field="${name}"]`)).filter(Boolean);
  const subscriptionFields = subscriptionNames.map((name) => form.querySelector(`[data-field="${name}"]`)).filter(Boolean);
  const sync = () => {
    packageFields.forEach((field) => field.classList.toggle('hidden', pricing?.value !== 'package'));
    subscriptionFields.forEach((field) => field.classList.toggle('hidden', pricing?.value !== 'monthly_subscription'));
  };
  const syncMonths = () => {
    const picker = form.querySelector('[data-field="cycleStartMonths"]');
    const hidden = form.elements.cycleStartMonths;
    if (!picker || !hidden) return;
    hidden.value = Array.from(picker.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value).join(',');
  };
  sync();
  syncMonths();
  pricing?.addEventListener('change', sync);
  form.querySelector('[data-field="cycleStartMonths"]')?.addEventListener('change', syncMonths);
}

function fixedCostFields(cost) {
  const categoryValues = [
    'Arriendo',
    'Servicios públicos',
    'Software',
    'Contabilidad',
    'Publicidad',
    'Mantenimiento',
    PAYROLL_FIXED_COST_CATEGORY,
    'Otros',
  ];
  const currentCategory = (cost?.category || '').trim();
  if (currentCategory && !categoryValues.includes(currentCategory)) categoryValues.push(currentCategory);
  const fixedCostCategories = categoryValues.map((value) => ({ value, label: value }));
  return [
    ['name', 'Costo', 'text', cost?.name, true],
    ['category', 'Categoria', 'select', cost?.category || 'Otros', true, fixedCostCategories],
    ['amount', 'Valor original', 'number', cost?.amount ?? 0, true],
    ['periodicity', 'Periodicidad', 'select', cost?.periodicity || 'monthly', true, ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'one_time']],
    ['startDate', 'Fecha inicio', 'date', cost?.startDate || '', false],
    ['endDate', 'Fecha fin', 'date', cost?.endDate || '', false],
    ['essential', 'Esencial', 'checkbox', cost?.essential ?? true, false],
    ['reducible', 'Reducible', 'checkbox', cost?.reducible ?? false, false],
    ['active', 'Activo', 'checkbox', cost?.active ?? true, false],
    ['notes', 'Notas', 'textarea', cost?.notes || '', false],
  ];
}

function scenarioFields(scenario) {
  return [
    ['name', 'Nombre', 'text', scenario?.name, true],
    ['description', 'Descripcion', 'textarea', scenario?.description || '', false],
    ['type', 'Tipo', 'text', scenario?.type || '', true],
    ['status', 'Estado', 'select', scenario?.status || 'draft', true, ['draft', 'active', 'archived']],
    ['targetProfitPct', 'Meta utilidad %', 'number', ((scenario?.targetProfitPct ?? state.bundle.settings.targetProfitPct) * 100), false],
    ['active', 'Activo', 'checkbox', scenario?.active ?? true, false],
  ];
}

function scenarioItemFields(item) {
  const activeScenario = state.bundle.scenarios.find((s) => s.id === state.selectedScenarioId);
  const scenarioItems = activeScenario ? (state.bundle.scenarioItems.get(activeScenario.id) || []) : [];
  const usedServiceIds = new Set(scenarioItems.filter((existing) => existing.id !== item?.id).map((existing) => existing.serviceId));
  const activeServices = state.bundle.services
    .filter((s) => s.active && (!usedServiceIds.has(s.id) || s.id === item?.serviceId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  const selectedService = activeServices.find((s) => s.id === item?.serviceId);
  const serviceOptions = activeServices.map((s) => ({ value: s.id, label: s.name }));
  const expectedStudents = item?.expectedStudentsPerClass ?? selectedService?.expectedStudentsPerGroup ?? state.bundle.settings.defaultExpectedStudentsPerGroup;
  return [
    ['serviceId', 'Servicio', 'select', item?.serviceId || '', true, [{ value: '', label: serviceOptions.length ? 'Selecciona un servicio' : 'Todos los servicios activos ya estan agregados' }, ...serviceOptions]],
    ['baseServiceSummary', 'Servicio base', 'service-summary', '', false],
    ['expectedClassesPerMonth', 'Clases al mes', 'number', item?.expectedClassesPerMonth ?? 0, false],
    ['expectedPackagesPerMonth', 'Paquetes al mes', 'number', item?.expectedPackagesPerMonth ?? 0, false],
    ['expectedSubscribersPerMonth', 'Suscriptores activos al mes', 'number', item?.expectedSubscribersPerMonth ?? 0, false],
    ['expectedSubscribersHelp', 'Usa este campo para MusiGym, plataforma online u otros servicios de suscripcion mensual.', 'help', '', false],
    ['expectedStudentsPerClass', 'Estudiantes por clase', 'number', expectedStudents, false],
    ['weightPct', 'Peso en la mezcla %', 'number', item?.weightPct ?? 0, false],
    ['weightPctHelp', 'Este porcentaje se usa solo si el escenario tiene distribución asistida activa.', 'help', '', false],
    ['notes', 'Notas', 'textarea', item?.notes || '', false],
    ['active', 'Activo', 'checkbox', item?.active ?? true, false],
    ['customAdjustments', 'Ajustes personalizados opcionales', 'section', 'Déjalos vacíos para usar los valores base del servicio. Llénalos solo si este escenario necesita un precio, costo o porcentaje diferente.', false],
    ['customPrice', 'Precio diferente para este escenario', 'number', item?.customPrice ?? '', false],
    ['customTeacherCostPerClass', 'Pago docente diferente para este escenario', 'number', item?.customTeacherCostPerClass ?? '', false],
    ['customMaterialsCostPerStudent', 'Materiales diferentes por estudiante', 'number', item?.customMaterialsCostPerStudent ?? '', false],
    ['customTransportCostPerClass', 'Transporte diferente por clase', 'number', item?.customTransportCostPerClass ?? '', false],
    ['customCommissionPct', 'Comisión diferente %', 'number', item?.customCommissionPct == null ? '' : item.customCommissionPct * 100, false],
    ['customPaymentFeePct', 'Fee pasarela diferente %', 'number', item?.customPaymentFeePct == null ? '' : item.customPaymentFeePct * 100, false],
    ['customWithholdingPct', 'Retención diferente %', 'number', item?.customWithholdingPct == null ? '' : item.customWithholdingPct * 100, false],
    ['customAdjustmentsHelp', 'Estos campos son opcionales. Si quedan vacíos, se usan los datos del servicio base.', 'help', '', false],
  ];
}

function bindScenarioItemForm(form, activeScenario) {
  const select = form.elements.serviceId;
  const studentsInput = form.elements.expectedStudentsPerClass;
  const summary = form.querySelector('[data-service-summary] .service-summary-grid');
  const servicesById = new Map(state.bundle.services.map((service) => [service.id, service]));
  const update = ({ syncStudents = false } = {}) => {
    const service = servicesById.get(select?.value);
    if (syncStudents && studentsInput) {
      studentsInput.value = service?.expectedStudentsPerGroup ?? state.bundle.settings.defaultExpectedStudentsPerGroup;
    }
    if (!summary) return;
    if (!service) {
      summary.innerHTML = '<p class="muted">Selecciona un servicio para ver los valores base que usará el escenario.</p>';
      return;
    }
    summary.innerHTML = scenarioServiceSummary(service);
  };
  update();
  select?.addEventListener('change', () => update({ syncStudents: true }));
  document.querySelector('#addAllAvailableServices')?.addEventListener('click', () => actions.addAllAvailableScenarioItems(activeScenario));
}

function defaultScenarioItemForService(service) {
  return {
    serviceId: service.id,
    serviceName: service.name || 'Servicio',
    active: true,
    expectedClassesPerMonth: 0,
    expectedPackagesPerMonth: 0,
    expectedSubscribersPerMonth: 0,
    expectedStudentsPerClass: service.expectedStudentsPerGroup ?? state.bundle.settings.defaultExpectedStudentsPerGroup,
    weightPct: 0,
    autoGenerated: false,
    lockedManualValues: true,
    customPrice: null,
    customTeacherCostPerClass: null,
    customMaterialsCostPerStudent: null,
    customTransportCostPerClass: null,
    customCommissionPct: null,
    customPaymentFeePct: null,
    customWithholdingPct: null,
    notes: '',
  };
}

function scenarioServiceSummary(service) {
  const metrics = calculateServiceMetrics(service, {}, state.bundle.settings);
  const rows = [
    ['Precio base', formatCurrency(service.price)],
    ['Precio aplicado a', labelForChargeUnit(service.chargeUnit || service.priceUnit || defaultChargeUnitForService(service))],
    ['Duracion paquete', service.pricingModel === 'package' ? `${service.packageDurationMonths || 1} meses` : 'No aplica'],
    ['Cobro paquete', service.pricingModel === 'package' ? (service.cashCollectionMode === 'upfront' ? 'Inicio' : 'Mensual') : 'No aplica'],
    ['Duracion suscripcion', service.pricingModel === 'monthly_subscription' ? `${service.subscriptionDurationMonths || 1} meses` : 'No aplica'],
    ['Costo variable por suscriptor', formatCurrency(service.variableCostPerSubscriber || 0)],
    ['Pago docente guardado', formatCurrency(metrics.rawTeacherCostPerClass ?? service.teacherCostPerClass)],
    ['Pago docente calculado', state.bundle.settings.teacherPaymentStrategy === 'payroll' ? 'Cubierto por nomina' : formatCurrency(service.teacherCostPerClass)],
    ['Materiales por estudiante', formatCurrency(service.materialsCostPerStudent)],
    ['Transporte por clase', formatCurrency(service.transportCostPerClass)],
    ['Comisión', formatPercent(service.commissionPct)],
    ['Fee pasarela', formatPercent(service.paymentFeePct)],
    ['Retención', formatPercent(service.withholdingPct)],
    ['Estudiantes esperados por grupo', service.expectedStudentsPerGroup ?? state.bundle.settings.defaultExpectedStudentsPerGroup],
  ];
  return rows.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
}

function settingsFields(s) {
  return [
    ['targetProfitPct', 'Meta utilidad %', 'number', s.targetProfitPct * 100, true],
    ['vatPct', 'IVA estimado %', 'number', s.vatPct * 100, true],
    ['pricesIncludeVat', 'Los precios incluyen IVA', 'checkbox', s.pricesIncludeVat ?? false, false],
    ['incomeTaxPct', 'Impuesto sobre utilidad %', 'number', s.incomeTaxPct * 100, false],
    ['defaultPaymentFeePct', 'Fee pasarela %', 'number', s.defaultPaymentFeePct * 100, false],
    ['defaultWithholdingPct', 'Retencion %', 'number', s.defaultWithholdingPct * 100, false],
    ['defaultCommissionPct', 'Comision %', 'number', s.defaultCommissionPct * 100, false],
    ['defaultExpectedStudentsPerGroup', 'Estudiantes esperados por grupo', 'number', s.defaultExpectedStudentsPerGroup, true],
    ['teacherPaymentSection', 'Pago docente', 'section', 'Si seleccionas nomina fija, los valores de pago docente guardados en cada servicio se conservan, pero no se restan como costo variable. Se asume que ese costo ya esta incluido en los costos fijos de nomina.', false],
    ['teacherPaymentStrategy', 'Tratamiento del pago docente', 'select', s.teacherPaymentStrategy || 'per_service', true, [{ value: 'per_service', label: 'Restar pago docente por servicio/clase' }, { value: 'payroll', label: 'Docente cubierto por nomina fija' }]],
    ['notes', 'Notas', 'textarea', s.notes || '', false],
  ];
}

function normalizeServiceForm(v) {
  const lineName = v.lineName;
  const pricingModel = v.pricingModel;
  const chargeUnit = ['student', 'group'].includes(v.chargeUnit) ? v.chargeUnit : 'student';
  const classesPerPackage = pricingModel === 'package'
    ? Math.max(1, toNumber(v.classesPerPackage, 1))
    : pricingModel === 'monthly_subscription' ? 0 : 1;
  return {
    name: v.name.trim(), code: v.code.trim(), lineId: lineName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'), lineName,
    modality: v.modality.trim(), active: !!v.active, pricingModel, chargeUnit, price: toNumber(v.price), classesPerPackage,
    packageDurationMonths: pricingModel === 'package' ? Math.max(1, toNumber(v.packageDurationMonths, 1)) : 1,
    packageCycleMode: v.packageCycleMode || 'rolling',
    cycleStartMonths: String(v.cycleStartMonths || '').split(',').map((item) => toNumber(item.trim())).filter((month) => month >= 1 && month <= 12),
    cashCollectionMode: pricingModel === 'package' ? 'upfront' : 'monthly_installments',
    classesPerMonthOverride: nullableNumber(v.classesPerMonthOverride),
    subscriptionDurationMonths: pricingModel === 'monthly_subscription' ? Math.max(1, toNumber(v.subscriptionDurationMonths, 1)) : 1,
    capacityMin: toNumber(v.capacityMin), capacityMax: toNumber(v.capacityMax), expectedStudentsPerGroup: toNumber(v.expectedStudentsPerGroup),
    teacherCostPerClass: toNumber(v.teacherCostPerClass), materialsCostPerStudent: toNumber(v.materialsCostPerStudent), materialsCostPerClass: toNumber(v.materialsCostPerClass), variableCostPerSubscriber: toNumber(v.variableCostPerSubscriber),
    transportCostPerClass: toNumber(v.transportCostPerClass), commissionPct: toNumber(v.commissionPct) / 100, paymentFeePct: toNumber(v.paymentFeePct) / 100,
    withholdingPct: toNumber(v.withholdingPct) / 100, otherVariableCostPerClass: toNumber(v.otherVariableCostPerClass), notes: v.notes || '',
  };
}

function normalizeFixedCostForm(v) {
  const category = (v.category || 'Otros').trim();
  const amount = isPayrollFixedCost({ category }) ? Math.max(0, toNumber(v.amount)) : toNumber(v.amount);
  return { name: v.name.trim(), category, amount, periodicity: v.periodicity, active: !!v.active, essential: !!v.essential, reducible: !!v.reducible, startDate: v.startDate || '', endDate: v.endDate || '', notes: v.notes || '' };
}

function normalizeScenarioForm(v) {
  return { name: v.name.trim(), description: v.description || '', type: v.type, status: v.status, targetProfitPct: toNumber(v.targetProfitPct) / 100, active: !!v.active };
}

function nullableNumber(v, pct = false) {
  if (v === '' || v == null) return null;
  const n = toNumber(v);
  return pct ? n / 100 : n;
}

function normalizeScenarioItemForm(v) {
  return {
    serviceId: v.serviceId, serviceName: '', active: !!v.active, expectedClassesPerMonth: toNumber(v.expectedClassesPerMonth), expectedPackagesPerMonth: toNumber(v.expectedPackagesPerMonth), expectedSubscribersPerMonth: toNumber(v.expectedSubscribersPerMonth), expectedStudentsPerClass: toNumber(v.expectedStudentsPerClass),
    weightPct: toNumber(v.weightPct),
    autoGenerated: false,
    lockedManualValues: true,
    customPrice: nullableNumber(v.customPrice), customTeacherCostPerClass: nullableNumber(v.customTeacherCostPerClass), customMaterialsCostPerStudent: nullableNumber(v.customMaterialsCostPerStudent), customTransportCostPerClass: nullableNumber(v.customTransportCostPerClass),
    customCommissionPct: nullableNumber(v.customCommissionPct, true), customPaymentFeePct: nullableNumber(v.customPaymentFeePct, true), customWithholdingPct: nullableNumber(v.customWithholdingPct, true), notes: v.notes || '',
  };
}

function normalizeSettingsForm(v) {
  return normalizeSettings({ ...v, vatPct: toNumber(v.vatPct) / 100, incomeTaxPct: toNumber(v.incomeTaxPct) / 100, defaultPaymentFeePct: toNumber(v.defaultPaymentFeePct) / 100, defaultWithholdingPct: toNumber(v.defaultWithholdingPct) / 100, defaultCommissionPct: toNumber(v.defaultCommissionPct) / 100, teacherPaymentStrategy: v.teacherPaymentStrategy || 'per_service' });
}
