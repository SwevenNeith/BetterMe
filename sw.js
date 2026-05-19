/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
  const iconUrl = new URL('icon-192.png', self.registration.scope).href
  let title = 'BetterMe'
  let body = ''

  try {
    if (event.data) {
      const data = event.data.json()
      title = data.title ?? title
      body = data.body ?? body
    }
  } catch {
    /* corps vide ou invalide */
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconUrl,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const base = self.registration?.scope ?? '/'
  event.waitUntil(clients.openWindow(base))
})
