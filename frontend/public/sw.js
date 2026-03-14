// Service worker — PWA installability + push notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// Push notification received
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const { title, body, url, tag } = data;

  event.waitUntil(
    self.registration.showNotification(title || 'Triptomat', {
      body: body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: tag || 'triptomat-default',
      data: { url: url || '/' },
    })
  );
});

// Notification clicked — open or focus the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});
