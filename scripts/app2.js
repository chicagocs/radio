// app2.js - v3.7.0

// --- Módulos Externos ---
let supabase, computePosition, offset, flip;

async function loadModules() {
    try {
        const [{ createClient }, { computePosition: cp, offset: off, flip: fl }] = await Promise.all([
            import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),
            import('https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.4/+esm')
        ]);
        supabase = createClient('https://xahbzlhjolnugpbpnbmo.supabase.co', 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl');
        computePosition = cp; offset = off; flip = fl;
    } catch (e) {
        console.error('Error cargando módulos ESM:', e);
        // Fallback silencioso, la UI verificará si las funciones existen antes de usarlas
        supabase = null;
        computePosition = null; offset = null; flip = null;
    }
}

// --- Configuración ---
const config = {
    supabase: {
        url: 'https://xahbzlhjolnugpbpnbmo.supabase.co',
        key: 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl'
    },
    countdown: { tickMs: 250, endingThreshold: 10 },
    api: { 
        somaFm: { interval: 4000 }, 
        radioParadise: { interval: 5000 }, 
        musicBrainz: { minInterval: 1000 } 
    },
    storage: { 
        volume: 'rm_volume', 
        station: 'rm_last_station', 
        uid: 'rm_uid', 
        pwaDismissed: 'rm_pwa_dismissed', 
        favorites: 'radioMax_favorites' 
    },
    ui: { listenersCounter: 'totalListenersValue' },
    services: { somaFm: 'somafm', radioParadise: 'radioparadise', nrk: 'nrk' }
};

// --- Estado Global ---
const current = {
    station: null,
    stationId: null,
    channel: null,
    isPlaying: false,
    isMuted: false,
    previousVolume: 50,
    trackInfo: null,
    trackDuration: 0,
    trackStartTime: 0,
    isUpdatingSongInfo: false
};

const timers = {
    countdown: null,
    polling: null,
    rapid: null,
    stuck: null,
    audioCheck: null,
    resizeDebounce: null,
    installInvitation: null
};

const apiTracker = {
    somaFm: { last: 0, min: config.api.somaFm.interval },
    radioParadise: { last: 0, min: config.api.radioParadise.interval },
    musicBrainz: { last: 0, min: config.api.musicBrainz.minInterval }
};

// --- Caché del DOM ---
const $ = {
    audio: null, // Se asignará en init
    playBtn: null,
    stopBtn: null,
    volSlider: null,
    volIcon: null,
    stationSelect: null,
    songTitle: null,
    songArtist: null,
    songAlbum: null,
    albumCover: null,
    countdown: null,
    credits: null,
    tooltip: null,
    tooltipContent: null,
    releaseDate: null,
    recordLabel: null,
    trackGenre: null,
    trackPosition: null,
    trackIsrc: null,
    welcomeScreen: null,
    playbackInfo: null,
    playerHeader: null,
    stationName: null,
    shareButton: null,
    shareOptions: null
};

// --- Utilidades ---
function initDOMCache() {
    $.audio = document.getElementById('audioPlayer');
    $.playBtn = document.getElementById('playBtn');
    $.stopBtn = document.getElementById('stopBtn');
    $.volSlider = document.getElementById('volumeSlider');
    $.volIcon = document.getElementById('volumeIcon');
    $.stationSelect = document.getElementById('stationSelect');
    $.songTitle = document.getElementById('songTitle');
    $.songArtist = document.getElementById('songArtist');
    $.songAlbum = document.getElementById('songAlbum');
    $.albumCover = document.getElementById('albumCover');
    $.countdown = current.ui.countdown; // Referencia actualizada
    $.credits = current.ui.credits;     // Referencia actualizada
    $.tooltip = current.ui.tooltip;    // Referencia actualizada
    $.tooltipContent = current.ui.tooltipContent; // Referencia actualizada
    $.releaseDate = document.getElementById('releaseDate');
    $.recordLabel = document.getElementById('recordLabel');
    $.trackGenre = document.getElementById('trackGenre');
    $.trackPosition = document.getElementById('trackPosition');
    $.trackIsrc = document.getElementById('trackIsrc');
    $.welcomeScreen = document.getElementById('welcomeScreen');
    $.playbackInfo = document.getElementById('playbackInfo');
    $.playerHeader = document.querySelector('.player-header');
    $.stationName = document.getElementById('stationName');
    $.shareButton = document.getElementById('shareButton');
    $.shareOptions = document.getElementById('shareOptions');
}

function canMakeApiCall(service) {
    const now = Date.now();
    const tracker = apiTracker[service];
    if (!tracker) return false;
    if (now - tracker.last >= tracker.min) {
        tracker.last = now;
        return true;
    }
    return false;
}

function clearAllTimers() {
    if (timers.countdown) { cancelAnimationFrame(timers.countdown); timers.countdown = null; }
    ['polling', 'rapid', 'stuck', 'audioCheck', 'resizeDebounce', 'installInvitation'].forEach(k => {
        if (timers[k]) { clearInterval(timers[k]); clearTimeout(timers[k]); timers[k] = null; }
    });
}

// --- Supabase Presence ---
async function joinStation(stationId) {
    if (!supabase || !stationId || stationId === current.stationId) return;
    if (current.channel) await leaveStation(current.stationId);
    
    current.stationId = stationId;
    try {
        const channelName = `station:${stationId}`;
        const channel = supabase.channel(channelName, { 
            config: { presence: { key: getUniqueID() } } 
        });
        
        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const count = Object.keys(state).length;
                const el = document.getElementById(config.ui.listenersCounter);
                if (el) el.textContent = String(count).padStart(5, '0');
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    try { 
                        await channel.track({ 
                            user_at: new Date().toISOString(), 
                            agent: navigator.userAgent 
                        }); 
                    } catch (err) { console.warn(err); }
                }
            });
        current.channel = channel;
    } catch (e) { console.warn('Error en joinStation:', e); }
}

async function leaveStation(stationId) {
    if (!supabase || !current.channel) return;
    try { await supabase.removeChannel(current.channel); } catch (e) {}
    current.channel = null;
    current.stationId = null;
    const el = document.getElementById(config.ui.listenersCounter);
    if (el) el.textContent = '00000';
}

