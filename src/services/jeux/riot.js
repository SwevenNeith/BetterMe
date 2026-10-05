import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'
import { fetchWithTimeout } from '../../utils/common/fetchWithTimeout.js'

const RIOT_FUNCTION_URL = `${supabaseUrl}/functions/v1/riot`

/** Version Data Dragon (icônes). */
export const LOL_DDRAGON_VERSION = '15.20.1'

export const LOL_PLATFORM_OPTIONS = [
  { id: 'euw1', label: 'EU West (euw1)', routing: 'europe' },
  { id: 'eun1', label: 'EU Nordic & East (eun1)', routing: 'europe' },
  { id: 'na1', label: 'North America (na1)', routing: 'americas' },
  { id: 'kr', label: 'Korea (kr)', routing: 'asia' },
  { id: 'br1', label: 'Brazil (br1)', routing: 'americas' },
  { id: 'la1', label: 'LAN (la1)', routing: 'americas' },
  { id: 'la2', label: 'LAS (la2)', routing: 'americas' },
  { id: 'jp1', label: 'Japan (jp1)', routing: 'asia' },
  { id: 'oc1', label: 'Oceania (oc1)', routing: 'sea' },
  { id: 'tr1', label: 'Turkey (tr1)', routing: 'europe' },
  { id: 'ru', label: 'Russia (ru)', routing: 'europe' },
]

/** Queues LoL les plus courantes. */
export const LOL_QUEUE_LABELS = {
  400: 'Draft Pick',
  420: 'Classé Solo/Duo',
  430: 'Blind Pick',
  440: 'Classé Flex',
  450: 'ARAM',
  490: 'Quickplay',
  700: 'Clash',
  900: 'URF',
  1020: 'One for All',
  1300: 'Nexus Blitz',
  1400: 'Ultimate Spellbook',
  1700: 'Arena',
  1900: 'URF',
}

export const LOL_ROLE_LABELS = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
  NONE: '—',
  Invalid: '—',
}

/**
 * Baselines approximatives « même elo / même rôle » (partie ~30 min).
 * Sources : ordres de grandeur communautaires (op.gg / u.gg), pas une API officielle.
 */
