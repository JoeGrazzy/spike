-- gift_history has no browser-facing policies or frontend consumers.
-- Keep the ledger private to trusted server-side code and remove unnecessary
-- browser-role privileges, including TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON TABLE public.gift_history FROM PUBLIC, anon, authenticated;
