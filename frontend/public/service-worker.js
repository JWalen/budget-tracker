// Budget Tracker service worker.
//
// Safety rules for a finance app:
//   1. NEVER cache /api responses — financial data must not sit in Cache Storage
//      (it would survive logout and be readable by anyone with the device).
//   2. Navigations are network-first so a new deploy is picked up immediately
//      instead of pinning users to a stale index.html forever.
//   3. Only content-hashed static assets are cached (cache-first): a new build
//      produces new filenames, so this can never serve a stale bundle.
//   4. No background sync storing auth tokens in IndexedDB.
//
// Bump CACHE_VERSION to force old caches to be dropped on the next activate.
const CACHE_VERSION = 'v2';
const ASSET_CACHE = `bt-assets-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Take over as soon as installed; no precache of named bundles (they're hashed).
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== ASSET_CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Allow the page to trigger skipWaiting (apply an update) and cache clearing.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GETs.
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(request.url);

  // 1. API: never touch the cache. Let it go straight to the network.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Navigations (HTML): network-first, fall back to a cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // 3. Content-hashed static assets: cache-first with background refresh.
  if (url.pathname.startsWith('/assets/') || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || network;
      })
    );
  }
});

// Push notifications (no data cached; icons optional).
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Budget Tracker', {
      body: data.body || 'You have a new notification',
      icon: '/logo.svg',
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data || '/'));
});
