-- SPIKE QR Connect v1
-- Server-authoritative QR lookup + instant friendship. The QR only carries a user UUID;
-- Supabase remains the authority for discovery, identity and the friendship mutation.

create or replace function public.get_qr_connect_profile(p_user_id uuid)
returns table(
  id uuid, username text, display_name text, avatar_url text,
  bio text, website text, sp_id text, created_at timestamptz, verified boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,
         p.sp_id,p.created_at,p.verified
  from public.profiles p
  where auth.uid() is not null
    and p_user_id is not null
    and p.id = p_user_id
    and p.id <> auth.uid()
    and p.activated is not false
    and public.can_discover_spike_profile(auth.uid(), p.id);
$$;

revoke execute on function public.get_qr_connect_profile(uuid) from public, anon;
grant execute on function public.get_qr_connect_profile(uuid) to authenticated;

create or replace function public.connect_via_spike_qr(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  target uuid := p_user_id;
  target_name text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target is null or target = me then raise exception 'invalid QR target'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = target
      and p.activated is not false
      and public.can_discover_spike_profile(me, target)
  ) then
    raise exception 'SPIKE member is unavailable';
  end if;

  if exists (
    select 1 from public.friendships f
    where (f.user_id=me and f.friend_id=target)
       or (f.user_id=target and f.friend_id=me)
  ) then
    return jsonb_build_object('ok',true,'already_friends',true,'user_id',target);
  end if;

  -- A QR connection is an explicit mutual action, so it can safely turn an
  -- existing pending request in either direction into an accepted friendship.
  update public.friend_requests
     set status='accepted', responded_at=coalesce(responded_at,now())
   where status='pending'
     and ((sender_id=me and recipient_id=target)
       or (sender_id=target and recipient_id=me));

  insert into public.friendships(user_id,friend_id)
  values (me,target),(target,me)
  on conflict do nothing;

  select coalesce(display_name,username,'Someone')
    into target_name
    from public.profiles
   where id=target;

  -- Best-effort notification: the friendship itself is the source of truth.
  insert into public.notifications(user_id,type,data,priority,event_key,group_key)
  values (
    target,
    'friend_accepted',
    jsonb_build_object(
      'actor_id',me,
      'actor_name',coalesce((select display_name from public.profiles where id=me), 'Someone'),
      'title','New SPIKE connection',
      'body',coalesce((select display_name from public.profiles where id=me),'Someone') || ' connected with you via SPIKE QR'
    ),
    'normal',
    'qr-connect:' || least(me::text,target::text) || ':' || greatest(me::text,target::text),
    'friendship:' || least(me::text,target::text) || ':' || greatest(me::text,target::text)
  )
  on conflict (user_id,event_key) where event_key is not null
  do update set data=excluded.data, read=false, created_at=now();

  return jsonb_build_object('ok',true,'already_friends',false,'user_id',target,'display_name',target_name);
end;
$$;

revoke execute on function public.connect_via_spike_qr(uuid) from public, anon;
grant execute on function public.connect_via_spike_qr(uuid) to authenticated;
