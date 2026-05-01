import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { buildDefaultAnnualBudget, buildDefaultMonthlyPlan } from '../domain/annual.engine.js';
import { getFirebase } from './firebase.service.js';
import { getCollection, getDocument } from './firestore.service.js';
import { writeAuditLog } from './audit.service.js';

export async function getAnnualBudgets(planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  return getCollection(collection(db, `${planPath(planId)}/annualBudgets`), 'year');
}

export async function getAnnualBudgetWithMonths(budgetId = DEFAULT_PLAN_ID, planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  const budget = await getDocument(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}`));
  if (!budget) return { budget: null, months: [] };
  const monthsSnap = await getDocs(collection(db, `${planPath(planId)}/annualBudgets/${budgetId}/months`));
  const cyclesSnap = await getDocs(collection(db, `${planPath(planId)}/annualBudgets/${budgetId}/cycles`));
  const months = monthsSnap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.monthIndex || 0) - (b.monthIndex || 0));
  const cycles = cyclesSnap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.startMonth || 0) - (b.startMonth || 0));
  return { budget, months, cycles };
}

export async function createAnnualBudgetBase(year = 2026, baseScenarioId = '', { user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const budgetId = String(year);
  const budget = buildDefaultAnnualBudget(year, baseScenarioId);
  const budgetRef = doc(db, `${planPath(planId)}/annualBudgets/${budgetId}`);
  await setDoc(budgetRef, { ...budget, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user?.uid || null, updatedBy: user?.uid || null }, { merge: true });
  await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const month = buildDefaultMonthlyPlan(year, index + 1, baseScenarioId);
    return setDoc(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}/months/${month.yearMonth}`), {
      ...month,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user?.uid || null,
      updatedBy: user?.uid || null,
    }, { merge: true });
  }));
  await writeAuditLog({ action: 'create', entityType: 'annualBudget', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}`, entityId: budgetId, user, after: budget, planId });
}

export async function updateAnnualBudget(budgetId, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await setDoc(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}`), { ...payload, updatedAt: serverTimestamp(), updatedBy: user?.uid || null }, { merge: true });
  await writeAuditLog({ action: 'update', entityType: 'annualBudget', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}`, entityId: budgetId, user, before, after: payload, planId });
}

export async function updateAnnualBudgetMonth(budgetId, monthId, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await setDoc(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}/months/${monthId}`), {
    ...payload,
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || null,
  }, { merge: true });
  await writeAuditLog({ action: 'update', entityType: 'annualBudgetMonth', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}/months/${monthId}`, entityId: monthId, user, before, after: payload, planId });
}

export async function resetAnnualBudgetMonths(budgetId, year, baseScenarioId, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const month = buildDefaultMonthlyPlan(year, index + 1, baseScenarioId);
    return setDoc(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}/months/${month.yearMonth}`), {
      ...month,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || null,
    }, { merge: true });
  }));
  await writeAuditLog({ action: 'reset', entityType: 'annualBudgetMonths', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}/months`, entityId: budgetId, user, after: { year, baseScenarioId }, planId });
}

export async function createAnnualBudgetCycle(budgetId, payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const ref = await addDoc(collection(db, `${planPath(planId)}/annualBudgets/${budgetId}/cycles`), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user?.uid || null,
    updatedBy: user?.uid || null,
  });
  await writeAuditLog({ action: 'create', entityType: 'annualBudgetCycle', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}/cycles/${ref.id}`, entityId: ref.id, user, after: payload, planId });
}

export async function updateAnnualBudgetCycle(budgetId, cycleId, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await setDoc(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}/cycles/${cycleId}`), {
    ...payload,
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || null,
  }, { merge: true });
  await writeAuditLog({ action: 'update', entityType: 'annualBudgetCycle', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}/cycles/${cycleId}`, entityId: cycleId, user, before, after: payload, planId });
}

export async function deleteAnnualBudgetCycle(budgetId, cycleId, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await deleteDoc(doc(db, `${planPath(planId)}/annualBudgets/${budgetId}/cycles/${cycleId}`));
  await writeAuditLog({ action: 'delete', entityType: 'annualBudgetCycle', entityPath: `${planPath(planId)}/annualBudgets/${budgetId}/cycles/${cycleId}`, entityId: cycleId, user, before, planId });
}
