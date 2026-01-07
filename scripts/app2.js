// app.js - v3.6.1
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
        console.error('Error al cargar módulos ESM:', e);
        // Si no se pueden cargar, desactivar funcionalidades que dependan de ellos
        supabase = null;
        computePosition = null; offset = null; flip = null;
    }
}

// Configuración
const config = {
    supabase: {
        url: 'https://xahbzlhjolnugpbpnbmo.supabase.co',
        key: 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl'
    },
    countdown: { tickMs: 250, endingThreshold: 10, elapsedMax: 30 },
    api: { somaFm: { interval: 4000 }, radioParadise: { interval: 5000 }, musicBrainz: { minInterval: 1000 } },
    storage: { volume: 'rm_volume', station: 'rm_last_station', uid: 'rm_uid', pwaDismissed: 'rm_pwa_dismissed', favorites: 'radioMax_favorites' },
    listeners: { counterEl: 'totalListenersValue' },
    services: { somaFm: 'somafm', radioParadise: 'radioparadise', nrk: 'nrk' }
};

// Variables globales
let current = {
    station: null, stationId: null, channel: null, isPlaying: false, isMuted: false, previousVolume: 50,
    trackInfo: null, trackDuration: 0, trackStartTime: 0, isUpdatingSongInfo: false,
    ui: { countdown: null, totalDuration: null, credits: null, tooltip: null, tooltipContent: null }
};

let timers = {
    countdown: null, polling: null, rapid: null, stuck: null, audioCheck: null, resizeDebounce: null, installInvitation: null
};

let apiTracker = {
    somaFm: { last: 0, min: config.api.somaFm.interval },
    radioParadise: { last: 0, min: config.api.radioParadise.interval },
    musicBrainz: { last: 0, min: config.api.musicBrainz.minInterval }
};

function canMakeApiCall(service) {
    const now = Date.now();
    const t = apiTracker[service];
    if (now - t.last >= t.min) { t.last = now; return true; }
    return false;
}

function clearAllTimers() {
    if (timers.countdown) { cancelAnimationFrame(timers.countdown); timers.countdown = null; }
    ['polling', 'rapid', 'stuck', 'audioCheck', 'resizeDebounce', 'installInvitation'].forEach(k => {
        if (timers[k]) { clearInterval(timers[k]); clearTimeout(timers[k]); timers[k] = null; }
    });
}

// Supabase Presence (con manejo de errores)
async function joinStation(stationId) {
    if (!supabase || !stationId || stationId === current.stationId) return;
    if (current.channel) await leaveStation(current.stationId);
    current.stationId = stationId;
    try {
        const channelName = `station:${stationId}`;
        const channel = supabase.channel(channelName, { config: { presence: { key: getUniqueID() } } });
        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const count = Object.keys(state).length;
                const el = document.getElementById(config.listeners.counterEl);
                if (el) el.textContent = String(count).padStart(5, '0');
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    try { await channel.track({ user_at: new Date().toISOString(), agent: navigator.userAgent }); } catch {}
                }
            });
        current.channel = channel;
    } catch (e) { console.warn('Error en joinStation:', e); }
}

async function leaveStation(stationId) {
    if (!supabase || !current.channel) return;
    try { await supabase.removeChannel(current.channel); } catch {}
    current.channel = null; current.stationId = null;
    const el = document.getElementById(config.listeners.counterEl);
    if (el) el.textContent = '00000';
}

function getUniqueID() {
    let uid = localStorage.getItem(config.storage.uid);
    if (!uid) { uid = 'user_' + Math.random().toString(36).substr(2, 9); try { localStorage.setItem(config.storage.uid, uid); } catch {} }
    return uid;
}

// Storage
const storage = {
    volume: { get: () => { try { return JSON.parse(localStorage.getItem(config.storage.volume)) || 50; } catch { return 50; } }, set: (v) => { try { localStorage.setItem(config.storage.volume, JSON.stringify(v)); } catch {} } },
    station: { get: () => { try { return JSON.parse(localStorage.getItem(config.storage.station)) || null; } catch { return null; } }, set: (id) => { try { localStorage.setItem(config.storage.station, JSON.stringify(id)); } catch {} } },
    favorites: { get: () => { try { return JSON.parse(localStorage.getItem(config.storage.favorites)) || []; } catch { return []; } }, set: (list) => { try { localStorage.setItem(config.storage.favorites, JSON.stringify(list)); } catch {} } },
    pwaDismissed: () => { try { return localStorage.getItem(config.storage.pwaDismissed) === 'true'; } catch { return false; } }
};