function getUniqueID() {
    let uid = localStorage.getItem(config.storage.uid);
    if (!uid) { 
        uid = 'user_' + Math.random().toString(36).substr(2, 9); 
        try { localStorage.setItem(config.storage.uid, uid); } catch {} 
    }
    return uid;
}

// --- Gestión de Storage ---
const storage = {
    volume: { 
        get: () => { 
            try { return JSON.parse(localStorage.getItem(config.storage.volume)) || 50; } 
            catch { return 50; } 
        }, 
        set: (v) => { 
            try { localStorage.setItem(config.storage.volume, JSON.stringify(v)); } 
            catch {} 
        } 
    },
    station: { 
        get: () => { 
            try { return JSON.parse(localStorage.getItem(config.storage.station)) || null; } 
            catch { return null; } 
        }, 
        set: (id) => { 
            try { localStorage.setItem(config.storage.station, JSON.stringify(id)); } 
            catch {} 
        } 
    },
    favorites: { 
        get: () => { 
            try { return JSON.parse(localStorage.getItem(config.storage.favorites)) || []; } 
            catch { return []; } 
        }, 
        set: (list) => { 
            try { localStorage.setItem(config.storage.favorites, JSON.stringify(list)); } 
            catch {} 
        } 
    },
    pwaDismissed: () => { 
        try { return localStorage.getItem(config.storage.pwaDismissed) === 'true'; } 
        catch { return false; } 
    }
};

// --- Control de Tiempo (Countdown) ---
function startCountdown() {
    if (!current.trackStartTime) return;
    clearCountdown();
    
    const tick = () => {
        if (!current.isPlaying || !current.trackStartTime) return;
        const now = Date.now();
        const elapsed = (now - current.trackStartTime) / 1000;
        let display = "--:--";
        
        if (current.trackDuration > 0) {
            const remaining = current.trackDuration - elapsed;
            if (remaining >= 0) {
                const m = Math.floor(remaining / 60);
                const s = Math.floor(remaining % 60);
                display = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                if ($.countdown) $.countdown.classList.toggle('ending', remaining < config.countdown.endingThreshold);
            } else {
                const m = Math.floor(Math.abs(remaining) / 60);
                const s = Math.floor(Math.abs(remaining) % 60);
                display = `+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                // Trigger actualización si nos pasamos mucho
                if (Math.floor(Math.abs(remaining)) === 1 && canMakeApiCall('somaFm')) updateSongInfo(true);
            }
        }
        
        if ($.countdown && display !== $.countdown.textContent) {
            $.countdown.textContent = display;
        }
        timers.countdown = requestAnimationFrame(tick);
    };
    tick();
}

function clearCountdown() {
    if (timers.countdown) { cancelAnimationFrame(timers.countdown); timers.countdown = null; }
    if ($.countdown) { 
        $.countdown.textContent = "--:--"; 
        $.countdown.classList.remove('ending'); 
    }
    current.trackDuration = 0; 
    current.trackStartTime = 0; 
    current.trackInfo = null;
}

// --- Polling & Lógica de Streams ---
function clearPolling() {
    if (timers.polling) { clearInterval(timers.polling); clearTimeout(timers.polling); timers.polling = null; }
    if (timers.rapid) { clearInterval(timers.rapid); timers.rapid = null; }
}

function startPollingSomaFM() {
    clearPolling();
    timers.polling = setInterval(() => {
        if (current.isPlaying && current.station?.service === config.services.somaFm) updateSongInfo(true);
    }, config.api.somaFm.interval);
}

function startPollingRadioParadise() {
    clearPolling();
    const loop = async () => {
        if (!current.isPlaying || !current.station || current.station.service !== config.services.radioParadise) return;
        await updateSongInfo(true);
        
        // Calcular siguiente intervalo basado en duración del tema
        let nextTime = 5000;
        if (current.trackDuration > 0 && current.trackStartTime > 0) {
            const elapsed = (Date.now() - current.trackStartTime) / 1000;
            const remaining = current.trackDuration - elapsed;
            if (remaining > 0) {
                nextTime = Math.max(2000, Math.floor(remaining * 1000));
            }
        }
        timers.polling = setTimeout(loop, nextTime);
    };
    loop();
}

function handleNrkMetadata() {
    if (!$.audio) return;
    const handler = () => {
        current.trackDuration = $.audio.duration;
        current.trackStartTime = Date.now();
        const t = { 
            title: current.station.name, 
            artist: current.station.description, 
            album: `Emisión del ${extractDateFromUrl(current.station.url)}` 
        };
        current.trackInfo = t; 
        updateUIWithTrackInfo(t); 
        resetAlbumCover(); 
        resetAlbumDetails(); 
        startCountdown(); 
        updateShareButtonVisibility();
        $.audio.removeEventListener('loadedmetadata', handler);
    };
    $.audio.addEventListener('loadedmetadata', handler, { once: true });
}

// --- Info de Canciones ---
async function updateSongInfo(bypass = false) {
    if (current.isUpdatingSongInfo) return;
    current.isUpdatingSongInfo = true;
    try {
        if (current.station?.service === config.services.somaFm) await updateSomaFM();
        else if (current.station?.service === config.services.radioParadise) await updateRadioParadise();
    } finally { 
        current.isUpdatingSongInfo = false; 
    }
}

async function updateSomaFM() {
    if (!canMakeApiCall('somaFm')) return;
    try {
        const res = await fetch(`https://api.somafm.com/songs/${current.station.id}.json`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.songs?.length) return;
        const s = data.songs[0];
        const t = { 
            title: s.title || 'Título desconocido', 
            artist: s.artist || 'Artista desconocido', 
            album: s.album || '' 
        };
        
        const isNew = !current.trackInfo || t.title !== current.trackInfo.title || t.artist !== current.trackInfo.artist;
        if (isNew) {
            current.trackInfo = t; 
            updateUIWithTrackInfo(t);
            current.trackStartTime = (s.date ? (s.date * 1000) - 1000 : Date.now());
            current.trackDuration = 0; 
            startCountdown();
            
            // Modo rápido si no tenemos duración
            if (current.trackDuration === 0) {
                if (timers.rapid) clearInterval(timers.rapid);
                timers.rapid = setInterval(() => { 
                    if (current.station?.service === config.services.somaFm) updateSongInfo(true); 
                }, 2000);
            }
            fetchSongDetails(t.artist, t.title, t.album).catch(() => {});
        }
    } catch (e) { console.warn("Error SomaFM API", e); }
}

async function updateRadioParadise() {
    if (!canMakeApiCall('radioParadise')) return;
    try {
        // Usar proxy Supabase para evitar CORS si es necesario
        const res = await fetch(`${config.supabase.url}/workers/radioparadise?url=${encodeURIComponent(`api/now_playing?chan=${current.station.channelId || 1}`)}`);
        if (!res.ok) return;
        const d = await res.json();
        const t = { 
            title: d.title || 'Título desconocido', 
            artist: d.artist || 'Artista desconocido', 
            album: d.album || '' 
        };
        
        const isNew = !current.trackInfo || t.title !== current.trackInfo.title || t.artist !== current.trackInfo.artist;
        if (isNew) {
            current.trackInfo = t; 
            updateUIWithTrackInfo(t);
            current.trackDuration = d.song_duration ? Math.floor(d.song_duration) : 0;
            if (current.trackDuration === 0) {
                current.trackStartTime = Date.now() - 15000; 
            }
            startCountdown();
            fetchSongDetails(t.artist, t.title, t.album).catch(() => {});
        }
    } catch (e) { console.warn("Error RadioParadise API", e); }
}

// --- Detalles de Álbum (Spotify/MusicBrainz) ---
async function fetchSongDetails(artist, title, album) {
    if (!artist || !title) return;
    let isrc = null;
    try {
        const res = await fetch(`https://core.chcs.workers.dev/spotify?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&album=${encodeURIComponent(album)}`);
        if (!res.ok) return;
        const d = await res.json();
        if (d?.imageUrl) displayAlbumCoverFromUrl(d.imageUrl);
        if (d?.duration) current.trackDuration = Math.floor(d.duration);
        if (d?.isrc) isrc = d.isrc;
        updateAlbumDetailsWithSpotifyData(d);
    } catch (e) {}
    
    if (isrc) await getMusicBrainzByISRC(isrc);
    else await getMusicBrainzByQuery(artist, title, album);
}

async function getMusicBrainzByISRC(isrc) {
    if (!canMakeApiCall('musicBrainz')) return;
    try {
        const res = await fetch(`https://musicbrainz.org/ws/2/isrc/${isrc}?inc=artist-rels&fmt=json`, { 
            headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } 
        });
        if (!res.ok) return;
        const d = await res.json();
        if (!d.recordings?.length) return;
        const r = d.recordings[0];
        if (r.length && current.trackDuration === 0) current.trackDuration = Math.floor(r.length / 1000);
        if (r.relations) setCreditsFromRelations(r.relations);
    } catch (e) {}
}

async function getMusicBrainzByQuery(artist, title, album) {
    if (!canMakeApiCall('musicBrainz')) return;
    try {
        const cleanTitle = title.replace(/\([^)]*\)/g, '').trim();
        const q = `artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(cleanTitle)}"`;
        const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=5`, { 
            headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } 
        });
        if (!res.ok) return;
        const d = await res.json();
        const r = (d.recordings || []).find(r => r.length) || d.recordings?.[0];
        if (!r) return;
        
        if (r.length && current.trackDuration === 0) current.trackDuration = Math.floor(r.length / 1000);
        
        // Esperar obligatoria para MusicBrainz (Rate Limit)
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        const crRes = await fetch(`https://musicbrainz.org/ws/2/recording/${r.id}?inc=artist-rels&fmt=json`, { 
            headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } 
        });
        if (!crRes.ok) return;
        const cr = await crRes.json();
        if (cr.relations) setCreditsFromRelations(cr.relations);
    } catch (e) {}
}

