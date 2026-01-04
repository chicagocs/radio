// app.js - v3.5.1
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {computePosition} from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.4/+esm';

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
const trackCredits = document.getElementById('trackCredits');
const shareButton = document.getElementById('shareButton');
const shareOptions = document.getElementById('shareOptions');
const shareWhatsApp = document.getElementById('shareWhatsApp');
const notification = document.getElementById('notification');

// --- NUEVO: ELEMENTO TIMER ---
const timerButton = document.getElementById('timerButton');

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

// --- NUEVA VARIABLE GLOBALES PARA COUNTDOWN MEJORADO Y TIMER ---
let lastKnownTrackId = null; // Para detectar cambios reales de canción por ID único
let countdownState = {
    isRunning: false,
    lastUpdateTime: 0,
    estimatedEndTime: 0
};
let autoStopEnabled = false; // Estado del temporizador

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
    // FIX: Chequeo inicial para evitar subscripciones dobles o nulas
    if (stationId === currentStationId) return;

    // Si hay un canal activo y el ID es diferente, salir primero (limpieza atómica)
    if (currentChannel) {
        await leaveStation(currentStationId);
    }
    
    // Asignar ID inmediatamente para evitar race conditions con llamadas rápidas externas
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
        // FIX: Try-catch para evitar errores en consola al desconectar canales durante cambios rápidos
        try {
            await supabase.removeChannel(currentChannel);
        } catch (err) {
            // Ignoramos errores de "WebSocket closed" durante cambios rápidos de estación
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

function showWelcomeScreen() {
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (playbackInfo) playbackInfo.style.display = 'none';
}

function showPlaybackInfo() {
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (playbackInfo) playbackInfo.style.display = 'flex';
}

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

function logErrorForAnalysis(type, details) {
    console.error(`Error logged: ${type}`, details);
}

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
        title !== 'Conectando ...' &&
        title !== 'Seleccionar estación' &&
        title !== 'A sonar' &&
        title !== 'Reproduciendo ...' &&
        title !== 'Error de reproducción' &&
        title !== 'Reconectando ...' &&
        artist !== '') {
        shareButton.classList.add('visible');
        // FIX: Solo operar si el elemento existe
        if (timerButton && !timerButton.classList.contains('visible')) {
            timerButton.classList.add('visible');
        }
    } else {
        shareButton.classList.remove('visible');
        shareOptions.classList.remove('active');
        // FIX: Solo operar si el elemento existe
        if (timerButton) timerButton.classList.remove('visible');
    }
}
    
function showNotification(message) {
    if (notification) {
        notification.textContent = message;
        notification.classList.add('show');
        setTimeout(() => { notification.classList.remove('show'); }, 3000);
    }
}

function showInstallInvitation() {
    if (window.matchMedia('(display-mode: standalone)').matches || installInvitationTimeout) return;
    
    // FIX: Mejora de UX - Verificar si el usuario ya descartó la invitación anteriormente
    if (localStorage.getItem('rm_pwa_invite_dismissed') === 'true') return;

    let os = 'other';
    if (/android/i.test(navigator.userAgent)) os = 'android';
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) os = 'ios';
    else if (/win/i.test(navigator.userAgent)) os = 'windows';

    [installWindowsBtn, installAndroidBtn, installIosBtn].forEach(btn => btn.classList.add('disabled'));
    const activeBtn = os === 'android' ? installAndroidBtn : (os === 'ios' ? installIosBtn : (os === 'windows' ? installWindowsBtn : null));
    if(activeBtn) activeBtn.classList.remove('disabled');

    installPwaInvitation.style.display = 'flex';
    installInvitationTimeout = true;
}

function hideInstallInvitation() { 
    installPwaInvitation.style.display = 'none'; 
    localStorage.setItem('rm_pwa_invite_dismissed', 'true'); 
}

function attemptResumePlayback() {
    if (wasPlayingBeforeFocusLoss && !isPlaying && currentStation) {
        setTimeout(() => {
            if (!isPlaying) {
                audioPlayer.play().then(() => {
                    isPlaying = true; updateStatus(true); startTimeStuckCheck();
                    showNotification('Reproducción reanudada automáticamente');
                }).catch(error => {
                    showNotification('Toca para reanudar la reproducción');
                    playBtn.style.animation = 'pulse 2s infinite';
                });
            }
        }, 1000);
    }
}

function isFacebookActive() {
    return document.visibilityState === 'visible' &&
           document.hasFocus() &&
           wasPlayingBeforeFocusLoss &&
           !isPlaying &&
           currentStation;
}

function startFacebookDetection() {
    if (pageFocusCheckInterval) clearInterval(pageFocusCheckInterval);
    pageFocusCheckInterval = setInterval(() => {
        if (isFacebookActive()) attemptResumePlayback();
    }, 2000);
}

function checkAudioContext() {
    if (!audioPlayer.paused && isPlaying) lastAudioContextTime = Date.now();
    else if (isPlaying && !audioPlayer.paused) {
        if (audioPlayer.currentTime === lastAudioContextTime) attemptResumePlayback();
        lastAudioContextTime = audioPlayer.currentTime;
    }
}

function startAudioContextCheck() {
    if (audioContextCheckInterval) clearInterval(audioContextCheckInterval);
    audioContextCheckInterval = setInterval(() => {
        if (isPlaying && currentStation) checkAudioContext();
    }, 3000);
}

function startPlaybackChecks() {
    startFacebookDetection();
    startAudioContextCheck();
}

function stopPlaybackChecks() {
    if (pageFocusCheckInterval) { clearInterval(pageFocusCheckInterval); pageFocusCheckInterval = null; }
    if (audioContextCheckInterval) { clearInterval(audioContextCheckInterval); audioContextCheckInterval = null; }
    facebookVideoDetected = false;
}

