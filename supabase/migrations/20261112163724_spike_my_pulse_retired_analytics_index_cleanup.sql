begin;
drop index if exists public.post_engagement_events_owner_action_created_idx;
drop index if exists public.post_engagement_events_owner_created_idx;
drop index if exists public.post_engagement_owner_created_idx;
drop index if exists public.post_engagement_actor_idx;
commit;
