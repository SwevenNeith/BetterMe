const BUCKET = 'note-images'
const MAX_FILE_BYTES = 8 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
  return EXT_BY_MIME[file?.type] || 'png'
}

function buildStoragePath(userId, noteId, file) {
  const ext = extensionForFile(file)
  const base = sanitizeFileName(file?.name || `pasted-image.${ext}`).replace(/\.[^.]+$/, '')
  const notePart = noteId ? `${noteId}/` : ''
  return `${userId}/${notePart}${crypto.randomUUID()}-${base || 'image'}.${ext}`
}

/**
 * @param {File|Blob|null|undefined} file
 */
export function assertNoteImageFile(file) {
  if (!file) throw new Error('Aucune image à coller.')
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Format non pris en charge. Utilise JPEG, PNG, WebP ou GIF.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image trop lourde (max. 8 Mo).')
  }
}

/**
 * @param {DataTransfer|null|undefined} dataTransfer
 * @returns {File[]}
 */
export function extractImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return []

  /** @type {File[]} */
  const files = []
  const seen = new Set()

  const push = (file) => {
    if (!file || !ALLOWED_MIME.has(file.type) || seen.has(file)) return
    seen.add(file)
    files.push(file)
  }

  if (dataTransfer.files?.length) {
    for (const file of dataTransfer.files) push(file)
  }

  const items = dataTransfer.items
  if (items) {
    for (const item of items) {
      if (item.kind !== 'file' || !String(item.type || '').startsWith('image/')) continue
      push(item.getAsFile())
    }
  }

  return files
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} storagePath
 */
export function getNoteImagePublicUrl(supabase, storagePath) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

/**
 * Upload une image collée / déposée dans une note.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string|null|undefined} noteId
 * @param {File} file
 * @returns {Promise<{ storagePath: string, url: string, markdown: string }>}
 */
export async function uploadNoteImage(supabase, userId, noteId, file) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  assertNoteImageFile(file)

  const storagePath = buildStoragePath(userId, noteId, file)
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type,
  })

  if (uploadError) {
    const msg = String(uploadError.message || '')
    if (msg.includes('Bucket not found') || msg.includes('not found')) {
      throw new Error(
        'Bucket note-images absent. Exécute scripts/create-note-images-storage.sql dans Supabase.',
      )
    }
    throw uploadError
  }

  const url = getNoteImagePublicUrl(supabase, storagePath)
  if (!url) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error('Impossible d’obtenir l’URL publique de l’image.')
  }

  const alt = sanitizeFileName(file.name || 'Image').replace(/\.[^.]+$/, '') || 'Image'
  const markdown = `![${alt}](${url})`

  return { storagePath, url, markdown }
}
