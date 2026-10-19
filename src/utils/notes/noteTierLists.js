import { mixVaultHex, isDarkHex } from '../../constants/notes/noteVaults.js'

export const NOTE_TIERLIST_PLACEHOLDER_CLASS = 'notes-tierlist-widget'
export const NOTE_TIERLIST_INDEX_ATTR = 'data-tierlist-index'
export const NOTE_TIERLIST_LANG = 'tierlist'

const TIERLIST_FENCE_RE = /^```tierlist[ \t]*\r?\n([\s\S]*?)```/gim

/** Couleurs style tiermaker (dégradé S → …, pour les tiers ajoutés). */
export const DEFAULT_TIER_COLORS = [
  '#ff7f7f',
  '#ffbf7f',
  '#ffdf7f',
  '#ffff7f',
  '#bfff7f',
  '#7fff7f',
  '#7fffcf',
  '#7fffff',
  '#7fbfff',
  '#7f9fff',
  '#bf7fff',
  '#ff7fff',
]
export const DEFAULT_TIER_NAMES = ['S', 'A', 'B', 'C']

/**
 * Couleur du n-ième tier dans le dégradé classique.
 * @param {number} index
 */
export function tierColorAtIndex(index) {
  const i = Math.max(0, Number(index) || 0)
  return DEFAULT_TIER_COLORS[i % DEFAULT_TIER_COLORS.length]
}

/**
 * @returns {string}
 */
export function createTierListId(prefix = 't') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @param {{ name?: string, color?: string, items?: { id?: string, label: string }[] }} [opts]
 */
export function createTierListTier(opts = {}) {
  return {
    id: createTierListId('t'),
    name: String(opts.name ?? 'S').slice(0, 40) || 'S',
    color: normalizeTierColor(opts.color) || DEFAULT_TIER_COLORS[0],
    items: Array.isArray(opts.items)
      ? opts.items.map((item) => createTierListItem(item)).filter(Boolean)
      : [],
  }
}

/**
 * @param {{ id?: string, label?: string } | string} [input]
 */
export function createTierListItem(input) {
  if (typeof input === 'string') {
    const label = input.trim()
    if (!label) return null
    return { id: createTierListId('i'), label: label.slice(0, 120) }
  }
  const label = String(input?.label ?? '').trim()
  if (!label) return null
  return {
    id: String(input?.id || '').trim() || createTierListId('i'),
    label: label.slice(0, 120),
  }
}

/**
 * @param {string | null | undefined} color
 */
export function normalizeTierColor(color) {
  const raw = String(color ?? '').trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase()
    }
    return raw.toLowerCase()
  }
  return null
}

/**
 * Tier list par défaut : 4 rangs S/A/B/C.
 * @returns {{ version: number, tiers: ReturnType<typeof createTierListTier>[], pool: NonNullable<ReturnType<typeof createTierListItem>>[] }}
 */
export function createDefaultTierList() {
  return {
    version: 1,
    tiers: DEFAULT_TIER_NAMES.map((name, index) =>
      createTierListTier({ name, color: DEFAULT_TIER_COLORS[index] }),
    ),
    pool: [],
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeTierListData(raw) {
  const fallback = createDefaultTierList()
  if (!raw || typeof raw !== 'object') return fallback

  const source = /** @type {Record<string, unknown>} */ (raw)
  const tiersIn = Array.isArray(source.tiers) ? source.tiers : []
  const tiers =
    tiersIn.length > 0
      ? tiersIn.slice(0, 16).map((tier, index) => {
          const entry = tier && typeof tier === 'object' ? /** @type {Record<string, unknown>} */ (tier) : {}
          return createTierListTier({
            name: String(entry.name ?? DEFAULT_TIER_NAMES[index] ?? `T${index + 1}`),
            color: normalizeTierColor(entry.color) || tierColorAtIndex(index),
            items: Array.isArray(entry.items) ? entry.items : [],
          })
        })
      : fallback.tiers.map((tier) => ({ ...tier, items: [...tier.items] }))

  // Préserve les ids stables si valides
  for (let i = 0; i < tiers.length; i += 1) {
    const entry = tiersIn[i]
    if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id.trim()) {
      tiers[i].id = entry.id.trim()
    }
  }

  const pool = Array.isArray(source.pool)
    ? source.pool.map((item) => createTierListItem(item)).filter(Boolean)
    : []

  return { version: 1, tiers, pool }
}

/**
 * @param {string} body
 */
export function parseTierListBody(body) {
  const text = String(body ?? '').trim()
  if (!text) return createDefaultTierList()
  try {
    return normalizeTierListData(JSON.parse(text))
  } catch {
    return createDefaultTierList()
  }
}

/**
 * @param {unknown} data
 */
export function serializeTierList(data) {
  const normalized = normalizeTierListData(data)
  return `${JSON.stringify(normalized, null, 2)}\n`
}

/**
 * Fence Markdown complète pour insertion.
 * @param {unknown} [data]
 */
export function buildTierListFence(data) {
  const body = serializeTierList(data ?? createDefaultTierList()).trimEnd()
  return `\`\`\`${NOTE_TIERLIST_LANG}\n${body}\n\`\`\``
}

/**
 * @param {string} markdown
 * @returns {{ start: number, end: number, body: string, fence: string }[]}
 */
export function listNoteTierListFences(markdown) {
  const source = String(markdown ?? '')
  /** @type {{ start: number, end: number, body: string, fence: string }[]} */
  const fences = []
  const re = new RegExp(TIERLIST_FENCE_RE.source, 'gim')
  let match
  while ((match = re.exec(source))) {
    let body = String(match[1] ?? '')
    if (body.endsWith('\n')) body = body.slice(0, -1)
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      body,
      fence: match[0],
    })
  }
  return fences
}

