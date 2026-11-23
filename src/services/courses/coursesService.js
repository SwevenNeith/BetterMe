/**
 * Accès données Courses — seul module qui parle à Supabase pour cette page.
 * Remplacer ce fichier lors de la migration NAS.
 */

import { supabase } from '../../lib/supabase.js'
import {
  COURSES_DEFAULT_CATEGORIE_COULEUR,
  COURSES_DEFAULT_ICONE,
  COURSES_DEFAULT_MAGASIN_COULEUR,
  COURSES_LISTE_STATUTS,
  COURSES_STATUTS,
} from '../../constants/courses/courses.js'

const TABLE_MAGASINS = 'courses_magasins'
const TABLE_CATEGORIES = 'courses_categories'
const TABLE_LISTES = 'courses_listes'
const TABLE_ARTICLES = 'courses_articles'
const TABLE_HISTORIQUE = 'courses_historique'

const SELECT_MAGASIN = 'id, user_id, nom, type, couleur, url, ordre, created_at'
const SELECT_CATEGORIE = 'id, user_id, nom, icone, couleur, ordre, created_at'
const SELECT_LISTE = 'id, user_id, nom, date_liste, statut, created_at, updated_at'
const SELECT_ARTICLE =
  'id, user_id, nom, marque, quantite, unite, categorie_id, magasin_id, liste_id, statut, priorite, prix, note, lien, lien_image, icone, suivi_durabilite, date_dernier_achat, duree_valeur, duree_unite, created_at, updated_at'
const SELECT_HISTORIQUE =
  'id, user_id, article_id, nom, magasin_id, date_achat, prix, created_at'

