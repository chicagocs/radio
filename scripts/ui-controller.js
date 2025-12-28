// scripts/ui-controller.js

// Referencias al DOM (inicializadas al importar el módulo)
let elements = {};

export function initializeUI(domElements) {
  elements = {
    stationName: domElements.stationName,
    songTitle: domElements.songTitle,
    songArtist: domElements.songArtist,
    songAlbum: domElements.songAlbum,
    albumCover: domElements.albumCover,
    releaseDate: domElements.releaseDate,
    recordLabel: domElements.recordLabel,
    albumTrackCount: domElements.albumTrackCount,
    albumTotalDuration: domElements.albumTotalDuration,
    trackGenre: domElements.trackGenre,
    trackPosition: domElements.trackPosition,
    trackIsrc: domElements.trackIsrc,
    shareButton: domElements.shareButton,
    shareOptions: domElements.shareOptions,
    countdownTimer: domElements.countdownTimer,
    totalDuration: domElements.totalDuration,
    welcomeScreen: domElements.welcomeScreen,
    playbackInfo: domElements.playbackInfo
  };
}

// ==========================================================================
// ACTUALIZACIÓN DE METADATOS Y PORTADA
// ==========================================================================

export function updateUIWithTrackInfo(trackInfo) {
  elements.songTitle.textContent = trackInfo.title;
  elements.songArtist.textContent = trackInfo.artist;
  elements.songAlbum.textContent = trackInfo.album ? `(${trackInfo.album})` : '';
  updateShareButtonVisibility();
}

export function resetUI() {
  elements.songTitle.textContent = 'Reproduciendo...';
  elements.songArtist.textContent = '';
  elements.songAlbum.textContent = '';
  resetCountdown();
  resetAlbumCover();
  resetAlbumDetails();
  updateShareButtonVisibility();
}

export function resetCountdown() {
  elements.countdownTimer.textContent = '--:--';
  elements.totalDuration.textContent = '(--:--)';
  elements.trackPosition.textContent = '--/--';
  elements.countdownTimer.classList.remove('ending');
}

export function resetAlbumCover() {
  elements.albumCover.innerHTML = `
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

export function displayAlbumCoverFromUrl(imageUrl) {
  if (!imageUrl) {
    resetAlbumCover();
    return;
  }
  elements.albumCover.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
  const img = new Image();
  img.decoding = 'async';
  img.onload = function () {
    const placeholder = elements.albumCover.querySelector('.album-cover-placeholder');
    if (placeholder) {
      placeholder.style.opacity = '0';
      placeholder.style.pointerEvents = 'none';
      setTimeout(() => {
        if (placeholder.parentNode === elements.albumCover) {
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
  elements.albumCover.innerHTML = '';
  const displayImg = document.createElement('img');
  displayImg.src = img.src;
  displayImg.alt = 'Portada del álbum';
  displayImg.classList.add('loaded');
  elements.albumCover.appendChild(displayImg);
}

export function resetAlbumDetails() {
  elements.releaseDate.textContent = '----';
  elements.recordLabel.textContent = '----';
  elements.albumTrackCount.textContent = '--';
  if (elements.trackIsrc) elements.trackIsrc.textContent = '----';
  elements.albumTotalDuration.textContent = '--:--';
  elements.trackGenre.textContent = '--';
  elements.trackPosition.textContent = '--/--';
}

export function updateAlbumDetailsWithSpotifyData(data) {
  // Año de publicación
  if (data.release_date) {
    const year = data.release_date.substring(0, 4);
    let displayText = year;
    if (data.albumTypeDescription && data.albumTypeDescription !== 'Álbum') {
      displayText += ` (${data.albumTypeDescription})`;
    }
    elements.releaseDate.textContent = displayText;
  } else {
    elements.releaseDate.textContent = '----';
  }

  // Otros metadatos
  elements.recordLabel.textContent = (data.label && data.label.trim()) ? data.label : '----';
  elements.albumTrackCount.textContent = data.totalTracks || '--';
  if (elements.trackIsrc) {
    elements.trackIsrc.textContent = (data.isrc && data.isrc.trim()) ? data.isrc : '----';
  }

  // Duración del álbum: Spotify envía totalAlbumDuration en MILISEGUNDOS
  if (data.totalAlbumDuration) {
    const durationInSeconds = data.totalAlbumDuration > 10000 ? Math.floor(data.totalAlbumDuration / 1000) : data.totalAlbumDuration;
    elements.albumTotalDuration.textContent = formatDuration(durationInSeconds);
  } else {
    elements.albumTotalDuration.textContent = '--:--';
  }

  elements.trackGenre.textContent = (data.genres && data.genres.length) ? data.genres.slice(0, 2).join(', ') : '--';
  elements.trackPosition.textContent = (data.trackNumber && data.totalTracks)
    ? `Track ${data.trackNumber}/${data.totalTracks}`
    : '--/--';
}

// ==========================================================================
// UTILIDADES DE UI
// ==========================================================================

export function updateShareButtonVisibility() {
  const title = elements.songTitle.textContent;
  const artist = elements.songArtist.textContent;
  const isVisible = title && artist &&
    title !== 'a sonar' &&
    title !== 'Conectando...' &&
    title !== 'Seleccionar estación' &&
    title !== 'A sonar' &&
    title !== 'Reproduciendo...' &&
    title !== 'Error de reproducción' &&
    title !== 'Reconectando...' &&
    artist !== '';

  elements.shareButton?.classList.toggle('visible', isVisible);
  if (!isVisible && elements.shareOptions) {
    elements.shareOptions.classList.remove('active');
  }
}

// ✅ Exportamos esta función (¡FALTABA!)
export function updateTotalDurationDisplay(durationSeconds) {
  if (durationSeconds > 0) {
    elements.totalDuration.textContent = formatDuration(durationSeconds);
  } else {
    elements.totalDuration.textContent = '(--:--)';
  }
}

// Asume que `seconds` es un número entero en segundos
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function showWelcomeScreen() {
  if (elements.welcomeScreen) elements.welcomeScreen.style.display = 'flex';
  if (elements.playbackInfo) elements.playbackInfo.style.display = 'none';
}

export function showPlaybackInfo() {
  if (elements.welcomeScreen) elements.welcomeScreen.style.display = 'none';
  if (elements.playbackInfo) elements.playbackInfo.style.display = 'flex';
}

export function showNotification(message, notificationElement) {
  if (notificationElement) {
    notificationElement.textContent = message;
    notificationElement.classList.add('show');
    setTimeout(() => notificationElement.classList.remove('show'), 3000);
  }
}
