/**
 * Frise chronologique + vérifications (Auteur).
 */

/**
 * @param {object} calendar
 * @param {string|null|undefined} dateStr
 * @returns {number|null} ordinal approximatif (jours depuis epoch interne)
 */
export function dateToOrdinal(calendar, dateStr) {
  if (!dateStr) return null
  const parts = String(dateStr).split(/[-/.]/).map((x) => Number(x))
  if (!parts.length || Number.isNaN(parts[0])) return null
  const year = parts[0]
  const month = (parts[1] || 1) - 1
  const day = parts[2] || 1
  const months = calendar?.months || []
  let daysPerYear = 365
  if (months.length) {
    daysPerYear = months.reduce((a, m) => a + (Number(m.days) || 30), 0)
  }
  const monthDays = months[month]?.days || 30
  const dayClamped = Math.min(day, monthDays)
  let dayOfYear = dayClamped
  for (let i = 0; i < month && i < months.length; i += 1) {
    dayOfYear += Number(months[i].days) || 30
  }
  return year * daysPerYear + dayOfYear
}

/**
 * Âge approximatif en années calendaires.
 */
export function ageAt(calendar, birth, at) {
  const b = dateToOrdinal(calendar, birth)
  const a = dateToOrdinal(calendar, at)
  if (b == null || a == null || a < b) return null
  const months = calendar?.months || []
  const daysPerYear = months.length
    ? months.reduce((acc, m) => acc + (Number(m.days) || 30), 0)
    : 365
  return Math.floor((a - b) / daysPerYear)
}

/**
 * Événements + naissances/décès auto.
 * @param {object} world
 */
export function collectTimelineItems(world) {
  /** @type {object[]} */
  const items = []
  for (const ev of world.events || []) {
    items.push({
      id: ev.id,
      kind: 'event',
      title: ev.title,
      start: ev.start,
      end: ev.end || ev.start,
      characterIds: ev.characterIds || [],
      place: ev.place || null,
      themes: ev.themes || [],
      dependsOn: ev.dependsOn || [],
      storyOrder: ev.storyOrder ?? null,
      arc: ev.arc || null,
      noteId: ev.noteId || null,
    })
  }
  for (const c of world.characters || []) {
    if (c.birth) {
      items.push({
        id: `birth-${c.id}`,
        kind: 'birth',
        title: `Naissance · ${c.name}`,
        start: c.birth,
        end: c.birth,
        characterIds: [c.id],
        place: null,
        themes: [],
        dependsOn: [],
        storyOrder: null,
        arc: null,
        noteId: c.noteId || null,
      })
    }
    if (c.death) {
      items.push({
        id: `death-${c.id}`,
        kind: 'death',
        title: `Décès · ${c.name}`,
        start: c.death,
        end: c.death,
        characterIds: [c.id],
        place: null,
        themes: [],
        dependsOn: [],
        storyOrder: null,
        arc: null,
        noteId: c.noteId || null,
      })
    }
  }
  return items
}

/**
 * @param {object[]} items
 * @param {'histoire'|'recit'} order
 */
export function sortTimelineItems(items, order = 'histoire') {
  const list = [...(items || [])]
  if (order === 'recit') {
    return list.sort((a, b) => {
      const ao = a.storyOrder
      const bo = b.storyOrder
      if (ao != null && bo != null) return ao - bo
      if (ao != null) return -1
      if (bo != null) return 1
      return String(a.start || '').localeCompare(String(b.start || ''))
    })
  }
  return list.sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))
}

/**
 * @param {object} world
 * @param {object[]} items
 */
export function detectTimelineIssues(world, items) {
  const calendar = world.calendar
  const byId = new Map((world.characters || []).map((c) => [c.id, c]))
  /** @type {{ id: string, severity: 'error'|'warn'|'info', message: string, itemId?: string }[]} */
  const issues = []

  for (const item of items) {
    if (item.start && item.end) {
      const a = dateToOrdinal(calendar, item.start)
      const b = dateToOrdinal(calendar, item.end)
      if (a != null && b != null && b < a) {
        issues.push({
          id: `end-before-start-${item.id}`,
          severity: 'error',
          message: `« ${item.title} » se termine avant de commencer.`,
          itemId: item.id,
        })
      }
    }
    for (const cid of item.characterIds || []) {
      const c = byId.get(cid)
      if (!c) continue
      const at = dateToOrdinal(calendar, item.start)
      const birth = dateToOrdinal(calendar, c.birth)
      const death = dateToOrdinal(calendar, c.death)
      if (at != null && birth != null && at < birth && item.kind !== 'birth') {
        issues.push({
          id: `before-birth-${item.id}-${cid}`,
          severity: 'error',
          message: `${c.name} apparaît dans « ${item.title} » avant sa naissance.`,
          itemId: item.id,
        })
      }
      if (at != null && death != null && at > death && item.kind !== 'death') {
        issues.push({
          id: `after-death-${item.id}-${cid}`,
          severity: 'error',
          message: `${c.name} apparaît dans « ${item.title} » après son décès.`,
          itemId: item.id,
        })
      }
      const age = ageAt(calendar, c.birth, item.start)
      if (age != null) {
        item.ages = item.ages || {}
        item.ages[cid] = age
      }
    }
    for (const dep of item.dependsOn || []) {
      const other = items.find((x) => x.id === dep)
      if (!other) continue
      const a = dateToOrdinal(calendar, other.start)
      const b = dateToOrdinal(calendar, item.start)
      if (a != null && b != null && b < a) {
        issues.push({
          id: `dep-${item.id}-${dep}`,
          severity: 'warn',
          message: `« ${item.title} » est placé avant sa dépendance « ${other.title} ».`,
          itemId: item.id,
        })
      }
    }
  }

  // Même personnage, deux lieux au même moment (même jour)
  const byCharDay = new Map()
  for (const item of items) {
    if (!item.place || !item.start) continue
    for (const cid of item.characterIds || []) {
      const key = `${cid}|${item.start}`
      if (!byCharDay.has(key)) byCharDay.set(key, [])
      byCharDay.get(key).push(item)
    }
  }
  for (const [, list] of byCharDay) {
    const places = new Set(list.map((x) => x.place).filter(Boolean))
    if (places.size > 1) {
      const cid = list[0].characterIds[0]
      const c = byId.get(cid)
      issues.push({
        id: `two-places-${list[0].id}`,
        severity: 'warn',
        message: `${c?.name || cid} semble à plusieurs lieux le ${list[0].start}.`,
        itemId: list[0].id,
      })
    }
  }

  return issues
}