function setCreditsFromRelations(relations) {
    const artistRels = relations.filter(r => r.type && r.artist);
    if (!artistRels.length) { 
        if ($.credits) $.credits.textContent = 'N/A'; 
        return; 
    }
    const list = artistRels.map(r => `${translateRole(r.type)}: ${r.artist.name}`).join(', ');
    if ($.credits) { 
        $.credits.textContent = 'VER'; 
        $.credits.title = list; 
    }
    if ($.tooltipContent) $.tooltipContent.textContent = list;
    updateTooltipPosition();
}

function translateRole(role) {
    const map = { 
        'writer':'Escritor', 'composer':'Compositor', 'lyricist':'Letrista', 'producer':'Productor', 
        'co-producer':'Coproductor', 'arranger':'Arreglista', 'engineer':'Ingeniero', 
        'audio engineer':'Ingeniero de sonido', 'mixing engineer':'Ingeniero de mezclado', 
        'mastering engineer':'Ingeniero de mastering', 'remixer':'Remixer', 'conductor':'Director', 
        'performer':'Intérprete' 
    };
    return map[role.toLowerCase()] || role;
}

// --- Tooltip ---
function updateTooltipPosition() {
    if (!computePosition || !offset || !flip || !$.credits || !$.tooltip) return;
    $.tooltip.style.opacity = '0';
    computePosition($.credits, $.tooltip, { placement: 'top', strategy: 'absolute', middleware: [offset(8), flip()] })
        .then(({x, y}) => { 
            $.tooltip.style.left = `${x}px`; 
            $.tooltip.style.top = `${y}px`; 
            $.tooltip.style.opacity = '1'; 
        });
}

// --- UI: Portadas ---
function displayAlbumCoverFromUrl(url) {
    if (!url) { resetAlbumCover(); return; }
    const protocol = url.split('://')[0];
    if (!['http', 'https'].includes(protocol)) { resetAlbumCover(); return; }
    
    if (!$.albumCover) return;
    $.albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function () {
        const placeholder = $.albumCover.querySelector('.album-cover-placeholder');
        if (placeholder) { 
            placeholder.style.opacity = '0'; 
            placeholder.style.pointerEvents = 'none'; 
            setTimeout(() => { 
                if (placeholder.parentNode === $.albumCover) placeholder.remove(); 
            }, 300); 
        }
        displayAlbumCover(this);
    };
    img.onerror = () => { resetAlbumCover(); };
    img.src = url;
}

