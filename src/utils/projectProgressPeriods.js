import { PROJECT_RESET_PERIODE } from '../constants/projectProgress.js'

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function toLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Bornes inclusives de la période contenant `date` (lun–dim pour semaine). */
export function getPeriodBoundsForDate(date, resetPeriode) {
  const d = date instanceof Date ? date : new Date(date)

  if (resetPeriode === PROJECT_RESET_PERIODE.JOUR) {
    return { start: startOfDay(d), end: endOfDay(d) }
  }

  if (resetPeriode === PROJECT_RESET_PERIODE.SEMAINE) {
    const jsDay = d.getDay()
    const diff = jsDay === 0 ? -6 : 1 - jsDay
    const monday = new Date(d)
    monday.setDate(d.getDate() + diff)
    const start = startOfDay(monday)
    const sunday = new Date(start)
    sunday.setDate(start.getDate() + 6)
    return { start, end: endOfDay(sunday) }
  }

  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export function getPeriodKey(date, resetPeriode) {
  const { start } = getPeriodBoundsForDate(date, resetPeriode)
  if (resetPeriode === PROJECT_RESET_PERIODE.JOUR) {
    return toLocalDateKey(start)
  }
  if (resetPeriode === PROJECT_RESET_PERIODE.SEMAINE) {
    return `W:${toLocalDateKey(start)}`
  }
  return `M:${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
}

export function isDateInPeriod(date, bounds) {
  const t = new Date(date).getTime()
  return t >= bounds.start.getTime() && t <= bounds.end.getTime()
}

export function countLogsInPeriod(logs, resetPeriode, atDate = new Date()) {
  const bounds = getPeriodBoundsForDate(atDate, resetPeriode)
  return logs.filter((log) => isDateInPeriod(log.logged_at, bounds)).length
}

export function groupLogsByPeriod(logs, resetPeriode) {
  const groups = new Map()

  for (const log of logs) {
    const loggedAt = new Date(log.logged_at)
    const key = getPeriodKey(loggedAt, resetPeriode)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        bounds: getPeriodBoundsForDate(loggedAt, resetPeriode),
        count: 0,
      })
    }
    groups.get(key).count += 1
  }

  return [...groups.values()].sort((a, b) => a.bounds.start - b.bounds.start)
}

function formatDayLabel(date) {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatPeriodDateLabel(bounds, resetPeriode) {
  if (resetPeriode === PROJECT_RESET_PERIODE.JOUR) {
    return formatDayLabel(bounds.start)
  }
  if (resetPeriode === PROJECT_RESET_PERIODE.SEMAINE) {
    return `${formatDayLabel(bounds.start)} – ${formatDayLabel(bounds.end)}`
  }
  return bounds.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function periodTypeLabel(resetPeriode) {
  if (resetPeriode === PROJECT_RESET_PERIODE.SEMAINE) return 'Semaine'
  if (resetPeriode === PROJECT_RESET_PERIODE.MOIS) return 'Mois'
  return 'Jour'
}

function periodUnitLabel(resetPeriode) {
  if (resetPeriode === PROJECT_RESET_PERIODE.SEMAINE) return 'semaine'
  if (resetPeriode === PROJECT_RESET_PERIODE.MOIS) return 'mois'
  return 'jour'
}

/** Historique chronologique : Jour 1, Semaine 1, Mois 1… */
export function buildHistoryEntries(logs, resetPeriode) {
  const groups = groupLogsByPeriod(logs, resetPeriode)
  const currentKey = getPeriodKey(new Date(), resetPeriode)
  const hasCurrent = groups.some((g) => g.key === currentKey)

  if (!hasCurrent) {
    groups.push({
      key: currentKey,
      bounds: getPeriodBoundsForDate(new Date(), resetPeriode),
      count: 0,
    })
    groups.sort((a, b) => a.bounds.start - b.bounds.start)
  }

  const typeLabel = periodTypeLabel(resetPeriode)
  const nowBounds = getPeriodBoundsForDate(new Date(), resetPeriode)

  return groups.map((group, index) => ({
    index: index + 1,
    title: `${typeLabel} ${index + 1}`,
    count: group.count,
    dateLabel: formatPeriodDateLabel(group.bounds, resetPeriode),
    isCurrent: group.key === currentKey || isDateInPeriod(new Date(), group.bounds),
    isNow: isDateInPeriod(nowBounds.start, group.bounds),
  }))
}

export function computeAverageStats(logs, resetPeriode) {
  const groups = groupLogsByPeriod(logs, resetPeriode)
  if (groups.length === 0) return null

  const total = groups.reduce((sum, group) => sum + group.count, 0)
  const average = Math.round((total / groups.length) * 10) / 10
  const unit = periodUnitLabel(resetPeriode)

  return {
    average,
    periodCount: groups.length,
    label: `En moyenne : ${average} par ${unit}`,
  }
}
