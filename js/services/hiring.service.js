import { doc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { createIn, getCollection, planCollection, removeAt, updateAt } from './firestore.service.js';
import { getFirebase } from './firebase.service.js';
import { writeAuditLog } from './audit.service.js';

export async function getHiringRoles(planId = DEFAULT_PLAN_ID) {
  return getCollection(planCollection('hiringRoles', planId), 'name');
}

export async function createHiringRole(payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await createIn(planCollection('hiringRoles', planId), payload, user);
  await writeAuditLog({ action: 'create', entityType: 'hiringRole', entityPath: `${planPath(planId)}/hiringRoles/${ref.id}`, entityId: ref.id, user, after: payload, planId });
}

export async function updateHiringRole(id, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await updateAt(doc(db, `${planPath(planId)}/hiringRoles/${id}`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'hiringRole', entityPath: `${planPath(planId)}/hiringRoles/${id}`, entityId: id, user, before, after: payload, planId });
}

export async function deleteHiringRole(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await removeAt(doc(db, `${planPath(planId)}/hiringRoles/${id}`));
  await writeAuditLog({ action: 'delete', entityType: 'hiringRole', entityPath: `${planPath(planId)}/hiringRoles/${id}`, entityId: id, user, before, planId });
}
