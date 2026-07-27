-- Lien bidirectionnel TODO ↔ Emploi du temps

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS timetable_event_id uuid;

ALTER TABLE public.timetable_events
  ADD COLUMN IF NOT EXISTS todo_item_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todo_items_timetable_event_id_fkey'
  ) THEN
    ALTER TABLE public.todo_items
      ADD CONSTRAINT todo_items_timetable_event_id_fkey
      FOREIGN KEY (timetable_event_id)
      REFERENCES public.timetable_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_events_todo_item_id_fkey'
  ) THEN
    ALTER TABLE public.timetable_events
      ADD CONSTRAINT timetable_events_todo_item_id_fkey
      FOREIGN KEY (todo_item_id)
      REFERENCES public.todo_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS todo_items_timetable_event_id_idx
  ON public.todo_items (timetable_event_id)
  WHERE timetable_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS timetable_events_todo_item_id_idx
  ON public.timetable_events (todo_item_id)
  WHERE todo_item_id IS NOT NULL;
