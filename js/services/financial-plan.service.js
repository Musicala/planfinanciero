import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, ORG_ID, isAllowedEmail, planPath } from '../config/app.config.js';
import { getFirebase } from './firebase.service.js';
import { getCollection, getDocument, planCollection, planDoc, setAt } from './firestore.service.js';
import { writeAuditLog } from './audit.service.js';

export async function getMember(uid) {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, `organizations/${ORG_ID}/members/${uid}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function bootstrapAllowedMember(user) {
  if (!isAllowedEmail(user?.email)) return null;
  const { db } = getFirebase();
  await setDoc(doc(db, `organizations/${ORG_ID}`), {
    name: 'Musicala',
    slug: ORG_ID,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  const member = {
    uid: user.uid,
    email: String(user.email || '').toLowerCase(),
    name: user.displayName || '',
    role: 'owner',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, `organizations/${ORG_ID}/members/${user.uid}`), member, { merge: true });
  return { id: user.uid, ...member };
}

export async function getFinancialPlan(planId = DEFAULT_PLAN_ID) {
  return getDocument(planDoc(planId));
}

export async function getSettings(planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, `${planPath(planId)}/settings/main`));
  return snap.exists() ? snap.data() : {};
}

export async function updateSettings(payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await setAt(doc(db, `${planPath(planId)}/settings/main`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'settings', entityPath: `${planPath(planId)}/settings/main`, entityId: 'main', user, before, after: payload, planId });
}

export async function getPlanBundle(planId = DEFAULT_PLAN_ID) {
  const plan = await getFinancialPlan(planId);
  if (!plan) return { plan: null, settings: {}, serviceLines: [], services: [], fixedCosts: [], scenarios: [], scenarioItems: new Map(), snapshots: new Map(), annualBudget: { budget: null, months: [], cycles: [] } };
  const [settings, serviceLines, services, fixedCosts, scenarios] = await Promise.all([
    getSettings(planId),
    getCollection(planCollection('serviceLines', planId), 'sortOrder'),
    getCollection(planCollection('services', planId), 'name'),
    getCollection(planCollection('fixedCosts', planId), 'category'),
    getCollection(planCollection('scenarios', planId), 'name'),
  ]);
  const scenarioItems = new Map();
  const snapshots = new Map();
  await Promise.all(scenarios.map(async (scenario) => {
    const { db } = getFirebase();
    const [itemsSnap, snapshotsSnap] = await Promise.all([
      getDocs(collection(db, `${planPath(planId)}/scenarios/${scenario.id}/items`)),
      getDocs(collection(db, `${planPath(planId)}/scenarios/${scenario.id}/snapshots`)),
    ]);
    scenarioItems.set(scenario.id, itemsSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
    snapshots.set(scenario.id, snapshotsSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
  }));
  const { getAnnualBudgetWithMonths } = await import('./annual-budget.service.js');
  const annualBudget = await getAnnualBudgetWithMonths(planId, planId);
  return { plan, settings, serviceLines, services, fixedCosts, scenarios, scenarioItems, snapshots, annualBudget };
}

export async function ensureOrganizationAndPlan(user, planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  await setDoc(doc(db, `organizations/${ORG_ID}`), { name: 'Musicala', slug: ORG_ID, active: true, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, `${planPath(planId)}`), { name: 'Plan Financiero 2026', year: 2026, status: 'active', currency: 'COP', description: '', updatedAt: serverTimestamp(), updatedBy: user?.uid || null, createdAt: serverTimestamp(), createdBy: user?.uid || null }, { merge: true });
}
