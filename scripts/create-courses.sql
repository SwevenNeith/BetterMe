-- Courses (BetterMe — page Courses / vitrine)
-- Tables en français, RLS par utilisateur, ON DELETE SET NULL pour magasins/catégories.

-- ---------------------------------------------------------------------------
-- Magasins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses_magasins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  type text NOT NULL DEFAULT 'physique'
    CHECK (type IN ('physique', 'en_ligne', 'autre')),
  couleur text NOT NULL DEFAULT '#AD81BE',
  url text,
  ordre integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_magasins_nom_not_blank CHECK (char_length(trim(nom)) > 0),
  CONSTRAINT courses_magasins_url_not_blank CHECK (
    url IS NULL OR char_length(trim(url)) > 0
  )
);

CREATE INDEX IF NOT EXISTS courses_magasins_user_id_idx
  ON public.courses_magasins (user_id);
CREATE INDEX IF NOT EXISTS courses_magasins_user_ordre_idx
  ON public.courses_magasins (user_id, ordre, nom);

COMMENT ON TABLE public.courses_magasins IS 'Magasins de courses (physique, en ligne, autre).';
COMMENT ON COLUMN public.courses_magasins.couleur IS 'Couleur d’enseigne (pastille / bandeau), hex.';

ALTER TABLE public.courses_magasins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_magasins_select_own" ON public.courses_magasins;
CREATE POLICY "courses_magasins_select_own"
  ON public.courses_magasins FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_magasins_insert_own" ON public.courses_magasins;
CREATE POLICY "courses_magasins_insert_own"
  ON public.courses_magasins FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_magasins_update_own" ON public.courses_magasins;
CREATE POLICY "courses_magasins_update_own"
  ON public.courses_magasins FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_magasins_delete_own" ON public.courses_magasins;
CREATE POLICY "courses_magasins_delete_own"
  ON public.courses_magasins FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses_magasins TO authenticated;
GRANT ALL ON public.courses_magasins TO service_role;

-- ---------------------------------------------------------------------------
-- Catégories (rayons)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  icone text NOT NULL DEFAULT '🛒',
  couleur text NOT NULL DEFAULT '#8FA2D4',
  ordre integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_categories_nom_not_blank CHECK (char_length(trim(nom)) > 0)
);

CREATE INDEX IF NOT EXISTS courses_categories_user_id_idx
  ON public.courses_categories (user_id);
CREATE INDEX IF NOT EXISTS courses_categories_user_ordre_idx
  ON public.courses_categories (user_id, ordre, nom);

COMMENT ON TABLE public.courses_categories IS 'Rayons / catégories de courses (icône emoji + couleur).';
COMMENT ON COLUMN public.courses_categories.couleur IS 'Couleur d’accent du rayon (bandeau), hex.';

ALTER TABLE public.courses_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_categories_select_own" ON public.courses_categories;
CREATE POLICY "courses_categories_select_own"
  ON public.courses_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_categories_insert_own" ON public.courses_categories;
CREATE POLICY "courses_categories_insert_own"
  ON public.courses_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_categories_update_own" ON public.courses_categories;
CREATE POLICY "courses_categories_update_own"
  ON public.courses_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_categories_delete_own" ON public.courses_categories;
CREATE POLICY "courses_categories_delete_own"
  ON public.courses_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses_categories TO authenticated;
