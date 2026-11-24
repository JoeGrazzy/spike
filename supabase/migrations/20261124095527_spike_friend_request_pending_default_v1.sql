-- New direct inserts into follows must default to the QR-first friend-request state.
-- Legacy 'requested' remains accepted temporarily for backwards compatibility.
alter table public.follows alter column status set default 'pending';
