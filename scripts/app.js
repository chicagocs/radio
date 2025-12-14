// ==========================================================================
// APP.JS — VERSIÓN FINAL DEPURADA
// Incluye: UX PWA, guía iOS, compartir mejorado, correcciones y limpieza
// ==========================================================================

// ==========================================================================
// APP.JS — VERSIÓN FINAL DEPURADA (SIN LOOP)
// NOTA: Este código se integra DENTRO del DOMContentLoaded existente
// ==========================================================================

// ==========================================================================
// VARIABLES UX / PWA (NO redeclarar DOMContentLoaded)
// ==========================================================================
let deferredPrompt;
let pwaInteractions = 0;
let pwaDismissed = localStorage.getItem('pwaDismissed') === 'true';

const installPwaBtnAndroid = document.getElementById('install-pwa-btn-android');
const installPwaBtnIos = document.getElementById('install-pwa-btn-ios');

const shareButton = document.getElementById('shareButton');
const shareOptions = document.getElementById('shareOptions');
const shareWhatsApp = document.getElementById('shareWhatsApp');
const shareCopy = document.getElementById('shareCopy');

const notification = document.getElementById('notification');

// ==========================================================================
// UTILIDADES
// ==========================================================================
function showNotification(message) {
  if (!notification) return;
  notification.innerHTML = message;
  notification.classList.add('show');
  setTimeout(() => notification.classList.remove('show'), 3000);
}

function softHaptic() {
  navigator.vibrate?.(10);
}

// ==========================================================================
// GUÍA iOS (UNA SOLA VEZ)
// ==========================================================================
function showIosInstallGuideOnce() {
  if (localStorage.getItem('iosInstallGuideSeen')) return;

  showNotification(
    '📲 Para instalar en iOS:<br>1️⃣ Pulsa <b>Compartir</b><br>2️⃣ <b>Añadir a pantalla de inicio</b>'
  );

  localStorage.setItem('iosInstallGuideSeen', 'true');
}

// ==========================================================================
// LÓGICA DE INSTALACIÓN PWA
// ==========================================================================
function showInstallPwaButtons() {
  if (pwaDismissed) return;

  if (window.matchMedia('(display-mode: standalone)').matches) {
    installPwaBtnAndroid?.remove();
    installPwaBtnIos?.remove();
    return;
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIos) {
    installPwaBtnAndroid && (installPwaBtnAndroid.style.display = 'none');
    installPwaBtnIos && (installPwaBtnIos.style.display = 'flex');
  } else {
    installPwaBtnAndroid && (installPwaBtnAndroid.style.display = 'flex');
    installPwaBtnIos && (installPwaBtnIos.style.display = 'none');
  }
}

['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (pwaDismissed) return;
    pwaInteractions++;
    if (pwaInteractions >= 2) showInstallPwaButtons();
  });
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

installPwaBtnAndroid?.addEventListener('click', async (e) => {
  e.preventDefault();
  softHaptic();
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') installPwaBtnAndroid.style.display = 'none';
  deferredPrompt = null;
});

installPwaBtnIos?.addEventListener('click', (e) => {
  e.preventDefault();
  softHaptic();
  showIosInstallGuideOnce();
});

if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
  setTimeout(showIosInstallGuideOnce, 4000);
}

// ==========================================================================
// LÓGICA DE COMPARTIR
// ==========================================================================
shareButton?.addEventListener('click', () => {
  softHaptic();
  shareOptions?.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (!shareButton?.contains(e.target) && !shareOptions?.contains(e.target)) {
    shareOptions?.classList.remove('active');
  }
});

shareWhatsApp?.addEventListener('click', () => {
  const title = songTitle?.textContent;
  const artist = songArtist?.textContent;

  if (!title || !artist || title.includes('Conectando') || title.includes('Seleccionar')) {
    showNotification('Espera a que comience una canción');
    return;
  }

  const message = `Escuché ${title} de ${artist} en https://kutt.it/radiomax`;
  softHaptic();
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  shareOptions?.classList.remove('active');
});

shareCopy?.addEventListener('click', async () => {
  const title = songTitle?.textContent;
  const artist = songArtist?.textContent;

  if (!title || !artist || title.includes('Conectando') || title.includes('Seleccionar')) {
    showNotification('Espera a que comience una canción');
    return;
  }

  const message = `Escuché ${title} de ${artist} en https://kutt.it/radiomax`;

  try {
    await navigator.clipboard.writeText(message);
    softHaptic();
    showNotification('🔗 Enlace copiado');
    shareOptions?.classList.remove('active');
  } catch {
    showNotification('No se pudo copiar el enlace');
  }
});
