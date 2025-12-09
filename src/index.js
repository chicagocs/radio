// src/index.js

// Headers de seguridad robustos
const securityHeaders = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), encrypted-media=(), fullscreen=(self), picture-in-picture=(self)",
  "Content-Security-Policy": "default-src 'none'; script-src 'self' https://core.chcs.workers.dev https://stats.tramax.com.ar; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://core.s.workers.dev https://stats.max.com; connect-src 'self' https://api.radio.com https://core.s.workers.dev; font-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains;",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin"
};

// Cabeceras CORS para las APIs
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

// Función para aplicar headers de seguridad a cualquier respuesta
function applySecurityHeaders(response, includeCORS = false) {
  const newResponse = new Response(response.body, response);
  
  // Aplicar headers de seguridad
  Object.entries(securityHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  
  // Aplicar CORS si es necesario (para rutas de API)
  if (includeCORS) {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });
  }
  
  return newResponse;
}

// Función para manejar las peticiones preflight de CORS
function handleOptions() {
  const response = new Response(null, { status: 200 });
  return applySecurityHeaders(response, true);
}

// Función para limpiar cadenas de texto para la búsqueda
function cleanSearchTerm(term) {
  if (!term) return '';
  return term.replace(/[()\\[\\]{}]/g, ' ').replace(/\\s+/g, ' ').trim();
}

// Función para determinar el tipo de álbum
function getAlbumTypeDescription(album) {
  const name = album.name.toLowerCase();
  const type = album.album_type;

  const reissueKeywords = ['remastered', 'deluxe', 'expanded', 'anniversary', 'edition', 'reissue', 'legacy'];

  if (type === 'compilation') {
    return 'Compilación';
  }

  if (type === 'single') {
    return 'Sencillo';
  }

  if (reissueKeywords.some(keyword => name.includes(keyword))) {
    return 'Reedición';
  }

  return 'Álbum';
}

// Función que maneja la lógica del proxy para Spotify
async function handleSpotifyRequest(request, env) {
  try {
    const url = new URL(request.url);
    const artist = url.searchParams.get("artist");
    const title = url.searchParams.get("title");
    const album = url.searchParams.get("album");

    if (!artist || !title) {
      const response = new Response(
        JSON.stringify({ error: 'Faltan los parámetros "artist" y "title".' }), 
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
      return applySecurityHeaders(response, true);
    }

    const clientId = env.SPOTIFY_CLIENT_ID;
    const clientSecret = env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      const response = new Response(
        JSON.stringify({ error: "Faltan las credenciales de Spotify en el servidor." }), 
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
      return applySecurityHeaders(response, true);
    }

    const cleanArtist = cleanSearchTerm(artist);
    const cleanTitle = cleanSearchTerm(title);
    const cleanAlbum = cleanSearchTerm(album);

    const authString = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", 
      headers: { 
        "Authorization": `Basic ${authString}`, 
        "Content-Type": "application/x-www-form-urlencoded" 
      }, 
      body: "grant_type=client_credentials"
    });
    
    if (!tokenResponse.ok) throw new Error("Error al obtener el token de Spotify.");
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    let searchData = null;
    let searchResponse = null;

    // Fase 1: Búsqueda específica (track, artist, album)
    if (cleanAlbum) {
      console.log(`Worker: Búsqueda 1 (Específica) para "${cleanTitle}" de "${cleanArtist}" en "${cleanAlbum}"`);
      const specificQuery = `track:"${cleanTitle}" artist:"${cleanArtist}" album:"${cleanAlbum}"`;
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(specificQuery)}&type=track&limit=5`, 
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      if (searchResponse.ok) searchData = await searchResponse.json();
    }

    // Fase 2: Búsqueda general (track, artist)
    if (!searchData || searchData.tracks.items.length === 0) {
      console.log(`Worker: Búsqueda 2 (General) para "${cleanTitle}" de "${cleanArtist}"`);
      const generalQuery = `track:"${cleanTitle}" artist:"${cleanArtist}"`;
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(generalQuery)}&type=track&limit=5`, 
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      if (searchResponse.ok) searchData = await searchResponse.json();
    }
    
    // Fase 3: Fallback simple
    if (!searchData || searchData.tracks.items.length === 0) {
      console.log(`Worker: Búsqueda 3 (Fallback) para "${cleanTitle}" de "${cleanArtist}"`);
      const fallbackQuery = `${cleanArtist} ${cleanTitle}`;
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(fallbackQuery)}&type=track&limit=5`, 
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      if (searchResponse.ok) searchData = await searchResponse.json();
    }
    
    if (!searchResponse.ok) throw new Error("Error al buscar en Spotify.");

    if (searchData && searchData.tracks.items.length > 0) {
      const track = searchData.tracks.items[0];
      const albumData = track.album;
      let imageUrl = albumData.images && albumData.images.length > 0 ? albumData.images[0].url : null;
      const release_date = albumData.release_date || null;
      const duration_ms = track.duration_ms;
      let label = albumData.label || null;
      
      let totalTracks = albumData.total_tracks || null;
      let totalAlbumDuration = 0;
      let trackNumber = null;

      if (albumData.id) {
        try {
          const albumResponse = await fetch(
            `https://api.spotify.com/v1/albums/${albumData.id}`, 
            { headers: { "Authorization": `Bearer ${accessToken}` } }
          );
          if (albumResponse.ok) {
            const fullAlbumData = await albumResponse.json();
            label = fullAlbumData.label || label;
            
            if (fullAlbumData.tracks && fullAlbumData.tracks.items) {
              totalAlbumDuration = fullAlbumData.tracks.items.reduce((sum, t) => sum + t.duration_ms, 0);
            }

            const trackIndex = fullAlbumData.tracks.items.findIndex(t => t.id === track.id);
            if (trackIndex !== -1) {
              trackNumber = trackIndex + 1;
            }
          }
        } catch (error) { 
          console.error("Error al obtener datos del álbum:", error); 
        }
      }
      
      let genres = [];
      if (track.artists && track.artists.length > 0) {
        const artistPromises = track.artists.slice(0, 3).map(async (artist2) => {
          try {
            const artistResponse = await fetch(
              `https://api.spotify.com/v1/artists/${artist2.id}`, 
              { headers: { "Authorization": `Bearer ${accessToken}` } }
            );
            if (artistResponse.ok) return (await artistResponse.json()).genres || [];
          } catch (error) { 
            console.error(`Error al obtener datos del artista ${artist2.name}:`, error); 
          }
          return [];
        });
        genres = [...new Set((await Promise.all(artistPromises)).flat())];
      }
      
      const albumTypeDescription = getAlbumTypeDescription(albumData);

      const responseData = { 
        imageUrl, 
        release_date, 
        label, 
        genres, 
        duration: Math.floor(duration_ms / 1e3),
        totalTracks, 
        totalAlbumDuration: Math.floor(totalAlbumDuration / 1000),
        trackNumber,
        albumTypeDescription
      };
      
      const response = new Response(
        JSON.stringify(responseData), 
        { 
          status: 200, 
          headers: { "Content-Type": "application/json" } 
        }
      );
      return applySecurityHeaders(response, true);
    }

    const response = new Response(
      JSON.stringify({ 
        imageUrl: null, 
        release_date: null, 
        label: null, 
        genres: [], 
        duration: 0, 
        totalTracks: null, 
        totalAlbumDuration: 0, 
        trackNumber: null, 
        albumTypeDescription: null 
      }), 
      { 
        status: 404, 
        headers: { "Content-Type": "application/json" } 
      }
    );
    return applySecurityHeaders(response, true);

  } catch (error) {
    console.error("Error en el worker de Spotify:", error);
    const response = new Response(
      JSON.stringify({ error: "Error interno del servidor", details: error.message }), 
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
    return applySecurityHeaders(response, true);
  }
}

