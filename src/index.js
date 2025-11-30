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

            // Buscar en Spotify
            const searchQuery = `q=artist:${encodeURIComponent(artist)} track:${encodeURIComponent(title)}&type=track&limit=1`;
            const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchQuery}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!searchResponse.ok) {
                throw new Error('Error al buscar en Spotify.');
            }

            const searchData = await searchResponse.json();

            // Procesar resultados
            if (searchData.tracks.items.length > 0) {
                const track = searchData.tracks.items[0];
                const album = track.album;

                let imageUrl = null;
                if (album.images && album.images.length > 0) {
                    imageUrl = album.images[0].url;
                }

                const release_date = album.release_date;
                const label = album.label;
                const duration_ms = track.duration_ms;

                // Obtener géneros del artista
                let genres = [];
                if (track.artists && track.artists.length > 0) {
                    const primaryArtistId = track.artists[0].id;
                    const artistResponse = await fetch(
                        `https://api.spotify.com/v1/artists/${primaryArtistId}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        }
                    );

                    if (artistResponse.ok) {
                        const artistData = await artistResponse.json();
                        genres = artistData.genres;
                    }
                }

                // Extraer país del copyright
                let country = null;
                if (album.copyrights && album.copyrights.length > 0) {
                    const copyrightText = album.copyrights[0].text;
                    const match = copyrightText.match(/\(([A-Z]{2})\)/);
                    if (match) {
                        country = match[1];
                    }
                }

                return new Response(
                    JSON.stringify({
                        imageUrl,
                        release_date,
                        label,
                        genres,
                        country,
                        duration: Math.floor(duration_ms / 1000)
                    }),
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
                JSON.stringify({ error: 'Error interno del servidor' }),
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
