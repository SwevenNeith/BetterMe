/**
 * Conseils Poro basés sur un match sélectionné (post-game BetterMe).
 * Pas de timeline Riot : pas d’horloge d’achat item / tour à la seconde.
 */

import {
  markChamp,
  markChipRow,
  markItem,
  markRole,
  markRune,
  markSpell,
  markStat,
  markTier,
} from './poroMarkup.js'
import { buildChampionBuildReply } from './poroBuilds.js'
import { getPoroMemoryProfile, memoryCoachingHints } from './poroMemoryProfile.js'
import { inferChampionMacroStyle } from './poroPlaystyle.js'
import { formatTimelineSection, timelineTips } from './poroTimeline.js'
import { findChampionInCatalog, resolvePoroItemNames } from '../../services/jeux/lolPoroData.js'
import { PORO_ROLES } from './poroRoles.js'
import {
  csPerMin,
  kdaRatio,
  killParticipationPct,
  participantItems,
  totalCs,
} from '../../services/jeux/riot.js'

const ROLE_LABELS = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  MID: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
  ADC: 'ADC',
  SUPPORT: 'Support',
}

/**
 * @param {string} pos
 */
function roleLabel(pos) {
  const key = String(pos || '').toUpperCase()
  return ROLE_LABELS[key] || pos || '—'
}

/**
 * @param {object} me
 * @param {object[]} enemies
 */
export function findLaneOpponent(me, enemies) {
  const myPos = String(me?.teamPosition || me?.individualPosition || '')
    .toUpperCase()
    .trim()
  if (!myPos || myPos === 'INVALID' || myPos === 'NONE') return null
  return (
    (enemies || []).find((e) => {
      const pos = String(e.teamPosition || e.individualPosition || '')
        .toUpperCase()
        .trim()
      return pos === myPos
    }) || null
  )
}

/**
 * @param {object | null} participant
 * @param {number} duration
 * @param {number} [teamKills]
 */
function summarizeFighter(participant, duration, teamKills = 0) {
  if (!participant) return null
  return {
    championName: String(participant.championName || '—'),
    championId: Number(participant.championId) || 0,
    role: roleLabel(participant.teamPosition || participant.individualPosition),
    roleRaw: String(participant.teamPosition || participant.individualPosition || ''),
    level: Number(participant.champLevel) || 0,
    kills: Number(participant.kills) || 0,
    deaths: Number(participant.deaths) || 0,
    assists: Number(participant.assists) || 0,
    kda: kdaRatio(participant),
    cs: totalCs(participant),
    csPerMin: csPerMin(participant, duration),
    gold: Number(participant.goldEarned) || 0,
    damage: Number(participant.totalDamageDealtToChampions) || 0,
    damageTaken: Number(participant.totalDamageTaken) || 0,
    vision: Number(participant.visionScore) || 0,
    kp: killParticipationPct(participant, teamKills),
    summoner1Id: Number(participant.summoner1Id) || 0,
    summoner2Id: Number(participant.summoner2Id) || 0,
    perks: participant.perks || null,
    itemIds: participantItems(participant),
  }
}

/**
 * @param {object | null} perks
 * @param {Map<number, object>} [runesById]
 * @param {object[]} [runeTrees]
 */
function resolveLoadoutRunes(perks, runesById, runeTrees = []) {
  if (!perks?.keystoneId && !perks?.perkIds?.length) return null
  const treeName = (id) =>
    runeTrees.find((t) => Number(t.id) === Number(id))?.name || `Arbre ${id || '—'}`
  const runeOf = (id) => {
    const entry = runesById?.get(Number(id))
    return {
      id: Number(id) || 0,
      name: entry?.name || `Rune #${id}`,
      icon: entry?.icon || null,
    }
  }
  const keystone = perks.keystoneId ? runeOf(perks.keystoneId) : null
  return {
    primaryTree: treeName(perks.primaryStyleId),
    subTree: treeName(perks.subStyleId),
    keystone,
    perks: (perks.perkIds || []).map((id) => runeOf(id)),
  }
}

/**
 * @param {number} id1
 * @param {number} id2
 * @param {Map<number, object>} [summonersByKey]
 */
function resolveSummons(id1, id2, summonersByKey) {
  const of = (id) => {
    const n = Number(id) || 0
    if (!n) return null
    const entry = summonersByKey?.get(n)
    return {
      id: n,
      name: entry?.name || `Spell #${n}`,
      image: entry?.image || null,
    }
  }
  return [of(id1), of(id2)].filter(Boolean)
}

/** @param {{ name?: string, championName?: string, id?: number } | string} entry */
function champMark(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return markChamp(entry)
  return markChamp(entry.name || entry.championName || '', entry.id || entry.championId)
}

/** @param {{ name?: string, id?: number, image?: string } | string} entry */
function summonMark(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return markSpell(entry)
  return markSpell(entry.name, entry.image)
}

