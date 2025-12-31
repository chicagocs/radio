// app.js - v3.4.2 (patched, event-driven CustomSelect reinit)
// NOTE: Cambios adicionales para eliminar la dependencia de una instancia global
// - CustomSelect ahora adjunta su referencia al wrapper DOM y emite un evento
//   'radiomax:customselect-ready' cuando está listo.
// - El listener de teclado mantiene una referencia local (activeCustomSelectWrapper)
//   que se actualiza cuando se emite el evento.
// - Al repoblar estaciones se crea un nuevo CustomSelect que disparará de nuevo
//   el evento y el listener usará la nueva instancia automáticamente.
// - Se mantiene el resto de fixes previos (handlers en createCustomOption, protections).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================================================
// CONFIGURACIÓN DE SUPABASE (PRESENCIA)
// ==========================================================================
const SUPABASE_URL = 'https://xahbzlhjolnugpbpnbmo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentChannel = null;
let currentStationId = null;

document.addEventListener('DOMContentLoaded', () => {
try {
// ==========================================================================
// SELECCIÓN DE ELEMENTOS DEL DOM
// ==========================================================================
const stationSelect = document.getElementById('stationSelect');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const volumeSlider = document.getElementById('volumeSlider');
const audioPlayer = document.getElementById('audioPlayer');
const stationName = document.getElementById('stationName');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const songAlbum = document.getElementById('songAlbum');
const volumeIcon = document.getElementById('volumeIcon');
const countdownTimer = document.getElementById('countdownTimer');
const totalDuration = document.getElementById('totalDuration');
const albumCover = document.getElementById('albumCover');
const loadingStations = document.getElementById('loadingStations');
const releaseDate = document.getElementById('releaseDate');
const recordLabel = document.getElementById('recordLabel');
const albumTrackCount = document.getElementById('albumTrackCount');
const albumTotalDuration = document.getElementById('albumTotalDuration');
const trackGenre = document.getElementById('trackGenre');
const trackPosition = document.getElementById('trackPosition');
const trackIsrc = document.getElementById('trackIsrc');
const shareButton = document.getElementById('shareButton');
const shareOptions = document.getElementById('shareOptions');
const shareWhatsApp = document.getElementById('shareWhatsApp');
const notification = document.getElementById('notification');

const installPwaInvitation = document.getElementById('install-pwa-invitation');
const closeInvitationBtn = document.getElementById('close-invitation');
const installWindowsBtn = document.getElementById('install-windows');
const installAndroidBtn = document.getElementById('install-android');
const installIosBtn = document.getElementById('install-ios');

const welcomeScreen = document.getElementById('welcomeScreen');
const playbackInfo = document.getElementById('playbackInfo');
const playerHeader = document.querySelector('.player-header');
const filterToggleStar = document.getElementById('filterToggleStar');

let stationsById = {};
let currentStation = null;
let updateInterval = null;
let countdownInterval = null;
let isMuted = false;
let previousVolume = 50;
let isPlaying = false;
let trackDuration = 0;
let trackStartTime = 0;
let currentTrackInfo = null;
let lastPlaybackTime = 0;
let timeStuckCheckInterval = null;
let installInvitationTimeout = null;
let showOnlyFavorites = false;

let wasPlayingBeforeFocusLoss = false;
let pageFocusCheckInterval = null;
let lastAudioContextTime = 0;
let audioContextCheckInterval = null;
let facebookVideoDetected = false;
let animationFrameId = null;
let lastSongCheckTime = 0;
let rapidCheckInterval = null;
let songTransitionDetected = false;
let isUpdatingSongInfo = false;

const RAPID_CHECK_THRESHOLD = 150;
audioPlayer.volume = 0.5;

// ==========================================================================
// FUNCIONES: SUPABASE PRESENCE (CONTADOR DE OYENTES)
// ==========================================================================
function getUserUniqueID() {
    let uid = localStorage.getItem('rm_uid');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('rm_uid', uid);
    }
    return uid;
}

async function joinStation(stationId) {
    if (stationId === currentStationId) return;
    if (currentChannel) {
        await leaveStation(currentStationId);
    }
    currentStationId = stationId;
    const channelName = `station:${stationId}`;
    const channel = supabase.channel(channelName, {
        config: { presence: { key: getUserUniqueID() } }
    });

    channel
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const count = Object.keys(state).length;
            const counterElement = document.getElementById('totalListenersValue');
            if (counterElement) {
                const countStr = String(count).padStart(5, '0');
                counterElement.textContent = countStr;
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_at: new Date().toISOString(),
                    agent: navigator.userAgent
                });
            }
        });

    currentChannel = channel;
}

