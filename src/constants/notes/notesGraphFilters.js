/**
 * Prefs de filtres de la vue globale Notes (persistées multi-appareils).
 */

export const GRAPH_FOLDER_COLOR_PRESETS = [
  '#e53935',
  '#fb8c00',
  '#fdd835',
  '#43a047',
  '#1e88e5',
  '#8e24aa',
  '#ad81be',
  '#00897b',
  '#6d4c41',
  '#546e7a',
]

/**
 * @returns {{
 *   hiddenFolderIds: string[],
 *   folderColors: Record<string, string>,
 *   onlyFolderId: string | null,
 * }}
 */
export function createDefaultNotesGraphFilters() {
  return {
    hiddenFolderIds: [],
    folderColors: {},
    onlyFolderId: null,
  }
}

/**
 * @param {unknown} raw
 */
export function mergeNotesGraphFilters(raw) {
  const defaults = createDefaultNotesGraphFilters()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  const source = /** @type {Record<string, unknown>} */ (raw)
  const hidden = Array.isArray(source.hiddenFolderIds)
    ? source.hiddenFolderIds.map((id) => String(id)).filter(Boolean)
    : []

  /** @type {Record<string, string>} */
  const folderColors = {}
  if (source.folderColors && typeof source.folderColors === 'object' && !Array.isArray(source.folderColors)) {
    for (const [id, color] of Object.entries(source.folderColors)) {
      const hex = String(color ?? '').trim()
      if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) folderColors[String(id)] = hex
    }
  }

  const only =
    source.onlyFolderId == null || source.onlyFolderId === ''
      ? null
      : String(source.onlyFolderId)

  return {
    hiddenFolderIds: [...new Set(hidden)],
    folderColors,
    onlyFolderId: only,
  }
}

/**
 * IDs d’un dossier et de tous ses descendants.
 * @param {{ id: string, parent_id?: string | null }[]} folders
 * @param {string} folderId
 */
export function collectFolderAndDescendantIds(folders, folderId) {
  const root = String(folderId ?? '')
  if (!root) return new Set()
  const ids = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders ?? []) {
      const id = folder?.id
      const parent = folder?.parent_id ?? null
      if (!id || ids.has(id)) continue
      if (parent && ids.has(parent)) {
        ids.add(id)
        grew = true
      }
    }
  }
  return ids
}

/**
 * Filtre les notes selon les prefs graphe + attache couleur de dossier.
 * @param {{ id: string, folder_id?: string | null, title?: string, content_md?: string }[]} notes
 * @param {{ id: string, parent_id?: string | null, name?: string }[]} folders
 * @param {ReturnType<typeof createDefaultNotesGraphFilters>} filters
 */
export function filterNotesForGraph(notes, folders, filters) {
  const prefs = mergeNotesGraphFilters(filters)
  const list = Array.isArray(notes) ? notes : []

  /** @type {Set<string>} */
  let allowedFolderIds = null
  if (prefs.onlyFolderId) {
    allowedFolderIds = collectFolderAndDescendantIds(folders, prefs.onlyFolderId)
  }

  /** @type {Set<string>} */
  const hidden = new Set()
  for (const folderId of prefs.hiddenFolderIds) {
    for (const id of collectFolderAndDescendantIds(folders, folderId)) {
      hidden.add(id)
    }
  }

  /** Couleur = dossier exact, sinon plus proche ancêtre coloré */
  const folderById = new Map((folders ?? []).map((folder) => [folder.id, folder]))
  function resolveFolderColor(folderId) {
    let current = folderId
    while (current) {
      const color = prefs.folderColors[current]
      if (color) return color
      current = folderById.get(current)?.parent_id ?? null
    }
    return null
  }

  return list
    .filter((note) => {
      const folderId = note.folder_id ?? null
      if (folderId && hidden.has(folderId)) return false
      if (allowedFolderIds) {
        if (!folderId || !allowedFolderIds.has(folderId)) return false
      }
      return true
    })
    .map((note) => {
      const folderId = note.folder_id ?? null
      return {
        ...note,
        _graphFolderId: folderId,
        _graphColor: folderId ? resolveFolderColor(folderId) : null,
      }
    })
}
