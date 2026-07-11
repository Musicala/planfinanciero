import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { getFirebase } from './firebase.service.js';
import { setAt } from './firestore.service.js';

const FAIR_PAY_DOCUMENT_ID = 'main';

export async function getFairPayState(planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, `${planPath(planId)}/fairPay/${FAIR_PAY_DOCUMENT_ID}`));
  return snap.exists() ? snap.data().state || null : null;
}

export async function saveFairPayState(state, { user, planId = DEFAULT_PLAN_ID } = {}) {
  const { db } = getFirebase();
  await setAt(doc(db, `${planPath(planId)}/fairPay/${FAIR_PAY_DOCUMENT_ID}`), { state }, user, true);
}
