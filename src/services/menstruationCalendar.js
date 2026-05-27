import { COL, addDaysToISODate, daysBetweenISO } from './menstruationCycles.js'

/** Types affichés dans le calendrier (classe CSS + légende) */
export const CALENDAR_SEGMENT_KIND = {
  comprimesActifs: 'comprimes-actifs',
  pausePlaquette: 'pause-plaquette',
  spmEstime: 'spm-estime',
  spmReel: 'spm-reel',
  reglesEstime: 'regles-estime',
  reglesReel: 'regles-reel',
}

export const CALENDAR_MARKER_KIND = {
  debutPlaquette: 'debut-plaquette',
  debutSpmEstime: 'debut-spm-estime',
  finSpmEstime: 'fin-spm-estime',
  debutSpmReel: 'debut-spm-reel',
  finSpmReel: 'fin-spm-reel',
  debutReglesEstime: 'debut-regles-estime',
  debutReglesReel: 'debut-regles-reel',
  finReglesEstime: 'fin-regles-estime',
  finReglesReel: 'fin-regles-reel',
}

function formatRangeLabel(start, end) {
  const days = daysBetweenISO(start, end)
  const inclusive = days != null ? days + 1 : null
  const duration = inclusive != null ? ` · ${inclusive} jour${inclusive > 1 ? 's' : ''}` : ''
  return `${formatDateShortFr(start)} → ${formatDateShortFr(end)}${duration}`
}

