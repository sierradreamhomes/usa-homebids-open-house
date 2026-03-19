/* Service Worker — USA Homebids Open House PWA */
const CACHE_NAME = 'usahomebids-openhouse-v9';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './logo-usa-homebids.png'
];

// Install — cache all assets + Chrome 143+ auto-preload workaround
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );

  // Workaround for Chrome 143+ PWA blank screen on cold start
  // (ServiceWorkerAutoPreloadEnabled regression)
  try {
    if (event.addRoutes) {
      event.addRoutes({
        condition: { urlPattern: new URLPattern({}) },
        source: 'fetch-event'
      });
    }
  } catch (e) {
    // addRoutes not supported — that's fine
  }

  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — ALL navigation requests return index.html (single-page app)
// This prevents blank screens when the Android back button navigates to
// a URL the server doesn't have (e.g. about:blank, empty history entry)
self.addEventListener('fetch', (event) => {
  // Skip non-GET and cross-origin requests (including BoldTrail API calls)
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const isNavigate = event.request.mode === 'navigate';

  if (isNavigate) {
    // For ANY navigation request, serve index.html — network-first with cache fallback
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
        }
        return response;
      }).catch(() => {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
