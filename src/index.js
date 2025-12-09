// /src/index.js

// ===============================================================
//  CORS
// ===============================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function handleOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

// ===============================================================
//  HEADERS DE SEGURIDAD (se aplican a TODAS las respuestas)
// ===============================================================
function applySecurityHeaders(response) {
  const securityHeaders = {
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), " +
      "magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), " +
      "encrypted-media=(), fullscreen=(self), picture-in-picture=(self)",
    "Content-Security-Policy":
      "default-src 'none'; " +
      "script-src 'self' https://core.chcs.workers.dev https://stats.tramax.com.ar; " +
      "worker-src 'self' blob:; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https://core.chcs.workers.dev https://stats.tramax.com.ar; " +
      "connect-src 'self' https://api.radioparadise.com https://core.chcs.workers.dev; " +
      "font-src 'self'; " +
      "manifest-src 'self'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "frame-ancestors 'none'; " +
      "upgrade-insecure-requests",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains;",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin"
  };

  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(securityHeaders)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

// ===============================================================
//   UTILIDADES
// ===============================================================
function cleanSearchTerm(term) {
  if (!term) return "";
  return term.replace(/[()\[\]{}]/g, " ").replace(/\s+/g, " ").trim();
}

function getAlbumTypeDescription(album) {
  const name = album.name.toLowerCase();
  const type = album.album_type;
  const reissueKeywords = ["remastered", "deluxe", "expanded", "anniversary", "edition", "reissue", "legacy"];
  if (type === "compilation") return "Compilación";
  if (type === "single") return "Sencillo";
  if (reissueKeywords.some((k) => name.includes(k))) return "Reedición";
  return "Álbum";
}

// ===============================================================
//  SPOTIFY HANDLER
// ===============================================================
async function handleSpotifyRequest(request, env) {
  // (igual que antes, omitido aquí por brevedad, copia tu función existente)
}

// ===============================================================
//  RADIO PARADISE HANDLER
// ===============================================================
async function handleRadioParadiseRequest(request) {
  // (igual que antes, omitido aquí por brevedad, copia tu función existente)
}

// ===============================================================
//  ROUTER + SERVE STATIC (SPA fallback)
// ===============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;

    if (request.method === "OPTIONS") {
      response = handleOptions();

    } else if (url.pathname.startsWith("/spotify")) {
      response = await handleSpotifyRequest(request, env);

    } else if (url.pathname.startsWith("/radioparadise")) {
      response = await handleRadioParadiseRequest(request);

    } else if (env.ASSETS) {
      try {
        // Intentamos servir el archivo solicitado
        response = await env.ASSETS.fetch(request);
        if (response.status === 404) {
          // Si no existe, devolvemos index.html (SPA)
          response = await env.ASSETS.fetch(new Request("/index.html", request));
        }
      } catch (err) {
        // Fallback: siempre devolvemos index.html
        response = await env.ASSETS.fetch(new Request("/index.html", request));
      }
    } else {
      // Sin assets, devolvemos un OK básico
      response = new Response("<h1>OK</h1>", { status: 200, headers: { "Content-Type": "text/html" } });
    }

    return applySecurityHeaders(response);
  }
};