// ==========================================================================
// GESTIÓN DE FAVORITOS
// ==========================================================================
const FAVORITES_KEY = 'radioMax_favorites';
function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; }
    catch (error) { return []; }
}
function saveFavorites(list) { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(list)); } catch (e) {} }
function updateFavoriteButtonUI(id, fav) {
    const btn = document.querySelector(`.favorite-btn[data-station-id="${id}"]`);
    if (!btn) return;
    const name = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
    if (fav) {
        btn.innerHTML = '★'; btn.classList.add('is-favorite');
        btn.setAttribute('aria-label', `Quitar ${name} de favoritos`);
    } else {
        btn.innerHTML = '☆'; btn.classList.remove('is-favorite');
        btn.setAttribute('aria-label', `Añadir ${name} a favoritos`);
    }
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
function showAllStations() {
    document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(el => el.style.display = '');
}

// ==========================================================================
// SELECTOR PERSONALIZADO
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
        if (st) txt = st.service === 'radioparadise' ? st.name.split(' - ')[1] || st.name : st.name;
        this.customSelectTrigger.textContent = txt || " Seleccionar Estación ";
    }
}

// ==========================================================================
// PORTADA
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

// ==========================================================================
// LÓGICA
// ==========================================================================
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
        const customSelect = new CustomSelect(stationSelect);
        getFavorites().forEach(id => updateFavoriteButtonUI(id, true));
        const last = localStorage.getItem('lastSelectedStation');
        if (last && stationsById[last]) {
            stationSelect.value = last;
            customSelect.updateTriggerText();
            customSelect.updateSelectedOption();
            setTimeout(() => {
                const sel = customSelect.customOptions.querySelector('.custom-option.selected');
                if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 100);
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
            stationsById[s.id] = s;
            grp.appendChild(opt);
        });
        stationSelect.appendChild(grp);
    }
}

loadStations();

if (filterToggleStar) {
    filterToggleStar.addEventListener('click', function() {
        showOnlyFavorites = !showOnlyFavorites;
        this.classList.toggle('active', showOnlyFavorites);
        this.setAttribute('aria-label', showOnlyFavorites ? 'Mostrar todas' : 'Solo favoritas');
        this.title = showOnlyFavorites ? 'Todas las estaciones' : 'Solo estaciones favoritas';
        if (showOnlyFavorites) filterStationsByFavorites(); else showAllStations();
    });
}

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

if (playBtn) {
    playBtn.addEventListener('click', function() {
        this.style.animation = '';
        if (isPlaying) {
            audioPlayer.pause(); isPlaying = false; updateStatus(false);
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
            wasPlayingBeforeFocusLoss = false;
            stopPlaybackChecks();
        } else {
            if (currentStation) playStation(); else alert('Por favor, seleccionar una estación');
        }
    });
}

function handlePlaybackError() {
    if (connectionManager.isReconnecting) return;
    if (!audioPlayer.paused && audioPlayer.currentTime > 0) return;
    
    isPlaying = false;
    updateStatus(false);
    audioPlayer.pause();
    if (timeStuckCheckInterval) { clearInterval(timeStuckCheckInterval); timeStuckCheckInterval = null; }
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
    if (rapidCheckInterval) { clearInterval(rapidCheckInterval); rapidCheckInterval = null; }
    currentTrackInfo = null;
    trackDuration = 0;
    trackStartTime = 0;
    resetCountdown();
    resetAlbumCover();
    resetAlbumDetails();
    showWelcomeScreen();
    songTitle.textContent = 'Reconectando...';
    songArtist.textContent = 'La reproducción se reanudará automáticamente.';
    songAlbum.textContent = '';
    updateShareButtonVisibility();
    logErrorForAnalysis('Playback error', { station: currentStation ? currentStation.id : 'unknown', timestamp: new Date().toISOString(), userAgent: navigator.userAgent });
    connectionManager.start();
}

let currentPlayPromiseId = 0;

async function playStation() {
    if (!currentStation) { alert('Por favor, seleccionar una estación'); return; }
    const thisPlayId = ++currentPlayPromiseId;

    await joinStation(currentStation.id);

    if (updateInterval) clearInterval(updateInterval);
    if (countdownInterval) clearInterval(countdownInterval);
    if (rapidCheckInterval) clearInterval(rapidCheckInterval);
    
    currentTrackInfo = null; trackDuration = 0; trackStartTime = 0;
    resetCountdown(); resetAlbumDetails();
    audioPlayer.src = currentStation.url;
    songTitle.textContent = 'Conectando...';
    songArtist.textContent = ''; songAlbum.textContent = '';
    resetAlbumCover(); updateShareButtonVisibility();

    if (currentStation.service === 'nrk') {
        audioPlayer.addEventListener('loadedmetadata', () => {
            trackDuration = audioPlayer.duration; trackStartTime = Date.now();
            const newTrack = { title: currentStation.name, artist: currentStation.description, album: `Emisión del ${extractDateFromUrl(currentStation.url)}` };
            currentTrackInfo = newTrack; updateUIWithTrackInfo(newTrack);
            resetAlbumCover(); resetAlbumDetails(); startCountdown(); updateShareButtonVisibility();
        }, { once: true });
    }

    try {
        await audioPlayer.play();
        
        if (thisPlayId !== currentPlayPromiseId) return;

        isPlaying = true; updateStatus(true); startTimeStuckCheck();
        showPlaybackInfo();
        wasPlayingBeforeFocusLoss = true;

        if (currentStation.service === 'somafm') {
            updateSongInfo(true);
            startSomaFmPolling(); 
        } else if (currentStation.service === 'radioparadise') {
            updateSongInfo(true);
            startRadioParadisePolling();
        } else {
            setTimeout(() => startSongInfoUpdates(), 5000);
        }
        if (installInvitationTimeout === null) setTimeout(showInstallInvitation, 600000);
        setTimeout(() => { if (isPlaying) startPlaybackChecks(); }, 2000);
    } catch (error) {
        if (error.name === 'AbortError') return;
        
        console.warn("Play rejected:", error);
        handlePlaybackError();
    }
}

function extractDateFromUrl(url) {
    const m = url.match(/nrk_radio_klassisk_natt_(\d{8})_/);
    return m ? `${m[1].substring(6, 8)}-${m[1].substring(4, 6)}-${m[1].substring(0, 4)}` : 'Fecha desconocida';
}

