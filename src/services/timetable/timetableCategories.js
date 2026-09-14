const DEFAULT_CATEGORIES = [
  { name: 'Travail', color: 'hsl(280, 65%, 72%)', icon: '💼' },
  { name: 'Hobbies', color: 'hsl(25, 75%, 72%)', icon: '🎨' },
]

/** Normalise une ligne timetable_categories */
export function normalizeCategory(row) {
  if (!row) return null
  return {
    id: row.id,
    user_id: row.user_id,
    name: String(row.name ?? row.nom ?? '').trim(),
    color: row.color || row.couleur || 'hsl(280, 65%, 72%)',
    icon: row.icon || row.icone || '📌',
    is_temp: Boolean(row.is_temp),
  }
}

function mergeWithDefaultCategories(rows) {
  const normalized = (rows ?? []).map(normalizeCategory).filter((c) => c?.name)
  const byName = new Map(normalized.map((c) => [c.name.toLowerCase(), c]))

  for (const def of DEFAULT_CATEGORIES) {
    const key = def.name.toLowerCase()
    if (!byName.has(key)) {
      byName.set(key, {
        id: `temp-${key}`,
        name: def.name,
        color: def.color,
        icon: def.icon,
        is_temp: true,
      })
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function findHobbiesCategory(categories) {
  return (categories ?? []).find((c) => c.name?.toLowerCase() === 'hobbies') ?? null
}

function eventMatchesHobbiesCategory(event, categories) {
  if (!event?.category) return false
  const catRef = event.category
  const hobbyCat = findHobbiesCategory(categories)
  if (!hobbyCat) return String(catRef).toLowerCase() === 'hobbies'

  if (hobbyCat.id && catRef === hobbyCat.id) return true
  if (catRef === hobbyCat.name) return true
  return String(catRef).toLowerCase() === 'hobbies'
}

function dedupeHobbyTitles(events) {
  const seen = new Set()
  const result = []
  for (const ev of events ?? []) {
    const title = String(ev?.title ?? '').trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ id: ev.id ?? `hobby-${key}`, title })
  }
  return result.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
}

/** Catégories utilisateur (table timetable_categories) + défauts Travail / Hobbies */
export async function loadUserCategories(supabase, userId) {
  const { data, error } = await supabase
    .from('timetable_categories')
    .select('id, user_id, name, color, icon')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) throw error
  return mergeWithDefaultCategories(data)
}

/**
 * Titres d'activités hobbies (table timetable_events, category = id Hobbies).
 * Charge tous les événements hobbies de l'utilisateur, pas seulement la semaine affichée.
 */
export async function loadHobbyEventTitles(supabase, userId, categories) {
  const hobbyCat = findHobbiesCategory(categories)
  const hobbyId = hobbyCat?.id
  const hasRealHobbyId = hobbyId && !String(hobbyId).startsWith('temp-')

  if (hasRealHobbyId) {
    const { data, error } = await supabase
      .from('timetable_events')
      .select('id, title, category')
      .eq('user_id', userId)
      .eq('category', hobbyId)
      .order('title', { ascending: true })

    if (error) throw error
    return dedupeHobbyTitles(data)
  }

  // Secours : parcourir les événements si la catégorie Hobbies n'est pas encore en base
  const { data, error } = await supabase
    .from('timetable_events')
    .select('id, title, category')
    .eq('user_id', userId)
    .order('title', { ascending: true })

  if (error) throw error
  return dedupeHobbyTitles((data ?? []).filter((ev) => eventMatchesHobbiesCategory(ev, categories)))
}

export async function loadTimetableMeta(supabase, userId) {
  const categories = await loadUserCategories(supabase, userId)
  const hobbyPicks = await loadHobbyEventTitles(supabase, userId, categories)
  return { categories, hobbyPicks }
}
