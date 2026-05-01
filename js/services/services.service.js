import { collection, doc, getDocs, query, where, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { createIn, planCollection, removeAt, updateAt } from './firestore.service.js';
import { writeAuditLog } from './audit.service.js';
import { getFirebase } from './firebase.service.js';

export async function getServices() {
  const { getCollection } = await import('./firestore.service.js');
  return getCollection(planCollection('services'), 'name');
}

export async function createService(payload, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const ref = await createIn(planCollection('services', planId), payload, user);
  await writeAuditLog({ action: 'create', entityType: 'service', entityPath: `${planPath(planId)}/services/${ref.id}`, entityId: ref.id, user, after: payload, planId });
  return ref;
}

export async function updateService(id, payload, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const ref = doc(db, `${planPath(planId)}/services/${id}`);
  await updateAt(ref, payload, user);
  await writeAuditLog({ action: 'update', entityType: 'service', entityPath: `${planPath(planId)}/services/${id}`, entityId: id, user, before, after: payload, planId });
}

export async function deactivateService(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  await updateService(id, { active: false }, { before, user, planId });
}

export async function deleteService(id, { before, user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  const scenariosSnap = await getDocs(collection(db, `${planPath(planId)}/scenarios`));
  for (const scenarioDoc of scenariosSnap.docs) {
    const itemsSnap = await getDocs(query(
      collection(db, `${planPath(planId)}/scenarios/${scenarioDoc.id}/items`),
      where('serviceId', '==', id),
    ));
    itemsSnap.docs.forEach((itemDoc) => batch.delete(itemDoc.ref));
  }
  batch.delete(doc(db, `${planPath(planId)}/services/${id}`));
  await batch.commit();
  await writeAuditLog({ action: 'delete', entityType: 'service', entityPath: `${planPath(planId)}/services/${id}`, entityId: id, user, before, planId });
}

export async function deleteAllServices({ user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  const [servicesSnap, scenariosSnap] = await Promise.all([
    getDocs(collection(db, `${planPath(planId)}/services`)),
    getDocs(collection(db, `${planPath(planId)}/scenarios`)),
  ]);
  servicesSnap.docs.forEach((serviceDoc) => batch.delete(serviceDoc.ref));
  for (const scenarioDoc of scenariosSnap.docs) {
    const itemsSnap = await getDocs(collection(db, `${planPath(planId)}/scenarios/${scenarioDoc.id}/items`));
    itemsSnap.docs.forEach((itemDoc) => batch.delete(itemDoc.ref));
  }
  await batch.commit();
  await writeAuditLog({ action: 'delete_all', entityType: 'services', entityPath: `${planPath(planId)}/services`, entityId: 'all', user, after: { count: servicesSnap.size }, planId });
}
