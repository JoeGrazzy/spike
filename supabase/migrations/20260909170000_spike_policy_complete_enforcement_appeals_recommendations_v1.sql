-- SPIKE Policy completion: enforcement cases, appeals, user notices, admin moderation controls,
-- and recommendation eligibility. Does not alter the existing private moderation tables.

create table if not exists public.spike_policy_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('post','post_edit','comment','room_message','circle_message','story')),
  content_id text,
  policy_id text references public.spike_policy_rules(id),
  policy_version integer,
  decision text not null check (decision in ('remove','review','warn','allow','restrict')),
  source text not null default 'policy_engine',
  reason text not null default 'This content did not meet SPIKE Policy requirements.',
  original_content text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','appealed','restored','upheld','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution text
);

create index if not exists spike_policy_cases_owner_created_idx on public.spike_policy_cases(owner_id, created_at desc, id desc);
create index if not exists spike_policy_cases_status_idx on public.spike_policy_cases(status, created_at desc);
create unique index if not exists spike_policy_cases_content_active_uidx on public.spike_policy_cases(owner_id, content_type, content_id) where content_id is not null and status in ('active','appealed');

alter table public.spike_policy_cases enable row level security;
drop policy if exists "spike users can read their policy cases" on public.spike_policy_cases;
create policy "spike users can read their policy cases" on public.spike_policy_cases for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.spike_policy_cases from anon, authenticated;
grant select on public.spike_policy_cases to authenticated;

create table if not exists public.spike_policy_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.spike_policy_cases(id) on delete cascade,
  appellant_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending','under_review','approved','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_note text
);
create unique index if not exists spike_policy_appeals_active_uidx on public.spike_policy_appeals(case_id) where status in ('pending','under_review');
create index if not exists spike_policy_appeals_appellant_idx on public.spike_policy_appeals(appellant_id, created_at desc);
create index if not exists spike_policy_appeals_status_idx on public.spike_policy_appeals(status, created_at desc);

alter table public.spike_policy_appeals enable row level security;
drop policy if exists "spike users can read their policy appeals" on public.spike_policy_appeals;
create policy "spike users can read their policy appeals" on public.spike_policy_appeals for select to authenticated using(appellant_id=(select auth.uid()));
revoke all on public.spike_policy_appeals from anon, authenticated;
grant select on public.spike_policy_appeals to authenticated;

create or replace function private.spike_is_policy_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and coalesce(p.role,'user') in ('admin','super_admin','content_admin','moderation_admin','support_admin')
  );
$$;
revoke all on function private.spike_is_policy_admin() from public, anon, authenticated;

