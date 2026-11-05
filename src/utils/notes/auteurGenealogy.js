/**
 * Arbre généalogique + incohérences (Auteur).
 */

/**
 * @param {import('../../constants/notes/auteurWorld.js').AuteurRelation[]} relations
 */
export function familyLinks(relations) {
  return (relations || []).filter((r) => r.type === 'family')
}

/**
 * @param {string} characterId
 * @param {import('../../constants/notes/auteurWorld.js').AuteurRelation[]} relations
 */
export function parentsOf(characterId, relations) {
  return familyLinks(relations)
    .filter(
      (r) =>
        r.toId === characterId &&
        (r.subtype === 'parent' || r.subtype === 'child' || !r.subtype),
    )
    .map((r) => {
      // Convention : from = parent, to = child si subtype parent ; inverse si child
      if (r.subtype === 'child') return r.toId === characterId ? r.fromId : r.toId
      return r.fromId === characterId ? r.toId : r.fromId
    })
    .filter((id) => id && id !== characterId)
}

/**
 * Enfants : from parent → to child (subtype parent) ou from child → to parent (subtype child)
 * @param {string} characterId
 * @param {import('../../constants/notes/auteurWorld.js').AuteurRelation[]} relations
 */
export function childrenOf(characterId, relations) {
  const out = []
  for (const r of familyLinks(relations)) {
    if (r.subtype === 'adopted' || r.subtype === 'parent' || !r.subtype) {
      if (r.fromId === characterId && r.toId !== characterId) out.push({ id: r.toId, adopted: r.subtype === 'adopted' })
    }
    if (r.subtype === 'child' && r.toId === characterId) {
      out.push({ id: r.fromId, adopted: false })
    }
  }
  return out
}

/**
 * Construit un arbre centré (niveaux négatifs = ancêtres).
 * @param {object} opts
 */
export function buildGenealogyTree(opts) {
  const {
    characters = [],
    relations = [],
    focusId = null,
    ancestorGens = 3,
    descendantGens = 3,
  } = opts
  const byId = new Map(characters.map((c) => [c.id, c]))
  const focus = focusId && byId.has(focusId) ? focusId : characters[0]?.id || null
  if (!focus) return { focusId: null, levels: [], edges: [], ghosts: [] }

  /** @type {Map<string, number>} */
  const level = new Map([[focus, 0]])
  const queue = [focus]

  // Ancêtres
  for (const id of [...queue]) {
    walkAncestors(id, 0)
  }
  function walkAncestors(id, depth) {
    if (depth >= ancestorGens) return
    for (const p of parentsOf(id, relations)) {
      if (!level.has(p)) {
        level.set(p, (level.get(id) || 0) - 1)
        if (!byId.has(p)) byId.set(p, { id: p, name: p, ghost: true })
        walkAncestors(p, depth + 1)
      }
    }
  }

  // Descendants
  function walkDesc(id, depth) {
    if (depth >= descendantGens) return
    for (const child of childrenOf(id, relations)) {
      if (!level.has(child.id)) {
        level.set(child.id, (level.get(id) || 0) + 1)
        if (!byId.has(child.id)) byId.set(child.id, { id: child.id, name: child.id, ghost: true })
        walkDesc(child.id, depth + 1)
      }
    }
  }
  walkDesc(focus, 0)

  const spouses = familyLinks(relations).filter((r) => r.subtype === 'spouse' || r.subtype === 'partner')
  /** @type {{ from: string, to: string, kind: string }[]} */
  const edges = []
  for (const r of familyLinks(relations)) {
    if (!level.has(r.fromId) && !level.has(r.toId)) continue
    edges.push({
      from: r.fromId,
      to: r.toId,
      kind: r.subtype || 'family',
    })
  }

  /** @type {Map<number, object[]>} */
  const byLevel = new Map()
  for (const [id, lv] of level) {
    if (!byLevel.has(lv)) byLevel.set(lv, [])
    byLevel.get(lv).push(byId.get(id) || { id, name: id, ghost: true })
  }
  const levels = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lv, nodes]) => ({ level: lv, nodes }))

  const ghosts = [...byId.values()].filter((c) => c.ghost)

  return { focusId: focus, levels, edges, spouses, ghosts }
}

