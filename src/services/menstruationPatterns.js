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

function detectSimplePatterns(timeline) {
  const patterns = []
  const cycleIds = uniqueCycleIds(timeline)
  if (!cycleIds.length) return patterns

  for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
    let cyclesWithData = 0
    let cyclesWithPattern = 0
    const relDaysAbove = []

    for (const cycleId of cycleIds) {
      const days = timelineForCycle(timeline, cycleId)
      if (!days.length) continue
      cyclesWithData += 1

      const hitDays = days.filter(
        (d) => d.jourRelatif != null && d.symptoms[symptomKey]?.above,
      )
      if (hitDays.length > 0) {
        cyclesWithPattern += 1
        for (const d of hitDays) relDaysAbove.push(d.jourRelatif)
      }
    }

    if (cyclesWithData < CYCLES_MIN) continue
    const ratio = cyclesWithPattern / cyclesWithData
    if (ratio >= RATIO_MIN && relDaysAbove.length) {
      patterns.push({
        type_pattern: PATTERN_TYPE.SIMPLE,
        symptôme: symptomKey,
        cluster: null,
        jour_relatif_début: Math.min(...relDaysAbove),
        jour_relatif_fin: Math.max(...relDaysAbove),
        intensité_moyenne: null,
        durée_moyenne: null,
        direction: null,
        cycles_détectés: cyclesWithPattern,
        cycles_total: cyclesWithData,
        ratio_répétition: ratio,
        actif: true,
      })
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
    let cyclesWithCluster = 0
    const relDays = []

    for (const cycleId of cycleIds) {
      const days = timelineForCycle(timeline, cycleId)
      if (!days.length) continue
      cyclesWithData += 1
      const activeDays = days.filter((d) => isClusterActiveDay(d, validKeys))
      if (activeDays.length > 0) {
        cyclesWithCluster += 1
        for (const d of activeDays) {
          if (d.jourRelatif != null) relDays.push(d.jourRelatif)
        }
      }
    }

    if (cyclesWithData < CYCLES_MIN) continue
    const ratio = cyclesWithCluster / cyclesWithData
    if (ratio < RATIO_MIN) continue

    patterns.push({
      type_pattern: PATTERN_TYPE.COMBINED,
      symptôme: null,
      cluster: clusterKey,
      jour_relatif_début: relDays.length ? Math.min(...relDays) : null,
      jour_relatif_fin: relDays.length ? Math.max(...relDays) : null,
      intensité_moyenne: relDays.length ? mean(relDays) : null,
      durée_moyenne: null,
      direction: null,
      cycles_détectés: cyclesWithCluster,
      cycles_total: cyclesWithData,
      ratio_répétition: ratio,
      actif: true,
    })
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
    const { error } = await supabase.from(PATTERNS_TABLE).insert(rows)
    if (error) throw error
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
