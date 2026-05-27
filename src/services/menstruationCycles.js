const TABLE = 'menstruation_cycles_pilule'

/** Noms de colonnes Supabase (avec accents, comme en base) */
export const COL = {
  numeroCycle: 'numéro_cycle',
  dateDebutPlaquette: 'date_début_plaquette',
  dateFinComprimesActifs: 'date_fin_comprimés_actifs',
  dateProchainePlaquette: 'date_prochaine_plaquette',
  dateDebutReglesReelle: 'date_début_règles_réelle',
  dateDebutReglesEstimee: 'date_début_règles_estimée',
  dateFinReglesReelle: 'date_fin_règles_réelle',
  dateFinReglesEstimee: 'date_fin_règles_estimée',
  dateDebutSpmEstimee: 'date_début_spm_estimée',
  dateFinSpmEstimee: 'date_fin_spm_estimée',
  delaiRegles: 'délai_règles',
  dureeCycle: 'durée_cycle',
  dureeReglesEstimee: 'durée_règles_estimée',
  dureeReglesReelle: 'durée_règles_réelle',
  dureeSpmEstimee: 'durée_spm_estimée',
  dureeSpmReelle: 'durée_spm_réelle',
}

const DUREE_CYCLE_JOURS = 28
const JOURS_COMPRIMES_ACTIFS = 21
const JOURS_PROCHAINE_PLAQUETTE = DUREE_CYCLE_JOURS
const JOURS_FIN_REGLES_ESTIMEE = 5
const JOURS_FIN_SPM_APRES_DEBUT_REGLES = 2
const DUREE_REGLES_DEFAUT = 5
const DUREE_SPM_DEFAUT = 7
const FORECAST_CYCLES_AHEAD = 5

export function addDaysToISODate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Nombre de jours entre deux dates (fin − début), ex. 1→6 = 5 */
export function daysBetweenISO(fromDate, toDate) {
  if (!fromDate || !toDate) return null
  const [y1, m1, d1] = fromDate.split('-').map(Number)
  const [y2, m2, d2] = toDate.split('-').map(Number)
  const t1 = Date.UTC(y1, m1 - 1, d1)
  const t2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((t2 - t1) / 86_400_000)
}

