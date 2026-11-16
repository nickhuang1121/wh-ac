// The queue outlives the editor. Each opted-in roster stays bound to one account on this device.
import { getList, getLists, getBackupInfo, setBackupInfo, clearBackupInfo } from './store.js';

const events = new EventTarget();
const timers = new Map();
const active = new Map();
const messages = new Map();
let api, connecting;
const notify = () => events.dispatchEvent(new Event('change'));

export function cloudErrorText(err) {
  switch (err.code) {
    case 'auth/popup-blocked': return '瀏覽器擋下了登入視窗。請允許彈出式視窗，再按一次 Google 登入。';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return '已取消登入。';
    case 'auth/admin-restricted-operation':
    case 'auth/user-disabled':
    case 'auth/user-not-found': return '目前未開放註冊，請選擇已授權的 Google 帳號登入。';
    case 'auth/unauthorized-domain': return '此網站尚未加入 Firebase 的登入授權網域。';
    case 'permission-denied': return '沒有存取權限，請確認登入帳號後再試。';
    case 'auth/network-request-failed':
    case 'unavailable': return '無法連上雲端，請確認網路連線後再試。';
    default: return err.message || '操作失敗，請再試一次。';
  }
}

export function watchBackups(fn) {
  events.addEventListener('change', fn);
  return () => events.removeEventListener('change', fn);
}

function cancelTimer(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

function ownInfo(id, uid) {
  const info = getBackupInfo(id);
  return info?.uid === uid ? info : null;
}

export function recordBackup(list, uid, revision) {
  if (!getList(list.id)) return;
  const auto = ownInfo(list.id, uid)?.auto || false;
  if (!setBackupInfo(list.id, { uid, auto, revision, synced: list.updated })) {
    throw new Error('雲端已儲存，但本機無法記錄備份狀態。');
  }
  messages.delete(list.id);
  notify();
}

export function forgetBackup(id, uid) {
  if (!ownInfo(id, uid)) return;
  cancelTimer(id);
  clearBackupInfo(id);
  messages.delete(id);
  notify();
}

function schedule(id, delay = 1100) {
  cancelTimer(id);
  const info = getBackupInfo(id);
  if (!info?.auto || info.conflict || active.has(id) || !navigator.onLine) return;
  const list = getList(id);
  if (!list?.entries.length || list.updated <= (info.synced || 0) || api?.currentUser()?.uid !== info.uid) return;
  timers.set(id, setTimeout(() => { timers.delete(id); upload(id, 'auto'); }, delay));
}

function resume() {
  for (const list of getLists()) schedule(list.id);
}

export function connectBackups() {
  if (!navigator.onLine) return Promise.reject(new Error('目前離線，請連線後上傳。'));
  if (!connecting) {
    connecting = import('./cloud.js').then((cloud) => new Promise((resolve) => {
      cloud.watchUser(() => {
        api = cloud;
        messages.clear();
        resume();
        notify();
        resolve(cloud);
      });
    })).catch(() => {
      connecting = null;
      throw new Error('無法連上 Firebase，請確認網路後再試。');
    });
  }
  return connecting;
}

export function backupStatus(list) {
  const info = getBackupInfo(list.id);
  const user = api?.currentUser();
  const mine = info && info.uid === user?.uid;
  const enabled = Boolean(info?.auto && (mine || !api));
  let status = active.get(list.id) || messages.get(list.id) || '';
  if (!status && mine && info.conflict) status = '雲端版本已變更。請按「立即上傳」確認，或前往雲端軍表載入。';
  if (!status && mine && info.synced === list.updated) status = '已備份到雲端';
  if (!status && enabled && !list.entries.length) status = '加入第一個單位後自動備份';
  if (!status && enabled) status = navigator.onLine ? '等待備份' : '已存本機，連線後備份';
  if (!status && mine) status = '本機變更尚未上傳';
  return { enabled, busy: active.has(list.id), status, user };
}

export async function upload(id, mode = 'manual', editedList) {
  if (active.has(id)) return;
  active.set(id, '準備上傳…');
  cancelTimer(id);
  messages.delete(id);
  notify();
  let sent = null;
  let retry = false;
  try {
    const cloud = api || await connectBackups();
    let user = cloud.currentUser();
    if (!user && !navigator.onLine) throw new Error('目前離線，請連線後登入。');
    if (!user && mode !== 'auto') user = (await cloud.login()).user;
    if (!user || cloud.currentUser()?.uid !== user.uid) return;
    const info = ownInfo(id, user.uid);
    if (mode === 'auto' && (!info?.auto || info.conflict)) return;
    sent = editedList ? structuredClone(editedList) : getList(id);
    if (!sent) return;

    if (mode === 'enable' && !setBackupInfo(id, { ...info, uid: user.uid, auto: true })) {
      throw new Error('本機無法儲存自動備份設定。');
    }
    if (mode !== 'manual' && (!navigator.onLine || !sent.entries.length || sent.updated === info?.synced)) return;
    if (!navigator.onLine) throw new Error('目前離線，軍表已存於本機。');

    active.set(id, '正在上傳…');
    notify();
    let revision;
    try {
      revision = await cloud.changeBackup(user.uid, id, info?.revision || null, sent);
    } catch (err) {
      if (err.code !== 'roster/conflict') throw err;
      if (cloud.currentUser()?.uid !== user.uid) return;
      if (ownInfo(id, user.uid)?.auto) {
        setBackupInfo(id, { ...ownInfo(id, user.uid), conflict: true });
      }
      if (mode === 'auto') return;
      const question = err.current
        ? `以本機的「${sent.name}」覆寫雲端存檔「${err.current.roster.name}」？`
        : `雲端存檔已刪除，要重新上傳「${sent.name}」嗎？`;
      if (!confirm(question)) return;
      revision = await cloud.changeBackup(user.uid, id, cloud.revisionOf(err.current), sent);
    }
    if (cloud.currentUser()?.uid === user.uid) recordBackup(sent, user.uid, revision);
  } catch (err) {
    messages.set(id, cloudErrorText(err));
    retry = err.code === 'unavailable';
    return;
  } finally {
    active.delete(id);
    // Edits made while the request was in flight still need their own backup.
    if (sent && getList(id)?.updated > sent.updated) schedule(id);
    else if (retry) schedule(id, 15000);
    notify();
  }
}

export function disableBackup(id) {
  const info = getBackupInfo(id);
  if (info && !setBackupInfo(id, { ...info, auto: false })) {
    messages.set(id, '本機無法儲存自動備份設定。');
    notify();
    return;
  }
  cancelTimer(id);
  messages.delete(id);
  notify();
}

window.addEventListener('roster-saved', ({ detail: id }) => {
  // A local roster can be shared in this browser. Edits under a different login
  // must not be queued for the account that previously enabled backups.
  const info = getBackupInfo(id);
  if (api && info?.auto && info.uid !== api.currentUser()?.uid) {
    disableBackup(id);
    return;
  }
  if (!active.has(id)) messages.delete(id);
  schedule(id);
  notify();
});
function reconnect() {
  if (api) resume();
  else if (navigator.onLine && getLists().some((l) => getBackupInfo(l.id)?.auto)) {
    connectBackups().catch(() => {});
  }
  notify();
}
window.addEventListener('online', reconnect);
window.addEventListener('offline', notify);
reconnect();
