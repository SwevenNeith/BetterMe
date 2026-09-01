/** Clé des paramètres pour l’espace hors coffre (tutoriel, Daily Notes, notes libres). */
export const NOTE_VAULT_ROOT_KEY = 'root'

export const NOTE_VAULT_DEFAULT_PRIMARY = '#ad81be'
export const NOTE_VAULT_DEFAULT_ACCENT = '#d5b5ea'
export const NOTE_VAULT_DEFAULT_SURFACE = '#f4f0fa'
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
 * Teinte plus claire pour les fonds lorsqu’aucune couleur d’accent n’est définie.
 * @param {string} hex
 */
export function deriveVaultAccentFromPrimary(hex) {
  return mixWithWhite(hex, 0.42)
}

/**
 * @param {string} hex
 */
export function deriveVaultSurfaceFromAccent(hex) {
  return mixWithWhite(hex, 0.72)
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
 * @param {{ color?: string, accent_color?: string, accentColor?: string, surface_color?: string, surfaceColor?: string, gradient_color?: string, gradientColor?: string } | null | undefined} vault
 */
export function normalizeVaultTheme(vault) {
  const color = normalizeVaultHex(vault?.color, NOTE_VAULT_DEFAULT_PRIMARY)
  const accent = normalizeVaultHex(
    vault?.accent_color ?? vault?.accentColor,
    deriveVaultAccentFromPrimary(color),
  )
  const surface = normalizeVaultHex(
    vault?.surface_color ?? vault?.surfaceColor,
    deriveVaultSurfaceFromAccent(accent),
  )
  const gradient = normalizeVaultHex(
    vault?.gradient_color ?? vault?.gradientColor,
    deriveVaultGradientFromPrimary(color),
  )
  return { color, accent, surface, gradient }
}

/**
 * @param {string | null | undefined} vaultId
 * @returns {string}
 */
export function vaultSettingsKey(vaultId) {
  return vaultId ? String(vaultId) : NOTE_VAULT_ROOT_KEY
}

/**
 * Variables CSS appliquées à la page Notes quand un coffre est ouvert.
 * @param {{ color?: string, accent_color?: string, accentColor?: string, surface_color?: string, surfaceColor?: string, gradient_color?: string, gradientColor?: string } | null | undefined} vault
 */
export function vaultThemeStyle(vault) {
  if (!vault) return {}

  const { color, accent, surface, gradient } = normalizeVaultTheme(vault)

  return {
    '--notes-vault-color': color,
    '--notes-vault-accent': accent,
    '--notes-vault-surface': surface,
    '--notes-vault-gradient': gradient,
    '--notes-vault-on-color': '#ffffff',
    '--notes-vault-text': '#3b2a4a',
    '--notes-vault-text-muted': '#6d5a7e',
    '--notes-vault-page-bg': `color-mix(in srgb, ${accent} 18%, ${surface})`,
    '--notes-vault-sidebar-bg': `color-mix(in srgb, ${accent} 32%, ${surface})`,
    '--notes-vault-main-bg': `color-mix(in srgb, ${accent} 14%, ${surface})`,
    '--notes-vault-header-bg': `color-mix(in srgb, ${accent} 38%, ${surface})`,
    '--notes-vault-tabs-bg': `color-mix(in srgb, ${accent} 45%, ${surface})`,
    '--notes-vault-border': `color-mix(in srgb, ${color} 28%, #e6ddf2)`,
    '--notes-vault-border-strong': `color-mix(in srgb, ${color} 42%, #d5c4e6)`,
    '--notes-vault-btn-bg': color,
    '--notes-vault-btn-text': '#ffffff',
    '--notes-vault-icon': color,
    '--notes-vault-icon-active': `color-mix(in srgb, ${color} 72%, #244438)`,
    '--notes-vault-icon-hover-bg': `color-mix(in srgb, ${accent} 55%, white)`,
    '--notes-vault-input-bg': '#ffffff',
    '--notes-vault-mode-bg': `color-mix(in srgb, ${accent} 40%, ${surface})`,
    '--notes-vault-mode-active': `color-mix(in srgb, ${gradient} 55%, ${color} 45%)`,
    '--notes-vault-graph-header-bg': `color-mix(in srgb, ${accent} 38%, ${surface})`,
    '--notes-vault-graph-bg':
      `radial-gradient(ellipse 80% 70% at 50% 40%, color-mix(in srgb, ${accent} 45%, transparent) 0%, transparent 60%),` +
      `radial-gradient(ellipse 70% 65% at 72% 78%, color-mix(in srgb, ${gradient} 38%, transparent) 0%, transparent 55%),` +
      `linear-gradient(160deg, ${surface} 0%, color-mix(in srgb, ${gradient} 22%, ${surface}) 52%, color-mix(in srgb, ${accent} 30%, ${surface}) 100%)`,
    '--notes-vault-graph-link': color,
    '--notes-vault-graph-node': `color-mix(in srgb, ${color} 82%, #7a528f)`,
    '--notes-vault-graph-node-stroke': `color-mix(in srgb, ${color} 65%, #3b2a4a)`,
    '--notes-vault-graph-node-active': color,
    '--notes-vault-graph-node-active-stroke': `color-mix(in srgb, ${color} 55%, #3b2a4a)`,
  }
}
