export function normalizeReminderTime(time) {
  if (!time) return '09:00'
  const parts = String(time).split(':')
  const h = String(Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0))).padStart(2, '0')
  const m = String(Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0))).padStart(2, '0')
  return `${h}:${m}`
}

export async function listDailyReminders(supabase, userId) {
  const { data, error } = await supabase
    .from('daily_reminders')
    .select('id, reminder_time, title, body')
    .eq('user_id', userId)
    .order('reminder_time', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Enregistre la liste complète des rappels (ajouts, modifications, suppressions).
 * Une liste vide supprime tous les rappels de l'utilisateur.
 */
export async function saveDailyReminders(supabase, userId, reminders) {
  const normalized = reminders.map((r) => ({
    id: r.id,
    reminder_time: normalizeReminderTime(r.reminder_time),
    title: (r.title || 'BetterMe').trim(),
    body: (r.body || '').trim(),
  }))

  if (normalized.length > 0) {
    const times = normalized.map((r) => r.reminder_time)
    if (new Set(times).size !== times.length) {
      throw new Error('Deux rappels ne peuvent pas avoir la même heure.')
    }
  }

  const existing = await listDailyReminders(supabase, userId)
  const existingIds = new Set(existing.map((e) => e.id))
  const keptIds = new Set(normalized.filter((r) => r.id).map((r) => r.id))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await supabase.from('daily_reminders').delete().in('id', toDelete)
    if (error) throw error
  }

  for (const r of normalized) {
    if (r.id && existingIds.has(r.id)) {
      const { error } = await supabase
        .from('daily_reminders')
        .update({
          reminder_time: r.reminder_time,
          title: r.title,
          body: r.body,
        })
        .eq('id', r.id)
        .eq('user_id', userId)
      if (error) throw error
    } else {
      const { error } = await supabase.from('daily_reminders').insert({
        user_id: userId,
        reminder_time: r.reminder_time,
        title: r.title,
        body: r.body,
      })
      if (error) throw error
    }
  }

  return listDailyReminders(supabase, userId)
}
