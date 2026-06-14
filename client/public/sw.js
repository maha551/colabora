/* Colabora service worker — Web Push notifications */

self.addEventListener('push', (event) => {
  let payload = { title: 'Colabora', body: '', url: '/', tag: 'colabora' };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  const targetUrl = new URL(payload.url || '/', self.location.origin).href;

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Colabora', {
      body: payload.body || '',
      tag: payload.tag || 'colabora',
      icon: '/favicon-32x32.png',
      badge: '/favicon-32x32.png',
      data: { url: targetUrl },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || self.location.origin + '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            return client.focus().then((focused) => {
              if ('navigate' in focused && typeof focused.navigate === 'function') {
                return focused.navigate(url);
              }
              return focused;
            });
          }
        }
        return clients.openWindow(url);
      })
  );
});
