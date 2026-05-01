import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { getFirebase } from './firebase.service.js';

export async function writeAuditLog({ action, entityType, entityPath, entityId, user, before = null, after = null, planId = DEFAULT_PLAN_ID }) {
  try {
    const { db } = getFirebase();
    await addDoc(collection(db, `${planPath(planId)}/auditLogs`), {
      action,
      entityType,
      entityPath,
      entityId,
      userId: user?.uid || null,
      userEmail: user?.email || null,
      before: sanitize(before),
      after: sanitize(after),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[audit]', error);
  }
}

function sanitize(value) {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item && typeof item.toDate === 'function') return item.toDate().toISOString();
    return item;
  }));
}
