import { getLocalTodayISO } from './scheduledReminders.js'
import { TYPE_CYCLE } from './menstruationSymptoms.js'
import {
  ANALYZED_SYMPTOM_KEYS,
  PATTERN_TYPE,
  PREDEFINED_CLUSTERS,
  RATIO_MIN,
  CYCLES_MIN,
  CLUSTER_DAY_RATIO_MIN,
  meetsThreshold,
} from './menstruationPatternThresholds.js'
import {
  backfillJourRelatif,
  buildDailySymptomTimeline,
  getCurrentCycle,
  getCycleEndDate,
  shouldRecalculatePatterns,
} from './menstruationSymptomEnrichment.js'

const PATTERNS_TABLE = 'menstruation_patterns'

function omitColumn(rows, column) {
  return rows.map(({ [column]: _removed, ...rest }) => rest)
}

function isMissingColumnError(error, column) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${column}'`)
  )
}

async function insertPatternRows(supabase, rows) {
  if (!rows.length) return

  const { error } = await supabase.from(PATTERNS_TABLE).insert(rows)
  if (!error) return

  if (isMissingColumnError(error, 'direction')) {
    const { error: retryError } = await supabase
      .from(PATTERNS_TABLE)
      .insert(omitColumn(rows, 'direction'))
    if (retryError) throw retryError
    return
  }

  throw error
}

function mean(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdDev(nums) {
  if (nums.length < 2) return 0
  const m = mean(nums)
  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1)
  return Math.sqrt(v)
}

function uniqueCycleIds(timeline) {
  return [...new Set(timeline.map((d) => d.cycleId))]
}

function timelineForCycle(timeline, cycleId) {
  return timeline.filter((d) => d.cycleId === cycleId)
}

function timelineUpToDate(timeline, cycleId, maxDate) {
  return timeline.filter((d) => d.cycleId === cycleId && d.dateJour <= maxDate)
}

/** Fusionne les jours consécutifs au-dessus du seuil ; fusion si écart <= 1 jour calendaire. */
function episodeDurations(sortedDays, symptomKey) {
  if (!sortedDays.length) return []
  const episodes = []
  let start = null
  let prevDate = null

  for (const day of sortedDays) {
    if (!day.symptoms[symptomKey]?.above) {
      if (start != null) {
        episodes.push(daysBetweenCalendar(start, prevDate) + 1)
        start = null
        prevDate = null
      }
      continue
    }
    if (start == null) {
      start = day.dateJour
      prevDate = day.dateJour
      continue
    }
    const gap = daysBetweenCalendar(prevDate, day.dateJour)
    if (gap <= 2) {
      prevDate = day.dateJour
    } else {
      episodes.push(daysBetweenCalendar(start, prevDate) + 1)
      start = day.dateJour
      prevDate = day.dateJour
    }
  }
  if (start != null) {
    episodes.push(daysBetweenCalendar(start, prevDate) + 1)
  }
  return episodes
}

function daysBetweenCalendar(aISO, bISO) {
  const [ay, am, ad] = aISO.split('-').map(Number)
  const [by, bm, bd] = bISO.split('-').map(Number)
  const a = Date.UTC(ay, am - 1, ad)
  const b = Date.UTC(by, bm - 1, bd)
  return Math.round((b - a) / 86400000)
}