function averageRounded(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

export function pickDate(reelle, estimee) {
  return reelle || estimee || null
}

export function getEffectiveDebutRegles(row) {
  return pickDate(row[COL.dateDebutReglesReelle], row[COL.dateDebutReglesEstimee])
}

export function getEffectiveFinRegles(row) {
  return pickDate(row[COL.dateFinReglesReelle], row[COL.dateFinReglesEstimee])
}

export function getEffectiveDebutSpm(row) {
  return row[COL.dateDebutSpmEstimee] || null
}

/** durée_règles_réelle : uniquement si les deux dates réelles sont connues */
export function computeDureeReglesReelleFromDates(row) {
  const debut = row[COL.dateDebutReglesReelle]
  const fin = row[COL.dateFinReglesReelle]
  if (!debut || !fin) return null
  const diff = daysBetweenISO(debut, fin)
  return diff != null && diff >= 0 ? diff : null
}

/** durée_règles_estimée : date_fin − date_début (réelle si dispo, sinon estimée) */
export function computeDureeReglesEstimeeFromDates(row) {
  const debut = getEffectiveDebutRegles(row)
  const fin = getEffectiveFinRegles(row)
  if (!debut || !fin) return null
  const diff = daysBetweenISO(debut, fin)
  return diff != null && diff >= 0 ? diff : null
}

export function getDureeReglesForCalcul(row) {
  return row[COL.dureeReglesReelle] ?? row[COL.dureeReglesEstimee] ?? DUREE_REGLES_DEFAUT
}

function applyDureeReglesFields(record, { cycle1UnknownEnd = false } = {}) {
  const reelle = computeDureeReglesReelleFromDates(record)

  let estimée
  if (cycle1UnknownEnd) {
    estimée = DUREE_REGLES_DEFAUT
  } else {
    estimée = computeDureeReglesEstimeeFromDates(record)
  }

  record[COL.dureeReglesReelle] = reelle
  record[COL.dureeReglesEstimee] = estimée
  return record
}

export function computeDelaiRegles(row) {
  const finComprimes = row[COL.dateFinComprimesActifs]
  const debutRegles = getEffectiveDebutRegles(row)
  if (!finComprimes || !debutRegles) return null
  return daysBetweenISO(finComprimes, debutRegles)
}

export function computeDureeSpmReelle(row) {
  const finComprimes = row[COL.dateFinComprimesActifs]
  const debutSpm = getEffectiveDebutSpm(row)
  if (!finComprimes || !debutSpm) return null
  const diff = daysBetweenISO(debutSpm, finComprimes)
  return diff != null && diff >= 0 ? diff : null
}

export function computeDateFinComprimesActifs(dateDebutPlaquette) {
  if (!dateDebutPlaquette) return null
  return addDaysToISODate(dateDebutPlaquette, JOURS_COMPRIMES_ACTIFS)
}

export function computeDateProchainePlaquette(dateDebutPlaquette) {
  if (!dateDebutPlaquette) return null
  return addDaysToISODate(dateDebutPlaquette, JOURS_PROCHAINE_PLAQUETTE)
}

export function computeDateFinReglesEstimeeFromStart(dateDebutRegles, lastPeriodEndUnknown) {
  if (!dateDebutRegles || !lastPeriodEndUnknown) return null
  return addDaysToISODate(dateDebutRegles, JOURS_FIN_REGLES_ESTIMEE)
}

export function computeDateDebutSpmEstimee(dateFinComprimesActifs, dureeSpm) {
  if (!dateFinComprimesActifs || dureeSpm == null) return null
  return addDaysToISODate(dateFinComprimesActifs, -dureeSpm)
}

export function computeDateFinSpmEstimee(dateDebutRegles) {
  if (!dateDebutRegles) return null
  return addDaysToISODate(dateDebutRegles, JOURS_FIN_SPM_APRES_DEBUT_REGLES)
}

/** Applique les règles SPM estimées sur un enregistrement cycle. */
export function applySpmDatesEstimees(record) {
  const finComprimes = record[COL.dateFinComprimesActifs]
  const dureeSpm = record[COL.dureeSpmEstimee] ?? DUREE_SPM_DEFAUT
  const debutRegles = getEffectiveDebutRegles(record)

  record[COL.dateDebutSpmEstimee] = computeDateDebutSpmEstimee(finComprimes, dureeSpm)
  record[COL.dateFinSpmEstimee] = computeDateFinSpmEstimee(debutRegles)
  return record
}

export function resolveDureeReglesFromForm(dureeReglesDays, dureeReglesUnknown) {
  if (dureeReglesUnknown) return DUREE_REGLES_DEFAUT
  const n = Number(dureeReglesDays)
  if (!Number.isFinite(n) || n <= 0) return DUREE_REGLES_DEFAUT
  return Math.round(n)
}

function getDureeSpmForCalcul(row) {
  return row[COL.dureeSpmReelle] ?? row[COL.dureeSpmEstimee] ?? DUREE_SPM_DEFAUT
}

function buildCycle1Record(userId, numeroCycle, payload) {
  const dateDebutPlaquette = payload.dateDebutPlaquette || null
  const dateFinComprimesActifs = computeDateFinComprimesActifs(dateDebutPlaquette)
  const dateProchainePlaquette = computeDateProchainePlaquette(dateDebutPlaquette)

  const dateDebutReglesReelle = payload.dateDebutReglesReelle || null
  const dateDebutReglesEstimee = dateDebutReglesReelle
  const dateFinReglesReelle = payload.dateFinReglesReelle || null
  const lastPeriodEndUnknown = Boolean(payload.lastPeriodEndUnknown)

  const dateFinReglesEstimee = computeDateFinReglesEstimeeFromStart(
    getEffectiveDebutRegles({
      [COL.dateDebutReglesReelle]: dateDebutReglesReelle,
      [COL.dateDebutReglesEstimee]: dateDebutReglesEstimee,
    }),
    lastPeriodEndUnknown,
  )

  const dureeSpmEstimee = DUREE_SPM_DEFAUT

  const record = {
    user_id: userId,
    [COL.numeroCycle]: numeroCycle,
    [COL.dateDebutPlaquette]: dateDebutPlaquette,
    [COL.dateFinComprimesActifs]: dateFinComprimesActifs,
    [COL.dateProchainePlaquette]: dateProchainePlaquette,
    [COL.dateDebutReglesReelle]: dateDebutReglesReelle,
    [COL.dateDebutReglesEstimee]: dateDebutReglesEstimee,
    [COL.dateFinReglesReelle]: dateFinReglesReelle,
    [COL.dateFinReglesEstimee]: dateFinReglesEstimee,
    [COL.delaiRegles]: computeDelaiRegles({
      [COL.dateFinComprimesActifs]: dateFinComprimesActifs,
      [COL.dateDebutReglesReelle]: dateDebutReglesReelle,
      [COL.dateDebutReglesEstimee]: dateDebutReglesEstimee,
    }),
    [COL.dureeCycle]: DUREE_CYCLE_JOURS,
    [COL.dureeSpmEstimee]: dureeSpmEstimee,
  }

  const cycle1UnknownEnd = lastPeriodEndUnknown && !dateFinReglesReelle
  applyDureeReglesFields(record, { cycle1UnknownEnd })
  applySpmDatesEstimees(record)
  record[COL.dureeSpmReelle] = computeDureeSpmReelle(record)

  if (!cycle1UnknownEnd && record[COL.dureeReglesEstimee] == null) {
    record[COL.dureeReglesEstimee] = resolveDureeReglesFromForm(
      payload.dureeReglesDays,
      payload.dureeReglesUnknown,
    )
  }

  return record
}

function buildForecastCycleRecord(userId, numeroCycle, prev, previousCycles) {
  const dateDebutPlaquette = prev[COL.dateProchainePlaquette]
  if (!dateDebutPlaquette) return null

  const dateFinComprimesActifs = computeDateFinComprimesActifs(dateDebutPlaquette)
  const dateProchainePlaquette = computeDateProchainePlaquette(dateDebutPlaquette)

  const delaiRegles =
    numeroCycle === 2
      ? (prev[COL.delaiRegles] ?? computeDelaiRegles(prev))
      : averageRounded(previousCycles.map((c) => c[COL.delaiRegles] ?? computeDelaiRegles(c)))

  const dureeReglesPrev = getDureeReglesForCalcul(prev)

  const dureeSpmReellesConnues = previousCycles
    .map((c) => c[COL.dureeSpmReelle])
    .filter((v) => v != null)
  const dureeSpmEstimee =
    numeroCycle === 2
      ? getDureeSpmForCalcul(prev)
      : averageRounded(
          dureeSpmReellesConnues.length
            ? dureeSpmReellesConnues
            : previousCycles.map(getDureeSpmForCalcul),
        ) ?? DUREE_SPM_DEFAUT

  const dateDebutReglesEstimee =
    delaiRegles != null && dateFinComprimesActifs
      ? addDaysToISODate(dateFinComprimesActifs, delaiRegles)
      : null

  const dateFinReglesEstimee =
    dateDebutReglesEstimee != null
      ? addDaysToISODate(dateDebutReglesEstimee, dureeReglesPrev)
      : null

  const record = {
    user_id: userId,
    [COL.numeroCycle]: numeroCycle,
    [COL.dateDebutPlaquette]: dateDebutPlaquette,
    [COL.dateFinComprimesActifs]: dateFinComprimesActifs,
    [COL.dateProchainePlaquette]: dateProchainePlaquette,
    [COL.dateDebutReglesReelle]: null,
    [COL.dateDebutReglesEstimee]: dateDebutReglesEstimee,
    [COL.dateFinReglesReelle]: null,
    [COL.dateFinReglesEstimee]: dateFinReglesEstimee,
    [COL.delaiRegles]: delaiRegles,
    [COL.dureeCycle]: DUREE_CYCLE_JOURS,
    [COL.dureeSpmEstimee]: dureeSpmEstimee,
  }

  // Cycles > 1 : durée_règles_estimée = date_fin − date_début (réelle si dispo)
  applyDureeReglesFields(record)
  applySpmDatesEstimees(record)
  record[COL.dureeSpmReelle] = computeDureeSpmReelle(record)

  return record
}

export function createEmptyOnboardingForm(localToday) {
  return {
    hormonalContraception: null,
    dateDebutPlaquette: localToday,
    lastPeriodStartUnknown: false,
    lastPeriodStartDate: localToday,
    lastPeriodEndUnknown: false,
    lastPeriodEndDate: localToday,
    cycleLengthUnknown: false,
    cycleLengthDays: 28,
    rulesDurationDays: null,
    rulesDurationUnknown: false,
  }
}

export async function countMenstruationCyclesPilule(supabase, userId) {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw error
  return count ?? 0
}

export async function listCyclesPilule(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order(COL.numeroCycle, { ascending: true })

  if (error) throw error
  return data ?? []
}

function copyKnownRealFieldsIfPresent(fromRow, toRow) {
  if (!fromRow || !toRow) return
  if (fromRow[COL.dateDebutReglesReelle]) {
    toRow[COL.dateDebutReglesReelle] = fromRow[COL.dateDebutReglesReelle]
  }
  if (fromRow[COL.dateFinReglesReelle]) {
    toRow[COL.dateFinReglesReelle] = fromRow[COL.dateFinReglesReelle]
  }
  if (fromRow[COL.dureeReglesReelle] != null) {
    toRow[COL.dureeReglesReelle] = fromRow[COL.dureeReglesReelle]
  }
}

async function getNextNumeroCycle(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COL.numeroCycle)
    .eq('user_id', userId)
    .order(COL.numeroCycle, { ascending: false })
    .limit(1)

  if (error) throw error

  const last = data?.[0]?.[COL.numeroCycle]
  return typeof last === 'number' ? last + 1 : 1
}

