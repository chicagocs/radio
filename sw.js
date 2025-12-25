// v3.2.7
const CACHE_VERSION = 'v3.2.7';
const STATIC_CACHE = `max-static-${CACHE_VERSION}`;
const API_CACHE = `max-api-${CACHE_VERSION}`;

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

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const oldCaches = keys.filter(key =>
        (key.startsWith('max-static-') || key.startsWith('max-api-')) &&
        key !== STATIC_CACHE &&
        key !== API_CACHE
      );
      return Promise.all(oldCaches.map(key => caches.delete(key)));
    })
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.hostname.includes('stats.max.com') || url.hostname.includes('stats.tramax.com.ar')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/offline.html', { cacheName: STATIC_CACHE }))
    );
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
    return;
  }

  if (url.hostname.includes('api.somafm.com') || url.hostname.includes('musicbrainz.org') || url.hostname.includes('nrk.no')) {
    event.respondWith(networkFirstWithTTL(event, API_CACHE));
    return;
  }

  if (url.hostname.includes('core.chcs.workers.dev')) {
    event.respondWith(handleCoreApiRequest(event, API_CACHE));
    return;
  }

  event.respondWith(fetch(event.request));
});

// SKIP WAITING
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Diagnóstico remoto
  if (event.data?.type === 'DEBUG_CACHE_STATUS') {
    debugCacheStatus(event);
  }
});

// ==========================================================================
// ESTRATEGIAS DE CACHÉ
// ==========================================================================

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  const fetchPromise = fetch(event.request).then(async (response) => {
    if (response && response.ok) {
      try {
        await cache.put(event.request, response.clone());
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          console.warn('[SW] Cuota excedida en caché estático. Intentando limpiar...');
          await freeUpCacheSpace(cacheName, event.request);
        } else {
          console.error('[SW] Error al cachear App Shell:', error);
        }
      }
    }
    return response;
  });

  return cached || fetchPromise;
}

async function networkFirstWithTTL(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  if (cached) {
    const cachedTime = cached.headers.get('sw-cached-time');
    if (cachedTime) {
      const age = Date.now() - new Date(cachedTime).getTime();
      if (age < API_CACHE_TTL) {
        return cached;
      }
    }
  }

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

      try {
        await cache.put(event.request, responseToCache);
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          console.warn('[SW] Cuota de caché API excedida. Intentando liberar espacio...');
          const freed = await freeUpCacheSpace(cacheName, event.request);
          if (freed) {
            try {
              await cache.put(event.request, responseToCache);
              console.debug('[SW] Reintento de caché API exitoso.');
            } catch (retryError) {
              console.warn('[SW] Reintento fallido:', retryError.message);
            }
          } else {
            console.warn('[SW] No se pudo liberar espacio para:', event.request.url);
          }
        } else {
          console.error('[SW] Error inesperado al cachear API:', error);
        }
      }
    }
    return response;
  } catch (error) {
    return cached || new Response('Network error', { status: 408 });
  }
}

async function handleCoreApiRequest(event, cacheName) {
  if (event.request.method === 'GET') {
    return networkFirstWithTTL(event, cacheName);
  } else {
    try {
      return await fetch(event.request);
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Network error, please try again later.' }), {
        status: 408,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}

// ==========================================================================
// GESTIÓN DE CUOTA
// ==========================================================================

async function freeUpCacheSpace(cacheName, request) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length === 0) return false;

  const entries = await Promise.all(
    keys.map(async (req) => {
      const res = await cache.match(req);
      const time = res?.headers.get('sw-cached-time');
      return {
        request: req,
        timestamp: time ? new Date(time).getTime() : 0
      };
    })
  );

  entries.sort((a, b) => a.timestamp - b.timestamp);

  for (const entry of entries) {
    if (entry.request.url === request.url && entry.request.method === request.method) {
      continue;
    }

    try {
      await cache.delete(entry.request);
      console.debug(`[SW] Entrada eliminada:`, entry.request.url);
      return true;
    } catch (err) {
      console.warn(`[SW] No se pudo eliminar entrada:`, entry.request.url);
    }
  }

  return false;
}

// ==========================================================================
// DIAGNÓSTICO REMOTO
// ==========================================================================

/**
 * Responde con un informe detallado del estado de los cachés.
 */
async function debugCacheStatus(event) {
  try {
    const allKeys = await caches.keys();
    const staticKeys = allKeys.filter(k => k.startsWith('max-static-'));
    const apiKeys = allKeys.filter(k => k.startsWith('max-api-'));

    const report = {
      timestamp: new Date().toISOString(),
      staticCaches: await getCacheReport(staticKeys),
      apiCaches: await getCacheReport(apiKeys),
      allCacheNames: allKeys
    };

    // Enviar el informe al cliente que lo solicitó
    event.ports[0].postMessage({ type: 'DEBUG_CACHE_STATUS_RESPONSE', report });
  } catch (err) {
    event.ports[0].postMessage({
      type: 'DEBUG_CACHE_STATUS_RESPONSE',
      error: err.message
    });
  }
}

async function getCacheReport(cacheNames) {
  const report = {};
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    const entries = await Promise.all(
      keys.map(async (req) => {
        const res = await cache.match(req);
        const time = res?.headers.get('sw-cached-time');
        return {
          url: req.url,
          method: req.method,
          cachedAt: time || null,
          ageMs: time ? Date.now() - new Date(time).getTime() : null
        };
      })
    );

    const ages = entries.map(e => e.ageMs).filter(age => age !== null);
    report[name] = {
      entryCount: keys.length,
      totalSizeEstimateKB: keys.length * 2, // estimación muy básica
      oldestEntryAgeMs: ages.length ? Math.max(...ages) : null,
      newestEntryAgeMs: ages.length ? Math.min(...ages) : null,
      sampleEntries: entries.slice(0, 3) // muestra las primeras 3
    };
  }
  return report;
}
