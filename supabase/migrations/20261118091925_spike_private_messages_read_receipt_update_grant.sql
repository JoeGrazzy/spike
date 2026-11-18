-- Restore the narrowly scoped client UPDATE capability required for read receipts.
-- RLS restricts rows to conversation participants; the BEFORE UPDATE trigger
-- restricts updates to recipient read-state changes or sender soft-deletion.
GRANT UPDATE ON TABLE public.private_messages TO authenticated;
