import { computed, ref } from 'vue'
import {
  COURSES_CACHE_KEY_PREFIX,
  COURSES_DEFAULT_RENEW_THRESHOLD_DAYS,
  COURSES_GROUP_BY,
  COURSES_LISTE_STATUTS,
  COURSES_SANS_CATEGORIE_ID,
  COURSES_SANS_MAGASIN_ID,
  COURSES_STATUTS,
} from '../constants/courses/courses.js'
import * as coursesService from '../services/courses/coursesService.js'
import {
  durabilityCardCaption,
  durabilityProgress,
  estimatedRenewalDate,
  needsRenewalSoon,
  renewalStatusLabel,
} from '../utils/courses/coursesDurability.js'

function cacheKey(userId) {
  return `${COURSES_CACHE_KEY_PREFIX}${userId}`
}

function readCache(userId) {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      magasins: parsed.magasins ?? [],
      categories: parsed.categories ?? [],
      listes: parsed.listes ?? [],
      articles: parsed.articles ?? [],
      historique: parsed.historique ?? [],
      savedAt: parsed.savedAt ?? null,
    }
  } catch {
    return null
  }
}

function writeCache(userId, bundle) {
  try {
    localStorage.setItem(
      cacheKey(userId),
      JSON.stringify({
        magasins: bundle.magasins ?? [],
        categories: bundle.categories ?? [],
        listes: bundle.listes ?? [],
        articles: bundle.articles ?? [],
        historique: bundle.historique ?? [],
        savedAt: new Date().toISOString(),
      }),
    )
  } catch {
    /* quota / private mode */
  }
}

/**
 * État et actions de la page Courses (sans dépendance Supabase directe).
 */
