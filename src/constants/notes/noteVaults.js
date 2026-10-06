/** Clé des paramètres pour l’espace hors coffre (tutoriel, Daily Notes, notes libres). */
export const NOTE_VAULT_ROOT_KEY = 'root'

export const NOTE_VAULT_DEFAULT_PRIMARY = '#ad81be'
export const NOTE_VAULT_DEFAULT_ACCENT = '#d5b5ea'
export const NOTE_VAULT_DEFAULT_SURFACE = '#f4f0fa'
export const NOTE_VAULT_DEFAULT_SIDEBAR = '#ebe0f5'
export const NOTE_VAULT_DEFAULT_GRADIENT = '#95d1aa'
export const NOTE_VAULT_DEFAULT_ICON = '🗄️'

/**
 * @param {string | null | undefined} value
 */
export function normalizeVaultIcon(value) {
  const raw = String(value ?? '').trim()
  return raw || NOTE_VAULT_DEFAULT_ICON
}

/**
 * @param {string | null | undefined} value
 * @param {string} [fallback]
 */
export function normalizeVaultHex(value, fallback = NOTE_VAULT_DEFAULT_PRIMARY) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const h = withHash.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return fallback
}

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function hexToRgb(hex) {
  const normalized = normalizeVaultHex(hex, '')
  if (!normalized) return null
  const int = Number.parseInt(normalized.slice(1), 16)
  if (Number.isNaN(int)) return null
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

/**
 * @param {number} channel
 */
function clampRgbChannel(channel) {
  const value = Math.round(Number(channel))
  if (Number.isNaN(value)) return 0
  return Math.min(255, Math.max(0, value))
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
export function rgbToHex(r, g, b) {
  const rr = clampRgbChannel(r).toString(16).padStart(2, '0')
  const gg = clampRgbChannel(g).toString(16).padStart(2, '0')
  const bb = clampRgbChannel(b).toString(16).padStart(2, '0')
  return `#${rr}${gg}${bb}`
}

/**
 * @param {string} hex
 * @param {number} amount 0–1, part vers le blanc
 */
function mixWithWhite(hex, amount) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  )
}

/**
 * Mélange deux hex (amountOfA = part de la 1ʳᵉ couleur, 0–1).
 * @param {string} a
 * @param {string} b
 * @param {number} amountOfA
 */
export function mixVaultHex(a, b, amountOfA = 0.5) {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra && !rb) return NOTE_VAULT_DEFAULT_SIDEBAR
  if (!ra) return normalizeVaultHex(b, NOTE_VAULT_DEFAULT_SIDEBAR)
  if (!rb) return normalizeVaultHex(a, NOTE_VAULT_DEFAULT_SIDEBAR)
  const t = Math.min(1, Math.max(0, Number(amountOfA) || 0))
  return rgbToHex(
    ra.r * t + rb.r * (1 - t),
    ra.g * t + rb.g * (1 - t),
    ra.b * t + rb.b * (1 - t),
  )
}

/**
 * Teinte plus claire pour les fonds lorsqu’aucune couleur d’accent n’est définie.
 * @param {string} hex
 */
export function deriveVaultAccentFromPrimary(hex) {
  return mixWithWhite(hex, 0.42)
}

/**
 * Teinte de fond dérivée de l’accent (clair ou sombre selon le thème système).
 * @param {string} hex
 * @param {{ dark?: boolean }} [options]
 */
export function deriveVaultSurfaceFromAccent(hex, options = {}) {
  if (options.dark) {
    const rgb = hexToRgb(hex)
    if (!rgb) return '#1f1a2c'
    return rgbToHex(rgb.r * 0.22 + 31 * 0.78, rgb.g * 0.22 + 26 * 0.78, rgb.b * 0.22 + 44 * 0.78)
  }
  return mixWithWhite(hex, 0.72)
}

/**
 * Couleur sidebar / contour par défaut (mélange accent + fond).
 * @param {string} accent
 * @param {string} surface
 * @param {{ dark?: boolean }} [options]
 */
export function deriveVaultSidebar(accent, surface, options = {}) {
  return mixVaultHex(accent, surface, options.dark ? 0.28 : 0.32)
}

/**
 * Teinte complémentaire douce pour les dégradés (vue globale).
 * @param {string} hex
 */
export function deriveVaultGradientFromPrimary(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return NOTE_VAULT_DEFAULT_GRADIENT
  return rgbToHex(
    rgb.r * 0.55 + 149 * 0.45,
    rgb.g * 0.55 + 209 * 0.45,
    rgb.b * 0.55 + 170 * 0.45,
  )
}

/**
 * @param {{ color?: string, accent_color?: string, accentColor?: string, surface_color?: string, surfaceColor?: string, sidebar_color?: string, sidebarColor?: string, gradient_color?: string, gradientColor?: string } | null | undefined} vault
 * @param {{ dark?: boolean }} [options]
 */