function displayAlbumCover(img) {
    if (!$.albumCover) return;
    $.albumCover.innerHTML = '';
    const displayImg = document.createElement('img');
    displayImg.src = img.src; 
    displayImg.alt = 'Portada del álbum'; 
    displayImg.classList.add('loaded');
    $.albumCover.appendChild(displayImg);
}

function resetAlbumCover() {
    if (!$.albumCover) return;
    $.albumCover.innerHTML = `
        <div class="album-cover-placeholder">
            <svg viewBox="0 0 640 640" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs><filter id="glow"><feGaussianBlur stdDeviation="6" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></defs>
                <rect width="640" height="640" fill="#0A0A0A" />
                <g stroke="#333333" stroke-width="2" fill="none">
                    <circle cx="320" cy="320" r="280" />
                    <circle cx="320" cy="320" r="220" />
                    <circle cx="320" cy="320" r="160" />
                </g>
                <g transform="translate(320, 320)">
                    <path d="M -90 -80 L -90 80 C -90 80, -60 100, -30 80 L 30 0 L 90 80 M 90 -80 L 90 80" stroke="#FF7A00" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#glow)" />
                </g>
            </svg>
        </div>
    `;
}

// --- UI: Detalles ---
function updateAlbumDetailsWithSpotifyData(d) {
    if ($.releaseDate) $.releaseDate.innerHTML = '';
    if (d?.release_date) {
        const y = d.release_date.substring(0, 4);
        let t = y;
        if (d?.albumTypeDescription && d.albumTypeDescription !== 'Álbum') t += ` (${d.albumTypeDescription})`;
        if ($.releaseDate) $.releaseDate.textContent = t;
    } else if ($.releaseDate) $.releaseDate.textContent = '----';
    
    if ($.recordLabel) $.recordLabel.textContent = d?.label?.trim() ? d.label : '----';
    
    const albumTrackCount = document.getElementById('albumTrackCount');
    if (albumTrackCount) albumTrackCount.textContent = d?.totalTracks ? d.totalTracks : '--';
    
    const albumTotalDuration = document.getElementById('albumTotalDuration');
    if (albumTotalDuration && d?.totalAlbumDuration) {
        let s = d.totalAlbumDuration;
        if (s > 10000) s = Math.floor(s / 1000);
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        albumTotalDuration.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    } else if (albumTotalDuration) albumTotalDuration.textContent = '--:--';
    
    if ($.trackGenre) $.trackGenre.textContent = d?.genres?.length ? d.genres.slice(0, 2).join(', ') : '--';
    
    if ($.trackPosition) $.trackPosition.textContent = d?.trackNumber && d?.totalTracks ? `Track ${d.trackNumber}/${d.totalTracks}` : '--/--';
    
    if ($.trackIsrc) $.trackIsrc.textContent = d?.isrc?.trim() ? d.isrc.toUpperCase() : '----';
}

function resetAlbumDetails() {
    if ($.releaseDate) $.releaseDate.textContent = '----';
    if ($.recordLabel) $.recordLabel.textContent = '----';
    const albumTrackCount = document.getElementById('albumTrackCount');
    if (albumTrackCount) albumTrackCount.textContent = '--';
    const albumTotalDuration = document.getElementById('albumTotalDuration');
    if (albumTotalDuration) albumTotalDuration.textContent = '--:--';
    if ($.trackGenre) $.trackGenre.textContent = '--';
    if ($.trackPosition) $.trackPosition.textContent = '--/--';
    if ($.trackIsrc) $.trackIsrc.textContent = '----';
    if ($.credits) $.credits.textContent = '--';
}

// --- UI: General ---
function updateUIWithTrackInfo(t) {
    if ($.songTitle && $.songTitle.textContent !== t.title) $.songTitle.textContent = t.title;
    if ($.songArtist && $.songArtist.textContent !== t.artist) $.songArtist.textContent = t.artist;
    if ($.songAlbum) $.songAlbum.textContent = t.album ? `(${t.album})` : '';
    updateShareButtonVisibility();
}

function resetUI() {
    if ($.songTitle) $.songTitle.textContent = 'Seleccionar estación';
    if ($.songArtist) $.songArtist.textContent = '';
    if ($.songAlbum) $.songAlbum.textContent = '';
    updateShareButtonVisibility();
}

function updateShareButtonVisibility() {
    if (!$.shareButton) return;
    const title = $.songTitle?.textContent || '';
    const artist = $.songArtist?.textContent || '';
    const invalidTitles = ['a sonar','Conectando...','Seleccionar estación','A sonar','Reproduciendo...','Error de reproducción','Reconectando...'];
    const ok = title && artist && !invalidTitles.includes(title.toLowerCase());
    $.shareButton.classList.toggle('visible', ok);
}

function updateStatus(now) {
    if ($.playBtn) $.playBtn.textContent = now ? '⏸ PAUSAR' : '▶ SONAR';
}

function showWelcomeScreen() {
    if ($.welcomeScreen) $.welcomeScreen.style.display = 'flex';
    if ($.playbackInfo) $.playbackInfo.style.display = 'none';
    if ($.playerHeader) $.playerHeader.classList.add('hidden');
}

function showPlaybackInfo() {
    if ($.welcomeScreen) $.welcomeScreen.style.display = 'none';
    if ($.playbackInfo) $.playbackInfo.style.display = 'flex';
    if ($.playerHeader) $.playerHeader.classList.remove('hidden');
}

// --- Favoritos ---
function getFavorites() { return storage.favorites.get(); }
function saveFavorites(list) { storage.favorites.set(list); }