function trimOrNull(value) {
  const t = String(value ?? '').trim()
  return t || null
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeMagasinPayload(input = {}) {
  const nom = String(input.nom ?? '').trim()
  if (!nom) throw new Error('Indique un nom de magasin.')
  const type = ['physique', 'en_ligne', 'autre'].includes(input.type)
    ? input.type
    : 'physique'
  return {
    nom,
    type,
    couleur: trimOrNull(input.couleur) || COURSES_DEFAULT_MAGASIN_COULEUR,
    url: trimOrNull(input.url),
    ordre: Number.isFinite(Number(input.ordre)) ? Number(input.ordre) : 100,
  }
}

function normalizeCategoriePayload(input = {}) {
  const nom = String(input.nom ?? '').trim()
  if (!nom) throw new Error('Indique un nom de rayon.')
  return {
    nom,
    icone: trimOrNull(input.icone) || COURSES_DEFAULT_ICONE,
    couleur: trimOrNull(input.couleur) || COURSES_DEFAULT_CATEGORIE_COULEUR,
    ordre: Number.isFinite(Number(input.ordre)) ? Number(input.ordre) : 100,
  }
}

function normalizeListePayload(input = {}, { partial = false } = {}) {
  const out = {}
  if (!partial || input.nom !== undefined) {
    const nom = String(input.nom ?? '').trim()
    if (!nom) throw new Error('Indique un nom de liste.')
    out.nom = nom
  }
  if (!partial || input.date_liste !== undefined) {
    out.date_liste = trimOrNull(input.date_liste) || todayISO()
  }
  if (!partial || input.statut !== undefined) {
    const statut = String(input.statut || COURSES_LISTE_STATUTS.OUVERTE)
    out.statut = Object.values(COURSES_LISTE_STATUTS).includes(statut)
      ? statut
      : COURSES_LISTE_STATUTS.OUVERTE
  }
  out.updated_at = new Date().toISOString()
  return out
}

function normalizeOptionalQuantity(value) {
  if (value == null || value === '') return null
  const q = Number(value)
  return Number.isFinite(q) && q > 0 ? q : null
}

function normalizeOptionalPrix(value) {
  if (value == null || value === '') return null
  const prix = Number(value)
  return Number.isFinite(prix) && prix >= 0 ? prix : null
}

function normalizeArticlePayload(input = {}, { partial = false } = {}) {
  const out = {}

  if (!partial || input.nom !== undefined) {
    const nom = String(input.nom ?? '').trim()
    if (!nom) throw new Error('Indique un nom d’article.')
    out.nom = nom
  }
  if (!partial || input.marque !== undefined) out.marque = trimOrNull(input.marque)
  if (!partial || input.quantite !== undefined) {
    out.quantite = normalizeOptionalQuantity(input.quantite)
  }
  if (!partial || input.unite !== undefined) out.unite = trimOrNull(input.unite)
  if (!partial || input.categorie_id !== undefined) {
    out.categorie_id = trimOrNull(input.categorie_id)
  }
  if (!partial || input.magasin_id !== undefined) {
    out.magasin_id = trimOrNull(input.magasin_id)
  }
  if (!partial || input.liste_id !== undefined) {
    out.liste_id = trimOrNull(input.liste_id)
  }
  if (!partial || input.statut !== undefined) {
    const statut = String(input.statut || COURSES_STATUTS.A_ACHETER)
    out.statut = Object.values(COURSES_STATUTS).includes(statut)
      ? statut
      : COURSES_STATUTS.A_ACHETER
  }
  if (!partial || input.priorite !== undefined) {
    if (input.priorite == null || input.priorite === '') {
      out.priorite = null
    } else {
      const p = Number(input.priorite)
      out.priorite = p >= 1 && p <= 3 ? p : null
    }
  }

  const prixRaw =
    input.prix !== undefined ? input.prix : input.prix_estime !== undefined ? input.prix_estime : undefined
  if (!partial || prixRaw !== undefined) {
    out.prix = normalizeOptionalPrix(prixRaw)
  }

  if (!partial || input.note !== undefined) out.note = trimOrNull(input.note)
  if (!partial || input.lien !== undefined) out.lien = trimOrNull(input.lien)
  if (!partial || input.lien_image !== undefined) {
    out.lien_image = trimOrNull(input.lien_image)
  }
  if (!partial || input.icone !== undefined) {
    out.icone = trimOrNull(input.icone) || COURSES_DEFAULT_ICONE
  }

  const suivi =
    input.suivi_durabilite === true || input.suivi_durabilite === 'true'
  if (!partial || input.suivi_durabilite !== undefined) {
    out.suivi_durabilite = suivi
  }

  if (!partial || input.suivi_durabilite !== undefined || input.date_dernier_achat !== undefined) {
    if ((partial ? (input.suivi_durabilite !== undefined ? suivi : undefined) : suivi) === false) {
      out.date_dernier_achat = null
      out.duree_valeur = null
      out.duree_unite = null
      out.suivi_durabilite = false
    } else if (suivi || input.date_dernier_achat !== undefined) {
      if (!partial || input.date_dernier_achat !== undefined) {
        out.date_dernier_achat = trimOrNull(input.date_dernier_achat)
      }
      if (!partial || input.duree_valeur !== undefined) {
        const v = Number(input.duree_valeur)
        out.duree_valeur = Number.isFinite(v) && v > 0 ? Math.round(v) : null
      }
      if (!partial || input.duree_unite !== undefined) {
        const u = String(input.duree_unite || '')
        out.duree_unite = ['jours', 'semaines', 'mois', 'ans'].includes(u) ? u : null
      }
    }
  }

  out.updated_at = new Date().toISOString()
  return out
}

async function requireUserId(userId) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  return userId
}

// —— Magasins ———————————————————————————————————————————————————————————————