export function normalizeVaultTheme(vault, options = {}) {
  const dark = Boolean(options.dark)
  const color = normalizeVaultHex(vault?.color, NOTE_VAULT_DEFAULT_PRIMARY)
  const accent = normalizeVaultHex(
    vault?.accent_color ?? vault?.accentColor,
    deriveVaultAccentFromPrimary(color),
  )
  const rawSurface = vault?.surface_color ?? vault?.surfaceColor
  const hasExplicitSurface =
    rawSurface != null && String(rawSurface).trim() !== ''
  const surface = hasExplicitSurface
    ? normalizeVaultHex(rawSurface, deriveVaultSurfaceFromAccent(accent, { dark }))
    : deriveVaultSurfaceFromAccent(accent, { dark })

  const rawSidebar = vault?.sidebar_color ?? vault?.sidebarColor
  const hasExplicitSidebar =
    rawSidebar != null && String(rawSidebar).trim() !== ''
  const sidebar = hasExplicitSidebar
    ? normalizeVaultHex(rawSidebar, deriveVaultSidebar(accent, surface, { dark }))
    : deriveVaultSidebar(accent, surface, { dark })

  const gradient = normalizeVaultHex(
    vault?.gradient_color ?? vault?.gradientColor,
    deriveVaultGradientFromPrimary(color),
  )
  return { color, accent, surface, sidebar, gradient }
}

/**
 * @param {string | null | undefined} vaultId
 * @returns {string}
 */
export function vaultSettingsKey(vaultId) {
  return vaultId ? String(vaultId) : NOTE_VAULT_ROOT_KEY
}

/**
 * Luminance relative WCAG (0 = noir, 1 = blanc).
 * @param {string} hex
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  const toLinear = (channel) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
}

/**
 * @param {string} hex
 * @param {number} [threshold]
 */
export function isDarkHex(hex, threshold = 0.42) {
  return relativeLuminance(hex) < threshold
}

/**
 * Ratio de contraste WCAG entre deux couleurs.
 * @param {string} a
 * @param {string} b
 */
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Garde une couleur lisible sur un fond (sinon blanc/noir adaptés).
 * @param {string} foreground
 * @param {string} background
 * @param {string} [lightFallback]
 * @param {string} [darkFallback]
 */
export function ensureContrastOn(
  foreground,
  background,
  lightFallback = '#f4eefc',
  darkFallback = '#2a1f38',
) {
  const fg = normalizeVaultHex(foreground, lightFallback)
  if (contrastRatio(fg, background) >= 3.2) return fg
  return isDarkHex(background) ? lightFallback : darkFallback
}

/**
 * Palette de texte lisible pour un fond donné.
 * @param {string} background
 */
function readableInk(background) {
  if (isDarkHex(background)) {
    return {
      text: '#f2eef8',
      muted: '#c9bdd8',
      soft: 'rgba(255, 255, 255, 0.12)',
    }
  }
  return {
    text: '#2f243a',
    muted: '#6d5a7e',
    soft: 'rgba(47, 36, 58, 0.08)',
  }
}

/**
 * Icône lisible sur un fond (éclaircit ou assombrit la primaire).
 * @param {string} primary
 * @param {string} background
 */
function readableIcon(primary, background) {
  if (isDarkHex(background)) {
    const boosted = mixVaultHex('#ffffff', primary, 0.55)
    return ensureContrastOn(boosted, background, '#f4eefc', '#1a1524')
  }
  if (isDarkHex(primary, 0.65) === false && !isDarkHex(background, 0.7)) {
    // Primaire trop claire sur fond clair
    return ensureContrastOn(mixVaultHex(primary, '#1a1524', 0.55), background)
  }
  return ensureContrastOn(primary, background)
}

/**
 * Variables CSS appliquées à la page Notes quand un coffre est ouvert.
 * Le contraste texte/icônes s’adapte à la luminosité réelle des fonds choisis.
 * @param {{ color?: string, accent_color?: string, accentColor?: string, surface_color?: string, surfaceColor?: string, sidebar_color?: string, sidebarColor?: string, gradient_color?: string, gradientColor?: string } | null | undefined} vault
 * @param {{ dark?: boolean }} [options]
 */