function updateFavoriteButtonUI(id, fav) {
    const btn = document.querySelector(`.favorite-btn[data-station-id="${id}"]`);
    if (!btn) return;
    const name = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
    if (fav) { 
        btn.innerHTML = '★'; 
        btn.classList.add('is-favorite'); 
        btn.setAttribute('aria-label', `Quitar ${name} de favoritos`); 
    } else { 
        btn.innerHTML = '☆'; 
        btn.classList.remove('is-favorite'); 
        btn.setAttribute('aria-label', `Añadir ${name} a favoritos`); 
    }
}

function addFavorite(id) {
    const favs = getFavorites();
    if (!favs.includes(id)) { 
        favs.push(id); 
        saveFavorites(favs); 
        updateFavoriteButtonUI(id, true); 
        showNotification('Estación añadida'); 
    }
}

function removeFavorite(id) {
    const favs = getFavorites().filter(fid => fid !== id); 
    saveFavorites(favs); 
    updateFavoriteButtonUI(id, false); 
    showNotification('Estación eliminada'); 
}

function filterStationsByFavorites() {
    const favs = getFavorites();
    document.querySelectorAll('.custom-option').forEach(opt => { 
        opt.style.display = favs.includes(opt.dataset.value) ? 'block' : 'none'; 
    });
    document.querySelectorAll('.custom-optgroup-label').forEach(label => {
        let has = false; 
        let next = label.nextElementSibling;
        while (next && next.classList.contains('custom-option')) { 
            if (next.style.display !== 'none') { has = true; break; } 
            next = next.nextElementSibling; 
        }
        label.style.display = has ? 'block' : 'none';
    });
}

function showAllStations() { 
    document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(el => el.style.display = ''); 
}

// --- Custom Select (Clase) ---
let stationsById = {};

class CustomSelect {
    constructor(originalSelect) {
        this.originalSelect = originalSelect;
        this.customSelectWrapper = document.createElement('div');
        this.customSelectWrapper.className = 'custom-select-wrapper';
        this.customSelectTrigger = document.createElement('div');
        this.customSelectTrigger.className = 'custom-select-trigger';
        this.customOptions = document.createElement('div');
        this.customOptions.className = 'custom-options';
        
        this.customSelectWrapper.appendChild(this.customSelectTrigger);
        this.customSelectWrapper.appendChild(this.customOptions);
        this.originalSelect.parentNode.insertBefore(this.customSelectWrapper, this.originalSelect.nextSibling);
        this.originalSelect.style.display = 'none';
        this.hasScrolledToSelection = false;
        this.init();
    }
    
    init() {
        this.populateOptions();
        this.initEvents();
        this.updateTriggerText();
        this.updateSelectedOption();
        setTimeout(() => {
            const selectedOption = this.customOptions.querySelector('.custom-option.selected');
            if (selectedOption) selectedOption.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
    }
    
    populateOptions() {
        this.customOptions.innerHTML = '';
        Array.from(this.originalSelect.children).forEach(child => {
            if (child.tagName === 'OPTGROUP') {
                const label = document.createElement('div');
                label.className = 'custom-optgroup-label'; 
                label.textContent = child.label;
                this.customOptions.appendChild(label);
                child.querySelectorAll('option').forEach(opt => this.createCustomOption(opt));
            } else if (child.tagName === 'OPTION' && child.value) {
                this.createCustomOption(child);
            }
        });
    }
    
    createCustomOption(option) {
        const customOption = document.createElement('div');
        customOption.className = 'custom-option';
        customOption.dataset.value = option.value;
        const station = stationsById[option.value];
        
        let name = option.textContent;
        let desc = '';
        let tags = [];
        let promos = [];
        
        if (station) {
            name = station.service === config.services.radioParadise ? station.name.split(' - ')[1] || station.name : station.name;
            desc = station.description || '';
            tags = station.tags || [];
            promos = station.promotions || [];
        }
        
        const container = document.createElement('div');
        container.className = 'station-info';
        const details = document.createElement('div');
        details.className = 'station-details';
        
        const nameEl = document.createElement('span');
        nameEl.className = 'custom-option-name'; 
        nameEl.textContent = name;
        details.appendChild(nameEl);
        
        if (desc) {
            const descEl = document.createElement('span');
            descEl.className = 'custom-option-description'; 
            descEl.textContent = desc;
            details.appendChild(descEl);
        }
        
        if (tags.length > 0) {
            const tagContainer = document.createElement('div');
            tagContainer.className = 'station-tags-container';
            tags.forEach(t => {
                const tagEl = document.createElement('span');
                tagEl.className = 'station-tag'; 
                tagEl.textContent = t; 
                tagContainer.appendChild(tagEl);
            });
            details.appendChild(tagContainer);
        }
        
        container.appendChild(details);
        
        const favBtn = document.createElement('button');
        favBtn.className = 'favorite-btn'; 
        favBtn.innerHTML = '☆';
        favBtn.dataset.stationId = option.value;
        favBtn.setAttribute('aria-label', `Añadir ${name} a favoritos`);
        favBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            const sid = e.target.dataset.stationId; 
            if (e.target.classList.contains('is-favorite')) removeFavorite(sid); 
            else addFavorite(sid); 
        });
        container.appendChild(favBtn);
        
        if (promos.length > 0) {
            const promosContainer = document.createElement('div');
            promosContainer.className = 'station-promotions-container';
            promos.forEach(p => {
                const link = document.createElement('a');
                link.href = p.url; 
                link.textContent = p.text;
                link.className = `station-promotion-link station-promotion-link-${p.type}`;
                link.target = '_blank'; 
                link.rel = 'noopener noreferrer';
                promosContainer.appendChild(link);
            });
            details.appendChild(promosContainer);
        }
        
        customOption.appendChild(container);
        this.customOptions.appendChild(customOption);
    }
    
