-- Preserve the unique constraint and its backing index; remove only the
-- redundant standalone unique index with the same key columns.
DROP INDEX IF EXISTS public.spike_room_reports_room_reporter_uq;
