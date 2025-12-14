// ==========================================================================//
// app.js — ARCHIVO ÚNICO FINAL (ESTABLE + UX/PWA + FIX LOOP)
// ==========================================================================
// ✔ Incluye lógica original
// ✔ Corrige loop infinito de carga
// ✔ Integra mejoras UX / PWA / Compartir
// ✔ SIN DOMContentLoaded duplicado
// ==========================================================================

// =========================
// DOM READY (ÚNICO)
// =========================
document.addEventListener('DOMContentLoaded', () => {

// ========================================================================
// REFERENCIAS DOM BÁSICAS (ORIGINAL)
// ========================================================================
const stationSelect = document.getElementById('station-select');
const loadingStations = document.getElementById('loading-stations');
const stationName = document.getElementById('station-name');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');

// ========================================================================
// UTILIDAD NOTIFICACIONES
// ========================================================================
const notification = document.getElementById('notification');
function showNotification(msg) {
if (!notification) return;
notification.innerHTML = msg;
notification.classList.add('show');
setTimeout(() => notification.classList.remove('show'), 3000);
}

// ========================================================================
// CARGA DE ESTACIONES (FIX LOOP DEFINITIVO)
// ========================================================================
async function loadStations() {
try {
const response = await fetch('stations.json');
if (!response.ok) throw new Error(`HTTP ${response.status}`);

```
  const stations = await response.json();

  stations.forEach(station => {
    const opt = document.createElement('option');
    opt.value = station.id;
    opt.textContent = station.name;
    stationSelect.appendChild(opt);
  });

  console.log('Stations loaded successfully');

} catch (err) {
  console.error('Error cargando estaciones:', err);
  loadingStations.textContent = 'Error al cargar estaciones';

} finally {
  // ✅ evita loop infinito
  loadingStations.style.display = 'none';
  stationSelect.style.display = 'block';
}
```

}

loadStations();

// ========================================================================
// UX / PWA
// ========================================================================
let deferredPrompt;
let pwaInteractions = 0;
let pwaDismissed = localStorage.getItem('pwaDismissed') === 'true';

const installPwaBtnAndroid = document.getElementById('install-pwa-btn-android');
const installPwaBtnIos = document.getElementById('install-pwa-btn-ios');

function showInstallPwaButtons() {
if (pwaDismissed) return;
if (window.matchMedia('(display-mode: standalone)').matches) return;

```
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
installPwaBtnAndroid && (installPwaBtnAndroid.style.display = isIos ? 'none' : 'flex');
installPwaBtnIos && (installPwaBtnIos.style.display = isIos ? 'flex' : 'none');
```

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

// ========================================================================
// COMPARTIR (WhatsApp + Copiar)
// ========================================================================
const shareButton = document.getElementById('shareButton');
const shareOptions = document.getElementById('shareOptions');
const shareWhatsApp = document.getElementById('shareWhatsApp');
const shareCopy = document.getElementById('shareCopy');

shareButton?.addEventListener('click', () => {
shareOptions.classList.toggle('active');
});

shareWhatsApp?.addEventListener('click', () => {
if (!songTitle.textContent || !songArtist.textContent) return;
const msg = `Escuché ${songTitle.textContent} de ${songArtist.textContent} en https://kutt.it/radiomax`;
window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
shareOptions.classList.remove('active');
});

shareCopy?.addEventListener('click', async () => {
const msg = `Escuché ${songTitle.textContent} de ${songArtist.textContent} en https://kutt.it/radiomax`;
await navigator.clipboard.writeText(msg);
showNotification('🔗 Enlace copiado');
shareOptions.classList.remove('active');
});

});
