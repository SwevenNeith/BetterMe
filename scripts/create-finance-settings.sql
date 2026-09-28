-- Paramètres finances (solde compte courant) — BetterMe
-- Exécute dans le SQL Editor Supabase (avant les autres scripts finance_*).

CREATE TABLE IF NOT EXISTS public.finance_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  balance_initialized boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.finance_settings IS 'Solde initial du compte courant par utilisateur.';
COMMENT ON COLUMN public.finance_settings.opening_balance IS 'Solde de départ en EUR.';
COMMENT ON COLUMN public.finance_settings.balance_initialized IS 'true une fois le solde saisi par l’utilisateur.';

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_settings_select_own" ON public.finance_settings;
CREATE POLICY "finance_settings_select_own"
  ON public.finance_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_settings_insert_own" ON public.finance_settings;
CREATE POLICY "finance_settings_insert_own"
  ON public.finance_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_settings_update_own" ON public.finance_settings;
CREATE POLICY "finance_settings_update_own"
  ON public.finance_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_settings_delete_own" ON public.finance_settings;
CREATE POLICY "finance_settings_delete_own"
  ON public.finance_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_settings TO authenticated;
GRANT ALL ON public.finance_settings TO service_role;