    initEvents() {
        this.customSelectTrigger.addEventListener('click', () => {
            this.toggle();
            this.updateSelectedOption();
            if (!this.hasScrolledToSelection) {
                const opt = this.customOptions.querySelector('.custom-option.selected');
                if (opt) setTimeout(() => opt.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
                this.hasScrolledToSelection = true;
            }
        });
        
        this.customOptions.querySelectorAll('.custom-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.originalSelect.value = opt.dataset.value;
                this.updateTriggerText();
                this.updateSelectedOption();
                this.close();
                this.originalSelect.dispatchEvent(new Event('change'));
            });
        });
        
        document.addEventListener('click', (e) => {
            if (!this.customSelectWrapper.contains(e.target)) this.close();
        });
    }
    
    toggle() { this.customSelectWrapper.classList.toggle('open'); }
    open() { this.customSelectWrapper.classList.add('open'); }
    close() { this.customSelectWrapper.classList.remove('open'); }
    
    updateSelectedOption() {
        const val = this.originalSelect.value;
        this.customOptions.querySelectorAll('.custom-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === val);
        });
    }
    
    updateTriggerText() {
        const sel = this.originalSelect.options[this.originalSelect.selectedIndex];
        const st = stationsById[sel.value];
        let txt = sel.textContent;
        if (st) txt = st.service === config.services.radioParadise ? st.name.split(' - ')[1] || st.name : st.name;
        this.customSelectTrigger.textContent = txt || " Seleccionar Estación ";
    }
}

// --- Reproducción ---
async function playStation() {
    if (!current.station) { alert('Por favor, seleccionar una estación'); return; }
    await joinStation(current.station.id);
    
    if (!$.audio) return;
    $.audio.src = current.station.url;
    
    try {
        await $.audio.play();
        current.isPlaying = true; 
        updateStatus(true); 
        showPlaybackInfo();
        startCountdown();
        
        if (current.station.service === config.services.somaFm) startPollingSomaFM();
        else if (current.station.service === config.services.radioParadise) startPollingRadioParadise();
        else if (current.station.service === config.services.nrk) handleNrkMetadata();
        
        clearStuckCheck();
        timers.stuck = setInterval(() => {
            if (current.isPlaying && $.audio.paused && $.audio.currentTime > 0) handlePlaybackError();
        }, 3000);
    } catch (e) { 
        handlePlaybackError(); 
    }
}

function stopStation() {
    if ($.audio) { 
        $.audio.pause(); 
        $.audio.src = ''; 
    }
    leaveStation(current.stationId);
    current.isPlaying = false; 
    current.station = null; 
    current.stationId = null;
    clearCountdown(); 
    clearPolling(); 
    clearStuckCheck();
    resetUI(); 
    updateStatus(false); 
    showWelcomeScreen();
}

function clearStuckCheck() { 
    if (timers.stuck) { clearInterval(timers.stuck); timers.stuck = null; } 
}

function handlePlaybackError() {
    if ($.audio) $.audio.pause();
    current.isPlaying = false; 
    updateStatus(false);
    clearStuckCheck(); 
    clearCountdown(); 
    clearPolling();
    current.trackInfo = null; 
    resetAlbumCover(); 
    resetAlbumDetails();
    showWelcomeScreen();
    
    if ($.songTitle) $.songTitle.textContent = 'Reconectando...';
    if ($.songArtist) $.songArtist.textContent = 'La reproducción se reanudará automáticamente.';
    if ($.songAlbum) $.songAlbum.textContent = '';
    updateShareButtonVisibility();
    
    if (!timers.audioCheck) {
        timers.audioCheck = setInterval(async () => {
            if ($.audio && !$.audio.paused && $.audio.currentTime > 0) {
                current.isPlaying = true; 
                clearStuckCheck(); 
                clearInterval(timers.audioCheck); 
                timers.audioCheck = null;
                showPlaybackInfo();
                if (current.station.service === config.services.somaFm) startPollingSomaFM();
                else if (current.station.service === config.services.radioParadise) startPollingRadioParadise();
                updateSongInfo(true);
            }
        }, 1000);
    }
}

// --- Volumen ---
function loadVolume() {
    const v = storage.volume.get();
    if (!$.volSlider) return;
    $.volSlider.value = v;
    if ($.volIcon) $.volIcon.classList.toggle('muted', v === '0');
    current.previousVolume = v;
    updateVolumeIconPosition();
}

function saveVolume() {
    if (!$.volSlider) return;
    storage.volume.set($.volSlider.value);
}

function updateVolumeIconPosition() {
    if (!$.volSlider || !$.volIcon) return;
    const w = $.volSlider.offsetWidth;
    const p = $.volSlider.value / $.volSlider.max;
    const iw = $.volIcon.offsetWidth;
    $.volIcon.style.left = `${p * w - (iw / 2)}px`;
}

// --- Compartir ---
function shareOnWhatsApp() {
    const title = $.songTitle?.textContent || '';
    const artist = $.songArtist?.textContent || '';
    const invalidTitles = ['a sonar','Conectando...','Seleccionar estación','A sonar','Reproduciendo...','Error de reproducción','Reconectando...'];
    
    if (!title || !artist || invalidTitles.includes(title.toLowerCase())) {
        showNotification('Por favor, espera a que comience una canción para compartir');
        return;
    }
    const msg = `Escuché ${title} de ${artist} en https://kutt.it/radiomax ¡Temazo en RadioMax!`;
    const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMob) {
        const uri = `whatsapp://send?text=${encodeURIComponent(msg)}`;
        const link = document.createElement('a');
        link.href = uri; link.target = '_blank'; link.rel = 'noopener noreferrer';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => { window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); }, 1500);
    } else window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// --- PWA Install ---
function showInstallInvitation() {
    if (window.matchMedia('(display-mode: standalone)').matches || storage.pwaDismissed()) return;
    let os = 'other';
    if (/android/i.test(navigator.userAgent)) os = 'android';
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) os = 'ios';
    else if (/win/i.test(navigator.userAgent)) os = 'windows';
    
    const inv = document.getElementById('install-pwa-invitation');
    if (!inv) return;
    inv.style.display = 'flex';
    
    const btns = {
        win: document.getElementById('install-windows'),
        android: document.getElementById('install-android'),
        ios: document.getElementById('install-ios')
    };
    
    Object.values(btns).forEach(btn => btn?.classList.add('disabled'));
    
    const activeBtn = os === 'android' ? btns.android : (os === 'ios' ? btns.ios : (os === 'windows' ? btns.win : null));
    if (activeBtn) activeBtn.classList.remove('disabled');
}

