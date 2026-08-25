-- Supprime la colonne conditions des messages de réconfort (BetterMe)
-- Exécute dans le SQL Editor Supabase.
--
-- Les messages ne sont plus liés à des symptômes ou au check-in :
-- un message aléatoire est planifié après saisie du check-in Dashboard
-- ou des symptômes menstruation (1 notification/jour, rotation 7 jours).

ALTER TABLE public.reconfort
  DROP COLUMN IF EXISTS conditions;
