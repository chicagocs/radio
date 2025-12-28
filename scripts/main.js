// scripts/main.js - v3.2.8
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getUserUniqueID, joinStation, leaveStation } from './supabase-presence.js';
import {
  getFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
  loadStations,
  getLastSelectedStationId,
  saveLastSelectedStation,
  findStationById
} from './station-manager.js';
import { AudioPlayer } from './audio-player.js';
import {
  fetchSomaFmInfo,
  fetchRadioParadiseInfo,
  fetchSpotifyDetails,
  fetchMusicBrainzDuration,
  logErrorForAnalysis
} from './metadata-fetchers.js';
import {
  initializeUI,
  updateUIWithTrackInfo,
  resetUI,
  resetAlbumCover,
  displayAlbumCoverFromUrl,
  resetAlbumDetails,
  updateAlbumDetailsWithSpotifyData,
  updateShareButtonVisibility,
  updateTotalDurationDisplay,
  showWelcomeScreen,
  showPlaybackInfo,
  showNotification
} from './ui-controller.js';

const SUPABASE_URL = 'https://xahbzlhjolnugpbpnbmo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentChannel = null;
let currentStationId = null;

document.addEventListener('DOMContentLoaded', () => {
  try {
    // 1. Seleccionar elementos del DOM
    const stationSelect = document.getElementById('stationSelect');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const audioPlayerEl = document.getElementById('audioPlayer');
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

    // 2. INICIALIZAR UI INMEDIATAMENTE
    const uiElements = {
      stationName, songTitle, songArtist, songAlbum, albumCover,
      releaseDate, recordLabel, albumTrackCount, albumTotalDuration,
      trackGenre, trackPosition, trackIsrc,
      shareButton, shareOptions,
      countdownTimer, totalDuration,
      welcomeScreen, playbackInfo
    };
    initializeUI(uiElements);

    // 3. Variables de estado
    let stationsById = {};
    let currentStation = null;
    let updateInterval = null;
    let countdownInterval = null;
    let installInvitationTimeout = null;
    let showOnlyFavorites = false;
    let pageFocusCheckInterval = null;
    let facebookVideoDetected = false;
    let animationFrameId = null;
    let rapidCheckInterval = null;
    let songTransitionDetected = false;
    const RAPID_CHECK_THRESHOLD = 210;
    let currentTrackInfo = null;
    let trackDuration = 0;
    let trackStartTime = 0;

    // 4. Instancia del reproductor
    const audioPlayer = new AudioPlayer(
      audioPlayerEl,
      playBtn,
      stopBtn,
      volumeSlider,
      volumeIcon,
      notification
    );

    // 5. Funciones de favoritos
    function updateFavoriteButtonUI(stationId, isFavorite) {
      const btn = document.querySelector(`.favorite-btn[data-station-id="${stationId}"]`);
      if (!btn) return;
      if (isFavorite) {
        btn.innerHTML = '★';
        btn.classList.add('is-favorite');
        const name = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
        btn.setAttribute('aria-label', `Quitar ${name} de favoritos`);
      } else {
        btn.innerHTML = '☆';
        btn.classList.remove('is-favorite');
        const name = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
        btn.setAttribute('aria-label', `Añadir ${name} a favoritos`);
      }
    }

    function filterStationsByFavorites() {
      const favorites = getFavorites();
      document.querySelectorAll('.custom-option').forEach(option => {
        option.style.display = favorites.includes(option.dataset.value) ? 'block' : 'none';
      });
      document.querySelectorAll('.custom-optgroup-label').forEach(label => {
        let hasVisible = false;
        let next = label.nextElementSibling;
        while (next && next.classList.contains('custom-option')) {
          if (next.style.display !== 'none') { hasVisible = true; break; }
          next = next.nextElementSibling;
        }
        label.style.display = hasVisible ? 'block' : 'none';
      });
    }

    function showAllStations() {
      document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(el => el.style.display = '');
    }

    // 6. Clase CustomSelect (CORREGIDA)
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
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          // ✅ Actualizar favoritos SOLO después de crear el DOM
          const favoriteIds = getFavorites();
          favoriteIds.forEach(id => updateFavoriteButtonUI(id, true));
        }, 100);
      }

      populateOptions() {
        this.customOptions.innerHTML = '';
        const children = Array.from(this.originalSelect.children);
        children.forEach(child => {
          if (child.tagName === 'OPTGROUP') {
            const optgroupLabel = document.createElement('div');
            optgroupLabel.className = 'custom-optgroup-label';
            optgroupLabel.textContent = child.label;
            this.customOptions.appendChild(optgroupLabel);
            const groupOptions = child.querySelectorAll('option');
            groupOptions.forEach(opt => this.createCustomOption(opt));
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
        let description = '';
        let tags = [];
        let promotions = [];
        if (station) {
          name = station.name;
          if (station.service === 'radioparadise') {
            name = station.name.split(' - ')[1] || station.name;
          }
          description = station.description || '';
          tags = station.tags || [];
          promotions = station.promotions || [];
        }
        const stationInfoContainer = document.createElement('div');
        stationInfoContainer.className = 'station-info';
        const stationDetails = document.createElement('div');
        stationDetails.className = 'station-details';
        const nameElement = document.createElement('span');
        nameElement.className = 'custom-option-name';
        nameElement.textContent = name;
        stationDetails.appendChild(nameElement);
        if (description) {
          const descElement = document.createElement('span');
          descElement.className = 'custom-option-description';
          descElement.textContent = description;
          stationDetails.appendChild(descElement);
        }
        if (tags && tags.length > 0) {
          const tagsContainer = document.createElement('div');
          tagsContainer.className = 'station-tags-container';
          tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'station-tag';
            tagElement.textContent = tag;
            tagsContainer.appendChild(tagElement);
          });
          stationDetails.appendChild(tagsContainer);
        }
        stationInfoContainer.appendChild(stationDetails);
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'favorite-btn';
        favoriteBtn.innerHTML = '☆';
        favoriteBtn.dataset.stationId = option.value;
        favoriteBtn.setAttribute('aria-label', `Añadir ${name} a favoritos`);
        favoriteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const stationId = e.target.dataset.stationId;
          const isFavorite = e.target.classList.contains('is-favorite');
          if (isFavorite) {
            removeFavorite(stationId);
          } else {
            addFavorite(stationId);
          }
        });
        stationInfoContainer.appendChild(favoriteBtn);
        if (promotions && promotions.length > 0) {
          const promotionsContainer = document.createElement('div');
          promotionsContainer.className = 'station-promotions-container';
          promotions.forEach(promo => {
            const promoLink = document.createElement('a');
            promoLink.href = promo.url;
            promoLink.textContent = promo.text;
            promoLink.className = `station-promotion-link station-promotion-link-${promo.type}`;
            promoLink.target = '_blank';
            promoLink.rel = 'noopener noreferrer';
            promotionsContainer.appendChild(promoLink);
          });
          stationDetails.appendChild(promotionsContainer);
        }
        customOption.appendChild(stationInfoContainer);
        this.customOptions.appendChild(customOption);
      }

      initEvents() {
        this.customSelectTrigger.addEventListener('click', () => {
          this.toggle();
          this.updateSelectedOption();
          if (!this.hasScrolledToSelection) {
            const selectedOption = this.customOptions.querySelector('.custom-option.selected');
            if (selectedOption) {
              setTimeout(() => {
                selectedOption.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }, 50);
            }
            this.hasScrolledToSelection = true;
          }
        });
        const customOptions = this.customOptions.querySelectorAll('.custom-option');
        customOptions.forEach(option => {
          option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.dataset.value;
            this.originalSelect.value = value;
            this.updateTriggerText();
            this.updateSelectedOption();
            this.close();
            this.originalSelect.dispatchEvent(new Event('change'));
          });
        });
        document.addEventListener('click', (e) => {
          if (!this.customSelectWrapper.contains(e.target)) {
            this.close();
          }
        });
      }

      toggle() { this.customSelectWrapper.classList.toggle('open'); }
      open() { this.customSelectWrapper.classList.add('open'); }
      close() { this.customSelectWrapper.classList.remove('open'); }
      updateSelectedOption() {
        const selectedValue = this.originalSelect.value;
        const customOptions = this.customOptions.querySelectorAll('.custom-option');
        customOptions.forEach(option => {
          if (option.dataset.value === selectedValue) {
            option.classList.add('selected');
          } else {
            option.classList.remove('selected');
          }
        });
      }
      updateTriggerText() {
        const selectedOption = this.originalSelect.options[this.originalSelect.selectedIndex];
        const station = stationsById[selectedOption.value];
        let text = selectedOption.textContent;
        if (station) {
          text = station.name;
          if (station.service === 'radioparadise') {
            text = station.name.split(' - ')[1] || station.name;
          }
        }
        this.customSelectTrigger.textContent = text || " Seleccionar Estación ";
      }
    }

    // 7. Funciones de metadatos (CORREGIDAS)
    async function updateSongInfo() {
      if (!currentStation?.service) return;
      try {
        let trackInfo;
        if (currentStation.service === 'somafm') {
          trackInfo = await fetchSomaFmInfo(currentStation.id);
        } else if (currentStation.service === 'radioparadise') {
          trackInfo = await fetchRadioParadiseInfo(currentStation.channelId || 1);
        } else {
          return;
        }

        const isNewTrack = !currentTrackInfo ||
          currentTrackInfo.title !== trackInfo.title ||
          currentTrackInfo.artist !== trackInfo.artist;

        if (isNewTrack) {
          resetAlbumDetails();
          currentTrackInfo = trackInfo;
          updateUIWithTrackInfo(trackInfo);
          resetAlbumCover();
          if (trackInfo.date) {
            trackStartTime = trackInfo.date.getTime();
          } else {
            trackStartTime = Date.now();
          }
          trackDuration = trackInfo.duration || 0;
          startCountdown();
        }

        // ✅ CORRECCIÓN CLAVE: Llamar SIEMPRE a enrichTrackMetadata si hay datos
        if (trackInfo.artist && trackInfo.title) {
          enrichTrackMetadata(trackInfo.artist, trackInfo.title, trackInfo.album);
        }
      } catch (error) {
        logErrorForAnalysis('Metadata update error', {
          error: error.message,
          station: currentStation.id,
          service: currentStation.service
        });
        resetUI();
      }
    }

    async function enrichTrackMetadata(artist, title, album) {
      try {
        const spotifyData = await fetchSpotifyDetails(artist, title, album);
        displayAlbumCoverFromUrl(spotifyData.imageUrl);
        updateAlbumDetailsWithSpotifyData(spotifyData);
        if (spotifyData.duration) {
           trackDuration = spotifyData.duration; // Actualiza la duración global
           updateTotalDurationDisplay(trackDuration);
      
          if (countdownTimer.textContent === '--:--' || trackDuration === 0) {
            // Opcional: Lógica para reiniciar visualización si es necesario
         }
        }
      } catch (spotifyError) {
        logErrorForAnalysis('Spotify enrichment failed', { error: spotifyError.message });
      }
      try {
        const duration = await fetchMusicBrainzDuration(artist, title);
        trackDuration = duration;
        updateTotalDurationDisplay(trackDuration);
      } catch (mbError) {
        logErrorForAnalysis('MusicBrainz fallback failed', { error: mbError.message });
      }
    }

    // 8. Temporizador
    function resetCountdown() {
      if (countdownInterval) clearInterval(countdownInterval);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (rapidCheckInterval) clearInterval(rapidCheckInterval);
      trackDuration = 0;
      trackStartTime = 0;
      countdownTimer.textContent = '--:--';
      updateTotalDurationDisplay(0);
      trackPosition.textContent = '--/--';
      countdownTimer.classList.remove('ending');
      songTransitionDetected = false;
    }

    function startCountdown() {
      resetCountdown();
      if (!trackStartTime) return;
      updateTotalDurationDisplay(trackDuration);
      if (currentStation?.service === 'somafm' && !songTransitionDetected) {
        const checkRapidMode = () => {
          const elapsed = (Date.now() - trackStartTime) / 1000;
          if (elapsed > RAPID_CHECK_THRESHOLD && !rapidCheckInterval) {
            rapidCheckInterval = setInterval(() => {
              if (currentStation?.service === 'somafm') {
                updateSongInfo();
              } else {
                if (rapidCheckInterval) clearInterval(rapidCheckInterval);
              }
            }, 3000);
          }
        };
        checkRapidMode();
        setInterval(() => {
          if (!audioPlayer.isPlaying || currentStation?.service !== 'somafm') return;
          checkRapidMode();
        }, 10000);
      }
      function updateTimer() {
        const now = Date.now();
        const elapsed = (now - trackStartTime) / 1000;
        let displayTime = trackDuration > 0 ? Math.max(0, trackDuration - elapsed) : elapsed;
        const minutes = Math.floor(displayTime / 60);
        const seconds = Math.floor(displayTime % 60);
        countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        countdownTimer.classList.toggle('ending', trackDuration > 0 && displayTime < 10);
        if ((trackDuration > 0 && displayTime > 0) || trackDuration === 0) {
          animationFrameId = requestAnimationFrame(updateTimer);
        } else {
          countdownTimer.textContent = '00:00';
          countdownTimer.classList.remove('ending');
          if (currentStation?.service === 'nrk') {
            stopBtn.click();
          } else {
            updateSongInfo();
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = setInterval(updateSongInfo, 30000);
          }
        }
      }
      updateTimer();
    }

    // 9. Reproducción
    function handlePlaybackError() {
      if (audioPlayer.isReconnecting) return;
      if (!audioPlayerEl.paused && audioPlayerEl.currentTime > 0) {
        console.log('El audio está reproduciéndose, no se inicia el gestor de reconexión');
        return;
      }
      leaveStation(supabase);
      resetCountdown();
      resetAlbumCover();
      resetAlbumDetails();
      showWelcomeScreen();
      songTitle.textContent = 'Reconectando...';
      songArtist.textContent = 'La reproducción se reanudará automáticamente.';
      songAlbum.textContent = '';
      updateShareButtonVisibility();
      logErrorForAnalysis('Playback error', {
        station: currentStation?.id || 'unknown',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      audioPlayer.handlePlaybackError(() => {
        if (currentStation && currentStation.service !== 'nrk') {
          startSongInfoUpdates();
        }
      });
    }

    async function playStation() {
      if (!currentStation) { alert('Por favor, seleccionar una estación'); return; }
      if (updateInterval) clearInterval(updateInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (rapidCheckInterval) clearInterval(rapidCheckInterval);
      currentTrackInfo = null;
      trackDuration = 0;
      trackStartTime = 0;
      resetCountdown();
      resetAlbumDetails();
      songTitle.textContent = 'Conectando...';
      songArtist.textContent = '';
      songAlbum.textContent = '';
      resetAlbumCover();
      updateShareButtonVisibility();
      if (currentStation.service === 'nrk') {
        audioPlayerEl.addEventListener('loadedmetadata', () => {
          trackDuration = audioPlayerEl.duration;
          trackStartTime = Date.now();
          const newTrackInfo = {
            title: currentStation.name,
            artist: currentStation.description,
            album: `Emisión del ${extractDateFromUrl(currentStation.url)}`
          };
          currentTrackInfo = newTrackInfo;
          updateUIWithTrackInfo(newTrackInfo);
          resetAlbumCover();
          resetAlbumDetails();
          startCountdown();
          updateShareButtonVisibility();
        }, { once: true });
      }
      try {
        await audioPlayer.play(currentStation.url);
        showPlaybackInfo();
        if (currentStation.id) {
          await joinStation(supabase, currentStation.id);
        }
        if (currentStation.service === 'somafm') {
          startSomaFmPolling();
        } else {
          setTimeout(() => startSongInfoUpdates(), 5000);
        }
        if (installInvitationTimeout === null) {
          setTimeout(showInstallInvitation, 600000);
        }
        setTimeout(() => {
          if (audioPlayer.isPlaying) startPlaybackChecks();
        }, 2000);
      } catch (error) {
        handlePlaybackError();
      }
    }

    function extractDateFromUrl(url) {
      const match = url.match(/nrk_radio_klassisk_natt_(\d{8})_/);
      if (match) {
        const dateStr = match[1];
        return `${dateStr.substring(6,8)}-${dateStr.substring(4,6)}-${dateStr.substring(0,4)}`;
      }
      return 'Fecha desconocida';
    }

    function startSomaFmPolling() {
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = setInterval(() => updateSongInfo(), 6000);
    }

    function startSongInfoUpdates() {
      updateSongInfo();
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = setInterval(updateSongInfo, 30000);
    }

    function stopSongInfoUpdates() {
      if (updateInterval) clearInterval(updateInterval);
      if (rapidCheckInterval) clearInterval(rapidCheckInterval);
      resetCountdown();
      resetAlbumCover();
      resetAlbumDetails();
      currentTrackInfo = null;
      songTitle.textContent = 'Seleccionar estación';
      songArtist.textContent = '';
      songAlbum.textContent = '';
      updateShareButtonVisibility();
    }

    // 10. Inicialización
    async function initializeApp() {
      try {
        const groupedStations = await loadStations();
        if (loadingStations) loadingStations.style.display = 'none';
        if (stationSelect) stationSelect.style.display = 'block';
        if (stationName) stationName.textContent = 'RadioMax';
        populateStationSelect(groupedStations);
        const customSelect = new CustomSelect(stationSelect);
        const lastSelectedStationId = getLastSelectedStationId();
        if (lastSelectedStationId && stationsById[lastSelectedStationId]) {
          stationSelect.value = lastSelectedStationId;
          customSelect.updateTriggerText();
          customSelect.updateSelectedOption();
          setTimeout(() => {
            const selectedOption = customSelect.customOptions.querySelector('.custom-option.selected');
            if (selectedOption) {
              selectedOption.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }, 100);
          const station = stationsById[lastSelectedStationId];
          if (station) {
            currentStation = station;
            let displayName = station.name;
            if (station.service === 'radioparadise') {
              displayName = station.name.split(' - ')[1] || station.name;
            }
            stationName.textContent = displayName;
          }
        }
        if (currentStation) {
          audioPlayerEl.src = currentStation.url;
          songTitle.textContent = 'A sonar';
          songArtist.textContent = '';
          songAlbum.textContent = '';
          updateShareButtonVisibility();
        }
        showWelcomeScreen();
      } catch (error) {
        if (loadingStations) loadingStations.textContent = 'Error al cargar las estaciones...';
        logErrorForAnalysis('Station loading error', { error: error.message, timestamp: new Date().toISOString() });
      }
    }

    function populateStationSelect(groupedStations) {
      while (stationSelect.firstChild) stationSelect.removeChild(stationSelect.firstChild);
      const defaultOption = document.createElement('option');
      defaultOption.value = "";
      defaultOption.textContent = " Seleccionar Estación ";
      defaultOption.disabled = true;
      defaultOption.selected = true;
      stationSelect.appendChild(defaultOption);
      stationsById = {};
      for (const serviceName in groupedStations) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = serviceName;
        groupedStations[serviceName].forEach(station => {
          const option = document.createElement('option');
          option.value = station.id;
          stationsById[station.id] = station;
          optgroup.appendChild(option);
        });
        stationSelect.appendChild(optgroup);
      }
    }

    initializeApp();

    // 11. Event listeners (igual que antes)
    if (filterToggleStar) {
      filterToggleStar.setAttribute('aria-label', 'Mostrar solo las estaciones favoritas');
      filterToggleStar.title = 'Solo estaciones favoritas';
      filterToggleStar.addEventListener('click', function () {
        showOnlyFavorites = !showOnlyFavorites;
        this.classList.toggle('active', showOnlyFavorites);
        if (showOnlyFavorites) {
          this.setAttribute('aria-label', 'Mostrar todas las estaciones');
          this.title = 'Todas las estaciones';
          filterStationsByFavorites();
        } else {
          this.setAttribute('aria-label', 'Mostrar solo las estaciones favoritas');
          this.title = 'Solo estaciones favoritas';
          showAllStations();
        }
      });
    }

    if (stationSelect) {
      stationSelect.addEventListener('change', function () {
        if (this.value) {
          saveLastSelectedStation(this.value);
          const selectedStationId = this.value;
          const station = stationsById[selectedStationId];
          if (station) {
            currentStation = station;
            let displayName = station.name;
            if (station.service === 'radioparadise') {
              displayName = station.name.split(' - ')[1] || station.name;
            }
            stationName.textContent = displayName;
            showWelcomeScreen();
            playStation();
          } else {
            logErrorForAnalysis('Station selection error', { selectedStationId, timestamp: new Date().toISOString() });
          }
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        leaveStation(supabase);
        audioPlayer.stop();
        stopSongInfoUpdates();
        stopPlaybackChecks();
        showWelcomeScreen();
      });
    }

    // ... resto de listeners (sin cambios)

    // === FUNCIONES DE UTILIDAD ===
    function showInstallInvitation() {
      if (window.matchMedia('(display-mode: standalone)').matches || installInvitationTimeout) return;
      let os = /android/i.test(navigator.userAgent) ? 'android' :
        /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' :
        /win/i.test(navigator.userAgent) ? 'windows' : 'other';
      [installWindowsBtn, installAndroidBtn, installIosBtn].forEach(btn => btn.classList.add('disabled'));
      const activeBtn = { android: installAndroidBtn, ios: installIosBtn, windows: installWindowsBtn }[os];
      if (activeBtn) activeBtn.classList.remove('disabled');
      installPwaInvitation.style.display = 'flex';
      installInvitationTimeout = true;
    }

    function hideInstallInvitation() {
      installPwaInvitation.style.display = 'none';
    }

    function isFacebookActive() {
      return document.visibilityState === 'visible' &&
        document.hasFocus() &&
        audioPlayer.wasPlayingBeforeFocusLoss &&
        !audioPlayer.isPlaying &&
        currentStation;
    }

    function startFacebookDetection() {
      if (pageFocusCheckInterval) clearInterval(pageFocusCheckInterval);
      pageFocusCheckInterval = setInterval(() => {
        if (isFacebookActive()) {
          audioPlayer.attemptResumePlayback();
        }
      }, 2000);
    }

    function startPlaybackChecks() {
      startFacebookDetection();
    }

    function stopPlaybackChecks() {
      if (pageFocusCheckInterval) clearInterval(pageFocusCheckInterval);
      facebookVideoDetected = false;
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'RadioMax',
        artist: 'Una experiencia inmersiva',
        album: 'inmersiva',
        artwork: [
          { src: '/images/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/images/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        if (!audioPlayer.isPlaying && currentStation) {
          audioPlayer.play(currentStation.url).catch(console.error);
        }
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        if (audioPlayer.isPlaying) {
          audioPlayer.pause();
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        audioPlayer.wasPlayingBeforeFocusLoss = audioPlayer.isPlaying;
        if (navigator.userAgent.includes('FBAN') || navigator.userAgent.includes('FBAV')) {
          facebookVideoDetected = true;
        }
      } else {
        audioPlayer.attemptResumePlayback();
        if (facebookVideoDetected) {
          startFacebookDetection();
          setTimeout(() => {
            facebookVideoDetected = false;
            if (pageFocusCheckInterval) clearInterval(pageFocusCheckInterval);
          }, 30000);
        }
      }
    });

    window.addEventListener('blur', () => {
      audioPlayer.wasPlayingBeforeFocusLoss = audioPlayer.isPlaying;
      if (navigator.userAgent.includes('FBAN') || navigator.userAgent.includes('FBAV')) {
        facebookVideoDetected = true;
      }
    });

    window.addEventListener('focus', () => {
      audioPlayer.attemptResumePlayback();
      if (facebookVideoDetected) {
        startFacebookDetection();
        setTimeout(() => {
          facebookVideoDetected = false;
          if (pageFocusCheckInterval) clearInterval(pageFocusCheckInterval);
        }, 30000);
      }
    });

    // ... resto de PWA, share, teclado, SW (sin cambios)

    let deferredPrompt;
    const installPwaBtnAndroid = document.getElementById('install-pwa-btn-android');
    const installPwaBtnIos = document.getElementById('install-pwa-btn-ios');

    function showInstallPwaButtons() {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        if (installPwaBtnAndroid) installPwaBtnAndroid.style.display = 'none';
        if (installPwaBtnIos) installPwaBtnIos.style.display = 'none';
        return;
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

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallPwaButtons();
    });

    if (installPwaBtnAndroid) {
      installPwaBtnAndroid.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!deferredPrompt) {
          showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"', notification);
          return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          if (installPwaBtnAndroid) installPwaBtnAndroid.style.display = 'none';
        }
        deferredPrompt = null;
      });
    }

    if (installPwaBtnIos) {
      installPwaBtnIos.addEventListener('click', (e) => {
        e.preventDefault();
        showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.', notification);
      });
    }

    setTimeout(showInstallPwaButtons, 100);

    if (shareButton) {
      shareButton.addEventListener('click', () => { shareOptions.classList.toggle('active'); });
    }

    document.addEventListener('click', (e) => {
      if (shareButton && shareOptions && !shareButton.contains(e.target) && !shareOptions.contains(e.target)) {
        shareOptions.classList.remove('active');
      }
    });

    if (shareWhatsApp) {
      shareWhatsApp.addEventListener('click', () => {
        const title = songTitle.textContent;
        const artist = songArtist.textContent;
        if (title && artist && title !== 'a sonar' && title !== 'Conectando...' && title !== 'Seleccionar estación') {
          const message = `Escuché ${title} de ${artist} en https://kutt.it/radiomax ¡Temazo en RadioMax!`;
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const isBraveAndroid = isMobile && /Brave/i.test(navigator.userAgent) && /Android/i.test(navigator.userAgent);
          if (isBraveAndroid) {
            showNotification('En Brave, toca el enlace para abrir WhatsApp Web', notification);
            setTimeout(() => { window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank'); }, 1000);
          } else if (isMobile) {
            const whatsappUri = `whatsapp://send?text=${encodeURIComponent(message)}`;
            const link = document.createElement('a');
            link.href = whatsappUri; link.target = '_blank'; link.rel = 'noopener noreferrer';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            setTimeout(() => { window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank'); }, 1500);
          } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
          }
          if (shareOptions) shareOptions.classList.remove('active');
        } else {
          showNotification('Por favor, espera a que comience una canción para compartir', notification);
        }
      });
    }

    if (closeInvitationBtn) {
      closeInvitationBtn.addEventListener('click', () => {
        hideInstallInvitation();
      });
    }

    if (installWindowsBtn) {
      installWindowsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') { console.log('User accepted A2HS prompt'); }
            else { console.log('User dismissed A2HS prompt'); }
            deferredPrompt = null;
          });
          hideInstallInvitation();
        } else {
          showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"', notification);
        }
      });
    }

    if (installAndroidBtn) {
      installAndroidBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') { console.log('User accepted A2HS prompt'); }
            else { console.log('User dismissed A2HS prompt'); }
            deferredPrompt = null;
          });
          hideInstallInvitation();
        } else {
          showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"', notification);
        }
      });
    }

    if (installIosBtn) {
      installIosBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.', notification);
        hideInstallInvitation();
      });
    }

    let lastKeyPressed = null;
    let lastMatchIndex = -1;
    document.addEventListener('keydown', function (event) {
      if (!document.querySelector('.custom-select-wrapper.open') &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
        /^[a-zA-Z0-9]$/.test(event.key)) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        const customOptions = document.querySelectorAll('.custom-option');
        const matches = [];
        customOptions.forEach(option => {
          const stationName = option.querySelector('.custom-option-name').textContent.toLowerCase();
          if (stationName.startsWith(key)) { matches.push(option); }
        });
        if (matches.length > 0) {
          if (key === lastKeyPressed) { lastMatchIndex = (lastMatchIndex + 1) % matches.length; }
          else { lastMatchIndex = 0; lastKeyPressed = key; }
          const selectedOption = matches[lastMatchIndex];
          const stationId = selectedOption.dataset.value;
          stationSelect.value = stationId;
          stationSelect.dispatchEvent(new Event('change'));
          const customSelect = document.querySelector('.custom-select-wrapper');
          const trigger = customSelect.querySelector('.custom-select-trigger');
          const station = stationsById[stationId];
          let displayName = station.name;
          if (station.service === 'radioparadise') { displayName = station.name.split(' - ')[1] || station.name; }
          trigger.textContent = displayName;
          customOptions.forEach(option => { option.classList.remove('selected'); });
          selectedOption.classList.add('selected');
          selectedOption.scrollIntoView({ block: 'nearest' });
        }
      }
    });

    if (volumeIcon) {
      audioPlayer.updateVolumeIconPosition();
    }

    const versionSpan = document.getElementById('version-number');
    if (versionSpan) {
      fetch('/sw.js')
        .then(response => {
          if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
          return response.text();
        })
        .then(text => {
          const versionMatch = text.match(/^(?:\/\/\s*)?v?(\d+(?:\.\d+){1,2})/m);
          if (versionMatch && versionMatch[1]) {
            versionSpan.textContent = versionMatch[1];
          } else {
            versionSpan.textContent = 'N/D';
            console.warn('No se pudo encontrar el número de versión en sw.js con el formato esperado.');
          }
        })
        .catch(error => {
          console.error('Error al cargar el archivo sw.js para obtener la versión:', error);
          versionSpan.textContent = 'Error';
        });
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        let refreshing = false;
        const updateNotification = document.getElementById('update-notification');
        const updateReloadBtn = document.getElementById('update-reload-btn');
        navigator.serviceWorker.register('/sw.js')
          .then(reg => {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              if (updateNotification) updateNotification.style.display = 'block';
            }
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              newWorker?.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  if (updateNotification) updateNotification.style.display = 'block';
                }
              });
            });
          })
          .catch(err => console.error('SW error:', err));

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        if (updateReloadBtn) {
          updateReloadBtn.addEventListener('click', () => {
            if (updateNotification) updateNotification.style.display = 'none';
            navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => window.location.reload(), 100);
          });
        }
      });
    }

  } catch (error) {
    console.error("Error fatal:", error);
    const loadingElement = document.getElementById('loadingStations');
    if (loadingElement) {
      loadingElement.textContent = `Error crítico: ${error.message}`;
      loadingElement.style.color = '#ff6600';
    }
  }
});