// Countdown
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
                if (current.ui.countdown) current.ui.countdown.classList.toggle('ending', remaining < config.countdown.endingThreshold);
            } else {
                const m = Math.floor(Math.abs(remaining) / 60);
                const s = Math.floor(Math.abs(remaining) % 60);
                display = `+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                if (Math.floor(Math.abs(remaining)) === 1 && canMakeApiCall('somaFm')) updateSongInfo(true);
            }
        }
        if (current.ui.countdown && display !== current.ui.countdown.textContent) {
            current.ui.countdown.textContent = display;
        }
        timers.countdown = requestAnimationFrame(tick);
    };
    tick();
}

function clearCountdown() {
    if (timers.countdown) { cancelAnimationFrame(timers.countdown); timers.countdown = null; }
    if (current.ui.countdown) { current.ui.countdown.textContent = "--:--"; current.ui.countdown.classList.remove('ending'); }
    current.trackDuration = 0; current.trackStartTime = 0; current.trackInfo = null;
}

// Polling
function clearPolling() {
    if (timers.polling) { clearInterval(timers.polling); clearTimeout(timers.polling); timers.polling = null; }
    if (timers.rapid) { clearInterval(timers.rapid); timers.rapid = null; }
}

function startPollingSomaFM() {
    clearPolling();
    timers.polling = setInterval(() => {
        if (current.isPlaying && current.station && current.station.service === config.services.somaFm) updateSongInfo(true);
    }, config.api.somaFm.interval);
}

function startPollingRadioParadise() {
    clearPolling();
    const loop = async () => {
        if (!current.isPlaying || !current.station || current.station.service !== config.services.radioParadise) return;
        await updateSongInfo(true);
        const next = (current.trackDuration > 0 && current.trackStartTime > 0)
            ? Math.max(2000, Math.floor((current.trackDuration - ((Date.now() - current.trackStartTime) / 1000)) * 1000))
            : 5000;
        timers.polling = setTimeout(loop, next);
    };
    loop();
}

function handleNrkMetadata() {
    const audio = document.getElementById('audioPlayer');
    if (!audio) return;
    audio.addEventListener('loadedmetadata', () => {
        current.trackDuration = audio.duration;
        current.trackStartTime = Date.now();
        const t = { title: current.station.name, artist: current.station.description, album: `Emisión del ${extractDateFromUrl(current.station.url)}` };
        current.trackInfo = t; updateUIWithTrackInfo(t); resetAlbumCover(); resetAlbumDetails(); startCountdown(); updateShareButtonVisibility();
    }, { once: true });
}

// Song Info
async function updateSongInfo(bypass = false) {
    if (current.isUpdatingSongInfo) return;
    current.isUpdatingSongInfo = true;
    try {
        if (current.station.service === config.services.somaFm) await updateSomaFM();
        else if (current.station.service === config.services.radioParadise) await updateRadioParadise();
        else if (current.station.service === config.services.nrk) { /* no polling */ }
    } finally { current.isUpdatingSongInfo = false; }
}

async function updateSomaFM() {
    if (!canMakeApiCall('somaFm')) return;
    try {
        const res = await fetch(`https://api.somafm.com/songs/${current.station.id}.json`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.songs?.length) return;
        const s = data.songs[0];
        const t = { title: s.title || 'Título desconocido', artist: s.artist || 'Artista desconocido', album: s.album || '' };
        const isNew = !current.trackInfo || t.title !== current.trackInfo.title || t.artist !== current.trackInfo.artist;
        if (isNew) {
            current.trackInfo = t; updateUIWithTrackInfo(t);
            current.trackStartTime = (s.date ? (s.date * 1000) - 1000 : Date.now());
            current.trackDuration = 0; startCountdown();
            if (current.trackDuration === 0) {
                if (timers.rapid) clearInterval(timers.rapid);
                timers.rapid = setInterval(() => { if (current.station.service === config.services.somaFm) updateSongInfo(true); }, 2000);
            }
            fetchSongDetails(t.artist, t.title, t.album).catch(() => {});
        }
    } catch {}
}

async function updateRadioParadise() {
    if (!canMakeApiCall('radioParadise')) return;
    try {
        const res = await fetch(`${config.supabase.url}/workers/radioparadise?url=${encodeURIComponent(`api/now_playing?chan=${current.station.channelId || 1}`)}`);
        if (!res.ok) return;
        const d = await res.json();
        const t = { title: d.title || 'Título desconocido', artist: d.artist || 'Artista desconocido', album: d.album || '' };
        const isNew = !current.trackInfo || t.title !== current.trackInfo.title || t.artist !== current.trackInfo.artist;
        if (isNew) {
            current.trackInfo = t; updateUIWithTrackInfo(t);
            if (d.song_duration) current.trackDuration = d.song_duration;
            else { current.trackStartTime = Date.now() - 15000; current.trackDuration = 0; }
            startCountdown();
            fetchSongDetails(t.artist, t.title, t.album).catch(() => {});
        }
    } catch {}
}