/**
 * Snapshot compact pour Poro.
 * @param {object | null | undefined} match
 * @param {Map<number, { name: string, tags?: string[] }> | null} [itemsById]
 * @param {object[]} [champions]
 * @param {{ runesById?: Map<number, object>, runeTrees?: object[], summonersByKey?: Map<number, object> }} [catalogs]
 */
export function buildPoroMatchSnapshot(match, itemsById = null, champions = [], catalogs = {}) {
  if (!match?.participant) return null
  const meRaw = match.participant
  const participants = Array.isArray(match.participants) ? match.participants : []
  const myTeamId = Number(meRaw.teamId) || 0
  const allies = participants.filter((p) => Number(p.teamId) === myTeamId)
  const enemies = participants.filter((p) => Number(p.teamId) !== myTeamId)

  const duration = Number(match.gameDuration) || 0
  const minutes = Math.max(1, duration / 60)
  const meBase = summarizeFighter(meRaw, duration, match.teamKills)
  if (!meBase) return null

  const items = resolvePoroItemNames(meBase.itemIds, itemsById)
  const runes = resolveLoadoutRunes(meRaw.perks, catalogs.runesById, catalogs.runeTrees)
  const summons = resolveSummons(meRaw.summoner1Id, meRaw.summoner2Id, catalogs.summonersByKey)

  const laneOppRaw = findLaneOpponent(meRaw, enemies)
  const laneOpponent = laneOppRaw
    ? {
        ...summarizeFighter(laneOppRaw, duration, 0),
        tags:
          findChampionInCatalog(laneOppRaw.championName, champions)?.tags?.map(String) || [],
        summons: resolveSummons(
          laneOppRaw.summoner1Id,
          laneOppRaw.summoner2Id,
          catalogs.summonersByKey,
        ),
        runes: resolveLoadoutRunes(laneOppRaw.perks, catalogs.runesById, catalogs.runeTrees),
      }
    : null

  const enemyTags = new Set()
  for (const e of enemies) {
    const cat = champions?.length ? findChampionInCatalog(e.championName, champions) : null
    for (const t of cat?.tags || []) enemyTags.add(String(t))
  }

  const teamObj = match.teamObjectives || null
  const myObj = teamObj?.[myTeamId] || null
  const enemyObj = teamObj
    ? Object.entries(teamObj).find(([id]) => Number(id) !== myTeamId)?.[1]
    : null

  return {
    matchId: match.matchId || null,
    win: meRaw.win === true,
    duration,
    minutes,
    queueId: match.queueId ?? null,
    me: {
      ...meBase,
      goldPerMin: meBase.gold / minutes,
      turretKills: meRaw.turretKills != null ? Number(meRaw.turretKills) : null,
      inhibitorKills: meRaw.inhibitorKills != null ? Number(meRaw.inhibitorKills) : null,
      items,
      runes,
      summons,
      teamId: myTeamId,
      tags: findChampionInCatalog(meBase.championName, champions)?.tags?.map(String) || [],
    },
    laneOpponent,
    allies: allies
      .map((p) => ({
        name: String(p.championName || '').trim(),
        id: Number(p.championId) || 0,
      }))
      .filter((c) => c.name),
    enemies: enemies
      .map((p) => ({
        name: String(p.championName || '').trim(),
        id: Number(p.championId) || 0,
      }))
      .filter((c) => c.name),
    enemyTags: [...enemyTags],
    objectives: {
      allyTowers: myObj?.tower ?? null,
      enemyTowers: enemyObj?.tower ?? null,
      allyDragons: myObj?.dragon ?? null,
      enemyDragons: enemyObj?.dragon ?? null,
      allyBarons: myObj?.baron ?? null,
      enemyBarons: enemyObj?.baron ?? null,
    },
  }
}

/**
 * @param {string} raw
 * @param {boolean} [hasMatch]
 */
