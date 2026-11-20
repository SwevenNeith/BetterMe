/**
 * Accès données Courses — seul module qui parle à Supabase pour cette page.
 * Remplacer ce fichier lors de la migration NAS.
 */

import { supabase } from '../../lib/supabase.js'
import {
  COURSES_DEFAULT_ICONE,
  COURSES_DEFAULT_MAGASIN_COULEUR,
  COURSES_STATUTS,
} from '../../constants/courses/courses.js'

const TABLE_MAGASINS = 'courses_magasins'
const TABLE_CATEGORIES = 'courses_categories'
const TABLE_ARTICLES = 'courses_articles'
const TABLE_HISTORIQUE = 'courses_historique'

const SELECT_MAGASIN = 'id, user_id, nom, type, couleur, url, ordre, created_at'
const SELECT_CATEGORIE = 'id, user_id, nom, icone, ordre, created_at'
const SELECT_ARTICLE =
  'id, user_id, nom, quantite, unite, categorie_id, magasin_id, statut, priorite, prix_estime, note, lien, icone, suivi_durabilite, date_dernier_achat, duree_valeur, duree_unite, created_at, updated_at'
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
    ordre: Number.isFinite(Number(input.ordre)) ? Number(input.ordre) : 100,
  }
}

function normalizeArticlePayload(input = {}, { partial = false } = {}) {
  const out = {}

  if (!partial || input.nom !== undefined) {
    const nom = String(input.nom ?? '').trim()
    if (!nom) throw new Error('Indique un nom d’article.')
    out.nom = nom
  }
  if (!partial || input.quantite !== undefined) {
    const q = Number(input.quantite)
    out.quantite = Number.isFinite(q) && q > 0 ? q : 1
  }
  if (!partial || input.unite !== undefined) out.unite = trimOrNull(input.unite)
  if (!partial || input.categorie_id !== undefined) {
    out.categorie_id = trimOrNull(input.categorie_id)
  }
  if (!partial || input.magasin_id !== undefined) {
    out.magasin_id = trimOrNull(input.magasin_id)
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
  if (!partial || input.prix_estime !== undefined) {
    if (input.prix_estime == null || input.prix_estime === '') {
      out.prix_estime = null
    } else {
      const prix = Number(input.prix_estime)
      out.prix_estime = Number.isFinite(prix) && prix >= 0 ? prix : null
    }
  }
  if (!partial || input.note !== undefined) out.note = trimOrNull(input.note)
  if (!partial || input.lien !== undefined) out.lien = trimOrNull(input.lien)
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
    .order('ordre', { ascending: true })
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
    .order('ordre', { ascending: true })
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

/**
 * Charge magasins, catégories, articles et un extrait d’historique (autocomplete).
 */
export async function loadCoursesBundle(userId) {
  if (!userId) {
    return { magasins: [], categories: [], articles: [], historique: [] }
  }
  const [magasins, categories, articles, historique] = await Promise.all([
    listMagasins(userId),
    listCategories(userId),
    listArticles(userId),
    listHistorique(userId, { limit: 200 }),
  ])
  return { magasins, categories, articles, historique }
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

/**
 * Termine une session courses : historique + statut achete + date dernier achat
 * pour les articles avec suivi de durabilité (si updateDurabilite).
 * @param {string} userId
 * @param {object[]} articles
 * @param {{ updateDurabilite?: boolean, dateAchat?: string }} [options]
 */
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
    prix: article.prix_estime ?? null,
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