async function updateSongInfo(bypassRateLimit = false) {
    if (!currentStation || !currentStation.service) return;
    if (isUpdatingSongInfo) return;
    if (currentStation.service === 'somafm') await updateSomaFmInfo(bypassRateLimit);
    else if (currentStation.service === 'radioparadise') await updateRadioParadiseInfo(bypassRateLimit);
}

// ============================================================================
// SISTEMA DE COUNTDOWN MEJORADO
// ============================================================================

// 1. Función resetCountdown MEJORADA
function resetCountdown() {
    if (countdownInterval) { 
        clearInterval(countdownInterval); 
        countdownInterval = null; 
    }
    if (animationFrameId) { 
        cancelAnimationFrame(animationFrameId); 
        animationFrameId = null; 
    }
    if (rapidCheckInterval) { 
        clearInterval(rapidCheckInterval); 
        rapidCheckInterval = null; 
    }
    
    // Reset de estado
    countdownState = {
        isRunning: false,
        lastUpdateTime: 0,
        estimatedEndTime: 0
    };
    
    trackDuration = 0; 
    trackStartTime = 0;
    lastKnownTrackId = null;
    autoStopEnabled = false; // Reset auto-stop state
    
    countdownTimer.textContent = '--:--';
    totalDuration.textContent = '(--:--)';
    trackPosition.textContent = '--/--';
    countdownTimer.classList.remove('ending');
    songTransitionDetected = false;
}

// 2. Función startCountdown COMPLETAMENTE REDISEÑADA
function startCountdown() {
    // Limpiar timers anteriores
    if (countdownInterval) { 
        clearInterval(countdownInterval); 
        countdownInterval = null; 
    }
    if (animationFrameId) { 
        cancelAnimationFrame(animationFrameId); 
        animationFrameId = null; 
    }
    
    if (!trackStartTime) { 
        resetCountdown(); 
        return; 
    }

    // Marcar el estado como activo
    countdownState.isRunning = true;
    countdownState.lastUpdateTime = Date.now();

    // Mostrar duración total si está disponible
    if (trackDuration > 0) {
        const m = Math.floor(trackDuration / 60);
        const s = Math.floor(trackDuration % 60);
        totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        
        // Calcular tiempo estimado de finalización
        countdownState.estimatedEndTime = trackStartTime + (trackDuration * 1000);
    } else {
        totalDuration.textContent = '(--:--)';
        countdownState.estimatedEndTime = 0;
    }

    // Sistema de verificación rápida para SomaFM
    if (currentStation?.service === 'somafm') {
        setupRapidCheckForSomaFM();
    }

    // Iniciar el loop de actualización
    updateTimer();
}

// 3. NUEVA FUNCIÓN: setupRapidCheckForSomaFM
function setupRapidCheckForSomaFM() {
    // Limpiar cualquier rapid check anterior
    if (rapidCheckInterval) {
        clearInterval(rapidCheckInterval);
        rapidCheckInterval = null;
    }

    // Verificar cada 10 segundos si necesitamos activar el modo rápido
    const monitorInterval = setInterval(() => {
        if (!isPlaying || currentStation?.service !== 'somafm') {
            clearInterval(monitorInterval);
            return;
        }

        const elapsed = (Date.now() - trackStartTime) / 1000;
        
        // Activar modo rápido cuando quedan menos de 30 segundos
        const timeRemaining = trackDuration - elapsed;
        if (timeRemaining > 0 && timeRemaining <= 30 && !rapidCheckInterval) {
            rapidCheckInterval = setInterval(() => {
                if (currentStation?.service === 'somafm') {
                    updateSongInfo(true);
                } else {
                    if (rapidCheckInterval) {
                        clearInterval(rapidCheckInterval);
                        rapidCheckInterval = null;
                    }
                }
            }, 2000);
            
            // Detener el monitor una vez activado el rapid check
            clearInterval(monitorInterval);
        }
        
        // También activar si ya pasamos RAPID_CHECK_THRESHOLD
        if (elapsed > RAPID_CHECK_THRESHOLD && !rapidCheckInterval) {
            rapidCheckInterval = setInterval(() => {
                if (currentStation?.service === 'somafm') {
                    updateSongInfo(true);
                } else {
                    if (rapidCheckInterval) {
                        clearInterval(rapidCheckInterval);
                        rapidCheckInterval = null;
                    }
                }
            }, 2000);
            
            clearInterval(monitorInterval);
        }
    }, 10000);
}

