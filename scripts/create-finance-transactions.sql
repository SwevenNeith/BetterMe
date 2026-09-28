-- Transactions / montants finances — BetterMe
-- Exécute après create-finance-categories.sql et create-finance-savings-accounts.sql

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  occurred_on date NOT NULL DEFAULT (timezone('utc', now()))::date,
  tx_type text NOT NULL
    CHECK (tx_type IN ('income', 'fixed_expense', 'variable_expense')),
  category text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  amount numeric(14, 2) NOT NULL
    CHECK (amount > 0),
  applied boolean NOT NULL DEFAULT false,
  account_id uuid REFERENCES public.finance_savings_accounts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT finance_transactions_category_not_blank CHECK (char_length(trim(category)) > 0)
);

CREATE INDEX IF NOT EXISTS finance_transactions_user_date_idx
  ON public.finance_transactions (user_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS finance_transactions_user_type_idx
  ON public.finance_transactions (user_id, tx_type);

CREATE INDEX IF NOT EXISTS finance_transactions_user_applied_idx
  ON public.finance_transactions (user_id, applied, occurred_on);

CREATE INDEX IF NOT EXISTS finance_transactions_account_idx
  ON public.finance_transactions (user_id, account_id, occurred_on DESC);

COMMENT ON TABLE public.finance_transactions IS 'Montants (revenus / dépenses) par compte.';
COMMENT ON COLUMN public.finance_transactions.tx_type IS
  'income | fixed_expense | variable_expense';
COMMENT ON COLUMN public.finance_transactions.applied IS
  'true = réalisé (impacte le solde), false = prévisionnel.';
COMMENT ON COLUMN public.finance_transactions.detail IS 'Info spécifique (ex. Carrefour, Leclerc).';
COMMENT ON COLUMN public.finance_transactions.account_id IS
  'NULL = compte courant, sinon id du compte d’épargne.';

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_transactions_select_own" ON public.finance_transactions;
CREATE POLICY "finance_transactions_select_own"
  ON public.finance_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_transactions_insert_own" ON public.finance_transactions;
CREATE POLICY "finance_transactions_insert_own"
  ON public.finance_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_transactions_update_own" ON public.finance_transactions;
CREATE POLICY "finance_transactions_update_own"
  ON public.finance_transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_transactions_delete_own" ON public.finance_transactions;
CREATE POLICY "finance_transactions_delete_own"
  ON public.finance_transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated;
GRANT ALL ON public.finance_transactions TO service_role;
