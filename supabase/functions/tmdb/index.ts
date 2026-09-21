const TMDB_TOKEN = Deno.env.get('TMDB_TOKEN')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function resolveSearchPath(typeRaw) {
  const type = String(typeRaw ?? 'multi').trim().toLowerCase()
  if (type === 'movie') return '/search/movie'
  if (type === 'tv') return '/search/tv'
  return '/search/multi'
}

Deno.serve(async (req) => {
  // Gestion du preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  try {
    if (!TMDB_TOKEN) {
      throw new Error('TMDB_TOKEN is not configured')
    }

    const url = new URL(req.url)

    const query = url.searchParams.get('query')
    const pageRaw = url.searchParams.get('page')
    const page = Math.max(1, Math.min(500, Number.parseInt(String(pageRaw || '1'), 10) || 1))
    const searchPath = resolveSearchPath(url.searchParams.get('type'))

    if (!query) {
      return new Response(
        JSON.stringify({
          error: 'Missing query parameter',
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

    const tmdbUrl =
      `https://api.themoviedb.org/3${searchPath}` +
      `?query=${encodeURIComponent(query)}` +
      `&language=en-US` +
      `&include_adult=false` +
      `&page=${page}`

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
