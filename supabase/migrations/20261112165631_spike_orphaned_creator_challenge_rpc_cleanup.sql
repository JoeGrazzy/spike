-- Remove the obsolete legacy Creator Challenge RPC. Its legacy creator-challenge table was retired from the platform.
begin;
drop function if exists public.creator_challenge_complete(integer);
commit;
