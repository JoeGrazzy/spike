-- SPIKE per-post audience enforcement and sensitive-content normalization.
-- Public is the backwards-compatible default; Friends is checked against
-- accepted SPIKE friendships and the author's existing profile privacy.

create or replace function public.can_view_feed_post(p_owner_id uuid, p_post_data jsonb)
returns boolean
language sql
stable
set search_path = 'pg_catalog', 'public'
as $function$
  select coalesce(
    (select auth.uid()) is not null
    and p_owner_id is not null
    and public.can_view_spike_posts((select auth.uid()), p_owner_id)
    and public.can_view_spike_content(
      (select auth.uid()),
      p_owner_id,
      case
        when lower(coalesce(p_post_data->>'visibility', 'public')) = 'friends' then 'friends'
        when lower(coalesce(p_post_data->>'visibility', 'public')) = 'private' then 'private'
        else 'public'
      end
    ),
    false
  );
$function$;

-- Normalize audience fields on every post write; legacy posts default to Public.
create or replace function public.spike_normalize_post_audience()
returns trigger
language plpgsql
set search_path = 'pg_catalog'
as $function$
declare
  v_visibility text;
begin
  if new.collection_name = 'posts' then
    v_visibility := lower(coalesce(nullif(btrim(new.data->>'visibility'), ''), 'public'));
    if v_visibility not in ('public', 'friends') then
      raise exception 'Post audience must be public or friends' using errcode = '22023';
    end if;
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{visibility}', to_jsonb(v_visibility), true);
    new.data := jsonb_set(new.data, '{sensitive}', to_jsonb(coalesce(new.data->'sensitive' = 'true'::jsonb, false)), true);
  end if;
  return new;
end;
$function$;

drop trigger if exists spike_normalize_post_audience on public.app_documents;
create trigger spike_normalize_post_audience
before insert or update on public.app_documents
for each row execute function public.spike_normalize_post_audience();

-- This view previously ran with its owner's privileges and could bypass the
-- app_documents RLS policy. SECURITY INVOKER makes the existing policy apply.
alter view public.spike_recommendation_eligible_posts set (security_invoker = true);

-- Update existing SECURITY DEFINER profile-post RPCs to honor each post's
-- audience as well as the owner's broader profile-level posts visibility.
do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
  v_sig regprocedure;
begin
  v_sig := 'public.get_public_profile_posts(uuid,integer)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_old := $old$and (a.own or a.posts_visibility='public'
         or (a.posts_visibility='friends' and public.is_spike_friend((select auth.uid()),p_owner)) )$old$;
  -- Accept the source's exact current formatting (without an extra space before the close).
  if position(v_old in v_def) = 0 then
    v_old := $old$and (a.own or a.posts_visibility='public'
         or (a.posts_visibility='friends' and public.is_spike_friend((select auth.uid()),p_owner)))$old$;
  end if;
  if position(v_old in v_def) = 0 then raise exception 'Could not safely patch get_public_profile_posts audience predicate'; end if;
  v_new := v_old || E'\n    and (a.own or lower(coalesce(d.data->>''visibility'',''public'')) = ''public''\n         or (lower(coalesce(d.data->>''visibility'',''public'')) = ''friends'' and public.is_spike_friend((select auth.uid()),p_owner)))';
  execute replace(v_def, v_old, v_new);

  v_sig := 'public.get_public_profile_posts_v2(uuid,integer,integer)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_old := $old$and (a.own or a.posts_visibility='public'
      or (a.posts_visibility='friends' and public.is_spike_friend((select auth.uid()),p_owner)))$old$;
  if position(v_old in v_def) = 0 then raise exception 'Could not safely patch get_public_profile_posts_v2 audience predicate'; end if;
  v_new := v_old || E'\n    and (a.own or lower(coalesce(d.data->>''visibility'',''public'')) = ''public''\n      or (lower(coalesce(d.data->>''visibility'',''public'')) = ''friends'' and public.is_spike_friend((select auth.uid()),p_owner)))';
  execute replace(v_def, v_old, v_new);

  -- All normal interaction paths must use the same per-post authorization.
  v_sig := 'public.mutate_post_interaction(text,text,text,jsonb)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_old := 'not public.can_view_spike_posts(auth.uid(), v_author)';
  if position(v_old in v_def) = 0 then raise exception 'Could not safely patch mutate_post_interaction'; end if;
  execute replace(v_def, v_old, 'not public.can_view_feed_post(v_author, d)');

  -- Legacy interaction RPCs are still callable and must not bypass Friends-only.
  foreach v_sig in array array[
    'public.increment_post_share_count(text,integer)'::regprocedure,
    'public.toggle_post_like(text)'::regprocedure,
    'public.toggle_post_reaction(text,text)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_sig);
    v_old := 'v_data:=coalesce(v_row.data,''{}''::jsonb);';
    if position(v_old in v_def) = 0 then raise exception 'Could not safely patch interaction RPC %', v_sig; end if;
    v_new := v_old || ' v_author:=coalesce(v_row.owner_id,nullif(v_data->>''authorUid'','''')::uuid); if v_author is null or not public.can_view_feed_post(v_author,v_data) then raise exception ''Post not found''; end if;';
    execute replace(v_def, v_old, v_new);
  end loop;
end;
$migration$;