export function useCourses() {
  const userId = ref(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)
  const fromCache = ref(false)

  const magasins = ref([])
  const categories = ref([])
  const listes = ref([])
  const articles = ref([])
  const historique = ref([])

  const groupBy = ref(COURSES_GROUP_BY.MAGASIN)
  const selectedListeId = ref(null)
  const renewThresholdDays = ref(COURSES_DEFAULT_RENEW_THRESHOLD_DAYS)
  const renewSectionOpen = ref(true)

  const magasinById = computed(() => {
    const map = new Map()
    for (const m of magasins.value) map.set(m.id, m)
    return map
  })

  const categorieById = computed(() => {
    const map = new Map()
    for (const c of categories.value) map.set(c.id, c)
    return map
  })

  const listeById = computed(() => {
    const map = new Map()
    for (const l of listes.value) map.set(l.id, l)
    return map
  })

  const openListes = computed(() =>
    listes.value.filter((l) => l.statut === COURSES_LISTE_STATUTS.OUVERTE),
  )

  const closedListes = computed(() =>
    listes.value.filter((l) => l.statut === COURSES_LISTE_STATUTS.FERMEE),
  )

  const selectedListe = computed(() =>
    selectedListeId.value ? listeById.value.get(selectedListeId.value) || null : null,
  )

  /** Articles actifs de la vitrine (filtre liste courante si sélectionnée). */
  const activeArticles = computed(() => {
    const base = articles.value.filter((a) =>
      [COURSES_STATUTS.A_ACHETER, COURSES_STATUTS.DANS_PANIER, COURSES_STATUTS.REPORTE].includes(
        a.statut,
      ),
    )
    if (!selectedListeId.value) return base
    return base.filter((a) => a.liste_id === selectedListeId.value)
  })

  const selectedListeRestants = computed(() => {
    if (!selectedListeId.value) return []
    return articles.value.filter(
      (a) =>
        a.liste_id === selectedListeId.value &&
        [COURSES_STATUTS.A_ACHETER, COURSES_STATUTS.DANS_PANIER, COURSES_STATUTS.REPORTE].includes(
          a.statut,
        ),
    )
  })

  const renewArticles = computed(() => {
    const threshold = renewThresholdDays.value
    return articles.value
      .filter((a) => needsRenewalSoon(a, threshold))
      .map((a) => enrichArticle(a))
      .sort((a, b) => {
        const da = a.daysUntilRenewal ?? 9999
        const db = b.daysUntilRenewal ?? 9999
        return da - db
      })
  })

  function enrichArticle(article) {
    const magasin = article.magasin_id ? magasinById.value.get(article.magasin_id) : null
    const categorie = article.categorie_id
      ? categorieById.value.get(article.categorie_id)
      : null
    const liste = article.liste_id ? listeById.value.get(article.liste_id) : null
    const renewalDate = estimatedRenewalDate(article)
    return {
      ...article,
      magasin,
      categorie,
      liste,
      renewalDate,
      renewLabel: renewalStatusLabel(article, renewThresholdDays.value),
      durabilityCaption: durabilityCardCaption(article),
      durabilityProgress: durabilityProgress(article),
      daysUntilRenewal: (() => {
        if (!renewalDate) return null
        const end = new Date(`${renewalDate}T12:00:00`)
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        return Math.round((end.getTime() - today.getTime()) / 86400000)
      })(),
    }
  }

  function groupArticles(list, by) {
    const groups = []
    const indexByKey = new Map()

    const push = (key, title, color, meta, article) => {
      let group = indexByKey.get(key)
      if (!group) {
        group = { key, title, color, meta, articles: [] }
        indexByKey.set(key, group)
        groups.push(group)
      }
      group.articles.push(enrichArticle(article))
    }

    for (const article of list) {
      if (by === COURSES_GROUP_BY.CATEGORIE) {
        const cat = article.categorie_id
          ? categorieById.value.get(article.categorie_id)
          : null
        if (cat) {
          push(
            cat.id,
            `${cat.icone || ''} ${cat.nom}`.trim(),
            cat.couleur || null,
            { categorie: cat },
            article,
          )
        } else {
          push(COURSES_SANS_CATEGORIE_ID, 'Sans rayon', '#9aa0a6', { categorie: null }, article)
        }
      } else {
        const mag = article.magasin_id ? magasinById.value.get(article.magasin_id) : null
        if (mag) {
          push(mag.id, mag.nom, mag.couleur, { magasin: mag }, article)
        } else {
          push(
            COURSES_SANS_MAGASIN_ID,
            'N’importe où',
            '#9aa0a6',
            { magasin: null },
            article,
          )
        }
      }
    }

    for (const g of groups) {
      g.articles.sort((a, b) =>
        String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' }),
      )
    }

    if (by === COURSES_GROUP_BY.MAGASIN) {
      groups.sort((a, b) => {
        if (a.key === COURSES_SANS_MAGASIN_ID) return 1
        if (b.key === COURSES_SANS_MAGASIN_ID) return -1
        const na = a.meta.magasin?.nom || a.title
        const nb = b.meta.magasin?.nom || b.title
        return String(na).localeCompare(String(nb), 'fr', { sensitivity: 'base' })
      })
    } else {
      groups.sort((a, b) => {
        if (a.key === COURSES_SANS_CATEGORIE_ID) return 1
        if (b.key === COURSES_SANS_CATEGORIE_ID) return -1
        const na = a.meta.categorie?.nom || a.title
        const nb = b.meta.categorie?.nom || b.title
        return String(na).localeCompare(String(nb), 'fr', { sensitivity: 'base' })
      })
    }

    return groups
  }

  const vitrineGroups = computed(() => groupArticles(activeArticles.value, groupBy.value))

  function sortByNom(list) {
    return [...(list ?? [])].sort((a, b) =>
      String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' }),
    )
  }

  function applyBundle(bundle, { cached = false } = {}) {
    magasins.value = sortByNom(bundle.magasins)
    categories.value = sortByNom(bundle.categories)
    listes.value = bundle.listes ?? []
    articles.value = bundle.articles ?? []
    historique.value = bundle.historique ?? []
    fromCache.value = cached
    syncSelectedListe()
  }

  function syncSelectedListe() {
    if (!selectedListeId.value) return
    if (!listes.value.some((l) => l.id === selectedListeId.value)) {
      selectedListeId.value = null
    }
  }

  function clearListeFilter() {
    selectedListeId.value = null
  }

  function persistLocal() {
    if (!userId.value) return
    writeCache(userId.value, {
      magasins: magasins.value,
      categories: categories.value,
      listes: listes.value,
      articles: articles.value,
      historique: historique.value,
    })
  }

  async function load(uid) {
    userId.value = uid || null
    error.value = null
    if (!uid) {
      applyBundle({
        magasins: [],
        categories: [],
        listes: [],
        articles: [],
        historique: [],
      })
      return
    }

    const cached = readCache(uid)
    if (cached) applyBundle(cached, { cached: true })

    loading.value = true
    try {
      const bundle = await coursesService.loadCoursesBundle(uid)
      applyBundle(bundle, { cached: false })
      writeCache(uid, bundle)
    } catch (err) {
      console.error(err)
      error.value = err?.message || 'Impossible de charger les courses.'
      if (!cached) throw err
    } finally {
      loading.value = false
    }
  }

  async function withSaving(fn) {
    saving.value = true
    error.value = null
    try {
      const result = await fn()
      persistLocal()
      return result
    } catch (err) {
      console.error(err)
      error.value = err?.message || 'Une erreur est survenue.'
      throw err
    } finally {
      saving.value = false
    }
  }

  function replaceArticle(updated) {
    const idx = articles.value.findIndex((a) => a.id === updated.id)
    if (idx >= 0) articles.value.splice(idx, 1, updated)
    else articles.value.unshift(updated)
  }

  function removeArticlesLocal(ids) {
    const set = new Set(ids)
    articles.value = articles.value.filter((a) => !set.has(a.id))
  }

  // —— Actions magasins / catégories ————————————————————————————————

  function upsertMagasinLocal(row) {
    const idx = magasins.value.findIndex((m) => m.id === row.id)
    if (idx >= 0) magasins.value.splice(idx, 1, row)
    else magasins.value = [...magasins.value, row]
    magasins.value = sortByNom(magasins.value)
  }

  function upsertCategorieLocal(row) {
    const idx = categories.value.findIndex((c) => c.id === row.id)
    if (idx >= 0) categories.value.splice(idx, 1, row)
    else categories.value = [...categories.value, row]
    categories.value = sortByNom(categories.value)
  }

  async function resolveArticleNames(input = {}) {
    const out = { ...input }
    if (Object.prototype.hasOwnProperty.call(input, 'magasin_nom')) {
      const row = await coursesService.ensureMagasinByName(
        userId.value,
        input.magasin_nom,
        magasins.value,
      )
      if (row) upsertMagasinLocal(row)
      out.magasin_id = row?.id ?? null
      delete out.magasin_nom
    }
    if (Object.prototype.hasOwnProperty.call(input, 'categorie_nom')) {
      const row = await coursesService.ensureCategorieByName(
        userId.value,
        input.categorie_nom,
        categories.value,
      )
      if (row) upsertCategorieLocal(row)
      out.categorie_id = row?.id ?? null
      delete out.categorie_nom
    }
    return out
  }

  async function addMagasin(input) {
    return withSaving(async () => {
      const row = await coursesService.createMagasin(userId.value, input)
      upsertMagasinLocal(row)
      return row
    })
  }

  async function editMagasin(id, input) {
    return withSaving(async () => {
      const row = await coursesService.updateMagasin(userId.value, id, input)
      magasins.value = sortByNom(magasins.value.map((m) => (m.id === id ? row : m)))
      return row
    })
  }

  async function removeMagasin(id) {
    return withSaving(async () => {
      await coursesService.deleteMagasin(userId.value, id)
      magasins.value = magasins.value.filter((m) => m.id !== id)
      articles.value = articles.value.map((a) =>
        a.magasin_id === id ? { ...a, magasin_id: null } : a,
      )
    })
  }

  async function reorderMagasins(ids) {
    return withSaving(async () => {
      await coursesService.reorderMagasins(userId.value, ids)
      const order = new Map(ids.map((id, i) => [id, (i + 1) * 10]))
      magasins.value = sortByNom(
        magasins.value.map((m) => (order.has(m.id) ? { ...m, ordre: order.get(m.id) } : m)),
      )
    })
  }

  async function addCategorie(input) {
    return withSaving(async () => {
      const row = await coursesService.createCategorie(userId.value, input)
      upsertCategorieLocal(row)
      return row
    })
  }

  async function editCategorie(id, input) {
    return withSaving(async () => {
      const row = await coursesService.updateCategorie(userId.value, id, input)
      categories.value = sortByNom(categories.value.map((c) => (c.id === id ? row : c)))
      return row
    })
  }

  async function removeCategorie(id) {
    return withSaving(async () => {
      await coursesService.deleteCategorie(userId.value, id)
      categories.value = categories.value.filter((c) => c.id !== id)
      articles.value = articles.value.map((a) =>
        a.categorie_id === id ? { ...a, categorie_id: null } : a,
      )
    })
  }

  async function reorderCategories(ids) {
    return withSaving(async () => {
      await coursesService.reorderCategories(userId.value, ids)
      const order = new Map(ids.map((id, i) => [id, (i + 1) * 10]))
      categories.value = sortByNom(
        categories.value.map((c) => (order.has(c.id) ? { ...c, ordre: order.get(c.id) } : c)),
      )
    })
  }

  // —— Listes ————————————————————————————————————————————————————————

  function upsertListeLocal(row) {
    const idx = listes.value.findIndex((l) => l.id === row.id)
    if (idx >= 0) listes.value.splice(idx, 1, row)
    else listes.value = [row, ...listes.value]
    listes.value = [...listes.value].sort((a, b) => {
      const da = String(b.date_liste || '')
      const db = String(a.date_liste || '')
      if (da !== db) return da.localeCompare(db)
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
  }

  async function addListe(input = {}) {
    return withSaving(async () => {
      const row = await coursesService.createListe(userId.value, input)
      upsertListeLocal(row)
      return row
    })
  }

  async function editListe(id, input) {
    return withSaving(async () => {
      const row = await coursesService.updateListe(userId.value, id, input)
      upsertListeLocal(row)
      return row
    })
  }

  async function removeListe(id) {
    return withSaving(async () => {
      await coursesService.deleteListe(userId.value, id)
      listes.value = listes.value.filter((l) => l.id !== id)
      articles.value = articles.value.map((a) =>
        a.liste_id === id ? { ...a, liste_id: null } : a,
      )
      syncSelectedListe()
    })
  }

  /**
   * Ferme une liste. Optionnellement reporte les non achetés vers une autre liste
   * (créée si besoin).
   */
  async function closeListeById(
    listeId,
    { reporterRestants = false, targetListeId = null } = {},
  ) {
    if (!listeId) return null
    return withSaving(async () => {
      let targetId = targetListeId
      if (reporterRestants && !targetId) {
        const target = await coursesService.createListe(userId.value, {
          nom: 'Reportés',
        })
        upsertListeLocal(target)
        targetId = target.id
      }
      const result = await coursesService.closeListe(userId.value, listeId, {
        reporterRestants,
        targetListeId: targetId,
      })
      upsertListeLocal(result.liste)
      for (const row of result.reported || []) replaceArticle(row)
      if (selectedListeId.value === listeId) {
        selectedListeId.value = reporterRestants && targetId ? targetId : null
      }
      return result
    })
  }

  async function reporterRestantsVers(fromListeId, targetListeId = null) {
    const listeId = fromListeId || selectedListeId.value
    if (!listeId) return []
    const ids = articles.value
      .filter(
        (a) =>
          a.liste_id === listeId &&
          [COURSES_STATUTS.A_ACHETER, COURSES_STATUTS.DANS_PANIER, COURSES_STATUTS.REPORTE].includes(
            a.statut,
          ),
      )
      .map((a) => a.id)
    if (!ids.length) return []
    return withSaving(async () => {
      let targetId = targetListeId
      if (!targetId) {
        const target = await coursesService.createListe(userId.value, { nom: 'Reportés' })
        upsertListeLocal(target)
        targetId = target.id
      }
      const rows = await coursesService.moveArticlesToListe(userId.value, ids, targetId, {
        statut: COURSES_STATUTS.REPORTE,
      })
      for (const row of rows) replaceArticle(row)
      return rows
    })
  }

  // —— Articles ——————————————————————————————————————————————————————

  async function addArticle(input) {
    return withSaving(async () => {
      const resolved = await resolveArticleNames(input)
      // Pas d’auto-rattachement à une liste : uniquement si liste_id est fourni explicitement.
      const payload = { ...resolved }
      if (payload.liste_id === undefined) payload.liste_id = null
      const row = await coursesService.createArticle(userId.value, payload)
      articles.value = [row, ...articles.value]
      return row
    })
  }

  async function addArticleToListe(articleId, listeId) {
    if (!articleId || !listeId) throw new Error('Liste introuvable.')
    return editArticle(articleId, {
      liste_id: listeId,
      statut: COURSES_STATUTS.A_ACHETER,
    })
  }

  /**
   * Marque un article comme acheté maintenant (historique + suivi de durée de vie éventuel).
   */
  async function markPurchased(articleId, { updateDurabilite = true } = {}) {
    const article = articles.value.find((a) => a.id === articleId)
    if (!article) throw new Error('Article introuvable.')
    return withSaving(async () => {
      const result = await coursesService.finishShoppingTrip(
        userId.value,
        [article],
        { updateDurabilite: updateDurabilite && Boolean(article.suivi_durabilite) },
      )
      for (const row of result.updated) replaceArticle(row)
      if (result.historique?.length) {
        historique.value = [...result.historique, ...historique.value]
      }
      return result
    })
  }

  async function editArticle(id, input) {
    return withSaving(async () => {
      const resolved = await resolveArticleNames(input)
      const row = await coursesService.updateArticle(userId.value, id, resolved)
      replaceArticle(row)
      return row
    })
  }

  async function removeArticle(id) {
    return withSaving(async () => {
      await coursesService.deleteArticle(userId.value, id)
      removeArticlesLocal([id])
    })
  }

  async function racheter(id) {
    return editArticle(id, { statut: COURSES_STATUTS.A_ACHETER })
  }

  /**
   * Saisie rapide : réutilise magasin / catégorie / icône de la dernière occurrence.
   */
  async function quickAdd(nomRaw) {
    const nom = String(nomRaw ?? '').trim()
    if (!nom) return null

    const lower = nom.toLowerCase()
    const fromArticles = articles.value.find((a) => a.nom.trim().toLowerCase() === lower)
    const fromHist = historique.value.find((h) => h.nom.trim().toLowerCase() === lower)

    const template = fromArticles || null
    const histMagasin = fromHist?.magasin_id ?? null

    return addArticle({
      nom,
      marque: template?.marque ?? null,
      quantite: template?.quantite ?? null,
      unite: template?.unite ?? null,
      categorie_id: template?.categorie_id ?? null,
      magasin_id: template?.magasin_id ?? histMagasin,
      liste_id: null,
      lien_image: template?.lien_image ?? null,
      statut: COURSES_STATUTS.A_ACHETER,
      priorite: template?.priorite ?? null,
    })
  }

  function autocompleteSuggestions(query) {
    const q = String(query ?? '')
      .trim()
      .toLowerCase()
    if (q.length < 1) return []
    const seen = new Set()
    const out = []

    const push = (nom, source) => {
      const key = nom.trim().toLowerCase()
      if (!key || seen.has(key) || !key.includes(q)) return
      seen.add(key)
      out.push({ nom: nom.trim(), source })
    }

    for (const a of articles.value) push(a.nom, 'article')
    for (const h of historique.value) push(h.nom, 'historique')
    return out.slice(0, 8)
  }

  function buildExportText() {
    const groups = groupArticles(activeArticles.value, groupBy.value)
    const lines = ['Courses — liste complète', '']
    for (const group of groups) {
      lines.push(group.title)
      for (const a of group.articles) {
        const parts = []
        if (a.marque) parts.push(a.marque)
        if (a.quantite != null && a.unite) parts.push(`${a.quantite} ${a.unite}`)
        else if (a.quantite != null) parts.push(String(a.quantite))
        else if (a.unite) parts.push(a.unite)
        const extra = parts.length ? ` (${parts.join(' · ')})` : ''
        lines.push(`- ${a.nom}${extra}`)
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }

  async function copyExportText() {
    const text = buildExportText()
    await navigator.clipboard.writeText(text)
    return text
  }

  return {
    userId,
    loading,
    saving,
    error,
    fromCache,
    magasins,
    categories,
    listes,
    articles,
    historique,
    groupBy,
    selectedListeId,
    selectedListe,
    openListes,
    closedListes,
    selectedListeRestants,
    clearListeFilter,
    renewThresholdDays,
    renewSectionOpen,
    magasinById,
    categorieById,
    listeById,
    activeArticles,
    renewArticles,
    vitrineGroups,
    enrichArticle,
    estimatedRenewalDate,
    load,
    addMagasin,
    editMagasin,
    removeMagasin,
    reorderMagasins,
    addCategorie,
    editCategorie,
    removeCategorie,
    reorderCategories,
    addListe,
    editListe,
    removeListe,
    closeListeById,
    reporterRestantsVers,
    addArticle,
    editArticle,
    removeArticle,
    addArticleToListe,
    markPurchased,
    racheter,
    quickAdd,
    autocompleteSuggestions,
    buildExportText,
    copyExportText,
    COURSES_GROUP_BY,
    COURSES_STATUTS,
    COURSES_LISTE_STATUTS,
  }
}
