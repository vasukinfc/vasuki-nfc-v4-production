const DIGITAL_CARD_CACHE = 'vasuki-digital-card-v1';
const DIGITAL_CARD_CACHE_PREFIX = 'vasuki-digital-card-';
const DIGITAL_CARD_SHELL = [
  '/assets/digital-card.css',
  '/assets/digital-card.js',
  '/assets/digital-card-templates.js',
  '/assets/vasuki-favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/card-offline.html',
  'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DIGITAL_CARD_CACHE).then((cache) =>
      Promise.allSettled(
        DIGITAL_CARD_SHELL.map((asset) => cache.add(asset)),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(DIGITAL_CARD_CACHE_PREFIX) &&
              key !== DIGITAL_CARD_CACHE,
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(DIGITAL_CARD_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) {
      const fallbackResponse = await cache.match(fallback);
      if (fallbackResponse) return fallbackResponse;
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DIGITAL_CARD_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());

  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.pathname.startsWith('/card/')) {
    event.respondWith(networkFirst(request, '/card-offline.html'));
    return;
  }

  if (url.pathname.startsWith('/api/public-cards/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.origin === self.location.origin ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
