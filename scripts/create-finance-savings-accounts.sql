-- Comptes / livrets d’épargne — BetterMe
-- Exécute après create-finance-settings.sql

CREATE TABLE IF NOT EXISTS public.finance_savings_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT finance_savings_accounts_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_savings_accounts_user_name_uidx
  ON public.finance_savings_accounts (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS finance_savings_accounts_user_sort_idx
  ON public.finance_savings_accounts (user_id, sort_order, name);

COMMENT ON TABLE public.finance_savings_accounts IS 'Livrets / comptes d’épargne (Livret A, PEL, CEL…).';
COMMENT ON COLUMN public.finance_savings_accounts.opening_balance IS 'Solde de départ du livret en EUR.';

ALTER TABLE public.finance_savings_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_savings_accounts_select_own" ON public.finance_savings_accounts;
CREATE POLICY "finance_savings_accounts_select_own"
  ON public.finance_savings_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_savings_accounts_insert_own" ON public.finance_savings_accounts;
CREATE POLICY "finance_savings_accounts_insert_own"
  ON public.finance_savings_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_savings_accounts_update_own" ON public.finance_savings_accounts;
CREATE POLICY "finance_savings_accounts_update_own"
  ON public.finance_savings_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_savings_accounts_delete_own" ON public.finance_savings_accounts;
CREATE POLICY "finance_savings_accounts_delete_own"
  ON public.finance_savings_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_savings_accounts TO authenticated;
GRANT ALL ON public.finance_savings_accounts TO service_role;
