// Road Safety East — update this version when releasing a new app shell.
const VERSION = '2026-09-23-v13-national';
const SCOPE = self.registration.scope;
const PREFIX = 'road-safety-east:' + encodeURIComponent(SCOPE) + ':';
const CACHE_NAME = PREFIX + VERSION;
const HOME = new URL('index.html', SCOPE).href;
const ASSETS = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png']
  .map(path => new URL(path, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map(url => new Request(url, {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    // Remove known legacy caches only if ALL entries belong to this app scope.
    for (const name of names.filter(name => /^road-safety-east-v\d+$/.test(name))) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      if (requests.length && requests.every(request => request.url.startsWith(SCOPE))) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // Let the browser handle APIs, POST, map tiles and other sites normally.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  const isHome = url.pathname === new URL(SCOPE).pathname ||
    url.pathname === new URL(HOME).pathname;
  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  if (isDocument && isHome) {
    const network = fetch(new Request(request, {cache: 'no-cache'}));
    event.waitUntil(network.then(async response => {
      if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(HOME, response.clone());
      }
    }).catch(() => {}));
    event.respondWith((async () => {
      try {
        const response = await network;
        if (response.status < 500) return response;
        const cached = await (await caches.open(CACHE_NAME)).match(HOME);
        return cached || response;
      } catch (_) {
        const cached = await (await caches.open(CACHE_NAME)).match(HOME);
        return cached || new Response('Offline: please connect and reload.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
        });
      }
    })());
    return;
  }

  // Only known local shell assets are served from this cache.
  if (!isDocument && ASSETS.includes(url.href) && url.href !== HOME) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      return cached || fetch(request);
    })());
  }
});

