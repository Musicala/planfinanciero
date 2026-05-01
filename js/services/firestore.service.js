import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { DEFAULT_PLAN_ID, planPath } from '../config/app.config.js';
import { getFirebase } from './firebase.service.js';

export function planDoc(planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  return doc(db, planPath(planId));
}

export function planCollection(name, planId = DEFAULT_PLAN_ID) {
  const { db } = getFirebase();
  return collection(db, `${planPath(planId)}/${name}`);
}

export function nestedCollection(path) {
  const { db } = getFirebase();
  return collection(db, path);
}

export function nestedDoc(path) {
  const { db } = getFirebase();
  return doc(db, path);
}

export async function getDocument(ref) {
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCollection(ref, orderField = null) {
  const snap = await getDocs(orderField ? query(ref, orderBy(orderField)) : ref);
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function nowMeta(user, creating = false) {
  const meta = { updatedAt: serverTimestamp(), updatedBy: user?.uid || null };
  if (creating) Object.assign(meta, { createdAt: serverTimestamp(), createdBy: user?.uid || null });
  return meta;
}

export async function createIn(ref, payload, user) {
  return addDoc(ref, { ...payload, ...nowMeta(user, true) });
}

export async function setAt(ref, payload, user, creating = false) {
  return setDoc(ref, { ...payload, ...nowMeta(user, creating) }, { merge: true });
}

export async function updateAt(ref, payload, user) {
  return updateDoc(ref, { ...payload, ...nowMeta(user) });
}

export async function removeAt(ref) {
  return deleteDoc(ref);
}

export function batch() {
  const { db } = getFirebase();
  return writeBatch(db);
}