const ELO_BASELINES = {
  IRON: {
    TOP: { damage: 16000, taken: 28000, gold: 10500, vision: 18, cs: 150 },
    JUNGLE: { damage: 14000, taken: 26000, gold: 10000, vision: 28, cs: 120 },
    MIDDLE: { damage: 18000, taken: 22000, gold: 11000, vision: 16, cs: 160 },
    BOTTOM: { damage: 17000, taken: 20000, gold: 11500, vision: 14, cs: 170 },
    UTILITY: { damage: 9000, taken: 22000, gold: 8500, vision: 45, cs: 35 },
  },
  BRONZE: {
    TOP: { damage: 18000, taken: 29000, gold: 11000, vision: 20, cs: 160 },
    JUNGLE: { damage: 15500, taken: 27000, gold: 10500, vision: 32, cs: 130 },
    MIDDLE: { damage: 20000, taken: 23000, gold: 11500, vision: 18, cs: 170 },
    BOTTOM: { damage: 19000, taken: 21000, gold: 12000, vision: 15, cs: 180 },
    UTILITY: { damage: 10000, taken: 23000, gold: 8800, vision: 52, cs: 38 },
  },
  SILVER: {
    TOP: { damage: 20000, taken: 30000, gold: 11500, vision: 22, cs: 175 },
    JUNGLE: { damage: 17000, taken: 28000, gold: 11000, vision: 38, cs: 140 },
    MIDDLE: { damage: 22000, taken: 24000, gold: 12000, vision: 20, cs: 185 },
    BOTTOM: { damage: 21000, taken: 22000, gold: 12500, vision: 17, cs: 195 },
    UTILITY: { damage: 11000, taken: 24000, gold: 9200, vision: 60, cs: 40 },
  },
  GOLD: {
    TOP: { damage: 22000, taken: 31000, gold: 12000, vision: 24, cs: 190 },
    JUNGLE: { damage: 18500, taken: 29000, gold: 11500, vision: 42, cs: 150 },
    MIDDLE: { damage: 24500, taken: 25000, gold: 12500, vision: 22, cs: 200 },
    BOTTOM: { damage: 23500, taken: 23000, gold: 13000, vision: 18, cs: 210 },
    UTILITY: { damage: 12000, taken: 25000, gold: 9600, vision: 68, cs: 42 },
  },
  PLATINUM: {
    TOP: { damage: 24000, taken: 32000, gold: 12500, vision: 26, cs: 205 },
    JUNGLE: { damage: 20000, taken: 30000, gold: 12000, vision: 48, cs: 160 },
    MIDDLE: { damage: 27000, taken: 26000, gold: 13000, vision: 24, cs: 215 },
    BOTTOM: { damage: 25500, taken: 24000, gold: 13500, vision: 20, cs: 225 },
    UTILITY: { damage: 13000, taken: 26000, gold: 10000, vision: 75, cs: 43 },
  },
  EMERALD: {
    TOP: { damage: 25500, taken: 33000, gold: 12800, vision: 28, cs: 215 },
    JUNGLE: { damage: 21500, taken: 31000, gold: 12400, vision: 52, cs: 168 },
    MIDDLE: { damage: 29000, taken: 27000, gold: 13400, vision: 26, cs: 225 },
    BOTTOM: { damage: 27500, taken: 25000, gold: 14000, vision: 22, cs: 235 },
    UTILITY: { damage: 14000, taken: 27000, gold: 10300, vision: 82, cs: 44 },
  },
  DIAMOND: {
    TOP: { damage: 27000, taken: 34000, gold: 13200, vision: 30, cs: 225 },
    JUNGLE: { damage: 23000, taken: 32000, gold: 12800, vision: 56, cs: 175 },
    MIDDLE: { damage: 31000, taken: 28000, gold: 13800, vision: 28, cs: 235 },
    BOTTOM: { damage: 29500, taken: 26000, gold: 14500, vision: 24, cs: 245 },
    UTILITY: { damage: 15000, taken: 28000, gold: 10600, vision: 90, cs: 45 },
  },
  MASTER: {
    TOP: { damage: 29000, taken: 35000, gold: 13800, vision: 32, cs: 235 },
    JUNGLE: { damage: 25000, taken: 33000, gold: 13400, vision: 60, cs: 185 },
    MIDDLE: { damage: 33000, taken: 29000, gold: 14500, vision: 30, cs: 245 },
    BOTTOM: { damage: 31500, taken: 27000, gold: 15200, vision: 26, cs: 255 },
    UTILITY: { damage: 16000, taken: 29000, gold: 11000, vision: 98, cs: 46 },
  },
  GRANDMASTER: {
    TOP: { damage: 30000, taken: 35500, gold: 14000, vision: 34, cs: 240 },
    JUNGLE: { damage: 26000, taken: 33500, gold: 13600, vision: 62, cs: 190 },
    MIDDLE: { damage: 34000, taken: 29500, gold: 14800, vision: 32, cs: 250 },
    BOTTOM: { damage: 32500, taken: 27500, gold: 15500, vision: 28, cs: 260 },
    UTILITY: { damage: 16500, taken: 29500, gold: 11200, vision: 102, cs: 47 },
  },
  CHALLENGER: {
    TOP: { damage: 31000, taken: 36000, gold: 14200, vision: 36, cs: 245 },
    JUNGLE: { damage: 27000, taken: 34000, gold: 13800, vision: 65, cs: 195 },
    MIDDLE: { damage: 35000, taken: 30000, gold: 15000, vision: 34, cs: 255 },
    BOTTOM: { damage: 33500, taken: 28000, gold: 15800, vision: 30, cs: 265 },
    UTILITY: { damage: 17000, taken: 30000, gold: 11400, vision: 108, cs: 48 },
  },
  UNRANKED: {
    TOP: { damage: 19000, taken: 29000, gold: 11200, vision: 20, cs: 165 },
    JUNGLE: { damage: 16000, taken: 27000, gold: 10800, vision: 35, cs: 135 },
    MIDDLE: { damage: 21000, taken: 23500, gold: 11800, vision: 18, cs: 175 },
    BOTTOM: { damage: 20000, taken: 21500, gold: 12200, vision: 16, cs: 185 },
    UTILITY: { damage: 10500, taken: 23500, gold: 9000, vision: 55, cs: 38 },
  },
}

