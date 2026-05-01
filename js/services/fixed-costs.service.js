import { doc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { createIn, planCollection, removeAt, updateAt } from './firestore.service.js';
import { getFirebase } from './firebase.service.js';
import { writeAuditLog } from './audit.service.js';

export async function getFixedCosts() {
  const { getCollection } = await import('./firestore.service.js');
  return getCollection(planCollection('fixedCosts'), 'category');
}

export async function createFixedCost(payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await createIn(planCollection('fixedCosts', planId), payload, user);
  await writeAuditLog({ action: 'create', entityType: 'fixedCost', entityPath: `${planPath(planId)}/fixedCosts/${ref.id}`, entityId: ref.id, user, after: payload, planId });
}

export async function updateFixedCost(id, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await updateAt(doc(db, `${planPath(planId)}/fixedCosts/${id}`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'fixedCost', entityPath: `${planPath(planId)}/fixedCosts/${id}`, entityId: id, user, before, after: payload, planId });
}

export async function deactivateFixedCost(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  await updateFixedCost(id, { active: false }, { before, user, planId });
}

export async function deleteFixedCost(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await removeAt(doc(db, `${planPath(planId)}/fixedCosts/${id}`));
  await writeAuditLog({ action: 'delete', entityType: 'fixedCost', entityPath: `${planPath(planId)}/fixedCosts/${id}`, entityId: id, user, before, planId });
}
