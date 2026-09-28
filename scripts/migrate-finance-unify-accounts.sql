-- Migration : comptes unifiés (plus de type « savings »)
-- Exécute après create-finance-savings-accounts.sql / migrate-finance-savings.sql

-- 1) Colonne account_id : NULL = Compte courant, sinon compte d’épargne
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.finance_savings_accounts (id) ON DELETE SET NULL;

-- 2) Migrer les anciens virements épargne → revenus sur le compte cible
UPDATE public.finance_transactions
SET
  account_id = savings_account_id,
  tx_type = 'income',
  category = CASE
    WHEN char_length(trim(category)) > 0 THEN category
    ELSE 'Épargne'
  END
WHERE tx_type = 'savings';

-- 3) Retirer le type savings
ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_tx_type_check;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_tx_type_check
  CHECK (tx_type IN ('income', 'fixed_expense', 'variable_expense'));

-- 4) Nettoyer l’ancienne colonne
ALTER TABLE public.finance_transactions
  DROP COLUMN IF EXISTS savings_account_id;

CREATE INDEX IF NOT EXISTS finance_transactions_account_idx
  ON public.finance_transactions (user_id, account_id, occurred_on DESC);

COMMENT ON COLUMN public.finance_transactions.tx_type IS
  'income | fixed_expense | variable_expense';
COMMENT ON COLUMN public.finance_transactions.account_id IS
  'NULL = compte courant, sinon id du compte d’épargne.';
COMMENT ON COLUMN public.finance_transactions.applied IS
  'true = réalisé (impacte le solde), false = prévisionnel.';