/** Recalcule et persiste les dates SPM estimées pour tous les cycles existants. */
export async function refreshAllCyclesSpmDatesEstimees(supabase, userId) {
  const cycles = await listCyclesPilule(supabase, userId)
  for (const cycle of cycles) {
    if (!cycle.id) continue
    const temp = { ...cycle }
    applySpmDatesEstimees(temp)
    const debut = temp[COL.dateDebutSpmEstimee]
    const fin = temp[COL.dateFinSpmEstimee]
    if (
      debut !== cycle[COL.dateDebutSpmEstimee] ||
      fin !== cycle[COL.dateFinSpmEstimee]
    ) {
      const { error } = await supabase
        .from(TABLE)
        .update({
          [COL.dateDebutSpmEstimee]: debut,
          [COL.dateFinSpmEstimee]: fin,
        })
        .eq('id', cycle.id)
      if (error) throw error
    }
  }
}

export async function syncForecastCyclesPilule(supabase, userId) {
  let cycles = await listCyclesPilule(supabase, userId)
  if (!cycles.length) return

  await refreshAllCyclesSpmDatesEstimees(supabase, userId)
  cycles = await listCyclesPilule(supabase, userId)

  const maxN = Math.max(...cycles.map((c) => c[COL.numeroCycle]))
  const targetMax = maxN + FORECAST_CYCLES_AHEAD

  await supabase.from(TABLE).delete().eq('user_id', userId).gt(COL.numeroCycle, targetMax)

  cycles = await listCyclesPilule(supabase, userId)
  const byNum = new Map(cycles.map((c) => [c[COL.numeroCycle], c]))

  for (let n = 2; n <= targetMax; n++) {
    const prev = byNum.get(n - 1)
    if (!prev) break

    const previousAll = cycles.filter((c) => c[COL.numeroCycle] < n)
    const record = buildForecastCycleRecord(userId, n, prev, previousAll)

    if (!record) continue

    const existing = byNum.get(n)
    if (existing?.id) {
      copyKnownRealFieldsIfPresent(existing, record)
      applyDureeReglesFields(record)
      applySpmDatesEstimees(record)
      record[COL.dureeSpmReelle] = computeDureeSpmReelle(record)

      const { data, error } = await supabase
        .from(TABLE)
        .update(record)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      byNum.set(n, data)
      const idx = cycles.findIndex((c) => c.id === existing.id)
      if (idx >= 0) cycles[idx] = data
    } else {
      const { data, error } = await supabase.from(TABLE).insert(record).select().single()
      if (error) throw error
      byNum.set(n, data)
      cycles.push(data)
    }
  }
}

