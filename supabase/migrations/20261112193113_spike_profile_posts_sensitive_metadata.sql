-- Profile surfaces need the same audience enforcement plus the sensitive flag
-- so they can render a warning rather than exposing the content immediately.
create or replace function public.get_public_profile_posts_v3(p_owner uuid, p_limit integer default 12)
returns table(
  id text,
  content text,
  created_at timestamptz,
  media_url text,
  media_type text,
  sensitive boolean,
  visibility text
)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  with allowed as (
    select
      p_owner = (select auth.uid()) as own,
      public.can_view_spike_profile((select auth.uid()), p_owner) as profile_ok,
      coalesce(pp.posts_visibility, 'public') as posts_visibility,
      coalesce(pp.media_visibility, 'public') as media_visibility
    from (select 1) x
    left join public.profile_privacy pp on pp.user_id = p_owner
  )
  select
    d.document_id,
    coalesce(d.data->>'content', d.data->>'text', d.data->>'body', ''),
    coalesce(nullif(d.data->>'createdAt', '')::timestamptz, d.created_at),
    case when a.own or a.media_visibility='public'
              or (a.media_visibility='friends' and public.is_spike_friend((select auth.uid()), p_owner))
         then coalesce(d.data->>'mediaUrl', d.data->>'media_url', d.data->>'image_url')
         else null end,
    case when a.own or a.media_visibility='public'
              or (a.media_visibility='friends' and public.is_spike_friend((select auth.uid()), p_owner))
         then coalesce(d.data->>'mediaType', d.data->>'media_type')
         else null end,
    coalesce(d.data->'sensitive' = 'true'::jsonb, false),
    coalesce(d.data->>'visibility', 'public')
  from public.app_documents d
  cross join allowed a
  where d.collection_name='posts'
    and d.owner_id=p_owner
    and coalesce((d.data->>'deleted')::boolean, false)=false
    and coalesce(d.data->'moderation'->>'status', '') not in ('removed','blocked','hidden')
    and a.profile_ok
    and (a.own or a.posts_visibility='public'
         or (a.posts_visibility='friends' and public.is_spike_friend((select auth.uid()), p_owner)))
    and (a.own or lower(coalesce(d.data->>'visibility','public'))='public'
         or (lower(coalesce(d.data->>'visibility','public'))='friends' and public.is_spike_friend((select auth.uid()), p_owner)))
  order by coalesce(nullif(d.data->>'createdAt','')::timestamptz, d.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$function$;

revoke all on function public.get_public_profile_posts_v3(uuid,integer) from public, anon;
grant execute on function public.get_public_profile_posts_v3(uuid,integer) to authenticated;
