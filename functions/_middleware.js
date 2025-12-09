// functions/_middleware.js

export function onRequest(context) {
  const response = context.next();

  // Tus headers de seguridad
  const securityHeaders = {
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), encrypted-media=(), fullscreen=(self), picture-in-picture=(self)",
    "Content-Security-Policy": "default-src 'none'; script-src 'self' https://core.chcs.workers.dev https://stats.tramax.com.ar; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://core.s.workers.dev https://stats.max.com; connect-src 'self' https://api.radio.com https://core.s.workers.dev; font-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin"
  };

  // Aplicar los headers a la respuesta
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
