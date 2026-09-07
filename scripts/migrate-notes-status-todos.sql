-- Statuts de notes + lien Notes ↔ TODO (semaine « À traiter »)
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS status_set_at timestamptz;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS todo_item_id uuid;

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS note_id uuid;

COMMENT ON COLUMN public.notes.status IS
  'Statut métier : null | a_traiter | fait (extension Statuts de notes).';

COMMENT ON COLUMN public.notes.status_set_at IS
  'Horodatage du passage à « a_traiter » (semaine TODO associée).';

COMMENT ON COLUMN public.notes.todo_item_id IS
  'TODO « Cette semaine » lié à la note (si statut À traiter).';

COMMENT ON COLUMN public.todo_items.note_id IS
  'Note source d’un TODO créé via le statut À traiter.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_todo_item_id_fkey'
  ) THEN
    ALTER TABLE public.notes
      ADD CONSTRAINT notes_todo_item_id_fkey
      FOREIGN KEY (todo_item_id)
      REFERENCES public.todo_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todo_items_note_id_fkey'
  ) THEN
    ALTER TABLE public.todo_items
      ADD CONSTRAINT todo_items_note_id_fkey
      FOREIGN KEY (note_id)
      REFERENCES public.notes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notes_status_idx
  ON public.notes (user_id, status)
  WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS notes_todo_item_id_idx
  ON public.notes (todo_item_id)
  WHERE todo_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS todo_items_note_id_idx
  ON public.todo_items (note_id)
  WHERE note_id IS NOT NULL;

COMMIT;
