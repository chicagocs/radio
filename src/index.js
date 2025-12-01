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

// Función que maneja la lógica del proxy para Spotify (Versión FINAL)
async function handleSpotifyRequest(request, env) {
  try {
    const url = new URL(request.url);
    const artist = url.searchParams.get("artist");
    const title = url.searchParams.get("title");

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
    const searchQuery1 = `track:"${encodeURIComponent(title)}" artist:"${encodeURIComponent(artist)}"`;
    let searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery1}&type=track&limit=5`, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (searchResponse.ok) searchData = await searchResponse.json();

    if (!searchData || searchData.tracks.items.length === 0) {
      const searchQuery2 = `${encodeURIComponent(artist)} ${encodeURIComponent(title)}`;
      searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery2}&type=track&limit=5`, { headers: { "Authorization": `Bearer ${accessToken}` } });
      if (searchResponse.ok) searchData = await searchResponse.json();
    }
    if (!searchResponse.ok) throw new Error("Error al buscar en Spotify.");

    if (searchData && searchData.tracks.items.length > 0) {
      const track = searchData.tracks.items[0];
      const album = track.album;
      let imageUrl = album.images && album.images.length > 0 ? album.images[0].url : null;
      const release_date = album.release_date || null;
      const duration_ms = track.duration_ms;
      let label = album.label || null;
      
      // Variables para los detalles del álbum
      let totalTracks = album.total_tracks || null;
      let totalAlbumDuration = 0;
      let trackNumber = null; // NUEVO

      if (album.id) {
        try {
          const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${album.id}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
          if (albumResponse.ok) {
            const albumData = await albumResponse.json();
            label = albumData.label || label;
            
            // Calcular la duración total del álbum
            if (albumData.tracks && albumData.tracks.items) {
              totalAlbumDuration = albumData.tracks.items.reduce((sum, t) => sum + t.duration_ms, 0);
            }

            // NUEVO: Encontrar la posición del tema
            const trackIndex = albumData.tracks.items.findIndex(t => t.id === track.id);
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
      
      let country = null;
      if (album.copyrights && album.copyrights.length > 0) {
        const match = album.copyrights[0].text.match(/\(([A-Z]{2})\)/);
        if (match) country = match[1];
      }
      if (!country && album.available_markets && album.available_markets.length > 0) country = album.available_markets[0];

      // Añadir los nuevos campos a la respuesta
      const responseData = { 
        imageUrl, 
        release_date, 
        label, 
        genres, 
        country, 
        duration: Math.floor(duration_ms / 1e3),
        totalTracks, 
        totalAlbumDuration: Math.floor(totalAlbumDuration / 1000),
        trackNumber // NUEVO
      };
      return new Response(JSON.stringify(responseData), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ imageUrl: null, release_date: null, label: null, genres: [], country: null, duration: 0, totalTracks: null, totalAlbumDuration: 0, trackNumber: null }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
      console.log("Worker: Enviando a handleRadioParadiseRequest"); // Corregido
      return handleRadioParadiseRequest(request);
    } else {
      return new Response(JSON.stringify({ error: "Ruta no encontrada. Usa /spotify o /radioparadise" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
