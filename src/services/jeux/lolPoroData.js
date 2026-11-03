/**
 * Données « live » pour Poro : patch Data Dragon + stats personnelles Supabase.
 */

import { fetchChampionDetail, loadLolMatchTrackerData } from './lolDataDragon.js'
import { fetchTopChampionsFromDb } from './lolMatchStats.js'
import { supabase } from '../../lib/supabase.js'

const DDRAGON_CDN = 'https://ddragon.leagueoflegends.com'
const LOCALE = 'fr_FR'

/** @type {Promise<object> | null} */
let catalogPromise = null
/** @type {object | null} */
let catalogCache = null

/**
 * Catalogue items SR achetable (FR), indexé par id numérique.
 * @param {string} version
 */
async function loadItemCatalog(version) {
  const response = await fetch(`${DDRAGON_CDN}/cdn/${version}/data/${LOCALE}/item.json`)
  if (!response.ok) throw new Error(`item.json ${response.status}`)
  const payload = await response.json()
  /** @type {Map<number, { id: number, name: string, tags: string[], gold: number }>} */
  const byId = new Map()
  for (const [id, item] of Object.entries(payload?.data ?? {})) {
    const num = Number(id)
    if (!Number.isFinite(num) || num >= 200000) continue
    if (item?.maps && item.maps['11'] === false) continue
    if (item?.gold?.purchasable === false) continue
    byId.set(num, {
      id: num,
      name: String(item.name || id),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      gold: Number(item.gold?.total) || 0,
    })
  }
  return byId
}

/**
 * Charge (une fois) champions + items + version de patch.
 */
export async function loadPoroGameCatalog() {
  if (catalogCache) return catalogCache
  if (catalogPromise) return catalogPromise

  catalogPromise = (async () => {
    const base = await loadLolMatchTrackerData()
    const itemsById = await loadItemCatalog(base.version)
    catalogCache = {
      version: base.version,
      champions: base.champions,
      itemsById,
      runesById: base.runesById || new Map(),
      runeTrees: base.runeTrees || [],
      summonersByKey: base.summonersByKey || new Map(),
      summoners: base.summoners || [],
      /** @type {Map<string, object>} */
      championsById: new Map(base.champions.map((c) => [c.id.toLowerCase(), c])),
      /** @type {Map<number, object>} */
      championsByKey: new Map(base.champions.map((c) => [c.key, c])),
    }
    return catalogCache
  })()

  try {
    return await catalogPromise
  } finally {
    catalogPromise = null
  }
}

/**
 * @param {number[]} itemIds
 * @param {Map<number, { name: string }>} itemsById
 */
export function resolvePoroItemNames(itemIds, itemsById) {
  return (itemIds ?? [])
    .map((id) => {
      const entry = itemsById?.get(Number(id))
      return entry ? { id: Number(id), name: entry.name } : null
    })
    .filter(Boolean)
}

/**
 * @param {string} value
 */
function normalizeChampQuery(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} raw
 * @param {object[]} champions
 */
export function findChampionInCatalog(raw, champions) {
  const list = findChampionsInCatalog(raw, champions)
  return list[0] || null
}

/**
 * Tous les champions mentionnés (noms les plus longs d’abord, sans chevauchement).
 * @param {string} raw
 * @param {object[]} champions
 * @returns {object[]}
 */
export function findChampionsInCatalog(raw, champions) {
  const n = normalizeChampQuery(raw)
  if (!n || !Array.isArray(champions)) return []

  /** @type {{ champ: object, nameNorm: string }[]} */
  const hits = []
  for (const c of champions) {
    const nameNorm = normalizeChampQuery(c.name)
    const id = String(c.id || '').toLowerCase()
    if (!nameNorm) continue
    if (n === nameNorm || n === id || n.includes(nameNorm) || (id.length > 2 && n.includes(id))) {
      hits.push({ champ: c, nameNorm })
    }
  }
  hits.sort((a, b) => b.nameNorm.length - a.nameNorm.length)

  /** @type {object[]} */
  const picked = []
  let consumed = n
  for (const hit of hits) {
    if (!consumed.includes(hit.nameNorm) && !consumed.includes(String(hit.champ.id || '').toLowerCase())) {
      continue
    }
    picked.push(hit.champ)
    consumed = consumed.replace(hit.nameNorm, ' ')
  }
  return picked
}

/**
 * Guide généré depuis Data Dragon (tous les champions).
 * @param {string} version
 * @param {string} championId ex. Ahri
 */