// 4. FUNCIÓN updateTimer REDISEÑADA CON MEJOR LÓGICA + AUTO-STOP
function updateTimer() {
    if (!isPlaying || !countdownState.isRunning) {
        countdownState.isRunning = false;
        return;
    }

    const now = Date.now();
    const el = (now - trackStartTime) / 1000;
    let d;
    let displayText = '';
    
    // CASO 1: Esperando duración (primeros momentos de nueva canción)
    if (trackDuration === 0) {
        if (currentStation && (currentStation.service === 'somafm' || currentStation.service === 'radioparadise')) {
            d = 0; 
            // No actualizar el DOM para evitar ver el conteo errático
            animationFrameId = requestAnimationFrame(updateTimer);
            return;
        } else {
            // Para otros servicios, contar tiempo transcurrido normal
            d = el;
        }
    } else {
        d = trackDuration - el;
    }

    // --- NUEVA LÓGICA: CUENTA ATRÁS O CUENTA HACIA ARRIBA (+) ---
    if (d < 0) {
        // Hemos pasado el tiempo estimado de la canción.
        // --- CHECK AUTO-STOP ---
        if (autoStopEnabled && !isUpdatingSongInfo) {
            console.log('⏰ Auto-apagado ejecutado.');
            stopBtn.click(); // Ejecutar lógica completa de detención
            autoStopEnabled = false;
            if (timerButton) timerButton.classList.remove('active');
            return;
        }
        // -----------------------------

        // Contamos el tiempo transcurrido de la NUEVA canción.
        const overtime = Math.abs(d);
        const m = Math.floor(overtime / 60);
        const s = Math.floor(overtime % 60);
        displayText = `+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        
        // Mantener el efecto de parpadeo
        countdownTimer.classList.add('ending');
        
        // Trigger de refresco de metadatos si estamos en zona de riesgo (primer segundo después de 0)
        if (overtime > 2 && overtime < 3 && !isUpdatingSongInfo) {
             updateSongInfo(true);
        }

        // Si llevamos más de 15 segundos en overtime, algo está mal
        if (overtime > 15) {
            console.warn('Overtime excesivo detectado, reseteando...');
            // Forzar actualización y reset del timer
            updateSongInfo(true).then(() => {
                if (trackDuration === 0) {
                    resetCountdown();
                    startCountdown();
                }
            });
        }
    } else {
        // Tiempo restante normal
        const m = Math.floor(d / 60);
        const s = Math.floor(d % 60);
        displayText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        
        // Efecto parpadeo en los últimos segundos
        if (d < 10) countdownTimer.classList.add('ending'); 
        else countdownTimer.classList.remove('ending');
    }

    // Actualizar DOM
    countdownTimer.textContent = displayText;
    countdownState.lastUpdateTime = now;

    // Continuar el loop
    animationFrameId = requestAnimationFrame(updateTimer);
}

async function updateSomaFmInfo(bypassRateLimit = false) {
    if (isUpdatingSongInfo) return; 
    isUpdatingSongInfo = true;
    
    try {
        const res = await fetch(`https://api.somafm.com/songs/${currentStation.id}.json`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        
        if (data.songs && data.songs.length > 0) {
            const s = data.songs[0];
            // IMPORTANTE: Trim para evitar espacios en blanco
            const newTrack = { 
                title: s.title ? s.title.trim() : 'Título desconocido', 
                artist: s.artist ? s.artist.trim() : 'Artista desconocido', 
                album: s.album ? s.album.trim() : '', 
                date: s.date || null 
            };
            
            // Crear ID único con strings limpios
            const newTrackId = `${newTrack.artist}-${newTrack.title}`;
            const isNewTrack = lastKnownTrackId !== newTrackId;
            
            if (isNewTrack) {
                console.log('🎵 Nueva canción SomaFM:', newTrack.title);
                lastKnownTrackId = newTrackId;
                
                resetCountdown();
                resetAlbumDetails();
                
                currentTrackInfo = newTrack;
                updateUIWithTrackInfo(newTrack);
                resetAlbumCover();
                trackStartTime = newTrack.date ? (newTrack.date * 1000)-1000 : Date.now();
                trackDuration = 0;
                
                startCountdown();
                
                if (rapidCheckInterval) {
                    clearInterval(rapidCheckInterval);
                    rapidCheckInterval = null;
                }
                songTransitionDetected = true;

                // Solo buscar detalles si cambia la canción
                fetchSongDetails(newTrack.artist, newTrack.title, newTrack.album)
                    .catch(e => console.error("Error fetchSongDetails (background):", e));
            } else {
                // No es nueva canción, verificar si llego la duración
                if (trackDuration === 0) {
                    // Seguimos esperando la duración de Spotify/MusicBrainz
                }
            }
        } else {
            resetUI();
        }
    } catch (e) {
        logErrorForAnalysis('SomaFM error', { 
            error: e.message, 
            stationId: currentStation.id, 
            timestamp: new Date().toISOString() 
        });
    } finally { 
        isUpdatingSongInfo = false; 
    }
}
    
function startSomaFmPolling() {
    // Intervalo adaptativo
    if (updateInterval) clearInterval(updateInterval);
    
    const pollInterval = setInterval(() => {
        if (!isPlaying || currentStation?.service !== 'somafm') {
            clearInterval(pollInterval);
            return;
        }
        
        const elapsed = (Date.now() - trackStartTime) / 1000;
        const remaining = trackDuration - elapsed;
        
        // Intervalo adaptativo:
        // - Normal: 4 segundos
        // - Últimos 30 segundos: manejado por rapidCheckInterval
        // - Overtime: verificación inmediata
        if (remaining < 0 || remaining > 30) {
            updateSongInfo(true);
        }
    }, 4000);
    
    updateInterval = pollInterval;
}

async function updateRadioParadiseInfo(bypassRateLimit = false) {
    if (isUpdatingSongInfo) return; 
    isUpdatingSongInfo = true;
    
    try {
        const w = 'https://core.chcs.workers.dev/radioparadise';
        const p = `api/now_playing?chan=${currentStation.channelId || 1}`;
        const u = `${w}?url=${encodeURIComponent(p)}`;
        const res = await fetch(u);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();
        
        // IMPORTANTE: Trim para evitar espacios en blanco
        const newTrack = { 
            title: d.title ? d.title.trim() : 'Título desconocido', 
            artist: d.artist ? d.artist.trim() : 'Artista desconocido', 
            album: d.album ? d.album.trim() : '' 
        };
        
        // Crear ID único con strings limpios
        const newTrackId = `${newTrack.artist}-${newTrack.title}`;
        const isNewTrack = lastKnownTrackId !== newTrackId;
        
        if (isNewTrack) {
            console.log('🎵 Nueva canción Radio Paradise:', newTrack.title);
            lastKnownTrackId = newTrackId;
            
            resetCountdown();
            resetAlbumDetails();
            
            currentTrackInfo = newTrack;
            updateUIWithTrackInfo(newTrack);
            resetAlbumCover();
            
            if (d.song_duration && typeof d.song_duration === 'number') trackDuration = d.song_duration;
            else { trackStartTime = Date.now() - 15000; trackDuration = 0; }
            
            startCountdown();
            
            // Solo buscar detalles si cambia la canción
            fetchSongDetails(newTrack.artist, newTrack.title, newTrack.album)
                .catch(e => console.error("Error fetchSongDetails (background):", e));
        }
    } catch (e) {
        logErrorForAnalysis('Radio Paradise error', { 
            error: e.message, 
            stationId: currentStation.id, 
            timestamp: new Date().toISOString() 
        });
    } finally { 
        isUpdatingSongInfo = false; 
    }
}
    
