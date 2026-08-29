const CACHE_NAME = 'zaynab-studio-v4.2.1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/references/references.json',
  './assets/references/portrait-main.jpg',
  './assets/references/portrait-alt.jpg',
  './assets/references/supermarket.jpg',
  './assets/references/comic-poses.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  if (isHTML) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    }))
  );
});