export async function buildDdragonChampionGuide(version, championId) {
  const detail = await fetchChampionDetail(version, championId)
  if (!detail) return null

  const strip = (html) =>
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  const spells = Array.isArray(detail.spells)
    ? detail.spells.map((s, i) => {
        const key = ['Q', 'W', 'E', 'R'][i] || '?'
        return {
          key,
          name: String(s.name || key),
          description: strip(s.description).slice(0, 220),
        }
      })
    : []

  const passive = detail.passive
    ? {
        name: String(detail.passive.name || 'Passif'),
        description: strip(detail.passive.description).slice(0, 220),
      }
    : null

  return {
    id: String(detail.id),
    key: Number(detail.key) || 0,
    name: String(detail.name || detail.id),
    title: String(detail.title || ''),
    tags: Array.isArray(detail.tags) ? detail.tags : [],
    blurb: strip(detail.blurb || detail.lore).slice(0, 400),
    allytips: Array.isArray(detail.allytips) ? detail.allytips.map(String) : [],
    enemytips: Array.isArray(detail.enemytips) ? detail.enemytips.map(String) : [],
    passive,
    spells,
    patch: version,
  }
}

/**
 * @param {string} puuid
 * @param {Map<number, object>} championsByKey
 */
export async function loadPoroPlayerStats(puuid, championsByKey) {
  if (!puuid) {
    return { totalGames: 0, champions: [], note: 'Aucun compte LoL sélectionné.' }
  }
  try {
    const { totalGames, champions } = await fetchTopChampionsFromDb(puuid, 12)
    const enriched = champions.map((row) => {
      const cat = championsByKey?.get(row.championId)
      return {
        ...row,
        championName: cat?.name || `Champion ${row.championId}`,
        championTags: cat?.tags || [],
      }
    })
    return {
      totalGames,
      champions: enriched,
      note: totalGames
        ? null
        : 'Pas encore de parties synchronisées pour ce compte (lance une synchro sur la page LoL).',
    }
  } catch (err) {
    console.warn('Poro player stats:', err)
    return {
      totalGames: 0,
      champions: [],
      note: 'Impossible de charger ton historique (RPC / tables LoL).',
    }
  }
}

/**
 * Contexte complet passé au moteur Poro.
 * @param {{ puuid?: string | null }} [opts]
 */
/**
 * Infère un poste dominant depuis le pool (tags des champions les plus joués).
 * @param {{ champions?: { championTags?: string[], games?: number }[] }} player
 */
export function inferPlayerPreferredRole(player) {
  const rows = player?.champions || []
  if (!rows.length) return null
  /** @type {Record<string, number>} */
  const scores = { mid: 0, adc: 0, top: 0, jungle: 0, support: 0 }
  for (const row of rows) {
    const weight = Number(row.games) || 1
    const tags = new Set(row.championTags || [])
    if (tags.has('Marksman')) scores.adc += weight
    else if (tags.has('Support') && !tags.has('Mage') && !tags.has('Assassin')) scores.support += weight
    else if (tags.has('Tank') && tags.has('Fighter')) scores.top += weight * 0.6
    else if (tags.has('Fighter') && !tags.has('Mage')) scores.top += weight * 0.5
    else if (tags.has('Assassin') || tags.has('Mage')) scores.mid += weight
    else scores.mid += weight * 0.3
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (!best || best[1] <= 0) return null
  const labels = { mid: 'Mid', adc: 'ADC', top: 'Top', jungle: 'Jungle', support: 'Support' }
  return { id: best[0], label: labels[best[0]] || best[0] }
}

export async function loadPoroRuntimeContext(opts = {}) {
  const catalog = await loadPoroGameCatalog()
  const player = await loadPoroPlayerStats(opts.puuid || null, catalog.championsByKey)

  /** @type {Record<string, object|null>} */
  let metaByRole = { mid: null, adc: null, support: null, top: null, jungle: null }
  try {
    const { fetchAllPoroMetaRoles } = await import('./poroMeta.js')
    metaByRole = await fetchAllPoroMetaRoles()
  } catch (err) {
    console.warn('Poro meta load:', err)
  }

  return {
    patch: catalog.version,
    champions: catalog.champions,
    itemsById: catalog.itemsById,
    championsById: catalog.championsById,
    championsByKey: catalog.championsByKey,
    runesById: catalog.runesById,
    runeTrees: catalog.runeTrees,
    summonersByKey: catalog.summonersByKey,
    player,
    preferredRole: inferPlayerPreferredRole(player),
    metaMid: metaByRole.mid,
    metaAdc: metaByRole.adc,
    metaSupport: metaByRole.support,
    metaTop: metaByRole.top,
    metaJungle: metaByRole.jungle,
    metaByRole,
    buildGuide: (championId) => buildDdragonChampionGuide(catalog.version, championId),
  }
}

/**
 * Export supabase pour tests éventuels (évite cycle).
 */
export function getPoroSupabase() {
  return supabase
}
