// Entry point: loads data, then renders a view for the current #/route.
import { loadData } from './data.js';
import { html, esc } from './util.js';
import { closeDialogs } from './ui.js';
import * as home from './views/home.js';
import * as units from './views/units.js';
import * as rules from './views/rules.js';
import * as search from './views/search.js';
import * as lists from './views/lists.js';
import * as builder from './views/builder.js';
import * as play from './views/play.js';
import * as points from './views/points.js';

// [pattern, view(page, ...params), nav tab]
const routes = [
  [/^$/, home.view, ''],
  [/^units$/, units.list, 'units'],
  [/^unit\/([\w-]+)$/, units.detail, 'units'],
  [/^rules(?:\/([\w-]+))?$/, rules.index, 'rules'],
  [/^det\/([\w-]+)$/, rules.detachment, 'rules'],
  [/^search(?:\/(.*))?$/, search.view, 'search'],
  [/^lists$/, lists.index, 'lists'],
  [/^list\/([\w-]+)$/, builder.view, 'lists'],
  [/^import\/(.+)$/, lists.importView, 'lists'],
  [/^play(?:\/([\w-]+))?$/, play.view, 'play'],
  [/^points$/, points.view, 'points'],
];

const main = document.getElementById('main');
const searchInput = document.getElementById('search-input');
let cleanup = null;
let lastPath = null;

function currentPath() {
  return location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
}

function render() {
  const path = currentPath();
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  closeDialogs();

  const page = document.createElement('div');
  page.className = 'page';
  let nav = '';
  let matched = false;
  for (const [re, view, tab] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    matched = true;
    nav = tab;
    try {
      const params = m.slice(1).map((p) => {
        if (p === undefined) return undefined;
        try { return decodeURIComponent(p); } catch (e) { return p; }
      });
      cleanup = view(page, ...params) || null;
    } catch (err) {
      console.error(err);
      page.innerHTML = String(html`<div class="empty"><h3>這一頁出錯了</h3><p>${err && err.message ? err.message : String(err)}</p><p><a class="btn" href="#/">回首頁</a></p></div>`);
    }
    break;
  }
  if (!matched) {
    page.innerHTML = String(html`<div class="empty"><h3>找不到這一頁</h3><p><a class="btn" href="#/">回首頁</a></p></div>`);
  }

  main.replaceChildren(page);
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (nav !== 'search' && document.activeElement !== searchInput) searchInput.value = '';

  // keep the scroll position when only the search text changed
  const stay = lastPath !== null && lastPath.startsWith('search') && path.startsWith('search');
  if (!stay) window.scrollTo(0, 0);
  lastPath = path;
}

// ── global search box ──
let searchTimer = 0;
function goSearch(replace) {
  const q = searchInput.value.trim();
  const target = '#/search/' + encodeURIComponent(q);
  if (location.hash === target) return;
  if (replace && currentPath().startsWith('search')) location.replace(target); else location.hash = target;
}
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { if (searchInput.value.trim() || currentPath().startsWith('search')) goSearch(true); }, 220);
});
document.getElementById('search-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  clearTimeout(searchTimer);
  goSearch(true);
  searchInput.blur();
});

// ── start ──
loadData().then(() => {
  window.addEventListener('hashchange', render);
  render();
}).catch((err) => {
  console.error(err);
  main.innerHTML = `<div class="empty"><h3>資料載入失敗</h3><p>${esc(err.message || err)}</p>
    <p class="muted small">若是直接用檔案總管開啟 index.html，瀏覽器會擋下資料讀取；請改用本機伺服器或部署後的網址。</p>
    <p><button class="btn" onclick="location.reload()">重新載入</button></p></div>`;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker 註冊失敗', err));
  });
}