function meanInt(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function findConsecutiveRanges(sortedDays) {
  const ranges = []
  let start = null
  let prev = null
  for (const d of sortedDays) {
    if (start == null) {
      start = d
      prev = d
      continue
    }
    if (d === prev + 1) {
      prev = d
      continue
    }
    ranges.push([start, prev])
    start = d
    prev = d
  }
  if (start != null) ranges.push([start, prev])
  return ranges
}

function buildCoverageByDay(daySetsByCycle) {
  /** @type {Map<number, Set<string>>} */
  const coverage = new Map()
  for (const [cycleId, daySet] of daySetsByCycle.entries()) {
    for (const d of daySet) {
      if (!coverage.has(d)) coverage.set(d, new Set())
      coverage.get(d).add(cycleId)
    }
  }
  return coverage
}

function scoreRecurrentRange(coverage, a, b, cyclesWithData) {
  const coverages = []
  const union = new Set()
  for (let d = a; d <= b; d += 1) {
    const s = coverage.get(d)
    if (!s) continue
    coverages.push(s.size)
    for (const cid of s) union.add(cid)
  }

  if (union.size < CYCLES_MIN) return null
  const ratio = cyclesWithData ? union.size / cyclesWithData : 0
  if (ratio < RATIO_MIN) return null

  const minCov = coverages.length ? Math.min(...coverages) : 0
  const avgCov = meanInt(coverages) ?? 0
  const len = b - a + 1

  return {
    debut: a,
    fin: b,
    cyclesWithPattern: union.size,
    ratio,
    score: { minCov, avgCov, len },
  }
}

function compareWindows(a, b) {
  // D'abord la stabilité (min coverage), puis la fréquence moyenne, puis concision, puis ordre naturel.
  if (a.score.minCov !== b.score.minCov) return b.score.minCov - a.score.minCov
  if (a.score.avgCov !== b.score.avgCov) return b.score.avgCov - a.score.avgCov
  if (a.score.len !== b.score.len) return a.score.len - b.score.len
  return a.debut - b.debut
}

function pickRecurrentWindows(daySetsByCycle, cyclesWithData, { maxWindows = 3 } = {}) {
  const coverage = buildCoverageByDay(daySetsByCycle)
  const candidateDays = [...coverage.entries()]
    .filter(([, s]) => (s?.size ?? 0) >= CYCLES_MIN)
    .map(([d]) => d)
    .sort((a, b) => a - b)

  if (!candidateDays.length) return null

  const ranges = findConsecutiveRanges(candidateDays)
  const windows = []

  for (const [a, b] of ranges) {
    const scored = scoreRecurrentRange(coverage, a, b, cyclesWithData)
    if (scored) windows.push(scored)
  }

  if (!windows.length) return null
  windows.sort(compareWindows)
  return windows.slice(0, Math.max(1, maxWindows))
}

function detectSimplePatterns(timeline) {
  const patterns = []
  const cycleIds = uniqueCycleIds(timeline)
  if (!cycleIds.length) return patterns

  for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
    let cyclesWithData = 0
    /** @type {Map<string, Set<number>>} */
    const daySetsByCycle = new Map()

    for (const cycleId of cycleIds) {
      const days = timelineForCycle(timeline, cycleId)
      if (!days.length) continue
      cyclesWithData += 1

      const set = new Set(
        days
          .filter((d) => d.jourRelatif != null && d.symptoms[symptomKey]?.above)
          .map((d) => Math.round(d.jourRelatif)),
      )
      if (set.size) daySetsByCycle.set(cycleId, set)
    }

    if (cyclesWithData < CYCLES_MIN) continue
    const windows = pickRecurrentWindows(daySetsByCycle, cyclesWithData, { maxWindows: 3 })
    if (windows) {
      for (const w of windows) {
      patterns.push({
        type_pattern: PATTERN_TYPE.SIMPLE,
        symptôme: symptomKey,
        cluster: null,
        jour_relatif_début: w.debut,
        jour_relatif_fin: w.fin,
        intensité_moyenne: null,
        durée_moyenne: null,
        direction: null,
        cycles_détectés: w.cyclesWithPattern,
        cycles_total: cyclesWithData,
        ratio_répétition: w.ratio,
        actif: true,
      })
    }
    }
  }

  return patterns
}

