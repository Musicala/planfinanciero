import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getFirebase } from './firebase.service.js';

export function observeAuth({ onSignedIn, onSignedOut }) {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return onSignedOut();
    await ensureUserProfile(user);
    return onSignedIn(user);
  });
}

export async function signInWithGoogle() {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signOutUser() {
  const { auth } = getFirebase();
  return signOut(auth);
}

async function ensureUserProfile(user) {
  const { db } = getFirebase();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const base = {
    email: user.email || '',
    name: user.displayName || '',
    photoURL: user.photoURL || '',
    active: true,
    defaultOrgId: 'musicala',
    updatedAt: serverTimestamp(),
  };
  if (snap.exists()) await setDoc(ref, base, { merge: true });
  else await setDoc(ref, { ...base, role: 'viewer', createdAt: serverTimestamp() }, { merge: true });
}
