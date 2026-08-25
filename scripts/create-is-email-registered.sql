-- Vérifie si un email est déjà enregistré (auth.users)
-- Utilisé à la connexion pour distinguer « compte inexistant » vs « mauvais mot de passe ».
-- ⚠️ Permet de tester si un email existe (énumération) — choix UX volontaire.
-- Exécute dans le SQL Editor Supabase.

CREATE OR REPLACE FUNCTION public.is_email_registered(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email IS NOT NULL
      AND lower(trim(email)) = lower(trim(check_email))
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_email_registered(text) IS
  'Retourne true si un compte auth.users existe pour cet email (connexion BetterMe).';
