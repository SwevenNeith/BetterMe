import { supabase } from '../lib/supabase.js'
import { addDaysToISODate, daysBetweenISO } from './menstruationCycles.js'
import { dateTimeLocalToDate, getLocalTodayISO } from './scheduledReminders.js'
import { TYPE_CYCLE } from './menstruationSymptoms.js'
import {
  ANALYZED_SYMPTOM_KEYS,
  SYMPTOM_THRESHOLDS,
  SYMPTOM_LABELS,
  CLUSTER_LABELS,
  PATTERN_TYPE,
  PREDEFINED_CLUSTERS,
  CLUSTER_DAY_RATIO_MIN,
  meetsThreshold,
} from './menstruationPatternThresholds.js'
import {
  buildDailySymptomTimeline,
  getCurrentCycle,
  getCycleStartDate,
  getCycleLength,
} from './menstruationSymptomEnrichment.js'

export const PATTERN_NOTIF_TYPE = {
  PREVOYANCE: 'prevoyance',
  ALARME: 'alarme',
}

export const PATTERN_NOTIF_KIND_ROOT = 'menstruation_pattern'

const CYCLES_MIN = 2
const PREVOYANCE_DAYS_BEFORE = 2

function buildKind(patternType, patternId, notifType) {
  return `${PATTERN_NOTIF_KIND_ROOT}:${patternType}:${patternId}:${notifType}`
}

function mean(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdDev(nums) {
  if (nums.length < 2) return 0
  const m = mean(nums)
  return Math.sqrt(nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1))
}

function offsetDaysFromJourRelatif(jourRelatif, dureeCycle) {
  return Math.round((jourRelatif / 100) * dureeCycle)
}

function dateAtRelativePosition(cycleStart, jourRelatif, dureeCycle, extraDays = 0) {
  const offset = offsetDaysFromJourRelatif(jourRelatif, dureeCycle) + extraDays
  return addDaysToISODate(cycleStart, offset)
}

function scheduleAt(isoDate, hhmm) {
  return dateTimeLocalToDate(isoDate, hhmm)
}

function timelineForCycle(timeline, cycleId) {
  return timeline.filter((d) => d.cycleId === cycleId)
}

function hasActiveSimplePattern(patterns, symptomKey) {
  return (patterns ?? []).some(
    (p) => p.actif !== false && p.type_pattern === PATTERN_TYPE.SIMPLE && p.symptôme === symptomKey,
  )
}

function hasActiveCombinedPattern(patterns, clusterKey) {
  return (patterns ?? []).some(
    (p) => p.actif !== false && p.type_pattern === PATTERN_TYPE.COMBINED && p.cluster === clusterKey,
  )
}

function isClusterActiveDay(day, clusterKeys) {
  const active = clusterKeys.filter((k) => day.symptoms[k]?.above).length
  return active / clusterKeys.length >= CLUSTER_DAY_RATIO_MIN
}

function episodeLengthSoFar(sortedDays, symptomKey, todayISO) {
  const days = sortedDays.filter(
    (d) => d.dateJour <= todayISO && d.symptoms[symptomKey]?.above,
  )
  if (!days.length) return 0
  let len = 1
  for (let i = 1; i < days.length; i += 1) {
    const gap = daysBetweenISO(days[i - 1].dateJour, days[i].dateJour)
    if (gap != null && gap <= 2) len += 1
    else len = 1
  }
  return len
}

function computeIntensityBaselines(timeline, currentCycleId, symptomKey) {
  const cycleIds = [...new Set(timeline.map((d) => d.cycleId))].filter((id) => id !== currentCycleId)
  const vals = []
  for (const cid of cycleIds) {
    const nums = timelineForCycle(timeline, cid)
      .map((d) => d.symptoms[symptomKey]?.numeric)
      .filter((v) => v != null && !Number.isNaN(v))
    if (nums.length) vals.push(mean(nums))
  }
  if (vals.length < CYCLES_MIN) return null
  return { baseline: mean(vals), std: stdDev(vals) }
}

