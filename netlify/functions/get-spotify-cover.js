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

        // 2. Buscar la canción en Spotify para encontrar el álbum
        const searchQuery = `q=artist:${encodeURIComponent(artist)} track:${encodeURIComponent(title)}&type=track&limit=1`;
        const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchQuery}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!searchResponse.ok) {
            throw new Error('Error al buscar en Spotify.');
        }

        const searchData = await searchResponse.json();

        if (searchData.tracks.items.length > 0) {
            const albumImages = searchData.tracks.items[0].album.images;
            if (albumImages.length > 0) {
                // Devolver la URL de la imagen más grande
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ imageUrl: albumImages[0].url }),
                };
            }
        }

        // Si no se encuentra la canción o el álbum no tiene imágenes
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ imageUrl: null }),
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