export function isMatchAdviceQuery(raw, hasMatch = false) {
  const n = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const explicitMatch =
    n.includes('cette partie') ||
    n.includes('cette game') ||
    n.includes('ce match') ||
    n.includes('ma partie') ||
    n.includes('mon match') ||
    n.includes('analyse la partie') ||
    n.includes('analyse mon match') ||
    n.includes('analyse cette') ||
    n.includes('debrief') ||
    n.includes('debriefe') ||
    n.includes('contre cette') ||
    n.includes('vs cette')

  if (explicitMatch) return true
  if (!hasMatch) return false

  // Follow-ups pendant qu’un match est lié (ex. « quels items j’aurais dû build ? »)
  const asksItemsOrBuild =
    n.includes('item') || n.includes('build') || n.includes('stuff')

  return (
    asksItemsOrBuild ||
    n.includes('pertinen') ||
    n.includes('devrais') ||
    n.includes('fallait') ||
    n.includes('aurais') ||
    n.includes('aurait') ||
    n.includes('plutot') ||
    n.includes('a la place') ||
    n.includes('autre chose') ||
    n.includes('recommande') ||
    n.includes('conseil') ||
    n.includes('avais besoin') ||
    n.includes('etait utile') ||
    n.includes('etait-il') ||
    n.includes('mon kda') ||
    n.includes('mon cs') ||
    n.includes('mon gold') ||
    n.includes('mes items') ||
    n.includes('mon farm') ||
    n.includes('antiheal') ||
    n.includes('anti-heal') ||
    n.includes('grievous') ||
    n.includes('zhonya') ||
    n.includes('sablier') ||
    n.includes('rune') ||
    n.includes('keystone') ||
    n.includes('pierre cle') ||
    n.includes('summon') ||
    n.includes('invocateur') ||
    n.includes('flash') ||
    n.includes('teleport') ||
    n.includes('matchup') ||
    n.includes('lane') ||
    n.includes('mon adversaire') ||
    n.includes('lane opponent') ||
    n.includes('1v1') ||
    n.includes('en lane') ||
    n.includes('timeline') ||
    (n.includes('est-ce que') &&
      (n.includes('item') ||
        n.includes('build') ||
        n.includes('utile') ||
        n.includes('pertinen') ||
        n.includes('rune') ||
        n.includes('bien')))
  )
}

/**
 * Tags de style déduits de la compo adverse du match (pour conseils d’items).
 * @param {ReturnType<typeof buildPoroMatchSnapshot>} snap
 * @returns {string[]}
 */
export function inferEnemyStyleTags(snap) {
  /** @type {Set<string>} */
  const tags = new Set()
  for (const t of snap?.enemyTags || []) {
    const x = String(t).toLowerCase()
    if (x === 'tank') tags.add('tank')
    if (x === 'assassin') tags.add('assassin')
    if (x === 'marksman') tags.add('adc')
    if (x === 'mage') tags.add('ap')
    if (x === 'fighter') tags.add('ad')
    if (x === 'support') tags.add('cc')
  }

  const names = (snap?.enemies || [])
    .map((e) => (typeof e === 'string' ? e : e?.name || ''))
    .join(' ')

  if (
    /soraka|sona|nami|yuumi|mundo|aatrox|warwick|sylas|vladimir|swain|briar|nilah|sett|volibear|soraka/i.test(
      names,
    )
  ) {
    tags.add('heal')
  }
  if (/malphite|leona|nautilus|amumu|sejuani|ornn|sion|zac|thresh|blitz|rakan|alistar/i.test(names)) {
    tags.add('cc')
  }
  if (/ezreal|xerath|ziggs|jayce|varus|caitlyn|velkoz|lux|zoe/i.test(names)) {
    tags.add('poke')
  }

  return [...tags]
}

/**
 * Hints légers depuis les derniers messages (même conversation).
 * @param {{ role?: string, content?: string, meta?: object }[]} [messages]
 */
export function getConversationHints(messages = []) {
  const recent = (messages || []).slice(-10)
  const lastAssistant = [...recent].reverse().find((m) => m.role === 'assistant')
  const intents = recent
    .filter((m) => m.role === 'assistant' && m.meta?.intent)
    .map((m) => String(m.meta.intent))
  return {
    lastIntent: lastAssistant?.meta?.intent ? String(lastAssistant.meta.intent) : null,
    hadMatchAdvice: intents.includes('match_advice'),
    recentUserTexts: recent
      .filter((m) => m.role === 'user')
      .map((m) => String(m.content || ''))
      .slice(-4),
  }
}

/**
 * Build alternatif personnalisé (ton champion + compo adverse), pas des catégories génériques.
 * @param {ReturnType<typeof buildPoroMatchSnapshot>} snap
 * @param {Map<number, { name: string }> | null} [itemsById]
 * @param {string} [patch]
 */
