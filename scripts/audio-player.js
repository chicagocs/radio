// scripts/audio-player.js

export class AudioPlayer {
  constructor(audioElement, playBtn, stopBtn, volumeSlider, volumeIcon, notificationElement) {
    this.audio = audioElement;
    this.playBtn = playBtn;
    this.stopBtn = stopBtn;
    this.volumeSlider = volumeSlider;
    this.volumeIcon = volumeIcon;
    this.notificationElement = notificationElement;

    // Estado interno
    this.isPlaying = false;
    this.isMuted = false;
    this.previousVolume = 50;
    this.wasPlayingBeforeFocusLoss = false;
    this.lastPlaybackTime = 0;

    // Intervalos y timeouts
    this.timeStuckCheckInterval = null;
    this.reconnectTimeoutId = null;
    this.audioCheckInterval = null;

    // Configuración del gestor de reconexión
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.initialReconnectDelay = 1000;
    this.maxReconnectDelay = 30000;

    // Bind de métodos
    this.handlePlayClick = this.handlePlayClick.bind(this);
    this.handleStopClick = this.handleStopClick.bind(this);
    this.handleVolumeChange = this.handleVolumeChange.bind(this);
    this.handleVolumeIconClick = this.handleVolumeIconClick.bind(this);
    this.handleAudioError = this.handleAudioError.bind(this);
    this.handleAudioPause = this.handleAudioPause.bind(this);
    this.handleAudioStalled = this.handleAudioStalled.bind(this);
    this.handleAudioPlaying = this.handleAudioPlaying.bind(this);
    this.handleAudioEnded = this.handleAudioEnded.bind(this);

    this.init();
  }

