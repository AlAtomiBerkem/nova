// Service Worker админки NOVA — приём web-push и клик по уведомлению.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'NOVA';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Новая активность',
      data: { url: data.url || '/admin.html' },
      icon: '/favicon.ico',
      tag: data.conversationId || 'nova',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/admin.html') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
