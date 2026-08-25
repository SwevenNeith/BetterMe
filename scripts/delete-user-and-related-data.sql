-- ============================================================
-- Supprimer un utilisateur BetterMe et toutes ses données
-- Exécute dans le SQL Editor Supabase (rôle service_role / postgres).
--
-- 1. Remplace l’UUID ci-dessous
-- 2. Exécute le script en une seule fois
-- ============================================================

DO $$
DECLARE
  -- >>> UUID de l’utilisateur à supprimer <<<
  target_user uuid := '00000000-0000-0000-0000-000000000000';

  r record;
  remaining int;
  pass int := 0;
  max_passes int := 20;
  deleted_count bigint;
  total_deleted bigint := 0;
BEGIN
  IF target_user = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Remplace target_user par le vrai user_id avant d’exécuter.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user) THEN
    RAISE EXCEPTION 'Aucun utilisateur auth.users avec id = %', target_user;
  END IF;

  RAISE NOTICE 'Suppression de l’utilisateur % …', target_user;

  -- ------------------------------------------------------------------
  -- 1) Casser les liens circulaires TODO ↔ Emploi du temps
  -- ------------------------------------------------------------------
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    UPDATE public.todo_items
    SET timetable_event_id = NULL
    WHERE user_id = target_user
      AND timetable_event_id IS NOT NULL;
  END IF;

  IF to_regclass('public.timetable_events') IS NOT NULL THEN
    UPDATE public.timetable_events
    SET todo_item_id = NULL
    WHERE user_id = target_user
      AND todo_item_id IS NOT NULL;
  END IF;

  -- ------------------------------------------------------------------
  -- 2) Supprimer les lignes public.* qui ont une colonne user_id
  --    (plusieurs passes pour respecter les FK enfants → parents)
  -- ------------------------------------------------------------------
  LOOP
    pass := pass + 1;
    deleted_count := 0;

    FOR r IN
      SELECT c.relname AS table_name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND a.attname = 'user_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND c.relkind = 'r'
      ORDER BY c.relname
    LOOP
      BEGIN
        EXECUTE format(
          'WITH deleted AS (
             DELETE FROM public.%I WHERE user_id = $1 RETURNING 1
           )
           SELECT count(*) FROM deleted',
          r.table_name
        )
        INTO remaining
        USING target_user;

        IF remaining > 0 THEN
          deleted_count := deleted_count + remaining;
          total_deleted := total_deleted + remaining;
          RAISE NOTICE '  % : % ligne(s)', r.table_name, remaining;
        END IF;
      EXCEPTION
        WHEN foreign_key_violation THEN
          -- Enfant encore présent : on réessaie à la passe suivante
          NULL;
        WHEN undefined_table THEN
          NULL;
        WHEN undefined_column THEN
          NULL;
      END;
    END LOOP;

    EXIT WHEN deleted_count = 0 OR pass >= max_passes;
  END LOOP;

  -- Vérifie qu’il ne reste plus de lignes user_id
  remaining := 0;
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND a.attname = 'user_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE user_id = $1',
      r.table_name
    )
    INTO deleted_count
    USING target_user;

    IF deleted_count > 0 THEN
      remaining := remaining + deleted_count;
      RAISE WARNING 'Il reste % ligne(s) dans public.%', deleted_count, r.table_name;
    END IF;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'Impossible de tout supprimer (% ligne(s) restantes, probablement FK). Vérifie les contraintes.',
      remaining;
  END IF;

  RAISE NOTICE 'Lignes public.* supprimées : %', total_deleted;

  -- ------------------------------------------------------------------
  -- 3) Fichiers Storage (couvertures lecture + images de réconfort)
  -- ------------------------------------------------------------------
  DELETE FROM storage.objects
  WHERE bucket_id IN ('comfort-images', 'reading-covers')
    AND (
      owner = target_user
      OR name LIKE target_user::text || '/%'
      OR (metadata ->> 'owner') = target_user::text
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Objets storage supprimés : %', deleted_count;

  -- ------------------------------------------------------------------
  -- 4) Compte Auth (sessions, identities, etc. via CASCADE)
  -- ------------------------------------------------------------------
  DELETE FROM auth.users WHERE id = target_user;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'Échec : auth.users non supprimé pour %', target_user;
  END IF;

  RAISE NOTICE 'Utilisateur % entièrement supprimé.', target_user;
END $$;
