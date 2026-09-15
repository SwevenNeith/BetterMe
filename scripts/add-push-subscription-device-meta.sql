-- Métadonnées appareils pour l’onglet Réglages → Appareils.
-- À exécuter une fois dans le SQL Editor Supabase.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_agent text;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_name text;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb;

COMMENT ON COLUMN public.push_subscriptions.user_agent IS
  'User-Agent du navigateur au moment de l’enregistrement push';
COMMENT ON COLUMN public.push_subscriptions.updated_at IS
  'Dernière synchronisation de l’abonnement push';
COMMENT ON COLUMN public.push_subscriptions.device_name IS
  'Nom personnalisé donné par l’utilisateur à cet appareil';
COMMENT ON COLUMN public.push_subscriptions.notification_prefs IS
  'Préférences de catégories de notifications par appareil (JSON). null = tout activé.';

-- Limite raisonnable côté base (l’app tronque aussi à 80 caractères).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_subscriptions_device_name_len'
      AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_device_name_len
      CHECK (device_name IS NULL OR char_length(device_name) <= 80);
  END IF;
END $$;

-- RLS : l’utilisateur ne voit / ne modifie que ses propres lignes (si pas déjà en place).
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_select_own'
  ) THEN
    CREATE POLICY push_subscriptions_select_own
      ON public.push_subscriptions
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_insert_own'
  ) THEN
    CREATE POLICY push_subscriptions_insert_own
      ON public.push_subscriptions
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_update_own'
  ) THEN
    CREATE POLICY push_subscriptions_update_own
      ON public.push_subscriptions
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_delete_own'
  ) THEN
    CREATE POLICY push_subscriptions_delete_own
      ON public.push_subscriptions
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
