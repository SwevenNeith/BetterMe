/**
 * Redimensionnement progressif via Canvas (plusieurs passes ~÷2)
 * pour un rééchantillonnage propre avant la grille finale.
 */

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function drawScaled(source, targetW, targetH) {
  const canvas = createCanvas(targetW, targetH)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Calcule la hauteur proportionnelle pour une largeur cible en croix.
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} targetWidth
 */
export function computeTargetSize(srcW, srcH, targetWidth) {
  const width = Math.max(1, Math.round(targetWidth))
  const height = Math.max(1, Math.round((srcH / srcW) * width))
  return { width, height }
}

/**
 * Redimensionne une image HTMLImageElement / ImageBitmap / canvas
 * jusqu’à (targetWidth × targetHeight) en passes progressives.
 * @returns {HTMLCanvasElement}
 */
export function resizeImageProgressive(source, targetWidth, targetHeight) {
  const tw = Math.max(1, Math.round(targetWidth))
  const th = Math.max(1, Math.round(targetHeight))

  let canvas =
    source instanceof HTMLCanvasElement
      ? source
      : (() => {
          const c = createCanvas(source.naturalWidth || source.width, source.naturalHeight || source.height)
          const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(source, 0, 0)
          return c
        })()

  let w = canvas.width
  let h = canvas.height

  // Passes intermédiaires : diviser ~par 2 tant qu’on est nettement au-dessus de la cible
  while (w / 2 >= tw && h / 2 >= th) {
    const nextW = Math.max(tw, Math.floor(w / 2))
    const nextH = Math.max(th, Math.floor(h / 2))
    if (nextW >= w && nextH >= h) break
    canvas = drawScaled(canvas, nextW, nextH)
    w = canvas.width
    h = canvas.height
  }

  // Dernière passe exacte
  if (w !== tw || h !== th) {
    canvas = drawScaled(canvas, tw, th)
  }

  return canvas
}

/**
 * Charge un File image → HTMLImageElement.
 * L’URL blob reste attachée à l’image jusqu’à `revokeLoadedImage` :
 * la révoquer dans onload casse l’affichage (preview / alignement pixel art).
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Choisis un fichier image (PNG, JPG, WebP…).'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      img.dataset.objectUrl = url
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossible de lire cette image.'))
    }
    img.src = url
  })
}

/**
 * Libère l’URL blob associée à une image chargée via `loadImageFromFile`.
 * @param {HTMLImageElement|null|undefined} img
 */
export function revokeLoadedImage(img) {
  const url = img?.dataset?.objectUrl
  if (url && String(url).startsWith('blob:')) {
    URL.revokeObjectURL(url)
    delete img.dataset.objectUrl
  }
}
