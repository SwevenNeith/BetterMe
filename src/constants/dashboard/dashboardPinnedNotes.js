import {
  extractNoteWidgets,
  findNoteWidgetFence,
  listNoteWidgetFences,
} from '../utils/noteWidgets.js'

/** Préfixe des widgets Dashboard « note épinglée ». */
export const PINNED_NOTE_WIDGET_PREFIX = 'pinned-note:'

/** Event : note enregistrée (même onglet) → rafraîchir les vues Dashboard liées. */
export const NOTE_UPDATED_EVENT = 'betterme-note-updated'

const PREFIX_LEN = PINNED_NOTE_WIDGET_PREFIX.length

/**
 * @param {string | null | undefined} id
 */
export function isPinnedNoteWidgetId(id) {
  return typeof id === 'string' && id.startsWith(PINNED_NOTE_WIDGET_PREFIX) && id.length > PREFIX_LEN
}

/**
 * @returns {string}
 */
export function createPinnedNoteWidgetId() {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${PINNED_NOTE_WIDGET_PREFIX}${uuid}`
}

/**
 * @returns {string}
 */
export function createDashboardExcerptId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ex-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {string} excerptId
 */
export function getDashboardExcerptOpenMarker(excerptId) {
  return `<!-- betterme-pin:${excerptId} -->`
}

/**
 * @param {string} excerptId
 */
export function getDashboardExcerptCloseMarker(excerptId) {
  return `<!-- /betterme-pin:${excerptId} -->`
}

/**
 * Extrait le Markdown entre les balises d’un pin Dashboard.
 * @param {string} contentMd
 * @param {string | null | undefined} excerptId
 * @returns {string | null}
 */
export function extractDashboardExcerpt(contentMd, excerptId) {
  const id = String(excerptId ?? '').trim()
  if (!id) return null
  const source = String(contentMd ?? '')
  const open = getDashboardExcerptOpenMarker(id)
  const close = getDashboardExcerptCloseMarker(id)
  const start = source.indexOf(open)
  if (start < 0) return null
  const contentStart = start + open.length
  const end = source.indexOf(close, contentStart)
  if (end < 0) return null
  return source.slice(contentStart, end).replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

/**
 * Retire les balises d’un extrait (garde le contenu). Gère aussi les orphelines.
 * @param {string} contentMd
 * @param {string | null | undefined} excerptId
 * @returns {string}
 */
export function stripDashboardExcerptMarkers(contentMd, excerptId) {
  const id = String(excerptId ?? '').trim()
  let source = String(contentMd ?? '')
  if (!id || !source) return source

  const open = getDashboardExcerptOpenMarker(id)
  const close = getDashboardExcerptCloseMarker(id)

  const openIdx = source.indexOf(open)
  if (openIdx >= 0) {
    const contentStart = openIdx + open.length
    const closeIdx = source.indexOf(close, contentStart)
    if (closeIdx >= 0) {
      const before = source.slice(0, openIdx)
      let mid = source.slice(contentStart, closeIdx)
      const after = source.slice(closeIdx + close.length)
      mid = mid.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
      const needsGap =
        before.length &&
        after.length &&
        !before.endsWith('\n') &&
        !mid.startsWith('\n') &&
        !mid.endsWith('\n') &&
        !after.startsWith('\n')
      source = `${before}${mid}${needsGap ? '\n' : ''}${after}`
    }
  }

  // Orphelines / restes éventuels pour cet id
  source = source.split(open).join('').split(close).join('')
  return source.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Retire toutes les balises betterme-pin dont l’id n’est pas à conserver
 * (paires + orphelines). Utile au retrait d’une vue Dashboard.
 * @param {string} contentMd
 * @param {Iterable<string | null | undefined>} [keepExcerptIds]
 * @returns {string}
 */
export function stripUnreferencedDashboardPinMarkers(contentMd, keepExcerptIds = []) {
  const keep = new Set(
    [...keepExcerptIds].map((id) => String(id ?? '').trim()).filter(Boolean),
  )
  let source = String(contentMd ?? '')
  if (!source) return source

  const found = new Set()
  const idRe = /<!--\s*\/?betterme-pin:([a-zA-Z0-9_-]+)\s*-->/g
  let match
  while ((match = idRe.exec(source))) {
    found.add(match[1])
  }

  for (const id of found) {
    if (keep.has(id)) {
      const open = getDashboardExcerptOpenMarker(id)
      const close = getDashboardExcerptCloseMarker(id)
      const hasPair = extractDashboardExcerpt(source, id) != null
      if (hasPair) continue
      // Paire cassée (souvent des opens orphelins) : retirer les balises.
      source = source.split(open).join('').split(close).join('')
      continue
    }
    source = stripDashboardExcerptMarkers(source, id)
  }
  return source.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Entoure une plage du contenu par des balises d’extrait Dashboard.
 * @param {string} contentMd
 * @param {number} start
 * @param {number} end
 * @param {string} excerptId
 * @returns {{ contentMd: string, excerptMd: string }}
 */
export function wrapDashboardExcerptAtRange(contentMd, start, end, excerptId) {
  const source = String(contentMd ?? '')
  const from = Math.max(0, Math.min(start, end))
  const to = Math.max(0, Math.max(start, end))
  const mid = source.slice(from, to)
  const open = getDashboardExcerptOpenMarker(excerptId)
  const close = getDashboardExcerptCloseMarker(excerptId)

  if (source.includes(open) && source.includes(close)) {
    const existing = extractDashboardExcerpt(source, excerptId)
    if (existing != null) {
      return { contentMd: source, excerptMd: existing }
    }
  }

  const before = source.slice(0, from)
  const after = source.slice(to)
  const lead = before.length && !before.endsWith('\n') ? '\n' : ''
  const trail = after.length && !after.startsWith('\n') ? '\n' : ''
  return {
    contentMd: `${before}${lead}${open}\n${mid}\n${close}${trail}${after}`,
    excerptMd: mid,
  }
}

/**
 * Cherche un extrait dans le contenu et l’entoure de balises.
 * @param {string} contentMd
 * @param {string} excerptText
 * @param {string} excerptId
 * @returns {{ contentMd: string, excerptMd: string } | null}
 */
export function findAndWrapDashboardExcerpt(contentMd, excerptText, excerptId) {
  const source = String(contentMd ?? '')
  const excerpt = String(excerptText ?? '')
  if (!excerpt) return null

  const existing = extractDashboardExcerpt(source, excerptId)
  if (existing != null) {
    return { contentMd: source, excerptMd: existing }
  }

  // Widget : le fence reconstruit (` ```widget`) peut différer du lang réel.
  const widgetFence = findNoteWidgetFence(source, { fenceText: excerpt, inner: excerpt })
  if (widgetFence) {
    return wrapDashboardExcerptAtRange(
      source,
      widgetFence.start,
      widgetFence.end,
      excerptId,
    )
  }

  let idx = source.indexOf(excerpt)
  if (idx < 0) {
    const normalizedSource = source.replace(/\r\n/g, '\n')
    const normalizedExcerpt = excerpt.replace(/\r\n/g, '\n')
    idx = normalizedSource.indexOf(normalizedExcerpt)
    if (idx < 0) return null
    return wrapDashboardExcerptAtRange(
      normalizedSource,
      idx,
      idx + normalizedExcerpt.length,
      excerptId,
    )
  }
  return wrapDashboardExcerptAtRange(source, idx, idx + excerpt.length, excerptId)
}

