/**
 * Groupement parent / implications + coût agrégé (sans double-compte).
 * Supporte les liaisons imbriquées (enfant d’un enfant).
 */

import { normalizeBatteryCost } from './batteryMath.js'
import { batteryPriorityMeta } from '../../constants/battery/battery.js'

/**
 * @param {object[]} entries
 * @returns {{
 *   roots: object[],
 *   childrenByParent: Map<string, object[]>,
 *   orphanImplied: object[],
 * }}
 */
export function groupEntriesByImplication(entries) {
  const list = Array.isArray(entries) ? [...entries] : []
  const byId = new Map(list.map((e) => [e.id, e]))
  /** @type {Map<string, object[]>} */
  const childrenByParent = new Map()
  /** @type {object[]} */
  const orphanImplied = []
  /** @type {object[]} */
  const roots = []

  for (const entry of list) {
    const parentId = entry.implied_by_entry_id || null
    if (!parentId) {
      roots.push(entry)
      continue
    }
    if (!byId.has(parentId)) {
      orphanImplied.push(entry)
      continue
    }
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(entry)
  }

  // Ordre manuel (DnD / sort_order) partout — y compris avec horaires (Prévu & Réel)
  const bySortOrder = (a, b) => (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
  for (const kids of childrenByParent.values()) {
    kids.sort(bySortOrder)
  }
  roots.sort(bySortOrder)
  orphanImplied.sort(bySortOrder)

  return { roots, childrenByParent, orphanImplied }
}

/**
 * Coût récursif d’un nœud = propre + tous les descendants.
 * @param {object} entry
 * @param {Map<string, object[]>} childrenByParent
 */
export function aggregatedSubtreeCost(entry, childrenByParent) {
  const kids = childrenByParent?.get(entry?.id) || []
  let total = normalizeBatteryCost(entry?.cost)
  for (const kid of kids) {
    total += aggregatedSubtreeCost(kid, childrenByParent)
  }
  return normalizeBatteryCost(total)
}

/**
 * @deprecated Préférer aggregatedSubtreeCost pour les arbres imbriqués.
 * @param {object} parent
 * @param {object[]} [children]
 */
export function aggregatedEntryCost(parent, children = []) {
  const own = normalizeBatteryCost(parent?.cost)
  const kids = (children || []).reduce((sum, c) => sum + normalizeBatteryCost(c.cost), 0)
  return normalizeBatteryCost(own + kids)
}

/**
 * Somme des coûts « visibles » : racines agrégées + orphelins ; descendants exclus.
 * @param {object[]} entries
 */
export function sumPlannedCostsWithoutDoubleCount(entries) {
  const { roots, childrenByParent, orphanImplied } = groupEntriesByImplication(entries)
  let total = 0
  for (const root of roots) {
    total += aggregatedSubtreeCost(root, childrenByParent)
  }
  for (const orphan of orphanImplied) {
    total += aggregatedSubtreeCost(orphan, childrenByParent)
  }
  return normalizeBatteryCost(total)
}

/**
 * Forêt d’affichage (racines + orphelins), avec profondeur et coût agrégé.
 * @param {object[]} entries
 * @returns {Array<{ entry: object, children: object[], displayCost: number, depth: number, childCount: number }>}
 */
export function buildImplicationForestRows(entries) {
  const { roots, childrenByParent, orphanImplied } = groupEntriesByImplication(entries)
  /** @type {Array<{ entry: object, children: object[], displayCost: number, depth: number, childCount: number }>} */
  const rows = []

  /**
   * @param {object} entry
   * @param {number} depth
   */
  function walk(entry, depth) {
    const direct = childrenByParent.get(entry.id) || []
    rows.push({
      entry,
      children: direct,
      displayCost: aggregatedSubtreeCost(entry, childrenByParent),
      depth,
      childCount: countDescendants(entry.id, childrenByParent),
    })
    for (const child of direct) walk(child, depth + 1)
  }

  for (const root of roots) walk(root, 0)
  for (const orphan of orphanImplied) walk(orphan, 0)
  return rows
}

/**
 * @param {string} id
 * @param {Map<string, object[]>} childrenByParent
 */
function countDescendants(id, childrenByParent) {
  const kids = childrenByParent.get(id) || []
  let n = kids.length
  for (const kid of kids) n += countDescendants(kid.id, childrenByParent)
  return n
}

/**
 * Empêche les cycles : candidateParent ne doit pas être descendant de candidateChild.
 * @param {object[]} entries
 * @param {string} parentId
 * @param {string} childId
 */
export function wouldCreateImplicationCycle(entries, parentId, childId) {
  if (!parentId || !childId || parentId === childId) return true
  const { childrenByParent } = groupEntriesByImplication(entries)
  const stack = [childId]
  const seen = new Set()
  while (stack.length) {
    const id = stack.pop()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (id === parentId) return true
    for (const kid of childrenByParent.get(id) || []) stack.push(kid.id)
  }
  return false
}

/**
 * @param {object} a
 * @param {object} b
 */
export function compareEntriesChrono(a, b) {
  const ta = timeToMinutes(a?.planned_start)
  const tb = timeToMinutes(b?.planned_start)
  if (ta != null && tb != null && ta !== tb) return ta - tb
  if (ta != null && tb == null) return -1
  if (ta == null && tb != null) return 1
  const pa = batteryPriorityMeta(a?.priority)?.rank ?? 99
  const pb = batteryPriorityMeta(b?.priority)?.rank ?? 99
  if (pa !== pb) return pa - pb
  return (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
}

/**
 * @param {string | null | undefined} hhmm
 * @returns {number | null}
 */
export function timeToMinutes(hhmm) {
  const m = String(hhmm ?? '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  return h * 60 + min
}

/**
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 */
export function formatPlannedSlot(start, end) {
  const s = String(start ?? '').trim()
  const e = String(end ?? '').trim()
  if (s && e) return `${s} – ${e}`
  if (s) return s
  return ''
}
