-- The RLS helper runs with its trusted owner so it can call protected
-- friendship and profile-privacy predicates. auth.uid() remains the viewer.
create or replace function public.can_view_feed_post(p_owner_id uuid, p_post_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select coalesce(
    (select auth.uid()) is not null
    and p_owner_id is not null
    and public.can_view_spike_posts((select auth.uid()), p_owner_id)
    and public.can_view_spike_content(
      (select auth.uid()), p_owner_id,
      case
        when lower(coalesce(p_post_data->>'visibility', 'public')) = 'friends' then 'friends'
        when lower(coalesce(p_post_data->>'visibility', 'public')) = 'private' then 'private'
        else 'public'
      end
    ), false
  );
$function$;
