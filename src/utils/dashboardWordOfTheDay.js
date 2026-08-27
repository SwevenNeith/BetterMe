/**
 * Sélection du « mot du jour » : 1 entrée aléatoire, pas le même 2 jours d’affilée
 * (sauf s’il n’y a qu’un seul mot). Persistance locale par utilisateur.
 */

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function storageKey(userId) {
  return `betterme-word-of-the-day:${userId || 'anon'}`
}

/**
 * @param {string} userId
 * @returns {{ date: string, entryId: string } | null}
 */
function readStored(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.date !== 'string' || typeof parsed.entryId !== 'string') return null
    return { date: parsed.date, entryId: parsed.entryId }
  } catch {
    return null
  }
}

/**
 * @param {string} userId
 * @param {{ date: string, entryId: string }} payload
 */
function writeStored(userId, payload) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @template {{ id: string }} T
 * @param {T[]} entries
 * @param {string} userId
 * @returns {T | null}
 */
export function pickWordOfTheDay(entries, userId) {
  if (!Array.isArray(entries) || entries.length === 0) return null

  const today = localDateKey()
  const stored = readStored(userId)

  if (stored?.date === today) {
    const sameDay = entries.find((entry) => entry.id === stored.entryId)
    if (sameDay) return sameDay
  }

  const previousId = stored?.entryId ?? null
  let pool = entries
  if (entries.length > 1 && previousId) {
    const withoutPrevious = entries.filter((entry) => entry.id !== previousId)
    if (withoutPrevious.length) pool = withoutPrevious
  }

  const pick = pool[Math.floor(Math.random() * pool.length)]
  if (!pick) return null

  writeStored(userId, { date: today, entryId: pick.id })
  return pick
}
