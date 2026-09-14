import { PILULE_SYMPTOMS_BY_PERIOD } from './menstruationSymptomsPilule.js'
import { NATUREL_SYMPTOMS_BY_PHASE } from './menstruationSymptomsNaturel.js'

/** @typedef {{ min: number, max: number }} ScaleDefinition */

export const CHECKIN_FIELD_SCALES = {
  humeur_generale: { min: 1, max: 5 },
  energie_emotionnelle: { min: 1, max: 5 },
  sentiment_general: { min: 1, max: 5 },
}

const CHECKIN_FIELD_TO_CONTEXT_KEY = {
  humeur_generale: 'humeurGenerale',
  energie_emotionnelle: 'energieEmotionnelle',
  besoin_reassurance: 'besoinReassurance',
  sentiment_general: 'sentimentGeneral',
}

/** @type {Map<string, ScaleDefinition>|null} */
let symptomScaleCache = null

function buildSymptomScaleMap() {
  /** @type {Map<string, ScaleDefinition>} */
  const scales = new Map()
  const allDefs = [
    ...Object.values(PILULE_SYMPTOMS_BY_PERIOD).flat(),
    ...Object.values(NATUREL_SYMPTOMS_BY_PHASE).flat(),
  ]

  for (const def of allDefs) {
    if (def.type !== 'scale') continue

    const existing = scales.get(def.key)
    if (!existing) {
      scales.set(def.key, { min: def.min, max: def.max })
      continue
    }

    scales.set(def.key, {
      min: Math.min(existing.min, def.min),
      max: Math.max(existing.max, def.max),
    })
  }

  return scales
}

function getSymptomScaleMap() {
  if (!symptomScaleCache) {
    symptomScaleCache = buildSymptomScaleMap()
  }
  return symptomScaleCache
}

/**
 * Moyenne arithmétique de l'échelle (min + max) / 2.
 * @param {ScaleDefinition} scale
 */
export function getScaleMean(scale) {
  return (scale.min + scale.max) / 2
}

/**
 * Valeur élevée : supérieure ou égale à la moyenne de l'échelle.
 * @param {number} value
 * @param {ScaleDefinition} scale
 */
export function isScaleValueHigh(value, scale) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return false
  return numeric >= getScaleMean(scale)
}

/**
 * Valeur faible : inférieure ou égale à la moyenne de l'échelle.
 * @param {number} value
 * @param {ScaleDefinition} scale
 */
export function isScaleValueLow(value, scale) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return false
  return numeric <= getScaleMean(scale)
}

/**
 * @param {string} symptomKey
 * @returns {ScaleDefinition|null}
 */
export function getSymptomScale(symptomKey) {
  return getSymptomScaleMap().get(symptomKey) ?? null
}

/**
 * @param {string} checkinFieldKey
 * @returns {ScaleDefinition|null}
 */
export function getCheckinFieldScale(checkinFieldKey) {
  return CHECKIN_FIELD_SCALES[checkinFieldKey] ?? null
}

/**
 * @param {string} conditionId
 * @returns {{
 *   source: 'symptom'|'checkin',
 *   key: string,
 *   level?: 'high'|'low',
 *   exactValue?: number,
 *   boolean?: true,
 * }|null}
 */
export function parseReconfortConditionId(conditionId) {
  const parts = conditionId.split(':')
  if (parts.length < 2) return null

  if (parts[0] === 'symptom' && parts.length === 3) {
    return { source: 'symptom', key: parts[1], level: parts[2] }
  }

  if (parts[0] === 'checkin') {
    if (parts[1] === 'besoin_reassurance') {
      return { source: 'checkin', key: 'besoin_reassurance', boolean: true }
    }
    if (parts[1] === 'sentiment_general' && parts.length === 3) {
      const exactValue = Number(parts[2])
      if (!Number.isFinite(exactValue)) return null
      return { source: 'checkin', key: 'sentiment_general', exactValue }
    }
    if (parts.length === 3) {
      return { source: 'checkin', key: parts[1], level: parts[2] }
    }
  }

  return null
}

/**
 * Contexte pour l'évaluation des conditions de réconfort.
 * @typedef {Object} ReconfortMatchContext
 * @property {Record<string, number|null|undefined>} [symptoms] Valeurs symptômes menstruation (clés UI)
 * @property {{
 *   humeurGenerale?: number|null,
 *   energieEmotionnelle?: number|null,
 *   besoinReassurance?: boolean,
 *   sentimentGeneral?: number|null,
 * }} [checkin] Valeurs du check-in Dashboard
 */

/**
 * @param {string} conditionId
 * @param {ReconfortMatchContext} [context]
 */
export function matchesReconfortCondition(conditionId, context = {}) {
  const parsed = parseReconfortConditionId(conditionId)
  if (!parsed) return false

  if (parsed.source === 'symptom') {
    const value = context.symptoms?.[parsed.key]
    if (value === null || value === undefined) return false

    const scale = getSymptomScale(parsed.key)
    if (!scale) return false

    if (parsed.level === 'high') return isScaleValueHigh(value, scale)
    if (parsed.level === 'low') return isScaleValueLow(value, scale)
    return false
  }

  const contextKey = CHECKIN_FIELD_TO_CONTEXT_KEY[parsed.key] ?? parsed.key
  const value = context.checkin?.[contextKey]

  if (parsed.boolean) {
    return value === true
  }

  if (parsed.exactValue != null) {
    if (value === null || value === undefined) return false
    return Number(value) === parsed.exactValue
  }

  const scale = getCheckinFieldScale(parsed.key)
  if (!scale || value === null || value === undefined) return false

  if (parsed.level === 'high') return isScaleValueHigh(value, scale)
  if (parsed.level === 'low') return isScaleValueLow(value, scale)

  return false
}

/**
 * Toutes les conditions doivent être satisfaites (logique ET).
 * @param {string[]} conditionIds
 * @param {ReconfortMatchContext} [context]
 */
export function matchesAllReconfortConditions(conditionIds, context = {}) {
  if (!Array.isArray(conditionIds) || conditionIds.length === 0) return false
  return conditionIds.every((id) => matchesReconfortCondition(id, context))
}

/**
 * Au moins une condition doit être satisfaite (logique OU).
 * @param {string[]} conditionIds
 * @param {ReconfortMatchContext} [context]
 */
export function matchesAnyReconfortCondition(conditionIds, context = {}) {
  if (!Array.isArray(conditionIds) || conditionIds.length === 0) return false
  return conditionIds.some((id) => matchesReconfortCondition(id, context))
}
