/* eslint-disable no-undef */

const LEGACY_TIMER_MARKER = '__betterme_kind:timer__'

function cleanNotificationBody(body) {
  if (!body || typeof body !== 'string') return body || ''
  const raw = body.trim()
  if (!raw.includes('betterme_kind:timer')) return body

  if (raw === LEGACY_TIMER_MARKER || raw.startsWith(`${LEGACY_TIMER_MARKER}\n`)) {
    const text = raw.slice(LEGACY_TIMER_MARKER.length).replace(/^\n/, '').trim()
    return text || 'Le timer est terminé !'
  }

  return body
}

self.addEventListener('push', (event) => {
  const iconUrl = new URL('icon-192.png', self.registration.scope).href
  let title = 'BetterMe'
  let body = ''
  let tag = 'betterme-default'

  try {
    if (event.data) {
      const data = event.data.json()
      title = data.title ?? title
      body = cleanNotificationBody(data.body ?? body)
      if (data.tag) tag = String(data.tag)
    }
  } catch {
    /* corps vide ou invalide */
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconUrl,
      tag,
      renotify: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const base = self.registration?.scope ?? '/'
  event.waitUntil(clients.openWindow(base))
})
