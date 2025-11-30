// netlify/functions/get-spotify-cover.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Añadir cabeceras CORS para permitir peticiones desde tu frontend
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    // Manejar peticiones pre-flight de CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' }),
        };
    }

    const { artist, title } = event.queryStringParameters;

    if (!artist || !title) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Faltan los parámetros "artist" y "title".' }),
        };
    }

    // Tus claves de Spotify, que configuraremos en Netlify de forma segura
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Faltan las credenciales de Spotify en el servidor.' }),
        };
    }

    try {
        // 1. Obtener el token de acceso de Spotify
        const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
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

        // 2. Buscar la canción en Spotify para encontrar el álbum y el artista
        const searchQuery = `q=artist:${encodeURIComponent(artist)} track:${encodeURIComponent(title)}&type=track&limit=1`;
        const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchQuery}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!searchResponse.ok) {
            throw new Error('Error al buscar en Spotify.');
        }

        const searchData = await searchResponse.json();

        if (searchData.tracks.items.length > 0) {
            const track = searchData.tracks.items[0];
            const album = track.album;
            
            // *** NUEVO: Extraer toda la información necesaria ***
            let imageUrl = null;
            if (album.images && album.images.length > 0) {
                imageUrl = album.images[0].url; // URL de la imagen más grande
            }

            const release_date = album.release_date;
            const label = album.label;

            // Obtener los géneros del primer artista de la canción
            let genres = [];
            if (track.artists && track.artists.length > 0) {
                const primaryArtistId = track.artists[0].id;
                const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (artistResponse.ok) {
                    const artistData = await artistResponse.json();
                    genres = artistData.genres;
                }
            }
            
            // *** NUEVO: Intentar extraer el país de los derechos de autor (copyrights) ***
            let country = null;
            if (album.copyrights && album.copyrights.length > 0) {
                const copyrightText = album.copyrights[0].text;
                // Busca un código de país de 2 letras entre paréntesis al final, ej: "(C) 2023 Sello US LLC"
                const match = copyrightText.match(/\(([A-Z]{2})\)/);
                if (match) {
                    country = match[1];
                }
            }

            // Devolver un objeto con toda la información
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ imageUrl, release_date, label, genres, country }),
            };
        }

        // Si no se encuentra la canción
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ imageUrl: null, release_date: null, label: null, genres: [], country: null }),
        };

    } catch (error) {
        console.error('Error en la función de Spotify:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Error interno del servidor' }),
        };
    }
};
