create or replace function public.spike_admin_get_user_timeline(p_user_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare v_rows jsonb;
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can inspect account timelines.' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Account not found.' using errcode = '22023';
  end if;
  with events as (
    select e.id::text as event_id,
           case
             when e.source_table = 'posts' then 'Published a post'
             when e.source_table = 'comments' then 'Added a comment'
             when e.source_table = 'messages' then 'Sent a direct message'
             when e.source_table = 'room_messages' then 'Sent a room message'
             when e.source_table = 'post_likes' then 'Liked a post'
             when e.source_table = 'follows' then 'Followed another account'
             when e.source_table = 'spike_verified_subscriptions' then 'Verified subscription updated'
             when e.source_table = 'spike_gift_events' then 'Sent or received a gift'
             when e.source_table = 'profiles' then 'Updated profile'
             else replace(coalesce(e.event_type,'Account activity'),'_',' ')
           end as title,
           e.category, e.source_table as source, e.created_at, null::text as status
      from private.spike_verified_activity_events e where e.user_id = p_user_id
    union all
    select 'admin-' || a.id::text,
           case a.action when 'suspended' then 'Account suspended'
                         when 'reactivated' then 'Account reactivated'
                         else 'Account status changed' end,
           'security', 'spike_admin_action_events', a.created_at, coalesce(a.new_status, a.action)
      from public.spike_admin_action_events a where a.target_user_id = p_user_id
    union all
    select 'verification-' || v.id::text,
           case v.action when 'verified' then 'SPIKE Verified badge granted'
                         else 'SPIKE Verified badge removed' end,
           'verification', 'spike_admin_verification_events', v.created_at, v.action
      from public.spike_admin_verification_events v where v.target_user_id = p_user_id
    union all
    select 'identity-' || r.id::text, 'Identity application submitted',
           'verification', 'spike_identity_verification_requests', r.created_at, r.status
      from private.spike_identity_verification_requests r where r.user_id = p_user_id
    union all
    select 'identity-review-' || r.id::text, 'Identity application reviewed',
           'verification', 'spike_identity_verification_requests', r.reviewed_at, r.status
      from private.spike_identity_verification_requests r
     where r.user_id = p_user_id and r.reviewed_at is not null
    union all
    select 'withdrawal-' || w.id::text, 'Withdrawal request submitted',
           'wallet', 'spike_withdrawal_requests', w.created_at, w.status
      from private.spike_withdrawal_requests w where w.user_id = p_user_id
    union all
    select 'withdrawal-review-' || w.id::text, 'Withdrawal request reviewed',
           'wallet', 'spike_withdrawal_requests', w.reviewed_at, w.status
      from private.spike_withdrawal_requests w
     where w.user_id = p_user_id and w.reviewed_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'event_id', event_id, 'title', title, 'category', category,
      'source', source, 'created_at', created_at, 'status', status
    ) order by created_at desc, event_id desc), '[]'::jsonb)
    into v_rows
    from (select * from events order by created_at desc, event_id desc
          limit greatest(1, least(coalesce(p_limit,100),150))) q;
  return v_rows;
end;
$function$;
