-- Canonical Policy Engine snapshot. The prohibited-term vocabulary is intentionally empty until a policy admin governs terms in Admin → Policy & Moderation.
create table if not exists public.spike_prohibited_terms (
  id uuid primary key default gen_random_uuid(),
  policy_id text not null references public.spike_policy_rules(id),
  term text not null,
  match_mode text not null default 'word' check (match_mode in ('word','phrase')),
  severity text not null default 'high',
  enforcement text not null default 'review' check (enforcement in ('review','remove','warn','restrict')),
  enabled boolean not null default true,
  locale text not null default 'und',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_id,term,locale)
);
create index if not exists spike_prohibited_terms_enabled_idx on public.spike_prohibited_terms(enabled,policy_id);
alter table public.spike_prohibited_terms enable row level security;
revoke all on public.spike_prohibited_terms from anon,authenticated;

create or replace function public.normalize_spike_policy_text(p_text text)
returns text language sql immutable strict as $$
  select regexp_replace(regexp_replace(lower(coalesce(p_text,'')), '[^a-z0-9]+', ' ', 'g'), '\\s+', ' ', 'g')::text;
$$;
revoke all on function public.normalize_spike_policy_text(text) from public,anon,authenticated;

drop function if exists public.moderate_spike_content(text,text);
create or replace function public.moderate_spike_content(p_content text,p_content_type text default 'post')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare n text; r record; matches jsonb:='[]'::jsonb; decision text:='allow'; ver integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  n:=public.normalize_spike_policy_text(p_content);
  for r in select t.term,t.match_mode,t.enforcement,t.severity,t.policy_id from public.spike_prohibited_terms t where t.enabled and ((t.match_mode='phrase' and position(public.normalize_spike_policy_text(t.term) in n)>0) or (t.match_mode='word' and (' '||n||' ') like '% '||public.normalize_spike_policy_text(t.term)||' %')) loop
    matches:=matches||jsonb_build_array(jsonb_build_object('policy_id',r.policy_id,'term',r.term,'match_mode',r.match_mode,'severity',r.severity,'enforcement',r.enforcement));
    if r.enforcement='remove' then decision:='remove'; elsif decision<>'remove' and r.enforcement='review' then decision:='review'; end if;
  end loop;
  select max(version) into ver from public.spike_policy_versions where policy_id is not null;
  return jsonb_build_object('decision',decision,'matched',matches,'policy_version',coalesce(ver,1),'content_type',p_content_type);
end; $$;
revoke all on function public.moderate_spike_content(text,text) from public,anon;
grant execute on function public.moderate_spike_content(text,text) to authenticated;