export function vaultThemeStyle(vault, options = {}) {
  if (!vault) return {}

  const dark = Boolean(options.dark)
  const { color, accent, surface, sidebar, gradient } = normalizeVaultTheme(vault, { dark })

  const sidebarInk = readableInk(sidebar)
  const surfaceInk = readableInk(surface)
  const headerBg = mixVaultHex(sidebar, surface, 0.72)
  // Accents visibles : plus de jaune / couleur d’accent, pas un mélange boueux
  const tabsBg = isDarkHex(sidebar)
    ? mixVaultHex(accent, sidebar, 0.22)
    : mixVaultHex(accent, sidebar, 0.45)
  const titleOnSidebar = ensureContrastOn(color, sidebar)
  const titleOnSurface = ensureContrastOn(color, surface)
  const titleOnTabs = ensureContrastOn(color, tabsBg)
  const icon = readableIcon(color, sidebar)
  const iconActive = ensureContrastOn(accent, sidebar)
  const btnText = ensureContrastOn('#ffffff', color, '#ffffff', '#1a1524')
  const borderStrong = mixVaultHex(sidebar, color, 0.55)
  const selectionBg = mixVaultHex(accent, sidebar, isDarkHex(sidebar) ? 0.32 : 0.28)
  const selectionHover = mixVaultHex(accent, sidebar, isDarkHex(sidebar) ? 0.18 : 0.14)
  const dropBg = mixVaultHex(accent, sidebar, isDarkHex(sidebar) ? 0.42 : 0.36)

  // Inputs / boutons secondaires : neutres dérivés du fond (jamais accent×violet = marron)
  const inputBg = isDarkHex(surface)
    ? mixVaultHex('#ffffff', surface, 0.16)
    : '#ffffff'
  const inputInk = readableInk(inputBg)
  const modeBg = isDarkHex(surface)
    ? mixVaultHex(accent, surface, 0.28)
    : mixVaultHex(accent, '#ffffff', 0.42)
  // Mode actif = couleur d’accent pure (ex. jaune), texte contrasté dessus
  const modeActive = accent
  const modeActiveText = ensureContrastOn('#1a1524', accent, '#ffffff', '#1a1524')
  const iconHoverBg = isDarkHex(sidebar)
    ? mixVaultHex(accent, sidebar, 0.22)
    : mixVaultHex(accent, '#ffffff', 0.5)

  // En-têtes de tableaux markdown : fond distinct + texte contrasté (évite lavande × texte clair)
  const tableHeaderBg = isDarkHex(surface)
    ? mixVaultHex(accent, surface, 0.3)
    : mixVaultHex(accent, '#ffffff', 0.78)
  const tableHeaderInk = readableInk(tableHeaderBg)
  const tableBorder = isDarkHex(surface)
    ? mixVaultHex('#ffffff', surface, 0.78)
    : mixVaultHex(color, surface, 0.72)

  return {
    '--notes-vault-color': color,
    '--notes-vault-accent': accent,
    '--notes-vault-surface': surface,
    '--notes-vault-sidebar': sidebar,
    '--notes-vault-gradient': gradient,
    '--notes-vault-on-color': btnText,
    '--notes-vault-text': sidebarInk.text,
    '--notes-vault-text-muted': sidebarInk.muted,
    '--notes-vault-main-text': surfaceInk.text,
    '--notes-vault-main-text-muted': surfaceInk.muted,
    '--notes-vault-page-bg': surface,
    '--notes-vault-sidebar-bg': sidebar,
    '--notes-vault-main-bg': surface,
    '--notes-vault-header-bg': headerBg,
    '--notes-vault-tabs-bg': tabsBg,
    '--notes-vault-border': mixVaultHex(sidebar, isDarkHex(sidebar) ? '#ffffff' : '#000000', 0.88),
    '--notes-vault-border-strong': borderStrong,
    '--notes-vault-title': titleOnSidebar,
    '--notes-vault-title-main': titleOnSurface,
    '--notes-vault-title-tab': titleOnTabs,
    '--notes-vault-selection-bg': selectionBg,
    '--notes-vault-selection-hover': selectionHover,
    '--notes-vault-drop-bg': dropBg,
    '--notes-vault-btn-bg': color,
    '--notes-vault-btn-text': btnText,
    '--notes-vault-icon': icon,
    '--notes-vault-icon-active': iconActive,
    '--notes-vault-icon-hover-bg': iconHoverBg,
    '--notes-vault-input-bg': inputBg,
    '--notes-vault-input-text': inputInk.text,
    '--notes-vault-mode-bg': modeBg,
    '--notes-vault-mode-active': modeActive,
    '--notes-vault-mode-active-text': modeActiveText,
    '--notes-vault-graph-header-bg': mixVaultHex(sidebar, surface, 0.82),
    '--notes-vault-graph-bg':
      `radial-gradient(ellipse 80% 70% at 50% 40%, color-mix(in srgb, ${accent} ${isDarkHex(surface) ? 28 : 45}%, transparent) 0%, transparent 60%),` +
      `radial-gradient(ellipse 70% 65% at 72% 78%, color-mix(in srgb, ${gradient} ${isDarkHex(surface) ? 22 : 38}%, transparent) 0%, transparent 55%),` +
      `linear-gradient(160deg, ${surface} 0%, color-mix(in srgb, ${gradient} ${isDarkHex(surface) ? 14 : 22}%, ${surface}) 52%, color-mix(in srgb, ${accent} ${isDarkHex(surface) ? 18 : 30}%, ${surface}) 100%)`,
    '--notes-vault-graph-link': ensureContrastOn(color, surface),
    '--notes-vault-graph-node': mixVaultHex(color, isDarkHex(surface) ? '#d5b5ea' : '#7a528f', 0.78),
    '--notes-vault-graph-node-stroke': ensureContrastOn(color, surface),
    '--notes-vault-graph-node-active': ensureContrastOn(color, surface),
    '--notes-vault-graph-node-active-stroke': ensureContrastOn(
      mixVaultHex(color, surfaceInk.text, 0.55),
      surface,
    ),
    '--notes-vault-table-header-bg': tableHeaderBg,
    '--notes-vault-table-header-text': tableHeaderInk.text,
    '--notes-vault-table-border': tableBorder,
  }
}