export function formatDateShortFr(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function eachDayInclusive(startISO, endISO) {
  if (!startISO || !endISO || startISO > endISO) return []
  const days = []
  let cur = startISO
  while (cur <= endISO) {
    days.push(cur)
    if (cur === endISO) break
    cur = addDaysToISODate(cur, 1)
  }
  return days
}

/**
 * Transforme les cycles pilule en segments (plages) et marqueurs (jours uniques).
 */
export function buildCalendarDataFromCycles(cycles) {
  const segments = []
  const markers = []
  const periodSummaries = []

  for (const row of cycles) {
    const cycleNum = row[COL.numeroCycle]

    const debutPlaq = row[COL.dateDebutPlaquette]
    const spmStart = row[COL.dateDebutSpmEstimee]
    const spmEndEstimee = row[COL.dateFinSpmEstimee]

    if (spmStart && spmEndEstimee && spmStart <= spmEndEstimee) {
      segments.push({
        kind: CALENDAR_SEGMENT_KIND.spmEstime,
        cycleNum,
        start: spmStart,
        end: spmEndEstimee,
        label: `SPM estimée (cycle ${cycleNum})`,
        detail: formatRangeLabel(spmStart, spmEndEstimee),
      })
      periodSummaries.push({
        kind: CALENDAR_SEGMENT_KIND.spmEstime,
        cycleNum,
        start: spmStart,
        end: spmEndEstimee,
        title: `SPM estimée — cycle ${cycleNum}`,
        detail: formatRangeLabel(spmStart, spmEndEstimee),
      })
    }

    if (spmStart) {
      markers.push({
        kind: CALENDAR_MARKER_KIND.debutSpmEstime,
        date: spmStart,
        label: `Début SPM estimée (cycle ${cycleNum})`,
      })
    }
    if (spmEndEstimee) {
      markers.push({
        kind: CALENDAR_MARKER_KIND.finSpmEstime,
        date: spmEndEstimee,
        label: `Fin SPM estimée (cycle ${cycleNum})`,
      })
    }

    // SPM “réelle” : affichage seulement si les dates réelles existent en base.
    const spmStartReel = row['date_début_spm_réelle'] || null
    const spmEndReel = row['date_fin_spm_réelle'] || null

    if (spmStartReel && spmEndReel) {
      markers.push({
        kind: CALENDAR_MARKER_KIND.debutSpmReel,
        date: spmStartReel,
        label: `Début SPM réelle (cycle ${cycleNum})`,
      })
      markers.push({
        kind: CALENDAR_MARKER_KIND.finSpmReel,
        date: spmEndReel,
        label: `Fin SPM réelle (cycle ${cycleNum})`,
      })
      segments.push({
        kind: CALENDAR_SEGMENT_KIND.spmReel,
        cycleNum,
        start: spmStartReel,
        end: spmEndReel,
        label: `SPM réelle (cycle ${cycleNum})`,
        detail: formatRangeLabel(spmStartReel, spmEndReel),
      })
      periodSummaries.push({
        kind: CALENDAR_SEGMENT_KIND.spmReel,
        cycleNum,
        start: spmStartReel,
        end: spmEndReel,
        title: `SPM réelle — cycle ${cycleNum}`,
        detail: formatRangeLabel(spmStartReel, spmEndReel),
      })
    }

    const debutReglesReel = row[COL.dateDebutReglesReelle]
    const finReglesReel = row[COL.dateFinReglesReelle]
    const debutReglesEstime = row[COL.dateDebutReglesEstimee]
    const finReglesEstime = row[COL.dateFinReglesEstimee]

    if (debutReglesReel && finReglesReel) {
      segments.push({
        kind: CALENDAR_SEGMENT_KIND.reglesReel,
        cycleNum,
        start: debutReglesReel,
        end: finReglesReel,
        label: `Règles réelles (cycle ${cycleNum})`,
        detail: formatRangeLabel(debutReglesReel, finReglesReel),
        durationDays: row[COL.dureeReglesReelle],
      })
      periodSummaries.push({
        kind: CALENDAR_SEGMENT_KIND.reglesReel,
        cycleNum,
        start: debutReglesReel,
        end: finReglesReel,
        title: `Règles réelles — cycle ${cycleNum}`,
        detail: formatRangeLabel(debutReglesReel, finReglesReel),
      })
      markers.push({
        kind: CALENDAR_MARKER_KIND.debutReglesReel,
        date: debutReglesReel,
        label: `Début règles réelles (cycle ${cycleNum})`,
      })
      markers.push({
        kind: CALENDAR_MARKER_KIND.finReglesReel,
        date: finReglesReel,
        label: `Fin règles réelles (cycle ${cycleNum})`,
      })
    }

    if (debutReglesEstime && finReglesEstime) {
      const showEstimeRange =
        !debutReglesReel ||
        !finReglesReel ||
        debutReglesEstime !== debutReglesReel ||
        finReglesEstime !== finReglesReel

      if (showEstimeRange) {
        segments.push({
          kind: CALENDAR_SEGMENT_KIND.reglesEstime,
          cycleNum,
          start: debutReglesEstime,
          end: finReglesEstime,
          label: `Règles estimées (cycle ${cycleNum})`,
          detail: formatRangeLabel(debutReglesEstime, finReglesEstime),
          durationDays: row[COL.dureeReglesEstimee],
        })
        periodSummaries.push({
          kind: CALENDAR_SEGMENT_KIND.reglesEstime,
          cycleNum,
          start: debutReglesEstime,
          end: finReglesEstime,
          title: `Règles estimées — cycle ${cycleNum}`,
          detail: formatRangeLabel(debutReglesEstime, finReglesEstime),
        })
      }

      if (!debutReglesReel) {
        markers.push({
          kind: CALENDAR_MARKER_KIND.debutReglesEstime,
          date: debutReglesEstime,
          label: `Début règles estimé (cycle ${cycleNum})`,
        })
      }
      if (!finReglesReel) {
        markers.push({
          kind: CALENDAR_MARKER_KIND.finReglesEstime,
          date: finReglesEstime,
          label: `Fin règles estimée (cycle ${cycleNum})`,
        })
      }
    }

    if (debutPlaq) {
      markers.push({
        kind: CALENDAR_MARKER_KIND.debutPlaquette,
        date: debutPlaq,
        label: `Début plaquette (cycle ${cycleNum})`,
      })
    }
  }

  return { segments, markers, periodSummaries }
}

/** Map ISO date → { segments: kind[], markers: kind[] } */
export function buildDayIndex(segments, markers) {
  const index = new Map()

  const ensure = (iso) => {
    if (!index.has(iso)) {
      index.set(iso, { segments: [], markers: [] })
    }
    return index.get(iso)
  }

  for (const seg of segments) {
    for (const day of eachDayInclusive(seg.start, seg.end)) {
      const entry = ensure(day)
      if (!entry.segments.includes(seg.kind)) {
        entry.segments.push(seg.kind)
      }
      if (!entry._segmentDetails) entry._segmentDetails = []
      entry._segmentDetails.push(seg)
    }
  }

  for (const m of markers) {
    const entry = ensure(m.date)
    if (!entry.markers.includes(m.kind)) {
      entry.markers.push(m.kind)
    }
    if (!entry._markerDetails) entry._markerDetails = []
    entry._markerDetails.push(m)
  }

  return index
}

export function getMonthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1)
  const last = new Date(year, monthIndex + 1, 0)
  const daysInMonth = last.getDate()

  let startWeekday = first.getDay()
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1

  const cells = []
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ iso: null, day: null, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(monthIndex + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    cells.push({
      iso: `${year}-${mm}-${dd}`,
      day: d,
      inMonth: true,
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ iso: null, day: null, inMonth: false })
  }

  return cells
}