function hideInstallInvitation() {
    const inv = document.getElementById('install-pwa-invitation');
    if (inv) inv.style.display = 'none';
    localStorage.setItem(config.storage.pwaDismissed, 'true');
}

// --- Notificaciones ---
function showNotification(message) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = message; 
    n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 3000);
}

// --- Utils ---
function extractDateFromUrl(url) {
    const m = url.match(/nrk_radio_klassisk_natt_(\d{8})_/);
    return m ? `${m[1].substring(6, 8)}-${m[1].substring(4, 6)}-${m[1].substring(0, 4)}` : 'Fecha desconocida';
}

function logErrorForAnalysis(type, details) {
    console.error(`Error logged: ${type}`, details);
}

// --- Carga de Estaciones ---
async function loadStations() {
    try {
        const res = await fetch('/stations.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const allStations = await res.json();
        
        const grouped = allStations.reduce((acc, s) => {
            const name = s.service === 'somafm' ? 'SomaFM' : s.service === 'radioparadise' ? 'Radio Paradise' : s.service === 'nrk' ? 'NRK Radio' : 'Otro';
            if (!acc[name]) acc[name] = [];
            acc[name].push(s);
            return acc;
        }, {});
        
        for (const n in grouped) grouped[n].sort((a, b) => a.name.localeCompare(b.name));
        
        const loading = document.getElementById('loadingStations');
        if (loading) loading.style.display = 'none';
        if ($.stationSelect) $.stationSelect.style.display = 'block';
        if ($.stationName) $.stationName.textContent = 'RadioMax';
        
        populateStationSelect(grouped);
        
        const customSelect = new CustomSelect($.stationSelect);
        
        // Inicializar UI de favoritos
        const favs = getFavorites();
        favs.forEach(id => updateFavoriteButtonUI(id, true));
        
        // Restaurar última estación
        const last = storage.station.get();
        if (last && stationsById[last]) {
            $.stationSelect.value = last; 
            customSelect.updateTriggerText(); 
            customSelect.updateSelectedOption();
            setTimeout(() => { 
                const sel = customSelect.customOptions.querySelector('.custom-option.selected'); 
                if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); 
            }, 100);
            const st = stationsById[last];
            if (st) { 
                current.station = st; 
                if ($.stationName) $.stationName.textContent = st.service === config.services.radioParadise ? st.name.split(' - ')[1] || st.name : st.name; 
            }
        }
        
        if (current.station && $.audio) {
            $.audio.src = current.station.url;
            if ($.songTitle) $.songTitle.textContent = 'A sonar';
            if ($.songArtist) $.songArtist.textContent = '';
            if ($.songAlbum) $.songAlbum.textContent = '';
            updateShareButtonVisibility();
            updateStatus(false);
        }
        showWelcomeScreen();
    } catch (e) {
        const loading = document.getElementById('loadingStations');
        if (loading) { 
            loading.textContent = 'Error al cargar estaciones. Recarga.'; 
            loading.style.color = '#ff6600'; 
        }
        logErrorForAnalysis('Load error', { error: e.message, timestamp: new Date().toISOString() });
    }
}

function populateStationSelect(grouped) {
    if (!$.stationSelect) return;
    while ($.stationSelect.firstChild) $.stationSelect.removeChild($.stationSelect.firstChild);
    const def = document.createElement('option');
    def.value = ""; 
    def.textContent = " Seleccionar Estación "; 
    def.disabled = true; 
    def.selected = true;
    $.stationSelect.appendChild(def);
    stationsById = {};
    for (const n in grouped) {
        const grp = document.createElement('optgroup');
        grp.label = n;
        grouped[n].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; 
            stationsById[s.id] = s; 
            grp.appendChild(opt);
        });
        $.stationSelect.appendChild(grp);
    }
}

