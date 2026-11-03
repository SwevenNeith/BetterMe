/**
 * Sync meta builds Poro pour un rôle (mid / adc / support) → Storage `poro-meta`.
 */

import { createClient } from '@supabase/supabase-js'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'poro-meta'
const UGG_ELO_PREF = ['2', '8', '10', '4', '1']
const MAX_CHAMPS = 40
const MIN_PLAY_RATE = 0.35
const BOOT_IDS = new Set([
  1001, 3005, 3006, 3009, 3010, 3020, 3047, 3111, 3117, 3158, 3113, 3171,
])

export type PoroMetaRoleConfig = {
  /** mid | adc | support */
  roleId: string
  /** Dossier Storage : mid / adc / support */
  storageFolder: string
  /** Clé Meraki : MIDDLE | BOTTOM | UTILITY */
  merakiRole: string
  /** Clé rôle U.GG overview : 5 mid, 3 adc, 2 support */
  uggRole: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'BetterMe-PoroMeta/1.0',
      ...(init.headers || {}),
    },
  })
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} ${url}`) as Error & { status?: number }
    err.status = response.status
    throw err
  }
  return response.json()
}

function parseUggBuild(build: unknown) {
  if (!Array.isArray(build) || build.length < 5) return null

  const runesPart = build[0]
  const sumsPart = build[1]
  const startPart = build[2]
  const corePart = build[3]
  const skillPart = build[4]
  const latePart = build[5]
  const totals = build[6]

  const start = Array.isArray(startPart?.[2])
    ? startPart[2].map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : []
  const coreRaw = Array.isArray(corePart?.[2])
    ? corePart[2].map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : []
  const boots = coreRaw.filter((id: number) => BOOT_IDS.has(id))
  const core = coreRaw.filter((id: number) => !BOOT_IDS.has(id))

  /** @type {number[]} */
  const late: number[] = []
  if (Array.isArray(latePart)) {
    for (const slot of latePart.slice(0, 3)) {
      if (!Array.isArray(slot) || !slot.length) continue
      const ranked = [...slot].sort(
        (a, b) => (Number(b?.[2]) || 0) - (Number(a?.[2]) || 0),
      )
      const id = Number(ranked[0]?.[0])
      if (
        Number.isFinite(id) &&
        id > 0 &&
        !BOOT_IDS.has(id) &&
        !core.includes(id) &&
        !late.includes(id)
      ) {
        late.push(id)
      }
    }
  }

  const skillOrder = Array.isArray(skillPart?.[2]) ? skillPart[2].map(String) : []
  const skillPriority = typeof skillPart?.[3] === 'string' ? skillPart[3] : ''
  const summoners = Array.isArray(sumsPart?.[2])
    ? sumsPart[2].map(Number).filter((n: number) => Number.isFinite(n))
    : []

  let runePrimary = 0
  let runeSecondary = 0
  /** @type {number[]} */
  let perks: number[] = []
  if (Array.isArray(runesPart) && Array.isArray(runesPart[4])) {
    runePrimary = Number(runesPart[2]) || 0
    runeSecondary = Number(runesPart[3]) || 0
    perks = runesPart[4].map(Number).filter((n: number) => Number.isFinite(n))
  }

  const wins = Number(totals?.[0]) || 0
  const games = Number(totals?.[1]) || 0
  if (!core.length && !start.length) return null

  return {
    wins,
    games,
    winRate: games > 0 ? Math.round((wins / games) * 1000) / 10 : null,
    start,
    boots: boots.length
      ? boots
      : coreRaw.filter((id: number) => BOOT_IDS.has(id)).slice(0, 1),
    core,
    late: late.slice(0, 4),
    skillOrder,
    skillPriority,
    summoners,
    runes: { primary: runePrimary, secondary: runeSecondary, perks },
  }
}

function pickRoleBuild(overview: Record<string, unknown>, uggRole: string) {
  const world = (overview['1'] || overview[Object.keys(overview)[0]]) as
    | Record<string, Record<string, unknown[]>>
    | undefined
  if (!world || typeof world !== 'object') return null

  for (const elo of UGG_ELO_PREF) {
    const byRole = world[elo]
    if (!byRole || typeof byRole !== 'object') continue
    const list = byRole[uggRole]
    if (!Array.isArray(list) || !list.length) continue
    const parsed = parseUggBuild(list[0])
    if (parsed) return { ...parsed, eloKey: elo }
  }
  return null
}

/**
 * Handler HTTP commun pour sync-poro-meta-{mid|adc|support}.
 */
export async function handlePoroMetaRoleSync(req: Request, config: PoroMetaRoleConfig) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Supabase env manquante.' }, 500)
    }

    const cronHeader = req.headers.get('x-cron-secret') || ''
    const authHeader = req.headers.get('Authorization') || ''
    let allowed = Boolean(cronSecret && cronHeader && cronHeader === cronSecret)

    if (!allowed && authHeader.startsWith('Bearer ')) {
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY') || serviceKey,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (!userErr && userData?.user) allowed = true
    }

    if (!allowed) {
      return jsonResponse({ error: 'Non autorisé.' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const rates = (await fetchJson(
      'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json',
    )) as { patch?: string; data?: Record<string, Record<string, { playRate?: number }>> }

    const patchLabel = String(rates.patch || '').trim() || 'unknown'
    const uggPatch = patchLabel.replace(/\./g, '_')

    const roleList: { championId: number; playRate: number }[] = []
    for (const [cid, roles] of Object.entries(rates.data || {})) {
      const pr = Number(roles?.[config.merakiRole]?.playRate) || 0
      if (pr >= MIN_PLAY_RATE) {
        roleList.push({ championId: Number(cid), playRate: pr })
      }
    }
    roleList.sort((a, b) => b.playRate - a.playRate)
    const targets = roleList.slice(0, MAX_CHAMPS)

    const versions = (await fetchJson(
      'https://ddragon.leagueoflegends.com/api/versions.json',
    )) as string[]
    const ddVersion = versions?.[0] || ''
    const ddChamps = (await fetchJson(
      `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/fr_FR/champion.json`,
    )) as { data?: Record<string, { key: string; name: string; id: string }> }
    const nameById = new Map<number, { name: string; key: string }>()
    for (const c of Object.values(ddChamps.data || {})) {
      nameById.set(Number(c.key), { name: c.name, key: c.id })
    }

    const champions: Record<string, unknown> = {}
    let ok = 0
    let failed = 0

    for (const row of targets) {
      const url =
        `https://stats2.u.gg/lol/1.5/overview/${uggPatch}/ranked_solo_5x5/${row.championId}/1.5.0.json`
      try {
        const overview = (await fetchJson(url)) as Record<string, unknown>
        const build = pickRoleBuild(overview, config.uggRole)
        if (!build) {
          failed += 1
          await sleep(120)
          continue
        }
        const meta = nameById.get(row.championId)
        champions[String(row.championId)] = {
          championId: row.championId,
          championKey: meta?.key || null,
          championName: meta?.name || `Champion ${row.championId}`,
          playRate: row.playRate,
          ...build,
        }
        ok += 1
      } catch (err) {
        console.warn(`meta ${config.roleId} fetch`, row.championId, err)
        failed += 1
      }
      await sleep(150)
    }

    const payload = {
      role: config.roleId,
      patch: patchLabel,
      ddragon: ddVersion,
      updatedAt: new Date().toISOString(),
      source: 'meraki-rates+stats-overview',
      championCount: Object.keys(champions).length,
      champions,
    }

    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    const folder = config.storageFolder
    const paths = [`${folder}/latest.json`, `${folder}/${patchLabel}.json`]
    for (const path of paths) {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: 'application/json; charset=utf-8',
        upsert: true,
        cacheControl: '3600',
      })
      if (error) {
        console.error('storage upload', path, error)
        return jsonResponse(
          {
            error: `Upload Storage échoué (${path}). Crée le bucket via scripts/create-poro-meta-storage.sql`,
            detail: error.message,
          },
          500,
        )
      }
    }

    return jsonResponse({
      done: true,
      role: config.roleId,
      patch: patchLabel,
      ok,
      failed,
      championCount: payload.championCount,
      paths,
    })
  } catch (err) {
    console.error(err)
    return jsonResponse({ error: (err as Error)?.message || 'sync failed' }, 500)
  }
}
