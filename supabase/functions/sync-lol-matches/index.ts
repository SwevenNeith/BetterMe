/**
 * Synchronise les parties (files en liste blanche) + maîtrises vers Supabase.
 *
 * Secrets : RIOT_API_KEY, CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Auth : JWT utilisateur connecté OU en-tête x-cron-secret = CRON_SECRET
 *
 * Déploiement :
 *   supabase secrets set RIOT_API_KEY=RGAPI-… CRON_SECRET=…
 *   supabase functions deploy sync-lol-matches
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Files comptées (champion choisi, pas aléatoire / PvE).
 * Vérifier les IDs sur le fichier officiel Riot queues.json :
 * https://static.developer.riotgames.com/docs/lol/queues.json
 * Garder cette liste synchronisée avec scripts/cleanup-lol-matches-queues.sql
 */
const COUNTED_QUEUE_IDS = [
  420, // ranked solo/duo
  440, // ranked flex
  400, // normal draft
  480, // swiftplay
  700, // clash
] as const

const COUNTED_QUEUE_SET = new Set<number>(COUNTED_QUEUE_IDS)

/** Budget avant limite Edge Function (~150s) : s’arrêter proprement. */
const TIME_BUDGET_MS = 100_000

/** Verrou anti-concurrence (durée max d’une invocation). */
const LOCK_TTL_MS = 120_000

/** Pause légère entre listes d’IDs par file (rate limit). */
const QUEUE_LIST_GAP_MS = 350

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function riotFetch(url: string, apiKey: string, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { 'X-Riot-Token': apiKey, Accept: 'application/json' },
    })
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }

    if (response.ok) return data
    if (response.status === 404) {
      const err = new Error('Not found') as Error & { status?: number }
      err.status = 404
      throw err
    }

    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'))
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(15_000, retryAfter * 1000)
          : Math.min(8_000, 900 * (attempt + 1))
      await sleep(waitMs)
      continue
    }

    const message =
      (data && typeof data === 'object' && 'status' in data
        ? (data as { status?: { message?: string } }).status?.message
        : null) || `Riot API error (${response.status})`
    const err = new Error(message) as Error & { status?: number }
    err.status = response.status
    throw err
  }
  throw new Error('Riot API retries exhausted')
}

function encodePath(value: string) {
  return encodeURIComponent(value)
}

function rankedResetSec(dateYmd: string): number {
  const ms = Date.parse(`${dateYmd}T00:00:00Z`)
  return Math.floor(ms / 1000)
}

/**
 * Partie stockable : file autorisée, durée >= 300 s, pas d’early surrender.
 */
function isValidGame(
  detail: {
    info?: {
      gameDuration?: number
      queueId?: number
      participants?: Array<Record<string, unknown>>
    }
  },
  puuid: string,
): boolean {
  const queueId = Number(detail?.info?.queueId)
  if (!COUNTED_QUEUE_SET.has(queueId)) return false

  const duration = Number(detail?.info?.gameDuration)
  if (!Number.isFinite(duration) || duration < 300) return false

  const me = (detail?.info?.participants ?? []).find(
    (p) => String(p?.puuid ?? '') === puuid,
  )
  if (!me) return false
  if (me.gameEndedInEarlySurrender === true) return false
  return true
}

