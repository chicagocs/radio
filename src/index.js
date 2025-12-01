// src/index.js

// Cabeceras CORS comunes para todas las respuestas
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

// Función para manejar las peticiones preflight de CORS
function handleOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

// Función que maneja la lógica del proxy para Spotify (Versión CORREGIDA)
async function handleSpotifyRequest(request, env) {
  try {
    const url = new URL(request.url);
    const artist = url.searchParams.get("artist");
    const title = url.searchParams.get("title");
    const album = url.searchParams.get("album"); // <-- CAMBIO 1: Leemos el parámetro 'album'

    if (!artist || !title) {
      return new Response(JSON.stringify({ error: 'Faltan los parámetros "artist" y "title".' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const clientId = env.SPOTIFY_CLIENT_ID;
    const clientSecret = env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Faltan las credenciales de Spotify en el servidor." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authString = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Authorization": `Basic ${authString}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials"
    });
    if (!tokenResponse.ok) throw new Error("Error al obtener el token de Spotify.");
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    let searchData = null;
    let searchQuery = '';

    // --- CAMBIO 2: Lógica de búsqueda mejorada y más específica ---
    // 1. Intenta la búsqueda más específica si tenemos el álbum
    if (album) {
      console.log(`Worker: Búsqueda específica con álbum para "${title}" de "${artist}" en "${album}"`);
      searchQuery = `track:"${encodeURIComponent(title)}" artist:"${encodeURIComponent(artist)}" album:"${encodeURIComponent(album)}"`;
    } else {
      // 2. Si no hay álbum, usa la búsqueda por título y artista
      console.log(`Worker: Búsqueda general para "${title}" de "${artist}"`);
      searchQuery = `track:"${encodeURIComponent(title)}" artist:"${encodeURIComponent(artist)}"`;
    }

    let searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery}&type=track&limit=5`, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (searchResponse.ok) {
      searchData = await searchResponse.json();
    }

    // 3. Si la búsqueda específica (o la general) no da resultados, intenta una búsqueda más simple como último recurso
    if (!searchData || searchData.tracks.items.length === 0) {
      console.log("Worker: Búsqueda anterior falló, intentando fallback más simple...");
      const fallbackQuery = `${encodeURIComponent(artist)} ${encodeURIComponent(title)}`;
      searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${fallbackQuery}&type=track&limit=5`, { headers: { "Authorization": `Bearer ${accessToken}` } });
      if (searchResponse.ok) {
        searchData = await searchResponse.json();
      }
    }
    
    if (!searchResponse.ok) throw new Error("Error al buscar en Spotify.");

    // El resto de la función para procesar el resultado se mantiene igual
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
          const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${albumData.id}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
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
        } catch (error) { console.error("Error al obtener datos del álbum:", error); }
      }
      
      let genres = [];
      if (track.artists && track.artists.length > 0) {
        const artistPromises = track.artists.slice(0, 3).map(async (artist2) => {
          try {
            const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artist2.id}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
            if (artistResponse.ok) return (await artistResponse.json()).genres || [];
          } catch (error) { console.error(`Error al obtener datos del artista ${artist2.name}:`, error); }
          return [];
        });
        genres = [...new Set((await Promise.all(artistPromises)).flat())];
      }
      
      const responseData = { 
        imageUrl, 
        release_date, 
        label, 
        genres, 
        duration: Math.floor(duration_ms / 1e3),
        totalTracks, 
        totalAlbumDuration: Math.floor(totalAlbumDuration / 1000),
        trackNumber
      };
      return new Response(JSON.stringify(responseData), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ imageUrl: null, release_date: null, label: null, genres: [], duration: 0, totalTracks: null, totalAlbumDuration: 0, trackNumber: null }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error en el worker de Spotify:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// Función que maneja la lógica del proxy para Radio Paradise (Versión Mejorada)
async function handleRadioParadiseRequest(request) {
  const API_BASE_URL = 'https://api.radioparadise.com/';
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('url');

    if (!path) {
      return new Response(JSON.stringify({ error: 'Se requiere el parámetro "url".' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const targetUrl = `${API_BASE_URL}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const apiResponse = await fetch(targetUrl, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
        return new Response(apiResponse.body, {
            status: apiResponse.status,
            statusText: apiResponse.statusText,
            headers: { ...corsHeaders, ...apiResponse.headers }
        });
    }

    const modifiedResponse = new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: apiResponse.headers,
    });

    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    return modifiedResponse;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('La petición a Radio Paradise excedió el tiempo de espera (8s).');
      return new Response(JSON.stringify({ error: 'La API de Radio Paradise tardó demasiado en responder.' }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.error('Error en el proxy de Radio Paradise:', error);
    return new Response(JSON.stringify({ error: 'Error interno del proxy' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
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
      return new Response(JSON.stringify({ error: "Ruta no encontrada. Usa /spotify o /radioparadise" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
