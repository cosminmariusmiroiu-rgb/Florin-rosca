/* Aplicația panoului: ecranul se deschide rapid; datele vin mereu proaspete de la server */
const CACHE = 'fr-admin-v7';
const SHELL = ['./', './index.html', './admin.css', './admin.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // never cache data or logins
  // network first, cache as fallback (works with a weak signal)
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && url.origin === location.origin && url.pathname.includes('/admin/')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
