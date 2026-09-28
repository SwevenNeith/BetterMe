-- Migration : type « savings » + lien vers un livret (historique)
-- Si tu démarres maintenant, préfère create-finance-transactions.sql (déjà unifié)
-- puis éventuellement migrate-finance-unify-accounts.sql si tu avais l’ancien schéma.
--
-- Exécute après create-finance-transactions.sql et create-finance-savings-accounts.sql
-- Puis exécute migrate-finance-unify-accounts.sql pour retirer le type savings.

ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_tx_type_check;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_tx_type_check
  CHECK (tx_type IN ('income', 'fixed_expense', 'variable_expense', 'savings'));

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS savings_account_id uuid
  REFERENCES public.finance_savings_accounts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_savings_account_idx
  ON public.finance_transactions (user_id, savings_account_id)
  WHERE savings_account_id IS NOT NULL;

COMMENT ON COLUMN public.finance_transactions.tx_type IS
  'income | fixed_expense | variable_expense | savings';
COMMENT ON COLUMN public.finance_transactions.savings_account_id IS
  'Livret cible si tx_type = savings (virement CC → livret).';