  init() {
    // Inicializar volumen
    this.audio.volume = 0.5;
    this.volumeSlider.value = 50;
    this.updateVolumeIconPosition();

    // Eventos de UI
    if (this.playBtn) this.playBtn.addEventListener('click', this.handlePlayClick);
    if (this.stopBtn) this.stopBtn.addEventListener('click', this.handleStopClick);
    if (this.volumeSlider) this.volumeSlider.addEventListener('input', this.handleVolumeChange);
    if (this.volumeIcon) this.volumeIcon.addEventListener('click', this.handleVolumeIconClick);

    // Eventos del elemento de audio
    this.audio.addEventListener('error', this.handleAudioError);
    this.audio.addEventListener('pause', this.handleAudioPause);
    this.audio.addEventListener('stalled', this.handleAudioStalled);
    this.audio.addEventListener('playing', this.handleAudioPlaying);
    this.audio.addEventListener('ended', this.handleAudioEnded);

    // Iniciar verificación de audio atascado cuando se reproduce
    this.startTimeStuckCheck();

    // Manejo de visibilidad y foco (para Facebook, etc.)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.wasPlayingBeforeFocusLoss = this.isPlaying;
      } else {
        this.attemptResumePlayback();
      }
    });

    window.addEventListener('blur', () => {
      this.wasPlayingBeforeFocusLoss = this.isPlaying;
    });

    window.addEventListener('focus', () => {
      this.attemptResumePlayback();
    });

    document.addEventListener('click', () => {
      if (this.wasPlayingBeforeFocusLoss && !this.isPlaying) {
        setTimeout(() => {
          if (this.wasPlayingBeforeFocusLoss && !this.isPlaying) {
            this.attemptResumePlayback();
          }
        }, 500);
      }
    });

    // Evento online/offline
    window.addEventListener('online', () => {
      if (this.isReconnecting) {
        this.attemptReconnect();
      }
    });
  }

  // === CONTROLES BÁSICOS ===

  play(src) {
    if (!src) return Promise.reject(new Error('No source provided'));
    this.audio.src = src;
    return this.audio.play()
      .then(() => {
        this.isPlaying = true;
        this.wasPlayingBeforeFocusLoss = true;
        this.updatePlayButtonState();
        this.startTimeStuckCheck();
        return true;
      })
      .catch(err => {
        this.isPlaying = false;
        this.updatePlayButtonState();
        throw err;
      });
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.wasPlayingBeforeFocusLoss = false;
    this.updatePlayButtonState();
  }

  stop() {
    this.audio.pause();
    this.audio.src = '';
    this.isPlaying = false;
    this.wasPlayingBeforeFocusLoss = false;
    this.updatePlayButtonState();
    this.stopReconnection();
  }

  // === VOLÚMEN ===

  setVolume(percent) {
    const volume = Math.max(0, Math.min(100, percent)) / 100;
    this.audio.volume = volume;
    this.volumeSlider.value = percent;
    this.isMuted = percent === 0;
    this.updateVolumeIconPosition();
  }

  toggleMute() {
    if (this.isMuted) {
      this.setVolume(this.previousVolume);
      this.isMuted = false;
    } else {
      this.previousVolume = Number(this.volumeSlider.value);
      this.setVolume(0);
      this.isMuted = true;
    }
  }

  updateVolumeIconPosition() {
    const sliderWidth = this.volumeSlider.offsetWidth;
    const percent = this.volumeSlider.value / this.volumeSlider.max;
    const iconWidth = this.volumeIcon.offsetWidth;
    const newPosition = percent * sliderWidth - iconWidth / 2;
    this.volumeIcon.style.left = `${newPosition}px`;
    this.volumeIcon.classList.toggle('muted', this.isMuted);
  }

  // === REPRODUCCIÓN ===

  updatePlayButtonState() {
    if (this.playBtn) {
      this.playBtn.textContent = this.isPlaying ? '⏸ PAUSAR' : '▶ SONAR';
    }
  }

  handlePlayClick() {
    if (this.isPlaying) {
      this.pause();
    } else {
      // Se espera que el usuario llame a `.play(url)` externamente
      // o que ya se haya establecido `this.audio.src`
      this.audio.play()
        .then(() => {
          this.isPlaying = true;
          this.wasPlayingBeforeFocusLoss = true;
          this.updatePlayButtonState();
          this.startTimeStuckCheck();
        })
        .catch(err => {
          this.showNotification('Toca para reanudar la reproducción');
          if (this.playBtn) this.playBtn.style.animation = 'pulse 2s infinite';
        });
    }
  }

  handleStopClick() {
    this.stop();
  }

  handleVolumeChange(e) {
    const value = e.target.value;
    this.setVolume(value);
    this.previousVolume = value;
  }

  handleVolumeIconClick() {
    this.toggleMute();
  }

  // === MANEJO DE ERRORES Y RECONEXIÓN ===

  handlePlaybackError(onReconnectStart) {
    if (this.isReconnecting) return;
    if (!this.audio.paused && this.audio.currentTime > 0) {
      console.log('El audio está reproduciéndose, no se inicia el gestor de reconexión');
      return;
    }

    this.isPlaying = false;
    this.updatePlayButtonState();
    this.audio.pause();
    this.stopAllIntervals();

    if (typeof onReconnectStart === 'function') {
      this.startReconnection(onReconnectStart);
    }
  }

  startReconnection(onReconnectSuccess) {
    this.isReconnecting = true;
    this.reconnectAttempts = 0;
    this.attemptReconnect(onReconnectSuccess);
    this.startAudioCheck(onReconnectSuccess);
  }

  stopReconnection() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.audioCheckInterval) {
      clearInterval(this.audioCheckInterval);
      this.audioCheckInterval = null;
    }
  }

  attemptReconnect(onReconnectSuccess) {
    if (!this.isReconnecting || !this.audio.src) {
      this.stopReconnection();
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showNotification('Error de conexión: no se pudo restaurar');
      this.stopReconnection();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.reconnectTimeoutId = setTimeout(async () => {
      try {
        await this.audio.play();
        this.isPlaying = true;
        this.wasPlayingBeforeFocusLoss = true;
        this.updatePlayButtonState();
        this.startTimeStuckCheck();
        this.showNotification('Conexión restaurada con éxito.');
        this.stopReconnection();
        if (typeof onReconnectSuccess === 'function') onReconnectSuccess();
      } catch (error) {
        this.attemptReconnect(onReconnectSuccess);
      }
    }, delay);
  }

  startAudioCheck(onReconnectSuccess) {
    this.audioCheckInterval = setInterval(() => {
      if (!this.audio.paused && this.audio.currentTime > 0) {
        this.stopReconnection();
        this.isPlaying = true;
        this.updatePlayButtonState();
        this.showNotification('Conexión restaurada con éxito.');
        if (typeof onReconnectSuccess === 'function') onReconnectSuccess();
      }
    }, 1000);
  }

  // === DETECCIÓN DE AUDIO ATASCADO ===

  startTimeStuckCheck() {
    if (this.timeStuckCheckInterval) clearInterval(this.timeStuckCheckInterval);
    this.lastPlaybackTime = this.audio.currentTime;
    this.timeStuckCheckInterval = setInterval(() => {
      if (this.isPlaying) {
        if (this.audio.currentTime === this.lastPlaybackTime) {
          // Audio atascado → disparar error de reproducción
          // Se espera que el usuario maneje esto externamente
          return;
        }
        this.lastPlaybackTime = this.audio.currentTime;
      }
    }, 3000);
  }

  stopAllIntervals() {
    if (this.timeStuckCheckInterval) {
      clearInterval(this.timeStuckCheckInterval);
      this.timeStuckCheckInterval = null;
    }
  }

  // === RESUMEN AUTOMÁTICO (Facebook, etc.) ===

  attemptResumePlayback() {
    if (this.wasPlayingBeforeFocusLoss && !this.isPlaying && this.audio.src) {
      setTimeout(() => {
        if (!this.isPlaying && this.audio.src) {
          this.audio.play()
            .then(() => {
              this.isPlaying = true;
              this.updatePlayButtonState();
              this.startTimeStuckCheck();
              this.showNotification('Reproducción reanudada automáticamente');
            })
            .catch(() => {
              this.showNotification('Toca para reanudar la reproducción');
              if (this.playBtn) this.playBtn.style.animation = 'pulse 2s infinite';
            });
        }
      }, 1000);
    }
  }

  // === MANEJADORES DE EVENTOS DE AUDIO ===

  handleAudioError(e) {
    const error = this.audio.error;
    if (!error || error.code === 1 || error.code === 4) return;

    const isInterruption =
      error.message.includes('The play() request was interrupted') ||
      error.message.includes('The fetching process for media resource was aborted');

    if (isInterruption) {
      this.wasPlayingBeforeFocusLoss = true;
      setTimeout(() => this.attemptResumePlayback(), 2000);
    } else {
      // Se espera que el usuario llame a handlePlaybackError externamente
    }
  }

  handleAudioPause() {
    if (this.isPlaying && !document.hidden) {
      this.wasPlayingBeforeFocusLoss = true;
      setTimeout(() => this.attemptResumePlayback(), 1000);
    } else {
      this.isPlaying = false;
      this.updatePlayButtonState();
    }
  }

  handleAudioStalled() {
    if (this.isPlaying) {
      this.wasPlayingBeforeFocusLoss = true;
      setTimeout(() => this.attemptResumePlayback(), 2000);
    }
  }

  handleAudioPlaying() {
    this.isPlaying = true;
    this.wasPlayingBeforeFocusLoss = true;
    this.updatePlayButtonState();
  }

  handleAudioEnded() {
    this.isPlaying = false;
    this.wasPlayingBeforeFocusLoss = false;
    this.updatePlayButtonState();
  }

  // === UTILIDADES ===

  showNotification(message) {
    if (this.notificationElement) {
      this.notificationElement.textContent = message;
      this.notificationElement.classList.add('show');
      setTimeout(() => {
        this.notificationElement.classList.remove('show');
      }, 3000);
    }
  }

  // === DESTRUCTOR (opcional, para limpieza) ===
  destroy() {
    this.stopReconnection();
    this.stopAllIntervals();
    // Eliminar listeners si es necesario (opcional en apps SPA)
  }
}
