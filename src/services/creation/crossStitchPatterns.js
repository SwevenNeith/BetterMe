/**
 * Persistance des motifs points de croix (Supabase Storage + Postgres).
 */

const TABLE = 'cross_stitch_patterns'
const BUCKET = 'cross-stitch-sources'
const SIGNED_URL_TTL_SEC = 60 * 60
const MAX_FILE_BYTES = 12 * 1024 * 1024

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const LIST_SELECT =
  'id, title, source_storage_path, source_file_name, target_width, color_count, aida_count, strand_count, grid_width, grid_height, metadata, created_at, updated_at'

const FULL_SELECT = `${LIST_SELECT}, grid, palette`

/**
 * Compacte la grille cellules → codes DMC (ou null).
 * @param {Array<Array<{ dmcCode: string } | null>>} grid
 * @returns {(string|null)[][]}
 */
export function compactStitchGrid(grid) {
  if (!Array.isArray(grid)) return []
  return grid.map((row) =>
    (row || []).map((cell) => (cell && cell.dmcCode != null ? String(cell.dmcCode) : null)),
  )
}

/**
 * Reconstruit les cellules { dmcCode, rgb, symbol } depuis codes + palette.
 * @param {(string|null)[][]} compact
 * @param {Array<{ dmcCode: string, symbol?: string, rgb?: { r: number, g: number, b: number }, r?: number, g?: number, b?: number, hex?: string }>} palette
 */
export function expandStitchGrid(compact, palette) {
  /** @type {Map<string, { dmcCode: string, rgb: { r: number, g: number, b: number }, symbol: string }>} */
  const byCode = new Map()
  for (const item of palette || []) {
    if (!item?.dmcCode) continue
    const rgb =
      item.rgb && typeof item.rgb === 'object'
        ? {
            r: Number(item.rgb.r) || 0,
            g: Number(item.rgb.g) || 0,
            b: Number(item.rgb.b) || 0,
          }
        : {
            r: Number(item.r) || 0,
            g: Number(item.g) || 0,
            b: Number(item.b) || 0,
          }
    byCode.set(String(item.dmcCode), {
      dmcCode: String(item.dmcCode),
      rgb,
      symbol: item.symbol || '?',
    })
  }

  if (!Array.isArray(compact)) return []
  return compact.map((row) =>
    (row || []).map((code) => {
      if (code == null || code === '') return null
      const hit = byCode.get(String(code))
      if (hit) return { ...hit }
      return { dmcCode: String(code), rgb: { r: 0, g: 0, b: 0 }, symbol: '?' }
    }),
  )
}

function sanitizeFileName(name) {
  return (name || 'image')
    .trim()
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120)
}

function extensionForFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  const byMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return byMime[file?.type] || 'png'
}

function buildStoragePath(userId, patternId, file) {
  const ext = extensionForFile(file)
  const base = sanitizeFileName(file?.name || `source.${ext}`).replace(/\.[^.]+$/, '')
  const idPart = patternId || crypto.randomUUID()
  return `${userId}/${idPart}/${crypto.randomUUID()}-${base || 'source'}.${ext}`
}

function assertImageFile(file) {
  if (!file) throw new Error('Aucune image source à enregistrer.')
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error('Format non pris en charge (JPEG, PNG, WebP, GIF).')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image trop lourde (max. 12 Mo).')
  }
}

function storageMissingMessage(error) {
  const msg = String(error?.message || '')
  if (msg.includes('Bucket not found') || msg.toLowerCase().includes('not found')) {
    return 'Bucket cross-stitch-sources absent. Exécute scripts/create-cross-stitch-patterns.sql dans Supabase.'
  }
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return 'Table cross_stitch_patterns absente. Exécute scripts/create-cross-stitch-patterns.sql dans Supabase.'
  }
  return null
}

function normalizeTitle(raw) {
  const title = String(raw ?? '').trim() || 'Sans titre'
  return title.slice(0, 120)
}

function normalizePalette(palette) {
  if (!Array.isArray(palette)) return []
  return palette.map((item) => ({
    dmcCode: String(item.dmcCode ?? ''),
    dmcName: String(item.dmcName ?? ''),
    hex: String(item.hex || item.dmcHex || ''),
    symbol: String(item.symbol ?? '?'),
    count: Number(item.count) || 0,
    rgb: item.rgb
      ? {
          r: Number(item.rgb.r) || 0,
          g: Number(item.rgb.g) || 0,
          b: Number(item.rgb.b) || 0,
        }
      : {
          r: Number(item.r) || 0,
          g: Number(item.g) || 0,
          b: Number(item.b) || 0,
        },
  }))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} storagePath
 */
export async function getCrossStitchSourceSignedUrl(supabase, storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC)
  if (error) throw error
  return data?.signedUrl ?? null
}

/**
 * Télécharge l’image source (Blob) depuis Storage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} storagePath
 * @param {string} [fileName]
 * @returns {Promise<File>}
 */
