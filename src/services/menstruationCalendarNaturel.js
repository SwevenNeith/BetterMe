import { addDaysToISODate, daysBetweenISO } from './menstruationCycles.js'
import { getLocalTodayISO } from './scheduledReminders.js'
import {
  COL_NATUREL,
  getEffectiveDebutReglesNaturel,
  getReglesPeriodEndNaturel,
  getEffectiveFenetreFertileNaturel,
  getEffectiveOvulationDateNaturel,
} from './menstruationCyclesNaturel.js'

export const NAT_SEGMENT_KIND = {
  regles: 'regles',
  fenetreFertile: 'fenetre-fertile',
}

export const NAT_MARKER_KIND = {
  ovulation: 'ovulation',
  prochainesRegles: 'prochaines-regles',
  debutRegles: 'debut-regles',
}

export const NAT_PHASE_KIND = {
  phaseFolliculaire: 'phase-folliculaire',
  phaseOvulatoire: 'phase-ovulatoire',
  phaseLuteale: 'phase-luteale',
}

export function formatDateShortFr(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatRangeLabel(start, end) {
  const days = daysBetweenISO(start, end)
  const inclusive = days != null ? days + 1 : null
  const duration = inclusive != null ? ` · ${inclusive} jour${inclusive > 1 ? 's' : ''}` : ''
  return `${formatDateShortFr(start)} → ${formatDateShortFr(end)}${duration}`
}

export function buildCalendarDataFromNaturalCycles(cycles, todayISO = getLocalTodayISO()) {
  const segments = []
  const markers = []
  const periodSummaries = []
  const byNum = new Map(cycles.map((c) => [c[COL_NATUREL.numeroCycle], c]))

  for (const row of cycles) {
    const cycleNum = row[COL_NATUREL.numeroCycle]

    const debutRegles = getEffectiveDebutReglesNaturel(row)
    const finRegles = getReglesPeriodEndNaturel(row, todayISO)

    if (debutRegles) {
      markers.push({
        kind: NAT_MARKER_KIND.debutRegles,
        date: debutRegles,
        label: row[COL_NATUREL.dateDebutReglesReelle]
          ? `Début règles réel (cycle ${cycleNum})`
          : `Début règles estimé (cycle ${cycleNum})`,
      })
    }

    if (debutRegles && finRegles && debutRegles <= finRegles) {
      segments.push({
        kind: NAT_SEGMENT_KIND.regles,
        cycleNum,
        start: debutRegles,
        end: finRegles,
        label: `Règles (cycle ${cycleNum})`,
        detail: formatRangeLabel(debutRegles, finRegles),
      })
      periodSummaries.push({
        kind: NAT_SEGMENT_KIND.regles,
        cycleNum,
        start: debutRegles,
        end: finRegles,
        title: `Règles — cycle ${cycleNum}`,
        detail: formatRangeLabel(debutRegles, finRegles),
      })
    }

    const ovul = getEffectiveOvulationDateNaturel(row, todayISO)
    if (ovul) {
      markers.push({
        kind: NAT_MARKER_KIND.ovulation,
        date: ovul,
        label: row[COL_NATUREL.dateDebutReglesReelle]
          ? `Ovulation estimée (cycle ${cycleNum}, ancrée au réel)`
          : `Ovulation estimée (cycle ${cycleNum})`,
      })
    }

    const { debut: fertStart, fin: fertEnd } = getEffectiveFenetreFertileNaturel(row, todayISO)
    if (fertStart && fertEnd && fertStart <= fertEnd) {
      segments.push({
        kind: NAT_SEGMENT_KIND.fenetreFertile,
        cycleNum,
        start: fertStart,
        end: fertEnd,
        label: `Fenêtre fertile (cycle ${cycleNum})`,
        detail: formatRangeLabel(fertStart, fertEnd),
      })
      periodSummaries.push({
        kind: NAT_SEGMENT_KIND.fenetreFertile,
        cycleNum,
        start: fertStart,
        end: fertEnd,
        title: `Fenêtre fertile — cycle ${cycleNum}`,
        detail: formatRangeLabel(fertStart, fertEnd),
      })
    }

    const nextCycle = byNum.get(cycleNum + 1)
    const nextRulesDate = nextCycle
      ? getEffectiveDebutReglesNaturel(nextCycle)
      : row[COL_NATUREL.dateProchainesReglesEstimee]

    if (nextRulesDate) {
      const nextRealStart = nextCycle?.[COL_NATUREL.dateDebutReglesReelle]
      markers.push({
        kind: NAT_MARKER_KIND.prochainesRegles,
        date: nextRulesDate,
        label: nextRealStart
          ? `Prochaines règles (cycle ${cycleNum + 1}, réel)`
          : `Prochaines règles estimées (cycle ${cycleNum})`,
      })
    }
  }

  return { segments, markers, periodSummaries }
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

export function buildDayIndex(segments, markers) {
  const map = new Map()

  for (const m of markers) {
    if (!m?.date) continue
    const cur = map.get(m.date) || { segments: [], markers: [], _segmentDetails: [], _markerDetails: [] }
    cur.markers.push(m.kind)
    cur._markerDetails.push(m)
    map.set(m.date, cur)
  }

  for (const s of segments) {
    if (!s?.start || !s?.end) continue
    let cur = s.start
    while (cur <= s.end) {
      const entry = map.get(cur) || { segments: [], markers: [], _segmentDetails: [], _markerDetails: [] }
      entry.segments.push(s.kind)
      entry._segmentDetails.push(s)
      map.set(cur, entry)
      if (cur === s.end) break
      cur = addDaysToISODate(cur, 1)
    }
  }

  return map
}

export function legendForNatural() {
  return [
    {
      id: 'regles',
      title: 'Règles',
      items: [{ kind: NAT_SEGMENT_KIND.regles, label: 'Règles', description: 'Période' }],
    },
    {
      id: 'phases',
      title: 'Phases',
      items: [
        { kind: NAT_PHASE_KIND.phaseFolliculaire, label: 'Début folliculaire', description: 'Entrée en phase' },
        { kind: NAT_PHASE_KIND.phaseOvulatoire, label: 'Début ovulatoire', description: 'Entrée en phase' },
        { kind: NAT_PHASE_KIND.phaseLuteale, label: 'Début lutéale', description: 'Entrée en phase' },
      ],
    },
    {
      id: 'fertile',
      title: 'Fertilité',
      items: [
        { kind: NAT_SEGMENT_KIND.fenetreFertile, label: 'Fenêtre fertile', description: 'Période' },
        { kind: NAT_MARKER_KIND.ovulation, label: 'Ovulation', description: 'Jour estimé' },
      ],
    },
    {
      id: 'next',
      title: 'Prévisions',
      items: [{ kind: NAT_MARKER_KIND.prochainesRegles, label: 'Prochaines règles', description: 'Date estimée' }],
    },
  ]
}

export function legendSwatchClassesNatural(item) {
  if (!item?.kind) return ''
  if (item.kind === NAT_SEGMENT_KIND.regles) return 'nat-legend-swatch nat-legend-swatch--regles'
  if (item.kind === NAT_SEGMENT_KIND.fenetreFertile) return 'nat-legend-swatch nat-legend-swatch--fertile'
  if (item.kind === NAT_MARKER_KIND.ovulation) return 'nat-legend-swatch nat-legend-swatch--ovulation'
  if (item.kind === NAT_MARKER_KIND.prochainesRegles) return 'nat-legend-swatch nat-legend-swatch--next'
  if (item.kind === NAT_PHASE_KIND.phaseFolliculaire)
    return 'nat-legend-swatch nat-legend-swatch--phase-folliculaire'
  if (item.kind === NAT_PHASE_KIND.phaseOvulatoire)
    return 'nat-legend-swatch nat-legend-swatch--phase-ovulatoire'
  if (item.kind === NAT_PHASE_KIND.phaseLuteale)
    return 'nat-legend-swatch nat-legend-swatch--phase-luteale'
  return 'nat-legend-swatch'
}