/**
 * Entoure la n-ième fence widget (ordre de rendu) de balises Dashboard.
 * @param {string} contentMd
 * @param {number} widgetIndex
 * @param {string} excerptId
 * @returns {{ contentMd: string, excerptMd: string, widgetIndex: number } | null}
 */
export function wrapDashboardExcerptAtWidgetIndex(contentMd, widgetIndex, excerptId) {
  const fence = findNoteWidgetFence(contentMd, { index: widgetIndex })
  if (!fence) return null
  const wrapped = wrapDashboardExcerptAtRange(
    contentMd,
    fence.start,
    fence.end,
    excerptId,
  )
  return { ...wrapped, widgetIndex }
}

/**
 * Résout le Markdown live d’un pin (note entière, extrait balisé, ou widget).
 * @param {string | null | undefined} liveMd
 * @param {{
 *   partTitle?: string,
 *   excerptId?: string,
 *   widgetIndex?: number | null,
 *   contentMd?: string,
 * } | null | undefined} pin
 * @returns {string}
 */
export function resolveLivePinnedContent(liveMd, pin) {
  const stored = String(pin?.contentMd ?? '')
  const partTitle = String(pin?.partTitle ?? '').trim()
  const excerptId = String(pin?.excerptId ?? '').trim()
  const widgetIndex = pin?.widgetIndex

  if (!partTitle) {
    return liveMd != null ? String(liveMd) : stored
  }

  if (excerptId && typeof liveMd === 'string') {
    const excerpt = extractDashboardExcerpt(liveMd, excerptId)
    if (excerpt != null) return excerpt
  }

  if (typeof liveMd === 'string') {
    const liveFences = listNoteWidgetFences(liveMd)
    if (
      Number.isFinite(widgetIndex) &&
      widgetIndex >= 0 &&
      widgetIndex < liveFences.length
    ) {
      return liveFences[widgetIndex].fence
    }

    const storedWidgets = extractNoteWidgets(stored).widgets.filter((w) =>
      String(w).trim(),
    )
    if (storedWidgets.length) {
      // Un seul widget dans la note + pin widget → toujours le live (cas fréquent).
      if (storedWidgets.length === 1 && liveFences.length === 1) {
        return liveFences[0].fence
      }
      const matched = []
      for (const body of storedWidgets) {
        const hit = liveFences.find(
          (entry) => entry.body === body || entry.body.trim() === body.trim(),
        )
        if (hit) matched.push(hit.fence)
      }
      if (matched.length === storedWidgets.length) {
        return matched.join('\n\n')
      }
      // Après édition le body ne matche plus : si un seul widget stocké et un index
      // plausible, préférer le live quand la note n’a qu’un widget.
      if (storedWidgets.length === 1 && liveFences.length === 1) {
        return liveFences[0].fence
      }
    }
  }

  return stored
}

