-- Migration Courses : listes, marque, quantité facultative, prix (sans « estimé »)
-- À lancer si create-courses.sql a déjà été exécuté.

-- ---------------------------------------------------------------------------
-- Listes de courses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses_listes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  date_liste date NOT NULL DEFAULT (timezone('utc', now()))::date,
  statut text NOT NULL DEFAULT 'ouverte'
    CHECK (statut IN ('ouverte', 'fermee')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_listes_nom_not_blank CHECK (char_length(trim(nom)) > 0)
);

CREATE INDEX IF NOT EXISTS courses_listes_user_id_idx
  ON public.courses_listes (user_id);
CREATE INDEX IF NOT EXISTS courses_listes_user_statut_date_idx
  ON public.courses_listes (user_id, statut, date_liste DESC);

COMMENT ON TABLE public.courses_listes IS
  'Listes de courses datables (ouverte / fermée).';

ALTER TABLE public.courses_listes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_listes_select_own" ON public.courses_listes;
CREATE POLICY "courses_listes_select_own"
  ON public.courses_listes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_listes_insert_own" ON public.courses_listes;
CREATE POLICY "courses_listes_insert_own"
  ON public.courses_listes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_listes_update_own" ON public.courses_listes;
CREATE POLICY "courses_listes_update_own"
  ON public.courses_listes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_listes_delete_own" ON public.courses_listes;
CREATE POLICY "courses_listes_delete_own"
  ON public.courses_listes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses_listes TO authenticated;
GRANT ALL ON public.courses_listes TO service_role;

-- ---------------------------------------------------------------------------
-- Articles : marque, liste_id, quantité nullable, prix_estime → prix
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses_articles
  ADD COLUMN IF NOT EXISTS marque text;

ALTER TABLE public.courses_articles
  ADD COLUMN IF NOT EXISTS liste_id uuid
    REFERENCES public.courses_listes (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses_articles'
      AND column_name = 'prix_estime'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses_articles'
      AND column_name = 'prix'
  ) THEN
    ALTER TABLE public.courses_articles RENAME COLUMN prix_estime TO prix;
  END IF;
END $$;

ALTER TABLE public.courses_articles
  ADD COLUMN IF NOT EXISTS prix numeric(12, 2);

DO $$
BEGIN
  ALTER TABLE public.courses_articles
    ALTER COLUMN quantite DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN others THEN NULL;
END $$;

ALTER TABLE public.courses_articles
  ALTER COLUMN quantite DROP DEFAULT;

DO $$
BEGIN
  ALTER TABLE public.courses_articles DROP CONSTRAINT IF EXISTS courses_articles_quantite_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.courses_articles
  DROP CONSTRAINT IF EXISTS courses_articles_quantite_check;

ALTER TABLE public.courses_articles
  ADD CONSTRAINT courses_articles_quantite_check
  CHECK (quantite IS NULL OR quantite > 0);

ALTER TABLE public.courses_articles
  DROP CONSTRAINT IF EXISTS courses_articles_prix_check;

ALTER TABLE public.courses_articles
  ADD CONSTRAINT courses_articles_prix_check
  CHECK (prix IS NULL OR prix >= 0);

ALTER TABLE public.courses_articles
  DROP CONSTRAINT IF EXISTS courses_articles_marque_not_blank;

ALTER TABLE public.courses_articles
  ADD CONSTRAINT courses_articles_marque_not_blank
  CHECK (marque IS NULL OR char_length(trim(marque)) > 0);

CREATE INDEX IF NOT EXISTS courses_articles_user_liste_idx
  ON public.courses_articles (user_id, liste_id);

COMMENT ON COLUMN public.courses_articles.marque IS 'Marque facultative.';
COMMENT ON COLUMN public.courses_articles.liste_id IS
  'Liste de courses associée (NULL = hors liste / catalogue).';
COMMENT ON COLUMN public.courses_articles.quantite IS 'Facultatif.';
COMMENT ON COLUMN public.courses_articles.prix IS 'Prix facultatif (plus d’« estimé »).';
