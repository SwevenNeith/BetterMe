/* eslint-disable no-undef */
// Écoute les notifications push
self.addEventListener('push', (event) => {
  const data = event.data.json()

  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
  })
})

// Quand on clique sur la notif → ouvre l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  clients.openWindow('/')
})
