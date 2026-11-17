-- Permanently retire the SPIKE Tools Custom Feeds, Polls, and Creator Memberships/Store feature family.
-- Shared feed ranking/telemetry, Signal Series, Collaboration, Search, Resume, live-event polls,
-- creator engagement telemetry, messaging, notifications, and the shared updated-at trigger stay intact.
begin;
drop function if exists public.spike_cast_poll_vote(uuid, uuid[]);
drop function if exists public.spike_create_poll(text, text[]);
drop function if exists public.spike_get_poll(uuid);
drop table if exists public.spike_poll_votes;
drop table if exists public.spike_poll_options;
drop table if exists public.spike_polls;
drop table if exists public.spike_membership_members;
drop table if exists public.spike_creator_products;
drop table if exists public.spike_creator_memberships;
drop table if exists public.spike_custom_feeds;
-- public.spike_feature_touch_updated_at() is intentionally retained because Signal Series still uses it.
commit;
