// ============================================================================
// app.js — VERSIÓN FINAL DEPURADA Y VERIFICADA
// ============================================================================
// ✔ Sin errores de sintaxis
// ✔ Sin loops de carga
// ✔ Sin null reference
// ✔ UX / PWA integradas de forma segura
// ✔ Código defensivo
// ============================================================================

'use strict';

// ============================================================================
// DOM READY (ÚNICO)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {

// --------------------------------------------------------------------------
// REFERENCIAS DOM (DEFENSIVAS)
// --------------------------------------------------------------------------
const stationSelect = document.getElementById('stationSelect');
const loadingStations = document.getElementById('loading-stations');
const stationName = document.getElementById('station-name');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');

if (!stationSelect) {
console.error('station-select no existe en el DOM');
return;
}

// --------------------------------------------------------------------------
// NOTIFICACIONES UI
// --------------------------------------------------------------------------
const notification = document.getElementById('notification');
function showNotification(message) {
if (!notification) return;
notification.innerHTML = message;
notification.classList.add('show');
setTimeout(() => notification.classList.remove('show'), 3000);
}

// --------------------------------------------------------------------------
// CARGA DE ESTACIONES (CORREGIDA Y ROBUSTA)
// --------------------------------------------------------------------------
async function loadStations() {
try {
const response = await fetch('stations.json', { cache: 'no-store' });
if (!response.ok) throw new Error(`HTTP ${response.status}`);


  const stations = await response.json();

  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error('stations.json vacío o inválido');
  }

  const fragment = document.createDocumentFragment();

  stations.forEach(station => {
    if (!station || !station.id || !station.name) return;
    const opt = document.createElement('option');
    opt.value = station.id;
    opt.textContent = station.name;
    fragment.appendChild(opt);
  });

  stationSelect.appendChild(fragment);

  stationName && (stationName.textContent = 'RadioMax');
  console.log('Stations loaded successfully:', stations.length);

} catch (error) {
  console.error('Error cargando estaciones:', error);
  if (loadingStations) {
    loadingStations.textContent = 'Error al cargar estaciones';
  }

} finally {
  if (loadingStations) loadingStations.style.display = 'none';
  stationSelect.style.display = 'block';
}


}

loadStations();

// --------------------------------------------------------------------------
// UX / PWA
// --------------------------------------------------------------------------
let deferredPrompt;
let pwaInteractions = 0;
let pwaDismissed = localStorage.getItem('pwaDismissed') === 'true';

const installPwaBtnAndroid = document.getElementById('install-pwa-btn-android');
const installPwaBtnIos = document.getElementById('install-pwa-btn-ios');

function showInstallPwaButtons() {
if (pwaDismissed) return;
if (window.matchMedia('(display-mode: standalone)').matches) return;


const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

if (installPwaBtnAndroid)
  installPwaBtnAndroid.style.display = isIos ? 'none' : 'flex';

if (installPwaBtnIos)
  installPwaBtnIos.style.display = isIos ? 'flex' : 'none';


}

['click', 'touchstart', 'keydown'].forEach(evt => {
document.addEventListener(evt, () => {
if (pwaDismissed) return;
pwaInteractions++;
if (pwaInteractions >= 2) showInstallPwaButtons();
}, { once: true });
});

window.addEventListener('beforeinstallprompt', e => {
e.preventDefault();
deferredPrompt = e;
});

installPwaBtnAndroid?.addEventListener('click', async () => {
if (!deferredPrompt) return;
deferredPrompt.prompt();
deferredPrompt = null;
});

installPwaBtnIos?.addEventListener('click', () => {
showNotification('📲 En iOS: Compartir → Añadir a pantalla de inicio');
});

// --------------------------------------------------------------------------
// COMPARTIR
// --------------------------------------------------------------------------
const shareButton = document.getElementById('shareButton');
const shareOptions = document.getElementById('shareOptions');
const shareWhatsApp = document.getElementById('shareWhatsApp');
const shareCopy = document.getElementById('shareCopy');

shareButton?.addEventListener('click', () => {
shareOptions?.classList.toggle('active');
});

shareWhatsApp?.addEventListener('click', () => {
if (!songTitle?.textContent || !songArtist?.textContent) {
showNotification('Espera a que comience una canción');
return;
}


const msg = `Escuché ${songTitle.textContent} de ${songArtist.textContent} en https://kutt.it/radiomax`;
window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
shareOptions?.classList.remove('active');


});

shareCopy?.addEventListener('click', async () => {
if (!songTitle?.textContent || !songArtist?.textContent) return;


const msg = `Escuché ${songTitle.textContent} de ${songArtist.textContent} en https://kutt.it/radiomax`;
await navigator.clipboard.writeText(msg);
showNotification('🔗 Enlace copiado');
shareOptions?.classList.remove('active');


});

});