function computeDurationBaselines(timeline, currentCycleId, symptomKey) {
  const cycleIds = [...new Set(timeline.map((d) => d.cycleId))].filter((id) => id !== currentCycleId)
  const durations = []
  for (const cid of cycleIds) {
    const days = timelineForCycle(timeline, cid).sort((a, b) => a.dateJour.localeCompare(b.dateJour))
    let len = 0
    let streak = 0
    let prev = null
    for (const d of days) {
      if (d.symptoms[symptomKey]?.above) {
        const gap = prev ? daysBetweenISO(prev, d.dateJour) : 0
        streak = prev && gap != null && gap <= 2 ? streak + 1 : 1
        len = Math.max(len, streak)
        prev = d.dateJour
      }
    }
    if (len > 0) durations.push(len)
  }
  if (durations.length < CYCLES_MIN) return null
  return { baseline: mean(durations), std: stdDev(durations) }
}

/**
 * @returns {Array<{ kind: string, title: string, body: string, scheduled_at: string, dateKey: string, patternKey: string, notifType: string }>}
 */
export function buildPatternNotificationCandidates({
  typeCycle,
  cycles,
  patterns,
  timeline,
  settings,
  todayISO = getLocalTodayISO(),
}) {
  const hhmm = String(settings.menstruation_pattern_notification_time || '20:00').slice(0, 5)
  const currentCycle = getCurrentCycle(cycles, todayISO, typeCycle)
  if (!currentCycle?.id) return []

  const currentId = currentCycle.id
  const cycleStart = getCycleStartDate(currentCycle, typeCycle)
  const duree = getCycleLength(currentCycle, typeCycle)
  if (!cycleStart) return []

  const candidates = []
  const activePatterns = (patterns ?? []).filter((p) => p.actif !== false && (p.cycles_total ?? 0) >= CYCLES_MIN)

  const push = (row) => {
    if (!row) return
    candidates.push(row)
  }

  // —— Simple : prévoyance (fenêtre connue à venir) ——
  if (settings.menstruation_notify_patterns_simple) {
    for (const p of activePatterns.filter((x) => x.type_pattern === PATTERN_TYPE.SIMPLE)) {
      if (p.jour_relatif_début == null) continue
      const notifyDate = addDaysToISODate(
        dateAtRelativePosition(cycleStart, p.jour_relatif_début, duree, 0),
        -PREVOYANCE_DAYS_BEFORE,
      )
      const label = SYMPTOM_LABELS[p.symptôme] ?? p.symptôme
      push({
        kind: buildKind('simple', p.symptôme, PATTERN_NOTIF_TYPE.PREVOYANCE),
        patternKey: `simple:${p.symptôme}`,
        notifType: PATTERN_NOTIF_TYPE.PREVOYANCE,
        dateKey: notifyDate,
        title: 'BetterMe — Tendance',
        body: `🔮 Bientôt : ${label} pourrait se manifester (vers ${p.jour_relatif_début}–${p.jour_relatif_fin ?? p.jour_relatif_début} % du cycle).`,
        scheduled_at: scheduleAt(notifyDate, hhmm).toISOString(),
      })
    }

    // Alarme : seuil atteint aujourd’hui sans pattern simple connu
    const todayDays = timelineForCycle(timeline, currentId).filter((d) => d.dateJour === todayISO)
    for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
      if (!SYMPTOM_THRESHOLDS[symptomKey]) continue
      const hit = todayDays.some((d) => d.symptoms[symptomKey]?.above)
      if (!hit || hasActiveSimplePattern(activePatterns, symptomKey)) continue
      const label = SYMPTOM_LABELS[symptomKey] ?? symptomKey
      push({
        kind: buildKind('simple', symptomKey, PATTERN_NOTIF_TYPE.ALARME),
        patternKey: `simple:${symptomKey}`,
        notifType: PATTERN_NOTIF_TYPE.ALARME,
        dateKey: todayISO,
        title: 'BetterMe — Symptôme',
        body: `⚠️ ${label} est marqué fort aujourd’hui, sans tendance récurrente connue.`,
        scheduled_at: scheduleAt(todayISO, hhmm).toISOString(),
      })
    }
  }

  // —— Intensité ——
  if (settings.menstruation_notify_patterns_intensite) {
    for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
      const stats = computeIntensityBaselines(timeline, currentId, symptomKey)
      if (!stats) continue

      const todayNums = timelineForCycle(timeline, currentId)
        .filter((d) => d.dateJour === todayISO)
        .map((d) => d.symptoms[symptomKey]?.numeric)
        .filter((v) => v != null && !Number.isNaN(v))

      if (todayNums.length) {
        const todayVal = Math.max(...todayNums)
        const label = SYMPTOM_LABELS[symptomKey] ?? symptomKey

        if (todayVal > stats.baseline + stats.std) {
          push({
            kind: buildKind('intensite', symptomKey, PATTERN_NOTIF_TYPE.ALARME),
            patternKey: `intensite:${symptomKey}`,
            notifType: PATTERN_NOTIF_TYPE.ALARME,
            dateKey: todayISO,
            title: 'BetterMe — Intensité',
            body: `⚠️ ${label} est plus intense que d’habitude aujourd’hui.`,
            scheduled_at: scheduleAt(todayISO, hhmm).toISOString(),
          })
        }

        const sorted = timelineForCycle(timeline, currentId)
          .filter((d) => d.symptoms[symptomKey]?.numeric != null)
          .sort((a, b) => a.dateJour.localeCompare(b.dateJour))

        const recent = sorted.filter((d) => d.dateJour <= todayISO).slice(-2)
        const twoDaysApproaching =
          recent.length === 2 &&
          recent.every((d) => {
            const v = d.symptoms[symptomKey]?.numeric
            return (
              v != null &&
              v >= stats.baseline &&
              v <= stats.baseline + stats.std
            )
          })

        if (twoDaysApproaching && todayVal <= stats.baseline + stats.std) {
          push({
            kind: buildKind('intensite', symptomKey, PATTERN_NOTIF_TYPE.PREVOYANCE),
            patternKey: `intensite:${symptomKey}`,
            notifType: PATTERN_NOTIF_TYPE.PREVOYANCE,
            dateKey: todayISO,
            title: 'BetterMe — Intensité',
            body: `🔮 ${label} s’intensifie depuis 2 jours : surveille-toi.`,
            scheduled_at: scheduleAt(todayISO, hhmm).toISOString(),
          })
        }
      }
    }
  }

  // —— Durée ——
  if (settings.menstruation_notify_patterns_duree) {
    for (const symptomKey of ANALYZED_SYMPTOM_KEYS) {
      const stats = computeDurationBaselines(timeline, currentId, symptomKey)
      if (!stats) continue

      const days = timelineForCycle(timeline, currentId).sort((a, b) =>
        a.dateJour.localeCompare(b.dateJour),
      )
      const currentLen = episodeLengthSoFar(days, symptomKey, todayISO)
      if (!currentLen) continue

      const label = SYMPTOM_LABELS[symptomKey] ?? symptomKey
      const baselineRounded = Math.round(stats.baseline)

      if (currentLen > stats.baseline + stats.std) {
        push({
          kind: buildKind('duree', symptomKey, PATTERN_NOTIF_TYPE.ALARME),
          patternKey: `duree:${symptomKey}`,
          notifType: PATTERN_NOTIF_TYPE.ALARME,
          dateKey: todayISO,
          title: 'BetterMe — Durée',
          body: `⚠️ ${label} dure plus longtemps que d’habitude (${currentLen} j).`,
          scheduled_at: scheduleAt(todayISO, hhmm).toISOString(),
        })
      } else if (currentLen >= baselineRounded - 1 && currentLen < baselineRounded + stats.std) {
        push({
          kind: buildKind('duree', symptomKey, PATTERN_NOTIF_TYPE.PREVOYANCE),
          patternKey: `duree:${symptomKey}`,
          notifType: PATTERN_NOTIF_TYPE.PREVOYANCE,
          dateKey: todayISO,
          title: 'BetterMe — Durée',
          body: `🔮 ${label} approche de sa durée habituelle (~${baselineRounded} j) : ça peut continuer.`,
          scheduled_at: scheduleAt(todayISO, hhmm).toISOString(),
        })
      }
    }
  }

  // —— Combiné ——
  if (settings.menstruation_notify_patterns_combine) {
    for (const p of activePatterns.filter((x) => x.type_pattern === PATTERN_TYPE.COMBINED)) {
      if (p.jour_relatif_début == null) continue
      const notifyDate = addDaysToISODate(
        dateAtRelativePosition(cycleStart, p.jour_relatif_début, duree, 0),
        -PREVOYANCE_DAYS_BEFORE,
      )
      const label = CLUSTER_LABELS[p.cluster] ?? p.cluster
      push({
        kind: buildKind('combine', p.cluster, PATTERN_NOTIF_TYPE.PREVOYANCE),
        patternKey: `combine:${p.cluster}`,
        notifType: PATTERN_NOTIF_TYPE.PREVOYANCE,
        dateKey: notifyDate,
        title: 'BetterMe — Cluster',
        body: `🔮 Bientôt : le groupe « ${label} » pourrait se manifester.`,
        scheduled_at: scheduleAt(notifyDate, hhmm).toISOString(),
      })
    }

    for (const [clusterKey, clusterKeys] of Object.entries(PREDEFINED_CLUSTERS)) {
      const validKeys = clusterKeys.filter((k) => ANALYZED_SYMPTOM_KEYS.includes(k))
      if (!validKeys.length || hasActiveCombinedPattern(activePatterns, clusterKey)) continue

      const todayDays = timelineForCycle(timeline, currentId).filter((d) => d.dateJour === todayISO)
      const activeToday = todayDays.some((d) => isClusterActiveDay(d, validKeys))
      if (!activeToday) continue

      const label = CLUSTER_LABELS[clusterKey] ?? clusterKey
      push({
        kind: buildKind('combine', clusterKey, PATTERN_NOTIF_TYPE.ALARME),
        patternKey: `combine:${clusterKey}`,
        notifType: PATTERN_NOTIF_TYPE.ALARME,
        dateKey: todayISO,
        title: 'BetterMe — Cluster',
        body: `⚠️ Plusieurs symptômes du groupe « ${label} » sont actifs aujourd’hui.`,
        scheduled_at: scheduleAt(todayISO, hhmm).toISOString(),
      })
    }
  }

  return candidates
}

