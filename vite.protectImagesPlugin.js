/**
 * Empêche Cross-Origin-Embedder-Policy: require-corp (souvent ajouté pour
 * SharedArrayBuffer / Whisper) de casser toutes les images cross-origin
 * (Supabase, TMDB, Open Library) qui n’envoient pas de header CORP.
 *
 * Si une isolation cross-origin est nécessaire, on force `credentialless`
 * qui autorise les <img> sans CORP.
 */
function downgradeCoepHeader(name, value) {
  const key = String(name || '').toLowerCase()
  if (key !== 'cross-origin-embedder-policy') return value
  const raw = Array.isArray(value) ? value.join(', ') : String(value ?? '')
  if (/require-corp/i.test(raw)) return 'credentialless'
  return value
}

function wrapSetHeader(res) {
  if (res.__bettermeCoepPatched) return
  res.__bettermeCoepPatched = true
  const originalSetHeader = res.setHeader.bind(res)
  res.setHeader = (name, value) => originalSetHeader(name, downgradeCoepHeader(name, value))
}

export function betterMeProtectImagesPlugin() {
  return {
    name: 'betterme-protect-images',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        wrapSetHeader(res)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        wrapSetHeader(res)
        next()
      })
    },
  }
}