function startRadioParadisePolling() {
    if (updateInterval) clearTimeout(updateInterval);
    const rpLoop = async () => {
        if (!isPlaying || currentStation?.service !== 'radioparadise') return;
        await updateRadioParadiseInfo(true);
        let next = 5000;
        // Acelerar si estamos en final de canción según duración actual
        if (trackDuration > 0 && trackStartTime > 0) {
            const rem = trackDuration - (Date.now() - trackStartTime) / 1000;
            if (rem > 0 && rem < 30) next = 2000;
        }
        updateInterval = setTimeout(rpLoop, next);
    };
    rpLoop();
}

async function fetchSongDetails(artist, title, album) {
    if (!artist || !title) return;
    const sA = artist.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const sT = title.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const sAl = album ? album.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") : "";
    
    let spotifyIsrc = null;

    try {
        const u = `https://core.chcs.workers.dev/spotify?artist=${encodeURIComponent(sA)}&title=${encodeURIComponent(sT)}&album=${encodeURIComponent(sAl)}`;
        const res = await fetch(u);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();
        
        if (d && d.imageUrl) {
            // EVITAR RE-CARGA SI LA IMAGEN ES LA MISMA (FIX PARPADEO)
            const currentImg = albumCover.querySelector('img.loaded');
            if (currentImg && currentImg.src === d.imageUrl) {
                // La imagen ya es la correcta. Solo actualizar detalles.
                updateAlbumDetailsWithSpotifyData(d);
                // No actualizar portada (evita spinner/fade)
            } else {
                displayAlbumCoverFromUrl(d.imageUrl);
                updateAlbumDetailsWithSpotifyData(d);
            }
            
            if (d.duration) {
                trackDuration = d.duration;
                const m = Math.floor(trackDuration / 60);
                const s = Math.floor(trackDuration % 60);
                totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            }
            if (d.isrc) {
                spotifyIsrc = d.isrc;
            }
        }
        
        await getMusicBrainzDuration(sA, sT, sAl, spotifyIsrc);
        
    } catch (e) {
        logErrorForAnalysis('Spotify error', { error: e.message, artist: sA, title: sT, timestamp: new Date().toISOString() });
    }
}
    
async function getMusicBrainzDuration(artist, title, album, isrc = null) {
    if (!canMakeApiCall('musicBrainz')) return;
    try {
        let recordingId = null;

        // --- PRIORIDAD1: BÚSQUEDA POR ISRC (MÉTODO IDEAL) ---
        if (isrc) {
            try {
                // 'inc=artist-rels' trae los créditos directo en esta consulta
                const isrcUrl = `https://musicbrainz.org/ws/2/isrc/${isrc}?inc=artist-rels&fmt=json`;
                const res = await fetch(isrcUrl, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.recordings && data.recordings.length > 0) {
                        const r = data.recordings[0]; // Coincidencia unívoca
                        
                        // 1. Actualizar Duración (si Spotify no la tenía)
                        if (r.length && trackDuration === 0) {
                            trackDuration = Math.floor(r.length / 1000);
                            const m = Math.floor(trackDuration / 60);
                            const s = Math.floor(trackDuration % 60);
                            totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                        }

                        // 2. Actualizar Créditos (Ya vienen incluidos en la respuesta ISRC)
                        const creditsElement = document.getElementById('trackCredits');
                        if (creditsElement && r.relations) {
                            const artistRelations = r.relations.filter(rel => rel.type && rel.artist);
                            if (artistRelations.length > 0) {
                                const creditList = artistRelations.map(rel => {
                                    // Usamos la función de traducción en lugar de capitalize
                                    const role = rel.type ? translateRole(rel.type) : '';
                                    const name = rel.artist ? rel.artist.name : '';
                                    return name ? `${role}: ${name}` : '';
                                }).filter(txt => txt !== '').join(', ');
                                
                                creditsElement.textContent = creditList;
                            } else {
                                creditsElement.textContent = 'N/A';
                            }
                        }
                        
                        return; // Éxito vía ISRC, finalizamos aquí.
                    }
                }
            } catch (isrcError) {
                // Si falla la búsqueda por ISRC (ej código inválido), intentamos por nombre
                // No hacemos log aquí para no ensuciar consola
            }
        }

        // --- PRIORIDAD 2: BÚSQUEDA POR TÍTULO (Fallback) ---
        // Limpiamos el título eliminando paréntesis de remixes/live
        const cleanTitle = title.replace(/\([^)]*\)/g, '').trim();
        
        const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(cleanTitle)}"&fmt=json&limit=5`;
        const res = await fetch(searchUrl, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();
        
        if (d.recordings && d.recordings.length > 0) {
            const r = d.recordings.find(r => r.length) || d.recordings[0];
            if (r && r.length) {
                // Actualizar duración si Spotify no la tuvo
                if (trackDuration === 0) {
                    trackDuration = Math.floor(r.length / 1000);
                    const m = Math.floor(trackDuration / 60);
                    const s = Math.floor(trackDuration % 60);
                    totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                }
                recordingId = r.id; 
            }
        }

        // Si encontramos Recording ID por nombre, buscar créditos (2da petición)
        if (recordingId) {
            try {
                // PAUSA PARA RATE LIMITING
                await new Promise(resolve => setTimeout(resolve, 1100)); 

                const creditsUrl = `https://musicbrainz.org/ws/2/recording/${recordingId}?inc=artist-rels&fmt=json`;
                const creditsRes = await fetch(creditsUrl, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
                
                if (creditsRes.ok) {
                    const creditsData = await creditsRes.json();
                    const creditsElement = document.getElementById('trackCredits');
                    
                    if (creditsElement && creditsData.relations) {
                        const artistRelations = creditsData.relations.filter(rel => rel.type && rel.artist);
                        
                        if (artistRelations.length > 0) {
                            const creditList = artistRelations.map(rel => {
                                const role = rel.type ? translateRole(rel.type) : '';
                                const name = rel.artist ? rel.artist.name : '';
                                return name ? `${role}: ${name}` : '';
                            }).filter(txt => txt !== '').join(', ');
                            
                            creditsElement.textContent = creditList;
                        } else {
                            creditsElement.textContent = 'N/A';
                        }
                    }
                }
            } catch (creditError) {
                // Silencioso, los créditos no son críticos
            }
        }
    } catch (e) {
        logErrorForAnalysis('MusicBrainz error', { error: e.message, artist, title, timestamp: new Date().toISOString() });
    }
}