async function getRiotHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? supabaseAnonKey
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function callRiotFunction(payload, timeoutMs = 45_000) {
  const response = await fetchWithTimeout(
    RIOT_FUNCTION_URL,
    {
      method: 'POST',
      headers: await getRiotHeaders(),
      body: JSON.stringify(payload),
    },
    timeoutMs,
  )

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const message = data?.error || `Erreur Riot (${response.status})`
    throw new Error(message)
  }

  return data
}

/**
 * @param {string} riotId
 */
export function parseRiotId(riotId) {
  const raw = String(riotId ?? '').trim()
  if (!raw) return { gameName: '', tagLine: '' }
  const hash = raw.indexOf('#')
  if (hash < 0) return { gameName: raw, tagLine: '' }
  return {
    gameName: raw.slice(0, hash).trim(),
    tagLine: raw.slice(hash + 1).trim(),
  }
}

/**
 * @param {string} gameName
 * @param {string} tagLine
 * @param {string} [platform]
 */
export async function resolveRiotAccount(gameName, tagLine, platform = 'euw1') {
  return callRiotFunction({
    action: 'resolve-account',
    gameName,
    tagLine,
    platform,
  })
}

/**
 * @param {string} puuid
 * @param {string} [platform]
 * @param {string | null} [summonerId]
 */
export async function fetchLeagueEntries(puuid, platform = 'euw1', summonerId = null) {
  return callRiotFunction({
    action: 'league-entries',
    puuid,
    platform,
    summonerId: summonerId || undefined,
  })
}

/**
 * @param {string} puuid
 * @param {string} [platform]
 * @param {number} [count]
 */
export async function fetchChampionMasteries(puuid, platform = 'euw1', count = 10) {
  return callRiotFunction({
    action: 'champion-masteries',
    puuid,
    platform,
    count,
  })
}

/**
 * Top champions sur une fenêtre de jours (toutes les parties de la période, plafonnées côté serveur).
 * @param {string} puuid
 * @param {{ platform?: string, days?: number }} [options]
 */
export async function fetchChampionHighlights(puuid, options = {}) {
  return callRiotFunction(
    {
      action: 'champion-highlights',
      puuid,
      platform: options.platform ?? 'euw1',
      days: options.days ?? 90,
    },
    90_000,
  )
}

/**
 * Top N champions par nombre de parties (winrate + part de jeu + maîtrise).
 * @param {object[]} matches
 * @param {Map<number, number>} masteryByChampionId
 * @param {number} [limit]
 */
export function aggregateTopChampionsFromMatches(matches, masteryByChampionId, limit = 3) {
  const stats = new Map()
  for (const m of matches) {
    const p = m?.participant
    const name = String(p?.championName ?? '').trim()
    if (!name) continue
    const cur = stats.get(name) || {
      championName: name,
      championId: Number(p.championId) || 0,
      games: 0,
      wins: 0,
    }
    cur.games += 1
    if (p.win === true) cur.wins += 1
    if (p.championId) cur.championId = Number(p.championId)
    stats.set(name, cur)
  }

  const totalGames = [...stats.values()].reduce((s, c) => s + c.games, 0)

  return [...stats.values()]
    .sort((a, b) => b.games - a.games)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      winRate: row.games ? Math.round((row.wins / row.games) * 100) : 0,
      playShare: totalGames ? Math.round((row.games / totalGames) * 100) : 0,
      masteryPoints: masteryByChampionId.get(row.championId) ?? null,
    }))
}

