const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 25_000

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isPrivateHostname(hostname: string) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map((n) => Number(n))
    if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true
    const [a, b] = parts
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }

  return false
}

function assertImageUrl(raw: unknown) {
  const value = String(raw ?? '').trim()
  if (!value) throw new Error('URL manquante.')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('URL invalide.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Seules les URL http(s) sont acceptées.')
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Cette URL n’est pas autorisée.')
  }
  return parsed.toString()
}

function sniffImageType(bytes: Uint8Array, contentType: string) {
  const header = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (header.startsWith('image/')) return header

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
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
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonError('Method not allowed. Use POST with JSON { url }.', 405)
    }

    const body = await readPayload(req)
    const imageUrl = assertImageUrl(body.url)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let upstream: Response
    try {
      upstream = await fetch(imageUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent': 'BetterMeCrossStitch/1.0',
        },
      })
    } finally {
      clearTimeout(timer)
    }

    if (!upstream.ok) {
      return jsonError(`Téléchargement impossible (${upstream.status}).`, 502)
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer())
    if (!buffer.byteLength) {
      return jsonError('Image vide.', 502)
    }
    if (buffer.byteLength > MAX_BYTES) {
      return jsonError('Image trop lourde (max. 15 Mo).', 413)
    }

    const contentType = sniffImageType(buffer, upstream.headers.get('content-type') || '')
    if (!contentType) {
      return jsonError('Le lien ne pointe pas vers une image.', 415)
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Délai dépassé en récupérant l’image.'
        : err?.message || 'Impossible de récupérer l’image.'
    return jsonError(message, 400)
  }
})
