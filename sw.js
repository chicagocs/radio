const CACHE_NAME = 'radiomax-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/stations.json',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/icon-192.png',
  '/icon-512.png',
  '/site.webmanifest'
];

// Instalación: Guardar los archivos estáticos en el caché
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cacheando archivos estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: Limpiar cachés antiguos
self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Borrando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Interceptar peticiones de red
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Estrategia 1: Cache First para el App Shell (archivos estáticos)
  if (STATIC_ASSETS.includes(requestUrl.pathname) || requestUrl.pathname === '/') {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          return response || fetch(event.request);
        })
    );
    return;
  }

  // Estrategia 2: Network First para llamadas a APIs (con fallback a caché)
  if (requestUrl.hostname.includes('api.somafm.com') || 
      requestUrl.hostname.includes('musicbrainz.org') ||
      requestUrl.hostname.includes('nrk.no') ||
      requestUrl.hostname.includes('tu-worker.tramax.com.ar')) { // <-- ¡IMPORTANTE! Añade tu dominio de Worker aquí
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clonar la respuesta antes de guardarla en caché
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
          return response;
        })
        .catch(() => {
          // Si la red falla, intentar obtener desde caché
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para otros recursos, intentar desde la red primero
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});