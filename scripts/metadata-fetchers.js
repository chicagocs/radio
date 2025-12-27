// scripts/metadata-fetchers.js

// Rate limiting tracker (compartido entre servicios)
const apiCallTracker = {
  somaFM: { lastCall: 0, minInterval: 5000 },
  radioParadise: { lastCall: 0, minInterval: 5000 },
  musicBrainz: { lastCall: 0, minInterval: 1000 },
  spotify: { lastCall: 0, minInterval: 1000 }
};

export function canMakeApiCall(service) {
  const now = Date.now();
  if (now - apiCallTracker[service].lastCall >= apiCallTracker[service].minInterval) {
    apiCallTracker[service].lastCall = now;
    return true;
  }
  return false;
}

// =======================================================================
// SOMA.FM
// =======================================================================
export async function fetchSomaFmInfo(stationId) {
  if (!canMakeApiCall('somaFM')) {
    throw new Error('Rate limit exceeded for SomaFM');
  }
  const response = await fetch(`https://api.somafm.com/songs/${stationId}.json`);
  if (!response.ok) throw new Error(`SomaFM API error: ${response.status}`);
  const data = await response.json();
  if (!data.songs || data.songs.length === 0) {
    throw new Error('No song data from SomaFM');
  }
  const song = data.songs[0];
  return {
    title: song.title || 'Título desconocido',
    artist: song.artist || 'Artista desconocido',
    album: song.album || '',
    date: song.date ? new Date(song.date * 1000) : null,
    service: 'somafm'
  };
}

// =======================================================================
// RADIO PARADISE
// =======================================================================
export async function fetchRadioParadiseInfo(channelId = 1) {
  if (!canMakeApiCall('radioParadise')) {
    throw new Error('Rate limit exceeded for Radio Paradise');
  }
  const workerUrl = 'https://core.chcs.workers.dev/radioparadise';
  const apiPath = `api/now_playing?chan=${channelId}`;
  const finalUrl = `${workerUrl}?url=${encodeURIComponent(apiPath)}`;
  const response = await fetch(finalUrl);
  if (!response.ok) throw new Error(`Radio Paradise API error: ${response.status}`);
  const data = await response.json();
  return {
    title: data.title || 'Título desconocido',
    artist: data.artist || 'Artista desconocido',
    album: data.album || '',
    duration: typeof data.song_duration === 'number' ? data.song_duration : null,
    service: 'radioparadise'
  };
}

// =======================================================================
// SPOTIFY (vía proxy)
// =======================================================================
export async function fetchSpotifyDetails(artist, title, album = '') {
  if (!canMakeApiCall('spotify')) {
    throw new Error('Rate limit exceeded for Spotify proxy');
  }
  const sanitizedArtist = cleanString(artist);
  const sanitizedTitle = cleanString(title);
  const sanitizedAlbum = cleanString(album);
  const url = `https://core.chcs.workers.dev/spotify?artist=${encodeURIComponent(sanitizedArtist)}&title=${encodeURIComponent(sanitizedTitle)}&album=${encodeURIComponent(sanitizedAlbum)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spotify proxy error: ${response.status}`);
  const data = await response.json();
  if (!data || !data.imageUrl) {
    throw new Error('No metadata from Spotify proxy');
  }
  return {
    imageUrl: data.imageUrl,
    releaseDate: data.release_date,
    label: data.label,
    totalTracks: data.totalTracks,
    totalAlbumDuration: data.totalAlbumDuration,
    genres: data.genres,
    trackNumber: data.trackNumber,
    isrc: data.isrc,
    duration: data.duration, // en segundos
    albumType: data.albumTypeDescription
  };
}

// =======================================================================
// MUSICBRAINZ
// =======================================================================
export async function fetchMusicBrainzDuration(artist, title) {
  if (!canMakeApiCall('musicBrainz')) {
    throw new Error('Rate limit exceeded for MusicBrainz');
  }
  const query = `artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=5`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' }
  });
  if (!response.ok) throw new Error(`MusicBrainz API error: ${response.status}`);
  const data = await response.json();
  if (!data.recordings || data.recordings.length === 0) {
    throw new Error('No recordings found in MusicBrainz');
  }
  const recording = data.recordings.find(r => r.length) || data.recordings[0];
  if (!recording.length) {
    throw new Error('No duration available in MusicBrainz');
  }
  return Math.floor(recording.length / 1000); // en segundos
}

// =======================================================================
// UTILIDADES
// =======================================================================
function cleanString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

export function logErrorForAnalysis(type, details) {
  console.error(`Metadata error [${type}]:`, details);
}
