/* =========================================================
 * sw.js — Service Worker (Cache Strategy)
 * =======================================================*/

const CACHE_NAME = 'tsh-inventory-V21f'; // Versi dinaikkan

const ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './styles.css',
  './login.js',
  './config.js',
  './app.js',
  './qrlib.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Library External
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/minified/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// 1. Install & Cache Assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. Activate & Bersihkan Cache Lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => {
        if (k !== CACHE_NAME) return caches.delete(k);
      })
    )).then(() => self.clients.claim())
  );
});

// 3. Fetch Strategy (Network First untuk HTML, Cache First untuk Assets)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A. Abaikan API Google Apps Script
  if (url.hostname.includes('script.google.com')) return;

  // B. HTML (Dashboard/Index) -> Network First
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
             return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // C. Aset Statis -> Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
         if (res.ok && !res.redirected && url.protocol.startsWith('http')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
         }
         return res;
      });
    })
  );
});
