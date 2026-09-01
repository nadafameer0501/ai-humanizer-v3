const CACHE_NAME = 'ai-humanizer-v2';
const STATIC_ASSETS = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/static/og-image.png'
];

const API_CACHE_NAME = 'ai-humanizer-api-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname === '/api/humanize' && request.method === 'POST') {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (url.pathname === '/' || url.pathname.startsWith('/static/')) {
    event.respondWith(handleStaticRequest(request));
    return;
  }
});

async function handleStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) {
    const networkFetch = fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    }).catch(() => cached);
    return networkFetch;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const fallback = await caches.match('/');
    return fallback || new Response('Offline', { status: 503 });
  }
}

async function handleApiRequest(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      const body = await cached.json();
      body.cached = true;
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', 'X-Cached': 'true' }
      });
    }
    return new Response(JSON.stringify({
      ok: false,
      error: 'You are offline. Please connect to the internet and try again.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});