/**
 * Layout grille horaire type EDT (colonnes jour, blocs positionnés).
 */

export const WEEK_GRID_HOUR_HEIGHT_PX = 60

/**
 * @param {string | null | undefined} timeStr
 * @returns {number}
 */
export function parseTimeToDecimal(timeStr) {
  if (!timeStr) return 0
  const parts = String(timeStr).replace(/h/gi, ':').split(':')
  if (parts.length < 2) return 0
  const hours = parseInt(parts[0], 10) || 0
  const minutes = parseInt(parts[1], 10) || 0
  return hours + minutes / 60
}

/**
 * @param {string | null | undefined} timeRangeStr
 * @returns {{ start: number, end: number }}
 */
export function parseEventHours(timeRangeStr) {
  const defaultHours = { start: 9, end: 10.5 }
  if (!timeRangeStr) return defaultHours

  const cleanStr = String(timeRangeStr).replace(/h/gi, ':').replace(/\s+/g, '')
  const parts = cleanStr.split(/[-–—]/)
  if (parts.length < 2) {
    const start = parseTimeToDecimal(parts[0])
    return { start, end: Math.min(start + 1.5, 23.99) }
  }

  const start = parseTimeToDecimal(parts[0])
  let end = parseTimeToDecimal(parts[1])
  if (end <= start) {
    end = Math.min(start + 1.5, 23.99)
  }
  return { start, end }
}

/**
 * @param {number} decimal
 */
export function formatDecimalHour(decimal) {
  const h = Math.floor(decimal)
  const m = Math.round((decimal - h) * 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * @param {string | null | undefined} timeRangeStr
 */
export function formatEventStartLabel(timeRangeStr) {
  const { start } = parseEventHours(timeRangeStr)
  return formatDecimalHour(start)
}

/**
 * @param {string | null | undefined} timeRangeStr
 */
export function formatEventRangeLabel(timeRangeStr) {
  const { start, end } = parseEventHours(timeRangeStr)
  return `${formatDecimalHour(start)}–${formatDecimalHour(end)}`
}

/**
 * Positionne des événements horaires dans une colonne jour.
 * @param {Array<{ id?: string, time?: string|null }>} events
 * @param {{ hourHeight?: number }} [opts]
 */
export function positionEventsForDay(events, opts = {}) {
  const hourHeight = Number(opts.hourHeight) || WEEK_GRID_HOUR_HEIGHT_PX
  if (!events?.length) return []

  const mappedEvents = events.map((ev) => {
    const { start, end } = parseEventHours(ev.time)
    const duration = end - start
    return {
      ...ev,
      start,
      end,
      duration,
      isShort: duration < 1,
      isVeryShort: duration < 0.5,
      timeStartLabel: formatEventStartLabel(ev.time),
      timeRangeLabel: formatEventRangeLabel(ev.time),
    }
  })

  mappedEvents.sort((a, b) => a.start - b.start || b.duration - a.duration)

  const groups = []
  for (const ev of mappedEvents) {
    let added = false
    for (const group of groups) {
      const overlaps = group.some((member) => ev.start < member.end && ev.end > member.start)
      if (overlaps) {
        group.push(ev)
        added = true
        break
      }
    }
    if (!added) groups.push([ev])
  }

  const result = []
  const GAP_PX = 3
  for (const group of groups) {
    const columns = []
    for (const ev of group) {
      let placed = false
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const overlaps = col.some((member) => ev.start < member.end && ev.end > member.start)
        if (!overlaps) {
          col.push(ev)
          ev.colIndex = i
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([ev])
        ev.colIndex = columns.length - 1
      }
    }

    const totalCols = columns.length
    for (const col of columns) {
      const sorted = [...col].sort((a, b) => a.start - b.start)
      for (let i = 0; i < sorted.length; i++) {
        const ev = sorted[i]
        const next = sorted[i + 1]
        let height = Math.max(ev.duration * hourHeight - GAP_PX, 22)
        if (next) {
          const maxH = Math.max(18, next.start * hourHeight - GAP_PX - ev.start * hourHeight)
          height = Math.min(height, maxH)
        }
        ev._layoutHeight = height
      }
    }

    for (const ev of group) {
      const widthPercent = 96 / totalCols
      const leftPercent = ev.colIndex * (100 / totalCols)
      const top = ev.start * hourHeight
      const height = ev._layoutHeight ?? Math.max(ev.duration * hourHeight - GAP_PX, 22)
      ev.positionStyle = {
        position: 'absolute',
        top: `${top}px`,
        height: `${height}px`,
        '--event-block-height': `${height}px`,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
      }
      result.push(ev)
    }
  }

  const ordered = [...result].sort((a, b) => a.start - b.start || a.end - b.end)
  for (const ev of ordered) {
    const nextBelow = ordered.find((o) => o.id !== ev.id && o.start >= ev.end - 0.001)
    if (!nextBelow) continue
    const maxH = Math.max(18, nextBelow.start * hourHeight - GAP_PX - ev.start * hourHeight)
    const height = Math.min(ev._layoutHeight ?? maxH, maxH)
    ev._layoutHeight = height
    ev.positionStyle = {
      ...ev.positionStyle,
      height: `${height}px`,
      '--event-block-height': `${height}px`,
    }
  }

  return result
}

/**
 * Construit les 7 jours (lun→dim) autour d’une date.
 * @param {Date} anchor
 */
export function buildWeekDays(anchor = new Date()) {
  const date = new Date(anchor)
  const currentDay = date.getDay()
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay
  const monday = new Date(date)
  monday.setDate(date.getDate() + distanceToMonday)

  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push({
      name: dayNames[i],
      shortName: dayNames[i].substring(0, 3),
      date: d,
      dayOfMonth: d.getDate(),
      isToday: d.toDateString() === new Date().toDateString(),
    })
  }
  return days
}

/**
 * @param {Date} date
 */
export function formatDateToLocalISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * @param {Date} date
 */
export function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

/**
 * Style catégorie EDT (dégradé + bordure).
 * @param {string | null | undefined} color
 */
export function categoryColorStyle(color) {
  const resolved = color || '#d5b5ea'
  let bg = ''
  let bgEnd = ''
  if (resolved.startsWith('hsl')) {
    bg = resolved.replace('hsl', 'hsla').replace(')', ', 0.22)')
    bgEnd = resolved.replace('hsl', 'hsla').replace(')', ', 0.08)')
  } else {
    bg = `${resolved}38`
    bgEnd = `${resolved}14`
  }
  return {
    background: `linear-gradient(135deg, ${bg}, ${bgEnd})`,
    color: resolved,
    borderLeft: `4px solid ${resolved}`,
    '--event-color-solid': resolved,
  }
}
