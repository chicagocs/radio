// Cloudflare Worker para obtener información de Spotify

export default {
    async fetch(request, env) {
        // Configurar CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        };

        // Manejar preflight OPTIONS request
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: corsHeaders
            });
        }

        // Solo permitir GET
        if (request.method !== 'GET') {
            return new Response(
                JSON.stringify({ error: 'Método no permitido' }),
                {
                    status: 405,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            );
        }

        try {
            // Parsear parámetros de la URL
            const url = new URL(request.url);
            const artist = url.searchParams.get('artist');
            const title = url.searchParams.get('title');

            // Validar parámetros
            if (!artist || !title) {
                return new Response(
                    JSON.stringify({ error: 'Faltan los parámetros "artist" y "title".' }),
                    {
                        status: 400,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }

            // Obtener credenciales desde variables de entorno
            const clientId = env.SPOTIFY_CLIENT_ID;
            const clientSecret = env.SPOTIFY_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                return new Response(
                    JSON.stringify({ error: 'Faltan las credenciales de Spotify en el servidor.' }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }

            // Obtener token de acceso de Spotify
            const authString = btoa(`${clientId}:${clientSecret}`);
            const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            if (!tokenResponse.ok) {
                throw new Error('Error al obtener el token de Spotify.');
            }

            const tokenData = await tokenResponse.json();
            const accessToken = tokenData.access_token;

            // Buscar en Spotify con múltiples estrategias
            let searchData = null;
            
            // Estrategia 1: Búsqueda exacta con artista y título
            const searchQuery1 = `track:"${encodeURIComponent(title)}" artist:"${encodeURIComponent(artist)}"`;
            let searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery1}&type=track&limit=5`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (searchResponse.ok) {
                searchData = await searchResponse.json();
            }

            // Si no encontró resultados, intentar búsqueda más flexible
            if (!searchData || searchData.tracks.items.length === 0) {
                const searchQuery2 = `${encodeURIComponent(artist)} ${encodeURIComponent(title)}`;
                searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery2}&type=track&limit=5`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (searchResponse.ok) {
                    searchData = await searchResponse.json();
                }
            }

            if (!searchResponse.ok) {
                throw new Error('Error al buscar en Spotify.');
            }

            // Procesar resultados
            if (searchData && searchData.tracks.items.length > 0) {
                const track = searchData.tracks.items[0];
                const album = track.album;

                let imageUrl = null;
                if (album.images && album.images.length > 0) {
                    imageUrl = album.images[0].url;
                }

                const release_date = album.release_date || null;
                const duration_ms = track.duration_ms;

                // MEJORADO: Obtener información completa del álbum (incluye el sello)
                let label = album.label || null;
                let albumType = album.album_type || null;
                
                // Solicitar datos completos del álbum para asegurar el sello discográfico
                if (album.id) {
                    try {
                        const albumResponse = await fetch(
                            `https://api.spotify.com/v1/albums/${album.id}`,
                            {
                                headers: { 'Authorization': `Bearer ${accessToken}` }
                            }
                        );

                        if (albumResponse.ok) {
                            const albumData = await albumResponse.json();
                            label = albumData.label || label;
                            
                            console.log('Datos completos del álbum:', {
                                name: albumData.name,
                                label: albumData.label,
                                copyrights: albumData.copyrights
                            });
                        }
                    } catch (error) {
                        console.error('Error al obtener datos completos del álbum:', error);
                    }
                }

                // MEJORADO: Obtener géneros de TODOS los artistas, no solo el primario
                let genres = [];
                if (track.artists && track.artists.length > 0) {
                    // Crear array de promesas para obtener datos de todos los artistas
                    const artistPromises = track.artists.slice(0, 3).map(async (artist) => {
                        try {
                            const artistResponse = await fetch(
                                `https://api.spotify.com/v1/artists/${artist.id}`,
                                {
                                    headers: { 'Authorization': `Bearer ${accessToken}` }
                                }
                            );

                            if (artistResponse.ok) {
                                const artistData = await artistResponse.json();
                                return artistData.genres || [];
                            }
                        } catch (error) {
                            console.error(`Error al obtener datos del artista ${artist.name}:`, error);
                        }
                        return [];
                    });

                    // Esperar todas las respuestas
                    const artistsGenres = await Promise.all(artistPromises);
                    
                    // Combinar y eliminar duplicados
                    const allGenres = artistsGenres.flat();
                    genres = [...new Set(allGenres)];

                    console.log('Géneros encontrados:', genres);
                }

                // Extraer país del copyright
                let country = null;
                if (album.copyrights && album.copyrights.length > 0) {
                    const copyrightText = album.copyrights[0].text;
                    // Buscar código de país en formato (XX)
                    const match = copyrightText.match(/\(([A-Z]{2})\)/);
                    if (match) {
                        country = match[1];
                    }
                }

                // Si no hay país en copyright, intentar obtenerlo de los mercados disponibles
                if (!country && album.available_markets && album.available_markets.length > 0) {
                    // Usar el primer mercado como referencia
                    country = album.available_markets[0];
                }

                const responseData = {
                    imageUrl,
                    release_date,
                    label,
                    genres,
                    country,
                    duration: Math.floor(duration_ms / 1000),
                    // Información adicional para debug
                    albumType,
                    trackName: track.name,
                    artistName: track.artists[0].name
                };

                console.log('Respuesta final:', responseData);

                return new Response(
                    JSON.stringify(responseData),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }

            // No se encontró la canción
            console.log('No se encontró la canción en Spotify');
            return new Response(
                JSON.stringify({
                    imageUrl: null,
                    release_date: null,
                    label: null,
                    genres: [],
                    country: null,
                    duration: 0
                }),
                {
                    status: 404,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            );

        } catch (error) {
            console.error('Error en el worker de Spotify:', error);
            return new Response(
                JSON.stringify({ 
                    error: 'Error interno del servidor',
                    details: error.message 
                }),
                {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            );
        }
    }
};
