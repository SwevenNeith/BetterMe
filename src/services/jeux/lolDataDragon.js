/**
 * Chargement Data Dragon (fr_FR) avec cache localStorage par version de patch.
 */

import { DDRAGON_CACHE_PREFIX } from '../../constants/jeux/lolMatchTrackerConfig.js'

const DDRAGON_CDN = 'https://ddragon.leagueoflegends.com'
const LOCALE = 'fr_FR'

/** @type {string | null} */
let cachedVersion = null
/** @type {Promise<any> | null} */
let loadPromise = null

function cacheKey(version, name) {
  return `${DDRAGON_CACHE_PREFIX}${version}:${name}`
}

function readCache(version, name) {
  try {
    const raw = localStorage.getItem(cacheKey(version, name))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeCache(version, name, data) {
  try {
    localStorage.setItem(cacheKey(version, name), JSON.stringify(data))
  } catch (err) {
    console.warn('ddragon cache write', err)
  }
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → ${response.status}`)
  return response.json()
}

export async function fetchLatestDdragonVersion() {
  const versions = await fetchJson(`${DDRAGON_CDN}/api/versions.json`)
  if (!Array.isArray(versions) || !versions.length) {
    throw new Error('versions.json vide')
  }
  return String(versions[0])
}

export function ddragonChampionIconUrl(championId, version) {
  const id = String(championId || '').trim()
  if (!id || !version) return null
  return `${DDRAGON_CDN}/cdn/${version}/img/champion/${id}.png`
}

export function ddragonSpellIconUrl(imageFull, version) {
  const file = String(imageFull || '').trim()
  if (!file || !version) return null
  return `${DDRAGON_CDN}/cdn/${version}/img/spell/${file}`
}

export function ddragonItemIconUrl(itemId, version) {
  const id = String(itemId || '').trim()
  if (!id || !version) return null
  return `${DDRAGON_CDN}/cdn/${version}/img/item/${id}.png`
}

/** Runes : chemin relatif type perk-images/... */
export function ddragonRuneIconUrl(iconPath) {
  const path = String(iconPath || '').replace(/^\/+/, '')
  if (!path) return null
  return `${DDRAGON_CDN}/cdn/img/${path}`
}

/**
 * @param {string} version
 * @param {string} championId id Data Dragon (ex. Ahri)
 */
export async function fetchChampionDetail(version, championId) {
  const id = String(championId || '').trim()
  if (!id) return null
  const name = `champion:${id}`
  const cached = readCache(version, name)
  if (cached) return cached
  const payload = await fetchJson(
    `${DDRAGON_CDN}/cdn/${version}/data/${LOCALE}/champion/${encodeURIComponent(id)}.json`,
  )
  const detail = payload?.data?.[id] ?? null
  if (detail) writeCache(version, name, detail)
  return detail
}

function normalizeChampions(payload) {
  return Object.values(payload?.data ?? {})
    .map((c) => ({
      id: String(c.id),
      key: Number(c.key) || 0,
      name: String(c.name || c.id),
      title: String(c.title || ''),
      tags: Array.isArray(c.tags) ? c.tags : [],
      image: c.image?.full || `${c.id}.png`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/**
 * Uniquement les sorts d’invocateur Summoner’s Rift (mode CLASSIC).
 * Exclut Arena/Jade/ARAM-only/reworks (ex. SummonerCherryFlash à 0,25 s).
 */
function normalizeSummoners(payload) {
  return Object.values(payload?.data ?? {})
    .filter((s) => {
      if (!s?.id || !s?.image?.full) return false
      const modes = Array.isArray(s.modes) ? s.modes : []
      return modes.includes('CLASSIC')
    })
    .map((s) => ({
      id: String(s.id),
      name: String(s.name || s.id),
      description: String(s.description || ''),
      cooldown: Array.isArray(s.cooldown) ? s.cooldown.map(Number) : [],
      image: String(s.image.full),
      key: String(s.key || ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function normalizeRunes(trees) {
  if (!Array.isArray(trees)) return { trees: [], keystones: [] }
  const normalizedTrees = trees.map((t) => ({
    id: Number(t.id),
    key: String(t.key || ''),
    name: String(t.name || t.key),
    icon: String(t.icon || ''),
  }))
  const keystones = []
  for (const t of trees) {
    const runes = t.slots?.[0]?.runes ?? []
    for (const r of runes) {
      keystones.push({
        id: Number(r.id),
        key: String(r.key || ''),
        name: String(r.name || r.key),
        icon: String(r.icon || ''),
        treeId: Number(t.id),
        treeName: String(t.name || t.key),
      })
    }
  }
  return { trees: normalizedTrees, keystones }
}

function normalizeBoots(payload) {
  return Object.entries(payload?.data ?? {})
    .filter(([id, it]) => {
      if (!(it?.tags || []).includes('Boots')) return false
      if (it.maps && it.maps['11'] === false) return false
      if (it.gold?.purchasable === false) return false
      // Exclure modes spéciaux (Arena, jauges…)
      const n = Number(id)
      if (!Number.isFinite(n) || n >= 200000) return false
      return true
    })
    .map(([id, it]) => ({
      id: String(id),
      name: String(it.name || id),
      description: String(it.description || ''),
      image: String(it.image?.full || `${id}.png`),
      gold: Number(it.gold?.total) || 0,
    }))
    .sort((a, b) => a.gold - b.gold || a.name.localeCompare(b.name, 'fr'))
}

/**
 * Charge (ou lit le cache) les catalogues nécessaires au tracker.
 * @returns {Promise<{
 *   version: string,
 *   champions: object[],
 *   summoners: object[],
 *   runeTrees: object[],
 *   keystones: object[],
 *   boots: object[],
 * }>}
 */
export async function loadLolMatchTrackerData() {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const version = await fetchLatestDdragonVersion()
    cachedVersion = version

    let championsPayload = readCache(version, 'champion')
    let summonerPayload = readCache(version, 'summoner')
    let runesPayload = readCache(version, 'runesReforged')
    let itemPayload = readCache(version, 'item')

    const fetches = []
    if (!championsPayload) {
      fetches.push(
        fetchJson(`${DDRAGON_CDN}/cdn/${version}/data/${LOCALE}/champion.json`).then(
          (d) => {
            championsPayload = d
            writeCache(version, 'champion', d)
          },
        ),
      )
    }
    if (!summonerPayload) {
      fetches.push(
        fetchJson(`${DDRAGON_CDN}/cdn/${version}/data/${LOCALE}/summoner.json`).then(
          (d) => {
            summonerPayload = d
            writeCache(version, 'summoner', d)
          },
        ),
      )
    }
    if (!runesPayload) {
      fetches.push(
        fetchJson(
          `${DDRAGON_CDN}/cdn/${version}/data/${LOCALE}/runesReforged.json`,
        ).then((d) => {
          runesPayload = d
          writeCache(version, 'runesReforged', d)
        }),
      )
    }
    if (!itemPayload) {
      fetches.push(
        fetchJson(`${DDRAGON_CDN}/cdn/${version}/data/${LOCALE}/item.json`).then(
          (d) => {
            itemPayload = d
            writeCache(version, 'item', d)
          },
        ),
      )
    }
    await Promise.all(fetches)

    const { trees, keystones } = normalizeRunes(runesPayload)

    return {
      version,
      champions: normalizeChampions(championsPayload),
      summoners: normalizeSummoners(summonerPayload),
      runeTrees: trees,
      keystones,
      boots: normalizeBoots(itemPayload),
    }
  })()

  try {
    return await loadPromise
  } finally {
    loadPromise = null
  }
}

export function getCachedDdragonVersion() {
  return cachedVersion
}
