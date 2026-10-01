import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'

const FETCH_IMAGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/fetch-image`

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? supabaseAnonKey
  return {
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  }
}

/**
 * Récupère une image distante via l’edge function (contourne le CORS navigateur).
 * @param {string} url
 * @returns {Promise<{ blob: Blob, contentType: string }>}
 */
export async function fetchRemoteImageViaProxy(url) {
  const response = await fetch(FETCH_IMAGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
      'Content-Type': 'application/json',
      Accept: 'image/*,application/json',
    },
    body: JSON.stringify({ url }),
  })

  const contentType = String(response.headers.get('content-type') || '')
  if (!response.ok) {
    let message = `Téléchargement impossible (${response.status}).`
    if (contentType.includes('application/json')) {
      try {
        const data = await response.json()
        if (data?.error) message = String(data.error)
      } catch {
        /* ignore */
      }
    }
    throw new Error(message)
  }

  if (!contentType.startsWith('image/')) {
    throw new Error('Le lien ne pointe pas vers une image.')
  }

  const blob = await response.blob()
  if (!blob.size) throw new Error('Image vide.')
  return { blob, contentType }
}

/**
 * Essaie d’abord un fetch direct, puis le proxy Supabase si le CORS bloque.
 * @param {string} url
 * @returns {Promise<{ blob: Blob, contentType: string }>}
 */
export async function fetchRemoteImageBlob(url) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
    })
    if (!response.ok) {
      throw new Error(`Téléchargement impossible (${response.status}).`)
    }
    const blob = await response.blob()
    const type = String(blob.type || response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!type.startsWith('image/') && type !== 'application/octet-stream') {
      throw new Error('direct-not-image')
    }
    return {
      blob,
      contentType: type.startsWith('image/') ? type : 'image/jpeg',
    }
  } catch (directError) {
    // CORS / opaque / réseau → proxy serveur
    try {
      return await fetchRemoteImageViaProxy(url)
    } catch (proxyError) {
      const proxyMsg = String(proxyError?.message || '')
      if (
        proxyMsg.includes('Failed to send') ||
        proxyMsg.includes('Failed to fetch') ||
        proxyMsg.includes('404') ||
        proxyMsg.toLowerCase().includes('not found')
      ) {
        throw new Error(
          'Impossible de récupérer l’image (CORS). Déploie la fonction Supabase « fetch-image », ou télécharge l’image puis téléverse-la.',
        )
      }
      if (proxyMsg) throw proxyError
      throw directError
    }
  }
}