export function monthOverlapsRange(year, monthIndex, startISO, endISO) {
  if (!startISO || !endISO) return false
  const first = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const last = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return startISO <= last && endISO >= first
}

export function filterSummariesForMonth(summaries, year, monthIndex) {
  return summaries.filter((p) => monthOverlapsRange(year, monthIndex, p.start, p.end))
}

/** Groupes affichés dans la légende (ordre fixe). */
export const LEGEND_GROUPS = [
  { id: 'regles', title: 'Règles' },
  { id: 'spm', title: 'SPM' },
  { id: 'plaquette', title: 'Plaquette' },
]

export const LEGEND_ITEMS = [
  {
    kind: CALENDAR_SEGMENT_KIND.reglesEstime,
    group: 'regles',
    label: 'Règles estimées',
    description: 'Période projetée',
    swatch: 'bar',
  },
  {
    kind: CALENDAR_SEGMENT_KIND.reglesReel,
    group: 'regles',
    label: 'Règles réelles',
    description: 'Dates saisies',
    swatch: 'bar',
  },
  {
    kind: CALENDAR_SEGMENT_KIND.spmEstime,
    group: 'spm',
    label: 'SPM estimée',
    description: 'Durée entre début et fin',
    swatch: 'bar',
  },
  {
    kind: CALENDAR_MARKER_KIND.debutSpmEstime,
    group: 'spm',
    label: 'Début SPM estimée',
    swatch: 'ring-debut',
  },
  {
    kind: CALENDAR_MARKER_KIND.finSpmEstime,
    group: 'spm',
    label: 'Fin SPM estimée',
    swatch: 'ring-fin',
  },
  {
    kind: CALENDAR_SEGMENT_KIND.spmReel,
    group: 'spm',
    label: 'SPM réelle',
    description: 'Durée réelle ()',
    swatch: 'bar',
  },
  {
    kind: CALENDAR_MARKER_KIND.debutSpmReel,
    group: 'spm',
    label: 'Début SPM réelle',
    swatch: 'ring-debut-reel',
  },
  {
    kind: CALENDAR_MARKER_KIND.finSpmReel,
    group: 'spm',
    label: 'Fin SPM réelle',
    swatch: 'ring-fin-reel',
  },
  {
    kind: CALENDAR_MARKER_KIND.debutPlaquette,
    group: 'plaquette',
    label: 'Début plaquette',
    swatch: 'ring-plaquette',
  },
]

/** Classes CSS de pastille légende alignées sur le calendrier. */
export function legendSwatchClasses(item) {
  const kind = item.kind
  if (item.swatch === 'bar') {
    return [`cycle-calendar__bar`, `cycle-calendar__bar--${kind}`]
  }
  if (item.swatch === 'ring-plaquette') {
    return [
      'cycle-calendar__day-num',
      'cycle-calendar__day-num--legend',
      'cycle-calendar__day-num--ring-debut-plaquette',
    ]
  }
  if (item.swatch === 'ring-debut') {
    return [
      'cycle-calendar__day-num',
      'cycle-calendar__day-num--legend',
      'cycle-calendar__day-num--ring-debut-spm-estime',
    ]
  }
  if (item.swatch === 'ring-fin') {
    return [
      'cycle-calendar__day-num',
      'cycle-calendar__day-num--legend',
      'cycle-calendar__day-num--ring-fin-spm-estime',
    ]
  }
  if (item.swatch === 'ring-debut-reel') {
    return [
      'cycle-calendar__day-num',
      'cycle-calendar__day-num--legend',
      'cycle-calendar__day-num--ring-debut-spm-reel',
    ]
  }
  if (item.swatch === 'ring-fin-reel') {
    return [
      'cycle-calendar__day-num',
      'cycle-calendar__day-num--legend',
      'cycle-calendar__day-num--ring-fin-spm-reel',
    ]
  }
  return [`cycle-calendar__bar`, `cycle-calendar__bar--${kind}`]
}

/** Ne garde que les entrées de légende réellement présentes sur le calendrier. */
export function buildVisibleLegendItems(calendarData) {
  const used = new Set()
  for (const s of calendarData.segments) used.add(s.kind)
  for (const m of calendarData.markers) used.add(m.kind)
  return LEGEND_ITEMS.filter((item) => used.has(item.kind))
}

/** Légende filtrée et regroupée (Règles → SPM → Plaquette). */
export function buildVisibleLegendGroups(calendarData) {
  const visible = buildVisibleLegendItems(calendarData)
  return LEGEND_GROUPS.map((group) => ({
    ...group,
    items: visible.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0)
}