function detectIntensityPatterns(timeline, currentCycleId, todayISO) {
  const patterns = []
  const cycleIds = uniqueCycleIds(timeline)
  const pastIds = cycleIds.filter((id) => id !== currentCycleId)
  if (pastIds.length < CYCLES_MIN || !currentCycleId) return patterns

  for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
    const baselineVals = []
    for (const cid of pastIds) {
      const nums = timelineForCycle(timeline, cid)
        .map((d) => d.symptoms[symptomKey]?.numeric)
        .filter((v) => v != null && !Number.isNaN(v))
      if (nums.length) baselineVals.push(mean(nums))
    }
    if (baselineVals.length < CYCLES_MIN) continue

    const baseline = mean(baselineVals)
    const baselineStd = stdDev(baselineVals)

    const currentNums = timelineUpToDate(timeline, currentCycleId, todayISO)
      .map((d) => d.symptoms[symptomKey]?.numeric)
      .filter((v) => v != null && !Number.isNaN(v))

    if (!currentNums.length) continue
    const currentAvg = mean(currentNums)

    let direction = null
    if (currentAvg > baseline + baselineStd) direction = 'hausse'
    else if (currentAvg < baseline - baselineStd) direction = 'baisse'
    if (!direction) continue

    patterns.push({
      type_pattern: PATTERN_TYPE.INTENSITY,
      symptôme: symptomKey,
      cluster: null,
      jour_relatif_début: null,
      jour_relatif_fin: null,
      intensité_moyenne: currentAvg,
      durée_moyenne: null,
      direction,
      cycles_détectés: pastIds.length,
      cycles_total: pastIds.length,
      ratio_répétition: 1,
      actif: true,
    })
  }

  return patterns
}

function detectDurationPatterns(timeline, currentCycleId) {
  const patterns = []
  const cycleIds = uniqueCycleIds(timeline)
  const pastIds = cycleIds.filter((id) => id !== currentCycleId)
  if (pastIds.length < CYCLES_MIN || !currentCycleId) return patterns

  for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
    const pastDurations = []
    for (const cid of pastIds) {
      const days = timelineForCycle(timeline, cid).sort((a, b) =>
        a.dateJour.localeCompare(b.dateJour),
      )
      const eps = episodeDurations(days, symptomKey)
      if (eps.length) pastDurations.push(Math.max(...eps))
    }
    if (pastDurations.length < CYCLES_MIN) continue

    const baselineDur = mean(pastDurations)
    const baselineStd = stdDev(pastDurations)

    const currentDays = timelineForCycle(timeline, currentCycleId).sort((a, b) =>
      a.dateJour.localeCompare(b.dateJour),
    )
    const currentEps = episodeDurations(currentDays, symptomKey)
    if (!currentEps.length) continue
    const currentDur = Math.max(...currentEps)

    let direction = null
    if (currentDur > baselineDur + baselineStd) direction = 'hausse'
    else if (currentDur < baselineDur - baselineStd) direction = 'baisse'
    if (!direction) continue

    patterns.push({
      type_pattern: PATTERN_TYPE.DURATION,
      symptôme: symptomKey,
      cluster: null,
      jour_relatif_début: null,
      jour_relatif_fin: null,
      intensité_moyenne: null,
      durée_moyenne: currentDur,
      direction,
      cycles_détectés: pastIds.length,
      cycles_total: pastIds.length,
      ratio_répétition: 1,
      actif: true,
    })
  }

  return patterns
}

function isClusterActiveDay(day, clusterKeys) {
  const active = clusterKeys.filter((k) => day.symptoms[k]?.above).length
  return active / clusterKeys.length >= CLUSTER_DAY_RATIO_MIN
}

function detectCombinedPatterns(timeline) {
  const patterns = []
  const cycleIds = uniqueCycleIds(timeline)
  if (!cycleIds.length) return patterns

  for (const [clusterKey, clusterKeys] of Object.entries(PREDEFINED_CLUSTERS)) {
    const validKeys = clusterKeys.filter((k) => ANALYZED_SYMPTOM_KEYS.includes(k))
    if (!validKeys.length) continue

    let cyclesWithData = 0
    /** @type {Map<string, Set<number>>} */
    const daySetsByCycle = new Map()

    for (const cycleId of cycleIds) {
      const days = timelineForCycle(timeline, cycleId)
      if (!days.length) continue
      cyclesWithData += 1
      const activeDays = days.filter((d) => isClusterActiveDay(d, validKeys))
      const set = new Set(
        activeDays
          .filter((d) => d.jourRelatif != null)
          .map((d) => Math.round(d.jourRelatif)),
      )
      if (set.size) daySetsByCycle.set(cycleId, set)
    }

    if (cyclesWithData < CYCLES_MIN) continue
    const windows = pickRecurrentWindows(daySetsByCycle, cyclesWithData, { maxWindows: 3 })
    if (!windows) continue

    for (const w of windows) {
      patterns.push({
        type_pattern: PATTERN_TYPE.COMBINED,
        symptôme: null,
        cluster: clusterKey,
        jour_relatif_début: w.debut,
        jour_relatif_fin: w.fin,
        intensité_moyenne: w.debut != null && w.fin != null ? mean([w.debut, w.fin]) : null,
        durée_moyenne: null,
        direction: null,
        cycles_détectés: w.cyclesWithPattern,
        cycles_total: cyclesWithData,
        ratio_répétition: w.ratio,
        actif: true,
      })
    }
  }

  return patterns
}

