// Offline support.
// Pages, scripts and data: network first (so new points show up as soon as you are online),
// falling back to the last copy seen. Images: cache first.
const CACHE = 'whac-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'css/vendor/fontawesome/css/fontawesome.min.css',
  'css/vendor/fontawesome/css/solid.min.css',
  'css/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'js/app.js', 'js/calc.js', 'js/data.js', 'js/listops.js', 'js/store.js', 'js/ui.js', 'js/util.js',
  'js/views/cloud.js',
  'js/views/builder.js', 'js/views/home.js', 'js/views/lists.js', 'js/views/parts.js', 'js/views/play.js',
  'js/views/points.js', 'js/views/rules.js', 'js/views/search.js', 'js/views/units.js',
  'data/rules.json', 'data/detachments.json', 'data/units.json', 'data/points.json',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
    // model photos are nice to have offline, but must not block installation
    try {
      const units = await (await fetch('data/units.json', { cache: 'no-cache' })).json();
      await Promise.all(units.filter((u) => u.image).map((u) => cache.add(u.image).catch(() => {})));
    } catch (e) { /* offline during install: photos get cached as they are viewed */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request), timeout(4000)]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isImage = /\/(img|icons)\//.test(url.pathname);
  event.respondWith(isImage ? cacheFirst(req) : networkFirst(req));
});
