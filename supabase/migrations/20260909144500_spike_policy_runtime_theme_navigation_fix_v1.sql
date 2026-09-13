-- SPIKE Policy runtime + navigation/theme alignment fix.
-- Fixes server trigger compatibility, Unicode-aware normalization, and unified public-document enforcement.
create or replace function public.normalize_spike_policy_text(p_text text)
returns text language sql immutable strict as $$
  select regexp_replace(regexp_replace(lower(coalesce(p_text,'')), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')::text;
$$;
revoke all on function public.normalize_spike_policy_text(text) from public,anon,authenticated;

create or replace function public.moderate_spike_content(p_content text,p_content_type text default 'post')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare n text; r record; matches jsonb:='[]'::jsonb; decision text:='allow'; ver integer; term_norm text;
begin
  n:=btrim(public.normalize_spike_policy_text(coalesce(p_content,'')));
  for r in select t.term,t.match_mode,t.enforcement,t.severity,t.policy_id from public.spike_prohibited_terms t where t.enabled loop
    term_norm:=btrim(public.normalize_spike_policy_text(r.term));
    if term_norm='' then continue; end if;
    if (r.match_mode='phrase' and position(term_norm in n)>0)
       or (r.match_mode='word' and position(' '||term_norm||' ' in ' '||n||' ')>0) then
      matches:=matches||jsonb_build_array(jsonb_build_object('policy_id',r.policy_id,'term',r.term,'match_mode',r.match_mode,'severity',r.severity,'enforcement',r.enforcement));
      if r.enforcement='remove' then decision:='remove';
      elsif decision<>'remove' and r.enforcement='review' then decision:='review';
      elsif decision='allow' and r.enforcement='warn' then decision:='warn';
      elsif decision='allow' and r.enforcement='restrict' then decision:='restrict';
      end if;
    end if;
  end loop;
  select coalesce(max(version),1) into ver from public.spike_policy_rules where active;
  return jsonb_build_object('decision',decision,'matched',matches,'policy_version',ver,'content_type',coalesce(p_content_type,'post'));
end; $$;
revoke all on function public.moderate_spike_content(text,text) from public,anon;
grant execute on function public.moderate_spike_content(text,text) to authenticated;

create or replace function private.spike_policy_public_document_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare txt text; m jsonb; pid text; pver integer; decision text; cat text; ptitle text; ctype text; case_id uuid; existing public.spike_policy_cases;
begin
  if NEW.collection_name not in ('posts','stories') then return NEW; end if;
  ctype:=case when NEW.collection_name='stories' then 'story' else case when TG_OP='UPDATE' then 'post_edit' else 'post' end end;
  if TG_OP='UPDATE' and coalesce((OLD.data->>'deleted')::boolean,false)=true and coalesce(OLD.data->'moderation'->>'status','')='removed' and coalesce(NEW.data->'moderation'->>'appeal_restored','')<>'true' then
    NEW.data:=jsonb_set(jsonb_set(OLD.data,'{deleted}','true'::jsonb,true),'{moderation}',coalesce(OLD.data->'moderation','{}'::jsonb),true); return NEW;
  end if;
  txt:=coalesce(NEW.data->>'content',''); if btrim(txt)='' then return NEW; end if;
  m:=public.moderate_spike_content(txt,ctype); decision:=coalesce(m->>'decision','allow'); pid:=nullif(m->'matched'->0->>'policy_id',''); pver:=coalesce((m->>'policy_version')::integer,1);
  if decision='remove' then
    select coalesce(pr.category,'Prohibited content'),coalesce(pr.title,'SPIKE Policy') into cat,ptitle from public.spike_policy_rules pr where pr.id=pid;
    if not exists(select 1 from public.spike_policy_cases c where c.owner_id=NEW.owner_id and c.content_id=NEW.document_id and c.status in ('active','appealed')) then
      insert into public.spike_policy_cases(owner_id,content_type,content_id,policy_id,policy_version,decision,reason,original_content,metadata)
      values(NEW.owner_id,ctype,NEW.document_id,pid,pver,'remove',case when ctype='story' then 'Your Story was removed because it violated the SPIKE Prohibited Content Policy.' else 'Your Signal was removed because it violated the SPIKE Prohibited Content Policy.' end,txt,jsonb_build_object('category',cat,'policy_title',ptitle,'automated',true,'operation',TG_OP)) returning * into existing;
      insert into public.notifications(user_id,type,data,priority,event_key,group_key)
      values(NEW.owner_id,'spike_policy_content_removed',jsonb_build_object('title',case when ctype='story' then 'Your Story was removed' else 'Your Signal was removed' end,'message',case when ctype='story' then 'Your Story was removed because it violated the SPIKE Prohibited Content Policy.' else 'Your Signal was removed because it violated the SPIKE Prohibited Content Policy.' end,'reason','Prohibited content','category',cat,'policy_id',pid,'policy_version',pver,'action','Content removed','automated',true,'case_id',existing.id,'content_type',ctype,'post_id',case when ctype in ('post','post_edit') then NEW.document_id else null end,'content_id',NEW.document_id,'source_page','policy_appeals.html','appeal_available',true),'high','spike_policy_content_removed:'||existing.id::text,'spike_policy_case:'||existing.id::text)
      on conflict (user_id,event_key) where event_key is not null do nothing;
    end if;
    NEW.data:=jsonb_set(jsonb_set(NEW.data,'{deleted}','true'::jsonb),'{content}',to_jsonb('[Content removed by SPIKE Policy]'::text),true);
    NEW.data:=jsonb_set(NEW.data,'{moderation}',jsonb_build_object('status','removed','policy_id',pid,'policy_version',pver,'category',cat,'automated',true,'removed_at',now()),true);
  end if;
  return NEW;
end; $$;
revoke all on function private.spike_policy_public_document_enforcement() from public,anon,authenticated;
drop trigger if exists trg_spike_policy_posts on public.app_documents;
drop trigger if exists trg_spike_policy_public_documents on public.app_documents;
create trigger trg_spike_policy_public_documents before insert or update of data on public.app_documents for each row execute function private.spike_policy_public_document_enforcement();

create or replace function public.get_spike_policy_health()
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select jsonb_build_object('policy_version',coalesce((select max(version) from public.spike_policy_rules where active),1),'active_rules',coalesce((select count(*) from public.spike_policy_rules where active),0),'governed_terms',coalesce((select count(*) from public.spike_prohibited_terms where enabled),0),'remove_terms',coalesce((select count(*) from public.spike_prohibited_terms where enabled and enforcement='remove'),0),'review_terms',coalesce((select count(*) from public.spike_prohibited_terms where enabled and enforcement='review'),0),'engine','server_authoritative');
$$;
revoke all on function public.get_spike_policy_health() from public;
grant execute on function public.get_spike_policy_health() to anon,authenticated;