export function formatMatchItemAlternatives(snap, itemsById = null, patch = '') {
  const header = matchHeader(snap)
  const me = snap.me
  const enemyBlock =
    `**Adversaires**\n` +
    markChipRow((snap.enemies || []).map((c) => champMark(c)))
  const built =
    me.items?.length > 0
      ? `**Tu avais**\n` + markChipRow(me.items.map((it) => markItem(it.name, it.id)))
      : '**Tu avais**\n—'

  const styleTags = inferEnemyStyleTags(snap)
  const roleId =
    PORO_ROLES.find((r) => r.label === me.role || r.id === String(me.role || '').toLowerCase())
      ?.id ||
    ({ Top: 'top', Jungle: 'jungle', Mid: 'mid', ADC: 'adc', Support: 'support' }[me.role] ||
      'mid')
  const role = { id: roleId, label: me.role || 'Mid' }

  const enemyNames = (snap.enemies || []).map((e) =>
    typeof e === 'string' ? e : e?.name || '',
  )
  const lane = snap.laneOpponent
  const champion = {
    name: me.championName,
    tags: me.tags || [],
    id: me.championName,
  }

  const buildBlock = buildChampionBuildReply({
    champion,
    role,
    enemy: lane
      ? { name: lane.championName, tags: lane.tags || [] }
      : null,
    enemyStyleTags: styleTags,
    enemyNames,
    ownedItemIds: (me.items || []).map((it) => it.id),
    itemsById,
    patch,
    compact: true,
  })

  const extras = []
  if (me.deaths >= 6) {
    extras.push('Beaucoup de morts → remonte un item défensif (Zhonya / GA / tabis) plus haut dans l’ordre.')
  }
  if (lane && me.gold - lane.gold < -800) {
    extras.push(
      `Lane en retard vs ${lane.championName} → privilégie scale / survie plutôt que full damage dry.`,
    )
  }
  if (styleTags.includes('heal')) {
    extras.push('Sustain adverse détecté → anti-heal dès que leurs soins portent les fights.')
  }

  return (
    header +
    `\n${enemyBlock}\n\n${built}\n\n---\n\n` +
    buildBlock +
    (extras.length ? `\n\n### Lecture\n${extras.map((t) => `• ${t}`).join('\n')}` : '') +
    `\n\n_Poro n’a pas l’horloge d’achat : l’ordre reste une estimation pour **${me.championName}**._`
  )
}

/**
 * @param {ReturnType<typeof buildPoroMatchSnapshot>} snap
 */
function matchHeader(snap) {
  const me = snap.me
  const style = inferChampionMacroStyle(me.championName, me.tags, me.role)
  const resultLabel = snap.win ? '**Victoire**' : '**Défaite**'
  // Pas de KDA/CS/Gold/KP : déjà visibles sur la fiche match à côté
  return (
    `## ${markChamp(me.championName, me.championId)} · ${markRole(me.role)}\n` +
    `${resultLabel} · ${Math.round(snap.minutes)} min · _${style.label}_\n` +
    `_${style.tip}_\n`
  )
}

/**
 * Note de difficulté du matchup **pour toi** sur cette partie (S = très dur, E = très facile).
 * Basée sur les écarts gold/CS/dégâts/KDA + tags (pas un tier list méta scrapé).
 * @param {object} me snapshot.me
 * @param {object} lane snapshot.laneOpponent
 * @returns {{ tier: string, label: string, score: number, reasons: string[] }}
 */
export function rateLaneMatchupTier(me, lane) {
  if (!me || !lane) {
    return {
      tier: '?',
      label: 'Inconnu',
      score: 0,
      reasons: ['Adversaire de lane non identifié.'],
    }
  }

  let score = 0
  /** @type {string[]} */
  const reasons = []

  const goldDiff = (Number(me.gold) || 0) - (Number(lane.gold) || 0)
  const csDiff = (Number(me.cs) || 0) - (Number(lane.cs) || 0)
  const dmgDiff = (Number(me.damage) || 0) - (Number(lane.damage) || 0)
  const kdaDiff = (Number(me.kda) || 0) - (Number(lane.kda) || 0)
  const deathDiff = (Number(me.deaths) || 0) - (Number(lane.deaths) || 0)

  // score élevé = plus dur pour toi
  if (goldDiff <= -1500) {
    score += 2.2
    reasons.push(`Fort retard gold (${Math.round(goldDiff)})`)
  } else if (goldDiff <= -600) {
    score += 1.2
    reasons.push(`Retard gold (${Math.round(goldDiff)})`)
  } else if (goldDiff >= 1500) {
    score -= 2
    reasons.push(`Gros lead gold (+${Math.round(goldDiff)})`)
  } else if (goldDiff >= 600) {
    score -= 1
    reasons.push(`Lead gold (+${Math.round(goldDiff)})`)
  }

  if (csDiff <= -30) {
    score += 1.4
    reasons.push(`CS nettement derrière (${csDiff})`)
  } else if (csDiff <= -12) {
    score += 0.7
    reasons.push(`CS en retard (${csDiff})`)
  } else if (csDiff >= 30) {
    score -= 1.2
    reasons.push(`CS nettement devant (+${csDiff})`)
  } else if (csDiff >= 12) {
    score -= 0.6
    reasons.push(`CS devant (+${csDiff})`)
  }

  if (kdaDiff <= -1.5 || deathDiff >= 4) {
    score += 1.3
    reasons.push('KDA / morts défavorables en lane')
  } else if (kdaDiff >= 1.5 && deathDiff <= -2) {
    score -= 1.1
    reasons.push('Tu as dominé les exchanges')
  }

  if (dmgDiff <= -5000) {
    score += 0.6
    reasons.push('Moins de dégâts que lui')
  } else if (dmgDiff >= 5000) {
    score -= 0.5
    reasons.push('Plus de dégâts que lui')
  }

  const myTags = new Set((me.tags || []).map(String))
  const laneTags = new Set((lane.tags || []).map(String))

  // Archétypes souvent pénibles
  if (laneTags.has('Assassin') && (myTags.has('Mage') || myTags.has('Marksman'))) {
    score += 0.8
    reasons.push('Archétype assassin souvent punitif pour toi')
  }
  if (laneTags.has('Tank') && myTags.has('Assassin')) {
    score += 0.7
    reasons.push('Tank lane vs assassin = all-in difficile')
  }
  if (laneTags.has('Mage') && myTags.has('Assassin')) {
    score -= 0.3
  }

  // Clamp → tier
  const tiers = [
    { max: -2.2, tier: 'E', label: 'Très facile pour toi' },
    { max: -1.1, tier: 'D', label: 'Facile' },
    { max: -0.3, tier: 'C', label: 'Plutôt favorable' },
    { max: 0.5, tier: 'B', label: 'Équilibré' },
    { max: 1.4, tier: 'A', label: 'Difficile' },
    { max: Infinity, tier: 'S', label: 'Très difficile pour toi' },
  ]
  const hit = tiers.find((t) => score <= t.max) || tiers[tiers.length - 1]
  if (!reasons.length) reasons.push('Écarts de lane proches — matchup neutre sur cette partie.')

  return { tier: hit.tier, label: hit.label, score, reasons: reasons.slice(0, 4) }
}