export function formatMasteryPoints(points) {
  const n = Number(points)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

/**
 * @param {number | null | undefined} championId
 */
export function lolChampionIconById(championId) {
  const id = Number(championId)
  if (!Number.isFinite(id) || id <= 0) return null
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`
}

/**
 * @param {string} puuid
 * @param {{
 *   platform?: string,
 *   days?: number,
 *   count?: number,
 *   start?: number,
 *   startTime?: number | null,
 *   endTime?: number | null,
 *   queueId?: number | null,
 * }} [options]
 */
export async function fetchRecentMatches(puuid, options = {}) {
  return callRiotFunction({
    action: 'recent-matches',
    puuid,
    platform: options.platform ?? 'euw1',
    days: options.days,
    count: options.count ?? 10,
    start: options.start ?? 0,
    startTime: options.startTime ?? undefined,
    endTime: options.endTime ?? undefined,
    queueId: options.queueId ?? undefined,
  })
}

/**
 * @param {string} matchId
 * @param {string} puuid
 * @param {string} [platform]
 */
export async function fetchMatchDetail(matchId, puuid, platform = 'euw1') {
  return callRiotFunction({
    action: 'match-detail',
    matchId,
    puuid,
    platform,
  })
}

export function lolProfileIconUrl(profileIconId, version = LOL_DDRAGON_VERSION) {
  const id = Number(profileIconId)
  if (!Number.isFinite(id) || id < 0) return null
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`
}

export function lolChampionIconByName(championName, version = LOL_DDRAGON_VERSION) {
  const name = String(championName ?? '').trim()
  if (!name) return null
  const key = name.replace(/['.\s]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`
}

/** Icône champion : id si dispo, sinon nom. */
export function lolChampionIcon(championName, championId) {
  return lolChampionIconById(championId) || lolChampionIconByName(championName)
}

export function lolItemIconUrl(itemId, version = LOL_DDRAGON_VERSION) {
  const id = Number(itemId)
  if (!Number.isFinite(id) || id <= 0) return null
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`
}

const LOL_STAT_ICON_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/fonts/texticons/lol/statsicon'

/** @type {[RegExp, string][]} */
const LOL_STAT_ICON_RULES = [
  [/puissance/i, 'scaleap'],
  [/regen.*mana|mana.*regen/i, 'scalemanaregen'],
  [/mana/i, 'scalemana'],
  [/\bPV\b|points de vie/i, 'scalehealth'],
  [/armure/i, 'scalearmor'],
  [/résistance magique|\bRM\b/i, 'scalemr'],
  [/dégâts d'attaque|dégats d'attaque/i, 'scalead'],
  [/vitesse d'attaque/i, 'scaleas'],
  [/critique/i, 'scalecrit'],
  [/vitesse de déplacement|déplacement/i, 'scalems'],
  [/accélération|hâte/i, 'scaleah'],
  [/omnivamp|vol de vie/i, 'scalesv'],
  [/pénétration magique/i, 'scalempen'],
  [/pénétration|létalité/i, 'scaleapen'],
  [/soin|bouclier|intensité/i, 'scalehealshield'],
]

/** @typedef {{ line: string, value: string, label: string, icon: string | null }} LolItemStatLine */
/** @typedef {{ type: string, name: string, bodyHtml: string, bodyText: string }} LolItemEffect */
/** @typedef {{ name: string, goldTotal: number | null, stats: LolItemStatLine[], effects: LolItemEffect[], summary: string }} LolItemCard */

/** @type {Map<number, LolItemCard> | null} */
let itemCatalogCache = null
let itemCatalogPromise = null

const EMPTY_ITEM_CARD = /** @type {LolItemCard} */ ({
  name: '',
  goldTotal: null,
  stats: [],
  effects: [],
  summary: '',
})

function stripLoLItemTags(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function lolStatIconForLabel(label) {
  const text = String(label ?? '')
  for (const [re, icon] of LOL_STAT_ICON_RULES) {
    if (re.test(text)) return `${LOL_STAT_ICON_BASE}/${icon}.png`
  }
  return null
}

function sanitizeItemEffectHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<magicDamage>/gi, '<span class="lol-item-fx lol-item-fx--magic">')
    .replace(/<\/magicDamage>/gi, '</span>')
    .replace(/<physicalDamage>/gi, '<span class="lol-item-fx lol-item-fx--phys">')
    .replace(/<\/physicalDamage>/gi, '</span>')
    .replace(/<trueDamage>/gi, '<span class="lol-item-fx lol-item-fx--true">')
    .replace(/<\/trueDamage>/gi, '</span>')
    .replace(/<attention>/gi, '<span class="lol-item-fx lol-item-fx--attention">')
    .replace(/<\/attention>/gi, '</span>')
    .replace(/<(?!\/?(span|br)\b)[^>]+>/gi, '')
    .trim()
}

function parseItemStatsFromHtml(html) {
  /** @type {LolItemStatLine[]} */
  const stats = []
  const block = String(html ?? '').match(/<stats>([\s\S]*?)<\/stats>/i)?.[1] ?? ''
  if (!block) return stats

  for (const chunk of block.split(/<br\s*\/?>/i)) {
    const line = stripLoLItemTags(chunk).replace(/\s+/g, ' ').trim()
    if (!line) continue
    const match = line.match(/^(\+\d[\d.,%]*)\s*(.+)$/i)
    const value = match?.[1] ?? ''
    const label = match?.[2]?.trim() ?? line
    stats.push({
      line,
      value,
      label,
      icon: lolStatIconForLabel(label),
    })
  }
  return stats
}

function parseItemEffectsFromHtml(html) {
  /** @type {LolItemEffect[]} */
  const effects = []
  const source = String(html ?? '')
  const re =
    /<(passive|active|unique)>([^<]*)<\/\1>(?:<br\s*\/?>)*([\s\S]*?)(?=<(?:passive|active|unique|\/mainText)>|$)/gi
  let match
  while ((match = re.exec(source)) !== null) {
    const bodyRaw = match[3] ?? ''
    effects.push({
      type: match[1],
      name: stripLoLItemTags(match[2]),
      bodyHtml: sanitizeItemEffectHtml(bodyRaw),
      bodyText: stripLoLItemTags(bodyRaw).replace(/\s+/g, ' ').trim(),
    })
  }

  if (!effects.length && source) {
    const rest = source.replace(/<stats>[\s\S]*?<\/stats>/gi, '')
    const bodyText = stripLoLItemTags(rest).replace(/\s+/g, ' ').trim()
    if (bodyText) {
      effects.push({ type: 'desc', name: '', bodyHtml: '', bodyText })
    }
  }
  return effects
}

/** @param {Record<string, unknown>} item */
function buildLolItemCard(item) {
  const name = String(item?.name ?? '')
  const descriptionHtml = String(item?.description ?? '')
  const goldRaw = Number(item?.gold?.total)
  const goldTotal = Number.isFinite(goldRaw) && goldRaw > 0 ? goldRaw : null
  const stats = parseItemStatsFromHtml(descriptionHtml)
  const effects = parseItemEffectsFromHtml(descriptionHtml)

  const summaryParts = []
  if (stats.length) summaryParts.push(stats.map((s) => s.line).join(', '))
  const firstEffect = effects.find((e) => e.bodyText)?.bodyText
  if (firstEffect) summaryParts.push(firstEffect.slice(0, 140))

  return {
    name,
    goldTotal,
    stats,
    effects,
    summary: summaryParts.join(' — '),
  }
}

/**
 * Charge le catalogue d’items Data Dragon (FR) une seule fois.
 * Les effets viennent du HTML `description` (pas `plaintext`, souvent faux).
 */
export async function ensureLolItemCatalog(version = LOL_DDRAGON_VERSION) {
  if (itemCatalogCache) return itemCatalogCache
  if (itemCatalogPromise) return itemCatalogPromise

  itemCatalogPromise = (async () => {
    try {
      const response = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/item.json`,
      )
      if (!response.ok) throw new Error(`item.json ${response.status}`)
      const payload = await response.json()
      const map = new Map()
      for (const [id, item] of Object.entries(payload?.data ?? {})) {
        const num = Number(id)
        if (!num) continue
        map.set(num, buildLolItemCard(item))
      }
      itemCatalogCache = map
      return map
    } catch (err) {
      console.warn('lol item catalog:', err)
      itemCatalogCache = new Map()
      return itemCatalogCache
    } finally {
      itemCatalogPromise = null
    }
  })()

  return itemCatalogPromise
}