// Song Details
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
    } catch {}
    if (isrc) await getMusicBrainzByISRC(isrc);
    else await getMusicBrainzByQuery(artist, title, album);
}

async function getMusicBrainzByISRC(isrc) {
    if (!canMakeApiCall('musicBrainz')) return;
    try {
        const res = await fetch(`https://musicbrainz.org/ws/2/isrc/${isrc}?inc=artist-rels&fmt=json`, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
        if (!res.ok) return;
        const d = await res.json();
        if (!d.recordings?.length) return;
        const r = d.recordings[0];
        if (r.length && current.trackDuration === 0) current.trackDuration = Math.floor(r.length / 1000);
        if (r.relations) setCreditsFromRelations(r.relations);
    } catch {}
}

async function getMusicBrainzByQuery(artist, title, album) {
    if (!canMakeApiCall('musicBrainz')) return;
    try {
        const cleanTitle = title.replace(/\([^)]*\)/g, '').trim();
        const q = `artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(cleanTitle)}"`;
        const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=5`, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
        if (!res.ok) return;
        const d = await res.json();
        const r = (d.recordings || []).find(r => r.length) || d.recordings?.[0];
        if (!r) return;
        if (r.length && current.trackDuration === 0) current.trackDuration = Math.floor(r.length / 1000);
        const id = r.id;
        await new Promise(resolve => setTimeout(resolve, 1100));
        const crRes = await fetch(`https://musicbrainz.org/ws/2/recording/${id}?inc=artist-rels&fmt=json`, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
        if (!crRes.ok) return;
        const cr = await crRes.json();
        if (cr.relations) setCreditsFromRelations(cr.relations);
    } catch {}
}

function setCreditsFromRelations(relations) {
    const artistRels = relations.filter(r => r.type && r.artist);
    if (!artistRels.length) { if (current.ui.credits) current.ui.credits.textContent = 'N/A'; return; }
    const list = artistRels.map(r => `${translateRole(r.type)}: ${r.artist.name}`).join(', ');
    if (current.ui.credits) { current.ui.credits.textContent = 'VER'; current.ui.credits.title = list; }
    if (current.ui.tooltipContent) current.ui.tooltipContent.textContent = list;
    updateTooltipPosition();
}

function translateRole(role) {
    const map = { 'writer':'Escritor', 'composer':'Compositor', 'lyricist':'Letrista', 'producer':'Productor', 'co-producer':'Coproductor', 'arranger':'Arreglista', 'engineer':'Ingeniero', 'audio engineer':'Ingeniero de sonido', 'mixing engineer':'Ingeniero de mezclado', 'mastering engineer':'Ingeniero de mastering', 'remixer':'Remixer', 'conductor':'Director', 'performer':'Intérprete' };
    return map[role.toLowerCase()] || role;
}

// Tooltip
function updateTooltipPosition() {
    if (!computePosition || !offset || !flip) return;
    const ref = current.ui.credits; const tip = current.ui.tooltip;
    if (!ref || !tip) return;
    tip.style.opacity = '0';
    computePosition(ref, tip, { placement: 'top', strategy: 'absolute', middleware: [offset(8), flip()] })
        .then(({x, y}) => { tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.opacity = '1'; });
}

window.addEventListener('resize', () => {
    if (timers.resizeDebounce) clearTimeout(timers.resizeDebounce);
    timers.resizeDebounce = setTimeout(updateTooltipPosition, 100);
});

// Portada
function displayAlbumCoverFromUrl(url) {
    if (!url) { resetAlbumCover(); return; }
    const protocol = url.split('://')[0];
    if (!['http', 'https'].includes(protocol)) { resetAlbumCover(); return; }
    const albumCover = document.getElementById('albumCover');
    if (!albumCover) return;
    albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function () {
        const placeholder = albumCover.querySelector('.album-cover-placeholder');
        if (placeholder) { placeholder.style.opacity = '0'; placeholder.style.pointerEvents = 'none'; setTimeout(() => { if (placeholder.parentNode === albumCover) placeholder.remove(); }, 300); }
        displayAlbumCover(this);
    };
    img.onerror = () => { resetAlbumCover(); };
    img.src = url;
}

function displayAlbumCover(img) {
    const albumCover = document.getElementById('albumCover');
    if (!albumCover) return;
    albumCover.innerHTML = '';
    const displayImg = document.createElement('img');
    displayImg.src = img.src; displayImg.alt = 'Portada del álbum'; displayImg.classList.add('loaded');
    albumCover.appendChild(displayImg);
}

