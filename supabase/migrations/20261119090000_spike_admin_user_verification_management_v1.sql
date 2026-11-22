-- Owner-only SPIKE profile badge verification management.
alter table public.profiles add column if not exists is_verified boolean not null default false;
create table if not exists public.spike_admin_verification_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  action text not null check (action in ('verified','unverified')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500), created_at timestamptz not null default now()
);
alter table public.spike_admin_verification_events enable row level security;
revoke all on public.spike_admin_verification_events from anon, authenticated;
create or replace function public.spike_admin_set_user_verified(p_user_id uuid,p_verified boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','private' as $$
declare v_email text; v_old boolean; v_reason text:=nullif(btrim(p_reason),'');
begin
 if not private.is_admin() then raise exception 'Only the SPIKE owner can manage verification.'; end if;
 if p_user_id is null or p_verified is null or v_reason is null or char_length(v_reason)>500 then raise exception 'A user, decision and reason (3–500 characters) are required.'; end if;
 select lower(u.email),p.is_verified into v_email,v_old from auth.users u join public.profiles p on p.id=u.id where u.id=p_user_id for update of p;
 if not found then raise exception 'Account not found.'; end if;
 if v_email='eletexjoeytex@gmail.com' then raise exception 'The owner verification state cannot be changed here.'; end if;
 if v_old=p_verified then return jsonb_build_object('ok',true,'unchanged',true,'is_verified',v_old); end if;
 update public.profiles set is_verified=p_verified,updated_at=now() where id=p_user_id;
 insert into public.spike_admin_verification_events(actor_id,target_user_id,action,reason) values(auth.uid(),p_user_id,case when p_verified then 'verified' else 'unverified' end,v_reason);
 return jsonb_build_object('ok',true,'is_verified',p_verified);
end; $$;
revoke all on function public.spike_admin_set_user_verified(uuid,boolean,text) from public,anon;
grant execute on function public.spike_admin_set_user_verified(uuid,boolean,text) to authenticated;
create or replace function public.spike_admin_list_verification_users(p_filter text default 'all',p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public','auth','private' as $$
begin
 if not private.is_admin() then raise exception 'Only the SPIKE owner can view verification management.'; end if;
 if p_filter not in ('all','verified','unverified') then raise exception 'Invalid verification filter.'; end if;
 return jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
  select p.id,p.username,p.display_name,p.spike_id,p.role,p.account_status,p.is_verified,p.created_at,
   (select e.reason from public.spike_admin_verification_events e where e.target_user_id=p.id order by e.created_at desc limit 1) last_review_reason,
   (select e.created_at from public.spike_admin_verification_events e where e.target_user_id=p.id order by e.created_at desc limit 1) last_reviewed_at
  from public.profiles p where (p_filter='all' or (p_filter='verified' and p.is_verified) or (p_filter='unverified' and not p.is_verified))
   and (nullif(btrim(p_search),'') is null or p.username ilike '%'||btrim(p_search)||'%' or p.display_name ilike '%'||btrim(p_search)||'%' or p.spike_id ilike '%'||btrim(p_search)||'%')
  order by p.created_at desc limit 500
 ) x),'[]'::jsonb));
end; $$;
revoke all on function public.spike_admin_list_verification_users(text,text) from public,anon;
grant execute on function public.spike_admin_list_verification_users(text,text) to authenticated;
create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table(id uuid,username text,display_name text,avatar_url text,verified boolean,spike_id text,location text,website text,bio text)
language sql stable set search_path='pg_catalog','public','private' as $$
 select p.id,p.username,p.display_name,
  case when p.avatar_path is null then null when p.avatar_path like 'http%' then p.avatar_path else 'https://veagqanfilmbchlvlpcc.supabase.co/storage/v1/object/public/avatars/'||p.avatar_path end,
  p.is_verified,p.spike_id,p.location,p.website,p.bio
 from public.profiles p where p.id=any(coalesce(p_user_ids,array[]::uuid[])) and p.account_status='active'
  and private.can_view_profile(p.id)
  and not exists(select 1 from public.blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=auth.uid()));
$$;