export async function listMagasins(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE_MAGASINS)
    .select(SELECT_MAGASIN)
    .eq('user_id', userId)
    .order('nom', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createMagasin(userId, input) {
  await requireUserId(userId)
  const payload = { user_id: userId, ...normalizeMagasinPayload(input) }
  const { data, error } = await supabase
    .from(TABLE_MAGASINS)
    .insert(payload)
    .select(SELECT_MAGASIN)
    .single()
  if (error) throw error
  return data
}

/**
 * Trouve un magasin par nom (insensible à la casse) ou le crée.
 * @returns {Promise<object|null>} null si nom vide
 */
export async function ensureMagasinByName(userId, rawName, existing = null) {
  await requireUserId(userId)
  const nom = String(rawName ?? '').trim()
  if (!nom) return null
  const list = existing ?? (await listMagasins(userId))
  const found = list.find((m) => String(m.nom).trim().toLowerCase() === nom.toLowerCase())
  if (found) return found
  return createMagasin(userId, { nom })
}

export async function updateMagasin(userId, id, input = {}) {
  await requireUserId(userId)
  if (!id) throw new Error('Magasin introuvable.')
  const payload = {}
  if (input.nom !== undefined) {
    const nom = String(input.nom ?? '').trim()
    if (!nom) throw new Error('Indique un nom de magasin.')
    payload.nom = nom
  }
  if (input.type !== undefined) {
    payload.type = ['physique', 'en_ligne', 'autre'].includes(input.type)
      ? input.type
      : 'physique'
  }
  if (input.couleur !== undefined) {
    payload.couleur = trimOrNull(input.couleur) || COURSES_DEFAULT_MAGASIN_COULEUR
  }
  if (input.url !== undefined) payload.url = trimOrNull(input.url)
  if (input.ordre !== undefined) {
    payload.ordre = Number.isFinite(Number(input.ordre)) ? Number(input.ordre) : 100
  }
  const { data, error } = await supabase
    .from(TABLE_MAGASINS)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', id)
    .select(SELECT_MAGASIN)
    .single()
  if (error) throw error
  return data
}

export async function deleteMagasin(userId, id) {
  await requireUserId(userId)
  if (!id) throw new Error('Magasin introuvable.')
  const { error } = await supabase
    .from(TABLE_MAGASINS)
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function reorderMagasins(userId, orderedIds) {
  await requireUserId(userId)
  const ids = Array.isArray(orderedIds) ? orderedIds.filter(Boolean) : []
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from(TABLE_MAGASINS)
        .update({ ordre: (index + 1) * 10 })
        .eq('user_id', userId)
        .eq('id', id),
    ),
  )
}

// —— Catégories —————————————————————————————————————————————————————————————

export async function listCategories(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE_CATEGORIES)
    .select(SELECT_CATEGORIE)
    .eq('user_id', userId)
    .order('nom', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createCategorie(userId, input) {
  await requireUserId(userId)
  const payload = { user_id: userId, ...normalizeCategoriePayload(input) }
  const { data, error } = await supabase
    .from(TABLE_CATEGORIES)
    .insert(payload)
    .select(SELECT_CATEGORIE)
    .single()
  if (error) throw error
  return data
}

/**
 * Trouve un rayon par nom (insensible à la casse) ou le crée.
 * @returns {Promise<object|null>} null si nom vide
 */
export async function ensureCategorieByName(userId, rawName, existing = null) {
  await requireUserId(userId)
  const nom = String(rawName ?? '').trim()
  if (!nom) return null
  const list = existing ?? (await listCategories(userId))
  const found = list.find((c) => String(c.nom).trim().toLowerCase() === nom.toLowerCase())
  if (found) return found
  return createCategorie(userId, { nom })
}

export async function updateCategorie(userId, id, input = {}) {
  await requireUserId(userId)
  if (!id) throw new Error('Rayon introuvable.')
  const payload = {}
  if (input.nom !== undefined) {
    const nom = String(input.nom ?? '').trim()
    if (!nom) throw new Error('Indique un nom de rayon.')
    payload.nom = nom
  }
  if (input.icone !== undefined) {
    payload.icone = trimOrNull(input.icone) || COURSES_DEFAULT_ICONE
  }
  if (input.couleur !== undefined) {
    payload.couleur = trimOrNull(input.couleur) || COURSES_DEFAULT_CATEGORIE_COULEUR
  }
  if (input.ordre !== undefined) {
    payload.ordre = Number.isFinite(Number(input.ordre)) ? Number(input.ordre) : 100
  }
  const { data, error } = await supabase
    .from(TABLE_CATEGORIES)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', id)
    .select(SELECT_CATEGORIE)
    .single()
  if (error) throw error
  return data
}

export async function deleteCategorie(userId, id) {
  await requireUserId(userId)
  if (!id) throw new Error('Rayon introuvable.')
  const { error } = await supabase
    .from(TABLE_CATEGORIES)
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function reorderCategories(userId, orderedIds) {
  await requireUserId(userId)
  const ids = Array.isArray(orderedIds) ? orderedIds.filter(Boolean) : []
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from(TABLE_CATEGORIES)
        .update({ ordre: (index + 1) * 10 })
        .eq('user_id', userId)
        .eq('id', id),
    ),
  )
}