async function listMatchIdsForQueues(
  routing: string,
  puuid: string,
  startTime: number,
  riotKey: string,
  started: number,
): Promise<{ ids: string[]; complete: boolean }> {
  const merged = new Set<string>()
  let complete = true

  for (const queueId of COUNTED_QUEUE_IDS) {
    if (Date.now() - started > TIME_BUDGET_MS - 5_000) {
      complete = false
      break
    }
    let startIndex = 0
    while (true) {
      if (Date.now() - started > TIME_BUDGET_MS - 5_000) {
        complete = false
        break
      }
      const idsUrl =
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/` +
        `${encodePath(puuid)}/ids?startTime=${startTime}&queue=${queueId}` +
        `&start=${startIndex}&count=100`
      const matchIds = (await riotFetch(idsUrl, riotKey)) as string[]
      const ids = Array.isArray(matchIds) ? matchIds : []
      if (!ids.length) break
      for (const id of ids) merged.add(String(id))
      startIndex += ids.length
      if (ids.length < 100) break
    }
    if (!complete) break
    await sleep(QUEUE_LIST_GAP_MS)
  }

  return { ids: [...merged], complete }
}

type SettingsRow = {
  user_id: string
  puuid: string
  platform: string
  routing: string
  ranked_reset_date: string
  sync_complete: boolean
  last_synced_at: string | null
  sync_running_until: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const started = Date.now()
  const riotKey = Deno.env.get('RIOT_API_KEY')
  const cronSecret = Deno.env.get('CRON_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!riotKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Secrets serveur manquants (RIOT_API_KEY / Supabase).' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const cronHeader = req.headers.get('x-cron-secret') || ''
    const isCron = Boolean(cronSecret && cronHeader && cronHeader === cronSecret)

    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }

    let userId: string | null = null
    if (!isCron) {
      const authHeader = req.headers.get('Authorization') || ''
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!jwt) return jsonResponse({ error: 'Non autorisé' }, 401)
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        return jsonResponse({ error: 'JWT invalide' }, 401)
      }
      userId = userData.user.id
    }

    const targetPuuid = String(body.puuid ?? '').trim()

    let settingsQuery = admin.from('lol_settings').select('*')
    if (userId) {
      settingsQuery = settingsQuery.eq('user_id', userId)
    }
    if (targetPuuid) {
      settingsQuery = settingsQuery.eq('puuid', targetPuuid)
    }

    const { data: settingsRows, error: settingsErr } = await settingsQuery
    if (settingsErr) {
      return jsonResponse({ error: settingsErr.message }, 500)
    }

    const rows = (settingsRows ?? []) as SettingsRow[]
    if (!rows.length) {
      return jsonResponse({
        done: true,
        inserted: 0,
        remaining: 0,
        message: 'Aucun compte à synchroniser (lol_settings vide).',
      })
    }

    const rawIds = Array.isArray(body.matchIds) ? body.matchIds : []
    const matchIds = [
      ...new Set(
        rawIds
          .map((id) => String(id ?? '').trim())
          .filter((id) => id.length > 0),
      ),
    ]
    const forceFull = body.full === true

    let totalInserted = 0
    let totalRemaining = 0
    let allDone = true

    for (const settings of rows) {
      const result = await syncOneAccount(
        admin,
        riotKey,
        settings,
        started,
        { matchIds, forceFull },
      )
      totalInserted += result.inserted
      totalRemaining += result.remaining
      if (!result.done) allDone = false
      if (Date.now() - started > TIME_BUDGET_MS) {
        allDone = false
        break
      }
    }

    return jsonResponse({
      done: allDone && totalRemaining === 0,
      inserted: totalInserted,
      remaining: totalRemaining,
    })
  } catch (err) {
    console.error('sync-lol-matches:', err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Erreur sync' },
      500,
    )
  }
})

async function syncOneAccount(
  admin: ReturnType<typeof createClient>,
  riotKey: string,
  settings: SettingsRow,
  started: number,
  opts: { matchIds: string[]; forceFull: boolean } = {
    matchIds: [],
    forceFull: false,
  },
): Promise<{ done: boolean; inserted: number; remaining: number }> {
  const now = Date.now()
  if (
    settings.sync_running_until &&
    Date.parse(settings.sync_running_until) > now
  ) {
    return { done: false, inserted: 0, remaining: -1 }
  }

  // Recharge + verrou
  const { data: fresh } = await admin
    .from('lol_settings')
    .select('*')
    .eq('user_id', settings.user_id)
    .eq('puuid', settings.puuid)
    .maybeSingle()

  if (
    fresh?.sync_running_until &&
    Date.parse(fresh.sync_running_until) > Date.now()
  ) {
    return { done: false, inserted: 0, remaining: -1 }
  }

  const lockUntil = new Date(Date.now() + LOCK_TTL_MS).toISOString()
  const { error: lockErr } = await admin
    .from('lol_settings')
    .update({ sync_running_until: lockUntil, updated_at: new Date().toISOString() })
    .eq('user_id', settings.user_id)
    .eq('puuid', settings.puuid)

  if (lockErr) {
    console.warn('lock error', lockErr)
    return { done: false, inserted: 0, remaining: -1 }
  }

  const current = (fresh ?? settings) as SettingsRow
  const targeted = opts.matchIds.length > 0
  const keepComplete = Boolean(current.sync_complete) || targeted

  let inserted = 0
  let remaining = 0

  try {
    const resetDate = String(current.ranked_reset_date).slice(0, 10)
    const resetSec = rankedResetSec(resetDate)
    const platform = current.platform || 'euw1'
    const routing = current.routing || 'europe'
    const puuid = current.puuid

    const { data: newest } = await admin
      .from('lol_matches')
      .select('game_creation')
      .eq('user_id', current.user_id)
      .eq('puuid', puuid)
      .order('game_creation', { ascending: false })
      .limit(1)
      .maybeSingle()

    const hasStored = Boolean(newest?.game_creation)
    let listedComplete = true
    let allIds: string[] = []

    if (targeted) {
      // Chemin rapide Actualiser : uniquement les IDs fournis (déjà filtrés côté client)
      allIds = opts.matchIds
    } else {
      // full = backfill depuis reset ; sinon toujours incrémental dès qu’il y a des lignes
      let startTime = resetSec
      const useIncremental = hasStored && !opts.forceFull
      if (useIncremental && newest?.game_creation) {
        const newestSec = Math.floor(Date.parse(newest.game_creation) / 1000)
        startTime = Math.max(resetSec, newestSec - 24 * 60 * 60)
      }

      const listed = await listMatchIdsForQueues(
        routing,
        puuid,
        startTime,
        riotKey,
        started,
      )
      allIds = listed.ids
      listedComplete = listed.complete
    }

    // Ne charger que les IDs listés (pas toute la table) pour le filtre « déjà en base »
    const existing = new Set<string>()
    for (let i = 0; i < allIds.length; i += 200) {
      const chunk = allIds.slice(i, i + 200)
      const { data: existingRows } = await admin
        .from('lol_matches')
        .select('match_id')
        .eq('user_id', current.user_id)
        .eq('puuid', puuid)
        .in('match_id', chunk)
      for (const row of existingRows ?? []) {
        existing.add(String(row.match_id))
      }
    }

    // IDs déjà en base = déjà examinés. Remakes non stockés restent à examiner
    // (téléchargés puis ignorés) pour ne pas bloquer done.
    const toExamine = allIds.filter((id) => !existing.has(id))

    const concurrency = 3
    const batchRows: Array<Record<string, unknown>> = []
    let examined = 0

    for (let i = 0; i < toExamine.length; i += concurrency) {
      if (Date.now() - started > TIME_BUDGET_MS - 8_000) break
      const slice = toExamine.slice(i, i + concurrency)
      const details = await Promise.all(
        slice.map(async (matchId) => {
          try {
            const url =
              `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodePath(matchId)}`
            const detail = (await riotFetch(url, riotKey)) as {
              metadata?: { matchId?: string }
              info?: {
                gameCreation?: number
                gameDuration?: number
                queueId?: number
                participants?: Array<Record<string, unknown>>
              }
            }
            // Examiné même si invalide (remake / mauvaise file) → pas d’insert
            if (!isValidGame(detail, puuid)) return { examined: true, row: null }

            const me = (detail?.info?.participants ?? []).find(
              (p) => String(p?.puuid ?? '') === puuid,
            )
            if (!me) return { examined: true, row: null }
            const creationMs = Number(detail?.info?.gameCreation)
            if (!Number.isFinite(creationMs)) return { examined: true, row: null }
            const championId = Number(me.championId) || 0
            if (!championId) return { examined: true, row: null }

            return {
              examined: true,
              row: {
                user_id: current.user_id,
                puuid,
                match_id: String(detail?.metadata?.matchId ?? matchId),
                champion_id: championId,
                win: me.win === true,
                game_duration: Number(detail?.info?.gameDuration) || 0,
                early_surrender: false,
                game_creation: new Date(creationMs).toISOString(),
                queue_id: Number(detail?.info?.queueId),
              },
            }
          } catch (err) {
            // 404 = examiné (ne bloque pas done)
            if ((err as { status?: number })?.status === 404) {
              return { examined: true, row: null }
            }
            console.warn('match fetch', matchId, err)
            return { examined: false, row: null }
          }
        }),
      )

      for (const item of details) {
        if (item?.examined) examined += 1
        if (item?.row) batchRows.push(item.row)
      }

      if (batchRows.length >= 40) {
        const chunk = batchRows.splice(0, batchRows.length)
        const { error } = await admin.from('lol_matches').upsert(chunk, {
          onConflict: 'user_id,match_id',
          ignoreDuplicates: true,
        })
        if (error) console.warn('upsert matches', error)
        else inserted += chunk.length
      }
    }

    if (batchRows.length) {
      const { error } = await admin.from('lol_matches').upsert(batchRows, {
        onConflict: 'user_id,match_id',
        ignoreDuplicates: true,
      })
      if (error) console.warn('upsert matches', error)
      else inserted += batchRows.length
    }

    // remaining = IDs listés pas encore examinés dans CETTE exécution
    remaining = Math.max(0, toExamine.length - examined)
    if (!listedComplete && remaining === 0) {
      // Listing incomplet (budget temps) → forcer une passe suivante
      remaining = 1
    }

    // Maîtrise : seulement en backfill / fin de sync (pas à chaque micro-sync ciblée)
    const shouldSyncMastery =
      !targeted && Date.now() - started < TIME_BUDGET_MS - 5_000
    if (shouldSyncMastery) {
      try {
        const masteryUrl =
          `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodePath(puuid)}`
        const masteries = (await riotFetch(masteryUrl, riotKey)) as Array<{
          championId?: number
          championLevel?: number
          championPoints?: number
        }>
        if (Array.isArray(masteries) && masteries.length) {
          const nowIso = new Date().toISOString()
          const rows = masteries
            .map((m) => ({
              user_id: current.user_id,
              puuid,
              champion_id: Number(m.championId) || 0,
              level: Number(m.championLevel) || 0,
              points: Number(m.championPoints) || 0,
              updated_at: nowIso,
            }))
            .filter((r) => r.champion_id > 0)
          // upsert par paquets
          for (let i = 0; i < rows.length; i += 80) {
            const chunk = rows.slice(i, i + 80)
            const { error } = await admin
              .from('lol_champion_mastery')
              .upsert(chunk, { onConflict: 'user_id,puuid,champion_id' })
            if (error) console.warn('upsert mastery', error)
          }
        }
      } catch (err) {
        console.warn('mastery sync', err)
      }
    }

    const timedOut = Date.now() - started > TIME_BUDGET_MS - 8_000
    // done = tous les IDs de cette passe examinés + listing fini.
    const done = listedComplete && !timedOut && remaining === 0
    // Sync ciblée / déjà complete : ne pas repasser sync_complete à false
    // (sinon le prochain appel relance un backfill complet depuis le reset).
    const nextSyncComplete = done ? true : keepComplete

    await admin
      .from('lol_settings')
      .update({
        sync_complete: nextSyncComplete,
        last_synced_at:
          done || inserted > 0 ? new Date().toISOString() : current.last_synced_at,
        sync_running_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', current.user_id)
      .eq('puuid', puuid)

    return { done, inserted, remaining: done ? 0 : remaining }
  } catch (err) {
    console.error('syncOneAccount', settings.puuid, err)
    await admin
      .from('lol_settings')
      .update({
        sync_running_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', settings.user_id)
      .eq('puuid', settings.puuid)
    return { done: false, inserted, remaining: Math.max(remaining, 1) }
  }
}