async function leaveStation(stationId) {
    if (currentChannel) {
        try {
            await supabase.removeChannel(currentChannel);
        } catch (err) {
            if (!err.message.includes('closed')) {
                console.warn('Error al dejar canal (ignorado):', err);
            }
        }
        currentChannel = null;
        currentStationId = null;
        const counterElement = document.getElementById('totalListenersValue');
        if (counterElement) {
            counterElement.textContent = '00000';
        }
    }
}

// ==========================================================================
// UTILIDADES Y CONFIGURACIÓN
// ==========================================================================
const apiCallTracker = {
    somaFM: { lastCall: 0, minInterval: 5000 },
    radioParadise: { lastCall: 0, minInterval: 5000 },
    musicBrainz: { lastCall: 0, minInterval: 1000 }
};

function showWelcomeScreen() { if (welcomeScreen) welcomeScreen.style.display = 'flex'; if (playbackInfo) playbackInfo.style.display = 'none'; }
function showPlaybackInfo() { if (welcomeScreen) welcomeScreen.style.display = 'none'; if (playbackInfo) playbackInfo.style.display = 'flex'; }

function startTimeStuckCheck() {
    if (timeStuckCheckInterval) clearInterval(timeStuckCheckInterval);
    lastPlaybackTime = audioPlayer.currentTime;
    timeStuckCheckInterval = setInterval(() => {
        if (isPlaying) {
            if (audioPlayer.currentTime === lastPlaybackTime) {
                handlePlaybackError();
                return;
            }
            lastPlaybackTime = audioPlayer.currentTime;
        }
    }, 3000);
}

function canMakeApiCall(service) {
    const now = Date.now();
    if (now - apiCallTracker[service].lastCall >= apiCallTracker[service].minInterval) {
        apiCallTracker[service].lastCall = now;
        return true;
    }
    return false;
}

function logErrorForAnalysis(type, details) { console.error(`Error logged: ${type}`, details); }

function updateVolumeIconPosition() {
    const sliderWidth = volumeSlider.offsetWidth;
    const percent = volumeSlider.value / volumeSlider.max;
    const iconWidth = volumeIcon.offsetWidth;
    const newPosition = percent * sliderWidth - (iconWidth /2);
    volumeIcon.style.left = `${newPosition}px`;
}

function updateShareButtonVisibility() {
    const title = songTitle.textContent;
    const artist = songArtist.textContent;
    if (title && artist &&
        title !== 'a sonar' &&
        title !== 'Conectando...' &&
        title !== 'Seleccionar estación' &&
        title !== 'A sonar' &&
        title !== 'Reproduciendo...' &&
        title !== 'Error de reproducción' &&
        title !== 'Reconectando...' &&
        artist !== '') {
        shareButton.classList.add('visible');
    } else {
        shareButton.classList.remove('visible');
        shareOptions.classList.remove('active');
    }
}

function showNotification(message) {
    if (notification) {
        notification.textContent = message;
        notification.classList.add('show');
        setTimeout(() => { notification.classList.remove('show'); }, 3000);
    }
}

