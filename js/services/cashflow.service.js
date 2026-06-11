import { doc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { createIn, getCollection, planCollection, removeAt, updateAt, setAt } from './firestore.service.js';
import { getFirebase } from './firebase.service.js';
import { writeAuditLog } from './audit.service.js';

export async function getCashFlowItems(planId = DEFAULT_PLAN_ID) {
  return getCollection(planCollection('cashFlowItems', planId), 'name');
}

export async function createCashFlowItem(payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await createIn(planCollection('cashFlowItems', planId), payload, user);
  await writeAuditLog({ action: 'create', entityType: 'cashFlowItem', entityPath: `${planPath(planId)}/cashFlowItems/${ref.id}`, entityId: ref.id, user, after: payload, planId });
}

export async function updateCashFlowItem(id, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await updateAt(doc(db, `${planPath(planId)}/cashFlowItems/${id}`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'cashFlowItem', entityPath: `${planPath(planId)}/cashFlowItems/${id}`, entityId: id, user, before, after: payload, planId });
}

export async function deleteCashFlowItem(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await removeAt(doc(db, `${planPath(planId)}/cashFlowItems/${id}`));
  await writeAuditLog({ action: 'delete', entityType: 'cashFlowItem', entityPath: `${planPath(planId)}/cashFlowItems/${id}`, entityId: id, user, before, planId });
}

// El saldo inicial se guarda como documento fijo 'initial' dentro de la misma coleccion.
export async function setInitialBalance(amount, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const payload = { kind: 'initial', name: 'Saldo inicial', amount, active: true };
  await setAt(doc(db, `${planPath(planId)}/cashFlowItems/initial`), payload, user);
  await writeAuditLog({ action: 'update', entityType: 'cashFlowItem', entityPath: `${planPath(planId)}/cashFlowItems/initial`, entityId: 'initial', user, after: payload, planId });
}
