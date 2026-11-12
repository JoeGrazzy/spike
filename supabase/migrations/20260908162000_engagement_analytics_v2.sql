-- Engagement analytics v2: creator-level trend and audience depth.
create or replace function public.get_my_engagement_dashboard(
  p_days integer default 7,
  p_limit integer default 100,
  p_action text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_uid uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days,7),3650));
  v_limit integer := greatest(1, least(coalesce(p_limit,100),500));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_summary jsonb;
  v_activities jsonb;
  v_top jsonb;
  v_trend jsonb;
  v_unique bigint;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_action is not null and p_action not in ('like','reaction','comment','share','view','save') then
    raise exception 'Invalid engagement action';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'likes', count(*) filter (where action_type='like'),
    'comments', count(*) filter (where action_type='comment'),
    'shares', count(*) filter (where action_type='share'),
    'views', count(*) filter (where action_type='view'),
    'reactions', count(*) filter (where action_type='reaction'),
    'saves', count(*) filter (where action_type='save')
  ) into v_summary
  from public.post_engagement_events
  where owner_id=v_uid and actor_id<>v_uid and created_at>=v_since
    and (p_action is null or action_type=p_action);

  select count(distinct actor_id) into v_unique
  from public.post_engagement_events
  where owner_id=v_uid and actor_id<>v_uid and created_at>=v_since
    and (p_action is null or action_type=p_action);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_activities
  from (
    select e.id,e.actor_id,e.post_id,e.action_type,e.metadata,e.created_at,
           coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'SPIKE user') as actor_name,
           coalesce(nullif(u.raw_user_meta_data->>'avatar_url',''),nullif(u.raw_user_meta_data->>'avatar','')) as actor_avatar,
           coalesce(nullif(trim(d.data->>'content'),''),nullif(trim(d.data->>'text'),''),'Your Signal') as post_title
    from public.post_engagement_events e
    left join auth.users u on u.id=e.actor_id
    left join public.app_documents d on d.collection_name='posts' and d.document_id=e.post_id
    where e.owner_id=v_uid and e.actor_id<>v_uid and e.created_at>=v_since
      and (p_action is null or e.action_type=p_action)
    order by e.created_at desc
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.engagement desc),'[]'::jsonb) into v_top
  from (
    select e.post_id,
           coalesce(nullif(trim(max(d.data->>'content')),''),nullif(trim(max(d.data->>'text')),''),'Your Signal') as post_title,
           count(*) as engagement,
           count(*) filter (where e.action_type='view') as views,
           count(*) filter (where e.action_type='like') as likes,
           count(*) filter (where e.action_type='comment') as comments,
           count(*) filter (where e.action_type='share') as shares,
           count(*) filter (where e.action_type='save') as saves,
           count(*) filter (where e.action_type='reaction') as reactions
    from public.post_engagement_events e
    left join public.app_documents d on d.collection_name='posts' and d.document_id=e.post_id
    where e.owner_id=v_uid and e.actor_id<>v_uid and e.created_at>=v_since
      and (p_action is null or e.action_type=p_action)
    group by e.post_id
    order by engagement desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day),'[]'::jsonb) into v_trend
  from (
    select gs.day::date as day,
           count(e.id) as total,
           count(e.id) filter (where e.action_type='like') as likes,
           count(e.id) filter (where e.action_type='comment') as comments,
           count(e.id) filter (where e.action_type='share') as shares,
           count(e.id) filter (where e.action_type='view') as views
    from generate_series(date_trunc('day',v_since),date_trunc('day',now()),interval '1 day') gs(day)
    left join public.post_engagement_events e
      on e.owner_id=v_uid and e.actor_id<>v_uid
      and e.created_at>=gs.day and e.created_at<gs.day+interval '1 day'
      and (p_action is null or e.action_type=p_action)
    group by gs.day
  ) x;

  return jsonb_build_object(
    'period_days',v_days,
    'summary',v_summary,
    'unique_engagers',v_unique,
    'activities',v_activities,
    'top_posts',v_top,
    'trend',v_trend
  );
end;
$$;

revoke all on function public.get_my_engagement_dashboard(integer,integer,text) from public,anon;
grant execute on function public.get_my_engagement_dashboard(integer,integer,text) to authenticated;
