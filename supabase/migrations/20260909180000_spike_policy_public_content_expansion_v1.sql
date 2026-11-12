-- Extend the policy gate to public Stories and SPIKE World community text.
create or replace function private.spike_policy_public_document_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare txt text; m jsonb; pid text; pver integer; decision text; cat text; ctype text; case_id uuid; title text;
begin
  if NEW.collection_name not in ('posts','stories') then return NEW; end if;
  ctype:=case when NEW.collection_name='stories' then 'story' else case when TG_OP='UPDATE' then 'post_edit' else 'post' end end;
  if TG_OP='UPDATE' and coalesce((OLD.data->>'deleted')::boolean,false)=true and coalesce(OLD.data->'moderation'->>'status','')='removed' and coalesce(NEW.data->'moderation'->>'appeal_restored','')<>'true' then
    NEW.data:=jsonb_set(jsonb_set(OLD.data,'{deleted}','true'::jsonb,true),'{moderation}',coalesce(OLD.data->'moderation','{}'::jsonb),true); return NEW;
  end if;
  txt:=coalesce(NEW.data->>'content',''); if btrim(txt)='' then return NEW; end if;
  m:=public.moderate_spike_content(txt,ctype); decision:=coalesce(m->>'decision','allow'); pid:=nullif(m->'matched'->0->>'policy_id',''); pver:=coalesce((m->>'policy_version')::integer,1);
  if decision='remove' then
    select coalesce(category,'Prohibited content') into cat from public.spike_policy_rules where id=pid;
    select coalesce(NEW.data->>'title',case when ctype='story' then 'Your Story' else 'Your Signal' end) into title;
    insert into public.spike_policy_cases(owner_id,content_type,content_id,policy_id,policy_version,decision,reason,original_content,metadata)
    values(NEW.owner_id,ctype,NEW.document_id,pid,pver,'remove',title||' was removed because it violated the SPIKE Prohibited Content Policy.',txt,jsonb_build_object('category',cat,'automated',true,'operation',TG_OP)) returning id into case_id;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(NEW.owner_id,'spike_policy_content_removed',jsonb_build_object('title',title||' was removed','message',title||' was removed because it violated the SPIKE Prohibited Content Policy.','reason','Prohibited content','category',cat,'policy_id',pid,'policy_version',pver,'action','Content removed','automated',true,'case_id',case_id,'post_id',case when ctype in ('post','post_edit') then NEW.document_id else null end,'source_page','policy_appeals.html','appeal_available',true),'high','spike_policy_content_removed:'||case_id::text,'spike_policy_case:'||case_id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
    NEW.data:=jsonb_set(jsonb_set(NEW.data,'{deleted}','true'::jsonb),'{content}',to_jsonb('[Content removed by SPIKE Policy]'::text),true);
    NEW.data:=jsonb_set(NEW.data,'{moderation}',jsonb_build_object('status','removed','policy_id',pid,'policy_version',pver,'category',cat,'automated',true,'removed_at',now()),true);
  end if;
  return NEW;
end; $$;
revoke all on function private.spike_policy_public_document_enforcement() from public,anon,authenticated;
drop trigger if exists trg_spike_policy_posts on public.app_documents;
drop trigger if exists trg_spike_policy_public_documents on public.app_documents;
create trigger trg_spike_policy_public_documents before insert or update of data on public.app_documents for each row execute function private.spike_policy_public_document_enforcement();

create or replace function private.spike_policy_chain_entry_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare m jsonb; pid text; pver integer; decision text; cat text; cid uuid;
begin
  m:=public.moderate_spike_content(NEW.content,'circle_message'); decision:=coalesce(m->>'decision','allow'); pid:=nullif(m->'matched'->0->>'policy_id',''); pver:=coalesce((m->>'policy_version')::integer,1);
  if decision='remove' then
    select coalesce(category,'Prohibited content') into cat from public.spike_policy_rules where id=pid;
    insert into public.spike_policy_cases(owner_id,content_type,content_id,policy_id,policy_version,decision,reason,original_content,metadata) values(NEW.user_id,'circle_message',NEW.id::text,pid,pver,'remove','Your SPIKE World message was blocked because it violated the SPIKE Prohibited Content Policy.',NEW.content,jsonb_build_object('category',cat,'automated',true)) returning id into cid;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key) values(NEW.user_id,'spike_policy_content_removed',jsonb_build_object('title','Your SPIKE World message was blocked','message','Your SPIKE World message was blocked because it violated the SPIKE Prohibited Content Policy.','reason','Prohibited content','category',cat,'policy_id',pid,'policy_version',pver,'action','Message blocked','automated',true,'case_id',cid,'source_page','policy_appeals.html','appeal_available',true),'high','spike_policy_content_removed:'||cid::text,'spike_policy_case:'||cid::text) on conflict (user_id,event_key) where event_key is not null do nothing;
    raise exception 'This SPIKE World message was blocked by SPIKE Policy';
  end if; return NEW;
end; $$;
revoke all on function private.spike_policy_chain_entry_enforcement() from public,anon,authenticated;
drop trigger if exists trg_spike_policy_chain_entries on public.spike_signal_chain_entries;
create trigger trg_spike_policy_chain_entries before insert or update of content on public.spike_signal_chain_entries for each row execute function private.spike_policy_chain_entry_enforcement();
drop trigger if exists trg_spike_policy_circle_messages on public.spike_circle_messages;
create trigger trg_spike_policy_circle_messages before insert or update of content on public.spike_circle_messages for each row execute function private.spike_policy_chain_entry_enforcement();
