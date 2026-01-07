// app.js - v3.6.0
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {computePosition, autoUpdate, offset, flip, shift} from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.4/+esm';

// ==========================================================================
// CONFIGURACIÓN DE SUPABASE (PRESENCIA)
// ==========================================================================
const SUPABASE_URL = 'https://xahbzlhjolnugpbpnbmo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentChannel = null;
let currentStationId = null;

document.addEventListener('DOMContentLoaded', () => {
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
    const tooltipCredits = document.getElementById('tooltip-credits');
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
    let currentCredits = "";
    let songFetchController = null;
    let cleanupFunctions = [];

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
                if (!err.message?.includes('closed')) {
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
        somaFM: { lastCall: 0, minInterval: 6000 },
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
        clearTimeStuckCheck();
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
        cleanupFunctions.push(() => clearInterval(timeStuckCheckInterval));
    }

    function clearTimeStuckCheck() {
        if (timeStuckCheckInterval) {
            clearInterval(timeStuckCheckInterval);
            timeStuckCheckInterval = null;
        }
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
        const newPosition = percent * sliderWidth - (iconWidth / 2);
        volumeIcon.style.left = `${newPosition}px`;
    }

    function updateTooltipPosition() {
        if (!trackCredits || !tooltipCredits) return;

        if (currentCredits === '') {
            tooltipCredits.style.opacity = '0';
            trackCredits.textContent = '--';
            trackCredits.removeAttribute('aria-describedby');
            trackCredits.removeAttribute('tabindex');
            trackCredits.style.borderBottom = 'none';
            return;
        }

        trackCredits.textContent = 'VER';
        trackCredits.setAttribute('aria-describedby', 'tooltip-credits');
        trackCredits.setAttribute('tabindex', '0');
        trackCredits.style.borderBottom = '1px dashed #ccc';
        tooltipCredits.textContent = currentCredits;
        tooltipCredits.setAttribute('role', 'tooltip');

        autoUpdate(trackCredits, tooltipCredits, () => {
            computePosition(trackCredits, tooltipCredits, {
                placement: 'top',
                middleware: [offset(8), flip(), shift({ padding: 5 })]
            }).then(({ x, y }) => {
                Object.assign(tooltipCredits.style, {
                    left: `${x}px`,
                    top: `${y}px`,
                    opacity: '1',
                    visibility: 'visible'
                });
            });
        });
    }

    function updateShareButtonVisibility() {
        const title = songTitle.textContent.trim();
        const artist = songArtist.textContent.trim();
        const invalidTitles = [
            'a sonar', 'Conectando...', 'Seleccionar estación',
            'A sonar', 'Reproduciendo...', 'Error de reproducción', 'Reconectando...'
        ];
        if (title && artist && !invalidTitles.includes(title) && artist !== '') {
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

    function showInstallInvitation() {
        if (window.matchMedia('(display-mode: standalone)').matches || installInvitationTimeout) return;
        if (localStorage.getItem('rm_pwa_invite_dismissed') === 'true') return;

        let os = 'other';
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) os = 'android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
        else if (/win/i.test(ua)) os = 'windows';

        [installWindowsBtn, installAndroidBtn, installIosBtn].forEach(btn => btn.classList.add('disabled'));
        const activeBtn = os === 'android' ? installAndroidBtn :
                          (os === 'ios' ? installIosBtn :
                          (os === 'windows' ? installWindowsBtn : null));
        if (activeBtn) activeBtn.classList.remove('disabled');
        installPwaInvitation.style.display = 'flex';
        installInvitationTimeout = true;
    }

    function hideInstallInvitation() {
        installPwaInvitation.style.display = 'none';
        localStorage.setItem('rm_pwa_invite_dismissed', 'true');
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
        const name = btn.closest('.custom-option')?.querySelector('.custom-option-name')?.textContent || '';
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
        let favs = getFavorites();
        if (!favs.includes(id)) {
            favs.push(id);
            saveFavorites(favs);
            updateFavoriteButtonUI(id, true);
            showNotification('Estación añadida');
        }
    }
    function removeFavorite(id) {
        let favs = getFavorites().filter(fid => fid !== id);
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
    // VALIDACIÓN DE ESTACIONES
    // ==========================================================================
    function validateStation(station) {
        return station && station.id && station.url && station.service && station.name;
    }

    // ==========================================================================
    // CARGA DE ESTACIONES
    // ==========================================================================
    async function loadStations() {
        try {
            const res = await fetch('/stations.json');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const allStations = await res.json();

            if (!Array.isArray(allStations)) throw new Error('stations.json must be an array');

            const validStations = allStations.filter(validateStation);
            if (validStations.length === 0) throw new Error('No valid stations found in stations.json');

            const grouped = validStations.reduce((acc, s) => {
                const name = s.service === 'somafm' ? 'SomaFM' :
                            s.service === 'radioparadise' ? 'Radio Paradise' :
                            s.service === 'nrk' ? 'NRK Radio' : 'Otro';
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
                songArtist.textContent = '';
                songAlbum.textContent = '';
                updateShareButtonVisibility();
                updateStatus(false);
            }
            showWelcomeScreen();
            return grouped;
        } catch (e) {
            if (loadingStations) {
                loadingStations.textContent = 'Error al cargar estaciones. Recarga.';
                loadingStations.style.color = '#ff6600';
            }
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
                opt.textContent = s.name;
                grp.appendChild(opt);
            });
            stationSelect.appendChild(grp);
        }
    }

    // ==========================================================================
    // ACTUALIZACIÓN DE INFORMACIÓN DE CANCIÓN
    // ==========================================================================
    async function fetchSongDetails(artist, title, album) {
        if (!artist || !title || isUpdatingSongInfo) return;

        isUpdatingSongInfo = true;
        if (songFetchController) songFetchController.abort();
        songFetchController = new AbortController();

        const sA = artist.trim();
        const sT = title.trim();
        const sAl = album ? album.trim() : "";

        let spotifyIsrc = null;
        try {
            const u = `https://core.chcs.workers.dev/spotify?artist=${encodeURIComponent(sA)}&title=${encodeURIComponent(sT)}&album=${encodeURIComponent(sAl)}`;
            const res = await fetch(u, { signal: songFetchController.signal });
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const d = await res.json();
            if (d && d.imageUrl) {
                displayAlbumCoverFromUrl(d.imageUrl);
                updateAlbumDetailsWithSpotifyData(d);
                if (d.duration) {
                    trackDuration = d.duration;
                    const m = Math.floor(trackDuration / 60);
                    const s = Math.floor(trackDuration % 60);
                    totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                }
                if (d.isrc) spotifyIsrc = d.isrc;
            }
            await getMusicBrainzDuration(sA, sT, sAl, spotifyIsrc);
        } catch (e) {
            if (e.name === 'AbortError') {
                isUpdatingSongInfo = false;
                return;
            }
            logErrorForAnalysis('Spotify error', { error: e.message, artist: sA, title: sT, timestamp: new Date().toISOString() });
        } finally {
            isUpdatingSongInfo = false;
        }
    }

    function updateAlbumDetailsWithSpotifyData(data) {
        if (data.releaseDate) {
            const d = new Date(data.releaseDate);
            if (!isNaN(d.getTime())) {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                releaseDate.textContent = d.toLocaleDateString('es-ES', options);
            } else {
                releaseDate.textContent = data.releaseDate;
            }
        } else {
            releaseDate.textContent = '';
        }

        recordLabel.textContent = data.label || '';
        albumTrackCount.textContent = data.totalTracks ? `${data.totalTracks} canciones` : '';
        if (data.albumDuration) {
            const m = Math.floor(data.albumDuration / 60);
            const s = Math.floor(data.albumDuration % 60);
            albumTotalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        } else {
            albumTotalDuration.textContent = '';
        }
        trackGenre.textContent = data.genres && data.genres.length > 0 ? data.genres.join(', ') : '';
        trackPosition.textContent = data.trackNumber ? `Pista ${data.trackNumber}` : '';
        currentCredits = data.credits || "";
        updateTooltipPosition();
    }

    async function getMusicBrainzDuration(artist, title, album, spotifyIsrc) {
        if (!canMakeApiCall('musicBrainz') || isUpdatingSongInfo) return;
        try {
            let query = `artist:"${artist}" AND recording:"${title}"`;
            if (album) query += ` AND release:"${album}"`;
            const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.recordings && data.recordings.length > 0) {
                const rec = data.recordings[0];
                if (rec.length) {
                    const durationSec = Math.floor(rec.length / 1000);
                    if (durationSec > 0 && (!trackDuration || trackDuration < 30)) {
                        trackDuration = durationSec;
                        const m = Math.floor(trackDuration / 60);
                        const s = Math.floor(trackDuration % 60);
                        totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    }
                }
                if (spotifyIsrc === null && rec.isrcs && rec.isrcs.length > 0) {
                    trackIsrc.textContent = rec.isrcs[0];
                }
            }
        } catch (error) {
            logErrorForAnalysis('MusicBrainz error', { error: error.message, artist, title, timestamp: new Date().toISOString() });
        }
    }

    // ==========================================================================
    // MANEJO DE ESTADOS
    // ==========================================================================
    function updateStatus(playing) {
        isPlaying = playing;
        playBtn.style.display = playing ? 'none' : '';
        stopBtn.style.display = playing ? '' : 'none';
        if (playing) {
            startTimeStuckCheck();
            startCountdownTimer();
        } else {
            clearTimeStuckCheck();
            clearCountdownTimer();
        }
    }

    function startCountdownTimer() {
        clearCountdownTimer();
        if (trackDuration <= 0) {
            countdownTimer.textContent = '--:--';
            return;
        }
        countdownInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - trackStartTime) / 1000);
            const remaining = Math.max(0, trackDuration - elapsed);
            const m = Math.floor(remaining / 60);
            const s = Math.floor(remaining % 60);
            countdownTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 1000);
        cleanupFunctions.push(() => clearInterval(countdownInterval));
    }

    function clearCountdownTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function handlePlaybackError() {
        isPlaying = false;
        updateStatus(false);
        songTitle.textContent = 'Error de reproducción';
        songArtist.textContent = 'Reconectando...';
        setTimeout(() => {
            if (currentStation) {
                audioPlayer.src = currentStation.url;
                playStation();
            }
        }, 5000);
    }

    // ==========================================================================
    // REPRODUCCIÓN
    // ==========================================================================
    let currentPlayPromiseId = 0;
    async function playStation() {
        if (!currentStation) return;

        const thisPlayId = ++currentPlayPromiseId;
        if (isPlaying) {
            audioPlayer.pause();
            updateStatus(false);
        }

        try {
            audioPlayer.src = currentStation.url;
            await audioPlayer.play();
            if (currentPlayPromiseId !== thisPlayId) return;

            await joinStation(currentStation.id);
            updateStatus(true);
            showPlaybackInfo();
            songTitle.textContent = 'Reproduciendo...';
            songArtist.textContent = currentStation.name;
            songAlbum.textContent = '';
            resetUIForNewTrack();
            if (currentStation.service === 'somafm' || currentStation.service === 'radioparadise') {
                startRapidSongCheck();
            }
        } catch (error) {
            isPlaying = false;
            updateStatus(false);
            songTitle.textContent = 'Error de reproducción';
            songArtist.textContent = 'Revisar conexión';
            logErrorForAnalysis('Playback error', { error: error.message, station: currentStation?.id });
        }
    }

    function startRapidSongCheck() {
        if (rapidCheckInterval) clearInterval(rapidCheckInterval);
        lastSongCheckTime = 0;
        rapidCheckInterval = setInterval(checkForNewSong, RAPID_CHECK_THRESHOLD);
        cleanupFunctions.push(() => clearInterval(rapidCheckInterval));
    }

    async function checkForNewSong() {
        if (!currentStation || !isPlaying) return;
        const now = Date.now();
        if (now - lastSongCheckTime < RAPID_CHECK_THRESHOLD) return;
        lastSongCheckTime = now;

        if (currentStation.service === 'somafm') {
            await updateSomaFmInfo();
        } else if (currentStation.service === 'radioparadise') {
            await updateRadioParadiseInfo();
        }
    }

    async function updateSomaFmInfo() {
        if (!canMakeApiCall('somaFM') || !currentStation?.channel) return;
        try {
            const res = await fetch(`https://api.somafm.com/song/${currentStation.channel}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.song) {
                const newTrack = data.song[0];
                if (newTrack && newTrack.artist && newTrack.title) {
                    const artist = newTrack.artist.replace(/<[^>]*>/g, '').trim();
                    const title = newTrack.title.replace(/<[^>]*>/g, '').trim();
                    if (isCurrentTrackDifferent(artist, title)) {
                        currentTrackInfo = { artist, title };
                        songTransitionDetected = true;
                        songTitle.textContent = title;
                        songArtist.textContent = artist;
                        songAlbum.textContent = '';
                        trackDuration = newTrack.length || 0;
                        trackStartTime = newTrack.date ? (newTrack.date * 1000 - 1000) : Date.now() - 15000;
                        resetUIForNewTrack();
                        fetchSongDetails(artist, title, "");
                        updateShareButtonVisibility();
                        startCountdownTimer();
                    }
                }
            }
        } catch (error) {
            logErrorForAnalysis('SomaFM API error', { error: error.message });
        }
    }

    async function updateRadioParadiseInfo() {
        if (!canMakeApiCall('radioParadise')) return;
        try {
            const res = await fetch('https://api.radioparadise.com/api/nowplaying_list?chan=0&list_pos=0&include_images=1');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.length > 0) {
                const track = data[0];
                if (track.artist && track.title) {
                    const artist = track.artist.replace(/<[^>]*>/g, '').trim();
                    const title = track.title.replace(/<[^>]*>/g, '').trim();
                    if (isCurrentTrackDifferent(artist, title)) {
                        currentTrackInfo = { artist, title };
                        songTransitionDetected = true;
                        songTitle.textContent = title;
                        songArtist.textContent = artist;
                        songAlbum.textContent = track.album || '';
                        trackDuration = track.duration || 0;
                        trackStartTime = track.start_time ? (track.start_time * 1000) : Date.now() - 15000;
                        resetUIForNewTrack();
                        fetchSongDetails(artist, title, track.album);
                        updateShareButtonVisibility();
                        startCountdownTimer();
                    }
                }
            }
        } catch (error) {
            logErrorForAnalysis('Radio Paradise API error', { error: error.message });
        }
    }

    function isCurrentTrackDifferent(artist, title) {
        if (!currentTrackInfo) return true;
        return currentTrackInfo.artist !== artist || currentTrackInfo.title !== title;
    }

    function resetUIForNewTrack() {
        resetAlbumCover();
        releaseDate.textContent = '';
        recordLabel.textContent = '';
        albumTrackCount.textContent = '';
        albumTotalDuration.textContent = '';
        trackGenre.textContent = '';
        trackPosition.textContent = '';
        trackIsrc.textContent = '';
        currentCredits = "";
        updateTooltipPosition();
    }

    // ==========================================================================
    // EVENTOS Y MANEJADORES
    // ==========================================================================
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

    if (playBtn) playBtn.addEventListener('click', playStation);
    if (stopBtn) stopBtn.addEventListener('click', () => {
        if (isPlaying) {
            audioPlayer.pause();
            updateStatus(false);
            leaveStation(currentStationId);
            showWelcomeScreen();
        }
    });

    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            const vol = volumeSlider.value / 100;
            audioPlayer.volume = vol;
            if (vol === 0) {
                isMuted = true;
                previousVolume = 50;
            } else {
                isMuted = false;
                previousVolume = vol * 100;
            }
            updateVolumeIconPosition();
        });
        volumeSlider.value = 50;
        updateVolumeIconPosition();
    }

    if (shareButton) {
        shareButton.addEventListener('click', () => {
            shareOptions.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!shareButton.contains(e.target) && !shareOptions.contains(e.target)) {
                shareOptions.classList.remove('active');
            }
        });
        if (shareWhatsApp) shareWhatsApp.addEventListener('click', () => {
            const title = songTitle.textContent;
            const artist = songArtist.textContent;
            const text = encodeURIComponent(`Estoy escuchando: ${title} - ${artist} en RadioMax`);
            window.open(`https://wa.me/?text=${text}`, '_blank');
        });
    }

    if (closeInvitationBtn) closeInvitationBtn.addEventListener('click', hideInstallInvitation);
    if (installWindowsBtn) installWindowsBtn.addEventListener('click', () => window.location.href = '/install-windows');
    if (installAndroidBtn) installAndroidBtn.addEventListener('click', () => window.location.href = '/install-android');
    if (installIosBtn) installIosBtn.addEventListener('click', () => window.location.href = '/install-ios');

    if (filterToggleStar) {
        filterToggleStar.addEventListener('click', function() {
            showOnlyFavorites = !showOnlyFavorites;
            this.classList.toggle('active', showOnlyFavorites);
            this.setAttribute('aria-label', showOnlyFavorites ? 'Mostrar todas' : 'Solo favoritas');
            this.title = showOnlyFavorites ? 'Todas las estaciones' : 'Solo estaciones favoritas';
            if (showOnlyFavorites) filterStationsByFavorites(); else showAllStations();
        });
    }

    // ==========================================================================
    // LIMPIEZA AL CERRAR
    // ==========================================================================
    function cleanupAll() {
        cleanupFunctions.forEach(fn => fn());
        cleanupFunctions = [];
        if (songFetchController) songFetchController.abort();
        if (currentChannel) leaveStation(currentStationId);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }

    window.addEventListener('beforeunload', cleanupAll);
    window.addEventListener('pagehide', cleanupAll);
    window.addEventListener('blur', () => {
        wasPlayingBeforeFocusLoss = isPlaying;
        if (isPlaying) {
            audioPlayer.pause();
            updateStatus(false);
        }
    });
    window.addEventListener('focus', () => {
        if (wasPlayingBeforeFocusLoss && currentStation) {
            playStation();
        }
    });

    // Iniciar
    loadStations().then(() => {
        setTimeout(showInstallInvitation, 5000);
    });
});
