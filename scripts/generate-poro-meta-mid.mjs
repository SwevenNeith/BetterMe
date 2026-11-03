/**
 * Génère localement mid/latest.json (même logique que l’Edge Function).
 * Usage : node scripts/generate-poro-meta-mid.mjs > /tmp/mid-latest.json
 * Puis upload manuel dans le bucket Storage `poro-meta` (chemin mid/latest.json)
 * ou préfère : supabase functions deploy sync-poro-meta-mid + appel POST.
 */

const MAX_CHAMPS = 40
const MIN_PLAY_RATE = 0.35
const UGG_ROLE_MID = '5'
const UGG_ELO_PREF = ['2', '8', '10', '4', '1']
const BOOT_IDS = new Set([
  1001, 3005, 3006, 3009, 3010, 3020, 3047, 3111, 3117, 3158, 3113, 3171,
])

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BetterMe-PoroMeta/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseUggMidBuild(build) {
  if (!Array.isArray(build) || build.length < 5) return null
  const start = Array.isArray(build[2]?.[2]) ? build[2][2].map(Number).filter((n) => n > 0) : []
  const coreRaw = Array.isArray(build[3]?.[2]) ? build[3][2].map(Number).filter((n) => n > 0) : []
  const boots = coreRaw.filter((id) => BOOT_IDS.has(id))
  const core = coreRaw.filter((id) => !BOOT_IDS.has(id))
  const late = []
  if (Array.isArray(build[5])) {
    for (const slot of build[5].slice(0, 3)) {
      if (!Array.isArray(slot) || !slot.length) continue
      const ranked = [...slot].sort((a, b) => (Number(b?.[2]) || 0) - (Number(a?.[2]) || 0))
      const id = Number(ranked[0]?.[0])
      if (id > 0 && !BOOT_IDS.has(id) && !core.includes(id) && !late.includes(id)) late.push(id)
    }
  }
  const skillOrder = Array.isArray(build[4]?.[2]) ? build[4][2].map(String) : []
  const skillPriority = typeof build[4]?.[3] === 'string' ? build[4][3] : ''
  const summoners = Array.isArray(build[1]?.[2]) ? build[1][2].map(Number) : []
  const runesPart = build[0]
  const totals = build[6]
  const wins = Number(totals?.[0]) || 0
  const games = Number(totals?.[1]) || 0
  if (!core.length && !start.length) return null
  return {
    wins,
    games,
    winRate: games > 0 ? Math.round((wins / games) * 1000) / 10 : null,
    start,
    boots,
    core,
    late: late.slice(0, 4),
    skillOrder,
    skillPriority,
    summoners,
    runes: {
      primary: Number(runesPart?.[2]) || 0,
      secondary: Number(runesPart?.[3]) || 0,
      perks: Array.isArray(runesPart?.[4]) ? runesPart[4].map(Number) : [],
    },
  }
}

function pickMidBuild(overview) {
  const world = overview['1'] || overview[Object.keys(overview)[0]]
  if (!world) return null
  for (const elo of UGG_ELO_PREF) {
    const list = world[elo]?.[UGG_ROLE_MID]
    if (!Array.isArray(list) || !list.length) continue
    const parsed = parseUggMidBuild(list[0])
    if (parsed) return { ...parsed, eloKey: elo }
  }
  return null
}

const rates = await fetchJson(
  'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json',
)
const patchLabel = String(rates.patch || 'unknown')
const uggPatch = patchLabel.replace(/\./g, '_')
const midList = []
for (const [cid, roles] of Object.entries(rates.data || {})) {
  const pr = Number(roles?.MIDDLE?.playRate) || 0
  if (pr >= MIN_PLAY_RATE) midList.push({ championId: Number(cid), playRate: pr })
}
midList.sort((a, b) => b.playRate - a.playRate)
const targets = midList.slice(0, MAX_CHAMPS)

const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json')
const ddVersion = versions[0]
const ddChamps = await fetchJson(
  `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/fr_FR/champion.json`,
)
const nameById = new Map()
for (const c of Object.values(ddChamps.data || {})) {
  nameById.set(Number(c.key), { name: c.name, key: c.id })
}

const champions = {}
let ok = 0
for (const row of targets) {
  const url = `https://stats2.u.gg/lol/1.5/overview/${uggPatch}/ranked_solo_5x5/${row.championId}/1.5.0.json`
  try {
    const overview = await fetchJson(url)
    const build = pickMidBuild(overview)
    if (!build) continue
    const meta = nameById.get(row.championId)
    champions[String(row.championId)] = {
      championId: row.championId,
      championKey: meta?.key || null,
      championName: meta?.name || `Champion ${row.championId}`,
      playRate: row.playRate,
      ...build,
    }
    ok += 1
    process.stderr.write(`ok ${ok}/${targets.length} ${meta?.name || row.championId}\n`)
  } catch (err) {
    process.stderr.write(`fail ${row.championId} ${err.message}\n`)
  }
  await sleep(120)
}

const payload = {
  role: 'mid',
  patch: patchLabel,
  ddragon: ddVersion,
  updatedAt: new Date().toISOString(),
  source: 'meraki-rates+stats-overview',
  championCount: Object.keys(champions).length,
  champions,
}
process.stdout.write(JSON.stringify(payload, null, 2))
process.stderr.write(`\nDone ${payload.championCount} champions patch ${patchLabel}\n`)
