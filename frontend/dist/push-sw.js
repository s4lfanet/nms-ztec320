/* Web Push handlers — injected into the generated service worker via
   workbox.importScripts (Fase 14). */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try { data = { body: event.data.text() }; } catch (e2) { /* empty */ }
  }
  const title = data.title || 'Salfanet NMS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      tag: data.tag || 'nms-alert',
      renotify: true,
      // Android: getar + tetap tampil (heads-up/mengambang) untuk gangguan kritis
      vibrate: [200, 100, 200, 100, 300],
      requireInteraction: data.severity === 'critical',
      silent: false,
      timestamp: Date.now(),
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin)) {
          w.focus();
          w.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
