📡 RadioMax — Documentación Técnica
RadioMax es una aplicación web moderna de radio por internet, construida con arquitectura modular, soporte PWA, integración con APIs de metadatos (Spotify, MusicBrainz) y contador de oyentes en tiempo real mediante Supabase.

🗂️ Estructura de Archivos
bash
123456789101112131415
📄 Descripción de Archivos JavaScript
✅ main.js — Punto de Entrada y Orquestador
Responsabilidad: Coordinar todos los módulos y gestionar el flujo de la aplicación.
Funciones clave:
Inicializa la UI con initializeUI(uiElements)
Crea instancias de AudioPlayer, CustomSelect
Maneja eventos de selección de estación, play/pause, favoritos
Orquesta la actualización de metadatos mediante updateSongInfo()
Gestiona la lógica de presencia con joinStation() / leaveStation()
Importa: Todos los módulos (supabase-presence, station-manager, audio-player, metadata-fetchers, ui-controller)
✅ supabase-presence.js — Presencia en Tiempo Real
Responsabilidad: Gestionar el contador de oyentes activos por estación usando Supabase Realtime Channels.
Funciones clave:
getUserUniqueID(): Genera/obtiene un ID único persistente en localStorage.
joinStation(supabase, stationId): Se une al canal de presencia de una estación.
leaveStation(supabase): Se desconecta del canal actual.
No toca el DOM: Solo maneja la lógica de presencia. El contador visual se debe implementar en ui-controller.js (actualmente comentado en HTML: <!-- <div id="totalListeners">0</div> -->).
✅ station-manager.js — Gestión de Estaciones y Favoritos
Responsabilidad: Cargar, agrupar y gestionar las estaciones de radio y los favoritos del usuario.
Funciones clave:
loadStations(): Carga stations.json y agrupa por servicio (SomaFM, Radio Paradise, etc.).
getFavorites() / saveFavorites(): Lee y escribe la lista de IDs de estaciones favoritas en localStorage.
addFavorite() / removeFavorite() / isFavorite(): Gestión básica de favoritos.
getLastSelectedStationId() / saveLastSelectedStation(): Persistencia de la última estación seleccionada.
Exporta constantes: FAVORITES_KEY (clave de localStorage).
✅ audio-player.js — Control del Reproductor de Audio
Responsabilidad: Encapsular toda la lógica de reproducción, volumen, errores y reconexión automática.
Clase: AudioPlayer
Métodos clave:
play(src) / pause() / stop(): Control de reproducción.
setVolume() / toggleMute(): Gestión de volumen.
handlePlaybackError(): Detecta errores de audio y activa el sistema de reconexión.
startReconnection() / stopReconnection(): Intenta reconectar automáticamente tras fallos.
attemptResumePlayback(): Reanuda la reproducción tras pérdida de foco (Facebook, etc.).
Gestiona eventos: playing, pause, stalled, ended, error.
✅ metadata-fetchers.js — Integración con APIs Externas
Responsabilidad: Obtener metadatos de canciones desde servicios externos.
Funciones clave:
fetchSomaFmInfo(stationId): Obtiene la canción actual desde la API de SomaFM.
fetchRadioParadiseInfo(channelId): Obtiene la canción actual desde Radio Paradise (vía proxy).
fetchSpotifyDetails(artist, title, album): Consulta Spotify (vía proxy) para obtener portada, año, duración, etc.
fetchMusicBrainzDuration(artist, title): Obtiene la duración desde MusicBrainz si Spotify no la proporciona.
Incluye apiCallTracker: Evita llamadas excesivas (rate limiting por servicio).
Exporta logErrorForAnalysis: Centraliza el logging de errores.
✅ ui-controller.js — Actualización Segura del DOM
Responsabilidad: Actualizar la interfaz de usuario sin tocar el DOM desde otros módulos.
Funciones clave:
initializeUI(domElements): Registra referencias a los elementos del DOM.
updateUIWithTrackInfo(trackInfo): Actualiza título, artista y álbum.
updateAlbumDetailsWithSpotifyData(data): Rellena año, sello, tracks, género, ISRC, etc.
displayAlbumCoverFromUrl(imageUrl): Carga y muestra la portada con transición suave.
updateTotalDurationDisplay(durationSeconds): Muestra la duración total (ej. 05:12).
resetUI() / resetAlbumCover() / resetAlbumDetails(): Restablece estados.
showWelcomeScreen() / showPlaybackInfo(): Cambia entre pantallas.
Evita side effects: Todas las actualizaciones pasan por este módulo.
🔌 Flujo de Datos (Resumen)
El usuario selecciona una estación → main.js llama a playStation().
playStation() reproduce el audio y llama a joinStation(supabase, stationId).
Cada 6s (o en eventos rápidos), updateSongInfo() se ejecuta.
updateSongInfo() obtiene metadatos y, si hay cambios, llama a enrichTrackMetadata().
enrichTrackMetadata() consulta Spotify/MusicBrainz y llama a:
displayAlbumCoverFromUrl() → actualiza portada
updateAlbumDetailsWithSpotifyData() → actualiza año, sello, etc.
updateTotalDurationDisplay() → actualiza duración
Todas las actualizaciones del DOM se delegan a ui-controller.js.
⚙️ Requisitos Técnicos
Navegador moderno con soporte para:
Módulos ES6 (<script type="module">)
async/await, fetch, requestAnimationFrame
Service Worker (para PWA)
Conexión a internet para:
Cargar estaciones (stations.json)
Obtener streaming de audio
Consultar APIs de metadatos
Usar Supabase Realtime
🛠️ Personalización
Agregar nuevas estaciones: Editar stations.json con el formato:
json
123456789
Cambiar proxy de Spotify/MusicBrainz: Modificar las URLs en metadata-fetchers.js.
Habilitar contador de oyentes: Descomentar <div id="totalListeners">0</div> en el HTML y usar elements.totalListeners en ui-controller.js.
✨ RadioMax está diseñado para ser modular, mantenible y escalable. Cada funcionalidad está aislada en su propio módulo, facilitando la depuración y evolución del proyecto.
