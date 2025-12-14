// v3.2.3 (Mejorado con fallback offline y TTL para API)
const CACHE_NAME = 'radiomax-v3.2.3'; 


const STATIC_ASSETS = [
  '/index.html',
  '/offline.html',
  '/stations.json',
  '/images/apple-touch-icon.png',
  '/images/favicon-32x32.png',
  '/images/favicon-16x16.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/site.webmanifest'
];

const API_CACHE_TTL = 5 * 60 * 1000; 

// Instalación: Guardar los archivos estáticos en el caché
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cacheando archivos estáticos');
        return Promise.all(
          STATIC_ASSETS.map(urlToCache => {
            return cache.add(urlToCache).catch(error => {
              console.error(`Error al cachear ${urlToCache}:`, error);
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
  if (STATIC_ASSETS.includes(requestUrl.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // ESTRATEGIA 2: Network First con TTL para llamadas a APIs
  if (requestUrl.hostname.includes('api.somafm.com') || 
      requestUrl.hostname.includes('musicbrainz.org') ||
      requestUrl.hostname.includes('nrk.no') ||
      requestUrl.hostname.includes('core.chcs.workers.dev')) {
    
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          // <-- NUEVO: Lógica para verificar el TTL
          if (cachedResponse) {
            const responseDate = new Date(cachedResponse.headers.get('sw-cached-time'));
            const now = new Date();
            if (responseDate && (now - responseDate < API_CACHE_TTL)) {
              console.log(`Sirviendo desde caché (válida): ${event.request.url}`);
              return cachedResponse;
            }
          }

          // Si no hay caché o está caducada, vamos a la red
          console.log(`Buscando en red: ${event.request.url}`);
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
                // <-- NUEVO: Añadimos una cabecera con la fecha de caché
                const responseClone = networkResponse.clone();
                const headers = new Headers(responseClone.headers);
                headers.append('sw-cached-time', new Date().toUTCString());
                
                const responseWithTimestamp = new Response(responseClone.body, {
                    status: responseClone.status,
                    statusText: responseClone.statusText,
                    headers: headers
                });

                cache.put(event.request, responseWithTimestamp);
            }
            return networkResponse;
          }).catch(() => {
            // Si la red falla, devolvemos la versión cacheada aunque esté caducada
            console.log(`Red falló, sirviendo caché (caducada si existe): ${event.request.url}`);
            return cachedResponse;
          });
        });
      })
    );
    return;
  }

  // ESTRATEGIA 3: Fallback para otras peticiones
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        if (event.request.destination === 'document') {
            return caches.match('/offline.html');
        }
        // Para otros recursos (imágenes, etc.), simplemente falla
        return Response.error();
      })
  );
});

// Escuchar el mensaje para saltar la espera y activarse inmediatamente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
