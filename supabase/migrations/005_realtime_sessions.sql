-- Deliver postgres_changes on sessions when status / question index updates.
-- Idempotent: safe if the table is already in the publication.

DO $$
BEGIN
  alter publication supabase_realtime
  add table public.sessions;
EXCEPTION
  WHEN duplicate_object THEN
    null;
END $$;