/**
 * Remplace les fences ```tierlist par des placeholders HTML.
 * @param {string} markdown
 * @returns {{ text: string, tierLists: ReturnType<typeof parseTierListBody>[] }}
 */
export function extractNoteTierLists(markdown) {
  /** @type {ReturnType<typeof parseTierListBody>[]} */
  const tierLists = []
  const text = String(markdown ?? '').replace(TIERLIST_FENCE_RE, (full, body) => {
    let source = String(body ?? '')
    if (source.endsWith('\n')) source = source.slice(0, -1)
    const index = tierLists.length
    tierLists.push(parseTierListBody(source))
    return `\n\n<div class="${NOTE_TIERLIST_PLACEHOLDER_CLASS}" ${NOTE_TIERLIST_INDEX_ATTR}="${index}"></div>\n\n`
  })
  return { text, tierLists }
}

/**
 * Remplace le corps JSON de la n-ième fence tierlist.
 * @param {string} markdown
 * @param {number} index
 * @param {unknown} data
 */
export function replaceNoteTierListAt(markdown, index, data) {
  const fences = listNoteTierListFences(markdown)
  if (!Number.isFinite(index) || index < 0 || index >= fences.length) {
    return { content: String(markdown ?? ''), changed: false }
  }
  const fence = fences[index]
  const nextBody = serializeTierList(data).trimEnd()
  const nextFence = `\`\`\`${NOTE_TIERLIST_LANG}\n${nextBody}\n\`\`\``
  if (fence.fence === nextFence) {
    return { content: String(markdown ?? ''), changed: false }
  }
  const content = `${String(markdown ?? '').slice(0, fence.start)}${nextFence}${String(markdown ?? '').slice(fence.end)}`
  return { content, changed: true }
}

/**
 * Couleurs du plateau adaptées au coffre / thème général.
 * @param {Record<string, string> | null | undefined} vaultStyle
 */
export function resolveTierListTheme(vaultStyle) {
  const surface = String(vaultStyle?.['--notes-vault-main-bg'] ?? '').trim()
  const accent = String(vaultStyle?.['--notes-vault-accent'] ?? '').trim()
  const color = String(vaultStyle?.['--notes-vault-color'] ?? '').trim()

  if (surface && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(surface)) {
    const boardBg = isDarkHex(surface)
      ? mixVaultHex('#000000', surface, 0.45)
      : mixVaultHex('#1a1524', surface, 0.22)
    const controlsBg = isDarkHex(surface)
      ? mixVaultHex('#000000', surface, 0.62)
      : mixVaultHex('#120e1a', surface, 0.18)
    const poolBg = isDarkHex(surface)
      ? mixVaultHex('#000000', surface, 0.35)
      : mixVaultHex('#241c32', surface, 0.28)
    const border = mixVaultHex(accent || color || '#8866aa', boardBg, 0.35)
    return { boardBg, controlsBg, poolBg, border, labelText: '#111111' }
  }

  // Hors coffre : plateau sombre tirant sur le violet général des notes
  return {
    boardBg: '#2a2438',
    controlsBg: '#1a1524',
    poolBg: '#322a42',
    border: '#4a3f5c',
    labelText: '#111111',
  }
}