GRANT ALL ON public.courses_categories TO service_role;

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
-- Articles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  marque text,
  quantite numeric(12, 3)
    CHECK (quantite IS NULL OR quantite > 0),
  unite text,
  categorie_id uuid REFERENCES public.courses_categories (id) ON DELETE SET NULL,
  magasin_id uuid REFERENCES public.courses_magasins (id) ON DELETE SET NULL,
  liste_id uuid REFERENCES public.courses_listes (id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'a_acheter'
    CHECK (statut IN ('a_acheter', 'dans_panier', 'achete', 'reporte')),
  priorite integer
    CHECK (priorite IS NULL OR (priorite >= 1 AND priorite <= 3)),
  prix numeric(12, 2)
    CHECK (prix IS NULL OR prix >= 0),
  note text,
  lien text,
  lien_image text,
  icone text NOT NULL DEFAULT '🛒',
  suivi_durabilite boolean NOT NULL DEFAULT false,
  date_dernier_achat date,
  duree_valeur integer
    CHECK (duree_valeur IS NULL OR duree_valeur > 0),
  duree_unite text
    CHECK (duree_unite IS NULL OR duree_unite IN ('jours', 'semaines', 'mois', 'ans')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_articles_nom_not_blank CHECK (char_length(trim(nom)) > 0),
  CONSTRAINT courses_articles_marque_not_blank CHECK (
    marque IS NULL OR char_length(trim(marque)) > 0
  ),
  CONSTRAINT courses_articles_unite_not_blank CHECK (
    unite IS NULL OR char_length(trim(unite)) > 0
  ),
  CONSTRAINT courses_articles_lien_not_blank CHECK (
    lien IS NULL OR char_length(trim(lien)) > 0
  ),
  CONSTRAINT courses_articles_lien_image_not_blank CHECK (
    lien_image IS NULL OR char_length(trim(lien_image)) > 0
  )
);

CREATE INDEX IF NOT EXISTS courses_articles_user_id_idx
  ON public.courses_articles (user_id);
CREATE INDEX IF NOT EXISTS courses_articles_user_statut_idx
  ON public.courses_articles (user_id, statut);
CREATE INDEX IF NOT EXISTS courses_articles_user_magasin_idx
  ON public.courses_articles (user_id, magasin_id);
CREATE INDEX IF NOT EXISTS courses_articles_user_categorie_idx
  ON public.courses_articles (user_id, categorie_id);
CREATE INDEX IF NOT EXISTS courses_articles_user_liste_idx
  ON public.courses_articles (user_id, liste_id);
CREATE INDEX IF NOT EXISTS courses_articles_user_suivi_idx
  ON public.courses_articles (user_id, suivi_durabilite)
  WHERE suivi_durabilite = true;

COMMENT ON TABLE public.courses_articles IS 'Articles de courses (emoji, pas de photo).';
COMMENT ON COLUMN public.courses_articles.marque IS 'Marque facultative.';
COMMENT ON COLUMN public.courses_articles.quantite IS 'Facultatif.';
COMMENT ON COLUMN public.courses_articles.prix IS 'Prix facultatif.';
COMMENT ON COLUMN public.courses_articles.lien_image IS
  'URL d’image facultative ; si renseignée, remplace l’emoji sur la carte. Pas d’upload.';
COMMENT ON COLUMN public.courses_articles.suivi_durabilite IS
  'Facultatif, désactivé par défaut. Suivi de durée de vie (pas d’échéance d’achat).';
COMMENT ON COLUMN public.courses_articles.magasin_id IS
  'NULL = n’importe où. Suppression magasin → SET NULL.';
COMMENT ON COLUMN public.courses_articles.categorie_id IS
  'NULL = sans rayon. Suppression catégorie → SET NULL.';
COMMENT ON COLUMN public.courses_articles.liste_id IS
  'Liste de courses associée (NULL = hors liste).';

ALTER TABLE public.courses_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_articles_select_own" ON public.courses_articles;
CREATE POLICY "courses_articles_select_own"
  ON public.courses_articles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_articles_insert_own" ON public.courses_articles;
CREATE POLICY "courses_articles_insert_own"
  ON public.courses_articles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_articles_update_own" ON public.courses_articles;
CREATE POLICY "courses_articles_update_own"
  ON public.courses_articles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_articles_delete_own" ON public.courses_articles;
CREATE POLICY "courses_articles_delete_own"
  ON public.courses_articles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses_articles TO authenticated;
GRANT ALL ON public.courses_articles TO service_role;

-- ---------------------------------------------------------------------------
-- Historique d’achats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.courses_articles (id) ON DELETE SET NULL,
  nom text NOT NULL,
  magasin_id uuid REFERENCES public.courses_magasins (id) ON DELETE SET NULL,
  date_achat date NOT NULL DEFAULT (timezone('utc', now()))::date,
  prix numeric(12, 2)
    CHECK (prix IS NULL OR prix >= 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_historique_nom_not_blank CHECK (char_length(trim(nom)) > 0)
);

CREATE INDEX IF NOT EXISTS courses_historique_user_id_idx
  ON public.courses_historique (user_id);
CREATE INDEX IF NOT EXISTS courses_historique_user_date_idx
  ON public.courses_historique (user_id, date_achat DESC);
CREATE INDEX IF NOT EXISTS courses_historique_user_article_idx
  ON public.courses_historique (user_id, article_id);

COMMENT ON TABLE public.courses_historique IS
  'Achats enregistrés (copie du nom au moment de l’achat).';

ALTER TABLE public.courses_historique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_historique_select_own" ON public.courses_historique;
CREATE POLICY "courses_historique_select_own"
  ON public.courses_historique FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_historique_insert_own" ON public.courses_historique;
CREATE POLICY "courses_historique_insert_own"
  ON public.courses_historique FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_historique_update_own" ON public.courses_historique;
CREATE POLICY "courses_historique_update_own"
  ON public.courses_historique FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "courses_historique_delete_own" ON public.courses_historique;
CREATE POLICY "courses_historique_delete_own"
  ON public.courses_historique FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses_historique TO authenticated;
GRANT ALL ON public.courses_historique TO service_role;
