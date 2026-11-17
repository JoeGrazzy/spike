-- Browser roles never need table maintenance or DDL-adjacent privileges.
-- Keep normal DML grants in place; row-level security remains the row boundary.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Prevent the same excess privileges from being reintroduced by migrations
-- executed as postgres. Supabase-managed supabase_admin defaults are separate
-- and require that role's own session to change.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon, authenticated;
