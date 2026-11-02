/**
 * Style macro d’un champion (side / roam / skirmish…) pour pondérer KP & conseils.
 */

/** Champions typiquement « side / split » (pas jugés sur le KP). */
const SIDE_CHAMPS = new Set(
  [
    'tryndamere',
    'fiora',
    'yorick',
    'nasus',
    'sion',
    'kayle',
    'jax',
    'camille',
    'gwen',
    'gangplank',
    'illaoi',
    'urgot',
    'trundle',
    'mundo',
    'drmundo',
    'sett',
    'mordekaiser',
    'yone',
    'yasuo',
    'kayn', // sometimes
    'masteryi',
    'yi',
    'belveth',
    'smolder',
    'kogmaw',
    'twitch', // late hypercarry farm
    'jinx',
    'sivir',
    'cassiopeia',
  ].map((s) => s.toLowerCase()),
)

/** Champions qui doivent beaucoup roam / join. */
const ROAM_CHAMPS = new Set(
  [
    'twistedfate',
    'tf',
    'talon',
    'qiyana',
    'ahri',
    'leblanc',
    'pyke',
    'pantheon',
    'rakan',
    'thresh',
    'bard',
    'leeSin',
    'leesin',
    'elise',
    'nidalee',
    'jarvaniv',
    'vi',
    'nautilus',
    'alistar',
  ].map((s) => s.toLowerCase()),
)

/**
 * @param {string} name
 */
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * @param {string} championName
 * @param {string[]} [tags]
 * @param {string} [roleLabel] Mid / Top / …
 * @returns {{
 *   id: 'side'|'roam'|'skirmish'|'carry'|'support',
 *   label: string,
 *   kpRelevant: boolean,
 *   preferCsGold: boolean,
 *   tip: string,
 * }}
 */
export function inferChampionMacroStyle(championName, tags = [], roleLabel = '') {
  const id = normName(championName)
  const tagSet = new Set((tags || []).map(String))
  const role = String(roleLabel || '').toLowerCase()

  if (SIDE_CHAMPS.has(id) || (role === 'top' && (tagSet.has('Fighter') || tagSet.has('Tank')))) {
    return {
      id: 'side',
      label: 'Side / split',
      kpRelevant: false,
      preferCsGold: true,
      tip: 'Profil side : un KP bas n’est pas un échec si gold, CS et pression de tour sont bons.',
    }
  }

  if (ROAM_CHAMPS.has(id) || (role === 'jungle' && tagSet.has('Assassin'))) {
    return {
      id: 'roam',
      label: 'Roam / joins',
      kpRelevant: true,
      preferCsGold: false,
      tip: 'Profil roam : le KP et les objectifs comptent plus que le farm solo.',
    }
  }

  if (role === 'support' || (tagSet.has('Support') && !tagSet.has('Mage'))) {
    return {
      id: 'support',
      label: 'Support / vision',
      kpRelevant: true,
      preferCsGold: false,
      tip: 'Support : KP, vision et deaths importent plus que le CS.',
    }
  }

  if (tagSet.has('Marksman') || role === 'adc') {
    return {
      id: 'carry',
      label: 'Carry farm',
      kpRelevant: false,
      preferCsGold: true,
      tip: 'Carry : priorise CS/gold et survie ; KP moyen ok si tu scale pour les fights.',
    }
  }

  if (tagSet.has('Assassin')) {
    return {
      id: 'skirmish',
      label: 'Pick / skirmish',
      kpRelevant: true,
      preferCsGold: false,
      tip: 'Assassin : KP et picks comptent ; un farm propre sans impact est insuffisant.',
    }
  }

  return {
    id: 'skirmish',
    label: 'Standard',
    kpRelevant: role === 'mid' || role === 'jungle',
    preferCsGold: role === 'mid' || role === 'adc' || role === 'top',
    tip: 'Équilibre farm et présence — adapte selon la win condition de ta compo.',
  }
}