export async function listMenstruationPatterns(supabase, userId, typeCycle, { actifOnly = true } = {}) {
  let q = supabase
    .from(PATTERNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('type_cycle', typeCycle)
    .order('type_pattern')
    .order('ratio_répétition', { ascending: false })

  if (actifOnly) q = q.eq('actif', true)

  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * Recalcule tous les patterns (après fin de cycle ou si cycle courant terminé).
 */
export async function recalculateMenstruationPatterns(supabase, userId, typeCycle, cycles) {
  const todayISO = getLocalTodayISO()

  await backfillJourRelatif(supabase, userId, typeCycle, cycles)
  const timeline = await buildDailySymptomTimeline(supabase, userId, typeCycle, cycles)

  const currentCycle = getCurrentCycle(cycles, todayISO, typeCycle)
  const currentCycleId = currentCycle?.id ?? null

  const detected = [
    ...detectSimplePatterns(timeline),
    ...detectIntensityPatterns(timeline, currentCycleId, todayISO),
    ...detectDurationPatterns(timeline, currentCycleId),
    ...detectCombinedPatterns(timeline),
  ]

  await supabase
    .from(PATTERNS_TABLE)
    .update({ actif: false, dernière_maj: todayISO })
    .eq('user_id', userId)
    .eq('type_cycle', typeCycle)

  const rows = detected.map((p) => ({
    user_id: userId,
    type_cycle: typeCycle,
    type_pattern: p.type_pattern,
    symptôme: p.symptôme,
    cluster: p.cluster,
    jour_relatif_début: p.jour_relatif_début,
    jour_relatif_fin: p.jour_relatif_fin,
    intensité_moyenne: p.intensité_moyenne,
    durée_moyenne: p.durée_moyenne,
    direction: p.direction,
    cycles_détectés: p.cycles_détectés,
    cycles_total: p.cycles_total,
    ratio_répétition: p.ratio_répétition,
    actif: p.actif !== false,
    dernière_maj: todayISO,
  }))

  await supabase.from(PATTERNS_TABLE).delete().eq('user_id', userId).eq('type_cycle', typeCycle)

  if (rows.length) {
    await insertPatternRows(supabase, rows)
  }

  return rows.filter((r) => r.actif)
}

export async function maybeRecalculateMenstruationPatterns(supabase, userId, typeCycle, cycles) {
  if (cycles.length < CYCLES_MIN) {
    return listMenstruationPatterns(supabase, userId, typeCycle)
  }

  const hasSymptoms = await supabase
    .from('menstruation_symptomes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type_cycle', typeCycle)

  if (hasSymptoms.error) throw hasSymptoms.error
  if ((hasSymptoms.count ?? 0) === 0) {
    return listMenstruationPatterns(supabase, userId, typeCycle)
  }

  const todayISO = getLocalTodayISO()
  const shouldRun =
    shouldRecalculatePatterns(cycles, todayISO, typeCycle) || cycles.length >= CYCLES_MIN

  if (shouldRun) {
    return recalculateMenstruationPatterns(supabase, userId, typeCycle, cycles)
  }

  return listMenstruationPatterns(supabase, userId, typeCycle)
}
