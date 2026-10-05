/**
 * Proxy Riot Games API — BetterMe
 * Secret requis : RIOT_API_KEY (jamais côté client)
 *
 * Déploiement :
 *   supabase secrets set RIOT_API_KEY=RGAPI-...
 *   supabase functions deploy riot
 */

const RIOT_API_KEY = Deno.env.get('RIOT_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLATFORM_TO_ROUTING: Record<string, string> = {
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  oc1: 'sea',
  kr: 'asia',
  jp1: 'asia',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
}

const ALLOWED_PLATFORMS = new Set(Object.keys(PLATFORM_TO_ROUTING))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

async function readPayload(req: Request) {
  try {
    const data = await req.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function normalizePlatform(raw: unknown) {
  const value = String(raw ?? 'euw1')
    .trim()
    .toLowerCase()
  return ALLOWED_PLATFORMS.has(value) ? value : 'euw1'
}

function routingForPlatform(platform: string) {
  return PLATFORM_TO_ROUTING[platform] ?? 'europe'
}

async function riotFetch(url: string) {
  if (!RIOT_API_KEY) {
    throw new Error('RIOT_API_KEY is not configured')
  }

  const response = await fetch(url, {
    headers: {
      'X-Riot-Token': RIOT_API_KEY,
      Accept: 'application/json',
    },
  })

  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    let message =
      (data && typeof data === 'object' && 'status' in data
        ? (data as { status?: { message?: string } }).status?.message
        : null) ||
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: unknown }).error)
        : null) ||
      `Riot API error (${response.status})`

    if (response.status === 403) {
      message =
        'Clé Riot refusée (403). Régénère-la sur developer.riotgames.com ' +
        '(les clés de dev expirent toutes les 24 h), puis : supabase secrets set RIOT_API_KEY=…'
    }

    const err = new Error(message) as Error & { status?: number; data?: unknown }
    err.status = response.status
    err.data = data
    throw err
  }

  return data
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RIOT_API_KEY) {
      return jsonResponse(
        {
          error:
            'RIOT_API_KEY non configurée. Exécute : supabase secrets set RIOT_API_KEY=RGAPI-…',
        },
        500,
      )
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed. Use POST with a JSON body.' }, 405)
    }

    const body = await readPayload(req)
    const action = String(body.action ?? '')
      .trim()
      .toLowerCase()
    const platform = normalizePlatform(body.platform)
    const routing = routingForPlatform(platform)

    if (action === 'resolve-account') {
      const gameName = String(body.gameName ?? body.game_name ?? '').trim()
      const tagLine = String(body.tagLine ?? body.tag_line ?? '')
        .trim()
        .replace(/^#/, '')
      if (!gameName || !tagLine) {
        return jsonResponse({ error: 'gameName et tagLine sont requis (ex. Pseudo#EUW).' }, 400)
      }

      const accountUrl =
        `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
        `${encodePathSegment(gameName)}/${encodePathSegment(tagLine)}`
      const account = (await riotFetch(accountUrl)) as {
        puuid?: string
        gameName?: string
        tagLine?: string
      }

      const puuid = String(account?.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'Compte Riot introuvable.' }, 404)
      }

      let summoner: Record<string, unknown> | null = null
      try {
        const summonerUrl =
          `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodePathSegment(puuid)}`
        summoner = (await riotFetch(summonerUrl)) as Record<string, unknown>
      } catch (err) {
        console.warn('summoner lookup failed:', err)
      }

      return jsonResponse({
        account: {
          puuid,
          gameName: account.gameName ?? gameName,
          tagLine: account.tagLine ?? tagLine,
        },
        summoner,
        platform,
        routing,
      })
    }

    if (action === 'recent-matches') {
      const puuid = String(body.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'puuid requis.' }, 400)
      }

      const count = Math.min(20, Math.max(1, Number(body.count) || 10))
      const days = Math.min(30, Math.max(1, Number(body.days) || 7))
      const end = Math.floor(Date.now() / 1000)
      const start = end - days * 24 * 60 * 60

      const idsUrl =
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/` +
        `${encodePathSegment(puuid)}/ids?startTime=${start}&endTime=${end}&count=${count}`
      const matchIds = (await riotFetch(idsUrl)) as string[]
      const ids = Array.isArray(matchIds) ? matchIds.slice(0, count) : []

      const matches = []
      for (const matchId of ids) {
        try {
          const matchUrl =
            `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodePathSegment(matchId)}`
          const detail = (await riotFetch(matchUrl)) as {
            metadata?: { matchId?: string }
            info?: {
              gameCreation?: number
              gameDuration?: number
              gameMode?: string
              queueType?: string
              participants?: Array<Record<string, unknown>>
            }
          }
          const participant =
            detail?.info?.participants?.find((p) => String(p?.puuid ?? '') === puuid) ?? null
          matches.push({
            matchId: detail?.metadata?.matchId ?? matchId,
            gameCreation: detail?.info?.gameCreation ?? null,
            gameDuration: detail?.info?.gameDuration ?? null,
            gameMode: detail?.info?.gameMode ?? null,
            queueType: detail?.info?.queueId ?? detail?.info?.queueType ?? null,
            participant,
          })
        } catch (err) {
          console.warn('match fetch failed', matchId, err)
        }
      }

      return jsonResponse({
        puuid,
        platform,
        routing,
        days,
        matchIds: ids,
        matches,
      })
    }

    if (action === 'summoner') {
      const puuid = String(body.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'puuid requis.' }, 400)
      }
      const summonerUrl =
        `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodePathSegment(puuid)}`
      const summoner = await riotFetch(summonerUrl)
      return jsonResponse({ summoner, platform, routing })
    }

    return jsonResponse(
      {
        error: 'action invalide. Utilise "resolve-account", "recent-matches" ou "summoner".',
      },
      400,
    )
  } catch (error) {
    console.error(error)
    const status = typeof (error as { status?: number })?.status === 'number'
      ? (error as { status: number }).status
      : 500
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      status >= 400 && status < 600 ? status : 500,
    )
  }
})
