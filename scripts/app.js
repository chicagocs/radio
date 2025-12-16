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

    const shareButton = document.getElementById('shareButton');
    const shareOptions = document.getElementById('shareOptions');
    const shareWhatsApp = document.getElementById('shareWhatsApp');
    const notification = document.getElementById('notification');

    // Elementos para la invitación PWA
    const installPwaInvitation = document.getElementById('install-pwa-invitation');
    const closeInvitationBtn = document.getElementById('close-invitation');
    const installWindowsBtn = document.getElementById('install-windows');
    const installAndroidBtn = document.getElementById('install-android');
    const installIosBtn = document.getElementById('install-ios');

    // NUEVO: Elementos para controlar la visibilidad de la pantalla de bienvenida y reproducción
    const welcomeScreen = document.getElementById('welcomeScreen');
    const playbackInfo = document.getElementById('playbackInfo');
    
    // NUEVO: Elementos para los tags de estación
    const stationTags = document.getElementById('stationTags');
    
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

    // Variable para rastrear el estado de reproducción antes de perder el foco
    let wasPlayingBeforeFocusLoss = false;

    // Variables adicionales para el manejo de Facebook
    let pageFocusCheckInterval = null;
    let lastAudioContextTime = 0;
    let audioContextCheckInterval = null;
    let facebookVideoDetected = false;

    // NUEVO: Variable para requestAnimationFrame del contador
    let animationFrameId = null;

    audioPlayer.volume = 0.5;

    // ==========================================================================
       // FUNCIONES DE UTILIDAD Y CONFIGURACIÓN
       // ==========================================================================
    const apiCallTracker = {
        somaFM: { lastCall: 0, minInterval: 5000 },
        radioParadise: { lastCall: 0, minInterval: 5000 },
        musicBrainz: { lastCall: 0, minInterval: 1000 }
    };

    // NUEVO: Función para mostrar la pantalla de bienvenida (logo SVG)
    function showWelcomeScreen() {
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (playbackInfo) playbackInfo.style.display = 'none';
    }

    // NUEVO: Función para mostrar la información de reproducción
    function showPlaybackInfo() {
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (playbackInfo) playbackInfo.style.display = 'flex';
    }

    function hideStationTags() {
        stationTags.classList.remove('visible');
        stationTags.style.opacity = '0';
        setTimeout(() => {
            stationTags.style.display = 'none';
            stationTags.innerHTML = '';
        }, 300); // Esperar a que termine la transición
    }                      
                          
    function startTimeStuckCheck() {
        if (timeStuckCheckInterval) clearInterval(timeStuckCheckInterval);
        lastPlaybackTime = audioPlayer.currentTime;
        timeStuckCheckInterval = setInterval(() => {
            if (isPlaying) {
                if (audioPlayer.currentTime === lastPlaybackTime) {
                    console.warn('Playback time is frozen. Handling as a network error.');
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
        const newPosition = percent * sliderWidth - (iconWidth / 2);
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
            artist !== '') {
            shareButton.classList.add('visible');
        } else {
            shareButton.classList.remove('visible');
            shareOptions.classList.remove('active');
        }
    }

    function showNotification(message) {
        notification.textContent = message;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
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
        if(activeBtn) {
            activeBtn.classList.remove('disabled');
        }
        installPwaInvitation.style.display = 'flex';
        installInvitationTimeout = true;
    }

    function hideInstallInvitation() {
        installPwaInvitation.style.display = 'none';
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
                        console.error('Error al reanudar la reproducción:', error);
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
        
        // Modifica la función createCustomOption en la clase CustomSelect
        createCustomOption(option) {
          const customOption = document.createElement('div');
          customOption.className = 'custom-option';
          customOption.dataset.value = option.value;
          const station = stationsById[option.value];
          let name = option.textContent;
          let description = '';
          let tagsHTML = '';
    
          if (station) {
          name = station.name;
          if (station.service === 'radioparadise') {
              name = station.name.split(' - ')[1] || station.name;
          }
          description = station.description || '';
        
          // Agregar etiquetas si existen
          if (station.tags && station.tags.length > 0) {
              tagsHTML = '<div class="station-tags-container">';
              station.tags.forEach(tag => {
                  tagsHTML += `<span class="station-tag">${tag}</span>`;
              });
              tagsHTML += '</div>';
          }
        }
    
        customOption.innerHTML = `
         <span class="custom-option-name">${name}</span>
          ${description ? `<span class="custom-option-description">${description}</span>` : ''}
          ${tagsHTML}
        `;
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
       // LÓGICA DE LA APLICACIÓN
       // ==========================================================================
    async function loadStations() {
        try {
            const response = await fetch('stations.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const allStations = await response.json();
            const groupedStations = allStations.reduce((acc, station) => {
                const serviceName = station.service === 'somafm' ? 'SomaFM' : station.service === 'radioparadise' ? 'Radio Paradise' : station.service === 'nrk' ? 'NRK Radio' : 'Otro';
                if (!acc[serviceName]) acc[serviceName] = [];
                acc[serviceName].push(station);
                return acc;
            }, {});
            for (const serviceName in groupedStations) {
                groupedStations[serviceName].sort((a, b) => a.name.localeCompare(b.name));
            }
            loadingStations.style.display = 'none';
            stationSelect.style.display = 'block';
            stationName.textContent = 'RadioMax';
            populateStationSelect(groupedStations);
            
            const customSelect = new CustomSelect(stationSelect);
            
            const lastSelectedStation = localStorage.getItem('lastSelectedStation');
            if (lastSelectedStation && stationsById[lastSelectedStation]) {
                stationSelect.value = lastSelectedStation;
                customSelect.updateTriggerText();
                customSelect.updateSelectedOption();
                
                setTimeout(() => {
                    const selectedOption = customSelect.customOptions.querySelector('.custom-option.selected');
                    if (selectedOption) {
                        selectedOption.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }, 100);
                
                const station = stationsById[lastSelectedStation];
                if (station) {
                    currentStation = station;
                    let displayName = station.name;
                    if (station.service === 'radioparise') {
                        displayName = station.name.split(' - ')[1] || station.name;
                    }
                    stationName.textContent = displayName;
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
            
            // NUEVO: Mostrar pantalla de bienvenida al cargar las estaciones
            showWelcomeScreen();
            
            return groupedStations;
        } catch (error) {
            console.error('Error al cargar las estaciones:', error);
            loadingStations.textContent = 'Error al cargar las estaciones. Por favor, recarga la página.';
            logErrorForAnalysis('Station loading error', { error: error.message, timestamp: new Date().toISOString() });
            return [];
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

    loadStations();

    // Función para forzar el cambio de estación
    function forceStationChange(stationId) {
        stationSelect.value = stationId;
        const event = new Event('change');
        stationSelect.dispatchEvent(event);
    }

    stationSelect.addEventListener('change', function() {
        console.log('Evento change disparado');
        console.log('Valor seleccionado:', this.value);
        
        if (this.value) {
            localStorage.setItem('lastSelectedStation', this.value);
            const selectedStationId = this.value;
            const station = stationsById[selectedStationId];
            
            console.log('Seleccionando estación:', selectedStationId);
            console.log('Estación encontrada:', station);
            
            // Mostrar tags de la estación seleccionada
            showStationTags(selectedStationId);
            
            if (station) {
                currentStation = station;
                let displayName = station.name;
                if (station.service === 'radioparadise') {
                    displayName = station.name.split(' - ')[1] || station.name;
                }
                stationName.textContent = displayName;
                showWelcomeScreen();
                
                // Forzar una pequeña pausa antes de iniciar la reproducción
                setTimeout(() => {
                    playStation();
                }, 100);
            } else {
                console.error('Error: No se encontró la estación con ID:', selectedStationId);
                logErrorForAnalysis('Station selection error', { selectedStationId, timestamp: new Date().toISOString() });
            }
        }
    });

    playBtn.addEventListener('click', function() {
        this.style.animation = '';
        
        if (isPlaying) {
            audioPlayer.pause(); 
            isPlaying = false; 
            updateStatus(false);
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
             wasPlayingBeforeFocusLoss = false;
             stopPlaybackChecks();            
        } else {
            if (currentStation) {
                playStation();
            } else {
                alert('Por favor, seleccionar una estación');
            }
        }
    });

    // MODIFICADO: Ahora solo se encarga de limpiar la UI y delega la reconexión
    function handlePlaybackError() {
        if (connectionManager.isReconnecting) { return; }
        
        isPlaying = false; updateStatus(false);
        audioPlayer.pause();
        if (timeStuckCheckInterval) { clearInterval(timeStuckCheckInterval); timeStuckCheckInterval = null; }
        if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
        
        currentTrackInfo = null; trackDuration = 0; trackStartTime = 0;
        resetCountdown(); resetAlbumCover(); resetAlbumDetails();
        
        showWelcomeScreen();

        songTitle.textContent = 'Conexión perdida.';
        songArtist.textContent = 'La reproducción se reanudará automáticamente.';
        songAlbum.textContent = '';

        logErrorForAnalysis('Playback error', { station: currentStation ? currentStation.id : 'unknown', timestamp: new Date().toISOString(), userAgent: navigator.userAgent });
        
        // Iniciar el gestor de reconexión
        connectionManager.start();
    }

    function playStation() {
        if (!currentStation) { alert('Por favor, seleccionar una estación'); return; }
        if (updateInterval) clearInterval(updateInterval);
        if (countdownInterval) clearInterval(countdownInterval);
        
        currentTrackInfo = null; trackDuration = 0; trackStartTime = 0;
        resetCountdown(); resetAlbumDetails();
        
        audioPlayer.src = currentStation.url;
        songTitle.textContent = 'Conectando...';
        songArtist.textContent = ''; songAlbum.textContent = '';
        resetAlbumCover(); updateShareButtonVisibility();
        
        if (currentStation.service === 'nrk') {
            audioPlayer.addEventListener('loadedmetadata', () => {
                trackDuration = audioPlayer.duration; trackStartTime = Date.now();
                const newTrackInfo = { title: currentStation.name, artist: currentStation.description, album: `Emisión del ${extractDateFromUrl(currentStation.url)}` };
                currentTrackInfo = newTrackInfo; updateUIWithTrackInfo(newTrackInfo);
                resetAlbumCover(); resetAlbumDetails(); startCountdown(); updateShareButtonVisibility();
            }, { once: true });
        }

        audioPlayer.play()
            .then(() => { 
                isPlaying = true; updateStatus(true); startTimeStuckCheck();
                // NUEVO: Mostrar información de reproducción cuando la reproducción es exitosa
                showPlaybackInfo();
                wasPlayingBeforeFocusLoss = true;
                if (currentStation.service !== 'nrk') {
                    setTimeout(() => startSongInfoUpdates(), 5000);
                }
                if (installInvitationTimeout === null) {
                    setTimeout(showInstallInvitation, 600000);
                }
                setTimeout(() => {
                    if (isPlaying) {
                        startPlaybackChecks();
                    }
                }, 2000);
            })
            .catch(error => {
                console.error('Error al reproducir (promise rejected):', error);
                handlePlaybackError();
            });
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

    async function updateSongInfo() {
        if (!currentStation || !currentStation.service) return;
        if (currentStation.service === 'somafm') await updateSomaFmInfo();
        else if (currentStation.service === 'radioparadise') await updateRadioParadiseInfo();
    }

    async function updateSomaFmInfo() {
        if (!canMakeApiCall('somaFM')) { return; }
        try {
            const response = await fetch(`https://api.somafm.com/songs/${currentStation.id}.json`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.songs && data.songs.length > 0) {
                const currentSong = data.songs[0];
                const newTrackInfo = { title: currentSong.title || 'Título desconocido', artist: currentSong.artist || 'Artista desconocido', album: currentSong.album || '', date: currentSong.date || null };
                const isNewTrack = !currentTrackInfo || currentTrackInfo.title !== newTrackInfo.title || currentTrackInfo.artist !== newTrackInfo.artist;
                if (isNewTrack) {
                    resetCountdown(); resetAlbumDetails(); currentTrackInfo = newTrackInfo;
                    updateUIWithTrackInfo(newTrackInfo); resetAlbumCover();
                    trackStartTime = newTrackInfo.date ? newTrackInfo.date * 1000 : Date.now();
                    
                    await fetchSongDetails(newTrackInfo.artist, newTrackInfo.title, newTrackInfo.album);
                }
            } else { resetUI(); }
        } catch (error) { 
            console.error('Error al obtener info de SomaFM:', error); resetUI(); 
            logErrorForAnalysis('SomaFM API error', { error: error.message, stationId: currentStation.id, timestamp: new Date().toISOString() });
        }
    }

    async function updateRadioParadiseInfo() {
        if (!canMakeApiCall('radioParadise')) { return; }
        try {
            const workerUrl = 'https://core.chcs.workers.dev/radioparadise'; 
            const apiPath = `api/now_playing?chan=${currentStation.channelId || 1}`; 
            const finalUrl = `${workerUrl}?url=${encodeURIComponent(apiPath)}`;
            const response = await fetch(finalUrl);
            if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
            const data = await response.json();
            const newTrackInfo = { title: data.title || 'Título desconocido', artist: data.artist || 'Artista desconocido', album: data.album || '', };
            const isNewTrack = !currentTrackInfo || currentTrackInfo.title !== newTrackInfo.title || currentTrackInfo.artist !== newTrackInfo.artist;
            if (isNewTrack) {
                resetCountdown(); resetAlbumDetails(); currentTrackInfo = newTrackInfo;
                updateUIWithTrackInfo(newTrackInfo); resetAlbumCover();
                trackStartTime = Date.now();
                
                await fetchSongDetails(newTrackInfo.artist, newTrackInfo.title, newTrackInfo.album);
            }
        } catch (error) {
            logErrorForAnalysis('Radio Paradise API error', { error: error.message, stationId: currentStation.id, timestamp: new Date().toISOString() });
        }
    }
    
    async function fetchSongDetails(artist, title, album) {
        if (!artist || !title || typeof artist !== 'string' || typeof title !== 'string') { resetCountdown(); return; }
        const sanitizedArtist = artist.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        const sanitizedTitle = title.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        const sanitizedAlbum = album ? album.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") : "";
        resetCountdown();
        try {
            const netlifyApiUrl = 'https://core.chcs.workers.dev/spotify'; 
            const response = await fetch(`${netlifyApiUrl}?artist=${encodeURIComponent(sanitizedArtist)}&title=${encodeURIComponent(sanitizedTitle)}&album=${encodeURIComponent(sanitizedAlbum)}`);
            if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
            const data = await response.json();
            if (data && data.imageUrl) {
                displayAlbumCoverFromUrl(data.imageUrl);
                updateAlbumDetailsWithSpotifyData(data);
                
                if (data.duration) { trackDuration = data.duration; trackStartTime = Date.now(); startCountdown(); }
                else { await getMusicBrainzDuration(sanitizedArtist, sanitizedTitle); }
                return;
            }
        } catch (error) {
            logErrorForAnalysis('Spotify API error', { error: error.message, artist: sanitizedArtist, title: sanitizedTitle, timestamp: new Date().toISOString() });
        }
        await getMusicBrainzDuration(sanitizedArtist, sanitizedTitle);
    }

    async function getMusicBrainzDuration(artist, title) {
        if (!canMakeApiCall('musicBrainz')) { return; }
        try {
            const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"&fmt=json&limit=5`;
            const response = await fetch(searchUrl, { headers: { 'User-Agent': 'RadioStreamingPlayer/1.0 (https://radiomax.tramax.com.ar)' } });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.recordings && data.recordings.length > 0) {
                const bestRecording = data.recordings.find(r => r.length) || data.recordings[0];
                if (bestRecording && bestRecording.length) {
                    trackDuration = Math.floor(bestRecording.length / 1000);
                    trackStartTime = Date.now();
                    startCountdown();
                    return;
                }
            }
            resetCountdown();
        } catch (error) { 
            resetCountdown();
            logErrorForAnalysis('MusicBrainz API error', { error: error.message, artist, title, timestamp: new Date().toISOString() });
        }
    }
    
    function displayAlbumCoverFromUrl(imageUrl) {
        if (!imageUrl) return;
        albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
        const img = new Image();
        img.onload = function() { displayAlbumCover(this); };
        img.onerror = function() { resetAlbumCover(); };
        img.src = imageUrl;
    }

    function updateAlbumDetailsWithSpotifyData(data) {
     const releaseDateElement = document.getElementById('releaseDate');
     releaseDateElement.innerHTML = '';
     if (data.release_date) {
        const year = data.release_date.substring(0, 4);
        const releaseDateContainer = document.createElement('div');
        releaseDateContainer.className = 'release-date-tooltip';
        const yearSpan = document.createElement('span');
        yearSpan.textContent = year;
        if (data.albumTypeDescription && data.albumTypeDescription !== 'Álbum') {
            yearSpan.textContent += ` (${data.albumTypeDescription})`;
        }
        const infoIcon = document.createElement('span');
        infoIcon.className = 'tooltip-icon'; infoIcon.textContent = 'ⓘ';
        const tooltip = document.createElement('span');
        tooltip.className = 'tooltip-text';
        tooltip.textContent = 'Spotify considera este lanzamiento el más relevante basándose principalmente en su popularidad actual.';
        releaseDateContainer.appendChild(yearSpan); releaseDateContainer.appendChild(infoIcon); releaseDateContainer.appendChild(tooltip);
        releaseDateElement.appendChild(releaseDateContainer);
     } else { releaseDateElement.textContent = '----'; }
     if (data.label && data.label.trim() !== '') { recordLabel.textContent = data.label; } else { recordLabel.textContent = '----'; }
     if (data.totalTracks) { albumTrackCount.textContent = data.totalTracks; } else { albumTrackCount.textContent = '--'; }
     if (data.totalAlbumDuration) {
        let durationInSeconds = data.totalAlbumDuration;
        if (durationInSeconds > 10000) {
            durationInSeconds = Math.floor(durationInSeconds / 1000);
        }
        
        const totalMinutes = Math.floor(durationInSeconds / 60);
        const totalSeconds = Math.floor(durationInSeconds % 60);
        albumTotalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
     } else { albumTotalDuration.textContent = '--:--'; }
     if (data.genres && data.genres.length > 0) {
        const displayGenres = data.genres.slice(0, 2).join(', ');
        trackGenre.textContent = displayGenres;
     } else { trackGenre.textContent = '--'; }
     if (data.trackNumber && data.totalTracks) {
        trackPosition.textContent = `Track ${data.trackNumber}/${data.totalTracks}`;
     } else { trackPosition.textContent = '--/--'; }
     }    

    function updateUIWithTrackInfo(trackInfo) {
        songTitle.textContent = trackInfo.title;
        songArtist.textContent = trackInfo.artist;
        songAlbum.textContent = trackInfo.album ? `(${trackInfo.album})` : '';
        updateShareButtonVisibility();
    }

    function resetUI() {
        if (connectionManager.isReconnecting) { return; }
        songTitle.textContent = 'Reproduciendo...';
        songArtist.textContent = ''; songAlbum.textContent = '';
        resetCountdown(); resetAlbumCover(); resetAlbumDetails();
        updateShareButtonVisibility();
    }
                      
    function displayAlbumCover(img) {
        albumCover.innerHTML = '';
        const displayImg = document.createElement('img');
        displayImg.src = img.src;
        displayImg.alt = 'Portada del álbum';
        albumCover.appendChild(displayImg);
        displayImg.offsetHeight;
        displayImg.classList.add('loaded');
    }

    // MODIFICADO: Ahora inserta el logo SVG en lugar del texto "Portada"
    function resetAlbumCover() {
        albumCover.innerHTML = `
            <div class="album-cover-placeholder">
                <svg width="100%" height="100%" viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg">
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
    
    function resetAlbumDetails() {
        releaseDate.textContent = '----'; recordLabel.textContent = '----';
        albumTrackCount.textContent = '--'; albumTotalDuration.textContent = '--:--';
        trackGenre.textContent = '--'; trackPosition.textContent = '--/--';
    }

    // MODIFICADO: Nueva versión optimizada con requestAnimationFrame
    function startCountdown() {
        // Limpiar intervalos existentes
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

        if (!trackDuration || trackDuration <= 0 || !trackStartTime) {
            resetCountdown();
            return;
        }

        const totalMinutes = Math.floor(trackDuration / 60);
        const totalSeconds = Math.floor(trackDuration % 60);
        totalDuration.textContent = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;

        function updateTimer() {
            const now = Date.now();
            const elapsed = (now - trackStartTime) / 1000;
            const remaining = Math.max(0, trackDuration - elapsed);

            const minutes = Math.floor(remaining / 60);
            const seconds = Math.floor(remaining % 60);
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            countdownTimer.textContent = formattedTime;

            if (remaining < 10) {
                countdownTimer.classList.add('ending');
            } else {
                countdownTimer.classList.remove('ending');
            }

            if (remaining > 0) {
                // CAMBIO: Usar requestAnimationFrame para mayor precisión y eficiencia
                animationFrameId = requestAnimationFrame(updateTimer);
            } else {
                // La canción ha terminado
                countdownTimer.textContent = '00:00';
                countdownTimer.classList.remove('ending');
                if (currentStation && currentStation.service === 'nrk') {
                    stopBtn.click();
                } else {
                    updateSongInfo();
                }
            }
        }

        // Iniciar el bucle de animación
        updateTimer();
    }

    // MODIFICADO: Ahora también limpia el animationFrameId
    function resetCountdown() {
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        
        trackDuration = 0; 
        trackStartTime = 0;
        countdownTimer.textContent = '--:--';
        totalDuration.textContent = '(--:--)';
        trackPosition.textContent = '--/--';
        countdownTimer.classList.remove('ending');
    }

    function startSongInfoUpdates() {
        updateSongInfo();
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updateSongInfo, 30000);
    }

    function stopSongInfoUpdates() {
        if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
        resetCountdown(); resetAlbumCover(); resetAlbumDetails();
        currentTrackInfo = null;
        songTitle.textContent = 'Seleccionar estación';
        songArtist.textContent = ''; songAlbum.textContent = '';
        updateShareButtonVisibility();
    }

    stopBtn.addEventListener('click', function() {
        // MODIFICADO: Usar el nuevo gestor de conexión
        connectionManager.stop();
        audioPlayer.pause(); audioPlayer.src = '';
        isPlaying = false; updateStatus(false);
        stopSongInfoUpdates();
        wasPlayingBeforeFocusLoss = false;
        stopPlaybackChecks();
        hideStationTags();
        // NUEVO: Mostrar pantalla de bienvenida al detener la reproducción
        showWelcomeScreen();
    });

    audioPlayer.addEventListener('error', (e) => {
        const error = audioPlayer.error;
        if (error) {
            if (error.code == 1 || error.code == 4) { return; }
            logErrorForAnalysis('Audio element error', { errorCode: error.code, errorMessage: error.message, station: currentStation ? currentStation.id : 'unknown', timestamp: new Date().toISOString() });
            
            if (error.message.includes('The play() request was interrupted') || error.message.includes('The fetching process for the media resource was aborted')) {
                wasPlayingBeforeFocusLoss = true;
                
                setTimeout(() => {
                    if (wasPlayingBeforeFocusLoss && currentStation) {
                        audioPlayer.play().then(() => {
                            isPlaying = true;
                            updateStatus(true);
                            startTimeStuckCheck();
                            showNotification('Reproducción reanudada automáticamente');
                        }).catch(error => {
                            console.error('Error al reanudar la reproducción:', error);
                            showNotification('Toca para reanudar la reproducción');
                            playBtn.style.animation = 'pulse 2s infinite';
                        });
                    }
                }, 2000);
            } else {
                // MODIFICADO: Llamar al nuevo manejador de errores
                handlePlaybackError();
            }
        }
    });

    audioPlayer.addEventListener('pause', () => {
        if (isPlaying && !document.hidden) {
            wasPlayingBeforeFocusLoss = true;
            
            setTimeout(() => {
                if (wasPlayingBeforeFocusLoss && currentStation) {
                    audioPlayer.play().then(() => {
                        isPlaying = true;
                        updateStatus(true);
                        startTimeStuckCheck();
                        showNotification('Reproducción reanudada automáticamente');
                    }).catch(error => {
                        console.error('Error al reanudar la reproducción:', error);
                        showNotification('Toca para reanudar la reproducción');
                        playBtn.style.animation = 'pulse 2s infinite';
                    });
                }
            }, 1000);
        } else {
            isPlaying = false;
            updateStatus(false);
        }
    });

    audioPlayer.addEventListener('stalled', () => {
        if (isPlaying) {
            wasPlayingBeforeFocusLoss = true;
            
            setTimeout(() => {
                if (wasPlayingBeforeFocusLoss && currentStation) {
                    audioPlayer.play().then(() => {
                        isPlaying = true;
                        updateStatus(true);
                        startTimeStuckCheck();
                    }).catch(error => {
                        console.error('Error al reanudar la reproducción:', error);
                    });
                }
            }, 2000);
        }
    });

    volumeSlider.addEventListener('input', function() {
        const volume = this.value / 100;
        audioPlayer.volume = volume;
        updateVolumeIconPosition();
        if (this.value == 0) { volumeIcon.classList.add('muted'); isMuted = true; }
        else { volumeIcon.classList.remove('muted'); isMuted = false; previousVolume = this.value; }
    });

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

    function updateStatus(isPlayingNow) {
        if (isPlayingNow) { playBtn.textContent = '⏸ PAUSAR'; }
        else { playBtn.textContent = '▶ SONAR'; }
    }

    audioPlayer.addEventListener('playing', () => { 
        isPlaying = true; 
        updateStatus(true); 
        wasPlayingBeforeFocusLoss = true;
    });
    audioPlayer.addEventListener('ended', () => { 
        isPlaying = false; 
        updateStatus(false);
        wasPlayingBeforeFocusLoss = false;
    });

    // ==========================================================================
       // NUEVO: GESTOR DE CONEXIÓN CENTRALIZADO
       // ==========================================================================
    const connectionManager = {
        isReconnecting: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 1000, // 1 segundo
        maxReconnectDelay: 30000,   // 30 segundos máximo
        reconnectTimeoutId: null,

        start() {
            if (this.isReconnecting) return;
            this.isReconnecting = true;
            this.reconnectAttempts = 0;
            this.attemptReconnect();
        },

        stop() {
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            if (this.reconnectTimeoutId) {
                clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = null;
            }
        },

        attemptReconnect() {
            if (!this.isReconnecting || !currentStation) {
                this.stop();
                return;
            }

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('ConnectionManager: Max reconnection attempts reached.');
                songTitle.textContent = 'Error de conexión: no se pudo restaurar';
                songArtist.textContent = 'Intenta reproducir manualmente';
                this.stop();
                return;
            }

            this.reconnectAttempts++;
            const delay = Math.min(this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
            
            songTitle.textContent = `Intentando reconectar... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
            songArtist.textContent = `Próximo intento en ${Math.ceil(delay / 1000)}s.`;
            songAlbum.textContent = '';

            this.reconnectTimeoutId = setTimeout(async () => {
                try {
                    // Forzamos una recarga del stream para asegurar una conexión fresca
                    audioPlayer.src = currentStation.url; 
                    await audioPlayer.play();
                    
                    // Si la reproducción es exitosa, el gestor se detiene
                    isPlaying = true;
                    updateStatus(true);
                    startTimeStuckCheck();
                    showPlaybackInfo(); // Mostrar UI de reproducción
                    this.stop();
                    showNotification('Conexión restaurada con éxito.');
                    
                } catch (error) {
                    console.error(`ConnectionManager: Reconnection attempt ${this.reconnectAttempts} failed:`, error);
                    // Si falla, intentamos de nuevo con un nuevo delay
                    this.attemptReconnect();
                }
            }, delay);
        }
    };
    
    // ==========================================================================
       // LÓGICA DE RECONEXIÓN AUTOMÁTICA (ahora delegada al connectionManager)
       // ==========================================================================
    window.addEventListener('online', () => {
        // MODIFICADO: Usar el gestor de conexión
        if (connectionManager.isReconnecting) {
            connectionManager.attemptReconnect(); // Intenta inmediatamente
        }
    });
    window.addEventListener('offline', () => { });

    // ELIMINADO: La función `attemptReconnect` original ya no es necesaria.

    // ==========================================================================
       // LÓGICA PARA DETECTAR Y RECUPERAR REPRODUCCIÓN
       // ==========================================================================
    
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'RadioMax',
            artist: 'Radio Online',
            album: 'Las 24 horas',
            artwork: [
                { src: '/images/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/images/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' }
            ]
        });
        
        navigator.mediaSession.setActionHandler('play', () => {
            if (!isPlaying && currentStation) {
                audioPlayer.play().then(() => {
                    isPlaying = true;
                    updateStatus(true);
                    wasPlayingBeforeFocusLoss = true;
                }).catch(error => {
                    console.error('Error al reanudar la reproducción:', error);
                });
            }
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
            if (isPlaying) {
                audioPlayer.pause();
                isPlaying = false;
                updateStatus(false);
                wasPlayingBeforeFocusLoss = false;
            }
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            wasPlayingBeforeFocusLoss = isPlaying;
            
            if (navigator.userAgent.includes('FBAN') || navigator.userAgent.includes('FBAV')) {
                facebookVideoDetected = true;
            }
        } else {
            attemptResumePlayback();
            
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
        wasPlayingBeforeFocusLoss = isPlaying;
        
        if (navigator.userAgent.includes('FBAN') || navigator.userAgent.includes('FBAV')) {
            facebookVideoDetected = true;
        }
    });

    window.addEventListener('focus', () => {
        attemptResumePlayback();
        
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

    document.addEventListener('click', () => {
        if (wasPlayingBeforeFocusLoss && !isPlaying && currentStation) {
            setTimeout(() => {
                if (wasPlayingBeforeFocusLoss && !isPlaying && currentStation) {
                    attemptResumePlayback();
                }
            }, 500);
        }
    });

    // Añadir animación CSS para el botón de reproducción cuando se necesita atención
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    `;
    document.head.appendChild(style);

    // ==========================================================================
       // LÓGICA DE INSTALACIÓN PWA
       // ==========================================================================
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
            if (!deferredPrompt) { return; }
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
            showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.');
        });
    }

    setTimeout(showInstallPwaButtons, 1000);

    // ==========================================================================
       // LÓGICA DE COMPARTIR
       // ==========================================================================
    shareButton.addEventListener('click', () => { shareOptions.classList.toggle('active'); });
    document.addEventListener('click', (e) => {
        if (!shareButton.contains(e.target) && !shareOptions.contains(e.target)) {
            shareOptions.classList.remove('active');
        }
    });

    shareWhatsApp.addEventListener('click', () => {
      const title = songTitle.textContent;
      const artist = songArtist.textContent;
      if (title && artist && title !== 'a sonar' && title !== 'Conectando...' && title !== 'Seleccionar estación') {
         const message = `Escuché ${title} de ${artist} en https://kutt.it/radiomax ¡Temazo en RadioMax!`;
         const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
         const isBraveAndroid = isMobile && /Brave/i.test(navigator.userAgent) && /Android/i.test(navigator.userAgent);
         if (isBraveAndroid) {
             showNotification('En Brave, toca el enlace para abrir WhatsApp Web');
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
         shareOptions.classList.remove('active');
      } else {
         showNotification('Por favor, espera a que comience una canción para compartir');
      }
    });

    closeInvitationBtn.addEventListener('click', () => {
        hideInstallInvitation();
    });

    installWindowsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') { console.log('User accepted A2HS prompt'); }
                else { console.log('User dismissed the A2HS prompt'); }
                deferredPrompt = null;
            });
            hideInstallInvitation();
        } else {
            showNotification('Usa un navegador compatible como Edge o Chrome para instalar.');
        }
    });

    installAndroidBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') { console.log('User accepted the A2HS prompt'); }
                else { console.log('User dismissed the A2HS prompt'); }
                deferredPrompt = null;
            });
            hideInstallInvitation();
        }
    });

    installIosBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showNotification('Para instalar en iOS: Pulsa el botón <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.');
        hideInstallInvitation();
    });

    // ==========================================================================
       // NAVEGACIÓN POR TECLADO
       // ==========================================================================
    let lastKeyPressed = null;
    let lastMatchIndex = -1;
    document.addEventListener('keydown', function(event) {
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

    updateVolumeIconPosition();

    // ==========================================================================
       // VERSIÓN DE LA APLICACIÓN
       // ==========================================================================
    const versionSpan = document.getElementById('version-number');
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

// ==========================================================================
// SERVICE WORKER (Brave-safe)
// ==========================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {

    let refreshing = false;
    const updateNotification = document.getElementById('update-notification');
    const updateReloadBtn = document.getElementById('update-reload-btn');

    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        // console.log('SW registrado:', reg.scope);

        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          updateNotification && (updateNotification.style.display = 'block');
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              updateNotification && (updateNotification.style.display = 'block');
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

    updateReloadBtn?.addEventListener('click', () => {
      updateNotification && (updateNotification.style.display = 'none');
      navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 100);
    });

  });
}
    
});
