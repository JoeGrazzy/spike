-- SPIKE call-channel verification: read-only diagnostics
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'realtime'
  AND tablename = 'messages'
  AND (policyname ILIKE '%call%' OR policyname ILIKE '%recipient%')
ORDER BY policyname;

-- Confirm deployed migration history includes the repair.
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE name ILIKE '%call%recipient%authorization%repair%'
   OR version = '20261011200000'
ORDER BY version DESC;