// --- Event Listeners Iniciales ---
function initEvents() {
    if ($.stationSelect) {
        $.stationSelect.addEventListener('change', function() {
            if (this.value) {
                storage.station.set(this.value);
                const st = stationsById[this.value];
                if (st) { 
                    current.station = st; 
                    if ($.stationName) $.stationName.textContent = st.service === config.services.radioParadise ? st.name.split(' - ')[1] || st.name : st.name; 
                }
                showWelcomeScreen();
                playStation();
            }
        });
    }

    if ($.playBtn) {
        $.playBtn.addEventListener('click', () => {
            $.playBtn.style.animation = '';
            if (current.isPlaying) stopStation();
            else { 
                if (current.station) playStation(); 
                else alert('Por favor, seleccionar una estación'); 
            }
        });
    }

    if ($.stopBtn) {
        $.stopBtn.addEventListener('click', stopStation);
    }

    if ($.volSlider) {
        $.volSlider.addEventListener('input', function() {
            const v = this.value / 100;
            if ($.audio) $.audio.volume = v;
            saveVolume();
            updateVolumeIconPosition();
            if (this.value === '0') { 
                if ($.volIcon) $.volIcon.classList.add('muted'); 
                current.isMuted = true; 
            } else { 
                if ($.volIcon) $.volIcon.classList.remove('muted'); 
                current.isMuted = false; 
                current.previousVolume = this.value; 
            }
        });
    }

    if ($.volIcon) {
        $.volIcon.addEventListener('click', function() {
            if (current.isMuted) {
                $.volSlider.value = current.previousVolume;
                if ($.audio) $.audio.volume = current.previousVolume / 100;
                this.classList.remove('muted'); 
                current.isMuted = false;
            } else {
                current.previousVolume = $.volSlider.value;
                $.volSlider.value = '0';
                if ($.audio) $.audio.volume = 0;
                this.classList.add('muted'); 
                current.isMuted = true;
            }
            saveVolume();
            updateVolumeIconPosition();
        });
    }

    if ($.shareButton) {
        $.shareButton.addEventListener('click', () => {
            if ($.shareOptions) $.shareOptions.classList.toggle('active');
        });
    }
    document.addEventListener('click', (e) => {
        if ($.shareButton && $.shareOptions && !$.shareButton.contains(e.target) && !$.shareOptions.contains(e.target)) {
            $.shareOptions.classList.remove('active');
        }
    });

    const shareWhatsApp = document.getElementById('shareWhatsApp');
    if (shareWhatsApp) shareWhatsApp.addEventListener('click', shareOnWhatsApp);

    const closeInvitationBtn = document.getElementById('close-invitation');
    if (closeInvitationBtn) closeInvitationBtn.addEventListener('click', hideInstallInvitation);

    // Botones de instalación
    const installWin = document.getElementById('install-windows');
    const installAnd = document.getElementById('install-android');
    const installIos = document.getElementById('install-ios');
    
    [installWin, installAnd].forEach(btn => {
        if(btn) btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                window.deferredPrompt.userChoice.then((r) => {
                    if (r.outcome === 'accepted') console.log('User accepted A2HS');
                    window.deferredPrompt = null;
                });
                hideInstallInvitation();
            } else showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"');
        });
    });

    if (installIos) {
        installIos.addEventListener('click', (e) => {
            e.preventDefault();
            showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.');
            hideInstallInvitation();
        });
    }

    const filterToggleStar = document.getElementById('filterToggleStar');
    if (filterToggleStar) {
        filterToggleStar.addEventListener('click', function() {
            const showOnly = !this.classList.contains('active');
            this.classList.toggle('active', showOnly);
            this.setAttribute('aria-label', showOnly ? 'Mostrar todas' : 'Solo favoritas');
            this.title = showOnly ? 'Todas las estaciones' : 'Solo estaciones favoritas';
            if (showOnly) filterStationsByFavorites(); else showAllStations();
        });
    }

    // Navegación por teclado
    document.addEventListener('keydown', function(event) {
        if (document.querySelector('.custom-select-wrapper.open')) return;
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && /^[a-zA-Z0-9]$/.test(event.key)) {
            event.preventDefault();
            const key = event.key.toLowerCase();
            const matches = [];
            document.querySelectorAll('.custom-option').forEach(opt => {
                const name = opt.querySelector('.custom-option-name')?.textContent.toLowerCase();
                if (name?.startsWith(key)) matches.push(opt);
            });
            if (matches.length > 0) {
                matches[0].scrollIntoView({ block: 'nearest' });
                const id = matches[0].dataset.value;
                if ($.stationSelect) { 
                    $.stationSelect.value = id; 
                    $.stationSelect.dispatchEvent(new Event('change')); 
                }
            }
        }
    });

    // Resize (Único listener global)
    window.addEventListener('resize', () => {
        if (timers.resizeDebounce) clearTimeout(timers.resizeDebounce);
        timers.resizeDebounce = setTimeout(updateTooltipPosition, 100);
    });

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            let refreshing = false;
            const un = document.getElementById('update-notification');
            const btn = document.getElementById('update-reload-btn');
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    if (reg.waiting) { 
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' }); 
                        if (un) un.style.display = 'block'; 
                    }
                    reg.addEventListener('updatefound', () => {
                        const nw = reg.installing;
                        nw?.addEventListener('statechange', () => {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                if (un) un.style.display = 'block';
                            }
                        });
                    });
                })
                .catch(e => console.error('SW error:', e));
                
            navigator.serviceWorker.addEventListener('controllerchange', () => { 
                if (!refreshing) { refreshing = true; window.location.reload(); } 
            });
            
            if (btn) {
                btn.addEventListener('click', () => {
                    if (un) un.style.display = 'none';
                    navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
                    setTimeout(() => window.location.reload(), 100);
                });
            }
        });
    }
    
    // PWA Buttons Logic
    if (!storage.pwaDismissed()) {
        timers.installInvitation = setInterval(() => {
            if (!window.matchMedia('(display-mode: standalone)').matches) showInstallInvitation();
        }, 600000);
    }

    window.addEventListener('beforeinstallprompt', (e) => { 
        e.preventDefault(); 
        window.deferredPrompt = e; 
        
        const btnAndroid = document.getElementById('install-pwa-btn-android');
        const btnIos = document.getElementById('install-pwa-btn-ios');
        
        if (window.matchMedia('(display-mode: standalone)').matches) {
            if (btnAndroid) btnAndroid.style.display = 'none';
            if (btnIos) btnIos.style.display = 'none'; 
            return;
        }
        
        const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        if (isIos) {
            if (btnAndroid) btnAndroid.style.display = 'none';
            if (btnIos) btnIos.style.display = 'flex';
        } else {
            if (btnAndroid) btnAndroid.style.display = 'flex';
            if (btnIos) btnIos.style.display = 'none';
        }
    });

    const btnInstallAndroid = document.getElementById('install-pwa-btn-android');
    if (btnInstallAndroid) {
        btnInstallAndroid.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!window.deferredPrompt) { 
                showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"'); 
                return; 
            }
            window.deferredPrompt.prompt();
            const { outcome } = await window.deferredPrompt.userChoice;
            if (outcome === 'accepted') { 
                btnInstallAndroid.style.display = 'none'; 
            }
            window.deferredPrompt = null;
        });
    }
    
    const btnInstallIos = document.getElementById('install-pwa-btn-ios');
    if (btnInstallIos) {
        btnInstallIos.addEventListener('click', (e) => { 
            e.preventDefault(); 
            showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.'); 
        });
    }
}

// --- Main Initialization ---
(async () => {
    try {
        await loadModules();
        initDOMCache(); // Importante: Caché antes de usar elementos
        await loadStations();
        loadVolume();
        initEvents();
    } catch (error) {
        console.error("Error fatal:", error);
        const le = document.getElementById('loadingStations');
        if (le) { 
            le.textContent = `Error crítico: ${error.message}.`; 
            le.style.color = '#ff6600'; 
        }
    }
    
    // Versión
    fetch('/sw.js')
        .then(r => { if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`); return r.text(); })
        .then(t => {
            const m = t.match(/^(?:\/\/\s*)?v?(\d+(?:\.\d+){1,2})/m);
            const v = m && m[1] ? m[1] : 'N/D';
            const versionSpan = document.getElementById('version-number');
            if (versionSpan) versionSpan.textContent = v;
        })
        .catch(e => console.error('Error loading sw version:', e));
})();
