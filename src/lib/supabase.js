import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://idnfbtgevosjcevnrnvu.supabase.co' // URL de base du projet (sans /rest/v1/)
export const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkbmZidGdldm9zamNldm5ybnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDI2NTQsImV4cCI6MjA5NDUxODY1NH0.BZNnnXFw-6tHEejeeM412z4vSmFpOrm8sZcvh2KwsZg' // ta clé publique

/**
 * Ne PAS envelopper le fetch global (timeouts/abort) : au retour d'arrière-plan
 * mobile, un fetch auth gelé/aborté bloque le verrou GoTrue et fige toute l'app.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'sb-idnfbtgevosjcevnrnvu-auth-token',
  },
})
