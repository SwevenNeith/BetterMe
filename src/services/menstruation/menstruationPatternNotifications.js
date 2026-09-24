import { supabase } from '../../lib/supabase.js'
import { addDaysToISODate } from './menstruationCycles.js'
import {
  dateTimeLocalToDate,
  deletePendingByKindPrefix,
  getLocalTodayISO,
  insertPendingNotifications,
} from '../common/scheduledReminders.js'
import { TYPE_CYCLE } from './menstruationSymptoms.js'
import {
  ANALYZED_SYMPTOM_KEYS,
  SYMPTOM_THRESHOLDS,
  SYMPTOM_LABELS,
  CLUSTER_LABELS,
  PATTERN_TYPE,
  PREDEFINED_CLUSTERS,
  CLUSTER_DAY_RATIO_MIN,
} from './menstruationPatternThresholds.js'
import {
  buildDailySymptomTimeline,
  getCurrentCycle,
  getCycleStartDate,
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

function keyForWindowPattern(p, fallbackKey) {
  const id = p?.id
  if (id) return String(id)
  const a = p?.jour_relatif_début
  const b = p?.jour_relatif_fin
  const win = a != null ? `${a}-${b ?? a}` : 'na'
  return `${fallbackKey}:${win}`
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

function offsetDaysFromJourRelatif(jourRelatif) {
  // jour_relatif = jour du cycle (J-1 = 1er jour)
  const jr = Math.max(1, Math.round(jourRelatif))
  return jr - 1
}

function dateAtRelativePosition(cycleStart, jourRelatif, extraDays = 0) {
  const offset = offsetDaysFromJourRelatif(jourRelatif) + extraDays
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
        dateAtRelativePosition(cycleStart, p.jour_relatif_début, 0),
        -PREVOYANCE_DAYS_BEFORE,
      )
      const label = SYMPTOM_LABELS[p.symptôme] ?? p.symptôme
      const windowLabel =
        p.jour_relatif_fin != null && p.jour_relatif_fin !== p.jour_relatif_début
          ? `J-${p.jour_relatif_début}–J-${p.jour_relatif_fin}`
          : `J-${p.jour_relatif_début}`
      const patternId = keyForWindowPattern(p, `simple:${p.symptôme ?? 'symptome'}`)
      push({
        kind: buildKind('simple', patternId, PATTERN_NOTIF_TYPE.PREVOYANCE),
        patternKey: `simple:${patternId}`,
        notifType: PATTERN_NOTIF_TYPE.PREVOYANCE,
        dateKey: notifyDate,
        title: 'BetterMe — Tendance',
        body: `🔮 Bientôt : ${label} pourrait se manifester (entre ${windowLabel} du cycle).`,
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

  // Pattern de durée : plus de notification quotidienne (affichage dans le panneau Patterns uniquement).
  // Les anciennes planifications `menstruation_pattern:duree:` sont purgées à la resync.

  // —— Combiné ——
  if (settings.menstruation_notify_patterns_combine) {
    for (const p of activePatterns.filter((x) => x.type_pattern === PATTERN_TYPE.COMBINED)) {
      if (p.jour_relatif_début == null) continue
      const notifyDate = addDaysToISODate(
        dateAtRelativePosition(cycleStart, p.jour_relatif_début, 0),
        -PREVOYANCE_DAYS_BEFORE,
      )
      const label = CLUSTER_LABELS[p.cluster] ?? p.cluster
      const patternId = keyForWindowPattern(p, `combine:${p.cluster ?? 'cluster'}`)
      push({
        kind: buildKind('combine', patternId, PATTERN_NOTIF_TYPE.PREVOYANCE),
        patternKey: `combine:${patternId}`,
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

const PATTERN_KIND_PREFIX = {
  simple: `${PATTERN_NOTIF_KIND_ROOT}:simple:`,
  intensite: `${PATTERN_NOTIF_KIND_ROOT}:intensite:`,
  duree: `${PATTERN_NOTIF_KIND_ROOT}:duree:`,
  combine: `${PATTERN_NOTIF_KIND_ROOT}:combine:`,
}

const PATTERN_SETTING_BY_PREFIX = {
  [PATTERN_KIND_PREFIX.simple]: 'menstruation_notify_patterns_simple',
  [PATTERN_KIND_PREFIX.intensite]: 'menstruation_notify_patterns_intensite',
  [PATTERN_KIND_PREFIX.combine]: 'menstruation_notify_patterns_combine',
}

function candidatesToRows(userId, candidates, now = Date.now()) {
  const rows = []
  for (const candidate of candidates) {
    const when = new Date(candidate.scheduled_at)
    if (when.getTime() <= now) continue
    rows.push({
      user_id: userId,
      event_id: null,
      kind: candidate.kind,
      title: candidate.title,
      body: candidate.body,
      scheduled_at: candidate.scheduled_at,
    })
  }
  return rows
}

async function syncPatternPrefixNotifications(userId, prefix, enabled, candidates) {
  await deletePendingByKindPrefix(supabase, userId, prefix)
  if (!enabled) return
  const rows = candidatesToRows(
    userId,
    candidates.filter((candidate) => candidate.kind.startsWith(prefix)),
  )
  await insertPendingNotifications(supabase, userId, rows, { skipPerRowDedupe: true })
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

  // Purge définitive des notifs « durée » (désormais réservées au panneau Patterns)
  await deletePendingByKindPrefix(supabase, userId, PATTERN_KIND_PREFIX.duree)

  for (const [prefix, settingKey] of Object.entries(PATTERN_SETTING_BY_PREFIX)) {
    await syncPatternPrefixNotifications(userId, prefix, settings[settingKey], candidates)
  }
}
