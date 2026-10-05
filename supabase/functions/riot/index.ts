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

type ParticipantRaw = Record<string, unknown>

function summarizeParticipant(p: ParticipantRaw) {
  const challenges = (p.challenges && typeof p.challenges === 'object'
    ? (p.challenges as Record<string, unknown>)
    : {}) as Record<string, unknown>

  return {
    puuid: String(p.puuid ?? ''),
    riotIdGameName: String(p.riotIdGameName ?? p.summonerName ?? ''),
    riotIdTagline: String(p.riotIdTagline ?? ''),
    summonerName: String(p.summonerName ?? ''),
    championName: String(p.championName ?? ''),
    championId: Number(p.championId) || 0,
    teamId: Number(p.teamId) || 0,
    teamPosition: String(p.teamPosition ?? p.individualPosition ?? ''),
    individualPosition: String(p.individualPosition ?? ''),
    role: String(p.role ?? ''),
    win: Boolean(p.win),
    kills: Number(p.kills) || 0,
    deaths: Number(p.deaths) || 0,
    assists: Number(p.assists) || 0,
    totalMinionsKilled: Number(p.totalMinionsKilled) || 0,
    neutralMinionsKilled: Number(p.neutralMinionsKilled) || 0,
    goldEarned: Number(p.goldEarned) || 0,
    totalDamageDealtToChampions: Number(p.totalDamageDealtToChampions) || 0,
    totalDamageTaken: Number(p.totalDamageTaken) || 0,
    visionScore: Number(p.visionScore) || 0,
    wardsPlaced: Number(p.wardsPlaced) || 0,
    detectorWardsPlaced: Number(p.detectorWardsPlaced) || 0,
    wardsKilled: Number(p.wardsKilled) || 0,
    item0: Number(p.item0) || 0,
    item1: Number(p.item1) || 0,
    item2: Number(p.item2) || 0,
    item3: Number(p.item3) || 0,
    item4: Number(p.item4) || 0,
    item5: Number(p.item5) || 0,
    item6: Number(p.item6) || 0,
    summoner1Id: Number(p.summoner1Id) || 0,
    summoner2Id: Number(p.summoner2Id) || 0,
    champLevel: Number(p.champLevel) || 0,
    killParticipation: Number(challenges.killParticipation) || null,
  }
}