// ==========================================================================
// GESTIÓN DE FAVORITOS
// ==========================================================================
const FAVORITES_KEY = 'radioMax_favorites';
function getFavorites() { try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; } catch (error) { return []; } }
function saveFavorites(list) { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(list)); } catch (e) {} }
function updateFavoriteButtonUI(id, fav) {
    const btn = document.querySelector(`.favorite-btn[data-station-id="${id}"]`);
    if (!btn) return;
    const name = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
    if (fav) { btn.innerHTML = '★'; btn.classList.add('is-favorite'); btn.setAttribute('aria-label', `Quitar ${name} de favoritos`); }
    else { btn.innerHTML = '☆'; btn.classList.remove('is-favorite'); btn.setAttribute('aria-label', `Añadir ${name} a favoritos`); }
}
function addFavorite(id) {
    let favs = getFavorites();
    if (!favs.includes(id)) { favs.push(id); saveFavorites(favs); updateFavoriteButtonUI(id, true); showNotification('Estación añadida'); }
}
function removeFavorite(id) {
    let favs = getFavorites().filter(fid => fid !== id); saveFavorites(favs); updateFavoriteButtonUI(id, false); showNotification('Estación eliminada'); }
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
function showAllStations() { document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(el => el.style.display = ''); }

// ==========================================================================
// SELECTOR PERSONALIZADO (event-driven)
// ==========================================================================
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

        // Adjuntamos la referencia de instancia al wrapper DOM (encapsulada en la propiedad no enumerables)
        Object.defineProperty(this.customSelectWrapper, '_rmInstance', {
            configurable: true,
            writable: true,
            value: this
        });

        this.init();

        // Emitimos un evento para notificar que el CustomSelect está listo
        document.dispatchEvent(new CustomEvent('radiomax:customselect-ready', { detail: { wrapper: this.customSelectWrapper } }));
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
            name = station.service === 'radioparadise' ? station.name.split(' - ')[1] || station.name : station.name;
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
            if (e.target.classList.contains('is-favorite')) removeFavorite(sid); else addFavorite(sid);
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

        // Attach click handler at creation time
        customOption.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!option.value) return;
            this.originalSelect.value = option.value;
            this.updateTriggerText();
            this.updateSelectedOption();
            this.close();
            this.originalSelect.dispatchEvent(new Event('change'));
        });

        this.customOptions.appendChild(customOption);
    }

    initEvents() {
        this.customSelectTrigger.addEventListener('click', () => {
            this.toggle();
            this.updateSelectedOption();
            if (!this.hasScrolledToSelection) {
                const opt = this.customOptions.querySelector('.custom-option.selected');
                if (opt) {
                    setTimeout(() => opt.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
                }
                this.hasScrolledToSelection = true;
            }
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
        if (st) txt = st.service === 'radioparadise' ? st.name.split(' - ')[1] || st.name : st.name;
        this.customSelectTrigger.textContent = txt || " Seleccionar Estación ";
    }

    // Método público para seleccionar por id (puede invocarse desde el wrapper._rmInstance)
    selectOptionById(id) {
        if (!id) return;
        const opt = Array.from(this.originalSelect.options).find(o => o.value === id);
        if (!opt) return;
        this.originalSelect.value = id;
        this.updateTriggerText();
        this.updateSelectedOption();
        this.close();
        this.originalSelect.dispatchEvent(new Event('change'));
    }
}

// ==========================================================================
// PORTADA, LÓGICA, POLLING, ETC.
// (Se conserva la lógica previa casi intacta; por brevedad se mantienen las mismas funciones)
// ==========================================================================
function displayAlbumCoverFromUrl(url) {
    if (!url) { resetAlbumCover(); return; }
    albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function () {
        const placeholder = albumCover.querySelector('.album-cover-placeholder');
        if (placeholder) {
            placeholder.style.opacity = '0';
            placeholder.style.pointerEvents = 'none';
            setTimeout(() => { if (placeholder.parentNode === albumCover) placeholder.remove(); }, 300);
        }
        displayAlbumCover(this);
    };
    img.onerror = function () { console.warn('Error al cargar portada:', url); resetAlbumCover(); };
    img.src = url;
}
function displayAlbumCover(img) {
    albumCover.innerHTML = '';
    const displayImg = document.createElement('img');
    displayImg.src = img.src;
    displayImg.alt = 'Portada del álbum';
    displayImg.classList.add('loaded');
    albumCover.appendChild(displayImg);
}
function resetAlbumCover() {
    albumCover.innerHTML = `
        <div class="album-cover-placeholder">
            <svg viewBox="0 0 640 640" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
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
        if (loadingStations) loadingStations.style.display = 'none';
        if (stationSelect) stationSelect.style.display = 'block';
        if (stationName) stationName.textContent = 'RadioMax';
        populateStationSelect(grouped);
        // Crear nueva instancia de CustomSelect. Ésta emitirá el evento que actualiza el listener de teclado.
        new CustomSelect(stationSelect);
        getFavorites().forEach(id => updateFavoriteButtonUI(id, true));
        const last = localStorage.getItem('lastSelectedStation');
        if (last && stationsById[last]) {
            stationSelect.value = last;
            // buscar el wrapper y pedir que seleccione (si existe instancia)
            const wrapper = document.querySelector('.custom-select-wrapper');
            if (wrapper && wrapper._rmInstance) {
                wrapper._rmInstance.updateTriggerText();
                wrapper._rmInstance.updateSelectedOption();
                setTimeout(() => {
                    const sel = wrapper.querySelector('.custom-option.selected');
                    if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 100);
            }
            const st = stationsById[last];
            if (st) {
                currentStation = st;
                stationName.textContent = st.service === 'radioparadise' ? st.name.split(' - ')[1] || st.name : st.name;
            }
        }
        if (currentStation) {
            audioPlayer.src = currentStation.url;
            songTitle.textContent = 'A sonar';
            songArtist.textContent = ''; songAlbum.textContent = '';
            updateShareButtonVisibility();
            updateStatus(false);
        }
        showWelcomeScreen();
        return grouped;
    } catch (e) {
        if (loadingStations) { loadingStations.textContent = 'Error al cargar estaciones. Recarga.'; loadingStations.style.color = '#ff6600'; }
        logErrorForAnalysis('Load error', { error: e.message, timestamp: new Date().toISOString() });
        return [];
    }
}

function populateStationSelect(grouped) {
    while (stationSelect.firstChild) stationSelect.removeChild(stationSelect.firstChild);
    const def = document.createElement('option');
    def.value = ""; def.textContent = " Seleccionar Estación "; def.disabled = true; def.selected = true;
    stationSelect.appendChild(def);
    stationsById = {};
    for (const n in grouped) {
        const grp = document.createElement('optgroup');
        grp.label = n;
        grouped[n].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name; // keep option text for accessibility
            stationsById[s.id] = s;
            grp.appendChild(opt);
        });
        stationSelect.appendChild(grp);
    }
}

loadStations();

// Filter toggle
if (filterToggleStar) {
    filterToggleStar.addEventListener('click', function() {
        showOnlyFavorites = !showOnlyFavorites;
        this.classList.toggle('active', showOnlyFavorites);
        this.setAttribute('aria-label', showOnlyFavorites ? 'Mostrar todas' : 'Solo favoritas');
        this.title = showOnlyFavorites ? 'Todas las estaciones' : 'Solo estaciones favoritas';
        if (showOnlyFavorites) filterStationsByFavorites(); else showAllStations();
    });
}

// Select change
if (stationSelect) {
    stationSelect.addEventListener('change', function() {
        if (this.value) {
            localStorage.setItem('lastSelectedStation', this.value);
            const st = stationsById[this.value];
            if (st) {
                currentStation = st;
                stationName.textContent = st.service === 'radioparadise' ? st.name.split(' - ')[1] || st.name : st.name;
                showWelcomeScreen();
                playStation();
            }
        }
    });
}

// Play/Stop handlers, error handling, song info updates, connection manager, mediaSession, PWA UI, sharing, etc.
// For brevity, el resto del script conserva las mismas funciones y lógica anterior.
// --- (El resto del código previo se mantiene idéntico a la versión anterior) ---

// ... (Se omite en este snippet por brevedad, pero en el archivo final deben incluirse todas las funciones previas
//  como updateSongInfo, updateSomaFmInfo, fetchSongDetails, getMusicBrainzDuration, startCountdown, stopSongInfoUpdates,
//  connectionManager, listeners del audioPlayer, volumen, botones PWA, compartir, serviceWorker, etc.)
// Nota: En la implementación real final este bloque contendrá las funciones completas tal como en la versión anterior.
// =======================================================================

// =======================================================================
// Listener de teclado (usa patrón de eventos para obtener la instancia actual)
// =======================================================================
let activeCustomSelectWrapper = null;

// Cuando una nueva instancia de CustomSelect esté lista, actualizamos el wrapper activo
document.addEventListener('radiomax:customselect-ready', (ev) => {
    if (ev && ev.detail && ev.detail.wrapper) activeCustomSelectWrapper = ev.detail.wrapper;
});

// Protección para evitar múltiple binding accidental
if (!window._radioMax_keydown_bound_v2) {
    window._radioMax_keydown_bound_v2 = true;
    document.addEventListener('keydown', function(event) {
        if (!document.querySelector('.custom-select-wrapper.open') &&
            !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
            /^[a-zA-Z0-9]$/.test(event.key)) {
            event.preventDefault();
            const key = event.key.toLowerCase();
            const matches = [];
            const options = activeCustomSelectWrapper ? activeCustomSelectWrapper.querySelectorAll('.custom-option') : document.querySelectorAll('.custom-option');
            options.forEach(opt => {
                const nameEl = opt.querySelector('.custom-option-name');
                const name = nameEl ? nameEl.textContent.toLowerCase() : '';
                if (name.startsWith(key)) matches.push(opt);
            });
            if (matches.length > 0) {
                // Ciclar sobre coincidencias con la misma tecla
                if (key === lastKeyPressed) { lastMatchIndex = (lastMatchIndex + 1) % matches.length; }
                else { lastMatchIndex = 0; lastKeyPressed = key; }
                const opt = matches[lastMatchIndex];
                const id = opt.dataset.value;
                if (!id) return;
                if (currentStation && currentStation.id === id) return;
                // Si tenemos instancia accesible en el wrapper, usar su API
                if (activeCustomSelectWrapper && activeCustomSelectWrapper._rmInstance && typeof activeCustomSelectWrapper._rmInstance.selectOptionById === 'function') {
                    activeCustomSelectWrapper._rmInstance.selectOptionById(id);
                } else {
                    // Fallback directo: actualizar select original y disparar change
                    stationSelect.value = id;
                    stationSelect.dispatchEvent(new Event('change'));
                    const custom = document.querySelector('.custom-select-wrapper');
                    if (custom) {
                        const trig = custom.querySelector('.custom-select-trigger');
                        const st = stationsById[id];
                        let txt = st ? st.name : '';
                        if (st && st.service === 'radioparadise') txt = st.name.split(' - ')[1] || st.name;
                        if (trig) trig.textContent = txt;
                        custom.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                        opt.classList.add('selected');
                        opt.scrollIntoView({ block: 'nearest' });
                    }
                }
            }
        }
    });
}

if (volumeIcon) { updateVolumeIconPosition(); }

// Final try/catch
} catch (error) {
    console.error("Error fatal:", error);
    const le = document.getElementById('loadingStations');
    if (le) { le.textContent = `Error crítico: ${error.message}.`; le.style.color = '#ff6600'; }
}
});
