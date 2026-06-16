-- Migration : icône + couleur pour les projets
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS icone text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS couleur text NOT NULL DEFAULT '#ad81be';

COMMENT ON COLUMN public.projects.icone IS 'Emoji / icône optionnelle du projet';
COMMENT ON COLUMN public.projects.couleur IS 'Couleur d''accent du projet (hex)';

-- Réordonner par titre (ordre alphabétique par défaut)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY lower(trim(title)) ASC, created_at ASC
    ) AS rn
  FROM public.projects
)
UPDATE public.projects p
SET sort_order = ranked.rn
FROM ranked
WHERE p.id = ranked.id;
