create schema if not exists private;

create table if not exists private.spike_debug_reports (
  id bigint generated always as identity primary key,
  user_id uuid null,
  session_id text not null,
  page text null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists spike_debug_reports_created_idx on private.spike_debug_reports (created_at desc);
create index if not exists spike_debug_reports_session_idx on private.spike_debug_reports (session_id, created_at desc);
create index if not exists spike_debug_reports_user_idx on private.spike_debug_reports (user_id, created_at desc);

revoke all on table private.spike_debug_reports from public, anon, authenticated;

create or replace function public.submit_spike_debug_report(p_session_id text,p_page text,p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_size integer; v_count integer; v_id bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_session_id is null or length(trim(p_session_id)) < 8 or length(p_session_id) > 160 then raise exception 'Invalid session id'; end if;
  v_size := octet_length(coalesce(p_report, '{}'::jsonb)::text);
  if v_size > 300000 then raise exception 'Debug report too large'; end if;
  select count(*) into v_count from private.spike_debug_reports where user_id=v_user and created_at > now()-interval '1 hour';
  if v_count >= 60 then raise exception 'Debug report rate limit exceeded'; end if;
  insert into private.spike_debug_reports(user_id,session_id,page,report) values(v_user,p_session_id,left(coalesce(p_page,''),300),p_report) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end; $$;

revoke execute on function public.submit_spike_debug_report(text,text,jsonb) from public, anon;
grant execute on function public.submit_spike_debug_report(text,text,jsonb) to authenticated;

create or replace function public.get_spike_debug_reports(p_limit integer default 100,p_hours integer default 24)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ok boolean := false; v_limit integer := greatest(1,least(coalesce(p_limit,100),500)); v_hours integer := greatest(1,least(coalesce(p_hours,24),168)); v_rows jsonb;
begin
  begin select public.is_super_admin() into v_ok; exception when undefined_function then v_ok:=false; end;
  if not coalesce(v_ok,false) then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rows
  from (select id,user_id,session_id,page,report,created_at,expires_at from private.spike_debug_reports where created_at>=now()-make_interval(hours=>v_hours) order by created_at desc limit v_limit) x;
  return v_rows;
end; $$;

revoke execute on function public.get_spike_debug_reports(integer,integer) from public, anon, authenticated;
grant execute on function public.get_spike_debug_reports(integer,integer) to authenticated;

create or replace function public.purge_spike_debug_reports()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted integer; v_ok boolean := false;
begin
  begin select public.is_super_admin() into v_ok; exception when undefined_function then v_ok:=false; end;
  if not coalesce(v_ok,false) then raise exception 'Admin access required'; end if;
  delete from private.spike_debug_reports where expires_at < now(); get diagnostics v_deleted=row_count; return v_deleted;
end; $$;

revoke execute on function public.purge_spike_debug_reports() from public, anon, authenticated;
grant execute on function public.purge_spike_debug_reports() to authenticated;