/**
 * @param {number | null | undefined} itemId
 * @returns {LolItemCard}
 */
export function lolItemCard(itemId) {
  const id = Number(itemId)
  if (!Number.isFinite(id) || id <= 0) return { ...EMPTY_ITEM_CARD }
  const entry = itemCatalogCache?.get(id)
  if (!entry) {
    return { ...EMPTY_ITEM_CARD, name: `Item ${id}` }
  }
  return entry
}

/**
 * @param {number | null | undefined} itemId
 * @returns {{ name: string, description: string }}
 */
export function lolItemInfo(itemId) {
  const card = lolItemCard(itemId)
  return { name: card.name, description: card.summary }
}

/**
 * @param {number | null | undefined} itemId
 * @returns {string}
 */
export function lolItemTooltip(itemId) {
  const card = lolItemCard(itemId)
  if (!card.name) return ''
  return card.summary ? `${card.name} — ${card.summary}` : card.name
}

export function lolItemName(itemId) {
  return lolItemInfo(itemId).name
}

/**
 * Emblème de rang (Community Dragon).
 * @param {string | null | undefined} tier
 */
export function lolRankEmblemUrl(tier) {
  const t = String(tier ?? '')
    .trim()
    .toLowerCase()
  if (!t || t === 'unranked') {
    return 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/unranked.png'
  }
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.png`
}

export function formatQueueLabel(queueId, gameMode) {
  const id = Number(queueId)
  if (Number.isFinite(id) && LOL_QUEUE_LABELS[id]) return LOL_QUEUE_LABELS[id]
  const mode = String(gameMode ?? '').trim()
  return mode || 'Partie'
}

export function formatRoleLabel(position) {
  const key = String(position ?? '')
    .trim()
    .toUpperCase()
  return LOL_ROLE_LABELS[key] || (key && key !== 'NONE' ? key : '—')
}

export function formatMatchDate(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatMatchDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m} min`
}

