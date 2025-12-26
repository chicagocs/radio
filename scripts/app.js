// app.js - v3.2.9
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================================================
// CONFIGURACIÓN & UTILIDADES MODERNAS
// ==========================================================================

// --- GESTIÓN DE ALMACENAMIENTO (STANDARD API) ---
const StorageManager = {
  async init() {
    // Solicitar persistencia de almacenamiento usando la API estándar navigator.storage
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        const isPersistent = await navigator.storage.persist();
        console.log(`[Storage] Persistencia garantizada: ${isPersistent}`);
        
        // Estimar cuota (Feature moderna)
        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          console.log(`[Storage] Cuota usada: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB de ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
        }
      } catch (err) {
        console.warn('[Storage] No se pudo garantizar la persistencia:', err);
      }
    }
  },

  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`[Storage] Error leyendo ${key}:`, error);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('[Storage] Error: Cuota de localStorage llena.');
        // Opcional: Intentar limpiar datos antiguos o notificar al usuario
      }
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`[Storage] Error eliminando ${key}:`, error);
    }
  }
};

// --- SUPABASE PRESENCIA ---
const SUPABASE_URL = 'https://xahbzlhjolnugpbpnbmo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G_dlO7Q6PPT7fDQCvSN5lA_mbcqtxVl';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentChannel = null;
let currentStationId = null;

const PresenceManager = {
  getUserUniqueID() {
    let uid = StorageManager.get('rm_uid');
    if (!uid) {
      uid = 'user_' + Math.random().toString(36).substr(2, 9);
      StorageManager.set('rm_uid', uid);
    }
    return uid;
  },

  async joinStation(stationId) {
    if (currentChannel && currentStationId !== stationId) {
      await this.leaveStation();
    }
    currentStationId = stationId;
    const channelName = `station:${stationId}`;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: this.getUserUniqueID()
        }
      }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        const counterElement = document.getElementById('totalListeners');
        if (counterElement) counterElement.innerText = count;
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
  },

  async leaveStation() {
    if (currentChannel) {
      await supabase.removeChannel(currentChannel);
      currentChannel = null;
      currentStationId = null;
      const counterElement = document.getElementById('totalListeners');
      if (counterElement) counterElement.innerText = '0';
    }
  }
};

// ==========================================================================
// LÓGICA PRINCIPAL DE LA APLICACIÓN
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Inicializar Gestor de Almacenamiento (API Estándar)
    await StorageManager.init();

    // --- REFERENCIAS DOM ---
    const dom = {
      stationSelect: document.getElementById('stationSelect'),
      playBtn: document.getElementById('playBtn'),
      stopBtn: document.getElementById('stopBtn'),
      volumeSlider: document.getElementById('volumeSlider'),
      audioPlayer: document.getElementById('audioPlayer'),
      stationName: document.getElementById('stationName'),
      songTitle: document.getElementById('songTitle'),
      songArtist: document.getElementById('songArtist'),
      songAlbum: document.getElementById('songAlbum'),
      volumeIcon: document.getElementById('volumeIcon'),
      countdownTimer: document.getElementById('countdownTimer'),
      totalDuration: document.getElementById('totalDuration'),
      albumCover: document.getElementById('albumCover'),
      loadingStations: document.getElementById('loadingStations'),
      releaseDate: document.getElementById('releaseDate'),
      recordLabel: document.getElementById('recordLabel'),
      albumTrackCount: document.getElementById('albumTrackCount'),
      albumTotalDuration: document.getElementById('albumTotalDuration'),
      trackGenre: document.getElementById('trackGenre'),
      trackPosition: document.getElementById('trackPosition'),
      trackIsrc: document.getElementById('trackIsrc'),
      shareButton: document.getElementById('shareButton'),
      shareOptions: document.getElementById('shareOptions'),
      shareWhatsApp: document.getElementById('shareWhatsApp'),
      notification: document.getElementById('notification'),
      welcomeScreen: document.getElementById('welcomeScreen'),
      playbackInfo: document.getElementById('playbackInfo'),
      filterToggleStar: document.getElementById('filterToggleStar'),
      installPwaInvitation: document.getElementById('install-pwa-invitation'),
      closeInvitationBtn: document.getElementById('close-invitation'),
      installWindowsBtn: document.getElementById('install-windows'),
      installAndroidBtn: document.getElementById('install-android'),
      installIosBtn: document.getElementById('install-ios')
    };

    // --- ESTADO ---
    const state = {
      stationsById: {},
      currentStation: null,
      updateInterval: null,
      countdownInterval: null,
      isMuted: false,
      previousVolume: 50,
      isPlaying: false,
      trackDuration: 0,
      trackStartTime: 0,
      currentTrackInfo: null,
      lastPlaybackTime: 0,
      timeStuckCheckInterval: null,
      installInvitationTimeout: null,
      showOnlyFavorites: false,
      wasPlayingBeforeFocusLoss: false,
      rapidCheckInterval: null,
      songTransitionDetected: false
    };

    const RAPID_CHECK_THRESHOLD = 210; // segundos

    dom.audioPlayer.volume = 0.5;

    // --- FUNCIONES UI ---

    function showNotification(message) {
      if (dom.notification) {
        dom.notification.textContent = message;
        dom.notification.classList.add('show');
        setTimeout(() => dom.notification.classList.remove('show'), 3000);
      }
    }

    function updateVolumeIconPosition() {
      if(!dom.volumeSlider || !dom.volumeIcon) return;
      const sliderWidth = dom.volumeSlider.offsetWidth;
      const percent = dom.volumeSlider.value / dom.volumeSlider.max;
      const iconWidth = dom.volumeIcon.offsetWidth;
      const newPosition = percent * sliderWidth - (iconWidth / 2);
      dom.volumeIcon.style.left = `${newPosition}px`;
    }

    function updateStatus(isPlayingNow) {
      if (dom.playBtn) {
        dom.playBtn.textContent = isPlayingNow ? '⏸ PAUSAR' : '▶ SONAR';
      }
    }

    function showWelcomeScreen() {
      if (dom.welcomeScreen) dom.welcomeScreen.style.display = 'flex';
      if (dom.playbackInfo) dom.playbackInfo.style.display = 'none';
    }

    function showPlaybackInfo() {
      if (dom.welcomeScreen) dom.welcomeScreen.style.display = 'none';
      if (dom.playbackInfo) dom.playbackInfo.style.display = 'flex';
    }

    // --- FAVORITOS ---
    const FAVORITES_KEY = 'radioMax_favorites';

    function getFavorites() {
      return StorageManager.get(FAVORITES_KEY, []);
    }

    function saveFavorites(list) {
      StorageManager.set(FAVORITES_KEY, list);
    }

    function addFavorite(id) {
      const list = getFavorites();
      if (!list.includes(id)) {
        list.push(id);
        saveFavorites(list);
        updateFavoriteButtonUI(id, true);
        showNotification('Añadido a favoritos');
      }
    }

    function removeFavorite(id) {
      let list = getFavorites();
      list = list.filter(fid => fid !== id);
      saveFavorites(list);
      updateFavoriteButtonUI(id, false);
      showNotification('Eliminado de favoritos');
    }

    function updateFavoriteButtonUI(stationId, isFavorite) {
      const btn = document.querySelector(`.favorite-btn[data-station-id="${stationId}"]`);
      if (!btn) return;
      btn.innerHTML = isFavorite ? '★' : '☆';
      btn.classList.toggle('is-favorite', isFavorite);
      const stationName = btn.closest('.custom-option').querySelector('.custom-option-name')?.textContent || '';
      btn.setAttribute('aria-label', isFavorite ? `Quitar ${stationName}` : `Añadir ${stationName}`);
    }

    function filterStationsByFavorites() {
      const favorites = getFavorites();
      const customOptions = document.querySelectorAll('.custom-option');
      customOptions.forEach(opt => {
        const id = opt.dataset.value;
        opt.style.display = favorites.includes(id) ? 'block' : 'none';
      });
      // Ocultar grupos vacíos
      document.querySelectorAll('.custom-optgroup-label').forEach(label => {
        let hasVisible = false;
        let next = label.nextElementSibling;
        while(next && next.classList.contains('custom-option')) {
          if(next.style.display !== 'none') { hasVisible = true; break; }
          next = next.nextElementSibling;
        }
        label.style.display = hasVisible ? 'block' : 'none';
      });
    }

    function showAllStations() {
      document.querySelectorAll('.custom-option, .custom-optgroup-label').forEach(el => el.style.display = '');
    }

    // --- CUSTOM SELECT CLASS ---
    class CustomSelect {
      constructor(originalSelect) {
        this.originalSelect = originalSelect;
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'custom-select-wrapper';
        
        this.trigger = document.createElement('div');
        this.trigger.className = 'custom-select-trigger';
        
        this.options = document.createElement('div');
        this.options.className = 'custom-options';

        this.wrapper.appendChild(this.trigger);
        this.wrapper.appendChild(this.options);
        this.originalSelect.parentNode.insertBefore(this.wrapper, this.originalSelect.nextSibling);
        this.originalSelect.style.display = 'none';
        this.hasScrolledToSelection = false;
        
        this.init();
      }

      init() {
        this.populate();
        this.initEvents();
        this.updateTrigger();
        this.updateSelected();
        
        // Scroll inicial
        setTimeout(() => {
          const selected = this.options.querySelector('.selected');
          if(selected) selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
      }

      populate() {
        this.options.innerHTML = '';
        Array.from(this.originalSelect.children).forEach(child => {
          if (child.tagName === 'OPTGROUP') {
            const label = document.createElement('div');
            label.className = 'custom-optgroup-label';
            label.textContent = child.label;
            this.options.appendChild(label);
            child.querySelectorAll('option').forEach(opt => this.createOption(opt));
          } else if (child.tagName === 'OPTION' && child.value) {
            this.createOption(child);
          }
        });
      }

      createOption(option) {
        const el = document.createElement('div');
        el.className = 'custom-option';
        el.dataset.value = option.value;

        const station = state.stationsById[option.value];
        let name = option.textContent;
        if (station) {
          name = station.service === 'radioparadise' ? (station.name.split(' - ')[1] || station.name) : station.name;
        }

        const infoContainer = document.createElement('div');
        infoContainer.className = 'station-info';

        const details = document.createElement('div');
        details.className = 'station-details';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'custom-option-name';
        nameSpan.textContent = name;
        details.appendChild(nameSpan);

        if(station?.description) {
          const desc = document.createElement('span');
          desc.className = 'custom-option-description';
          desc.textContent = station.description;
          details.appendChild(desc);
        }

        infoContainer.appendChild(details);

        // Botón Favorito
        const favBtn = document.createElement('button');
        favBtn.className = 'favorite-btn';
        favBtn.innerHTML = '☆';
        favBtn.dataset.stationId = option.value;
        favBtn.setAttribute('aria-label', `Añadir ${name} a favoritos`);
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isFav = favBtn.classList.contains('is-favorite');
          isFav ? removeFavorite(option.value) : addFavorite(option.value);
        });
        infoContainer.appendChild(favBtn);

        el.appendChild(infoContainer);
        this.options.appendChild(el);

        el.addEventListener('click', () => {
          this.originalSelect.value = option.value;
          this.updateTrigger();
          this.updateSelected();
          this.close();
          this.originalSelect.dispatchEvent(new Event('change'));
        });
      }

      initEvents() {
        this.trigger.addEventListener('click', () => {
          this.toggle();
          this.updateSelected();
          if(!this.hasScrolledToSelection) {
             const selected = this.options.querySelector('.selected');
             if(selected) setTimeout(()=>selected.scrollIntoView({block:'center'}), 50);
             this.hasScrolledToSelection = true;
          }
        });
        
        document.addEventListener('click', (e) => {
          if (!this.wrapper.contains(e.target)) this.close();
        });
      }

      toggle() { this.wrapper.classList.toggle('open'); }
      close() { this.wrapper.classList.remove('open'); }

      updateTrigger() {
        const val = this.originalSelect.value;
        const station = state.stationsById[val];
        let text = "Seleccionar Estación";
        if (station) {
          text = station.service === 'radioparadise' ? (station.name.split(' - ')[1] || station.name) : station.name;
        }
        this.trigger.textContent = text || text;
      }

      updateSelected() {
        const val = this.originalSelect.value;
        Array.from(this.options.children).forEach(opt => {
           if(opt.classList.contains('custom-option')) {
             opt.classList.toggle('selected', opt.dataset.value === val);
           }
        });
      }
    }

    // --- PORTADAS ---
    function displayAlbumCoverFromUrl(url) {
      if (!url) {
        resetAlbumCover();
        return;
      }
      dom.albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const placeholder = dom.albumCover.querySelector('.album-cover-placeholder');
        if(placeholder) {
          placeholder.style.opacity = '0';
          setTimeout(()=> placeholder.remove(), 300);
        }
        dom.albumCover.innerHTML = '';
        const displayImg = document.createElement('img');
        displayImg.src = url;
        displayImg.alt = 'Portada';
        displayImg.classList.add('loaded');
        dom.albumCover.appendChild(displayImg);
      };
      img.onerror = () => {
        console.warn('Error cargando portada:', url);
        resetAlbumCover();
      };
      img.src = url;
    }

    function resetAlbumCover() {
      // SVG por defecto
      dom.albumCover.innerHTML = `
        <div class="album-cover-placeholder">
            <svg viewBox="0 0 640 640" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs><filter id="glow"><feGaussianBlur stdDeviation="6" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <rect width="640" height="640" fill="#0A0A0A" />
                <g stroke="#333333" stroke-width="2" fill="none"><circle cx="320" cy="320" r="280" /><circle cx="320" cy="320" r="220" /><circle cx="320" cy="320" r="160" /></g>
                <g transform="translate(320, 320)"><path d="M -90 -80 L -90 80 C -90 80, -60 100, -30 80 L 30 0 L 90 80 M 90 -80 L 90 80" stroke="#FF7A00" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#glow)"/></g>
            </svg>
        </div>`;
    }

    // --- API RATE LIMITING ---
    const apiCallTracker = {
      somaFM: { last: 0, min: 5000 },
      radioParadise: { last: 0, min: 5000 },
      musicBrainz: { last: 0, min: 1000 }
    };

    function canMakeApiCall(service) {
      const now = Date.now();
      const s = apiCallTracker[service];
      if (now - s.last >= s.min) {
        s.last = now;
        return true;
      }
      return false;
    }

    // --- REPRODUCCIÓN & TRACKING ---

    function startTimeStuckCheck() {
      if (state.timeStuckCheckInterval) clearInterval(state.timeStuckCheckInterval);
      state.lastPlaybackTime = dom.audioPlayer.currentTime;
      state.timeStuckCheckInterval = setInterval(() => {
        if (state.isPlaying && dom.audioPlayer.currentTime === state.lastPlaybackTime) {
          handlePlaybackError();
        }
        state.lastPlaybackTime = dom.audioPlayer.currentTime;
      }, 3000);
    }

    async function loadStations() {
      try {
        const res = await fetch('stations.json');
        if (!res.ok) throw new Error('Error HTTP');
        const all = await res.json();
        
        // Agrupar
        const groups = all.reduce((acc, st) => {
          const name = st.service === 'somafm' ? 'SomaFM' : st.service === 'radioparadise' ? 'Radio Paradise' : st.service === 'nrk' ? 'NRK Radio' : 'Otro';
          if (!acc[name]) acc[name] = [];
          acc[name].push(st);
          return acc;
        }, {});

        // Ordenar
        for(let k in groups) groups[k].sort((a,b) => a.name.localeCompare(b.name));

        state.stationsById = {};
        dom.loadingStations.style.display = 'none';
        dom.stationSelect.style.display = 'block';

        // Llenar select nativo
        while(dom.stationSelect.firstChild) dom.stationSelect.removeChild(dom.stationSelect.firstChild);
        const def = document.createElement('option');
        def.value = ""; def.textContent = " Seleccionar Estación "; def.disabled = true; def.selected = true;
        dom.stationSelect.appendChild(def);

        for(let gName in groups) {
          const grp = document.createElement('optgroup');
          grp.label = gName;
          groups[gName].forEach(st => {
            state.stationsById[st.id] = st;
            const opt = document.createElement('option');
            opt.value = st.id; opt.textContent = st.name;
            grp.appendChild(opt);
          });
          dom.stationSelect.appendChild(grp);
        }

        const customSelect = new CustomSelect(dom.stationSelect);

        // Restaurar favoritos
        getFavorites().forEach(id => updateFavoriteButtonUI(id, true));

        // Restaurar última estación
        const lastId = StorageManager.get('lastSelectedStation');
        if (lastId && state.stationsById[lastId]) {
          dom.stationSelect.value = lastId;
          state.currentStation = state.stationsById[lastId];
          customSelect.updateTrigger();
          customSelect.updateSelected();
          setTimeout(() => {
             const sel = customSelect.options.querySelector('.selected');
             if(sel) sel.scrollIntoView({block:'center'});
          }, 100);
          
          dom.stationName.textContent = state.currentStation.name;
          dom.audioPlayer.src = state.currentStation.url;
          dom.songTitle.textContent = 'A sonar';
          dom.songArtist.textContent = '';
          dom.songAlbum.textContent = '';
          updateStatus(false);
        }

        showWelcomeScreen();

      } catch (e) {
        dom.loadingStations.textContent = 'Error cargando estaciones.';
        console.error(e);
      }
    }

    // --- COUNTDOWN TIMER & UPDATES ---

    function resetCountdown() {
      if (state.countdownInterval) clearInterval(state.countdownInterval);
      if (state.rapidCheckInterval) clearInterval(state.rapidCheckInterval);
      state.trackDuration = 0;
      state.trackStartTime = 0;
      dom.countdownTimer.textContent = '--:--';
      dom.totalDuration.textContent = '(--:--)';
      dom.countdownTimer.classList.remove('ending');
      state.songTransitionDetected = false;
    }

    function startCountdown() {
      resetCountdown();
      if (!state.trackStartTime) return;

      if (state.trackDuration > 0) {
        const m = Math.floor(state.trackDuration / 60);
        const s = Math.floor(state.trackDuration % 60);
        dom.totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      } else {
        dom.totalDuration.textContent = '(--:--)';
      }

      // Rapid Check Logic (SomaFM)
      if (state.currentStation?.service === 'somafm' && !state.songTransitionDetected) {
        const checkRapid = () => {
          const elapsed = (Date.now() - state.trackStartTime) / 1000;
          if (elapsed > RAPID_CHECK_THRESHOLD && !state.rapidCheckInterval) {
            state.rapidCheckInterval = setInterval(() => {
               if (state.currentStation?.service === 'somafm') updateSongInfo(true);
               else clearInterval(state.rapidCheckInterval);
            }, 3000);
          }
        };
        checkRapid();
        const rcTimer = setInterval(() => {
          if (!state.isPlaying || state.currentStation?.service !== 'somafm') clearInterval(rcTimer);
          else checkRapid();
        }, 10000);
      }

      const updateTimer = () => {
        const elapsed = (Date.now() - state.trackStartTime) / 1000;
        let display = state.trackDuration > 0 ? Math.max(0, state.trackDuration - elapsed) : elapsed;
        
        const m = Math.floor(display / 60);
        const s = Math.floor(display % 60);
        dom.countdownTimer.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

        if (state.trackDuration > 0 && display < 10) dom.countdownTimer.classList.add('ending');
        else dom.countdownTimer.classList.remove('ending');

        if (state.trackDuration > 0 && display > 0) requestAnimationFrame(updateTimer);
        else if (state.trackDuration === 0) requestAnimationFrame(updateTimer);
        else {
          dom.countdownTimer.textContent = '00:00';
          if (state.currentStation && state.currentStation.service === 'nrk') dom.stopBtn.click();
          else {
            updateSongInfo(true);
            if (state.updateInterval) clearInterval(state.updateInterval);
            state.updateInterval = setInterval(updateSongInfo, 30000);
          }
        }
      };
      updateTimer();
    }

    // --- METADATA FETCHING ---
    
    async function fetchSongDetails(artist, title, album) {
      if (!artist || !title) return;
      // Sanitización básica
      const sArtist = artist.replace(/<[^>]*>?/gm, '');
      const sTitle = title.replace(/<[^>]*>?/gm, '');
      const sAlbum = album ? album.replace(/<[^>]*>?/gm, '') : '';

      try {
        // Spotify via Worker
        const q = `artist=${encodeURIComponent(sArtist)}&title=${encodeURIComponent(sTitle)}&album=${encodeURIComponent(sAlbum)}`;
        const res = await fetch(`https://core.chcs.workers.dev/spotify?${q}`);
        if (!res.ok) throw new Error('Error API Spotify');
        const data = await res.json();
        
        if (data?.imageUrl) {
          displayAlbumCoverFromUrl(data.imageUrl);
          updateAlbumDetails(data);
          if (data.duration) {
            state.trackDuration = data.duration;
            const m = Math.floor(state.trackDuration / 60); 
            const s = Math.floor(state.trackDuration % 60);
            dom.totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            return;
          }
        }
      } catch (e) { console.warn('[Spotify API]', e); }
      
      await getMusicBrainzDuration(sArtist, sTitle);
    }

    async function getMusicBrainzDuration(artist, title) {
      if (!canMakeApiCall('musicBrainz')) return;
      try {
        const url = `https://musicbrainz.org/ws/2/recording/?query=artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"&fmt=json&limit=5`;
        const res = await fetch(url, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' }});
        const data = await res.json();
        if (data?.recordings?.length) {
          const rec = data.recordings.find(r => r.length) || data.recordings[0];
          if (rec?.length) {
            state.trackDuration = Math.floor(rec.length / 1000);
            const m = Math.floor(state.trackDuration / 60); 
            const s = Math.floor(state.trackDuration % 60);
            dom.totalDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
          }
        }
      } catch (e) { console.warn('[MusicBrainz]', e); }
    }

    function updateAlbumDetails(data) {
      if (data.release_date) dom.releaseDate.textContent = data.release_date.substring(0,4);
      else dom.releaseDate.textContent = '----';
      
      dom.recordLabel.textContent = data.label || '----';
      dom.albumTrackCount.textContent = data.totalTracks || '--';
      
      if (data.totalAlbumDuration) {
        const dur = Math.floor(data.totalAlbumDuration / 1000);
        dom.albumTotalDuration.textContent = `${String(Math.floor(dur/60)).padStart(2,'0')}:${String(dur%60).padStart(2,'0')}`;
      } else dom.albumTotalDuration.textContent = '--:--';

      dom.trackGenre.textContent = (data.genres?.length ? data.genres.slice(0,2).join(', ') : '--');
      dom.trackPosition.textContent = data.trackNumber && data.totalTracks ? `${data.trackNumber}/${data.totalTracks}` : '--/--';
      dom.trackIsrc.textContent = data.isrc || '----';
    }

    async function updateSongInfo(bypass = false) {
      if (!state.currentStation) return;
      if (state.currentStation.service === 'somafm') await updateSomaFm(bypass);
      else if (state.currentStation.service === 'radioparadise') await updateRadioParadise(bypass);
    }

    async function updateSomaFm(bypass) {
      if (!bypass && !canMakeApiCall('somaFM')) return;
      try {
        const res = await fetch(`https://api.somafm.com/songs/${state.currentStation.id}.json`);
        const data = await res.json();
        if (data?.songs?.length) {
          const s = data.songs[0];
          const newInfo = { title: s.title, artist: s.artist, album: s.album, date: s.date };
          
          if (!state.currentTrackInfo || state.currentTrackInfo.title !== newInfo.title || state.currentTrackInfo.artist !== newInfo.artist) {
            // Detalles reset
            dom.releaseDate.textContent = '----'; dom.recordLabel.textContent = '----'; dom.albumTrackCount.textContent = '--'; dom.albumTotalDuration.textContent = '--:--'; dom.trackGenre.textContent = '--'; dom.trackPosition.textContent = '--/--'; dom.trackIsrc.textContent = '----';

            state.currentTrackInfo = newInfo;
            dom.songTitle.textContent = newInfo.title;
            dom.songArtist.textContent = newInfo.artist;
            dom.songAlbum.textContent = newInfo.album ? `(${newInfo.album})` : '';
            
            resetAlbumCover();
            state.trackStartTime = newInfo.date ? newInfo.date * 1000 : Date.now();
            state.trackDuration = 0;
            startCountdown();
            fetchSongDetails(newInfo.artist, newInfo.title, newInfo.album);

            if (state.rapidCheckInterval) { clearInterval(state.rapidCheckInterval); state.rapidCheckInterval = null; }
            state.songTransitionDetected = true;
          }
        }
      } catch (e) { console.error('[SomaFM]', e); }
    }

    async function updateRadioParadise(bypass) {
      if (!bypass && !canMakeApiCall('radioParadise')) return;
      try {
        const url = `https://core.chcs.workers.dev/radioparadise?url=${encodeURIComponent(`api/now_playing?chan=${state.currentStation.channelId || 1}`)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data) {
          const newInfo = { title: data.title, artist: data.artist, album: data.album };
          if (!state.currentTrackInfo || state.currentTrackInfo.title !== newInfo.title) {
            dom.songTitle.textContent = newInfo.title;
            dom.songArtist.textContent = newInfo.artist;
            dom.songAlbum.textContent = newInfo.album ? `(${newInfo.album})` : '';
            resetAlbumCover();
            
            state.trackDuration = data.song_duration || 0;
            if(!state.trackDuration) state.trackStartTime = Date.now() - 15000;
            
            state.currentTrackInfo = newInfo;
            startCountdown();
            fetchSongDetails(newInfo.artist, newInfo.title, newInfo.album);
          }
        }
      } catch (e) { console.error('[Radio Paradise]', e); }
    }

    // --- CONTROL DE REPRODUCCIÓN ---
    
    const connectionManager = {
      isReconnecting: false,
      attempts: 0,
      max: 5,
      timer: null,
      start() {
        if(this.isReconnecting) return;
        this.isReconnecting = true; this.attempts = 0;
        this.attempt();
      },
      stop() {
        this.isReconnecting = false;
        if(this.timer) clearTimeout(this.timer);
      },
      attempt() {
        if(!this.isReconnecting || !state.currentStation) { this.stop(); return; }
        if(this.attempts >= this.max) {
          dom.songTitle.textContent = 'Error de conexión';
          dom.stopBtn.click();
          return;
        }
        this.attempts++;
        const delay = Math.min(1000 * Math.pow(2, this.attempts-1), 30000);
        this.timer = setTimeout(async () => {
          try {
            dom.audioPlayer.src = state.currentStation.url;
            await dom.audioPlayer.play();
            this.stop();
            showNotification('Conexión restaurada');
            if(state.currentStation.service !== 'nrk') updateSongInfo(true);
          } catch(e) { this.attempt(); }
        }, delay);
      }
    };

    function handlePlaybackError() {
      if(connectionManager.isReconnecting) return;
      if(!dom.audioPlayer.paused && dom.audioPlayer.currentTime > 0) return;

      PresenceManager.leaveStation();
      state.isPlaying = false;
      updateStatus(false);
      dom.audioPlayer.pause();
      if(state.timeStuckCheckInterval) clearInterval(state.timeStuckCheckInterval);
      if(state.updateInterval) clearInterval(state.updateInterval);
      
      state.currentTrackInfo = null;
      resetCountdown();
      resetAlbumCover();
      // Reset detalles
      dom.releaseDate.textContent = '----'; dom.recordLabel.textContent = '----'; dom.albumTrackCount.textContent = '--'; dom.albumTotalDuration.textContent = '--:--'; dom.trackGenre.textContent = '--'; dom.trackPosition.textContent = '--/--'; dom.trackIsrc.textContent = '----';

      showWelcomeScreen();
      dom.songTitle.textContent = 'Reconectando...';
      dom.songArtist.textContent = 'Intentando recuperar la señal...';
      dom.songAlbum.textContent = '';
      
      connectionManager.start();
    }

    function playStation() {
      if (!state.currentStation) return alert('Selecciona una estación');
      
      // Limpiar intervalos previos
      if(state.updateInterval) clearInterval(state.updateInterval);
      if(state.countdownInterval) clearInterval(state.countdownInterval);
      state.currentTrackInfo = null; state.trackDuration = 0; state.trackStartTime = 0;
      resetCountdown();
      
      // Reset UI canción
      dom.songTitle.textContent = 'Conectando...';
      dom.songArtist.textContent = ''; dom.songAlbum.textContent = '';
      resetAlbumCover();

      dom.audioPlayer.src = state.currentStation.url;
      
      dom.audioPlayer.play().then(() => {
        state.isPlaying = true;
        updateStatus(true);
        startTimeStuckCheck();
        showPlaybackInfo();
        state.wasPlayingBeforeFocusLoss = true;

        PresenceManager.joinStation(state.currentStation.id);

        if(state.currentStation.service === 'somafm') {
          startSomaFmPolling();
          updateSongInfo(true);
        } else {
          setTimeout(() => {
            updateSongInfo(true);
            state.updateInterval = setInterval(updateSongInfo, 30000);
          }, 5000);
        }

        if(!state.installInvitationTimeout) setTimeout(showInstallPwaInvitation, 600000);

      }).catch(() => handlePlaybackError());
    }

    function startSomaFmPolling() {
      if(state.updateInterval) clearInterval(state.updateInterval);
      state.updateInterval = setInterval(() => updateSongInfo(true), 6000);
    }

    // --- EVENT LISTENERS ---

    if (dom.filterToggleStar) {
      dom.filterToggleStar.addEventListener('click', () => {
        state.showOnlyFavorites = !state.showOnlyFavorites;
        dom.filterToggleStar.classList.toggle('active', state.showOnlyFavorites);
        state.showOnlyFavorites ? filterStationsByFavorites() : showAllStations();
      });
    }

    dom.stationSelect.addEventListener('change', () => {
      if (dom.stationSelect.value) {
        StorageManager.set('lastSelectedStation', dom.stationSelect.value);
        state.currentStation = state.stationsById[dom.stationSelect.value];
        dom.stationName.textContent = state.currentStation.name;
        showWelcomeScreen();
        playStation();
      }
    });

    dom.playBtn.addEventListener('click', () => {
      dom.playBtn.style.animation = '';
      if (state.isPlaying) {
        dom.audioPlayer.pause();
        state.isPlaying = false;
        updateStatus(false);
        if(state.countdownInterval) clearInterval(state.countdownInterval);
        if(state.updateInterval) clearInterval(state.updateInterval);
        state.wasPlayingBeforeFocusLoss = false;
        PresenceManager.leaveStation();
      } else {
        if(state.currentStation) playStation();
        else alert('Selecciona una estación');
      }
    });

    dom.stopBtn.addEventListener('click', () => {
      PresenceManager.leaveStation();
      connectionManager.stop();
      dom.audioPlayer.pause(); dom.audioPlayer.src = '';
      state.isPlaying = false; updateStatus(false);
      if(state.updateInterval) clearInterval(state.updateInterval);
      if(state.countdownInterval) clearInterval(state.countdownInterval);
      if(state.rapidCheckInterval) clearInterval(state.rapidCheckInterval);
      state.wasPlayingBeforeFocusLoss = false;
      showWelcomeScreen();
      dom.songTitle.textContent = 'Seleccionar estación';
      dom.songArtist.textContent = ''; dom.songAlbum.textContent = '';
    });

    // Audio events
    dom.audioPlayer.addEventListener('playing', () => {
      state.isPlaying = true;
      updateStatus(true);
      state.wasPlayingBeforeFocusLoss = true;
      if(connectionManager.isReconnecting) {
        connectionManager.stop();
        showNotification('Conexión restaurada');
        if(state.currentStation.service !== 'nrk') updateSongInfo(true);
      }
    });

    dom.audioPlayer.addEventListener('error', () => handlePlaybackError());
    dom.audioPlayer.addEventListener('stalled', () => { if(state.isPlaying) setTimeout(()=>state.wasPlayingBeforeFocusLoss && dom.audioPlayer.play(), 2000); });
    
    dom.audioPlayer.addEventListener('pause', () => {
      if(state.isPlaying && !document.hidden) {
        state.wasPlayingBeforeFocusLoss = true;
        setTimeout(() => { if(state.wasPlayingBeforeFocusLoss && state.currentStation) dom.audioPlayer.play().catch(()=>{}); }, 1000);
      } else {
        state.isPlaying = false;
        updateStatus(false);
      }
    });

    // Volumen
    dom.volumeSlider.addEventListener('input', function() {
      dom.audioPlayer.volume = this.value / 100;
      updateVolumeIconPosition();
      if(this.value == 0) { dom.volumeIcon.classList.add('muted'); state.isMuted = true; }
      else { dom.volumeIcon.classList.remove('muted'); state.isMuted = false; state.previousVolume = this.value; }
    });

    dom.volumeIcon.addEventListener('click', () => {
      if(state.isMuted) {
        dom.volumeSlider.value = state.previousVolume;
        dom.audioPlayer.volume = state.previousVolume / 100;
        dom.volumeIcon.classList.remove('muted'); state.isMuted = false;
      } else {
        state.previousVolume = dom.volumeSlider.value;
        dom.volumeSlider.value = 0;
        dom.audioPlayer.volume = 0;
        dom.volumeIcon.classList.add('muted'); state.isMuted = true;
      }
      updateVolumeIconPosition();
    });

    // Visibility & Focus
    document.addEventListener('visibilitychange', () => {
      if(document.hidden) state.wasPlayingBeforeFocusLoss = state.isPlaying;
      else if(state.wasPlayingBeforeFocusLoss && !state.isPlaying && state.currentStation) dom.audioPlayer.play().catch(()=>{});
    });

    // Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'RadioMax',
        artist: 'Streaming Player',
        artwork: [{ src: '/images/icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', () => { if(!state.isPlaying && state.currentStation) dom.playBtn.click(); });
      navigator.mediaSession.setActionHandler('pause', () => { if(state.isPlaying) dom.playBtn.click(); });
    }

    // PWA Install
    let deferredPrompt;
    function showInstallPwaInvitation() {
      if(window.matchMedia('(display-mode: standalone)').matches || state.installInvitationTimeout) return;
      // Lógica simple de detección OS
      const ua = navigator.userAgent.toLowerCase();
      let os = 'other';
      if(ua.indexOf('android') > -1) os = 'android';
      else if(ua.indexOf('iphone') > -1 || ua.indexOf('ipad') > -1) os = 'ios';
      else if(ua.indexOf('win') > -1) os = 'windows';

      [dom.installWindowsBtn, dom.installAndroidBtn, dom.installIosBtn].forEach(b => b?.classList.add('disabled'));
      if(os==='android') dom.installAndroidBtn?.classList.remove('disabled');
      if(os==='ios') dom.installIosBtn?.classList.remove('disabled');
      if(os==='windows') dom.installWindowsBtn?.classList.remove('disabled');

      dom.installPwaInvitation.style.display = 'flex';
      state.installInvitationTimeout = true;
    }

    dom.closeInvitationBtn?.addEventListener('click', () => { dom.installPwaInvitation.style.display = 'none'; });
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    dom.installAndroidBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if(deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(()=>{ deferredPrompt=null; }); dom.installPwaInvitation.style.display='none'; }
      else showNotification('Usa el menú del navegador para instalar');
    });
    
    dom.installIosBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      showNotification('Pulsa Compartir > Añadir a inicio');
      dom.installPwaInvitation.style.display='none';
    });

    // Service Worker Update
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const notif = document.getElementById('update-notification');
        const reloadBtn = document.getElementById('update-reload-btn');
        
        navigator.serviceWorker.register('/sw.js')
          .then(reg => {
            if(reg.waiting) { notif.style.display = 'block'; }
            reg.addEventListener('updatefound', () => {
              const nw = reg.installing;
              nw.addEventListener('statechange', () => {
                if(nw.state === 'installed' && navigator.serviceWorker.controller) notif.style.display = 'block';
              });
            });
          });

        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
        
        reloadBtn?.addEventListener('click', () => {
          notif.style.display = 'none';
          navigator.serviceWorker.controller?.postMessage({type:'SKIP_WAITING'});
          setTimeout(()=>window.location.reload(), 100);
        });
        
        // Fetch SW Version
        const verSpan = document.getElementById('version-number');
        fetch('/sw.js').then(r=>r.text()).then(txt => {
          const m = txt.match(/v(\d+\.\d+\.\d+)/);
          if(verSpan && m) verSpan.textContent = m[1];
        }).catch(()=>{});
      });
    }
    
    // Share
    dom.shareButton?.addEventListener('click', () => dom.shareOptions?.classList.toggle('active'));
    document.addEventListener('click', (e) => {
      if(dom.shareButton && dom.shareOptions && !dom.shareButton.contains(e.target) && !dom.shareOptions.contains(e.target)) {
        dom.shareOptions.classList.remove('active');
      }
    });
    
    dom.shareWhatsApp?.addEventListener('click', () => {
      const title = dom.songTitle.textContent;
      const artist = dom.songArtist.textContent;
      if(title && artist && title !== 'Conectando...') {
        const txt = `Escuché ${title} de ${artist} en https://kutt.it/radiomax`;
        const url = `https://wa.me/?text=${encodeURIComponent(txt)}`;
        window.open(url, '_blank');
        dom.shareOptions?.classList.remove('active');
      } else showNotification('Espera a que empiece la canción');
    });

    // Init
    await loadStations();

  } catch (fatalError) {
    console.error("Error crítico:", fatalError);
    const load = document.getElementById('loadingStations');
    if(load) { load.textContent = `Error: ${fatalError.message}`; load.style.color = '#f00'; }
  }
});
