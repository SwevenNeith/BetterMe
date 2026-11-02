/**
 * Conseils de pick / draft : compo listée + pool joueur + difficulté heuristique.
 */

import { markChamp, markChipRow, markRole, markTier } from './poroMarkup.js'
import {
  getPoroMemoryProfile,
  memoryCoachingHints,
} from './poroMemoryProfile.js'
import { detectRoleInText, inferRoleFromChampionTags, PORO_ROLES } from './poroRoles.js'
import { findChampionsInCatalog } from '../../services/jeux/lolPoroData.js'

/**
 * @param {string} raw
 */
function normalize(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * @param {string} raw
 */
export function isDraftPickQuery(raw) {
  const n = normalize(raw)
  const asksPick =
    n.includes('quel champion') ||
    n.includes('quelle championne') ||
    n.includes('qui jouer') ||
    n.includes('qui pick') ||
    n.includes('que pick') ||
    n.includes('quoi pick') ||
    n.includes('conseil de pick') ||
    n.includes('conseil pick') ||
    (n.includes('pick') && (n.includes('contre') || n.includes('avec') || n.includes('draft'))) ||
    (n.includes('draft') && (n.includes('champion') || n.includes('jouer') || n.includes('pick')))

  if (!asksPick) return false
  // Évite de capturer « build X contre Y » (items)
  if ((n.includes('item') || n.includes('build') || n.includes('stuff')) && !n.includes('pick')) {
    return false
  }
  return true
}

/**
 * Découpe alliés / ennemis / bans depuis une phrase libre.
 * @param {string} raw
 * @param {object[]} champions catalogue Data Dragon
 * @returns {{
 *   allies: object[],
 *   enemies: object[],
 *   bans: object[],
 *   role: { id: string, label: string } | null,
 *   styleTags: string[],
 * }}
 */
export function parseDraftTeams(raw, champions = []) {
  const text = String(raw ?? '')
  const n = normalize(text)
  const role = detectRoleInText(text)

  /** @type {string[]} */
  const styleTags = []
  for (const tag of ['tank', 'assassin', 'poke', 'heal', 'cc', 'adc', 'ap', 'ad']) {
    if (n.includes(tag)) styleTags.push(tag)
  }

  // Bans : « ban(s) Ahri Syndra » / « bans : Ahri, Syndra »
  let banChunk = ''
  const banMatch = text.match(
    /\bban(?:s|ned|nis)?\b\s*[:\-]?\s*([^\n]+?)(?=\b(?:avec|contre|vs|versus|deja|déjà|pick|allie|allié|ennemi)\b|$)/i,
  )
  if (banMatch) banChunk = banMatch[1]

  // Alliés : « avec Ornn Lulu » / « alliés : … »
  let allyChunk = ''
  const allyMatch = text.match(
    /\b(?:avec|allies|alliés|allie|ally)\b\s*[:\-]?\s*([^\n]+?)(?=\b(?:contre|vs|versus|ban|ennemi)\b|$)/i,
  )
  if (allyMatch) allyChunk = allyMatch[1]

  // Ennemis : « contre … » / « vs … » / « ennemis : … »
  let enemyChunk = ''
  const enemyMatch = text.match(
    /\b(?:contre|vs|versus|ennemis|enemies|adversaires)\b\s*[:\-]?\s*([^\n]+?)(?=\b(?:avec|ban|allie|allié)\b|$)/i,
  )
  if (enemyMatch) enemyChunk = enemyMatch[1]

  // Fallback : si « contre » seul avec des noms, pas d’« avec »
  if (!enemyChunk && !allyChunk) {
    const vsOnly = text.match(/\b(?:contre|vs)\b\s+(.+)$/i)
    if (vsOnly) enemyChunk = vsOnly[1]
  }

  const bans = banChunk ? findChampionsInCatalog(banChunk, champions) : []
  const allies = allyChunk ? findChampionsInCatalog(allyChunk, champions) : []
  let enemies = enemyChunk ? findChampionsInCatalog(enemyChunk, champions) : []

  // Si aucun côté trouvé mais des champions listés après la question
  if (!enemies.length && !allies.length) {
    const all = findChampionsInCatalog(text, champions)
    // Heuristique : tout ce qui suit « contre/vs » sinon rien
    enemies = all
  }

  // Retire les bans des listes jouables
  const banIds = new Set(bans.map((c) => c.id))
  const clean = (list) => list.filter((c) => !banIds.has(c.id))

  return {
    allies: clean(allies),
    enemies: clean(enemies),
    bans,
    role,
    styleTags: [...new Set(styleTags)],
  }
}

/**
 * Score de difficulté du matchup pour un candidat (S = dur, E = facile).
 * @param {object} candidate
 * @param {object[]} enemies
 * @param {string[]} styleTags
 */
export function rateDraftDifficulty(candidate, enemies = [], styleTags = []) {
  let score = 0
  const myTags = new Set((candidate.tags || []).map(String))
  /** @type {string[]} */
  const reasons = []

  for (const e of enemies) {
    const et = new Set((e.tags || []).map(String))
    if (et.has('Assassin') && (myTags.has('Mage') || myTags.has('Marksman'))) {
      score += 1.2
      reasons.push(`Risqué vs ${e.name} (assassin) — respecte les fenêtres d’ulti`)
    }
    if (et.has('Tank') && myTags.has('Assassin')) {
      score += 1
      reasons.push(`${e.name} tank : burst seul souvent insuffisant`)
    }
    if (et.has('Tank') && myTags.has('Mage')) {
      score -= 0.35
      reasons.push(`Bon scaling / poke vs ${e.name}`)
    }
    if (et.has('Mage') && myTags.has('Assassin')) {
      score -= 0.45
      reasons.push(`Bon angle d’assassinat vs ${e.name}`)
    }
    if (et.has('Mage') && myTags.has('Mage')) {
      reasons.push(`Wave / roam : joue les timers vs ${e.name}`)
    }
    if (et.has('Marksman') && (myTags.has('Assassin') || myTags.has('Mage'))) {
      score -= 0.55
      reasons.push(`Menace la backline (${e.name}) si tu joins les fights`)
    }
    if (et.has('Support') && myTags.has('Mage')) {
      reasons.push(`Peut forcer ${e.name} / bot si shove mid`)
    }
  }

  if (styleTags.includes('heal') && myTags.has('Mage')) {
    score += 0.25
    reasons.push('Anti-heal utile vs sustain adverse')
  }
  if (styleTags.includes('poke') && myTags.has('Tank')) {
    score -= 0.4
    reasons.push('Tank tient mieux le poke')
  }
  if (styleTags.includes('assassin') && (myTags.has('Mage') || myTags.has('Marksman'))) {
    score += 0.8
    reasons.push('Compo assassin : item défensif / spacing prioritaires')
  }
  if (styleTags.includes('tank') && myTags.has('Assassin')) {
    score += 0.7
    reasons.push('Beaucoup de tanks : priorise pénétration / DPS soutenu')
  }

  let tier = 'C'
  if (score >= 2.2) tier = 'S'
  else if (score >= 1.3) tier = 'A'
  else if (score >= 0.5) tier = 'B'
  else if (score >= -0.3) tier = 'C'
  else if (score >= -1.2) tier = 'D'
  else tier = 'E'

  return { tier, score, reasons: [...new Set(reasons)].slice(0, 4) }
}

/**
 * Top N champions les plus joués (pool « mains »).
 * Les noms mémorisés (mains Poro) sont priorisés.
 * @param {object[]} pool
 * @param {number} [limit]
 * @param {string[]} [preferredNames]
 */
export function topPlayedPool(pool = [], limit = 3, preferredNames = []) {
  const pref = new Set(
    (preferredNames || []).map((n) => String(n || '').toLowerCase()).filter(Boolean),
  )
  return [...(pool || [])]
    .filter((r) => r && (r.championName || r.championId))
    .sort((a, b) => {
      const aP = pref.has(String(a.championName || '').toLowerCase()) ? 1 : 0
      const bP = pref.has(String(b.championName || '').toLowerCase()) ? 1 : 0
      if (bP !== aP) return bP - aP
      return (Number(b.games) || 0) - (Number(a.games) || 0)
    })
    .slice(0, Math.max(1, limit))
}

/**
 * Justification lisible d’un pick.
 * @param {object} entry
 * @param {{ role?: { id: string, label: string } | null, enemies?: object[], allies?: object[] }} [ctx]
 */
export function buildPickJustification(entry, ctx = {}) {
  const { role = null, enemies = [], allies = [] } = ctx
  /** @type {string[]} */
  const lines = []
  const tags = (entry.catalog?.tags || []).map(String)
  const name = entry.catalog?.name || 'Ce champion'

  if (role?.label) {
    if (tags.includes('Mage') && role.id === 'mid') {
      lines.push(`${name} est un mage cohérent en ${role.label}`)
    } else if (tags.includes('Assassin') && role.id === 'mid') {
      lines.push(`${name} apporte de la menace assassin en ${role.label}`)
    } else {
      lines.push(`Poste ${role.label} adapté à son kit`)
    }
  }

  for (const n of entry.syn?.notes || []) lines.push(n)
  for (const r of entry.diff?.reasons || []) lines.push(r)

  if (allies.length && tags.includes('Mage') && allies.some((a) => a.tags?.includes('Tank'))) {
    if (!lines.some((l) => /frontline/i.test(l))) {
      lines.push('Tes tanks alliés te laissent scale / poke derrière')
    }
  }
  if (enemies.some((e) => e.tags?.includes('Tank')) && tags.includes('Mage')) {
    if (!lines.some((l) => /tank|scaling|poke/i.test(l))) {
      lines.push('Utile pour chip / setup vs frontline adverse')
    }
  }

  let footer = 'Hors pool : bon fit draft / poste si tu veux élargir'
  if (entry.fromPool) {
    const wr =
      entry.row?.winRate == null
        ? null
        : `${Math.round(Number(entry.row.winRate) * 10) / 10} %`
    footer =
      wr != null
        ? `Dans tes mains : ${entry.row.games || 0} games · WR ${wr}`
        : `Dans tes mains : ${entry.row?.games || 0} games`
  }

  const unique = [...new Set(lines)].slice(0, 3)
  unique.push(footer)
  return unique
}

/**
 * Synergie légère avec les alliés (selon le poste demandé).
 * @param {object} candidate
 * @param {object[]} allies
 * @param {string | null} [roleId]
 */
function allySynergyScore(candidate, allies = [], roleId = null) {
  if (!allies.length) return { score: 0, notes: [] }
  let score = 0
  /** @type {string[]} */
  const notes = []
  const my = new Set((candidate.tags || []).map(String))
  const allyTags = new Set()
  for (const a of allies) for (const t of a.tags || []) allyTags.add(String(t))

  // Carry backline = mage contrôleur / ADC — pas assassin ni bruiser/tank
  const isBacklineCarry =
    (my.has('Marksman') || (my.has('Mage') && !my.has('Assassin'))) &&
    !my.has('Fighter') &&
    !my.has('Tank') &&
    (roleId === 'mid' || roleId === 'adc' || !roleId)

  const isFrontliner = my.has('Tank') || (my.has('Fighter') && !my.has('Marksman'))

  if (allyTags.has('Tank') && isBacklineCarry) {
    score += 1.2
    notes.push('Carry derrière frontline alliée')
  }
  if (isFrontliner && (allyTags.has('Mage') || allyTags.has('Marksman'))) {
    score += 0.9
    notes.push('Frontline / engage pour les carries alliés')
  }
  if (
    roleId === 'support' &&
    (allyTags.has('Mage') || allyTags.has('Marksman')) &&
    (my.has('Tank') || my.has('Support'))
  ) {
    score += 1
    notes.push('Peel / front pour les carries')
  }
  if (roleId === 'support' && allyTags.has('Assassin') && (my.has('Tank') || my.has('Support'))) {
    score += 0.8
    notes.push('Engage / peel pour convert')
  }
  if (
    (roleId === 'top' || roleId === 'jungle' || roleId === 'support') &&
    !allyTags.has('Tank') &&
    !allyTags.has('Fighter') &&
    isFrontliner
  ) {
    score += 0.9
    notes.push('Apporte la frontline manquante')
  }
  return { score, notes: notes.slice(0, 2) }
}

/**
 * Filtre strict : un support type Leona ne doit jamais sortir en mid.
 * @param {object} cat
 * @param {string | null | undefined} roleId
 */
export function fitsDraftRole(cat, roleId) {
  if (!roleId) return true
  const tags = new Set((cat.tags || []).map(String))
  const inferred = inferRoleFromChampionTags(cat.tags || [])

  if (roleId === 'mid') {
    // Mid cohérent = Mage et/ou Assassin « pur », jamais Fighter
    // (exclut Ambessa, Briar, Camille, Fiora, Morde, Yasuo…)
    if (tags.has('Fighter')) return false
    if (tags.has('Tank') && !tags.has('Mage')) return false
    if (tags.has('Support') && !tags.has('Mage')) return false
    if (tags.has('Marksman') && !tags.has('Mage')) return false
    if (inferred.id === 'support' || inferred.id === 'adc') return false
    return tags.has('Mage') || tags.has('Assassin')
  }
  if (roleId === 'adc') {
    return tags.has('Marksman') || inferred.id === 'adc'
  }
  if (roleId === 'support') {
    return (
      tags.has('Support') ||
      inferred.id === 'support' ||
      (tags.has('Tank') && !tags.has('Marksman'))
    )
  }
  if (roleId === 'jungle') {
    if (inferred.id === 'adc' || (tags.has('Support') && !tags.has('Fighter') && !tags.has('Tank'))) {
      return false
    }
    return (
      inferred.id === 'jungle' ||
      tags.has('Fighter') ||
      tags.has('Tank') ||
      tags.has('Assassin')
    )
  }
  if (roleId === 'top') {
    if (inferred.id === 'adc' || inferred.id === 'support') return false
    if (tags.has('Support') && !tags.has('Tank') && !tags.has('Fighter')) return false
    return (
      inferred.id === 'top' ||
      tags.has('Fighter') ||
      tags.has('Tank') ||
      (tags.has('Mage') && tags.has('Fighter'))
    )
  }
  return inferred.id === roleId
}

/**
 * @param {object} opts
 * @param {object[]} opts.pool runtime.player.champions
 * @param {object[]} opts.champions catalogue
 * @param {object[]} [opts.allies]
 * @param {object[]} [opts.enemies]
 * @param {object[]} [opts.bans]
 * @param {{ id: string, label: string } | null} [opts.role]
 * @param {string[]} [opts.styleTags]
 * @param {number} [opts.limit]
 */
export function rankPoolForDraft(opts) {
  const {
    pool = [],
    champions = [],
    allies = [],
    enemies = [],
    bans = [],
    role = null,
    styleTags = [],
    limit = 5,
  } = opts

  const banIds = new Set(bans.map((c) => c.id))
  const allyIds = new Set(allies.map((c) => c.id))
  const enemyIds = new Set(enemies.map((c) => c.id))
  const catalogByKey = new Map(champions.map((c) => [Number(c.key), c]))
  const catalogById = new Map(champions.map((c) => [c.id, c]))

  /** @type {object[]} */
  const ranked = []

  for (const row of pool) {
    const cat =
      catalogByKey.get(Number(row.championId)) ||
      catalogById.get(row.championKey) ||
      champions.find(
        (c) =>
          normalize(c.name) === normalize(row.championName) ||
          Number(c.key) === Number(row.championId),
      )
    if (!cat) continue
    if (banIds.has(cat.id) || allyIds.has(cat.id) || enemyIds.has(cat.id)) continue
    // Filtre de poste STRICT (plus de Leona mid grâce aux 50 games)
    if (role?.id && !fitsDraftRole(cat, role.id)) continue

    const games = Number(row.games) || 0
    const wr = Number(row.winRate) || 50
    const mastery = Number(row.masteryLevel) || 0
    const poolScore = games * 0.45 + (wr - 50) * 0.12 + mastery * 0.35

    const diff = rateDraftDifficulty(cat, enemies, styleTags)
    const tierBonus = { E: 2.2, D: 1.4, C: 0.4, B: -0.4, A: -1.2, S: -2.2 }[diff.tier] || 0
    const syn = allySynergyScore(cat, allies, role?.id || null)
    const roleBonus =
      role && inferRoleFromChampionTags(cat.tags || []).id === role.id ? 0.8 : 0

    const total = poolScore + tierBonus + syn.score + roleBonus

    ranked.push({
      catalog: cat,
      row,
      total,
      diff,
      syn,
      poolScore,
      fromPool: true,
    })
  }

  ranked.sort((a, b) => b.total - a.total)
  return ranked.slice(0, limit)
}

/**
 * Suggestions hors pool (poste + draft), plusieurs résultats.
 * @param {object} opts
 * @param {number} [opts.limit]
 */
export function suggestOffPoolPicks(opts) {
  const {
    champions = [],
    pool = [],
    allies = [],
    enemies = [],
    bans = [],
    role = null,
    styleTags = [],
    excludeIds = [],
    limit = 2,
  } = opts

  const poolIds = new Set(
    pool
      .map((r) => {
        const id = champions.find(
          (c) =>
            Number(c.key) === Number(r.championId) ||
            normalize(c.name) === normalize(r.championName),
        )?.id
        return id
      })
      .filter(Boolean),
  )
  const blocked = new Set([
    ...bans.map((c) => c.id),
    ...allies.map((c) => c.id),
    ...enemies.map((c) => c.id),
    ...excludeIds,
    ...poolIds,
  ])

  /** @type {object[]} */
  const candidates = []
  for (const cat of champions) {
    if (blocked.has(cat.id)) continue
    if (role?.id && !fitsDraftRole(cat, role.id)) continue
    const diff = rateDraftDifficulty(cat, enemies, styleTags)
    const syn = allySynergyScore(cat, allies, role?.id || null)
    const tierBonus = { E: 2.5, D: 1.6, C: 0.5, B: -0.2, A: -1, S: -2 }[diff.tier] || 0
    const total = tierBonus + syn.score * 1.1
    candidates.push({
      catalog: cat,
      row: { games: 0, winRate: null, masteryLevel: 0 },
      total,
      diff,
      syn,
      poolScore: 0,
      fromPool: false,
    })
  }
  candidates.sort((a, b) => b.total - a.total)
  return candidates.slice(0, Math.max(0, limit))
}

/** @deprecated préférer suggestOffPoolPicks */
export function suggestOffPoolPick(opts) {
  return suggestOffPoolPicks({ ...opts, limit: 1 })[0] || null
}

/**
 * @param {object} opts
 * @param {string} opts.raw
 * @param {object[]} opts.champions
 * @param {object | null} [opts.player]
 * @param {{ id: string, label: string } | null} [opts.preferredRole]
 * @param {object[]} [opts.memories]
 */
export function formatDraftPickReply(opts) {
  const { raw, champions = [], player = null, preferredRole = null, memories = [] } = opts
  const parsed = parseDraftTeams(raw, champions)
  const profile = getPoroMemoryProfile(memories, champions)
  const role = parsed.role || preferredRole || profile.role || null

  if (!parsed.enemies.length && !parsed.allies.length && !parsed.styleTags.length) {
    return (
      'Liste la draft pour que je te propose **5 picks** (tes 3 mains + hors pool).\n\n' +
      'Ex. :\n' +
      '• « Quel champion mid **contre** Yasuo Zed Katarina »\n' +
      '• « Qui jouer **avec** Ornn Lulu **contre** Malphite Syndra Jinx »\n' +
      '• « Draft ADC bans Aphelios Zeri, contre Ashe Nautilus »'
    )
  }

  const fullPool = player?.champions || []
  if (!fullPool.length) {
    return (
      'Pour croiser avec **ta champion pool**, synchronise tes parties sur la page LoL, puis réessaie.\n' +
      'En attendant, précise un style (ex. « pick contre tanks et heal »).'
    )
  }

  // Pool = 3 champions les plus joués (mains mémoire prioritaires), puis filtre poste.
  // Si un main est déjà ennemi / hors poste, on complète avec d'autres
  // champions joués qui matchent vraiment le rôle (ex. mid mage/assassin).
  const mains = topPlayedPool(fullPool, 3, profile.mains)
  let fromPool = rankPoolForDraft({
    pool: mains,
    champions,
    allies: parsed.allies,
    enemies: parsed.enemies,
    bans: parsed.bans,
    role,
    styleTags: parsed.styleTags,
    limit: 3,
  })
  if (fromPool.length < 3) {
    const mainKeys = new Set(
      mains.map((r) => String(r.championId ?? r.championKey ?? '').toLowerCase()).filter(Boolean),
    )
    const rest = fullPool.filter((r) => {
      const k = String(r.championId ?? r.championKey ?? '').toLowerCase()
      return k && !mainKeys.has(k)
    })
    if (rest.length) {
      const already = new Set(fromPool.map((r) => r.catalog.id))
      const extra = rankPoolForDraft({
        pool: rest,
        champions,
        allies: parsed.allies,
        enemies: parsed.enemies,
        bans: parsed.bans,
        role,
        styleTags: parsed.styleTags,
        limit: 3 - fromPool.length,
      }).filter((r) => !already.has(r.catalog.id))
      fromPool = [...fromPool, ...extra]
    }
  }

  // Toujours 5 propositions, dont au moins 2 hors pool
  const offNeeded = Math.max(2, 5 - fromPool.length)
  const offPool = suggestOffPoolPicks({
    champions,
    pool: fullPool,
    allies: parsed.allies,
    enemies: parsed.enemies,
    bans: parsed.bans,
    role,
    styleTags: parsed.styleTags,
    excludeIds: fromPool.map((r) => r.catalog.id),
    limit: offNeeded,
  })

  const picks = [...fromPool, ...offPool].slice(0, 5)
  if (!picks.length) {
    return (
      'Aucun champion cohérent pour ce poste / cette draft.\n' +
      'Vérifie le poste, les bans, ou synchronise plus de parties.'
    )
  }

  const lines = []
  lines.push('## Pick conseillé _(5 options)_')
  if (role) lines.push(`**Poste :** ${markRole(role.label)}`)
  const mainNames = mains
    .map((r) => r.championName)
    .filter(Boolean)
    .join(', ')
  if (mainNames) {
    lines.push(`**Tes 3 mains :** ${mainNames}`)
  }
  if (parsed.bans.length) {
    lines.push(`**Bans**\n` + markChipRow(parsed.bans.map((c) => markChamp(c.name, c.key))))
  }
  if (parsed.allies.length) {
    lines.push(`**Avec**\n` + markChipRow(parsed.allies.map((c) => markChamp(c.name, c.key))))
  }
  if (parsed.enemies.length) {
    lines.push(
      `**Contre**\n` + markChipRow(parsed.enemies.map((c) => markChamp(c.name, c.key))),
    )
  } else if (parsed.styleTags.length) {
    lines.push(`**Styles adverses :** ${parsed.styleTags.join(', ')}`)
  }

  const justifyCtx = {
    role,
    enemies: parsed.enemies,
    allies: parsed.allies,
  }

  const formatEntry = (r, i) => {
    const whyLines = buildPickJustification(r, justifyCtx)
    const badge = r.fromPool ? 'pool' : 'hors pool'
    const body = whyLines.map((w) => `_${w}_`).join('\n')
    return (
      `${i + 1}. ${markChamp(r.catalog.name, r.catalog.key)} · ${markTier(r.diff.tier)} · _${badge}_` +
      (body ? `\n${body}` : '')
    )
  }

  const poolPicks = picks.filter((p) => p.fromPool)
  const outside = picks.filter((p) => !p.fromPool)

  if (poolPicks.length) {
    lines.push('')
    lines.push('### Depuis tes mains')
    poolPicks.forEach((r, i) => lines.push(formatEntry(r, i)))
  }

  if (outside.length) {
    lines.push('')
    lines.push('### Hors pool')
    outside.forEach((r, i) => lines.push(formatEntry(r, i)))
  }

  const memTips = memoryCoachingHints(profile)
  if (memTips.length) {
    lines.push('')
    lines.push('### Mémoire')
    for (const t of memTips) lines.push(`• ${t}`)
  }

  lines.push('')
  lines.push(
    '_5 propositions : jusqu’à 3 depuis tes mains (si le poste colle) + au moins 2 hors pool. Tier **S**=rude → **E**=favorable._',
  )

  return lines.join('\n')
}

export { PORO_ROLES }
