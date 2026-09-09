import { normalizeDateISO } from '../utils/habitCalendar.js'

/** Motifs proposés par défaut (toujours visibles dans le dropdown). */
export const DEFAULT_PROJECT_PAUSE_REASONS = [
  'Vacances',
  'Malade',
  'Congés',
  'Voyage',
  'Pause personnelle',
  'Autre',
]

function localTodayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizePauseReasonList(raw) {
  const seen = new Set()
  const out = []
  const push = (value) => {
    const label = String(value ?? '').trim()
    if (!label) return
    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(label)
  }
  for (const value of DEFAULT_PROJECT_PAUSE_REASONS) push(value)
  if (Array.isArray(raw)) {
    for (const value of raw) push(value)
  }
  return out
}

/**
 * @param {object|null|undefined} item
 * @returns {{ pause_from: string|null, pause_to: string|null, pause_reason: string|null }}
 */
export function normalizeProjectPauseFields(item) {
  const from = normalizeDateISO(item?.pause_from) || null
  const to = normalizeDateISO(item?.pause_to) || null
  const reason = String(item?.pause_reason ?? '').trim() || null
  return {
    pause_from: from,
    pause_to: to,
    pause_reason: reason,
  }
}

/**
 * Pause active si aujourd’hui est entre pause_from et pause_to (inclus).
 * @param {object|null|undefined} item
 * @param {string} [todayISO]
 */
export function isProjectItemPaused(item, todayISO = localTodayISO()) {
  const { pause_from: from, pause_to: to } = normalizeProjectPauseFields(item)
  if (!from || !to) return false
  const today = normalizeDateISO(todayISO) || localTodayISO()
  return today >= from && today <= to
}

/**
 * @param {{ pause_enabled?: boolean, pause_from?: string|null, pause_to?: string|null, pause_reason?: string|null }} form
 * @returns {{ pause_from: string|null, pause_to: string|null, pause_reason: string|null }}
 */
export function buildPausePayloadFromForm(form) {
  if (!form?.pause_enabled) {
    return { pause_from: null, pause_to: null, pause_reason: null }
  }
  const from = normalizeDateISO(form.pause_from)
  const to = normalizeDateISO(form.pause_to)
  const reason = String(form.pause_reason ?? '').trim()
  if (!from || !to) {
    throw new Error('Indique une date de début et une date de fin pour la pause.')
  }
  if (to < from) {
    throw new Error('La fin de pause doit être postérieure ou égale au début.')
  }
  if (!reason) {
    throw new Error('Choisis ou saisis un motif de pause.')
  }
  return {
    pause_from: from,
    pause_to: to,
    pause_reason: reason.slice(0, 80),
  }
}

/**
 * @param {object|null|undefined} item
 * @param {string} [todayISO]
 */
export function formatProjectPauseBadge(item, todayISO = localTodayISO()) {
  if (!isProjectItemPaused(item, todayISO)) return ''
  const { pause_from: from, pause_to: to, pause_reason: reason } = normalizeProjectPauseFields(item)
  const range = from === to ? from : `${from} → ${to}`
  return reason ? `En pause · ${reason} (${range})` : `En pause (${range})`
}
