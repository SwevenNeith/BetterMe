const TABLE = 'comfort_images'
const BUCKET = 'comfort-images'
const IMAGE_TYPE = 'réconfort'
const SIGNED_URL_TTL_SEC = 3600
const MAX_FILE_BYTES = 8 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function sanitizeFileName(name) {
  return (name || 'image')
    .trim()
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120)
}

function buildStoragePath(userId, fileName) {
  const safeName = sanitizeFileName(fileName)
  return `${userId}/${crypto.randomUUID()}-${safeName}`
}

function assertImageFile(file) {
  if (!file) throw new Error('Aucun fichier sélectionné.')
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Format non pris en charge. Utilise JPEG, PNG, WebP ou GIF.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image trop lourde (max. 8 Mo).')
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listComfortImages(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, user_id, nom, storage_path, type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} storagePath
 */
export async function getComfortImageSignedUrl(supabase, storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC)

  if (error) throw error
  return data?.signedUrl ?? null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listComfortImagesWithUrls(supabase, userId) {
  const rows = await listComfortImages(supabase, userId)
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      try {
        const url = await getComfortImageSignedUrl(supabase, row.storage_path)
        return { ...row, url }
      } catch {
        return { ...row, url: null }
      }
    }),
  )
  return withUrls.filter((row) => row.url)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {File} file
 */
export async function uploadComfortImage(supabase, userId, file) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  assertImageFile(file)

  const storagePath = buildStoragePath(userId, file.name)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      nom: file.name,
      storage_path: storagePath,
      type: IMAGE_TYPE,
    })
    .select('id, user_id, nom, storage_path, type, created_at')
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw error
  }

  const url = await getComfortImageSignedUrl(supabase, storagePath)
  return { ...data, url }
}

/**
 * Remplace le fichier d'une image existante.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} imageId
 * @param {File} file
 */
export async function replaceComfortImage(supabase, userId, imageId, file) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!imageId) throw new Error('Image introuvable.')
  assertImageFile(file)

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) throw readError
  if (!existing) throw new Error('Image introuvable.')

  const newPath = buildStoragePath(userId, file.name)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      nom: file.name,
      storage_path: newPath,
    })
    .eq('id', imageId)
    .eq('user_id', userId)
    .select('id, user_id, nom, storage_path, type, created_at')
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([newPath])
    throw error
  }

  await supabase.storage.from(BUCKET).remove([existing.storage_path])

  const url = await getComfortImageSignedUrl(supabase, newPath)
  return { ...data, url }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ id: string, storage_path: string }} image
 */
export async function deleteComfortImage(supabase, userId, image) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!image?.id) throw new Error('Image introuvable.')

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([image.storage_path])

  if (storageError) throw storageError

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', image.id)
    .eq('user_id', userId)

  if (error) throw error
}

/** Mélange Fisher-Yates (nouvel ordre à chaque appel). */
export function shuffleComfortImages(images) {
  const list = [...images]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}