function pickTargetCycleForRulesUpdate(cycles, { dateDebutReglesReelle, dateFinReglesReelle }) {
  if (!cycles.length) return null

  if (dateDebutReglesReelle) {
    const exact = cycles.find((c) => c[COL.dateDebutReglesEstimee] === dateDebutReglesReelle)
    if (exact) return exact
  }

  if (dateFinReglesReelle) {
    const exact = cycles.find((c) => c[COL.dateFinReglesEstimee] === dateFinReglesReelle)
    if (exact) return exact
  }

  if (dateDebutReglesReelle) {
    const within = cycles.find((c) => {
      const d1 = c[COL.dateDebutReglesEstimee]
      const d2 = c[COL.dateFinReglesEstimee]
      return d1 && d2 && dateDebutReglesReelle >= d1 && dateDebutReglesReelle <= d2
    })
    if (within) return within
  }

  return cycles[cycles.length - 1]
}

export async function saveMenstruationRulesDates(supabase, userId, payload) {
  const dateDebutReglesReelle = payload?.dateDebutReglesReelle || null
  const dateFinReglesReelle = payload?.dateFinReglesReelle || null

  if (!dateDebutReglesReelle && !dateFinReglesReelle) {
    throw new Error('Renseigne au moins une date.')
  }
  if (!dateDebutReglesReelle && dateFinReglesReelle) {
    throw new Error('Tu dois renseigner un début de règles réel avant la fin.')
  }
  if (dateDebutReglesReelle && dateFinReglesReelle && dateFinReglesReelle < dateDebutReglesReelle) {
    throw new Error('La date de fin réelle ne peut pas être avant la date de début réelle.')
  }

  const cycles = await listCyclesPilule(supabase, userId)
  const target = pickTargetCycleForRulesUpdate(cycles, {
    dateDebutReglesReelle,
    dateFinReglesReelle,
  })
  if (!target?.id) {
    throw new Error('Aucun cycle trouvé pour enregistrer ces dates.')
  }

  const next = { ...target }
  next[COL.dateDebutReglesReelle] = dateDebutReglesReelle
  next[COL.dateFinReglesReelle] = dateFinReglesReelle
  next[COL.dateDebutReglesEstimee] = dateDebutReglesReelle || next[COL.dateDebutReglesEstimee]
  if (!next[COL.dateFinReglesEstimee] && dateFinReglesReelle) {
    next[COL.dateFinReglesEstimee] = dateFinReglesReelle
  }

  applyDureeReglesFields(next)
  next[COL.delaiRegles] = computeDelaiRegles(next)
  applySpmDatesEstimees(next)
  next[COL.dureeSpmReelle] = computeDureeSpmReelle(next)

  const { error } = await supabase
    .from(TABLE)
    .update({
      [COL.dateDebutReglesReelle]: next[COL.dateDebutReglesReelle],
      [COL.dateFinReglesReelle]: next[COL.dateFinReglesReelle],
      [COL.dateDebutReglesEstimee]: next[COL.dateDebutReglesEstimee],
      [COL.dateFinReglesEstimee]: next[COL.dateFinReglesEstimee],
      [COL.dureeReglesReelle]: next[COL.dureeReglesReelle],
      [COL.dureeReglesEstimee]: next[COL.dureeReglesEstimee],
      [COL.delaiRegles]: next[COL.delaiRegles],
      [COL.dateDebutSpmEstimee]: next[COL.dateDebutSpmEstimee],
      [COL.dateFinSpmEstimee]: next[COL.dateFinSpmEstimee],
      [COL.dureeSpmReelle]: next[COL.dureeSpmReelle],
    })
    .eq('id', target.id)

  if (error) throw error

  await syncForecastCyclesPilule(supabase, userId)
}

export async function createMenstruationCyclePilule(supabase, userId, payload) {
  const nextNumero = await getNextNumeroCycle(supabase, userId)
  const record = buildCycle1Record(userId, nextNumero, payload)

  const { data, error } = await supabase.from(TABLE).insert(record).select().single()
  if (error) throw error

  await syncForecastCyclesPilule(supabase, userId)

  return data
}
