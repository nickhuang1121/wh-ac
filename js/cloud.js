// This module (including the CDN SDKs) is loaded only on the cloud rosters page.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  getFirestore, collection, doc, query, orderBy, getDocs, getDoc, runTransaction,
  serverTimestamp, connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore-lite.js';
import { firebaseConfig } from './firebase-config.js';

const emulate = ['127.0.0.1', 'localhost'].includes(location.hostname)
  && new URLSearchParams(location.search).has('emulators');
const app = initializeApp(emulate
  ? { projectId: 'demo-wh-ac', apiKey: 'demo-wh-ac', authDomain: 'demo-wh-ac.firebaseapp.com' }
  : firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if (emulate) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
auth.languageCode = 'zh-TW';

export const watchUser = (fn) => onAuthStateChanged(auth, fn);
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

const rosters = (uid) => collection(db, 'users', uid, 'rosters');
export async function listBackups(uid) {
  const snap = await getDocs(query(rosters(uid), orderBy('updatedAt', 'desc')));
  return snap.docs.map((row) => ({ ...row.data(), id: row.id }));
}

export async function loadBackup(uid, id) {
  const snap = await getDoc(doc(rosters(uid), id));
  if (!snap.exists()) throw new Error('這份雲端軍表已刪除，請重新整理清單。');
  const { version, roster } = snap.data();
  if (version !== 1 || roster?.id !== id || typeof roster.name !== 'string'
    || !Array.isArray(roster.entries) || !Array.isArray(roster.dets)) {
    throw new Error('無法讀取這份軍表的存檔格式。');
  }
  return roster;
}

// Compare the version shown to the player inside the transaction, including on retries.
export async function changeBackup(uid, id, previous, list) {
  const ref = doc(rosters(uid), id);
  await runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    if (current.exists() !== Boolean(previous)
      || (previous && !previous.updatedAt.isEqual(current.data().updatedAt))) {
      throw new Error('另一台裝置已更新雲端軍表。請重新整理清單，確認後再試。');
    }
    if (list) {
      const { updated, ...roster } = list;
      tx.set(ref, { version: 1, roster, updatedAt: serverTimestamp() });
    } else {
      tx.delete(ref);
    }
  });
}
