-- Admin-managed prohibited-term catalog. Terms are intentionally not seeded here; policy owners control the live vocabulary.
create or replace function public.admin_spike_policy_terms()
returns table(id uuid,policy_id text,term text,match_mode text,severity text,enforcement text,enabled boolean,locale text,notes text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  return query select t.id,t.policy_id,t.term,t.match_mode,t.severity,t.enforcement,t.enabled,t.locale,t.notes,t.created_at,t.updated_at from public.spike_prohibited_terms t order by t.updated_at desc,t.id desc limit 1000;
end; $$;
revoke all on function public.admin_spike_policy_terms() from public,anon; grant execute on function public.admin_spike_policy_terms() to authenticated;

create or replace function public.admin_spike_policy_term_upsert(p_id uuid default null,p_policy_id text default null,p_term text default null,p_match_mode text default 'word',p_severity text default 'high',p_enforcement text default 'remove',p_enabled boolean default true,p_locale text default 'und',p_notes text default null)
returns public.spike_prohibited_terms language plpgsql security definer set search_path=public,pg_temp as $$
declare out_row public.spike_prohibited_terms; v_term text:=btrim(coalesce(p_term,'')); v_policy text:=btrim(coalesce(p_policy_id,''));
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  if v_term='' or char_length(v_term)>200 then raise exception 'Term must be 1-200 characters'; end if;
  if not exists(select 1 from public.spike_policy_rules where id=v_policy) then raise exception 'Unknown policy ID'; end if;
  if p_match_mode not in ('word','phrase') then raise exception 'Match mode must be word or phrase'; end if;
  if p_severity not in ('low','medium','high','critical') then raise exception 'Invalid severity'; end if;
  if p_enforcement not in ('review','remove','warn','restrict') then raise exception 'Invalid enforcement'; end if;
  if p_id is null then
    insert into public.spike_prohibited_terms(policy_id,term,match_mode,severity,enforcement,enabled,locale,notes) values(v_policy,v_term,p_match_mode,p_severity,p_enforcement,coalesce(p_enabled,true),coalesce(nullif(btrim(p_locale),''),'und'),nullif(btrim(p_notes),'')) returning * into out_row;
  else
    update public.spike_prohibited_terms set policy_id=v_policy,term=v_term,match_mode=p_match_mode,severity=p_severity,enforcement=p_enforcement,enabled=coalesce(p_enabled,true),locale=coalesce(nullif(btrim(p_locale),''),'und'),notes=nullif(btrim(p_notes),''),updated_at=now() where id=p_id returning * into out_row;
    if not found then raise exception 'Prohibited term not found'; end if;
  end if;
  return out_row;
end; $$;
revoke all on function public.admin_spike_policy_term_upsert(uuid,text,text,text,text,text,boolean,text,text) from public,anon; grant execute on function public.admin_spike_policy_term_upsert(uuid,text,text,text,text,text,boolean,text,text) to authenticated;

create or replace function public.admin_spike_policy_term_delete(p_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  delete from public.spike_prohibited_terms where id=p_id; get diagnostics n=row_count; return n>0;
end; $$;
revoke all on function public.admin_spike_policy_term_delete(uuid) from public,anon; grant execute on function public.admin_spike_policy_term_delete(uuid) to authenticated;