function buildMatchSummary(
  matchId: string,
  detail: {
    metadata?: { matchId?: string }
    info?: {
      gameCreation?: number
      gameDuration?: number
      gameMode?: string
      gameType?: string
      queueId?: number
      mapId?: number
      participants?: ParticipantRaw[]
    }
  },
  puuid: string,
) {
  const participants = (detail?.info?.participants ?? []).map(summarizeParticipant)
  const participant = participants.find((p) => p.puuid === puuid) ?? null
  const teamKills = participants
    .filter((p) => p.teamId === participant?.teamId)
    .reduce((sum, p) => sum + p.kills, 0)

  return {
    matchId: detail?.metadata?.matchId ?? matchId,
    gameCreation: detail?.info?.gameCreation ?? null,
    gameDuration: detail?.info?.gameDuration ?? null,
    gameMode: detail?.info?.gameMode ?? null,
    gameType: detail?.info?.gameType ?? null,
    queueId: detail?.info?.queueId ?? null,
    mapId: detail?.info?.mapId ?? null,
    participant,
    teamKills,
    participants,
  }
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

      let leagueEntries: unknown[] = []
      try {
        const leagueUrl =
          `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodePathSegment(puuid)}`
        const entries = (await riotFetch(leagueUrl)) as unknown
        leagueEntries = Array.isArray(entries) ? entries : []
      } catch (err) {
        console.warn('league entries by puuid failed:', err)
        const summonerId = String(
          (summoner as { id?: string } | null)?.id ?? '',
        ).trim()
        if (summonerId) {
          try {
            const leagueUrl =
              `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodePathSegment(summonerId)}`
            const entries = (await riotFetch(leagueUrl)) as unknown
            leagueEntries = Array.isArray(entries) ? entries : []
          } catch (err2) {
            console.warn('league entries by summoner failed:', err2)
          }
        }
      }

      return jsonResponse({
        account: {
          puuid,
          gameName: account.gameName ?? gameName,
          tagLine: account.tagLine ?? tagLine,
        },
        summoner,
        leagueEntries,
        platform,
        routing,
      })
    }

    if (action === 'league-entries') {
      const puuid = String(body.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'puuid requis.' }, 400)
      }

      let entries: unknown[] = []
      try {
        const leagueUrl =
          `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodePathSegment(puuid)}`
        const data = (await riotFetch(leagueUrl)) as unknown
        entries = Array.isArray(data) ? data : []
      } catch (err) {
        console.warn('league by puuid failed, trying summoner id:', err)
        const summonerId = String(body.summonerId ?? body.summoner_id ?? '').trim()
        let id = summonerId
        if (!id) {
          const summonerUrl =
            `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodePathSegment(puuid)}`
          const summoner = (await riotFetch(summonerUrl)) as { id?: string }
          id = String(summoner?.id ?? '').trim()
        }
        if (!id) throw err
        const leagueUrl =
          `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodePathSegment(id)}`
        const data = (await riotFetch(leagueUrl)) as unknown
        entries = Array.isArray(data) ? data : []
      }

      return jsonResponse({
        puuid,
        platform,
        routing,
        entries,
      })
    }

    if (action === 'recent-matches' || action === 'matches') {
      const puuid = String(body.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'puuid requis.' }, 400)
      }

      const count = Math.min(20, Math.max(1, Number(body.count) || 10))
      const startIndex = Math.max(0, Number(body.start) || 0)

      let startTime: number | null = null
      let endTime: number | null = null

      if (body.startTime != null && body.startTime !== '') {
        startTime = Math.floor(Number(body.startTime))
      }
      if (body.endTime != null && body.endTime !== '') {
        endTime = Math.floor(Number(body.endTime))
      }

      // Compat : days (si pas de bornes explicites)
      if (startTime == null && endTime == null) {
        const days = Math.min(90, Math.max(1, Number(body.days) || 7))
        endTime = Math.floor(Date.now() / 1000)
        startTime = endTime - days * 24 * 60 * 60
      } else if (endTime == null) {
        endTime = Math.floor(Date.now() / 1000)
      }

      const queueId =
        body.queueId != null && body.queueId !== '' ? Number(body.queueId) : null

      let idsUrl =
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/` +
        `${encodePathSegment(puuid)}/ids?start=${startIndex}&count=${count}`
      if (startTime != null && Number.isFinite(startTime)) {
        idsUrl += `&startTime=${startTime}`
      }
      if (endTime != null && Number.isFinite(endTime)) {
        idsUrl += `&endTime=${endTime}`
      }
      if (queueId != null && Number.isFinite(queueId)) {
        idsUrl += `&queue=${queueId}`
      }

      const matchIds = (await riotFetch(idsUrl)) as string[]
      const ids = Array.isArray(matchIds) ? matchIds.slice(0, count) : []

      const matches = []
      for (const matchId of ids) {
        let detail = null
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const matchUrl =
              `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodePathSegment(matchId)}`
            detail = (await riotFetch(matchUrl)) as Parameters<typeof buildMatchSummary>[1]
            break
          } catch (err) {
            const status = (err as { status?: number })?.status
            if (attempt === 0 && (status === 429 || status === 503)) {
              await new Promise((r) => setTimeout(r, 1100))
              continue
            }
            console.warn('match fetch failed', matchId, err)
          }
        }
        if (detail) {
          matches.push(buildMatchSummary(matchId, detail, puuid))
        }
      }

      return jsonResponse({
        puuid,
        platform,
        routing,
        start: startIndex,
        count,
        startTime,
        endTime,
        matchIds: ids,
        hasMore: ids.length >= count,
        matches,
      })
    }

    if (action === 'match-detail') {
      const puuid = String(body.puuid ?? '').trim()
      const matchId = String(body.matchId ?? body.match_id ?? '').trim()
      if (!matchId) {
        return jsonResponse({ error: 'matchId requis.' }, 400)
      }
      const matchUrl =
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodePathSegment(matchId)}`
      const detail = (await riotFetch(matchUrl)) as Parameters<typeof buildMatchSummary>[1]
      return jsonResponse({
        platform,
        routing,
        match: buildMatchSummary(matchId, detail, puuid),
      })
    }

    if (action === 'champion-masteries') {
      const puuid = String(body.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'puuid requis.' }, 400)
      }
      const masteryCount = Math.min(10, Math.max(1, Number(body.count) || 10))
      const masteryUrl =
        `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodePathSegment(puuid)}?count=${masteryCount}`
      const masteries = (await riotFetch(masteryUrl)) as unknown
      return jsonResponse({
        puuid,
        platform,
        masteries: Array.isArray(masteries) ? masteries : [],
      })
    }

    if (action === 'champion-highlights') {
      const puuid = String(body.puuid ?? '').trim()
      if (!puuid) {
        return jsonResponse({ error: 'puuid requis.' }, 400)
      }

      const days = Math.min(90, Math.max(1, Number(body.days) || 90))
      const endTime = Math.floor(Date.now() / 1000)
      const startTime = endTime - days * 24 * 60 * 60
      const maxMatches = Math.min(120, Math.max(20, Number(body.maxMatches) || 100))

      const allIds: string[] = []
      let startIndex = 0
      while (allIds.length < maxMatches) {
        const batch = Math.min(100, maxMatches - allIds.length)
        const idsUrl =
          `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/` +
          `${encodePathSegment(puuid)}/ids?startTime=${startTime}&endTime=${endTime}` +
          `&start=${startIndex}&count=${batch}`
        const matchIds = (await riotFetch(idsUrl)) as string[]
        const ids = Array.isArray(matchIds) ? matchIds : []
        if (!ids.length) break
        allIds.push(...ids)
        startIndex += ids.length
        if (ids.length < batch) break
      }

      type ChampAgg = {
        championName: string
        championId: number
        games: number
        wins: number
      }
      const byName = new Map<string, ChampAgg>()

      // Concurrence limitée pour respecter le rate-limit Riot
      const concurrency = 5
      for (let i = 0; i < allIds.length; i += concurrency) {
        const slice = allIds.slice(i, i + concurrency)
        await Promise.all(
          slice.map(async (matchId) => {
            try {
              const matchUrl =
                `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodePathSegment(matchId)}`
              const detail = (await riotFetch(matchUrl)) as {
                info?: { participants?: ParticipantRaw[] }
              }
              const me = (detail?.info?.participants ?? []).find(
                (p) => String(p?.puuid ?? '') === puuid,
              )
              if (!me) return
              const name = String(me.championName ?? '').trim()
              if (!name) return
              const cur = byName.get(name) || {
                championName: name,
                championId: Number(me.championId) || 0,
                games: 0,
                wins: 0,
              }
              cur.games += 1
              if (me.win === true) cur.wins += 1
              if (me.championId) cur.championId = Number(me.championId)
              byName.set(name, cur)
            } catch (err) {
              console.warn('champion-highlights match failed', matchId, err)
            }
          }),
        )
      }

      let masteries: Array<{ championId?: number; championPoints?: number }> = []
      try {
        const masteryUrl =
          `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodePathSegment(puuid)}?count=20`
        const data = (await riotFetch(masteryUrl)) as unknown
        masteries = Array.isArray(data) ? data : []
      } catch (err) {
        console.warn('champion masteries failed:', err)
      }

      const masteryById = new Map<number, number>()
      for (const row of masteries) {
        const id = Number(row.championId)
        if (id) masteryById.set(id, Number(row.championPoints) || 0)
      }

      const totalGames = [...byName.values()].reduce((s, c) => s + c.games, 0)
      const champions = [...byName.values()]
        .sort((a, b) => b.games - a.games)
        .slice(0, 3)
        .map((row) => ({
          ...row,
          winRate: row.games ? Math.round((row.wins / row.games) * 100) : 0,
          playShare: totalGames ? Math.round((row.games / totalGames) * 100) : 0,
          masteryPoints: masteryById.get(row.championId) ?? null,
        }))

      return jsonResponse({
        puuid,
        platform,
        days,
        totalGames,
        matchCount: allIds.length,
        champions,
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
        error:
          'action invalide. Utilise "resolve-account", "league-entries", "champion-masteries", "champion-highlights", "recent-matches", "match-detail" ou "summoner".',
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
