// v3.2.1 - Mejorado con manejo de caché granular para APIs y gestión de errores de cuota.
const CACHE_VERSION = 'v3.2.1';
const CACHE_NAME = `radiomax-${CACHE_VERSION}`;

// MEJORA: Asegúrate de que cualquier recurso (CSS, imágenes) que utilice 'offline.html'
// también esté incluido en esta lista para una experiencia offline completa.
const STATIC_ASSETS = [
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

const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ==========================================================================
// EVENTOS PRINCIPALES DEL SERVICE WORKER
// ==========================================================================

// INSTALL
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 0. EXCLUSIÓN: Ignorar solicitudes de Analytics (GoatCounter)
  if (url.hostname.includes('stats.max.com') || url.hostname.includes('stats.tramax.com.ar')) {
    return;
  }

  // 1. Navegación HTML (CRÍTICO PARA PWA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // 2. App Shell – Stale While Revalidate
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  // 3. APIs – Estrategia granular
  if (url.hostname.includes('api.somafm.com') || url.hostname.includes('musicbrainz.org') || url.hostname.includes('nrk.no')) {
    // Para APIs externas de solo lectura, usamos Network First con TTL.
    event.respondWith(networkFirstWithTTL(event));
    return;
  }

  if (url.hostname.includes('core.chcs.workers.dev')) {
    // Para nuestra API, diferenciamos entre lecturas y escrituras.
    event.respondWith(handleCoreApiRequest(event));
    return;
  }

  // 4. Default
  event.respondWith(fetch(event.request));
});

// SKIP WAITING
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


// ==========================================================================
// FUNCIONES AUXILIARES DE ESTRATEGIA DE CACHÉ
// ==========================================================================

/**
 * Estrategia Stale-While-Revalidate para el App Shell.
 * Sirve desde la caché de inmediato y luego actualiza en segundo plano.
 */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);

  const fetchPromise = fetch(event.request).then(response => {
    if (response.ok) {
      cache.put(event.request, response.clone());
    }
    return response;
  });

  return cached || fetchPromise;
}

/**
 * Estrategia Network-First con TTL para APIs externas.
 * Intenta la red primero, y si falla, sirve una versión cacheada si no ha expirado.
 */
async function networkFirstWithTTL(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);

  if (cached) {
    const cachedTime = cached.headers.get('sw-cached-time');
    if (cachedTime) {
      const age = Date.now() - new Date(cachedTime).getTime();
      if (age < API_CACHE_TTL) {
        return cached; // La caché es válida, la servimos.
      }
    }
  }

  // La caché no existe o ha expirado, vamos a la red.
  try {
    const response = await fetch(event.request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('sw-cached-time', new Date().toISOString());

      const responseToCache = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });

      // MEJORA: Manejo de errores de cuota de almacenamiento.
      try {
        await cache.put(event.request, responseToCache);
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          console.warn('Cache quota exceeded. Could not cache:', event.request.url);
          // Opcional: aquí se podría implementar una lógica para limpiar cachés más antiguas.
        }
      }
    }
    return response;
  } catch (error) {
    // La red falló, servimos la versión cacheada si existe.
    return cached || new Response('Network error', { status: 408 });
  }
}

/**
 * Manejador específico para la API en core.chcs.workers.dev.
 * Aplica Network-First con TTL a las lecturas (GET) y Network-Only a las escrituras (POST, DELETE).
 */
async function handleCoreApiRequest(event) {
  if (event.request.method === 'GET') {
    // Para obtener datos (ej. lista de favoritos, proxy de Spotify), podemos usar caché.
    return networkFirstWithTTL(event);
  } else {
    // Para modificar datos (ej. añadir/eliminar favorito), siempre vamos a la red.
    // No queremos cachear estas respuestas para evitar sincronizaciones incorrectas.
    try {
      return await fetch(event.request);
    } catch (error) {
      // Si la petición de escritura falla (ej. no hay conexión), 
      // devolvemos un error para que el cliente lo maneje.
      return new Response(JSON.stringify({ error: 'Network error, please try again later.' }), {
        status: 408, // Request Timeout
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}
