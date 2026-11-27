// Tandem service worker: caches the app shell only (same-origin HTML, JS, CSS, fonts).
// Never caches Firebase, Google APIs, model traffic or AI output.
const CACHE = 'tandem-shell-v2';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/studio/', '/notes/', '/favicon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match(url.pathname.startsWith('/notes') ? '/notes/' : url.pathname.startsWith('/studio') ? '/studio/' : '/'))));
    return;
  }
  if (/\.(js|css|woff2?|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
  }
});