/**
 * @param {import('../../constants/notes/auteurWorld.js').AuteurCharacter[]} characters
 * @param {import('../../constants/notes/auteurWorld.js').AuteurRelation[]} relations
 */
export function detectGenealogyIssues(characters, relations) {
  /** @type {{ id: string, severity: 'error'|'warn', message: string, characterIds: string[] }[]} */
  const issues = []
  const byId = new Map(characters.map((c) => [c.id, c]))

  // Cycle d’ascendance
  for (const c of characters) {
    if (isOwnAncestor(c.id, relations, new Set())) {
      issues.push({
        id: `cycle-${c.id}`,
        severity: 'error',
        message: `${c.name} serait son propre ancêtre.`,
        characterIds: [c.id],
      })
    }
  }

  for (const r of familyLinks(relations)) {
    if (r.subtype !== 'parent' && r.subtype !== 'adopted' && r.subtype) continue
    const parent = byId.get(r.fromId)
    const child = byId.get(r.toId)
    if (!parent || !child) continue
    const pb = parseYear(parent.birth)
    const pd = parseYear(parent.death)
    const cb = parseYear(child.birth)
    if (pb != null && cb != null && cb < pb) {
      issues.push({
        id: `born-before-parent-${child.id}`,
        severity: 'error',
        message: `${child.name} naît avant ${parent.name}.`,
        characterIds: [parent.id, child.id],
      })
    }
    if (pb != null && cb != null && cb - pb < 12) {
      issues.push({
        id: `age-gap-${child.id}`,
        severity: 'warn',
        message: `Écart d’âge improbable entre ${parent.name} et ${child.name} (${cb - pb} ans).`,
        characterIds: [parent.id, child.id],
      })
    }
    if (pd != null && cb != null && cb > pd) {
      issues.push({
        id: `after-death-${child.id}`,
        severity: 'error',
        message: `${parent.name} est mort(e) avant la naissance de ${child.name}.`,
        characterIds: [parent.id, child.id],
      })
    }
  }

  // Mentions fantômes dans relations
  for (const r of relations) {
    for (const id of [r.fromId, r.toId]) {
      if (!byId.has(id)) {
        issues.push({
          id: `ghost-${id}`,
          severity: 'warn',
          message: `Personnage cité sans fiche : ${id}.`,
          characterIds: [id],
        })
      }
    }
  }

  return issues
}

function isOwnAncestor(id, relations, seen) {
  if (seen.has(id)) return true
  seen.add(id)
  for (const p of parentsOf(id, relations)) {
    if (p === id) return true
    if (isOwnAncestor(p, relations, new Set(seen))) return true
  }
  return false
}

function parseYear(value) {
  if (value == null || value === '') return null
  const m = String(value).match(/(-?\d{1,6})/)
  return m ? Number(m[1]) : null
}

/**
 * Graphe de relations (positions initiales + meta).
 * @param {object} opts
 */
export function buildRelationGraph(opts) {
  const { characters = [], relations = [], atDate = null, layouts = {} } = opts
  const nodes = characters.map((c, i) => {
    const degree = relations.filter((r) => r.fromId === c.id || r.toId === c.id).length
    const saved = layouts[c.id]
    return {
      id: c.id,
      name: c.name,
      camp: c.camp || '',
      ghost: Boolean(c.ghost),
      summary: c.summary || '',
      size: 10 + Math.min(24, degree * 3),
      x: saved?.x ?? 80 + (i % 6) * 100,
      y: saved?.y ?? 80 + Math.floor(i / 6) * 90,
      degree,
    }
  })
  const edges = relations
    .filter((r) => relationValidAt(r, atDate))
    .map((r) => ({
      id: r.id,
      from: r.fromId,
      to: r.toId,
      type: r.type,
      ended: Boolean(r.ended),
      label: r.label || r.subtype || r.type,
    }))
  return { nodes, edges }
}

function relationValidAt(relation, atDate) {
  if (!atDate) return true
  const t = parseYear(atDate)
  if (t == null) return true
  const from = parseYear(relation.validFrom)
  const to = parseYear(relation.validTo)
  if (from != null && t < from) return false
  if (to != null && t > to) return false
  if (relation.ended && to == null) return false
  return true
}