export function formatMatchClock(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function participantItems(participant) {
  if (!participant) return []
  return [0, 1, 2, 3, 4, 5, 6]
    .map((i) => Number(participant[`item${i}`]) || 0)
    .filter((id) => id > 0)
}

export function totalCs(participant) {
  if (!participant) return 0
  return (
    (Number(participant.totalMinionsKilled) || 0) +
    (Number(participant.neutralMinionsKilled) || 0)
  )
}

export function csPerMin(participant, gameDurationSec) {
  const minutes = Math.max(1, (Number(gameDurationSec) || 0) / 60)
  return totalCs(participant) / minutes
}

/**
 * Kill participation 0–100.
 */
export function killParticipationPct(participant, teamKills) {
  if (!participant) return null
  if (participant.killParticipation != null && Number.isFinite(Number(participant.killParticipation))) {
    const v = Number(participant.killParticipation)
    return Math.round((v <= 1 ? v * 100 : v))
  }
  const tk = Number(teamKills) || 0
  if (tk <= 0) return 0
  const ka = (Number(participant.kills) || 0) + (Number(participant.assists) || 0)
  return Math.round((ka / tk) * 100)
}

export function kdaRatio(participant) {
  if (!participant) return 0
  const k = Number(participant.kills) || 0
  const d = Number(participant.deaths) || 0
  const a = Number(participant.assists) || 0
  return d === 0 ? k + a : (k + a) / d
}

export function formatRankLabel(entry) {
  if (!entry?.tier) return 'Non classé'
  const tier = String(entry.tier)
  const rank = entry.rank ? String(entry.rank) : ''
  const lp = entry.leaguePoints != null ? `${entry.leaguePoints} LP` : ''
  return [tier.charAt(0) + tier.slice(1).toLowerCase(), rank, lp].filter(Boolean).join(' ')
}

/**
 * @param {unknown[]} entries
 */
export function pickRankedEntries(entries) {
  const list = Array.isArray(entries) ? entries : []
  const solo =
    list.find((e) => e?.queueType === 'RANKED_SOLO_5x5') ?? null
  const flex =
    list.find((e) => e?.queueType === 'RANKED_FLEX_SR') ?? null
  return { solo, flex }
}

/**
 * Scale duration baselines (~30 min reference).
 */
function scaleBaseline(baseline, gameDurationSec) {
  const factor = Math.max(0.55, Math.min(1.6, (Number(gameDurationSec) || 1800) / 1800))
  return {
    damage: Math.round(baseline.damage * factor),
    taken: Math.round(baseline.taken * factor),
    gold: Math.round(baseline.gold * factor),
    vision: Math.round(baseline.vision * factor),
    cs: Math.round(baseline.cs * factor),
  }
}

/**
 * @param {object | null} participant
 * @param {number} gameDurationSec
 * @param {object | null} rankedEntry — league entry solo/flex
 */
export function buildEloComparison(participant, gameDurationSec, rankedEntry) {
  const tier = String(rankedEntry?.tier ?? 'UNRANKED').toUpperCase()
  const roleRaw = String(participant?.teamPosition || participant?.individualPosition || 'MIDDLE')
    .toUpperCase()
  const role = ELO_BASELINES.GOLD[roleRaw] ? roleRaw : 'MIDDLE'
  const tierTable = ELO_BASELINES[tier] || ELO_BASELINES.UNRANKED
  const baseline = scaleBaseline(tierTable[role] || tierTable.MIDDLE, gameDurationSec)

  const you = {
    damage: Number(participant?.totalDamageDealtToChampions) || 0,
    taken: Number(participant?.totalDamageTaken) || 0,
    gold: Number(participant?.goldEarned) || 0,
    vision: Number(participant?.visionScore) || 0,
    cs: totalCs(participant),
  }

  const metrics = [
    { key: 'damage', label: 'Dégâts aux champions', you: you.damage, elo: baseline.damage },
    { key: 'taken', label: 'Dégâts subis', you: you.taken, elo: baseline.taken, invert: true },
    { key: 'gold', label: 'Or gagné', you: you.gold, elo: baseline.gold },
    { key: 'vision', label: 'Vision / wards', you: you.vision, elo: baseline.vision },
    { key: 'cs', label: 'CS', you: you.cs, elo: baseline.cs },
  ]

  return {
    tier,
    role,
    metrics,
    radar: metrics.map((m) => {
      const max = Math.max(m.you, m.elo, 1)
      // Pour dégâts subis : moins = mieux → score inversé pour le radar « performance »
      const youScore = m.invert ? Math.max(0, 2 - m.you / max) : m.you / max
      const eloScore = m.invert ? Math.max(0, 2 - m.elo / max) : m.elo / max
      return {
        key: m.key,
        label: m.label,
        youValue: m.you,
        eloValue: m.elo,
        youNorm: Math.min(1, youScore),
        eloNorm: Math.min(1, eloScore),
      }
    }),
  }
}

/**
 * Convertit une date input (YYYY-MM-DD) en epoch sec (début / fin de journée locale).
 */
export function dayStartEpoch(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(d.getTime() / 1000)
}

export function dayEndEpoch(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T23:59:59`)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(d.getTime() / 1000)
}
