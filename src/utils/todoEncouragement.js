/**
 * Messages encourageants selon la progression des tâches du jour.
 * @typedef {{ total: number, fullyDone: number, percent: number, hasPartialProgress?: boolean }} TodoProgressStats
 */

const MESSAGES = {
  empty: [
    'Journée libre — profite ou ajoute une petite action si tu en as envie.',
    'Rien de prévu aujourd’hui. Un moment pour souffler ?',
    'Pas de tâche au programme : écoute ce dont tu as besoin.',
  ],
  overachieved: [
    'Plus de 100 % — tu dépasses tes objectifs, bravo !',
    'Tu as dépassé le cap : quelle belle énergie !',
    'Au-delà du plan — tu peux vraiment être fière de toi.',
    'Objectifs explosés : continue comme ça, tu es en feu !',
  ],
  complete: [
    'Bravo, toutes tes tâches sont faites !',
    'Journée bouclée — tu peux être fière de toi.',
    'Mission accomplie pour aujourd’hui, bien joué !',
    'Tu as tout coché — quelle belle énergie !',
  ],
  almost: [
    'Tu y es presque — encore un petit effort !',
    'La ligne d’arrivée est en vue, continue comme ça.',
    'Plus qu’un rien : tu vas y arriver.',
    'Si près du but — tu peux le faire !',
  ],
  halfway: [
    'Déjà la moitié — tu avances bien.',
    'Bon rythme, garde le cap.',
    'Tu es à mi-chemin, ne lâche rien.',
    'Belle progression : une tâche à la fois.',
  ],
  started: [
    'C’est parti — chaque pas compte.',
    'Tu as commencé, c’est l’essentiel.',
    'Un bon début : continue sur ta lancée.',
    'Chaque petite victoire te rapproche du but.',
  ],
  notStarted: [
    'Une petite action pour lancer la journée ?',
    'Pas encore commencé ? C’est le moment idéal.',
    'Choisis une tâche et lance-toi doucement.',
    'Le plus dur, c’est souvent de commencer — tu peux y arriver.',
  ],
}

function hashSeed(seed) {
  let hash = 0
  const text = String(seed)
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function pickFromPool(pool, seed) {
  if (!pool?.length) return ''
  const index = hashSeed(seed) % pool.length
  return pool[index]
}

/**
 * @param {TodoProgressStats} stats
 * @param {string} [dateISO] - Date du jour affiché (pour stabiliser le message aléatoire)
 */
export function getTodoEncouragementCategory(stats) {
  const total = Number(stats?.total) || 0
  const percent = Number(stats?.percent) || 0
  const fullyDone = Number(stats?.fullyDone) || 0
  const remaining = total - fullyDone

  if (total === 0) return 'empty'
  if (percent > 100) return 'overachieved'
  if (percent >= 100 || fullyDone >= total) return 'complete'
  if (percent >= 75 || remaining === 1) return 'almost'
  if (percent >= 50) return 'halfway'
  if (percent > 0) return 'started'
  return 'notStarted'
}

/**
 * @param {TodoProgressStats} stats
 * @param {string} [dateISO]
 */
export function getTodoEncouragementMessage(stats, dateISO = '') {
  const category = getTodoEncouragementCategory(stats)
  const seed = `${dateISO}:${category}:${stats?.total ?? 0}`
  return pickFromPool(MESSAGES[category], seed)
}
