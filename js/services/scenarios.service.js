import { addDoc, collection, doc, getDocs, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { getFirebase } from './firebase.service.js';
import { createIn, planCollection, removeAt, updateAt } from './firestore.service.js';
import { writeAuditLog } from './audit.service.js';

export async function getScenarios() {
  const { getCollection } = await import('./firestore.service.js');
  return getCollection(planCollection('scenarios'), 'name');
}

export async function createScenario(payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await createIn(planCollection('scenarios', planId), payload, user);
  await writeAuditLog({ action: 'create', entityType: 'scenario', entityPath: `${planPath(planId)}/scenarios/${ref.id}`, entityId: ref.id, user, after: payload, planId });
}

export async function updateScenario(id, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await updateAt(doc(db, `${planPath(planId)}/scenarios/${id}`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'scenario', entityPath: `${planPath(planId)}/scenarios/${id}`, entityId: id, user, before, after: payload, planId });
}

export async function duplicateScenario(id, { name, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const sourceItems = await getDocs(collection(db, `${planPath(planId)}/scenarios/${id}/items`));
  const sourceScenario = (await import('./firestore.service.js')).nestedDoc(`${planPath(planId)}/scenarios/${id}`);
  const sourceSnap = await (await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')).getDoc(sourceScenario);
  const batch = writeBatch(db);
  const target = doc(collection(db, `${planPath(planId)}/scenarios`));
  batch.set(target, { ...sourceSnap.data(), name, status: 'draft', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user?.uid || null, updatedBy: user?.uid || null });
  sourceItems.docs.forEach((item) => batch.set(doc(collection(db, `${planPath(planId)}/scenarios/${target.id}/items`)), { ...item.data(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user?.uid || null, updatedBy: user?.uid || null }));
  await batch.commit();
  await writeAuditLog({ action: 'duplicate', entityType: 'scenario', entityPath: `${planPath(planId)}/scenarios/${target.id}`, entityId: target.id, user, after: { from: id, name }, planId });
}

export async function archiveScenario(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  await updateScenario(id, { status: 'archived', active: false }, { before, user, planId });
}

export async function getScenarioItems(scenarioId, planId = DEFAULT_PLAN_ID) {
  const { getCollection } = await import('./firestore.service.js');
  return getCollection(collection(getFirebase().db, `${planPath(planId)}/scenarios/${scenarioId}/items`));
}

export async function createScenarioItem(scenarioId, payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await addDoc(collection(getFirebase().db, `${planPath(planId)}/scenarios/${scenarioId}/items`), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user?.uid || null, updatedBy: user?.uid || null });
  await writeAuditLog({ action: 'create', entityType: 'scenarioItem', entityPath: `${planPath(planId)}/scenarios/${scenarioId}/items/${ref.id}`, entityId: ref.id, user, after: payload, planId });
}

export async function updateScenarioItem(scenarioId, itemId, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  await updateAt(doc(getFirebase().db, `${planPath(planId)}/scenarios/${scenarioId}/items/${itemId}`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'scenarioItem', entityPath: `${planPath(planId)}/scenarios/${scenarioId}/items/${itemId}`, entityId: itemId, user, before, after: payload, planId });
}

export async function deleteScenarioItem(scenarioId, itemId, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  await removeAt(doc(getFirebase().db, `${planPath(planId)}/scenarios/${scenarioId}/items/${itemId}`));
  await writeAuditLog({ action: 'delete', entityType: 'scenarioItem', entityPath: `${planPath(planId)}/scenarios/${scenarioId}/items/${itemId}`, entityId: itemId, user, before, planId });
}

export async function createScenarioSnapshot(scenarioId, calculated, { user, payload, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await addDoc(collection(getFirebase().db, `${planPath(planId)}/scenarios/${scenarioId}/snapshots`), {
    name: `Snapshot ${new Date().toLocaleString('es-CO')}`,
    scenarioId,
    calculatedAt: serverTimestamp(),
    calculatedBy: user?.uid || null,
    ...calculated,
    payload,
  });
  await writeAuditLog({ action: 'snapshot', entityType: 'snapshot', entityPath: `${planPath(planId)}/scenarios/${scenarioId}/snapshots/${ref.id}`, entityId: ref.id, user, after: calculated, planId });
}
