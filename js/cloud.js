// Firebase is loaded on demand so local editing can also work offline.
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

export const currentUser = () => auth.currentUser;
export const watchUser = (fn) => onAuthStateChanged(auth, fn);
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

const rosters = (uid) => collection(db, 'users', uid, 'rosters');
export async function listBackups(uid) {
  const snap = await getDocs(query(rosters(uid), orderBy('updatedAt', 'desc')));
  return snap.docs.map((row) => ({ ...row.data(), id: row.id }));
}

export async function loadBackup(uid, id, { withRevision = false } = {}) {
  const snap = await getDoc(doc(rosters(uid), id));
  if (!snap.exists()) throw new Error('這份雲端軍表已刪除，請重新整理清單。');
  const { version, roster } = snap.data();
  if (version !== 1 || roster?.id !== id || typeof roster.name !== 'string'
    || !Array.isArray(roster.entries) || !Array.isArray(roster.dets)) {
    throw new Error('無法讀取這份軍表的存檔格式。');
  }
  return withRevision ? snap.data() : roster;
}

// Existing backups predate revision IDs. Their precise server timestamp is a stable revision.
export function revisionOf(backup) {
  if (!backup) return null;
  return backup.revision || `${backup.updatedAt.seconds}:${backup.updatedAt.nanoseconds}`;
}

export async function changeBackup(uid, id, previous, list) {
  // A previously opened cloud-list page passes its snapshot; the editor stores just its revision.
  const expected = typeof previous === 'string' ? previous : revisionOf(previous);
  const ref = doc(rosters(uid), id);
  const revision = list ? crypto.randomUUID() : null;
  await runTransaction(db, async (tx) => {
    const current = (await tx.get(ref)).data();
    if (revisionOf(current) !== expected) {
      const err = new Error('另一台裝置已更新雲端軍表。請重新整理清單，確認後再試。');
      err.code = 'roster/conflict';
      err.current = current;
      throw err;
    }
    if (list) {
      const { updated, ...roster } = list;
      tx.set(ref, { version: 1, roster, revision, updatedAt: serverTimestamp() });
    } else {
      tx.delete(ref);
    }
  });
  return revision;
}
