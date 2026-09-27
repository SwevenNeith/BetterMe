/**
 * Conversions RGB ↔ CIE LAB (D65).
 * Entrées/sorties RGB en 0–255 ; LAB : L∈[0,100], a/b typiquement ±128.
 */

function srgbChannelToLinear(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function linearToSrgbChannel(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, Math.round(v * 255)))
}

/** RGB 0–255 → XYZ (D65, scaled so Y of white ≈ 100). */
function rgbToXyz(r, g, b) {
  const R = srgbChannelToLinear(r)
  const G = srgbChannelToLinear(g)
  const B = srgbChannelToLinear(b)

  // sRGB → XYZ (D65)
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100
  const y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) * 100
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) * 100
  return { x, y, z }
}

function xyzToLab(x, y, z) {
  // D65 reference white
  const xr = x / 95.047
  const yr = y / 100
  const zr = z / 108.883

  const eps = 216 / 24389
  const kappa = 24389 / 27

  const fx = xr > eps ? Math.cbrt(xr) : (kappa * xr + 16) / 116
  const fy = yr > eps ? Math.cbrt(yr) : (kappa * yr + 16) / 116
  const fz = zr > eps ? Math.cbrt(zr) : (kappa * zr + 16) / 116

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function labToXyz(L, a, b) {
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200

  const eps = 216 / 24389
  const kappa = 24389 / 27

  const fx3 = fx ** 3
  const fz3 = fz ** 3

  const xr = fx3 > eps ? fx3 : (116 * fx - 16) / kappa
  const yr = L > kappa * eps ? ((L + 16) / 116) ** 3 : L / kappa
  const zr = fz3 > eps ? fz3 : (116 * fz - 16) / kappa

  return {
    x: xr * 95.047,
    y: yr * 100,
    z: zr * 108.883,
  }
}

function xyzToRgb(x, y, z) {
  const X = x / 100
  const Y = y / 100
  const Z = z / 100

  const R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314
  const G = X * -0.969266 + Y * 1.8760108 + Z * 0.041556
  const B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252

  return {
    r: linearToSrgbChannel(R),
    g: linearToSrgbChannel(G),
    b: linearToSrgbChannel(B),
  }
}

/** @returns {{ L: number, a: number, b: number }} */
export function rgbToLab(r, g, b) {
  const { x, y, z } = rgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

/** @returns {{ r: number, g: number, b: number }} */
export function labToRgb(L, a, b) {
  const { x, y, z } = labToXyz(L, a, b)
  return xyzToRgb(x, y, z)
}

export function labDistanceSq(p, q) {
  const dL = p.L - q.L
  const da = p.a - q.a
  const db = p.b - q.b
  return dL * dL + da * da + db * db
}

export function rgbToHex({ r, g, b }) {
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.min(255, Math.max(0, c | 0)).toString(16).padStart(2, '0'))
      .join('')
  )
}