// —— Listes —————————————————————————————————————————————————————————————————

export async function listListes(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE_LISTES)
    .select(SELECT_LISTE)
    .eq('user_id', userId)
    .order('date_liste', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createListe(userId, input = {}) {
  await requireUserId(userId)
  const nom = String(input.nom ?? '').trim()
  if (!nom) throw new Error('Indique un nom de liste.')
  const payload = {
    user_id: userId,
    ...normalizeListePayload({
      nom,
      date_liste: input.date_liste,
      statut: input.statut || COURSES_LISTE_STATUTS.OUVERTE,
    }),
  }
  const { data, error } = await supabase
    .from(TABLE_LISTES)
    .insert(payload)
    .select(SELECT_LISTE)
    .single()
  if (error) throw error
  return data
}

export async function updateListe(userId, id, input = {}) {
  await requireUserId(userId)
  if (!id) throw new Error('Liste introuvable.')
  const payload = normalizeListePayload(input, { partial: true })
  const { data, error } = await supabase
    .from(TABLE_LISTES)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', id)
    .select(SELECT_LISTE)
    .single()
  if (error) throw error
  return data
}

export async function deleteListe(userId, id) {
  await requireUserId(userId)
  if (!id) throw new Error('Liste introuvable.')
  const { error } = await supabase
    .from(TABLE_LISTES)
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

/**
 * Ferme une liste. Si reporterRestants + targetListeId, déplace les non achetés.
 */
export async function closeListe(userId, listeId, options = {}) {
  await requireUserId(userId)
  if (!listeId) throw new Error('Liste introuvable.')

  const { reporterRestants = false, targetListeId = null } = options
  let reported = []

  if (reporterRestants) {
    const targetId = targetListeId
    if (!targetId) throw new Error('Choisis une liste pour reporter les articles.')

    const { data: restants, error: listError } = await supabase
      .from(TABLE_ARTICLES)
      .select(SELECT_ARTICLE)
      .eq('user_id', userId)
      .eq('liste_id', listeId)
      .in('statut', [
        COURSES_STATUTS.A_ACHETER,
        COURSES_STATUTS.DANS_PANIER,
        COURSES_STATUTS.REPORTE,
      ])
    if (listError) throw listError

    const ids = (restants ?? []).map((a) => a.id)
    if (ids.length) {
      const { data, error } = await supabase
        .from(TABLE_ARTICLES)
        .update({
          liste_id: targetId,
          statut: COURSES_STATUTS.REPORTE,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .in('id', ids)
        .select(SELECT_ARTICLE)
      if (error) throw error
      reported = data ?? []
    }
  }

  const liste = await updateListe(userId, listeId, { statut: COURSES_LISTE_STATUTS.FERMEE })
  return { liste, reported }
}

// —— Articles ———————————————————————————————————————————————————————————————

export async function listArticles(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE_ARTICLES)
    .select(SELECT_ARTICLE)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createArticle(userId, input) {
  await requireUserId(userId)
  const payload = { user_id: userId, ...normalizeArticlePayload(input) }
  const { data, error } = await supabase
    .from(TABLE_ARTICLES)
    .insert(payload)
    .select(SELECT_ARTICLE)
    .single()
  if (error) throw error
  return data
}

export async function updateArticle(userId, id, input) {
  await requireUserId(userId)
  if (!id) throw new Error('Article introuvable.')
  const payload = normalizeArticlePayload(input, { partial: true })
  const { data, error } = await supabase
    .from(TABLE_ARTICLES)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', id)
    .select(SELECT_ARTICLE)
    .single()
  if (error) throw error
  return data
}

export async function deleteArticle(userId, id) {
  await requireUserId(userId)
  if (!id) throw new Error('Article introuvable.')
  const { error } = await supabase
    .from(TABLE_ARTICLES)
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function deleteArticles(userId, ids) {
  await requireUserId(userId)
  const list = (ids || []).filter(Boolean)
  if (!list.length) return
  const { error } = await supabase
    .from(TABLE_ARTICLES)
    .delete()
    .eq('user_id', userId)
    .in('id', list)
  if (error) throw error
}

export async function moveArticlesToListe(userId, articleIds, targetListeId, { statut = null } = {}) {
  await requireUserId(userId)
  const ids = (articleIds || []).filter(Boolean)
  if (!ids.length || !targetListeId) return []
  const patch = {
    liste_id: targetListeId,
    updated_at: new Date().toISOString(),
  }
  if (statut) patch.statut = statut
  const { data, error } = await supabase
    .from(TABLE_ARTICLES)
    .update(patch)
    .eq('user_id', userId)
    .in('id', ids)
    .select(SELECT_ARTICLE)
  if (error) throw error
  return data ?? []
}

/**
 * Charge magasins, catégories, listes, articles et un extrait d’historique.
 */
export async function loadCoursesBundle(userId) {
  if (!userId) {
    return { magasins: [], categories: [], listes: [], articles: [], historique: [] }
  }
  const [magasins, categories, listes, articles, historique] = await Promise.all([
    listMagasins(userId),
    listCategories(userId),
    listListes(userId),
    listArticles(userId),
    listHistorique(userId, { limit: 200 }),
  ])
  return { magasins, categories, listes, articles, historique }
}

// —— Historique —————————————————————————————————————————————————————————————

export async function listHistorique(userId, { limit = 100 } = {}) {
  if (!userId) return []
  let query = supabase
    .from(TABLE_HISTORIQUE)
    .select(SELECT_HISTORIQUE)
    .eq('user_id', userId)
    .order('date_achat', { ascending: false })
    .order('created_at', { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createHistoriqueEntry(userId, input) {
  await requireUserId(userId)
  const nom = String(input?.nom ?? '').trim()
  if (!nom) throw new Error('Nom d’historique manquant.')
  const payload = {
    user_id: userId,
    article_id: trimOrNull(input.article_id),
    nom,
    magasin_id: trimOrNull(input.magasin_id),
    date_achat: trimOrNull(input.date_achat) || todayISO(),
    prix:
      input.prix == null || input.prix === ''
        ? null
        : Number.isFinite(Number(input.prix))
          ? Number(input.prix)
          : null,
  }
  const { data, error } = await supabase
    .from(TABLE_HISTORIQUE)
    .insert(payload)
    .select(SELECT_HISTORIQUE)
    .single()
  if (error) throw error
  return data
}

export async function finishShoppingTrip(userId, articles, options = {}) {
  await requireUserId(userId)
  const list = Array.isArray(articles) ? articles : []
  if (!list.length) return { historique: [], updated: [] }

  const dateAchat = trimOrNull(options.dateAchat) || todayISO()
  const updateDurabilite = options.updateDurabilite !== false

  const historiqueRows = list.map((article) => ({
    user_id: userId,
    article_id: article.id,
    nom: article.nom,
    magasin_id: article.magasin_id ?? null,
    date_achat: dateAchat,
    prix: article.prix ?? article.prix_estime ?? null,
  }))

  const { data: historique, error: histError } = await supabase
    .from(TABLE_HISTORIQUE)
    .insert(historiqueRows)
    .select(SELECT_HISTORIQUE)
  if (histError) throw histError

  const updated = []
  for (const article of list) {
    const patch = {
      statut: COURSES_STATUTS.ACHETE,
      updated_at: new Date().toISOString(),
    }
    if (updateDurabilite && article.suivi_durabilite) {
      patch.date_dernier_achat = dateAchat
    }
    const { data, error } = await supabase
      .from(TABLE_ARTICLES)
      .update(patch)
      .eq('user_id', userId)
      .eq('id', article.id)
      .select(SELECT_ARTICLE)
      .single()
    if (error) throw error
    updated.push(data)
  }

  return { historique: historique ?? [], updated }
}
