// scripts/main.js - v3.2.8 (modularizado + AudioPlayer integrado)
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

    // === VARIABLES DE ESTADO (solo las necesarias fuera del reproductor) ===
    let stationsById = {};
    let currentStation = null;
    let updateInterval = null;
    let countdownInterval = null;
    let installInvitationTimeout = null;
    let showOnlyFavorites = false;
    let pageFocusCheckInterval = null;
    let audioContextCheckInterval = null;
    let facebookVideoDetected = false;
    let animationFrameId = null;
    let rapidCheckInterval = null;
    let songTransitionDetected = false;
    const RAPID_CHECK_THRESHOLD = 210; // 3.5 minutos en segundos

    // Variables para track info
    let currentTrackInfo = null;
    let trackDuration = 0;
    let trackStartTime = 0;

    // ==========================================================================
    // ✅ INSTANCIA DEL REPRODUCTOR DE AUDIO
    // ==========================================================================
    const audioPlayer = new AudioPlayer(
      audioPlayerEl,
      playBtn,
      stopBtn,
      volumeSlider,
      volumeIcon,
      notification
    );

    // ==========================================================================
    // FUNCIONES DE UTILIDAD Y CONFIGURACIÓN
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

    function showInstallInvitation() {
      if (window.matchMedia('(display-mode: standalone)').matches || installInvitationTimeout) {
        return;
      }
      let os = 'other';
      if (/android/i.test(navigator.userAgent)) {
        os = 'android';
      } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
        os = 'ios';
      } else if (/win/i.test(navigator.userAgent)) {
        os = 'windows';
      }
      [installWindowsBtn, installAndroidBtn, installIosBtn].forEach(btn => btn.classList.add('disabled'));
      const activeBtn = os === 'android' ? installAndroidBtn : (os === 'ios' ? installIosBtn : (os === 'windows' ? installWindowsBtn : null));
      if (activeBtn) {
        activeBtn.classList.remove('disabled');
      }
      installPwaInvitation.style.display = 'flex';
      installInvitationTimeout = true;
    }

    function hideInstallInvitation() {
      installPwaInvitation.style.display = 'none';
    }

    // === Facebook / Focus Detection ===
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

    function startAudioContextCheck() {
      if (audioContextCheckInterval) clearInterval(audioContextCheckInterval);
      audioContextCheckInterval = setInterval(() => {
        // El reproductor ya gestiona el estado, así que solo iniciamos detección si es necesario
      }, 3000);
    }

    function startPlaybackChecks() {
      startFacebookDetection();
      startAudioContextCheck();
    }

    function stopPlaybackChecks() {
      if (pageFocusCheckInterval) {
        clearInterval(pageFocusCheckInterval);
        pageFocusCheckInterval = null;
      }
      if (audioContextCheckInterval) {
        clearInterval(audioContextCheckInterval);
        audioContextCheckInterval = null;
      }
      facebookVideoDetected = false;
    }

    // ==========================================================================
    // FAVORITOS Y FILTROS (UI)
    // ==========================================================================

    function updateFavoriteButtonUI(stationId, isFavorite) {
      const btn = document.querySelector(`.favorite-btn[data-station-id="${stationId}"]`);
      if (btn) {
        if (isFavorite) {
          btn.innerHTML = '★'; // Estrella rellena
          btn.classList.add('is-favorite');
          const stationName = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
          btn.setAttribute('aria-label', `Quitar ${stationName} de favoritos`);
        } else {
          btn.innerHTML = '☆'; // Estrella vacía
          btn.classList.remove('is-favorite');
          const stationName = btn.closest('.custom-option').querySelector('.custom-option-name').textContent;
          btn.setAttribute('aria-label', `Añadir ${stationName} a favoritos`);
        }
      }
    }

    function filterStationsByFavorites() {
      const favorites = getFavorites();
      const customOptions = document.querySelectorAll('.custom-option');
      customOptions.forEach(option => {
        const stationId = option.dataset.value;
        if (favorites.includes(stationId)) {
          option.style.display = 'block';
        } else {
          option.style.display = 'none';
        }
      });
      // Ocultar grupos que no tienen opciones visibles
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
    }

    function showAllStations() {
      document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(element => {
        element.style.display = '';
      });
    }

    // ==========================================================================
    // CLASE PARA EL SELECTOR DE ESTACIONES PERSONALIZADO
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
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
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

    // ==========================================================================
    // ✅ FUNCIONES OPTIMIZADAS PARA PORTADA (v3.2.8)
    // ==========================================================================

    function displayAlbumCoverFromUrl(imageUrl) {
      if (!imageUrl) {
        resetAlbumCover();
        return;
      }
      albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
      const img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        const placeholder = albumCover.querySelector('.album-cover-placeholder');
        if (placeholder) {
          placeholder.style.opacity = '0';
          placeholder.style.pointerEvents = 'none';
          setTimeout(() => {
            if (placeholder.parentNode === albumCover) {
              placeholder.remove();
            }
          }, 300);
        }
        displayAlbumCover(this);
      };
      img.onerror = function () {
        console.warn('Error al cargar la portada:', imageUrl);
        resetAlbumCover();
      };
      img.src = imageUrl;
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
<path
d="M -90 -80 L -90 80 C -90 80, -60 100, -30 80 L 30 0 L 90 80 M 90 -80 L 90 80"
stroke="#FF7A00"
stroke-width="20"
stroke-linecap="round"
stroke-linejoin="round"
fill="none"
filter="url(#glow)"
/>
</g>
</svg>
</div>
`;
    }

    // ==========================================================================
    // LÓGICA DE LA APLICACIÓN
    // ==========================================================================

    async function initializeApp() {
      try {
        const groupedStations = await loadStations();
        if (loadingStations) loadingStations.style.display = 'none';
        if (stationSelect) stationSelect.style.display = 'block';
        if (stationName) stationName.textContent = 'RadioMax';
        populateStationSelect(groupedStations);
        const customSelect = new CustomSelect(stationSelect);

        const favoriteIds = getFavorites();
        favoriteIds.forEach(id => {
          updateFavoriteButtonUI(id, true);
        });

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
        if (loadingStations) loadingStations.textContent = 'Error al cargar las estaciones. Por favor, recarga la página.';
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

    // =======================================================================
    // ACTUALIZADO: Integración del botón de filtro de favoritos
    // =======================================================================
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

    // =======================================================================
    // ✅ MANEJO DE ERRORES Y REPRODUCCIÓN
    // =======================================================================

    function handlePlaybackError() {
      if (audioPlayer.isReconnecting) { return; }
      if (!audioPlayerEl.paused && audioPlayerEl.currentTime > 0) {
        console.log('El audio está reproduciéndose, no se inicia el gestor de reconexión');
        return;
      }
      leaveStation(currentStationId);
      isPlaying = false;
      audioPlayerEl.pause();
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
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
      logErrorForAnalysis('Playback error', {
        station: currentStation ? currentStation.id : 'unknown',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      audioPlayer.handlePlaybackError(() => {
        if (currentStation && currentStation.service !== 'nrk') {
          if (updateInterval) clearInterval(updateInterval);
          updateSongInfo(true).then(() => {
            updateInterval = setInterval(updateSongInfo, 30000);
          }).catch(error => {
            console.error('Error al actualizar información de la canción:', error);
          });
        }
      });
    }

    async function playStation() {
      if (!currentStation) { alert('Por favor, seleccionar una estación'); return; }
      if (updateInterval) clearInterval(updateInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (rapidCheckInterval) clearInterval(rapidCheckInterval);
      currentTrackInfo = null; trackDuration = 0; trackStartTime = 0;
      resetCountdown(); resetAlbumDetails();
      audioPlayerEl.src = currentStation.url;
      songTitle.textContent = 'Conectando...';
      songArtist.textContent = ''; songAlbum.textContent = '';
      resetAlbumCover(); updateShareButtonVisibility();
      if (currentStation.service === 'nrk') {
        audioPlayerEl.addEventListener('loadedmetadata', () => {
          trackDuration = audioPlayerEl.duration; trackStartTime = Date.now();
          const newTrackInfo = { title: currentStation.name, artist: currentStation.description, album: `Emisión del ${extractDateFromUrl(currentStation.url)}` };
          currentTrackInfo = newTrackInfo; updateUIWithTrackInfo(newTrackInfo);
          resetAlbumCover(); resetAlbumDetails(); startCountdown(); updateShareButtonVisibility();
        }, { once: true });
      }
      try {
        await audioPlayer.play(currentStation.url);
        showPlaybackInfo();
        if (currentStation && currentStation.id) {
          joinStation(currentStation.id);
        }
        if (currentStation.service === 'somafm') {
          startSomaFmPolling();
          updateSongInfo(true);
        } else {
          setTimeout(() => startSongInfoUpdates(), 5000);
        }
        if (installInvitationTimeout === null) {
          setTimeout(showInstallInvitation, 600000);
        }
        setTimeout(() => {
          if (audioPlayer.isPlaying) {
            startPlaybackChecks();
          }
        }, 2000);
      } catch (error) {
        handlePlaybackError();
      }
    }

    function extractDateFromUrl(url) {
      const match = url.match(/nrk_radio_klassisk_natt_(\d{8})_/);
      if (match) {
        const dateStr = match[1];
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return `${day}-${month}-${year}`;
      }
      return 'Fecha desconocida';
    }

    async function updateSongInfo(bypassRateLimit = false) {
      if (!currentStation || !currentStation.service) return;
      if (currentStation.service === 'somafm') await updateSomaFmInfo(bypassRateLimit);
      else if (currentStation.service === 'radioparadise') await updateRadioParadiseInfo(bypassRateLimit);
    }

    async function updateSomaFmInfo(bypassRateLimit = false) {
      if (!bypassRateLimit && !canMakeApiCall('somaFM')) { return; }
      try {
        const response = await fetch(`https://api.somafm.com/songs/${currentStation.id}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.songs && data.songs.length > 0) {
          const currentSong = data.songs[0];
          const newTrackInfo = {
            title: currentSong.title || 'Título desconocido',
            artist: currentSong.artist || 'Artista desconocido',
            album: currentSong.album || '',
            date: currentSong.date || null
          };
          const isNewTrack = !currentTrackInfo ||
            currentTrackInfo.title !== newTrackInfo.title ||
            currentTrackInfo.artist !== newTrackInfo.artist;
          if (isNewTrack) {
            resetAlbumDetails();
            currentTrackInfo = newTrackInfo;
            updateUIWithTrackInfo(newTrackInfo);
            resetAlbumCover();
            trackStartTime = newTrackInfo.date ? newTrackInfo.date * 1000 : Date.now();
            trackDuration = 0;
            startCountdown();
            fetchSongDetails(newTrackInfo.artist, newTrackInfo.title, newTrackInfo.album);
            if (rapidCheckInterval) {
              clearInterval(rapidCheckInterval);
              rapidCheckInterval = null;
            }
            songTransitionDetected = true;
          }
        } else {
          resetUI();
        }
      } catch (error) {
        logErrorForAnalysis('SomaFM API error', {
          error: error.message,
          stationId: currentStation.id,
          timestamp: new Date().toISOString()
        });
      }
    }

    function startSomaFmPolling() {
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = setInterval(() => {
        updateSongInfo(true);
      }, 6000);
    }

    async function updateRadioParadiseInfo(bypassRateLimit = false) {
      if (!bypassRateLimit && !canMakeApiCall('radioParadise')) { return; }
      try {
        const workerUrl = 'https://core.chcs.workers.dev/radioparadise';
        const apiPath = `api/now_playing?chan=${currentStation.channelId || 1}`;
        const finalUrl = `${workerUrl}?url=${encodeURIComponent(apiPath)}`;
        const response = await fetch(finalUrl);
        if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
        const data = await response.json();
        const newTrackInfo = {
          title: data.title || 'Título desconocido',
          artist: data.artist || 'Artista desconocido',
          album: data.album || '',
        };
        const isNewTrack = !currentTrackInfo ||
          currentTrackInfo.title !== newTrackInfo.title ||
          currentTrackInfo.artist !== newTrackInfo.artist;
        if (isNewTrack) {
          resetCountdown();
          resetAlbumDetails();
          currentTrackInfo = newTrackInfo;
          updateUIWithTrackInfo(newTrackInfo);
          resetAlbumCover();
          if (data.song_duration && typeof data.song_duration === 'number') {
            trackDuration = data.song_duration;
          } else {
            trackStartTime = Date.now() - 15000;
            trackDuration = 0;
          }
          startCountdown();
          await fetchSongDetails(newTrackInfo.artist, newTrackInfo.title, newTrackInfo.album);
        }
      } catch (error) {
        logErrorForAnalysis('Radio Paradise API error', {
          error: error.message,
          stationId: currentStation.id,
          timestamp: new Date().toISOString()
        });
      }
    }

    async function fetchSongDetails(artist, title, album) {
      if (!artist || !title || typeof artist !== 'string' || typeof title !== 'string') {
        return;
      }
      const sanitizedArtist = artist.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      const sanitizedTitle = title.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      const sanitizedAlbum = album ? album.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") : "";
      try {
        const netlifyApiUrl = 'https://core.chcs.workers.dev/spotify';
        const fullUrl = `${netlifyApiUrl}?artist=${encodeURIComponent(sanitizedArtist)}&title=${encodeURIComponent(sanitizedTitle)}&album=${encodeURIComponent(sanitizedAlbum)}`;
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data && data.imageUrl) {
          displayAlbumCoverFromUrl(data.imageUrl);
          updateAlbumDetailsWithSpotifyData(data);
          if (data.duration) {
            trackDuration = data.duration;
            const totalMinutes = Math.floor(trackDuration / 60);
            const totalSeconds = Math.floor(trackDuration % 60);
            totalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
            return;
          } else {
            await getMusicBrainzDuration(sanitizedArtist, sanitizedTitle);
          }
          return;
        }
      } catch (error) {
        logErrorForAnalysis('Spotify API error', {
          error: error.message,
          artist: sanitizedArtist,
          title: sanitizedTitle,
          timestamp: new Date().toISOString()
        });
      }
      await getMusicBrainzDuration(sanitizedArtist, sanitizedTitle);
    }

    async function getMusicBrainzDuration(artist, title) {
      if (!canMakeApiCall('musicBrainz')) {
        return;
      }
      try {
        const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"&fmt=json&limit=5`;
        const response = await fetch(searchUrl, {
          headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.recordings && data.recordings.length > 0) {
          const bestRecording = data.recordings.find(r => r.length) || data.recordings[0];
          if (bestRecording && bestRecording.length) {
            trackDuration = Math.floor(bestRecording.length / 1000);
            const totalMinutes = Math.floor(trackDuration / 60);
            const totalSeconds = Math.floor(trackDuration % 60);
            totalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
            return;
          }
        }
      } catch (error) {
        logErrorForAnalysis('MusicBrainz API error', {
          error: error.message,
          artist,
          title,
          timestamp: new Date().toISOString()
        });
      }
    }

    function updateAlbumDetailsWithSpotifyData(data) {
      const releaseDateElement = document.getElementById('releaseDate');
      if (releaseDateElement) releaseDateElement.innerHTML = '';
      if (data.release_date) {
        const year = data.release_date.substring(0, 4);
        let displayText = year;
        if (data.albumTypeDescription && data.albumTypeDescription !== 'Álbum') {
          displayText += ` (${data.albumTypeDescription})`;
        }
        releaseDateElement.textContent = displayText;
      } else {
        if (releaseDateElement) releaseDateElement.textContent = '----';
      }
      if (data.label && data.label.trim() !== '') {
        recordLabel.textContent = data.label;
      } else {
        recordLabel.textContent = '----';
      }
      if (data.totalTracks) {
        albumTrackCount.textContent = data.totalTracks;
      } else {
        albumTrackCount.textContent = '--';
      }
      if (data.totalAlbumDuration) {
        let durationInSeconds = data.totalAlbumDuration;
        if (durationInSeconds > 10000) {
          durationInSeconds = Math.floor(durationInSeconds / 1000);
        }
        const totalMinutes = Math.floor(durationInSeconds / 60);
        const totalSeconds = Math.floor(durationInSeconds % 60);
        albumTotalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
      } else {
        albumTotalDuration.textContent = '--:--';
      }
      if (data.genres && data.genres.length > 0) {
        const displayGenres = data.genres.slice(0, 2).join(', ');
        trackGenre.textContent = displayGenres;
      } else {
        trackGenre.textContent = '--';
      }
      if (data.trackNumber && data.totalTracks) {
        trackPosition.textContent = `Track ${data.trackNumber}/${data.totalTracks}`;
      } else {
        trackPosition.textContent = '--/--';
      }
      if (trackIsrc) {
        if (data.isrc && data.isrc.trim() !== '') {
          trackIsrc.textContent = data.isrc;
        } else {
          trackIsrc.textContent = '----';
        }
      }
    }

    function updateUIWithTrackInfo(trackInfo) {
      songTitle.textContent = trackInfo.title;
      songArtist.textContent = trackInfo.artist;
      songAlbum.textContent = trackInfo.album ? `(${trackInfo.album})` : '';
      updateShareButtonVisibility();
    }

    function resetUI() {
      if (audioPlayer.isReconnecting) { return; }
      songTitle.textContent = 'Reproduciendo...';
      songArtist.textContent = ''; songAlbum.textContent = '';
      resetCountdown(); resetAlbumCover(); resetAlbumDetails();
      updateShareButtonVisibility();
    }

    function resetCountdown() {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      if (rapidCheckInterval) { clearInterval(rapidCheckInterval); rapidCheckInterval = null; }
      trackDuration = 0;
      trackStartTime = 0;
      countdownTimer.textContent = '--:--';
      totalDuration.textContent = '(--:--)';
      trackPosition.textContent = '--/--';
      countdownTimer.classList.remove('ending');
      songTransitionDetected = false;
    }

    function startCountdown() {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      if (!trackStartTime) {
        resetCountdown();
        return;
      }
      if (trackDuration > 0) {
        const totalMinutes = Math.floor(trackDuration / 60);
        const totalSeconds = Math.floor(trackDuration % 60);
        totalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
      } else {
        totalDuration.textContent = '(--:--)';
      }
      if (currentStation?.service === 'somafm' && !songTransitionDetected) {
        const checkRapidMode = () => {
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
            }, 3000);
          }
        };
        checkRapidMode();
        const rapidCheckTimer = setInterval(() => {
          if (!audioPlayer.isPlaying || currentStation?.service !== 'somafm') {
            clearInterval(rapidCheckTimer);
            return;
          }
          checkRapidMode();
        }, 10000);
      }

      function updateTimer() {
        const now = Date.now();
        const elapsed = (now - trackStartTime) / 1000;
        let displayTime = 0;
        if (trackDuration > 0) {
          displayTime = Math.max(0, trackDuration - elapsed);
        } else {
          displayTime = elapsed;
        }
        const minutes = Math.floor(displayTime / 60);
        const seconds = Math.floor(displayTime % 60);
        const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        countdownTimer.textContent = formattedTime;
        if (trackDuration > 0 && displayTime < 10) {
          countdownTimer.classList.add('ending');
        } else {
          countdownTimer.classList.remove('ending');
        }
        if (trackDuration > 0 && displayTime > 0) {
          animationFrameId = requestAnimationFrame(updateTimer);
        } else if (trackDuration === 0) {
          animationFrameId = requestAnimationFrame(updateTimer);
        } else {
          countdownTimer.textContent = '00:00';
          countdownTimer.classList.remove('ending');
          if (currentStation && currentStation.service === 'nrk') {
            stopBtn.click();
          } else {
            updateSongInfo(true);
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = setInterval(() => updateSongInfo(), 30000);
          }
        }
      }
      updateTimer();
    }

    function resetAlbumDetails() {
      if (!document.querySelector('.release-date-tooltip')) {
        releaseDate.textContent = '----';
      }
      recordLabel.textContent = '----';
      albumTrackCount.textContent = '--';
      if (trackIsrc) trackIsrc.textContent = '----';
      albumTotalDuration.textContent = '--:--';
      trackGenre.textContent = '--';
      trackPosition.textContent = '--/--';
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
      stopBtn.addEventListener('click', function () {
        leaveStation(currentStationId);
        audioPlayer.stop();
        stopSongInfoUpdates();
        stopPlaybackChecks();
        showWelcomeScreen();
      });
    }

    // =======================================================================
    // MEDIA SESSION (controles en lock screen)
    // =======================================================================
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

    // =======================================================================
    // EVENTOS DE VISIBILIDAD Y FOCO
    // =======================================================================
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
            if (pageFocusCheckInterval) {
              clearInterval(pageFocusCheckInterval);
              pageFocusCheckInterval = null;
            }
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
          if (pageFocusCheckInterval) {
            clearInterval(pageFocusCheckInterval);
            pageFocusCheckInterval = null;
          }
        }, 30000);
      }
    });

    // =======================================================================
    // PWA INSTALL
    // =======================================================================
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
          audioPlayer.showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"');
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
        audioPlayer.showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.');
      });
    }

    setTimeout(showInstallPwaButtons, 1000);

    // =======================================================================
    // COMPARTIR
    // =======================================================================
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
            audioPlayer.showNotification('En Brave, toca el enlace para abrir WhatsApp Web');
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
          audioPlayer.showNotification('Por favor, espera a que comience una canción para compartir');
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
          audioPlayer.showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"');
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
          audioPlayer.showNotification('Para instalar, usa el menú del navegador y busca "Añadir a pantalla de inicio"');
        }
      });
    }

    if (installIosBtn) {
      installIosBtn.addEventListener('click', (e) => {
        e.preventDefault();
        audioPlayer.showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.');
        hideInstallInvitation();
      });
    }

    // =======================================================================
    // TECLADO (navegación rápida por estaciones)
    // =======================================================================
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

    // =======================================================================
    // ACTUALIZACIÓN DE POSICIÓN DEL ÍCONO DE VOLUMEN
    // =======================================================================
    if (volumeIcon) {
      audioPlayer.updateVolumeIconPosition();
    }

    // =======================================================================
    // VERSIÓN y SERVICE WORKER
    // =======================================================================
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
    console.error("Error fatal durante la inicialización de la aplicación:", error);
    const loadingElement = document.getElementById('loadingStations');
    if (loadingElement) {
      loadingElement.textContent = `Error crítico: ${error.message}. Revisa la consola para más detalles.`;
      loadingElement.style.color = '#ff6600';
    }
  }
});
