/**
 * Extrait les titres ciblés par des wikilinks [[Titre]] / [[Titre|Alias]].
 * Ignore le contenu des blocs et spans de code.
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractWikiLinkTitles(markdown) {
  const segments = []
  let text = String(markdown ?? '')
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    segments.push(match)
    return `\0CODE${segments.length - 1}\0`
  })
  text = text.replace(/`[^`\n]+`/g, (match) => {
    segments.push(match)
    return `\0CODE${segments.length - 1}\0`
  })

  /** @type {string[]} */
  const titles = []
  text.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_, rawTitle) => {
    const title = String(rawTitle ?? '').trim()
    if (title) titles.push(title)
    return _
  })
  return titles
}

/**
 * Construit le graphe notes + liens (non orienté pour l’affichage).
 * @param {{ id: string, title: string, content_md?: string }[]} notes
 * @returns {{ nodes: { id: string, title: string }[], edges: { source: string, target: string }[] }}
 */
export function buildNotesGraph(notes) {
  const list = Array.isArray(notes) ? notes : []
  const byTitle = new Map()
  for (const note of list) {
    const key = String(note?.title ?? '')
      .trim()
      .toLowerCase()
    if (key && !byTitle.has(key)) byTitle.set(key, note)
  }

  const nodes = list.map((note) => ({
    id: note.id,
    title: String(note.title ?? '').trim() || 'Sans titre',
  }))

  const edgeKeys = new Set()
  /** @type {{ source: string, target: string }[]} */
  const edges = []

  for (const note of list) {
    const titles = extractWikiLinkTitles(note.content_md ?? '')
    for (const title of titles) {
      const target = byTitle.get(title.toLowerCase())
      if (!target?.id || target.id === note.id) continue
      const a = note.id < target.id ? note.id : target.id
      const b = note.id < target.id ? target.id : note.id
      const key = `${a}::${b}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ source: note.id, target: target.id })
    }
  }

  return { nodes, edges }
}
