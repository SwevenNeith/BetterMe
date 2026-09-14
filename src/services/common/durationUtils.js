/** Total en minutes à partir des champs heures + minutes du formulaire */
export function getDurationMinutes(heures, minutes) {
  const h = Math.min(23, Math.max(0, Number(heures) || 0))
  const m = Math.min(59, Math.max(0, Number(minutes) || 0))
  return h * 60 + m
}

/** Ajoute une durée (minutes) à une heure HH:mm → HH:mm (même jour, max 23:59) */
export function addMinutesToTimeString(timeStr, durationMinutes) {
  const [startH, startM] = String(timeStr || '00:00')
    .slice(0, 5)
    .split(':')
    .map(Number)
  const total = startH * 60 + startM + durationMinutes
  if (total >= 24 * 60) {
    return null
  }
  const endH = Math.floor(total / 60)
  const endM = total % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}