/** Prévoyance prioritaire si alarme et prévoyance le même jour pour le même pattern. */
export function dedupePatternCandidates(candidates) {
  const byDayPattern = new Map()

  for (const c of candidates) {
    const key = `${c.patternKey}|${c.dateKey}`
    const existing = byDayPattern.get(key)
    if (!existing) {
      byDayPattern.set(key, c)
      continue
    }
    if (c.notifType === PATTERN_NOTIF_TYPE.PREVOYANCE) {
      byDayPattern.set(key, c)
    } else if (existing.notifType !== PATTERN_NOTIF_TYPE.PREVOYANCE) {
      byDayPattern.set(key, c)
    }
  }

  return [...byDayPattern.values()]
}

export async function rescheduleMenstruationPatternNotifications(
  userId,
  typeCycle,
  cycles,
  patterns,
  settings,
) {
  const timeline = await buildDailySymptomTimeline(supabase, userId, typeCycle, cycles)
  const raw = buildPatternNotificationCandidates({
    typeCycle,
    cycles,
    patterns,
    timeline,
    settings,
  })
  const candidates = dedupePatternCandidates(raw)
  const now = Date.now()

  const { data: pending, error: fetchErr } = await supabase
    .from('scheduled_notifications')
    .select('id, kind')
    .eq('user_id', userId)
    .eq('sent', false)
    .like('kind', `${PATTERN_NOTIF_KIND_ROOT}:%`)

  if (fetchErr) throw fetchErr

  if (pending?.length) {
    const ids = pending.map((r) => r.id)
    const { error: delErr } = await supabase.from('scheduled_notifications').delete().in('id', ids)
    if (delErr) throw delErr
  }

  const rows = []
  for (const c of candidates) {
    const when = new Date(c.scheduled_at)
    if (when.getTime() <= now) continue
    rows.push({
      user_id: userId,
      event_id: null,
      kind: c.kind,
      title: c.title,
      body: c.body,
      scheduled_at: c.scheduled_at,
    })
  }

  if (!rows.length) return

  const { error: insErr } = await supabase.from('scheduled_notifications').insert(rows)
  if (insErr) throw insErr
}