export async function downloadCrossStitchSourceFile(supabase, storagePath, fileName = 'source.png') {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error) {
    throw new Error(storageMissingMessage(error) || error.message || 'Téléchargement image impossible.')
  }
  const type = data.type || 'image/png'
  return new File([data], fileName || 'source.png', { type })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listCrossStitchPatterns(supabase, userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select(LIST_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(storageMissingMessage(error) || error.message || 'Liste des motifs impossible.')
  }
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} patternId
 */
export async function getCrossStitchPattern(supabase, userId, patternId) {
  if (!userId || !patternId) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select(FULL_SELECT)
    .eq('id', patternId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(storageMissingMessage(error) || error.message || 'Chargement du motif impossible.')
  }
  return data
}

/**
 * Crée ou met à jour un motif.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   id?: string|null,
 *   title: string,
 *   sourceFile?: File|Blob|null,
 *   keepSourcePath?: string|null,
 *   targetWidth: number,
 *   colorCount: number,
 *   aidaCount: number,
 *   strandCount: number,
 *   grid: Array<Array<{ dmcCode: string } | null>>,
 *   palette: Array<object>,
 *   metadata?: object,
 * }} payload
 */
export async function saveCrossStitchPattern(supabase, userId, payload) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const grid = payload.grid
  if (!grid?.length) throw new Error('Aucune grille à enregistrer.')

  const gridHeight = grid.length
  const gridWidth = grid[0]?.length || 0
  if (!gridWidth) throw new Error('Grille invalide.')

  const title = normalizeTitle(payload.title)
  const palette = normalizePalette(payload.palette)
  const compactGrid = compactStitchGrid(grid)
  const now = new Date().toISOString()

  const existingId = payload.id || null
  let sourcePath = payload.keepSourcePath || null
  let sourceFileName = ''
  let uploadedNewPath = null

  const file = payload.sourceFile
  if (file) {
    assertImageFile(file)
    sourceFileName = sanitizeFileName(file.name || 'source.png')
    const path = buildStoragePath(userId, existingId, file)
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/png',
    })
    if (uploadError) {
      throw new Error(
        storageMissingMessage(uploadError) || uploadError.message || 'Upload image impossible.',
      )
    }
    uploadedNewPath = path
    sourcePath = path
  }

  if (!sourcePath) {
    throw new Error('Image source manquante (fichier ou chemin Storage).')
  }

  const row = {
    user_id: userId,
    title,
    source_storage_path: sourcePath,
    source_file_name: sourceFileName || sanitizeFileName(payload.keepSourceName || 'source.png'),
    target_width: Number(payload.targetWidth) || 80,
    color_count: Number(payload.colorCount) || 16,
    aida_count: Number(payload.aidaCount) || 14,
    strand_count: Number(payload.strandCount) || 2,
    grid_width: gridWidth,
    grid_height: gridHeight,
    grid: compactGrid,
    palette,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    updated_at: now,
  }

  try {
    if (existingId) {
      // Récupère l’ancien chemin pour nettoyage éventuel
      const { data: prev } = await supabase
        .from(TABLE)
        .select('source_storage_path, source_file_name')
        .eq('id', existingId)
        .eq('user_id', userId)
        .maybeSingle()

      if (!file && prev?.source_file_name) {
        row.source_file_name = prev.source_file_name
      }

      const { data, error } = await supabase
        .from(TABLE)
        .update(row)
        .eq('id', existingId)
        .eq('user_id', userId)
        .select(LIST_SELECT)
        .single()

      if (error) {
        if (uploadedNewPath) await supabase.storage.from(BUCKET).remove([uploadedNewPath])
        throw new Error(storageMissingMessage(error) || error.message || 'Mise à jour impossible.')
      }

      if (
        uploadedNewPath &&
        prev?.source_storage_path &&
        prev.source_storage_path !== uploadedNewPath
      ) {
        await supabase.storage.from(BUCKET).remove([prev.source_storage_path]).catch(() => {})
      }

      return data
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({ ...row, created_at: now })
      .select(LIST_SELECT)
      .single()

    if (error) {
      if (uploadedNewPath) await supabase.storage.from(BUCKET).remove([uploadedNewPath])
      throw new Error(storageMissingMessage(error) || error.message || 'Enregistrement impossible.')
    }
    return data
  } catch (err) {
    if (uploadedNewPath) {
      await supabase.storage.from(BUCKET).remove([uploadedNewPath]).catch(() => {})
    }
    throw err
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} patternId
 */
export async function deleteCrossStitchPattern(supabase, userId, patternId) {
  if (!userId || !patternId) return

  const { data: row, error: fetchError } = await supabase
    .from(TABLE)
    .select('id, source_storage_path')
    .eq('id', patternId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(storageMissingMessage(fetchError) || fetchError.message)
  }
  if (!row) return

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', patternId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(storageMissingMessage(error) || error.message || 'Suppression impossible.')
  }

  if (row.source_storage_path) {
    await supabase.storage.from(BUCKET).remove([row.source_storage_path]).catch(() => {})
  }
}

export { TABLE as CROSS_STITCH_TABLE, BUCKET as CROSS_STITCH_BUCKET }
