// sw.js
// v3.0
const CACHE_NAME = 'radiomax-v3.0'; 
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
        // Usamos Promise.all para esperar a que todos los intentos de caché terminen
        return Promise.all(
          STATIC_ASSETS.map(urlToCache => {
            // Intentamos añadir cada URL al caché
            return cache.add(urlToCache).catch(error => {
              // Si falla, lo registramos en la consola pero no detenemos todo el proceso
              console.error(`Error al cachear ${urlToCache}:`, error);
              // Devolvemos una promesa resuelta para que Promise.all no falle
              return Promise.resolve();
            });
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Instalación completada.');
        return self.skipWaiting();
      })
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
    }).then(() => {
        console.log('Service Worker: Activación completada.');
        return self.clients.claim();
    })
  );
});

// Interceptar peticiones de red
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // ESTRATEGIA 1: Stale-While-Revalidate para el App Shell (archivos estáticos)
  // Servimos desde caché al instante, PERO actualizamos la caché en segundo plano.
  if (STATIC_ASSETS.includes(requestUrl.pathname) || requestUrl.pathname === '/') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        // Buscar en caché y hacer la petición a la red al mismo tiempo
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            // Si la respuesta de red es válida, actualizamos la caché
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
          // Servir la versión cacheada inmediatamente para velocidad
          return cachedResponse || fetchPromise;
        });
      })
    );
    return; // Importante: salir para no ejecutar la lógica de abajo
  }

  // ESTRATEGIA 2: Network First para llamadas a APIs (con fallback a caché)
  // Esta parte está bien, no hay que cambiarla.
  if (requestUrl.hostname.includes('api.somafm.com') || 
      requestUrl.hostname.includes('musicbrainz.org') ||
      requestUrl.hostname.includes('nrk.no') ||
      requestUrl.hostname.includes('core.chcs.workers.dev')) { // Usar tu dominio de Worker aquí
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

// Escuchar el mensaje para saltar la espera y activarse inmediatamente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

