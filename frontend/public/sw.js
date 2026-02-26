// Minimal service worker — required for PWA installability (and share_target support)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
