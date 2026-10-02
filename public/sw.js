// Offline shell for Chloe's EA. Bump VERSION when icons or this file change.
const VERSION = 'ea-v2';
const SHELL = ['./', './manifest.webmanifest', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const networkFirst = async (req, key) => {
  const cache = await caches.open(VERSION);
  try { const res = await fetch(req); if (res.ok) cache.put(key || req, res.clone()); return res; }
  catch { const hit = await cache.match(key || req); if (hit) return hit; throw new Error('offline'); }
};
const cacheFirst = async req => {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req); if (hit) return hit;
  const res = await fetch(req); if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res;
};

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never serve saved state from cache: the app falls back to this device's own copy instead.
  if (url.pathname.endsWith('/api/state')) return;
  if (url.pathname.endsWith('/api/calendar')) return e.respondWith(networkFirst(req, new URL('./api/calendar', self.registration.scope).href));
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, new URL('./', self.registration.scope).href));
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.pathname.includes('/icons/')) return e.respondWith(cacheFirst(req));
});
