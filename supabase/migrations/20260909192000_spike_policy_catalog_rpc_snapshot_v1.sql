create or replace function public.get_spike_policy(p_policy_id text default null)
returns setof public.spike_policy_rules language sql stable security definer set search_path=public,pg_temp as $$
  select * from public.spike_policy_rules where active and (p_policy_id is null or id=p_policy_id) order by priority,id;
$$;
create or replace function public.get_spike_policy_version(p_policy_id text,p_version integer default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select snapshot from public.spike_policy_versions where policy_id=p_policy_id and version=coalesce(p_version,(select max(v.version) from public.spike_policy_versions v where v.policy_id=p_policy_id)) order by version desc limit 1;
$$;
create or replace function public.get_spike_policy_catalog()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('version',coalesce((select max(version) from public.spike_policy_rules where active),1),'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.priority,r.id) from public.spike_policy_rules r where r.active),'[]'::jsonb));
$$;
revoke all on function public.get_spike_policy(text),public.get_spike_policy_version(text,integer),public.get_spike_policy_catalog() from public;
grant execute on function public.get_spike_policy(text),public.get_spike_policy_version(text,integer),public.get_spike_policy_catalog() to anon,authenticated;
