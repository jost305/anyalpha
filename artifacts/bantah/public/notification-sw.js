self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'AnyAlpha alert';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const id = typeof payload.id === 'string' ? payload.id : undefined;
  const kind = typeof payload.kind === 'string' ? payload.kind : 'anyalpha_alert';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/notifications';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon.png',
      tag: id || kind,
      renotify: Boolean(id),
      vibrate: [80, 30, 80],
      data: {
        id,
        kind,
        url,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/notifications';
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.focus().then(() => client.navigate(absoluteUrl));
        }
      }

      return self.clients.openWindow(absoluteUrl);
    }),
  );
});