/**
 * Heuristique keystone vs tags du lane opponent.
 * @param {string} keystoneName
 * @param {string[]} laneTags
 * @param {string[]} myTags
 */
export function assessKeystoneVsLane(keystoneName, laneTags = [], myTags = []) {
  const k = String(keystoneName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const tags = new Set(laneTags.map(String))
  const mine = new Set(myTags.map(String))

  if (!k) {
    return { score: 0, tip: 'Keystone introuvable sur ce résumé (recharge le match après deploy riot).' }
  }

  // Burst / poke keystones
  if (/electrocute|electrocution|dark harvest|moisson|comet|comete|first strike|premier|arcane/.test(k)) {
    if (tags.has('Tank')) {
      return {
        score: -1,
        tip: `${markSpell(keystoneName)} est **moyen** vs tank lane : peu de procs utiles. Préfère souvent Conqueror / Lethal / Grasp / Phase Rush selon le kit.`,
      }
    }
    if (tags.has('Assassin') || tags.has('Mage') || tags.has('Marksman')) {
      return {
        score: 1,
        tip: `${markSpell(keystoneName)} est **cohérent** vs squishy / burst lane : tu cherches des fenêtres courtes.`,
      }
    }
  }

  if (/conqueror|conquerant|lethal|tempo|grasp|emprise|aftershock|secousse|glacial|phase rush|ru[eé]e/.test(k)) {
    if (tags.has('Tank') || tags.has('Fighter')) {
      return {
        score: 1,
        tip: `${markSpell(keystoneName)} est **bien adapté** aux trades longs / frontlane.`,
      }
    }
    if (tags.has('Assassin') && /conqueror|conquerant|grasp|emprise/.test(k)) {
      return {
        score: 0,
        tip: `${markSpell(keystoneName)} peut marcher, mais vs assassin tu subis souvent le all-in avant de stack — Electrocute / Fleet / First Strike sont parfois plus safe.`,
      }
    }
  }

  if (/fleet|pieds|guardian|gardien|aery|invoker|invocateur|summon aery/.test(k)) {
    return {
      score: 1,
      tip: `${markSpell(keystoneName)} aide la **lane stable** (sustain / poke soft) — bon choix si tu ne cherches pas le 100-0.`,
    }
  }

  if (mine.has('Mage') && tags.has('Assassin') && /comet|electrocute|first strike/.test(k)) {
    return {
      score: 1,
      tip: `Contre un assassin mid, une keystone **burst / poke** comme ${markSpell(keystoneName)} est souvent pertinente si tu respectes les cooldowns.`,
    }
  }

  return {
    score: 0,
    tip: `${markSpell(keystoneName)} : pas de red flag évident vs cette lane — juge aussi ton style (roam vs farm).`,
  }
}

/**
 * @param {ReturnType<typeof buildPoroMatchSnapshot>} snap
 */
export function formatRuneAdviceReply(snap) {
  const header = matchHeader(snap)
  const me = snap.me
  if (!me.runes?.keystone) {
    return (
      header +
      `\n### Runes\n` +
      `_Runes absentes du résumé. Déploie \`riot\`, recharge la liste de matchs, rouvre le détail, puis réessaie._`
    )
  }

  const lane = snap.laneOpponent
  const assess = assessKeystoneVsLane(
    me.runes.keystone.name,
    lane?.tags || snap.enemyTags,
    me.tags || [],
  )

  const summonsLine = me.summons?.length
    ? `**Summons**\n` + markChipRow(me.summons.map((s) => summonMark(s)))
    : '**Summons**\n—'

  const laneLine = lane
    ? `**Lane adverse :** ${markChamp(lane.championName, lane.championId)} ${markRole(lane.role)}` +
      (lane.tags?.length ? ` (${lane.tags.join(', ')})` : '')
    : `_Lane opponent non identifié (poste Riot manquant)._`

  const alt =
    assess.score < 0
      ? `\n\n### Alternatives keystone (ordre indicatif vs cette lane)\n` +
        `1. ${markSpell('Conqueror / Lethal Tempo / Grasp')} — trades longs\n` +
        `2. ${markSpell('Phase Rush')} — désengage / kite\n` +
        `3. ${markSpell('Fleet Footwork')} — sustain lane\n` +
        `_Choix exact selon ton champion ; Poro n’a pas encore le winrate méta scrapé._`
      : ''

  return (
    header +
    `\n### Runes & summons\n` +
    `**Keystone** ${markRune(me.runes.keystone.name, me.runes.keystone.icon)}\n` +
    `**Arbres** ${me.runes.primaryTree} / ${me.runes.subTree}\n` +
    summonsLine +
    `\n${laneLine}\n\n` +
    assess.tip +
    alt
  )
}

/**
 * @param {ReturnType<typeof buildPoroMatchSnapshot>} snap
 */
export function formatLaneMatchupReply(snap) {
  const header = matchHeader(snap)
  const me = snap.me
  const lane = snap.laneOpponent
  if (!lane) {
    return (
      header +
      `\n### Matchup lane\n` +
      `_Impossible d’identifier ton adversaire de lane (teamPosition manquant). Recharge le match après deploy._\n` +
      `Adversaires : ${snap.enemies.map((c) => champMark(c)).join(' ') || '—'}`
    )
  }

  const goldDiff = me.gold - lane.gold
  const csDiff = me.cs - lane.cs
  const dmgDiff = me.damage - lane.damage
  const tier = rateLaneMatchupTier(me, lane)
  const verdict =
    goldDiff > 800 && csDiff > 15
      ? '_Tu as **gagné** la lane sur les indicateurs gold/CS._'
      : goldDiff < -800 || csDiff < -20
        ? '_Tu as **perdu** la lane sur gold/CS — priorise farm safe + TP/roam timers._'
        : '_Lane **égale** sur les gros chiffres — zoome les morts / plates._'

  const tips = []
  const tags = new Set(lane.tags || [])
  if (tags.has('Assassin')) tips.push('Vs assassin : ward deep, respect ulti, item défensif dès snowball adverse.')
  if (tags.has('Tank')) tips.push('Vs tank : pénétration / %HP plus tôt ; évite les trades sans stacks.')
  if (tags.has('Mage')) tips.push('Vs mage : shove + roam ou crash pour reset ; ne te fais pas chipper sous tour.')
  if (tags.has('Marksman')) tips.push('Vs marksman mid/bot : all-in windows courts, anti-kite (phase / gap closer).')
  if (!tips.length) tips.push('Identifie sa win condition (poke, all-in, scale) et refuse le pattern fort.')

  const runeBit = me.runes?.keystone
    ? assessKeystoneVsLane(me.runes.keystone.name, lane.tags, me.tags).tip
    : '_Keystone non dispo sur ce résumé._'

  return (
    header +
    `\n### Matchup\n` +
    `${markChamp(me.championName, me.championId)} vs ${markChamp(lane.championName, lane.championId)} · ${markRole(lane.role)}\n` +
    `${markTier(tier.tier)}\n` +
    tier.reasons.map((r) => `• ${r}`).join('\n') +
    `\n\n---\n\n` +
    `### Écarts\n` +
    markStat('Δ gold', `${goldDiff >= 0 ? '+' : ''}${Math.round(goldDiff)}`) +
    '\n' +
    markStat('Δ CS', `${csDiff >= 0 ? '+' : ''}${csDiff}`) +
    '\n' +
    markStat('Δ dmg', `${dmgDiff >= 0 ? '+' : ''}${Math.round(dmgDiff)}`) +
    `\n\n${verdict}\n\n---\n\n` +
    `### Pistes\n${tips.map((t) => `• ${t}`).join('\n')}\n\n` +
    `### Keystone vs cette lane\n${runeBit}\n\n` +
    `_Échelle : **S** très dur → **E** très facile (sur *cette* partie)._`
  )
}

/**
 * @param {ReturnType<typeof buildPoroMatchSnapshot>} snap
 * @param {string} raw
 * @param {Map<number, object> | null} [itemsById]
 * @param {object | null} [timeline]
 * @param {{ memories?: object[], champions?: object[] }} [ctx]
 */
export function formatMatchAdviceReply(
  snap,
  raw,
  itemsById = null,
  timeline = null,
  ctx = {},
) {
  if (!snap) {
    return (
      'Pour un conseil **contextuel**, ouvre une partie (détail), puis **Analyser avec Poro**.\n' +
      'Ex. : « analyse cette partie », « matchup lane », « ma rune ? ».'
    )
  }

  const n = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (
    n.includes('rune') ||
    n.includes('keystone') ||
    n.includes('pierre cle') ||
    n.includes('summon') ||
    n.includes('invocateur') ||
    (n.includes('flash') && n.includes('pertinen'))
  ) {
    return formatRuneAdviceReply(snap)
  }

  if (
    n.includes('matchup') ||
    n.includes('1v1') ||
    n.includes('mon adversaire') ||
    n.includes('lane opponent') ||
    (n.includes('lane') && !n.includes('plan')) ||
    n.includes('en lane')
  ) {
    return formatLaneMatchupReply(snap)
  }

  const header = matchHeader(snap)
  const me = snap.me
  const allyBlock =
    `**Alliés**\n` + markChipRow(snap.allies.map((c) => champMark(c)))
  const enemyBlock =
    `**Adversaires**\n` + markChipRow(snap.enemies.map((c) => champMark(c)))

  const itemBlock = me.items.length
    ? `**Items**\n` + markChipRow(me.items.map((it) => markItem(it.name, it.id)))
    : '**Items**\n—'

  const runeBlock = me.runes?.keystone
    ? [
        `**Runes**\n` +
          markChipRow([
            markRune(me.runes.keystone.name, me.runes.keystone.icon),
            markRole(`${me.runes.primaryTree} / ${me.runes.subTree}`),
          ]),
        me.summons?.length
          ? `**Summons**\n` + markChipRow(me.summons.map((s) => summonMark(s)))
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : `_Runes non chargées (deploy riot + recharger le match)._`

  if (n.includes('cs') || n.includes('farm') || n.includes('csing')) {
    const target = me.role === 'ADC' || me.role === 'Mid' ? 7 : me.role === 'Jungle' ? 6 : 5.5
    const ok = me.csPerMin >= target
    return (
      header +
      `\n### Farm\n` +
      `Tu as **${me.csPerMin.toFixed(1)} CS/min**.\n` +
      `Cible indicative poste ~${target} en ${markRole(me.role)}.\n` +
      (ok
        ? `_Correct / bon par rapport à la cible poste._`
        : `_En-dessous de la cible : priorise les vagues + sides plutôt que les plays dry._`) +
      (snap.laneOpponent
        ? `\nΔ CS vs ${markChamp(snap.laneOpponent.championName, snap.laneOpponent.championId)} : **${me.cs - snap.laneOpponent.cs}**.`
        : '')
    )
  }

  if (n.includes('kda') || n.includes('mort') || n.includes('death') || n.includes('kp')) {
    const ratio = me.kda
    return (
      header +
      `\n### KDA\n` +
      `Ratio **${ratio.toFixed(2)}** (${me.kills}/${me.deaths}/${me.assists})` +
      (me.kp != null ? ` · KP **${me.kp}%**` : '') +
      `\n` +
      (me.deaths >= 8
        ? `_Beaucoup de morts : spacing / vision / cooldowns adverses à revoir avant d’itemiser plus offensif._`
        : ratio >= 3
          ? `_Impact solide — tu pouvais itemiser pour convertir (pénétration / objectif)._`
          : `_Mitigé : un item défensif situationnel (Zhonya / GA / tabis) aurait pu stabiliser._`)
    )
  }

  if (n.includes('gold') || n.includes('or ') || n.includes("d'or") || n.includes('timeline')) {
    return (
      header +
      `\n### Gold\n` +
      markStat('Fin de partie', `${Math.round(me.gold)}g (~${me.goldPerMin.toFixed(0)}/min)`) +
      (snap.laneOpponent
        ? `\n${markStat('Δ vs lane', `${Math.round(me.gold - snap.laneOpponent.gold)}g`)}`
        : '') +
      `\n\n---` +
      `\n\n${formatTimelineSection(timeline, me)}`
    )
  }

  const asksAntiheal =
    n.includes('antiheal') ||
    n.includes('anti-heal') ||
    n.includes('grievous') ||
    n.includes('morello') ||
    n.includes('chempunk') ||
    n.includes('thorn') ||
    n.includes('ronces') ||
    n.includes('mortal')

  const healThreat = snap.enemies.some((entry) =>
    /soraka|sona|nami|yuumi|mundo|aatrox|warwick|sylas|vladimir|swain|briar|nilah|sett|volibear/i.test(
      entry?.name || entry || '',
    ),
  )
  const hasAntiheal = me.items.some((it) =>
    /morello|chimico|ronces|epine|mortal|sanguinaire|chempunk|thorn|exécution/i.test(it.name),
  )

  if (asksAntiheal || (n.includes('pertinen') && (n.includes('heal') || n.includes('soin')))) {
    const alts = healThreat
      ? `\n\n### Si tu n’avais pas d’anti-heal — alternatives (ordre)\n` +
        `1. ${markItem('Morellonomicon')} / ${markItem('Épée dentelée chimico-punk')}\n` +
        `2. ${markItem('Cotte épineuse')} (si tu tank)\n` +
        `3. ${markItem('Rappel mortel')} (crit ADC)\n`
      : ''
    return (
      header +
      `\n### Anti-heal\n` +
      `${enemyBlock}\n` +
      (healThreat
        ? `_Oui, l’anti-heal était **pertinent** contre cette compo._\n`
        : `_Pas prioritaire : peu de menaces de soins évidentes._\n`) +
      (hasAntiheal
        ? `Tu l’avais dans le build.`
        : healThreat
          ? `_Tu ne l’avais pas — souvent 1er–2e item situationnel._`
          : `_Tu ne l’avais pas, cohérent si le sustain ne gênait pas._`) +
      alts +
      `\n_Sans timeline : Poro ne sait pas si tu l’as acheté trop tard après un fight._`
    )
  }

  if (n.includes('zhonya') || n.includes('sablier') || n.includes('ange gardien') || n.includes(' ga')) {
    const hasDef = me.items.some((it) => /zhonya|sablier|gardien|ange/i.test(it.name))
    const fedDeaths = me.deaths >= 5
    return (
      header +
      `\n### Item défensif\n` +
      (fedDeaths || snap.enemyTags.includes('Assassin') || snap.laneOpponent?.tags?.includes('Assassin')
        ? `_Face à du burst / beaucoup de morts, Zhonya / GA est souvent **justifié**._\n`
        : `_Pas obligatoire si tu spacing bien ; utile dès qu’un assassin snowball._\n`) +
      (hasDef ? `Tu l’avais dans le build.` : `Tu ne l’avais pas sur ce match.`)
    )
  }

  // « Quels items j’aurais dû build ? » → utilise la compo adverse du match lié
  if (
    n.includes('item') ||
    n.includes('build') ||
    n.includes('stuff') ||
    n.includes('aurais') ||
    n.includes('plutot') ||
    n.includes('a la place')
  ) {
    return formatMatchItemAlternatives(snap, itemsById)
  }

  const style = inferChampionMacroStyle(me.championName, me.tags, me.role)
  const tips = []
  if (me.csPerMin < 5.5 && style.preferCsGold) {
    tips.push('Farm bas pour un profil qui doit scaler → Wave management avant les plays dry.')
  } else if (me.csPerMin < 4.5) {
    tips.push('Farm très bas même hors profil carry → check les morts / resets.')
  }
  if (me.deaths >= 7) tips.push('Trop de morts → item défensif / vision plus tôt.')
  if (healThreat && !hasAntiheal) tips.push('Sustain adverse sans anti-heal → le prendre plus tôt.')
  if (snap.laneOpponent && me.gold - snap.laneOpponent.gold < -1000) {
    tips.push(
      `Lane en retard vs ${snap.laneOpponent.championName} → joue pour scale / roam, pas le 1v1 dry.`,
    )
  }
  if (me.kp != null && me.kp < 40) {
    if (!style.kpRelevant) {
      tips.push(
        `KP ${me.kp}% : **peu discriminant** pour un ${style.label} — regarde gold/CS/tours plutôt.`,
      )
    } else {
      tips.push(`KP bas (${me.kp}%) pour un profil ${style.label} → plus de joins sur objectifs.`)
    }
  }
  for (const t of timelineTips(timeline, style)) tips.push(t)

  const profile = getPoroMemoryProfile(ctx.memories || [], ctx.champions || [])
  for (const t of memoryCoachingHints(profile)) tips.push(t)

  if (!tips.length) tips.push('Indicateurs stables — zoome matchup lane ou runes pour plus de détail.')

  const tier = snap.laneOpponent ? rateLaneMatchupTier(me, snap.laneOpponent) : null
  const matchupLine = snap.laneOpponent
    ? `\n**Matchup** ${markChamp(snap.laneOpponent.championName, snap.laneOpponent.championId)} · ${markRole(snap.laneOpponent.role)} · ${markTier(tier.tier)}`
    : ''

  return (
    header +
    `\n---\n\n` +
    `### Compos\n${allyBlock}\n\n${enemyBlock}${matchupLine}\n\n` +
    `### Stuff\n${itemBlock}\n\n${runeBlock}\n\n` +
    `---\n\n` +
    `${formatTimelineSection(timeline, { ...me, teamId: me.teamId })}\n\n` +
    `---\n\n` +
    `### Lecture rapide\n` +
    tips.map((t) => `• ${t}`).join('\n') +
    `\n\n_Essaie aussi : « matchup lane », « ma rune ? », « mon gold ? », « Quiz »._`
  )
}
