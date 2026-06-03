import { TYPE_CYCLE } from './menstruationSymptoms.js'
import { computeJourRelatif, getCycleEndDate, getCycleStartDate } from './menstruationSymptomEnrichment.js'

const TABLE = 'emotion_logs'

function addDays(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function isConsecutive(dateA, dateB) {
  // dateB = dateA + 1
  return addDays(dateA, 1) === dateB
}

export function computeScoreGlobal({ humeurGenerale, energieEmotionnelle, sentimentGeneral, besoinReassurance }) {
  const base = (Number(humeurGenerale) + Number(energieEmotionnelle) + Number(sentimentGeneral)) / 3
  const score = (besoinReassurance ? base - 0.5 : base)
  return Math.max(1, Math.min(5, Number(score.toFixed(2))))
}

function findCycleForDate(cycles, typeCycle, dateJour) {
  if (!Array.isArray(cycles) || !dateJour) return null
  for (const cycle of cycles) {
    const start = getCycleStartDate(cycle, typeCycle)
    if (!start) continue
    const end = getCycleEndDate(cycle, typeCycle)
    if (start <= dateJour && (!end || dateJour < end)) return cycle
  }
  return null
}

export function computeCycleContext({ dateJour, menstruationMode, cyclesPilule, cyclesNaturel }) {
  if (!dateJour) return { cycle: null, typeCycle: null, jourRelatif: null }

  if (menstruationMode === 'naturel') {
    const cycle = findCycleForDate(cyclesNaturel, TYPE_CYCLE.NATUREL, dateJour)
    return {
      cycle,
      typeCycle: cycle ? 'naturel' : null,
      jourRelatif: cycle ? computeJourRelatif(dateJour, cycle, TYPE_CYCLE.NATUREL) : null,
    }
  }

  if (menstruationMode === 'pilule') {
    const cycle = findCycleForDate(cyclesPilule, TYPE_CYCLE.PILULE, dateJour)
    return {
      cycle,
      typeCycle: cycle ? 'pilule' : null,
      jourRelatif: cycle ? computeJourRelatif(dateJour, cycle, TYPE_CYCLE.PILULE) : null,
    }
  }

  return { cycle: null, typeCycle: null, jourRelatif: null }
}

async function findEmotionLogIdForDate(supabase, userId, dateJour) {
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('date_jour', dateJour)
    .order('id', { ascending: false })
    .limit(1)

  if (error) throw error
  return rows?.[0]?.id ?? null
}

async function updateEmotionLogForDate(supabase, userId, dateJour, fields) {
  const existingId = await findEmotionLogIdForDate(supabase, userId, dateJour)

  if (existingId) {
    const { error: updateError } = await supabase.from(TABLE).update(fields).eq('id', existingId)
    if (updateError) throw updateError
    return { id: existingId, updated: true }
  }

  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, date_jour: dateJour, ...fields })
    .select('id')

  if (insertError?.code === '23505') {
    const retryId = await findEmotionLogIdForDate(supabase, userId, dateJour)
    if (retryId) {
      const { error: updateError } = await supabase.from(TABLE).update(fields).eq('id', retryId)
      if (updateError) throw updateError
      return { id: retryId, updated: true }
    }
  }

  if (insertError) throw insertError
  return { id: data?.[0]?.id ?? null, updated: false }
}

/** Insert ou update du log du jour — modifiable autant de fois que nécessaire */
export async function upsertEmotionLog(supabase, userId, payload, knownId = null) {
  const { user_id, date_jour, ...fields } = payload
  const rowId = knownId ?? (await findEmotionLogIdForDate(supabase, user_id, date_jour))

  if (rowId) {
    const { error: updateError } = await supabase.from(TABLE).update(fields).eq('id', rowId)
    if (updateError) throw updateError
    return { id: rowId, updated: true }
  }

  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({ user_id, date_jour, ...fields })
    .select('id')

  if (insertError?.code === '23505') {
    return updateEmotionLogForDate(supabase, user_id, date_jour, fields)
  }

  if (insertError) throw insertError
  return { id: data?.[0]?.id ?? null, updated: false }
}

