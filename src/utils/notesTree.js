/**
 * Construit une arborescence triée : dossiers (alpha) puis notes (alpha), récursif.
 * @param {{ id: string, parent_id: string | null, name: string }[]} folders
 * @param {{ id: string, folder_id: string | null, title: string }[]} notes
 * @param {string | null} [parentId]
 */
export function buildNotesTree(folders, notes, parentId = null) {
  const folderChildren = (folders ?? [])
    .filter((folder) => (folder.parent_id ?? null) === parentId)
    .slice()
    .sort((a, b) => compareAlpha(a.name, b.name))
    .map((folder) => ({
      type: 'folder',
      id: folder.id,
      name: folder.name,
      children: buildNotesTree(folders, notes, folder.id),
    }))

  const noteChildren = (notes ?? [])
    .filter((note) => (note.folder_id ?? null) === parentId)
    .slice()
    .sort((a, b) => compareAlpha(a.title, b.title))
    .map((note) => ({
      type: 'note',
      id: note.id,
      title: note.title,
      system_key: note.system_key ?? null,
    }))

  return [...folderChildren, ...noteChildren]
}

function compareAlpha(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', {
    sensitivity: 'base',
    numeric: true,
  })
}

/**
 * Options plates pour un select de dossier (avec indentation).
 * @param {{ id: string, parent_id: string | null, name: string }[]} folders
 * @param {string | null} [excludeFolderId] — exclus (et descendants) pour éviter cycles
 */
export function flattenFolderOptions(folders, excludeFolderId = null) {
  const excluded = new Set()
  if (excludeFolderId) {
    excluded.add(excludeFolderId)
    const queue = [excludeFolderId]
    while (queue.length) {
      const current = queue.shift()
      for (const folder of folders ?? []) {
        if ((folder.parent_id ?? null) === current && !excluded.has(folder.id)) {
          excluded.add(folder.id)
          queue.push(folder.id)
        }
      }
    }
  }

  /** @type {{ id: string | null, label: string }[]} */
  const options = [{ id: null, label: 'Racine' }]

  function walk(parentId, depth) {
    const children = (folders ?? [])
      .filter((folder) => (folder.parent_id ?? null) === parentId && !excluded.has(folder.id))
      .slice()
      .sort((a, b) => compareAlpha(a.name, b.name))

    for (const folder of children) {
      const indent = depth > 0 ? `${'—'.repeat(depth)} ` : ''
      options.push({ id: folder.id, label: `${indent}${folder.name}` })
      walk(folder.id, depth + 1)
    }
  }

  walk(null, 0)
  return options
}
