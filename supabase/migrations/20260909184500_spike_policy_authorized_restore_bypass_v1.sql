-- Authorized moderation restores must bypass the normal anti-rewrite guard.
-- The bypass is transaction-local and can only be activated by trusted
-- SECURITY DEFINER moderation RPCs.

create or replace function private.spike_policy_public_document_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare txt text; m jsonb; pid text; pver integer; decision text; cat text; ptitle text; ctype text; existing public.spike_policy_cases;
begin
  if NEW.collection_name not in ('posts','stories') then return NEW; end if;
  if current_setting('spike.policy_authorized_restore', true)='true' then return NEW; end if;
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

create or replace function public.admin_spike_policy_decide_appeal(p_appeal_id uuid,p_decision text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare uid uuid:=auth.uid(); a public.spike_policy_appeals; c public.spike_policy_cases; p public.app_documents;
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into a from public.spike_policy_appeals where id=p_appeal_id for update;
  if not found then raise exception 'Appeal not found'; end if;
  if a.status not in ('pending','under_review') then raise exception 'Appeal is already decided'; end if;
  select * into c from public.spike_policy_cases where id=a.case_id for update;
  if not found then raise exception 'Policy case not found'; end if;
  update public.spike_policy_appeals set status=p_decision,decided_at=now(),decided_by=uid,decision_note=left(coalesce(p_note,''),3000) where id=a.id;
  if p_decision='approved' then
    update public.spike_policy_cases set status='restored',resolved_at=now(),resolved_by=uid,resolution='Appeal approved' where id=c.id;
    if c.content_type in ('post','post_edit') and c.content_id is not null then
      select * into p from public.app_documents where collection_name='posts' and document_id=c.content_id limit 1 for update;
      if found then
        perform set_config('spike.policy_authorized_restore','true',true);
        update public.app_documents
        set data=jsonb_set(jsonb_set(jsonb_set(p.data,'{deleted}','false'::jsonb,true),'{content}',to_jsonb(coalesce(c.original_content,p.data->>'content')),true),'{moderation}',jsonb_build_object('status','restored','appeal_restored',true,'appeal_id',a.id,'restored_at',now(),'restored_by',uid),true),updated_at=now()
        where path=p.path;
      end if;
    end if;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(a.appellant_id,'spike_policy_appeal_decision',jsonb_build_object('title','Your SPIKE Policy appeal was approved','message','Your appeal was approved and the affected content has been restored.','case_id',c.id,'appeal_id',a.id,'decision','approved','policy_id',c.policy_id,'post_id',c.content_id,'source_page','policy_appeals.html'),'high','spike_policy_appeal:'||a.id::text,'spike_policy_case:'||c.id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
  else
    update public.spike_policy_cases set status='upheld',resolved_at=now(),resolved_by=uid,resolution='Appeal rejected' where id=c.id;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(a.appellant_id,'spike_policy_appeal_decision',jsonb_build_object('title','Your SPIKE Policy appeal was rejected','message','Your appeal was reviewed and the original enforcement remains in place.','case_id',c.id,'appeal_id',a.id,'decision','rejected','policy_id',c.policy_id,'post_id',c.content_id,'source_page','policy_appeals.html'),'high','spike_policy_appeal:'||a.id::text,'spike_policy_case:'||c.id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
  end if;
  return jsonb_build_object('ok',true,'appeal_id',a.id,'decision',p_decision);
end; $$;
revoke all on function public.admin_spike_policy_decide_appeal(uuid,text,text) from public,anon;
grant execute on function public.admin_spike_policy_decide_appeal(uuid,text,text) to authenticated;

create or replace function public.admin_spike_policy_decide_case(p_case_id uuid,p_decision text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare uid uuid:=auth.uid(); c public.spike_policy_cases; p public.app_documents;
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('upheld','dismissed','restored') then raise exception 'Invalid case decision'; end if;
  select * into c from public.spike_policy_cases where id=p_case_id for update;
  if not found then raise exception 'Policy case not found'; end if;
  update public.spike_policy_cases set status=p_decision,resolved_at=now(),resolved_by=uid,resolution=left(coalesce(p_note,''),3000) where id=c.id;
  if p_decision='restored' and c.content_type in ('post','post_edit') and c.content_id is not null then
    select * into p from public.app_documents where collection_name='posts' and document_id=c.content_id limit 1 for update;
    if found then
      perform set_config('spike.policy_authorized_restore','true',true);
      update public.app_documents
      set data=jsonb_set(jsonb_set(jsonb_set(p.data,'{deleted}','false'::jsonb,true),'{content}',to_jsonb(coalesce(c.original_content,p.data->>'content')),true),'{moderation}',jsonb_build_object('status','restored','appeal_restored',true,'restored_at',now(),'restored_by',uid,'source','admin'),true),updated_at=now()
      where path=p.path;
    end if;
  end if;
  insert into public.notifications(user_id,type,data,priority,event_key,group_key)
  values(c.owner_id,'spike_policy_case_update',jsonb_build_object('title','SPIKE Policy case updated','message',coalesce(p_note,'A moderator updated your policy case.'),'case_id',c.id,'decision',p_decision,'policy_id',c.policy_id,'post_id',c.content_id,'source_page','policy_appeals.html'),'high','spike_policy_case_update:'||c.id::text||':'||p_decision,'spike_policy_case:'||c.id::text)
  on conflict (user_id,event_key) where event_key is not null do nothing;
  return jsonb_build_object('ok',true,'case_id',c.id,'decision',p_decision);
end; $$;
revoke all on function public.admin_spike_policy_decide_case(uuid,text,text) from public,anon;
grant execute on function public.admin_spike_policy_decide_case(uuid,text,text) to authenticated;