export async function listEmotionLogs(supabase, userId, { limit = 180 } = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      [
        'date_jour',
        'humeur_générale',
        'énergie_émotionnelle',
        'besoin_réassurance',
        'sentiment_général',
        'score_global',
        'jour_relatif',
        'cycle_id',
        'type_cycle',
      ].join(', '),
    )
    .eq('user_id', userId)
    .order('date_jour', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getEmotionLogForDate(supabase, userId, dateJour) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      [
        'id',
        'date_jour',
        'humeur_générale',
        'énergie_émotionnelle',
        'besoin_réassurance',
        'sentiment_général',
        'score_global',
        'jour_relatif',
        'cycle_id',
        'type_cycle',
      ].join(', '),
    )
    .eq('user_id', userId)
    .eq('date_jour', dateJour)
    .order('id', { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

function findProgressiveDecreasePattern(logs) {
  if (logs.length < 3) return null
  const a = logs[logs.length - 3]
  const b = logs[logs.length - 2]
  const c = logs[logs.length - 1]
  if (!a?.date_jour || !b?.date_jour || !c?.date_jour) return null
  if (!isConsecutive(a.date_jour, b.date_jour) || !isConsecutive(b.date_jour, c.date_jour)) return null
  const sa = Number(a.score_global)
  const sb = Number(b.score_global)
  const sc = Number(c.score_global)
  if (![sa, sb, sc].every((x) => Number.isFinite(x))) return null
  if (sa > sb && sb > sc && sc <= 3) {
    return 'Pattern détecté : coup de mou (baisse progressive sur 3 jours).'
  }
  return null
}

function findConsecutiveTruePattern(logs, key, days, message) {
  if (logs.length < days) return null
  const slice = logs.slice(-days)
  for (let i = 0; i < slice.length - 1; i++) {
    if (!isConsecutive(slice[i].date_jour, slice[i + 1].date_jour)) return null
  }
  if (slice.every((r) => Boolean(r[key]))) return message
  return null
}

function findConsecutiveThresholdPattern(logs, key, days, maxValue, message) {
  if (logs.length < days) return null
  const slice = logs.slice(-days)
  for (let i = 0; i < slice.length - 1; i++) {
    if (!isConsecutive(slice[i].date_jour, slice[i + 1].date_jour)) return null
  }
  const ok = slice.every((r) => Number(r[key]) <= maxValue)
  return ok ? message : null
}

function buildJourRelatifStats(logs) {
  const byJR = new Map()
  for (const row of logs) {
    const jr = row.jour_relatif
    const cycleId = row.cycle_id
    if (jr == null || cycleId == null) continue
    if (!byJR.has(jr)) byJR.set(jr, { sum: 0, n: 0, cycles: new Set(), reassuranceTrue: 0, energySum: 0, energyN: 0 })
    const s = byJR.get(jr)
    const score = Number(row.score_global)
    if (Number.isFinite(score)) {
      s.sum += score
      s.n += 1
    }
    s.cycles.add(cycleId)
    if (row.besoin_réassurance) s.reassuranceTrue += 1
    const e = Number(row['énergie_émotionnelle'])
    if (Number.isFinite(e)) {
      s.energySum += e
      s.energyN += 1
    }
  }
  return byJR
}

function findRecurrentWindows(values) {
  // values: sorted numbers
  const ranges = []
  let start = null
  let prev = null
  for (const v of values) {
    if (start == null) {
      start = v
      prev = v
      continue
    }
    if (v === prev + 1) {
      prev = v
      continue
    }
    ranges.push([start, prev])
    start = v
    prev = v
  }
  if (start != null) ranges.push([start, prev])
  return ranges
}

function findRecurrentScoreByJourRelatif(logs) {
  const stats = buildJourRelatifStats(logs)
  const candidates = []
  for (const [jr, s] of stats.entries()) {
    if (s.n <= 0) continue
    const avg = s.sum / s.n
    if (avg <= 2.5 && s.cycles.size >= 2) candidates.push(Number(jr))
  }
  candidates.sort((a, b) => a - b)
  if (!candidates.length) return null
  const [a, b] = findRecurrentWindows(candidates)[0]
  return a === b
    ? `Pattern récurrent détecté : score bas autour de ${a}% du cycle.`
    : `Pattern récurrent détecté : score bas entre ${a}% et ${b}% du cycle.`
}

function findRecurrentReassuranceByJourRelatif(logs) {
  const stats = buildJourRelatifStats(logs)
  const candidates = []
  for (const [jr, s] of stats.entries()) {
    if (s.cycles.size < 2) continue
    if (s.reassuranceTrue >= 2) candidates.push(Number(jr))
  }
  candidates.sort((a, b) => a - b)
  if (!candidates.length) return null
  const [a, b] = findRecurrentWindows(candidates)[0]
  return a === b
    ? `Pattern récurrent détecté : besoin de réassurance autour de ${a}% du cycle.`
    : `Pattern récurrent détecté : besoin de réassurance entre ${a}% et ${b}% du cycle.`
}

function findRecurrentLowEnergyByJourRelatif(logs) {
  const stats = buildJourRelatifStats(logs)
  const candidates = []
  for (const [jr, s] of stats.entries()) {
    if (s.cycles.size < 2 || s.energyN <= 0) continue
    const avg = s.energySum / s.energyN
    if (avg <= 2) candidates.push(Number(jr))
  }
  candidates.sort((a, b) => a - b)
  if (!candidates.length) return null
  const [a, b] = findRecurrentWindows(candidates)[0]
  return a === b
    ? `Pattern récurrent détecté : fatigue émotionnelle autour de ${a}% du cycle.`
    : `Pattern récurrent détecté : fatigue émotionnelle entre ${a}% et ${b}% du cycle.`
}

export function detectEmotionPatterns(logs) {
  // Priorité : patterns “du moment” d'abord, puis récurrences
  return (
    findProgressiveDecreasePattern(logs) ||
    findConsecutiveTruePattern(
      logs,
      'besoin_réassurance',
      2,
      'Pattern détecté : besoin de soutien (réassurance 2 jours de suite).',
    ) ||
    findConsecutiveThresholdPattern(
      logs,
      'énergie_émotionnelle',
      3,
      2,
      'Pattern détecté : épuisement émotionnel (énergie ≤ 2 sur 3 jours).',
    ) ||
    findRecurrentScoreByJourRelatif(logs) ||
    findRecurrentReassuranceByJourRelatif(logs) ||
    findRecurrentLowEnergyByJourRelatif(logs) ||
    null
  )
}