// Helper para traducir roles técnicos al español
function translateRole(role) {
    if (typeof role !== 'string') return '';
    const lowerRole = role.toLowerCase();
    const translations = {
        'writer': 'Escritor',
        'composer': 'Compositor',
        'lyricist': 'Letrista',
        'producer': 'Productor',
        'co-producer': 'Coproductor',
        'arranger': 'Arreglista',
        'engineer': 'Ingeniero',
        'audio engineer': 'Ingeniero de Audio',
        'mixing engineer': 'Ingeniero de Mezclado',
        'mastering engineer': 'Ingeniero de Mastering',
        'remixer': 'Remixer',
        'conductor': 'Director',
        'performer': 'Intérprete'
    };
    // Si no hay traducción específica, usamos la versión en inglés capitalizada
    return translations[lowerRole] || capitalize(role);
}

// Helper para poner mayúscula la primera letra (usado como fallback)
function capitalize(s) {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function updateAlbumDetailsWithSpotifyData(d) {
    const el = document.getElementById('releaseDate');
    if (el) el.innerHTML = '';
    if (d.release_date) {
        const y = d.release_date.substring(0, 4);
        let t = y;
        if (d.albumTypeDescription && d.albumTypeDescription !== 'Álbum') t += ` (${d.albumTypeDescription})`;
        el.textContent = t;
    } else if (el) el.textContent = '----';
    if (d.label && d.label.trim() !== '') recordLabel.textContent = d.label; else recordLabel.textContent = '----';
    if (d.totalTracks) albumTrackCount.textContent = d.totalTracks; else albumTrackCount.textContent = '--';
    if (d.totalAlbumDuration) {
        let s = d.totalAlbumDuration;
        if (s > 10000) s = Math.floor(s / 1000);
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        albumTotalDuration.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    } else albumTotalDuration.textContent = '--:--';
    if (d.genres && d.genres.length > 0) trackGenre.textContent = d.genres.slice(0, 2).join(', '); else trackGenre.textContent = '--';
    if (d.trackNumber && d.totalTracks) trackPosition.textContent = `Track ${d.trackNumber}/${d.totalTracks}`; else trackPosition.textContent = '--/--';
    
    if (trackIsrc) {
        if (d.isrc && d.isrc.trim() !== '') trackIsrc.textContent = d.isrc.toUpperCase(); 
        else trackIsrc.textContent = '----';
    }
}

function updateUIWithTrackInfo(t) {
    if (songTitle.textContent !== t.title) songTitle.textContent = t.title;
    if (songArtist.textContent !== t.artist) songArtist.textContent = t.artist;
    
    const albumText = t.album ? `(${t.album})` : '';
    if (songAlbum.textContent !== albumText) songAlbum.textContent = albumText;
    
    updateShareButtonVisibility();
}

function resetUI() {
    if (connectionManager.isReconnecting) return;
    songTitle.textContent = 'Reproduciendo...';
    songArtist.textContent = ''; songAlbum.textContent = '';
    resetCountdown(); resetAlbumCover(); resetAlbumDetails();
    updateShareButtonVisibility();
}

function resetAlbumDetails() {
    if (!document.querySelector('.release-date-tooltip')) releaseDate.textContent = '----';
    recordLabel.textContent = '----';
    albumTrackCount.textContent = '--';
    if (trackIsrc) trackIsrc.textContent = '----';
    albumTotalDuration.textContent = '--:--';
    trackGenre.textContent = '--';
    trackPosition.textContent = '--/--';
    const trackCredits = document.getElementById('trackCredits');
    if (trackCredits) trackCredits.textContent = '--';
}

function startSongInfoUpdates() {
    updateSongInfo();
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateSongInfo, 30000);
}

function stopSongInfoUpdates() {
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
    if (rapidCheckInterval) { clearInterval(rapidCheckInterval); rapidCheckInterval = null; }
    resetCountdown(); resetAlbumCover(); resetAlbumDetails();
    currentTrackInfo = null;
    songTitle.textContent = 'Seleccionar estación';
    songArtist.textContent = ''; songAlbum.textContent = '';
    updateShareButtonVisibility();
}

if (stopBtn) {
    stopBtn.addEventListener('click', function() {
        leaveStation(currentStationId);
        connectionManager.stop();
        audioPlayer.pause(); audioPlayer.src = '';
        isPlaying = false; updateStatus(false);
        stopSongInfoUpdates();
        wasPlayingBeforeFocusLoss = false;
        stopPlaybackChecks();
        showWelcomeScreen();
    });
}