// Función que maneja la lógica del proxy para Radio Paradise
async function handleRadioParadiseRequest(request) {
  const API_BASE_URL = 'https://api.radioparadise.com/';
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('url');

    if (!path) {
      const response = new Response(
        JSON.stringify({ error: 'Se requiere el parámetro "url".' }), 
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
      return applySecurityHeaders(response, true);
    }

    const targetUrl = `${API_BASE_URL}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const apiResponse = await fetch(targetUrl, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
      const response = new Response(apiResponse.body, {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        headers: apiResponse.headers
      });
      return applySecurityHeaders(response, true);
    }

    const modifiedResponse = new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: apiResponse.headers,
    });

    return applySecurityHeaders(modifiedResponse, true);

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('La petición a Radio Paradise excedió el tiempo de espera (8s).');
      const response = new Response(
        JSON.stringify({ error: 'La API de Radio Paradise tardó demasiado en responder.' }), 
        {
          status: 504,
          headers: { "Content-Type": "application/json" }
        }
      );
      return applySecurityHeaders(response, true);
    }

    console.error('Error en el proxy de Radio Paradise:', error);
    const response = new Response(
      JSON.stringify({ error: 'Error interno del proxy' }), 
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
    return applySecurityHeaders(response, true);
  }
}

// --- MANEJADOR PRINCIPAL (ROUTER) ---
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    console.log("Worker: Nueva petición recibida. Pathname:", url.pathname);

    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    if (url.pathname.startsWith('/spotify')) {
      console.log("Worker: Enviando a handleSpotifyRequest");
      return handleSpotifyRequest(request, env);
    } else if (url.pathname.startsWith('/radioparadise')) {
      console.log("Worker: Enviando a handleRadioParadiseRequest");
      return handleRadioParadiseRequest(request);
    } else {
      const response = new Response(
        JSON.stringify({ error: "Ruta no encontrada. Usa /spotify o /radioparadise" }), 
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
      return applySecurityHeaders(response, true);
    }
  }
};