/**
 * Titre Réglages / carte : « Note - Titre » ou « Note - Titre - partie ».
 * @param {{ noteTitle?: string, partTitle?: string } | null | undefined} pin
 */
export function formatPinnedNoteWidgetLabel(pin) {
  const title = String(pin?.noteTitle ?? '').trim() || 'Sans titre'
  const part = String(pin?.partTitle ?? '').trim()
  if (part) return `Note - ${title} - ${part}`
  return `Note - ${title}`
}

/**
 * Titre de partie depuis un extrait Markdown.
 * @param {string} excerpt
 */
export function derivePinnedNotePartTitle(excerpt) {
  const lines = String(excerpt ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return ''
  let first = lines[0]
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^([-*+]|\d+[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/[*_`~]+/g, '')
    .trim()
  if (!first) return ''
  if (first.length > 48) return `${first.slice(0, 45)}…`
  return first
}

/**
 * Notifie les vues Dashboard qu’une note a changé (même onglet).
 * @param {{ noteId: string, title?: string, contentMd?: string }} detail
 */
export function notifyNoteUpdated(detail) {
  const noteId = String(detail?.noteId ?? '').trim()
  if (!noteId || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(NOTE_UPDATED_EVENT, {
      detail: {
        noteId,
        title: detail?.title,
        contentMd: detail?.contentMd,
      },
    }),
  )
}

/**
 * @param {unknown} raw
 * @returns {Record<string, {
 *   noteId: string,
 *   vaultId: string | null,
 *   noteTitle: string,
 *   partTitle: string,
 *   excerptId: string,
 *   widgetIndex: number | null,
 *   contentMd: string,
 *   createdAt: string,
 * }>}
 */
export function normalizeDashboardPins(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  /** @type {Record<string, any>} */
  const out = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!isPinnedNoteWidgetId(id) || !value || typeof value !== 'object') continue
    const noteId = typeof value.noteId === 'string' ? value.noteId.trim() : ''
    if (!noteId) continue
    const rawIndex = value.widgetIndex
    const widgetIndex =
      typeof rawIndex === 'number' && Number.isFinite(rawIndex) && rawIndex >= 0
        ? Math.floor(rawIndex)
        : null
    out[id] = {
      noteId,
      vaultId: typeof value.vaultId === 'string' && value.vaultId ? value.vaultId : null,
      noteTitle: String(value.noteTitle ?? '').trim() || 'Sans titre',
      partTitle: String(value.partTitle ?? '').trim(),
      excerptId: String(value.excerptId ?? '').trim(),
      widgetIndex,
      contentMd: String(value.contentMd ?? ''),
      createdAt:
        typeof value.createdAt === 'string' && value.createdAt
          ? value.createdAt
          : new Date().toISOString(),
    }
  }
  return out
}
