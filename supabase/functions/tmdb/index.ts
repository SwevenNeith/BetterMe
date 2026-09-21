const TMDB_TOKEN = Deno.env.get('TMDB_TOKEN')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_LANGUAGES = new Set(['en-US', 'fr-FR'])

function resolveLanguage(raw: unknown) {
  const value = String(raw ?? 'en-US').trim()
  return ALLOWED_LANGUAGES.has(value) ? value : 'en-US'
}

function resolveSearchPath(typeRaw: unknown) {
  const type = String(typeRaw ?? 'multi')
    .trim()
    .toLowerCase()
  if (type === 'movie') return '/search/movie'
  if (type === 'tv') return '/search/tv'
  return '/search/multi'
}

function resolveDetailsPath(typeRaw: unknown, idRaw: unknown) {
  const type = String(typeRaw ?? '')
    .trim()
    .toLowerCase()
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) return null
  if (type === 'movie') return `/movie/${id}`
  if (type === 'tv') return `/tv/${id}`
  return null
}

function resolveSeasonPath(idRaw: unknown, seasonRaw: unknown) {
  const id = Number.parseInt(String(idRaw ?? ''), 10)
  const season = Number.parseInt(String(seasonRaw ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) return null
  if (!Number.isFinite(season) || season < 0) return null
  return `/tv/${id}/season/${season}`
}

async function readPayload(req: Request) {
  try {
    const data = await req.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  try {
    if (!TMDB_TOKEN) {
      throw new Error('TMDB_TOKEN is not configured')
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({
          error: 'Method not allowed. Use POST with a JSON body.',
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const body = await readPayload(req)
    const action = String(body.action ?? '')
      .trim()
      .toLowerCase()
    const language = resolveLanguage(body.language)

    let tmdbPath = ''
    const tmdbParams = new URLSearchParams()
    tmdbParams.set('language', language)

    if (action === 'details') {
      const mediaType = body.mediaType ?? body.type
      const detailsPath = resolveDetailsPath(mediaType, body.id)
      if (!detailsPath) {
        return new Response(
          JSON.stringify({
            error: 'Missing or invalid mediaType/id for details',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        )
      }

      tmdbPath = detailsPath
      const append = String(body.append_to_response || 'credits,videos').trim()
      if (append) tmdbParams.set('append_to_response', append)
    } else if (action === 'search') {
      const query = String(body.query ?? '').trim()
      if (!query) {
        return new Response(
          JSON.stringify({
            error: 'Missing query in body',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        )
      }

      const page = Math.max(1, Math.min(500, Number.parseInt(String(body.page || '1'), 10) || 1))
      tmdbPath = resolveSearchPath(body.mediaType ?? body.type)
      tmdbParams.set('query', query)
      tmdbParams.set('include_adult', 'false')
      tmdbParams.set('page', String(page))
    } else if (action === 'season') {
      const seasonPath = resolveSeasonPath(body.id ?? body.tmdbId, body.seasonNumber ?? body.season)
      if (!seasonPath) {
        return new Response(
          JSON.stringify({
            error: 'Missing or invalid id/seasonNumber for season',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        )
      }
      tmdbPath = seasonPath
    } else {
      return new Response(
        JSON.stringify({
          error: 'Missing action in body: "search", "details" or "season"',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const tmdbUrl = `https://api.themoviedb.org/3${tmdbPath}?${tmdbParams.toString()}`

    const response = await fetch(tmdbUrl, {
      headers: {
        Authorization: `Bearer ${TMDB_TOKEN}`,
        accept: 'application/json',
      },
    })

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error(error)

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  }
})
