// netlify/functions/get-spotify-cover.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
    }

    const { artist, title } = event.queryStringParameters;

    if (!artist || !title) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan los parámetros "artist" y "title".' }) };
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan las credenciales de Spotify en el servidor.' }) };
    }

    try {
        const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials'
        });

        if (!tokenResponse.ok) throw new Error('Error al obtener el token de Spotify.');
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const searchQuery = `q=artist:${encodeURIComponent(artist)} track:${encodeURIComponent(title)}&type=track&limit=1`;
        const searchResponse = await fetch(`https://api.spotify.com/v1/search?${searchQuery}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!searchResponse.ok) throw new Error('Error al buscar en Spotify.');
        const searchData = await searchResponse.json();

        if (searchData.tracks.items.length > 0) {
            const track = searchData.tracks.items[0];
            const album = track.album;
            
            let imageUrl = null;
            if (album.images && album.images.length > 0) {
                imageUrl = album.images[0].url;
            }

            // *** MEJORA: Extraer todos los datos necesarios ***
            const release_date = album.release_date;
            const label = album.label; // Sello discográfico
            const duration_ms = track.duration_ms; // Duración en milisegundos

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
            
            let country = null;
            if (album.copyrights && album.copyrights.length > 0) {
                const copyrightText = album.copyrights[0].text;
                const match = copyrightText.match(/\(([A-Z]{2})\)/);
                if (match) {
                    country = match[1];
                }
            }

            // *** MEJORA: Devolver también la duración en segundos ***
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    imageUrl, 
                    release_date, 
                    label, 
                    genres, 
                    country, 
                    duration: Math.floor(duration_ms / 1000) 
                }),
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ imageUrl: null, release_date: null, label: null, genres: [], country: null, duration: 0 }),
        };

    } catch (error) {
        console.error('Error en la función de Spotify:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno del servidor' }) };
    }
};