if (audioPlayer) {
    audioPlayer.addEventListener('error', (e) => {
        const err = audioPlayer.error;
        if (err) {
            if (err.code == 1 || err.code == 4) { return; }
            logErrorForAnalysis('Audio error', { code: err.code, msg: err.message, station: currentStation ? currentStation.id : 'unknown', timestamp: new Date().toISOString() });
            if (err.message.includes('interrupt') || err.message.includes('aborted')) {
                wasPlayingBeforeFocusLoss = true;
                setTimeout(() => {
                    if (wasPlayingBeforeFocusLoss && currentStation) {
                        audioPlayer.play().then(() => {
                            isPlaying = true; updateStatus(true); startTimeStuckCheck();
                            showNotification('Reproducción reanudada automáticamente');
                        }).catch(er => {
                            showNotification('Toca para reanudar');
                            playBtn.style.animation = 'pulse 2s infinite';
                        });
                    }
                }, 2000);
            } else handlePlaybackError();
        }
    });

    audioPlayer.addEventListener('pause', () => {
        if (isPlaying && !document.hidden) {
            wasPlayingBeforeFocusLoss = true;
            setTimeout(() => {
                if (wasPlayingBeforeFocusLoss && currentStation) {
                    audioPlayer.play().then(() => {
                        isPlaying = true; updateStatus(true); startTimeStuckCheck();
                        showNotification('Reproducción reanudada automáticamente');
                    }).catch(er => {
                        showNotification('Toca para reanudar');
                        playBtn.style.animation = 'pulse 2s infinite';
                    });
                }
            }, 1000);
        } else { isPlaying = false; updateStatus(false); }
    });

    audioPlayer.addEventListener('stalled', () => {
        if (isPlaying) {
            wasPlayingBeforeFocusLoss = true;
            setTimeout(() => {
                if (wasPlayingBeforeFocusLoss && currentStation) {
                    audioPlayer.play().then(() => { isPlaying = true; updateStatus(true); startTimeStuckCheck(); }).catch(e => {});
                }
            }, 2000);
        }
    });
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', function() {
        const v = this.value / 100;
        audioPlayer.volume = v;
        updateVolumeIconPosition();
        if (this.value == 0) { volumeIcon.classList.add('muted'); isMuted = true; }
        else { volumeIcon.classList.remove('muted'); isMuted = false; previousVolume = this.value; }
    });
}

if (volumeIcon) {
    volumeIcon.addEventListener('click', function() {
        if (isMuted) {
            volumeSlider.value = previousVolume;
            audioPlayer.volume = previousVolume / 100;
            volumeIcon.classList.remove('muted'); isMuted = false;
        } else {
            previousVolume = volumeSlider.value;
            volumeSlider.value = 0;
            audioPlayer.volume = 0;
            volumeIcon.classList.add('muted'); isMuted = true;
        }
        updateVolumeIconPosition();
    });
}

function updateStatus(now) {
    if (playBtn) { playBtn.textContent = now ? '⏸ PAUSAR' : '▶ SONAR'; }
}

if (audioPlayer) {
    audioPlayer.addEventListener('playing', () => {
        isPlaying = true; updateStatus(true); wasPlayingBeforeFocusLoss = true;
        if (connectionManager.isReconnecting) {
            connectionManager.stop();
            showNotification('Conexión restaurada con éxito.');
            if (currentStation && currentStation.service !== 'nrk') {
                if (currentStation.service === 'somafm') startSomaFmPolling();
                else if (currentStation.service === 'radioparadise') startRadioParadisePolling();
                else startSongInfoUpdates();
                updateSongInfo(true);
            }
        }
    });
    audioPlayer.addEventListener('ended', () => { isPlaying = false; updateStatus(false); wasPlayingBeforeFocusLoss = false; });
}

const connectionManager = {
    isReconnecting: false,
    reconnectAttempts: 0,
    maxReconnectAttempts:5,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    reconnectTimeoutId: null,
    audioCheckInterval: null,
    start() {
        if (this.isReconnecting) return;
        this.isReconnecting = true;
        this.reconnectAttempts = 0;
        this.attemptReconnect();
        this.startAudioCheck();
    },
    stop() {
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimeoutId) { clearTimeout(this.reconnectTimeoutId); this.reconnectTimeoutId = null; }
        if (this.audioCheckInterval) { clearInterval(this.audioCheckInterval); this.audioCheckInterval = null; }
    },
    startAudioCheck() {
        this.audioCheckInterval = setInterval(() => {
            if (!audioPlayer.paused && audioPlayer.currentTime > 0) {
                this.stop();
                isPlaying = true; updateStatus(true); showPlaybackInfo();
                showNotification('Conexión restaurada con éxito.');
                if (currentStation && currentStation.service !== 'nrk') {
                    if (currentStation.service === 'somafm') startSomaFmPolling();
                    else if (currentStation.service === 'radioparadise') startRadioParadisePolling();
                    else startSongInfoUpdates();
                    updateSongInfo(true);
                }
            }
        }, 1000);
    },
    attemptReconnect() {
        if (!this.isReconnecting || !currentStation) { this.stop(); return; }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            songTitle.textContent = 'Error de conexión: no se pudo restaurar';
            songArtist.textContent = 'Presionar SONAR para intentar manualmente';
            songAlbum.textContent = ''; updateShareButtonVisibility();
            this.stop(); return;
        }
        this.reconnectAttempts++;
        const d = Math.min(this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        this.reconnectTimeoutId = setTimeout(async () => {
            try {
                audioPlayer.src = currentStation.url;
                await audioPlayer.play();
                isPlaying = true; updateStatus(true); startTimeStuckCheck();
                showPlaybackInfo();
                this.stop();
                showNotification('Conexión restaurada con éxito.');
                if (currentStation.service !== 'nrk') {
                    if (currentStation.service === 'somafm') startSomaFmPolling();
                    else if (currentStation.service === 'radioparadise') startRadioParadisePolling();
                    else startSongInfoUpdates();
                    updateSongInfo(true);
                }
            } catch (e) { this.attemptReconnect(); }
        }, d);
    }
};

window.addEventListener('online', () => { if (connectionManager.isReconnecting) connectionManager.attemptReconnect(); });
window.addEventListener('offline', () => {});

if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
        title: 'RadioMax', artist: 'Una experiencia inmersiva', album: 'inmersiva',
        artwork: [{ src: '/images/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/images/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' }]
    });
    navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying && currentStation) audioPlayer.play().then(() => { isPlaying = true; updateStatus(true); wasPlayingBeforeFocusLoss = true; }).catch(e => {}); });
    navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) { audioPlayer.pause(); isPlaying = false; updateStatus(false); wasPlayingBeforeFocusLoss = false; } });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        wasPlayingBeforeFocusLoss = isPlaying;
        if (navigator.userAgent.includes('FBAN') || navigator.userAgent.includes('FBAV')) facebookVideoDetected = true;
    } else {
        attemptResumePlayback();
        if (facebookVideoDetected) {
            startFacebookDetection();
            setTimeout(() => {
                facebookVideoDetected = false;
                if (pageFocusCheckInterval) { clearInterval(pageFocusCheckInterval); pageFocusCheckInterval = null; }
            }, 30000);
        }
    }
});

