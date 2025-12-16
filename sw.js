// v3.2.0-fixed
// ==========================================================================
// CONFIGURACIÓN
// ==========================================================================

// Genera un nombre de cache único en cada despliegue para evitar cachés obsoletos.
const CACHE_VERSION = 'v3.2.0';
const CACHE_NAME = `radiomax-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/stations.json',
  '/site.webmanifest',
  '/images/apple-touch-icon.png',
  '/images/favicon-32x32.png',
  '/images/favicon-16x16.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

// TTLs para diferentes tipos de contenido
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutos para APIs de música
const STATIC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas para assets estáticos (si se quiere refrescar)

// ==========================================================================
// EVENTOS PRINCIPALES DEL SERVICE WORKER
// ==========================================================================

// INSTALL: Guarda los archivos estáticos en el cache.
self.addEventListener('install', event => {
  console.log(`[SW] Install event triggered. Caching assets for ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(error => console.error('[SW] Failed to cache assets during install:', error))
  );
});

// ACTIVATE: Limpia caches antiguos.
self.addEventListener('activate', event => {
  console.log(`[SW] Activate event triggered. Claiming clients and cleaning old caches.`);
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME && key.startsWith('radiomax-')).map(key => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// FETCH: Intercepta todas las peticiones de red.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Estrategia para navegación de páginas (HTML): Network First, fallback a offline.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // 2. Estrategia para el "App Shell" (activos estáticos): Stale While Revalidate.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(handleStaleWhileRevalidate(request));
    return;
  }

  // 3. Estrategia para APIs: Network First con TTL (lógica simple y directa)
  if (
    url.hostname.includes('api.somafm.com') ||
    url.hostname.includes('musicbrainz.org') ||
    url.hostname.includes('nrk.no') ||
    url.hostname.includes('core.chcs.workers.dev')
  ) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // 4. Por defecto, intenta obtener desde la red.
  event.respondWith(fetch(request));
});


// ==========================================================================
// FUNCIONES AUXILIARES (MANEJADORES DE ESTRATEGIA)
// ==========================================================================

async function handleNavigationRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.warn('[SW] Navigation failed. Serving offline page.', error);
    return await caches.match('/offline.html');
  }
}

async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      console.log(`[SW] Stale-While-Revalidate: Updated ${request.url} from network.`);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  });

  return cachedResponse || fetchPromise;
}

async function handleApiRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      console.log(`[SW] Network First: Updated ${request.url} from network.`);
      const responseToCache = networkResponse.clone();
      responseToCache.headers.set('sw-cached-time', new Date().toISOString());
      cache.put(request, responseToCache);
    }
    return networkResponse;
  } catch (error) {
    console.warn(`[SW] Network request failed for ${request.url}. Serving from cache if available.`, error);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback robusto si no hay nada en cache
    return new Response(JSON.stringify({ error: 'Service Unavailable Offline' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ==========================================================================
// COMUNICACIÓN CON EL CLIENTE
// ==========================================================================

// Permite que la aplicación fuerce la actualización del SW.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING message received. Skipping waiting phase.');
    self.skipWaiting();
  }
});
