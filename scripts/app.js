// app.js - v3.2.9
// ==========================================================================
// CHANGELOG v3.2.9 (28 de diciembre de 2025)
// ==========================================================================
// ✓ Optimización significativa en detección de nuevas canciones
// - SomaFM: polling base reducido a 4 segundos + rapid check a los 2.5 min (cada 2s)
// - Radio Paradise: nuevo polling dedicado cada 5 segundos + aceleración a 2s en los últimos 30s
// ✓ Protección contra llamadas concurrentes a la API (bandera isUpdatingSong)
// ✓ Mejora en la activación temprana del modo rápido en SomaFM
// ✓ Mantenimiento total de funcionalidades existentes (favoritos, presencia, PWA, etc.)
// ✓ Experiencia mucho más fluida: cambios de canción detectados en 2–5 segundos máx.
// ==========================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================================================
// CONFIGURACIÓN DE SUPABASE (PRESENCIA)
// ==========================================================================
const SUPABASE_URL = 'https://xahbzlhjolnugpbpnbmo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    let isUpdatingSong = false;
    const RAPID_CHECK_THRESHOLD = 150; // 2.5 minutos en segundos

    if (audioPlayer) audioPlayer.volume = 0.5;

    let customSelect = null;

    // ==========================================================================
    // FUNCIONES DE SUPABASE PRESENCE (CONTADOR DE OYENTES)
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
        if (currentChannel && currentStationId !== stationId) {
            await leaveStation(currentStationId);
        }
        currentStationId = stationId;
        const channelName = `station:${stationId}`;
        const channel = supabase.channel(channelName, {
            config: {
                presence: {
                    key: getUserUniqueID()
                }
            }
        });
        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const count = Object.keys(state).length;
                const counterElement = document.getElementById('totalListeners');
                if (counterElement) {
                    counterElement.innerText = count;
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
            await supabase.removeChannel(currentChannel);
            currentChannel = null;
            currentStationId = null;
            const counterElement = document.getElementById('totalListeners');
            if (counterElement) counterElement.innerText = '0';
        }
    }

    // ==========================================================================
    // FUNCIONES DE UTILIDAD
    // ==========================================================================
    const apiCallTracker = {
        somaFM: { lastCall: 0, minInterval: 4000 },
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
        if (!volumeSlider || !volumeIcon) return;
        const sliderWidth = volumeSlider.offsetWidth;
        const percent = volumeSlider.value / volumeSlider.max;
        const iconWidth = volumeIcon.offsetWidth;
        const newPosition = percent * sliderWidth - (iconWidth / 2);
        volumeIcon.style.left = `${newPosition}px`;
    }

    function updateShareButtonVisibility() {
        if (!songTitle || !songArtist || !shareButton) return;
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
            if (shareOptions) shareOptions.classList.remove('active');
        }
    }

    function showNotification(message) {
        if (notification) {
            notification.textContent = message;
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }
    }

    function showInstallInvitation() {
        if (window.matchMedia('(display-mode: standalone)').matches || installInvitationTimeout) {
            return;
        }
        let os = 'other';
        if (/android/i.test(navigator.userAgent)) os = 'android';
        else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) os = 'ios';
        else if (/win/i.test(navigator.userAgent)) os = 'windows';
        [installWindowsBtn, installAndroidBtn, installIosBtn].forEach(btn => btn?.classList.add('disabled'));
        const activeBtn = os === 'android' ? installAndroidBtn : (os === 'ios' ? installIosBtn : (os === 'windows' ? installWindowsBtn : null));
        if (activeBtn) activeBtn.classList.remove('disabled');
        if (installPwaInvitation) installPwaInvitation.style.display = 'flex';
        installInvitationTimeout = true;
    }

    function hideInstallInvitation() {
        if (installPwaInvitation) installPwaInvitation.style.display = 'none';
    }

    function attemptResumePlayback() {
        if (wasPlayingBeforeFocusLoss && !isPlaying && currentStation) {
            setTimeout(() => {
                if (!isPlaying) {
                    audioPlayer.play().then(() => {
                        isPlaying = true;
                        updateStatus(true);
                        startTimeStuckCheck();
                        showNotification('Reproducción reanudada automáticamente');
                    }).catch(error => {
                        showNotification('Toca para reanudar la reproducción');
                        if (playBtn) playBtn.style.animation = 'pulse 2s infinite';
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
            if (isFacebookActive()) {
                attemptResumePlayback();
            }
        }, 2000);
    }

    function checkAudioContext() {
        if (!audioPlayer.paused && isPlaying) {
            lastAudioContextTime = Date.now();
        } else if (isPlaying && !audioPlayer.paused) {
            if (audioPlayer.currentTime === lastAudioContextTime) {
                attemptResumePlayback();
            }
            lastAudioContextTime = audioPlayer.currentTime;
        }
    }

    function startAudioContextCheck() {
        if (audioContextCheckInterval) clearInterval(audioContextCheckInterval);
        audioContextCheckInterval = setInterval(() => {
            if (isPlaying && currentStation) {
                checkAudioContext();
            }
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
    // LÓGICA PARA GESTIONAR FAVORITOS
    // ==========================================================================
    const FAVORITES_KEY = 'radioMax_favorites';

    function getFavorites() {
        try {
            const favorites = localStorage.getItem(FAVORITES_KEY);
            return favorites ? JSON.parse(favorites) : [];
        } catch (error) {
            console.error("Error al leer favoritos de localStorage:", error);
            return [];
        }
    }

    function saveFavorites(favoritesList) {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritesList));
        } catch (error) {
            console.error("Error al guardar favoritos en localStorage:", error);
        }
    }

    function updateFavoriteButtonUI(stationId, isFavorite) {
        const btn = document.querySelector(`.favorite-btn[data-station-id="${stationId}"]`);
        if (btn) {
            if (isFavorite) {
                btn.innerHTML = '★';
                btn.classList.add('is-favorite');
                const stationName = btn.closest('.custom-option')?.querySelector('.custom-option-name')?.textContent;
                btn.setAttribute('aria-label', `Quitar ${stationName} de favoritos`);
            } else {
                btn.innerHTML = '☆';
                btn.classList.remove('is-favorite');
                const stationName = btn.closest('.custom-option')?.querySelector('.custom-option-name')?.textContent;
                btn.setAttribute('aria-label', `Añadir ${stationName} a favoritos`);
            }
        }
    }

    function addFavorite(stationId) {
        let favorites = getFavorites();
        if (!favorites.includes(stationId)) {
            favorites.push(stationId);
            saveFavorites(favorites);
            updateFavoriteButtonUI(stationId, true);
            showNotification('Estación añadida a favoritos');
        }
    }

    function removeFavorite(stationId) {
        let favorites = getFavorites();
        favorites = favorites.filter(id => id !== stationId);
        saveFavorites(favorites);
        updateFavoriteButtonUI(stationId, false);
        showNotification('Estación eliminada de favoritos');
    }

    function filterStationsByFavorites() {
        const favorites = getFavorites();
        const customOptions = document.querySelectorAll('.custom-option');
        customOptions.forEach(option => {
            const stationId = option.dataset.value;
            option.style.display = favorites.includes(stationId) ? 'block' : 'none';
        });
        document.querySelectorAll('.custom-optgroup-label').forEach(label => {
            let hasVisibleOptions = false;
            let nextElement = label.nextElementSibling;
            while (nextElement && nextElement.classList.contains('custom-option')) {
                if (nextElement.style.display !== 'none') {
                    hasVisibleOptions = true;
                    break;
                }
                nextElement = nextElement.nextElementSibling;
            }
            label.style.display = hasVisibleOptions ? 'block' : 'none';
        });
        showOnlyFavorites = true;
    }

    function showAllStations() {
        document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(element => {
            element.style.display = '';
        });
        showOnlyFavorites = false;
    }

    // ==========================================================================
    // CLASE PARA EL SELECTOR DE ESTACIONES PERSONALIZADO
    // ==========================================================================
    class CustomSelect {
        constructor(selectElement, optionsContainer) {
            this.select = selectElement;
            this.optionsContainer = optionsContainer;
            this.isOpen = false;
            this.selectedOption = null;
            this.init();
        }

        init() {
            this.select.style.display = 'none';
            this.optionsContainer.innerHTML = '';
            this.optionsContainer.addEventListener('click', (e) => this.handleClick(e));
            document.addEventListener('click', (e) => this.handleOutsideClick(e));
        }

        buildOptions(stations) {
            this.optionsContainer.innerHTML = '';
            const groups = {};
            
            stations.forEach(station => {
                const genre = station.genre || 'Otros';
                if (!groups[genre]) groups[genre] = [];
                groups[genre].push(station);
            });

            Object.entries(groups).forEach(([genre, stations]) => {
                // Label del grupo
                const label = document.createElement('div');
                label.className = 'custom-optgroup-label';
                label.textContent = genre;
                this.optionsContainer.appendChild(label);

                // Opciones
                stations.forEach(station => {
                    const option = document.createElement('div');
                    option.className = 'custom-option';
                    option.dataset.value = station.id;
                    option.innerHTML = `
                        <span class="custom-option-name">${station.name}</span>
                        <span class="custom-option-genre">${station.genre}</span>
                        <button class="favorite-btn" data-station-id="${station.id}">☆</button>
                    `;
                    this.optionsContainer.appendChild(option);
                });
            });

            // Actualizar botones de favoritos
            const favorites = getFavorites();
            document.querySelectorAll('.favorite-btn').forEach(btn => {
                const stationId = btn.dataset.stationId;
                const isFavorite = favorites.includes(stationId);
                updateFavoriteButtonUI(stationId, isFavorite);
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isFavorite) {
                        removeFavorite(stationId);
                    } else {
                        addFavorite(stationId);
                    }
                });
            });
        }

        handleClick(e) {
            if (e.target.closest('.favorite-btn')) return;
            
            const option = e.target.closest('.custom-option');
            if (option) {
                this.select.value = option.dataset.value;
                this.setSelected(option);
                this.toggle();
                const stationId = option.dataset.value;
                currentStation = stationsById[stationId];
                stationName.textContent = currentStation.name;
                updateShareButtonVisibility();
            }
        }

        setSelected(option) {
            if (this.selectedOption) {
                this.selectedOption.classList.remove('selected');
            }
            this.selectedOption = option;
            if (option) {
                option.classList.add('selected');
            }
        }

        toggle() {
            this.isOpen = !this.isOpen;
            this.optionsContainer.classList.toggle('open', this.isOpen);
        }

        handleOutsideClick(e) {
            if (!this.optionsContainer.contains(e.target)) {
                this.isOpen = false;
                this.optionsContainer.classList.remove('open');
            }
        }
    }

    // ==========================================================================
    // CARGA DE ESTACIONES DESDE stations.json
    // ==========================================================================
    async function loadStations() {
        try {
            if (loadingStations) loadingStations.style.display = 'block';
            const response = await fetch('stations.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}: No se pudo cargar stations.json`);
            
            const stations = await response.json();
            stationsById = {};
            
            stations.forEach(station => {
                stationsById[station.id] = station;
            });

            // Inicializar CustomSelect
            const customSelectContainer = document.querySelector('.custom-select-container') || stationSelect.parentElement;
            customSelect = new CustomSelect(stationSelect, customSelectContainer);
            customSelect.buildOptions(stations);

            // Event listeners para filtros
            if (filterToggleStar) {
                filterToggleStar.addEventListener('click', () => {
                    if (showOnlyFavorites) {
                        showAllStations();
                        filterToggleStar.innerHTML = '☆';
                        filterToggleStar.title = 'Mostrar solo favoritos';
                    } else {
                        filterStationsByFavorites();
                        filterToggleStar.innerHTML = '★';
                        filterToggleStar.title = 'Mostrar todas las estaciones';
                    }
                });
            }

            if (loadingStations) loadingStations.style.display = 'none';
            showWelcomeScreen();

        } catch (error) {
            console.error('Error cargando estaciones:', error);
            if (loadingStations) {
                loadingStations.textContent = 'Error al cargar estaciones. Revisa la consola.';
                loadingStations.style.color = '#ff6600';
            }
        }
    }

    // ==========================================================================
    // FUNCIONES DE PORTADA DE ÁLBUM
    // ==========================================================================
    function displayAlbumCoverFromUrl(url) {
        if (!albumCover) return;
        albumCover.src = url;
        albumCover.style.display = 'block';
        albumCover.onerror = () => resetAlbumCover();
    }

    function displayAlbumCover(coverData) {
        if (!albumCover) return;
        if (coverData && coverData.url) {
            displayAlbumCoverFromUrl(coverData.url);
        } else {
            resetAlbumCover();
        }
    }

    function resetAlbumCover() {
        if (!albumCover) return;
        albumCover.style.display = 'none';
        albumCover.src = '';
    }

    // ==========================================================================
    // FUNCIONES DE ACTUALIZACIÓN DE CANCIONES (OPTIMIZADAS v3.2.9)
    // ==========================================================================
    async function updateSomaFmInfo(bypassRateLimit = false) {
        if (!canMakeApiCall('somaFM') && !bypassRateLimit) return;

        try {
            const response = await fetch(currentStation.api_url);
            const data = await response.json();
            
            if (data.songs && data.songs.length > 0) {
                const song = data.songs[0];
                const newTrackInfo = `${song.artist} - ${song.title}`;
                
                if (currentTrackInfo !== newTrackInfo) {
                    currentTrackInfo = newTrackInfo;
                    songArtist.textContent = song.artist || '';
                    songTitle.textContent = song.title || '';
                    songAlbum.textContent = song.album || '';
                    trackStartTime = Date.now();
                    songTransitionDetected = true;
                    updateShareButtonVisibility();
                }
            }
        } catch (error) {
            logErrorForAnalysis('SomaFM API', error);
        }
    }

    async function updateRadioParadiseInfo(bypassRateLimit = false) {
        if (!canMakeApiCall('radioParadise') && !bypassRateLimit) return;

        try {
            const response = await fetch(currentStation.api_url);
            const data = await response.json();
            
            const newTrackInfo = `${data.artist} - ${data.title}`;
            
            if (currentTrackInfo !== newTrackInfo) {
                currentTrackInfo = newTrackInfo;
                songArtist.textContent = data.artist || '';
                songTitle.textContent = data.title || '';
                songAlbum.textContent = data.album || '';
                trackDuration = data.duration || 0;
                trackStartTime = Date.now();
                songTransitionDetected = true;
                
                if (data.cover) {
                    displayAlbumCoverFromUrl(data.cover);
                } else {
                    resetAlbumCover();
                }
                
                updateShareButtonVisibility();
                startCountdown();
            }
        } catch (error) {
            logErrorForAnalysis('Radio Paradise API', error);
        }
    }

    async function updateSongInfo(bypassRateLimit = false) {
        if (isUpdatingSong) return;
        isUpdatingSong = true;
        try {
            if (!currentStation || !currentStation.service) return;
            if (currentStation.service === 'somafm') {
                await updateSomaFmInfo(bypassRateLimit);
            } else if (currentStation.service === 'radioparadise') {
                await updateRadioParadiseInfo(bypassRateLimit);
            }
        } finally {
            isUpdatingSong = false;
        }
    }

    // ==========================================================================
    // POLLING OPTIMIZADO v3.2.9
    // ==========================================================================
    function startSomaFmPolling() {
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
            updateSongInfo(true);
        }, 4000);
    }

    function startRadioParadisePolling() {
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
            updateRadioParadiseInfo(true);
        }, 5000);
        
        if (trackDuration > 30) {
            const accelerateTime = (trackDuration - 30) * 1000;
            setTimeout(() => {
                if (isPlaying && currentStation?.service === 'radioparadise') {
                    clearInterval(updateInterval);
                    updateInterval = setInterval(() => {
                        updateRadioParadiseInfo(true);
                    }, 2000);
                }
            }, accelerateTime);
        }
    }

    // ==========================================================================
    // REPRODUCCIÓN
    // ==========================================================================
    function updateStatus(playing) {
        if (playing) {
            playBtn.textContent = '⏸️';
            playBtn.title = 'Pausar';
        } else {
            playBtn.textContent = '▶️';
            playBtn.title = 'Reproducir';
        }
    }

    function handlePlaybackError() {
        showNotification('Error de reproducción. Revisa la conexión.');
        isPlaying = false;
        updateStatus(false);
    }

    function playStation() {
        if (!currentStation) {
            showNotification('Selecciona una estación primero');
            return;
        }

        audioPlayer.src = currentStation.stream_url;
        stationName.textContent = currentStation.name;
        
        audioPlayer.play()
            .then(() => {
                isPlaying = true;
                updateStatus(true);
                startTimeStuckCheck();
                showPlaybackInfo();
                wasPlayingBeforeFocusLoss = true;
                
                if (currentStation.id) {
                    joinStation(currentStation.id);
                }
                
                if (currentStation.service === 'somafm') {
                    startSomaFmPolling();
                    updateSongInfo(true);
                } else if (currentStation.service === 'radioparadise') {
                    startRadioParadisePolling();
                    updateSongInfo(true);
                }
                
                startPlaybackChecks();
                songTitle.textContent = 'Conectando...';
                songArtist.textContent = '';
            })
            .catch(error => {
                handlePlaybackError();
            });
    }

    function stopStation() {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        isPlaying = false;
        updateStatus(false);
        showWelcomeScreen();
        
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        if (rapidCheckInterval) {
            clearInterval(rapidCheckInterval);
            rapidCheckInterval = null;
        }
        if (currentStation?.id) {
            leaveStation(currentStation.id);
        }
        stopPlaybackChecks();
        resetAlbumCover();
        songTitle.textContent = 'Seleccionar estación';
        songArtist.textContent = '';
    }

    // ==========================================================================
    // COUNTDOWN MEJORADO v3.2.9
    // ==========================================================================
    function resetCountdown() {
        if (countdownTimer) countdownTimer.textContent = '--:--';
        if (totalDuration) totalDuration.textContent = '--:--';
        trackDuration = 0;
        trackStartTime = 0;
    }

    function startCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        if (!trackStartTime) {
            resetCountdown();
            return;
        }

        if (trackDuration > 0) {
            const totalMinutes = Math.floor(trackDuration / 60);
            const totalSeconds = Math.floor(trackDuration % 60);
            if (totalDuration) totalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
        } else {
            if (totalDuration) totalDuration.textContent = '(--:--)';
        }

        // Rapid check optimizado para SomaFM
        if (currentStation?.service === 'somafm') {
            const checkRapidMode = () => {
                if (songTransitionDetected) return;
                const elapsed = (Date.now() - trackStartTime) / 1000;
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
                }
            };
            checkRapidMode();
            const rapidCheckTimer = setInterval(() => {
                if (!isPlaying || currentStation?.service !== 'somafm') {
                    clearInterval(rapidCheckTimer);
                    return;
                }
                checkRapidMode();
            }, 5000);
        }

        function updateTimer() {
            if (!isPlaying || !trackStartTime) {
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                return;
            }

            const elapsed = Math.floor((Date.now() - trackStartTime) / 1000);
            const remaining = trackDuration > 0 ? Math.max(0, trackDuration - elapsed) : 0;
            
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            if (countdownTimer) {
                countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }

            animationFrameId = requestAnimationFrame(updateTimer);
        }
        animationFrameId = requestAnimationFrame(updateTimer);
    }

    // ==========================================================================
    // EVENT LISTENERS
    // ==========================================================================
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (isPlaying) {
                stopStation();
            } else {
                playStation();
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', stopStation);
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            audioPlayer.volume = e.target.value / 100;
            updateVolumeIconPosition();
            isMuted = audioPlayer.volume === 0;
            previousVolume = isMuted ? previousVolume : audioPlayer.volume * 100;
        });
    }

    if (shareWhatsApp) {
        shareWhatsApp.addEventListener('click', () => {
            const text = `${songArtist.textContent} - ${songTitle.textContent} | ${stationName.textContent}`;
            const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        });
    }

    if (closeInvitationBtn) {
        closeInvitationBtn.addEventListener('click', hideInstallInvitation);
    }

    // Detectar visibilidad de página
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && wasPlayingBeforeFocusLoss && !isPlaying) {
            attemptResumePlayback();
        }
    });

    // ==========================================================================
    // INICIALIZACIÓN
    // ==========================================================================
    loadStations();

    // PWA Install
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        setTimeout(showInstallInvitation, 3000);
    });

    if (installWindowsBtn) installWindowsBtn.addEventListener('click', () => deferredPrompt?.prompt());
    if (installAndroidBtn) installAndroidBtn.addEventListener('click', () => deferredPrompt?.prompt());
    if (installIosBtn) installIosBtn.addEventListener('click', () => showNotification('Añade a pantalla de inicio desde Safari'));

    // Version check
    const versionSpan = document.getElementById('version-number');
    if (versionSpan) {
        versionSpan.textContent = '3.2.9';
    }

} catch (error) {
    console.error("Error fatal durante la inicialización de la aplicación:", error);
    const loadingElement = document.getElementById('loadingStations');
    if (loadingElement) {
        loadingElement.textContent = `Error crítico: ${error.message}. Revisa la consola para más detalles.`;
        loadingElement.style.color = '#ff6600';
    }
}
});