window.addEventListener('blur', () => {
    wasPlayingBeforeFocusLoss = isPlaying;
    if (navigator.userAgent.includes('FBAN') || navigator.userAgent.includes('FBAV')) facebookVideoDetected = true;
});

window.addEventListener('focus', () => {
    attemptResumePlayback();
    if (facebookVideoDetected) {
        startFacebookDetection();
        setTimeout(() => {
            facebookVideoDetected = false;
            if (pageFocusCheckInterval) { clearInterval(pageFocusCheckInterval); pageFocusCheckInterval = null; }
        }, 30000);
    }
});

document.addEventListener('click', () => {
    if (wasPlayingBeforeFocusLoss && !isPlaying && currentStation) {
        setTimeout(() => {
            if (wasPlayingBeforeFocusLoss && !isPlaying && currentStation) attemptResumePlayback();
        }, 500);
    }
});

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

// --- NUEVO: LISTENER TIMER ---
if (timerButton) {
    timerButton.addEventListener('click', function() {
        autoStopEnabled = !autoStopEnabled;
        
        // Feedback visual
        this.classList.toggle('active', autoStopEnabled);
        
        // Feedback al usuario
        if (autoStopEnabled) {
            showNotification('Auto-apagado activado: Se detendrá al terminar esta canción.');
        } else {
            showNotification('Auto-apagado desactivado.');
        }
    });
}
// -------------------------------

if (shareButton) { shareButton.addEventListener('click', () => { shareOptions.classList.toggle('active'); }); }
document.addEventListener('click', (e) => { if (shareButton && shareOptions && !shareButton.contains(e.target) && !shareOptions.contains(e.target)) shareOptions.classList.remove('active'); });

if (shareWhatsApp) {
    shareWhatsApp.addEventListener('click', () => {
        const title = songTitle.textContent;
        const artist = songArtist.textContent;
        if (title && artist && title !== 'a sonar' && title !== 'Conectando...' && title !== 'Seleccionar estación') {
            const m = `Escuché ${title} de ${artist} en https://kutt.it/radiomax ¡Temazo en RadioMax!`;
            const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isBrave = isMob && /Brave/i.test(navigator.userAgent) && /Android/i.test(navigator.userAgent);
            if (isBrave) {
                showNotification('En Brave, toca el enlace para abrir WhatsApp Web');
                setTimeout(() => { window.open(`https://wa.me/?text=${encodeURIComponent(m)}`, '_blank'); }, 1000);
            } else if (isMob) {
                const uri = `whatsapp://send?text=${encodeURIComponent(m)}`;
                const link = document.createElement('a');
                link.href = uri; link.target = '_blank'; link.rel = 'noopener noreferrer';
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
                setTimeout(() => { window.open(`https://wa.me/?text=${encodeURIComponent(m)}`, '_blank'); }, 1500);
            } else window.open(`https://wa.me/?text=${encodeURIComponent(m)}`, '_blank');
            if (shareOptions) shareOptions.classList.remove('active');
        } else showNotification('Por favor, espera a que comience una canción para compartir');
    });
}

if (closeInvitationBtn) { closeInvitationBtn.addEventListener('click', hideInstallInvitation); }

if (installWindowsBtn) {
    installWindowsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((r) => {
                if (r.outcome === 'accepted') { console.log('User accepted A2HS prompt'); } else { console.log('User dismissed A2HS prompt'); }
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
                if (r.outcome === 'accepted') { console.log('User accepted A2HS prompt'); } else { console.log('User dismissed A2HS prompt'); }
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

let lastKeyPressed = null; let lastMatchIndex = -1;
document.addEventListener('keydown', function(event) {
    if (!document.querySelector('.custom-select-wrapper.open') &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
        /^[a-zA-Z0-9]$/.test(event.key)) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        const matches = [];
        document.querySelectorAll('.custom-option').forEach(opt => {
            const name = opt.querySelector('.custom-option-name').textContent.toLowerCase();
            if (name.startsWith(key)) matches.push(opt);
        });
        if (matches.length > 0) {
            if (key === lastKeyPressed) { lastMatchIndex = (lastMatchIndex +1) % matches.length; }
            else { lastMatchIndex = 0; lastKeyPressed = key; }
            const opt = matches[lastMatchIndex];
            const id = opt.dataset.value;
            
            if (currentStation && currentStation.id === id) return;

            stationSelect.value = id;
            stationSelect.dispatchEvent(new Event('change'));
            const custom = document.querySelector('.custom-select-wrapper');
            const trig = custom.querySelector('.custom-select-trigger');
            const st = stationsById[id];
            let txt = st.name;
            if (st.service === 'radioparadise') txt = st.name.split(' - ')[1] || st.name;
            trig.textContent = txt;
            custom.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            opt.scrollIntoView({ block: 'nearest' });
        }
    }
});

if (volumeIcon) { updateVolumeIconPosition(); }

const versionSpan = document.getElementById('version-number');
if (versionSpan) {
    fetch('/sw.js')
        .then(r => { if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`); return r.text(); })
        .then(t => {
            const m = t.match(/^(?:\/\/\s*)?v?(\d+(?:\.\d+){1,2})/m);
            if (m && m[1]) versionSpan.textContent = m[1];
            else { versionSpan.textContent = 'N/D'; console.warn('No version match in sw.js'); }
        })
        .catch(e => { console.error('Error loading sw version:', e); versionSpan.textContent = 'Error'; });
}

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

// =======================================================================
// FIN TRY...CATCH
// =======================================================================
} catch (error) {
    console.error("Error fatal:", error);
    const le = document.getElementById('loadingStations');
    if (le) { le.textContent = `Error crítico: ${error.message}.`; le.style.color = '#ff6600'; }
}
});
