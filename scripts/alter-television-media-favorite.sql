-- Favoris Télévision — BetterMe
-- Exécute dans le SQL Editor Supabase (table television_media déjà créée)

ALTER TABLE public.television_media
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS television_media_user_favorite_idx
  ON public.television_media (user_id, is_favorite)
  WHERE is_favorite = true;

COMMENT ON COLUMN public.television_media.is_favorite IS 'Titre marqué en favoris par l''utilisateur';