create or replace function public.submit_spike_policy_appeal(p_case_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid := auth.uid(); c public.spike_policy_cases; a public.spike_policy_appeals;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into c from public.spike_policy_cases where id=p_case_id and owner_id=uid for update;
  if not found then raise exception 'Policy case not found'; end if;
  if c.status not in ('active','upheld') then raise exception 'This case is not eligible for appeal'; end if;
  if exists(select 1 from public.spike_policy_appeals where case_id=c.id and status in ('pending','under_review')) then raise exception 'An active appeal already exists for this case'; end if;
  insert into public.spike_policy_appeals(case_id,appellant_id,reason) values(c.id,uid,trim(p_reason)) returning * into a;
  update public.spike_policy_cases set status='appealed' where id=c.id;
  return jsonb_build_object('ok',true,'appeal_id',a.id,'case_id',c.id,'status',a.status);
end; $$;
revoke all on function public.submit_spike_policy_appeal(uuid,text) from public, anon;
grant execute on function public.submit_spike_policy_appeal(uuid,text) to authenticated;

create or replace function public.get_my_spike_policy_cases(p_limit integer default 50)
returns table(id uuid,content_type text,content_id text,policy_id text,policy_version integer,decision text,reason text,status text,created_at timestamptz,appeal_id uuid,appeal_status text)
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id,c.content_type,c.content_id,c.policy_id,c.policy_version,c.decision,c.reason,c.status,c.created_at,
         a.id,a.status
  from public.spike_policy_cases c
  left join lateral (select a.id,a.status from public.spike_policy_appeals a where a.case_id=c.id order by a.created_at desc limit 1) a on true
  where c.owner_id=(select auth.uid())
  order by c.created_at desc,c.id desc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;
revoke all on function public.get_my_spike_policy_cases(integer) from public, anon;
grant execute on function public.get_my_spike_policy_cases(integer) to authenticated;

create or replace function public.get_my_spike_policy_appeals(p_limit integer default 50)
returns table(id uuid,case_id uuid,reason text,status text,created_at timestamptz,decided_at timestamptz,decision_note text)
language sql stable security definer set search_path=public,pg_temp as $$
  select id,case_id,reason,status,created_at,decided_at,decision_note
  from public.spike_policy_appeals
  where appellant_id=(select auth.uid())
  order by created_at desc,id desc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;
revoke all on function public.get_my_spike_policy_appeals(integer) from public, anon;
grant execute on function public.get_my_spike_policy_appeals(integer) to authenticated;

create or replace function public.admin_spike_policy_cases(p_status text default null,p_limit integer default 100)
returns table(id uuid,owner_id uuid,content_type text,content_id text,policy_id text,policy_version integer,decision text,reason text,original_content text,status text,metadata jsonb,created_at timestamptz,appeal_id uuid,appeal_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  return query
  select c.id,c.owner_id,c.content_type,c.content_id,c.policy_id,c.policy_version,c.decision,c.reason,c.original_content,c.status,c.metadata,c.created_at,a.id,a.status
  from public.spike_policy_cases c
  left join lateral (select a.id,a.status from public.spike_policy_appeals a where a.case_id=c.id order by a.created_at desc limit 1) a on true
  where (p_status is null or c.status=p_status)
  order by c.created_at desc,c.id desc
  limit least(greatest(coalesce(p_limit,100),1),500);
end; $$;
revoke all on function public.admin_spike_policy_cases(text,integer) from public, anon;
grant execute on function public.admin_spike_policy_cases(text,integer) to authenticated;

create or replace function public.admin_spike_policy_appeals(p_status text default null,p_limit integer default 100)
returns table(id uuid,case_id uuid,appellant_id uuid,reason text,status text,created_at timestamptz,decided_at timestamptz,decided_by uuid,decision_note text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not private.spike_is_policy_admin() then raise exception 'Admin access required'; end if;
  return query
  select a.id,a.case_id,a.appellant_id,a.reason,a.status,a.created_at,a.decided_at,a.decided_by,a.decision_note
  from public.spike_policy_appeals a
  where (p_status is null or a.status=p_status)
  order by a.created_at desc,a.id desc
  limit least(greatest(coalesce(p_limit,100),1),500);
end; $$;
revoke all on function public.admin_spike_policy_appeals(text,integer) from public, anon;
grant execute on function public.admin_spike_policy_appeals(text,integer) to authenticated;

create or replace function public.admin_spike_policy_decide_appeal(p_appeal_id uuid,p_decision text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
        update public.app_documents set data=jsonb_set(jsonb_set(p.data,'{deleted}','false'::jsonb,true),'{moderation}',jsonb_build_object('status','restored','appeal_id',a.id,'restored_at',now()),true),updated_at=now() where path=p.path;
      end if;
    end if;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(a.appellant_id,'spike_policy_appeal_decision',jsonb_build_object('title','Your SPIKE Policy appeal was approved','message','Your appeal was approved and the affected content has been restored when eligible.','case_id',c.id,'appeal_id',a.id,'decision','approved','policy_id',c.policy_id,'post_id',c.content_id,'source_page','policy_appeals.html'),'high','spike_policy_appeal:'||a.id::text,'spike_policy_case:'||c.id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
  else
    update public.spike_policy_cases set status='upheld',resolved_at=now(),resolved_by=uid,resolution='Appeal rejected' where id=c.id;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(a.appellant_id,'spike_policy_appeal_decision',jsonb_build_object('title','Your SPIKE Policy appeal was rejected','message','Your appeal was reviewed and the original enforcement remains in place.','case_id',c.id,'appeal_id',a.id,'decision','rejected','policy_id',c.policy_id,'post_id',c.content_id,'source_page','policy_appeals.html'),'high','spike_policy_appeal:'||a.id::text,'spike_policy_case:'||c.id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
  end if;
  return jsonb_build_object('ok',true,'appeal_id',a.id,'decision',p_decision);
end; $$;
revoke all on function public.admin_spike_policy_decide_appeal(uuid,text,text) from public, anon;
grant execute on function public.admin_spike_policy_decide_appeal(uuid,text,text) to authenticated;

create or replace function public.admin_spike_policy_decide_case(p_case_id uuid,p_decision text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
      update public.app_documents set data=jsonb_set(jsonb_set(p.data,'{deleted}','false'::jsonb,true),'{moderation}',jsonb_build_object('status','restored','restored_at',now(),'source','admin'),true),updated_at=now() where path=p.path;
    end if;
  end if;
  insert into public.notifications(user_id,type,data,priority,event_key,group_key)
  values(c.owner_id,'spike_policy_case_update',jsonb_build_object('title','SPIKE Policy case updated','message',coalesce(p_note,'A moderator updated your policy case.'),'case_id',c.id,'decision',p_decision,'policy_id',c.policy_id,'post_id',c.content_id,'source_page','policy_appeals.html'),'high','spike_policy_case_update:'||c.id::text||':'||p_decision,'spike_policy_case:'||c.id::text)
  on conflict (user_id,event_key) where event_key is not null do nothing;
  return jsonb_build_object('ok',true,'case_id',c.id,'decision',p_decision);
end; $$;
revoke all on function public.admin_spike_policy_decide_case(uuid,text,text) from public, anon;
grant execute on function public.admin_spike_policy_decide_case(uuid,text,text) to authenticated;

create or replace function public.spike_recommendation_eligibility(p_post_id text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'eligible', exists(select 1 from public.app_documents d where d.collection_name='posts' and d.document_id=p_post_id and coalesce((d.data->>'deleted')::boolean,false)=false and coalesce(d.data->'moderation'->>'status','') not in ('removed','blocked')),
    'post_id',p_post_id
  );
$$;
revoke all on function public.spike_recommendation_eligibility(text) from public, anon;
grant execute on function public.spike_recommendation_eligibility(text) to authenticated;

create or replace function private.spike_policy_post_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare txt text; m jsonb; pid text; pver integer; decision text; cat text; ptitle text; cid text; existing public.spike_policy_cases;
begin
  if NEW.collection_name<>'posts' then return NEW; end if;
  if TG_OP='UPDATE' and coalesce((OLD.data->>'deleted')::boolean,false)=true and coalesce(OLD.data->'moderation'->>'status','')='removed' and coalesce(NEW.data->'moderation'->>'appeal_restored','')<>'true' then
    NEW.data:=jsonb_set(jsonb_set(OLD.data,'{deleted}','true'::jsonb,true),'{moderation}',coalesce(OLD.data->'moderation','{}'::jsonb),true);
    return NEW;
  end if;
  txt:=coalesce(NEW.data->>'content','');
  if btrim(txt)='' then return NEW; end if;
  select r.decision,r.matched->0->>'policy_id',r.policy_version into decision,pid,pver from public.moderate_spike_content(txt,case when TG_OP='UPDATE' then 'post_edit' else 'post' end) r limit 1;
  if decision='remove' then
    select coalesce(pr.category,'Prohibited content'),coalesce(pr.title,'SPIKE Policy') into cat,ptitle from public.spike_policy_rules pr where pr.id=pid;
    cid:=NEW.document_id;
    if not exists(select 1 from public.spike_policy_cases c where c.owner_id=NEW.owner_id and c.content_type=case when TG_OP='UPDATE' then 'post_edit' else 'post' end and c.content_id=cid and c.status in ('active','appealed')) then
      insert into public.spike_policy_cases(owner_id,content_type,content_id,policy_id,policy_version,decision,reason,original_content,metadata)
      values(NEW.owner_id,case when TG_OP='UPDATE' then 'post_edit' else 'post' end,cid,pid,pver,'remove','Your Signal was removed because it violated the SPIKE Prohibited Content Policy.',txt,jsonb_build_object('category',cat,'policy_title',ptitle,'automated',true,'operation',TG_OP)) returning * into existing;
      insert into public.notifications(user_id,type,data,priority,event_key,group_key)
      values(NEW.owner_id,'spike_policy_content_removed',jsonb_build_object('title','Your Signal was removed','message','Your Signal was removed because it violated the SPIKE Prohibited Content Policy.','reason','Prohibited content','category',cat,'policy_id',pid,'policy_version',pver,'action','Content removed','automated',true,'case_id',existing.id,'post_id',cid,'source_page','policy_appeals.html','appeal_available',true),'high','spike_policy_content_removed:'||existing.id::text,'spike_policy_case:'||existing.id::text)
      on conflict (user_id,event_key) where event_key is not null do nothing;
    end if;
    NEW.data:=jsonb_set(jsonb_set(NEW.data,'{deleted}','true'::jsonb,true),'{content}','[Content removed by SPIKE Policy]'::jsonb,true);
    NEW.data:=jsonb_set(NEW.data,'{moderation}',jsonb_build_object('status','removed','policy_id',pid,'policy_version',pver,'category',cat,'automated',true,'removed_at',now()),true);
  end if;
  return NEW;
end; $$;
revoke all on function private.spike_policy_post_enforcement() from public,anon,authenticated;
drop trigger if exists trg_spike_policy_posts on public.app_documents;
create trigger trg_spike_policy_posts before insert or update of data on public.app_documents for each row execute function private.spike_policy_post_enforcement();

-- Public comments: remove the comment row rather than leaking the text, and notify the author.
create or replace function private.spike_policy_comment_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare m jsonb; pid text; pver integer; decision text; cat text; case_id uuid;
begin
  select r.decision,r.matched->0->>'policy_id',r.policy_version into decision,pid,pver from public.moderate_spike_content(NEW.content,'comment') r limit 1;
  if decision='remove' then
    select coalesce(category,'Prohibited content') into cat from public.spike_policy_rules where id=pid;
    insert into public.spike_policy_cases(owner_id,content_type,content_id,policy_id,policy_version,decision,reason,original_content,metadata)
    values(NEW.user_id,'comment',NEW.id,pid,pver,'remove','Your comment was removed because it violated the SPIKE Prohibited Content Policy.',NEW.content,jsonb_build_object('category',cat,'automated',true)) returning id into case_id;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(NEW.user_id,'spike_policy_content_removed',jsonb_build_object('title','Your comment was removed','message','Your comment was removed because it violated the SPIKE Prohibited Content Policy.','reason','Prohibited content','category',cat,'policy_id',pid,'policy_version',pver,'action','Comment removed','automated',true,'case_id',case_id,'source_page','policy_appeals.html','appeal_available',true),'high','spike_policy_content_removed:'||case_id::text,'spike_policy_case:'||case_id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
    raise exception 'This comment was blocked by SPIKE Policy';
  end if;
  return NEW;
end; $$;
revoke all on function private.spike_policy_comment_enforcement() from public,anon,authenticated;
drop trigger if exists trg_spike_policy_comments on public.comments;
create trigger trg_spike_policy_comments before insert or update of content on public.comments for each row execute function private.spike_policy_comment_enforcement();

-- Room messages: hard block prohibited content before it becomes visible.
create or replace function private.spike_policy_room_message_enforcement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare m jsonb; pid text; pver integer; decision text; cat text; case_id uuid;
begin
  select r.decision,r.matched->0->>'policy_id',r.policy_version into decision,pid,pver from public.moderate_spike_content(NEW.body,'room_message') r limit 1;
  if decision='remove' then
    select coalesce(category,'Prohibited content') into cat from public.spike_policy_rules where id=pid;
    insert into public.spike_policy_cases(owner_id,content_type,content_id,policy_id,policy_version,decision,reason,original_content,metadata)
    values(NEW.user_id,'room_message',NEW.id::text,pid,pver,'remove','Your Room message was blocked because it violated the SPIKE Prohibited Content Policy.',NEW.body,jsonb_build_object('category',cat,'automated',true)) returning id into case_id;
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values(NEW.user_id,'spike_policy_content_removed',jsonb_build_object('title','Your Room message was blocked','message','Your Room message was blocked because it violated the SPIKE Prohibited Content Policy.','reason','Prohibited content','category',cat,'policy_id',pid,'policy_version',pver,'action','Message blocked','automated',true,'case_id',case_id,'source_page','policy_appeals.html','appeal_available',true),'high','spike_policy_content_removed:'||case_id::text,'spike_policy_case:'||case_id::text)
    on conflict (user_id,event_key) where event_key is not null do nothing;
    raise exception 'This Room message was blocked by SPIKE Policy';
  end if;
  return NEW;
end; $$;
revoke all on function private.spike_policy_room_message_enforcement() from public,anon,authenticated;
drop trigger if exists trg_spike_policy_room_messages on public.room_messages;
create trigger trg_spike_policy_room_messages before insert or update of body on public.room_messages for each row execute function private.spike_policy_room_message_enforcement();

-- Recommendation safety: a simple indexed view for server-side consumers.
create or replace view public.spike_recommendation_eligible_posts as
select d.document_id,d.owner_id,d.data,d.created_at,d.updated_at
from public.app_documents d
where d.collection_name='posts'
  and coalesce((d.data->>'deleted')::boolean,false)=false
  and coalesce(d.data->'moderation'->>'status','') not in ('removed','blocked');
revoke all on public.spike_recommendation_eligible_posts from anon;
grant select on public.spike_recommendation_eligible_posts to authenticated;

comment on table public.spike_policy_cases is 'Canonical user-visible SPIKE Policy enforcement cases; original content is restricted by owner RLS and admin security-definer RPCs.';
comment on table public.spike_policy_appeals is 'Canonical SPIKE Policy appeals linked to an enforcement case.';
