const CACHE_PREFIX = 'btnt-billbook-';
const CACHE = 'btnt-billbook-v2';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Always fetch the latest document from the server. Do not fall back to an
  // old cached HTML shell when a navigation request fails.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
    return;
  }

  // Service-worker script updates must not be served from the runtime cache.
  if (url.pathname === '/sw.js') {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