function resetAlbumCover() {
    const albumCover = document.getElementById('albumCover');
    if (!albumCover) return;
    albumCover.innerHTML = `
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

// Album Details
function updateAlbumDetailsWithSpotifyData(d) {
    const el = document.getElementById('releaseDate');
    if (el) el.innerHTML = '';
    if (d?.release_date) {
        const y = d.release_date.substring(0, 4);
        let t = y;
        if (d?.albumTypeDescription && d.albumTypeDescription !== 'Álbum') t += ` (${d.albumTypeDescription})`;
        if (el) el.textContent = t;
    } else if (el) el.textContent = '----';
    const recordLabel = document.getElementById('recordLabel');
    if (recordLabel) recordLabel.textContent = d?.label?.trim() ? d.label : '----';
    const albumTrackCount = document.getElementById('albumTrackCount');
    if (albumTrackCount) albumTrackCount.textContent = d?.totalTracks ? d.totalTracks : '--';
    const albumTotalDuration = document.getElementById('albumTotalDuration');
    if (d?.totalAlbumDuration) {
        let s = d.totalAlbumDuration;
        if (s > 10000) s = Math.floor(s / 1000);
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        if (albumTotalDuration) albumTotalDuration.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    } else if (albumTotalDuration) albumTotalDuration.textContent = '--:--';
    const trackGenre = document.getElementById('trackGenre');
    if (trackGenre) trackGenre.textContent = d?.genres?.length ? d.genres.slice(0, 2).join(', ') : '--';
    const trackPosition = document.getElementById('trackPosition');
    if (trackPosition) trackPosition.textContent = d?.trackNumber && d?.totalTracks ? `Track ${d.trackNumber}/${d.totalTracks}` : '--/--';
    const isrcEl = document.getElementById('trackIsrc');
    if (isrcEl) isrcEl.textContent = d?.isrc?.trim() ? d.isrc.toUpperCase() : '----';
}

function resetAlbumDetails() {
    const releaseDate = document.getElementById('releaseDate');
    if (releaseDate) releaseDate.textContent = '----';
    const recordLabel = document.getElementById('recordLabel');
    if (recordLabel) recordLabel.textContent = '----';
    const albumTrackCount = document.getElementById('albumTrackCount');
    if (albumTrackCount) albumTrackCount.textContent = '--';
    const albumTotalDuration = document.getElementById('albumTotalDuration');
    if (albumTotalDuration) albumTotalDuration.textContent = '--:--';
    const trackGenre = document.getElementById('trackGenre');
    if (trackGenre) trackGenre.textContent = '--';
    const trackPosition = document.getElementById('trackPosition');
    if (trackPosition) trackPosition.textContent = '--/--';
    const isrcEl = document.getElementById('trackIsrc');
    if (isrcEl) isrcEl.textContent = '----';
    if (current.ui.credits) current.ui.credits.textContent = '--';
}

// Favoritos
function getFavorites() { return storage.favorites.get(); }
function saveFavorites(list) { storage.favorites.set(list); }
function updateFavoriteButtonUI(id, fav) {
    const btn = document.querySelector(`.favorite-btn[data-station-id="${id}"]`);
    if (!btn) return;
    const name = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
    if (fav) { btn.innerHTML = '★'; btn.classList.add('is-favorite'); btn.setAttribute('aria-label', `Quitar ${name} de favoritos`); }
    else { btn.innerHTML = '☆'; btn.classList.remove('is-favorite'); btn.setAttribute('aria-label', `Añadir ${name} a favoritos`); }
}
function addFavorite(id) {
    const favs = getFavorites();
    if (!favs.includes(id)) { favs.push(id); saveFavorites(favs); updateFavoriteButtonUI(id, true); showNotification('Estación añadida'); }
}
function removeFavorite(id) {
    const favs = getFavorites().filter(fid => fid !== id); saveFavorites(favs); updateFavoriteButtonUI(id, false); showNotification('Estación eliminada'); }
function filterStationsByFavorites() {
    const favs = getFavorites();
    document.querySelectorAll('.custom-option').forEach(opt => { opt.style.display = favs.includes(opt.dataset.value) ? 'block' : 'none'; });
    document.querySelectorAll('.custom-optgroup-label').forEach(label => {
        let has = false; let next = label.nextElementSibling;
        while (next && next.classList.contains('custom-option')) { if (next.style.display !== 'none') { has = true; break; } next = next.nextElementSibling; }
        label.style.display = has ? 'block' : 'none';
    });
}
function showAllStations() { document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(el => el.style.display = ''); }

// Custom Select
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
                label.className = 'custom-optgroup-label'; label.textContent = child.label;
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
        nameEl.className = 'custom-option-name'; nameEl.textContent = name;
        details.appendChild(nameEl);
        if (desc) {
            const descEl = document.createElement('span');
            descEl.className = 'custom-option-description'; descEl.textContent = desc;
            details.appendChild(descEl);
        }
        if (tags.length > 0) {
            const tagContainer = document.createElement('div');
            tagContainer.className = 'station-tags-container';
            tags.forEach(t => {
                const tagEl = document.createElement('span');
                tagEl.className = 'station-tag'; tagEl.textContent = t; tagContainer.appendChild(tagEl);
            });
            details.appendChild(tagContainer);
        }
        container.appendChild(details);
        const favBtn = document.createElement('button');
        favBtn.className = 'favorite-btn'; favBtn.innerHTML = '☆';
        favBtn.dataset.stationId = option.value;
        favBtn.setAttribute('aria-label', `Añadir ${name} a favoritos`);
        favBtn.addEventListener('click', (e) => { e.stopPropagation(); const sid = e.target.dataset.stationId; if (e.target.classList.contains('is-favorite')) removeFavorite(sid); else addFavorite(sid); });
        container.appendChild(favBtn);
        if (promos.length > 0) {
            const promosContainer = document.createElement('div');
            promosContainer.className = 'station-promotions-container';
            promos.forEach(p => {
                const link = document.createElement('a');
                link.href = p.url; link.textContent = p.text;
                link.className = `station-promotion-link station-promotion-link-${p.type}`;
                link.target = '_blank'; link.rel = 'noopener noreferrer';
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

// UI
function updateUIWithTrackInfo(t) {
    const title = document.getElementById('songTitle');
    const artist = document.getElementById('songArtist');
    const album = document.getElementById('songAlbum');
    if (title && title.textContent !== t.title) title.textContent = t.title;
    if (artist && artist.textContent !== t.artist) artist.textContent = t.artist;
    if (album) album.textContent = t.album ? `(${t.album})` : '';
    updateShareButtonVisibility();
}

function resetUI() {
    const title = document.getElementById('songTitle');
    const artist = document.getElementById('songArtist');
    const album = document.getElementById('songAlbum');
    if (title) title.textContent = 'Seleccionar estación';
    if (artist) artist.textContent = '';
    if (album) album.textContent = '';
    updateShareButtonVisibility();
}

function updateShareButtonVisibility() {
    const title = document.getElementById('songTitle')?.textContent || '';
    const artist = document.getElementById('songArtist')?.textContent || '';
    const btn = document.getElementById('shareButton');
    if (!btn) return;
    const ok = title && artist && !['a sonar','Conectando...','Seleccionar estación','A sonar','Reproduciendo...','Error de reproducción','Reconectando...'].includes(title.toLowerCase());
    btn.classList.toggle('visible', ok);
}

function updateStatus(now) {
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = now ? '⏸ PAUSAR' : '▶ SONAR';
}

// Play/Stop
async function playStation() {
    if (!current.station) { alert('Por favor, seleccionar una estación'); return; }
    await joinStation(current.station.id);
    const audio = document.getElementById('audioPlayer');
    if (!audio) return;
    audio.src = current.station.url;
    try {
        await audio.play();
        current.isPlaying = true; updateStatus(true); showPlaybackInfo(); startCountdown();
        if (current.station.service === config.services.somaFm) startPollingSomaFM();
        else if (current.station.service === config.services.radioParadise) startPollingRadioParadise();
        else if (current.station.service === config.services.nrk) handleNrkMetadata();
        clearStuckCheck();
        timers.stuck = setInterval(() => {
            if (current.isPlaying && audio.paused && audio.currentTime > 0) handlePlaybackError();
        }, 3000);
    } catch (e) { handlePlaybackError(); }
}

function stopStation() {
    const audio = document.getElementById('audioPlayer');
    if (audio) { audio.pause(); audio.src = ''; }
    leaveStation(current.stationId);
    current.isPlaying = false; current.station = null; current.stationId = null;
    clearCountdown(); clearPolling(); clearStuckCheck();
    resetUI(); updateStatus(false); showWelcomeScreen();
}

function clearStuckCheck() { if (timers.stuck) { clearInterval(timers.stuck); timers.stuck = null; } }

function handlePlaybackError() {
    const audio = document.getElementById('audioPlayer');
    current.isPlaying = false; updateStatus(false);
    if (audio) { audio.pause(); }
    clearStuckCheck(); clearCountdown(); clearPolling();
    current.trackInfo = null; resetAlbumCover(); resetAlbumDetails();
    showWelcomeScreen();
    const title = document.getElementById('songTitle');
    const artist = document.getElementById('songArtist');
    const album = document.getElementById('songAlbum');
    if (title) title.textContent = 'Reconectando...';
    if (artist) artist.textContent = 'La reproducción se reanudará automáticamente.';
    if (album) album.textContent = '';
    updateShareButtonVisibility();
    if (!timers.audioCheck) {
        timers.audioCheck = setInterval(async () => {
            if (audio && !audio.paused && audio.currentTime > 0) {
                current.isPlaying = true; clearStuckCheck(); clearInterval(timers.audioCheck); timers.audioCheck = null;
                showPlaybackInfo();
                if (current.station.service === config.services.somaFm) startPollingSomaFM();
                else if (current.station.service === config.services.radioParadise) startPollingRadioParadise();
                updateSongInfo(true);
            }
        }, 1000);
    }
}

// Visual State
function showWelcomeScreen() {
    const welcome = document.getElementById('welcomeScreen');
    const info = document.getElementById('playbackInfo');
    const playerHeader = document.querySelector('.player-header');
    if (welcome) welcome.style.display = 'flex';
    if (info) info.style.display = 'none';
    if (playerHeader) playerHeader.classList.add('hidden');
}
function showPlaybackInfo() {
    const welcome = document.getElementById('welcomeScreen');
    const info = document.getElementById('playbackInfo');
    const playerHeader = document.querySelector('.player-header');
    if (welcome) welcome.style.display = 'none';
    if (info) info.style.display = 'flex';
    if (playerHeader) playerHeader.classList.remove('hidden');
}

// Volumen
function loadVolume() {
    const v = storage.volume.get();
    const slider = document.getElementById('volumeSlider');
    const icon = document.getElementById('volumeIcon');
    if (!slider) return;
    slider.value = v;
    if (icon) icon.classList.toggle('muted', v === '0');
    current.previousVolume = v;
    updateVolumeIconPosition();
}
function saveVolume() {
    const slider = document.getElementById('volumeSlider');
    if (!slider) return;
    storage.volume.set(slider.value);
}

function updateVolumeIconPosition() {
    const slider = document.getElementById('volumeSlider');
    const icon = document.getElementById('volumeIcon');
    if (!slider || !icon) return;
    const w = slider.offsetWidth;
    const p = slider.value / slider.max;
    const iw = icon.offsetWidth;
    icon.style.left = `${p * w - (iw / 2)}px`;
}

// Share
function shareOnWhatsApp() {
    const title = document.getElementById('songTitle')?.textContent || '';
    const artist = document.getElementById('songArtist')?.textContent || '';
    if (!title || !artist || ['a sonar','Conectando...','Seleccionar estación','A sonar','Reproduciendo...','Error de reproducción','Reconectando...'].includes(title.toLowerCase())) {
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

// Install PWA
function showInstallInvitation() {
    if (window.matchMedia('(display-mode: standalone)').matches || storage.pwaDismissed()) return;
    let os = 'other';
    if (/android/i.test(navigator.userAgent)) os = 'android';
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) os = 'ios';
    else if (/win/i.test(navigator.userAgent)) os = 'windows';
    const inv = document.getElementById('install-pwa-invitation');
    if (!inv) return;
    inv.style.display = 'flex';
    [document.getElementById('install-windows'), document.getElementById('install-android'), document.getElementById('install-ios')].forEach(btn => btn.classList.add('disabled'));
    const activeBtn = os === 'android' ? document.getElementById('install-android') : (os === 'ios' ? document.getElementById('install-ios') : (os === 'windows' ? document.getElementById('install-windows') : null));
    if (activeBtn) activeBtn.classList.remove('disabled');
}
function hideInstallInvitation() {
    const inv = document.getElementById('install-pwa-invitation');
    if (inv) inv.style.display = 'none';
    localStorage.setItem(config.storage.pwaDismissed, 'true');
}

// Notification
function showNotification(message) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = message; n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 3000);
}

// Utils
function extractDateFromUrl(url) {
    const m = url.match(/nrk_radio_klassisk_natt_(\d{8})_/);
    return m ? `${m[1].substring(6, 8)}-${m[1].substring(4, 6)}-${m[1].substring(0, 4)}` : 'Fecha desconocida';
}

// Load Stations
let stationsById = {};
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
        const select = document.getElementById('stationSelect');
        const name = document.getElementById('stationName');
        if (loading) loading.style.display = 'none';
        if (select) select.style.display = 'block';
        if (name) name.textContent = 'RadioMax';
        populateStationSelect(grouped);
        const customSelect = new CustomSelect(select);
        const favs = getFavorites();
        favs.forEach(id => updateFavoriteButtonUI(id, true));
        const last = storage.station.get();
        if (last && stationsById[last]) {
            select.value = last; customSelect.updateTriggerText(); customSelect.updateSelectedOption();
            setTimeout(() => { const sel = customSelect.customOptions.querySelector('.custom-option.selected'); if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 100);
            const st = stationsById[last];
            if (st) { current.station = st; name.textContent = st.service === config.services.radioParadise ? st.name.split(' - ')[1] || st.name : st.name; }
        }
        if (current.station) {
            const audio = document.getElementById('audioPlayer');
            if (audio) audio.src = current.station.url;
            const title = document.getElementById('songTitle');
            const artist = document.getElementById('songArtist');
            const album = document.getElementById('songAlbum');
            if (title) title.textContent = 'A sonar';
            if (artist) artist.textContent = '';
            if (album) album.textContent = '';
            updateShareButtonVisibility();
            updateStatus(false);
        }
        showWelcomeScreen();
    } catch (e) {
        const loading = document.getElementById('loadingStations');
        if (loading) { loading.textContent = 'Error al cargar estaciones. Recarga.'; loading.style.color = '#ff6600'; }
        logErrorForAnalysis('Load error', { error: e.message, timestamp: new Date().toISOString() });
    }
}

function populateStationSelect(grouped) {
    const select = document.getElementById('stationSelect');
    if (!select) return;
    while (select.firstChild) select.removeChild(select.firstChild);
    const def = document.createElement('option');
    def.value = ""; def.textContent = " Seleccionar Estación "; def.disabled = true; def.selected = true;
    select.appendChild(def);
    stationsById = {};
    for (const n in grouped) {
        const grp = document.createElement('optgroup');
        grp.label = n;
        grouped[n].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; stationsById[s.id] = s; grp.appendChild(opt);
        });
        select.appendChild(grp);
    }
}

// Init Events
function initEvents() {
    const select = document.getElementById('stationSelect');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const shareButton = document.getElementById('shareButton');
    const shareOptions = document.getElementById('shareOptions');
    const shareWhatsApp = document.getElementById('shareWhatsApp');
    const closeInvitationBtn = document.getElementById('close-invitation');
    const installWindowsBtn = document.getElementById('install-windows');
    const installAndroidBtn = document.getElementById('install-android');
    const installIosBtn = document.getElementById('install-ios');
    const filterToggleStar = document.getElementById('filterToggleStar');

    if (select) {
        select.addEventListener('change', function() {
            if (this.value) {
                storage.station.set(this.value);
                const st = stationsById[this.value];
                if (st) { current.station = st; document.getElementById('stationName').textContent = st.service === config.services.radioParadise ? st.name.split(' - ')[1] || st.name : st.name; }
                showWelcomeScreen();
                playStation();
            }
        });
    }

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            playBtn.style.animation = '';
            if (current.isPlaying) stopStation();
            else { if (current.station) playStation(); else alert('Por favor, seleccionar una estación'); }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => { stopStation(); });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', function() {
            const v = this.value / 100;
            const audio = document.getElementById('audioPlayer');
            if (audio) audio.volume = v;
            saveVolume();
            updateVolumeIconPosition();
            if (this.value === '0') { volumeIcon.classList.add('muted'); current.isMuted = true; }
            else { volumeIcon.classList.remove('muted'); current.isMuted = false; current.previousVolume = this.value; }
        });
    }

    if (volumeIcon) {
        volumeIcon.addEventListener('click', function() {
            if (current.isMuted) {
                volumeSlider.value = current.previousVolume;
                const audio = document.getElementById('audioPlayer');
                if (audio) audio.volume = current.previousVolume / 100;
                volumeIcon.classList.remove('muted'); current.isMuted = false;
            } else {
                current.previousVolume = volumeSlider.value;
                volumeSlider.value = '0';
                const audio = document.getElementById('audioPlayer');
                if (audio) audio.volume = 0;
                volumeIcon.classList.add('muted'); current.isMuted = true;
            }
            saveVolume();
            updateVolumeIconPosition();
        });
    }

    if (shareButton) {
        shareButton.addEventListener('click', () => shareOptions.classList.toggle('active'));
    }
    document.addEventListener('click', (e) => {
        if (shareButton && shareOptions && !shareButton.contains(e.target) && !shareOptions.contains(e.target)) shareOptions.classList.remove('active');
    });

    if (shareWhatsApp) {
        shareWhatsApp.addEventListener('click', shareOnWhatsApp);
    }

    if (closeInvitationBtn) {
        closeInvitationBtn.addEventListener('click', hideInstallInvitation);
    }
    if (installWindowsBtn) {
        installWindowsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((r) => {
                    if (r.outcome === 'accepted') console.log('User accepted A2HS prompt');
                    else console.log('User dismissed A2HS prompt');
                    deferredPrompt = null;
                });
                hideInstallInvitation();
            } else showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"');
        });
    }
    if (installAndroidBtn) {
        installAndroidBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((r) => {
                    if (r.outcome === 'accepted') console.log('User accepted A2HS prompt');
                    else console.log('User dismissed A2HS prompt');
                    deferredPrompt = null;
                });
                hideInstallInvitation();
            } else showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"');
        });
    }
    if (installIosBtn) {
        installIosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.');
            hideInstallInvitation();
        });
    }

    if (filterToggleStar) {
        filterToggleStar.addEventListener('click', function() {
            const showOnly = !this.classList.contains('active');
            this.classList.toggle('active', showOnly);
            this.setAttribute('aria-label', showOnly ? 'Mostrar todas' : 'Solo favoritas');
            this.title = showOnly ? 'Todas las estaciones' : 'Solo estaciones favoritas';
            if (showOnly) filterStationsByFavorites(); else showAllStations();
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function(event) {
        if (document.querySelector('.custom-select-wrapper.open')) return;
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && /^[a-zA-Z0-9]$/.test(event.key)) {
            event.preventDefault();
            const key = event.key.toLowerCase();
            const matches = [];
            document.querySelectorAll('.custom-option').forEach(opt => {
                const name = opt.querySelector('.custom-option-name').textContent.toLowerCase();
                if (name.startsWith(key)) matches.push(opt);
            });
            if (matches.length > 0) {
                matches[0].scrollIntoView({ block: 'nearest' });
                const id = matches[0].dataset.value;
                const select = document.getElementById('stationSelect');
                if (select) { select.value = id; select.dispatchEvent(new Event('change')); }
            }
        }
    });

    // Tooltip resize
    window.addEventListener('resize', () => {
        if (timers.resizeDebounce) clearTimeout(timers.resizeDebounce);
        timers.resizeDebounce = setTimeout(updateTooltipPosition, 100);
    });

    // Install PWA invitation timer
    if (!storage.pwaDismissed()) {
        timers.installInvitation = setInterval(() => {
            if (!window.matchMedia('(display-mode: standalone)').matches) showInstallInvitation();
        }, 600000);
    }

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            let refreshing = false;
            const un = document.getElementById('update-notification');
            const btn = document.getElementById('update-reload-btn');
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); if (un) un.style.display = 'block'; }
                    reg.addEventListener('updatefound', () => {
                        const nw = reg.installing;
                        nw?.addEventListener('statechange', () => {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) if (un) un.style.display = 'block';
                        });
                    });
                })
                .catch(e => console.error('SW error:', e));
            navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing) { refreshing = true; window.location.reload(); } });
            if (btn) {
                btn.addEventListener('click', () => {
                    if (un) un.style.display = 'none';
                    navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
                    setTimeout(() => window.location.reload(), 100);
                });
            }
        });
    }

    // PWA Buttons
    let deferredPrompt;
    const installPwaBtnAndroid = document.getElementById('install-pwa-btn-android');
    const installPwaBtnIos = document.getElementById('install-pwa-btn-ios');
    function showInstallPwaButtons() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            if (installPwaBtnAndroid) installPwaBtnAndroid.style.display = 'none';
            if (installPwaBtnIos) installPwaBtnIos.style.display = 'none'; return;
        }
        const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        if (isIos) {
            if (installPwaBtnAndroid) installPwaBtnAndroid.style.display = 'none';
            if (installPwaBtnIos) installPwaBtnIos.style.display = 'flex';
        } else {
            if (installPwaBtnAndroid) installPwaBtnAndroid.style.display = 'flex';
            if (installPwaBtnIos) installPwaBtnIos.style.display = 'none';
        }
    }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstallPwaButtons(); });
    if (installPwaBtnAndroid) {
        installPwaBtnAndroid.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!deferredPrompt) { showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"'); return; }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') { if (installPwaBtnAndroid) installPwaBtnAndroid.style.display = 'none'; }
            deferredPrompt = null;
        });
    }
    if (installPwaBtnIos) {
        installPwaBtnIos.addEventListener('click', (e) => { e.preventDefault(); showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.'); });
    }
    setTimeout(showInstallPwaButtons, 1000);
}

// Log Error
function logErrorForAnalysis(type, details) {
    console.error(`Error logged: ${type}`, details);
}

// Version
fetch('/sw.js')
    .then(r => { if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`); return r.text(); })
    .then(t => {
        const m = t.match(/^(?:\/\/\s*)?v?(\d+(?:\.\d+){1,2})/m);
        const v = m && m[1] ? m[1] : 'N/D';
        const versionSpan = document.getElementById('version-number');
        if (versionSpan) versionSpan.textContent = v;
    })
    .catch(e => console.error('Error loading sw version:', e));

// Main
(async () => {
    try {
        await loadModules();
        await loadStations();
        loadVolume();
        initEvents();
    } catch (error) {
        console.error("Error fatal:", error);
        const le = document.getElementById('loadingStations');
        if (le) { le.textContent = `Error crítico: ${error.message}.`; le.style.color = '#ff6600'; }
    }
})();
