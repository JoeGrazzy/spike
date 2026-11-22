begin;
create table if not exists private.spike_financial_request_events (
 id uuid primary key default gen_random_uuid(), request_kind text not null check(request_kind in ('identity','withdrawal')),
 request_id uuid not null, actor_id uuid not null references auth.users(id), decision text not null,
 admin_note text, payment_reference text, created_at timestamptz not null default now()
);
create index if not exists spike_financial_request_events_request_idx on private.spike_financial_request_events(request_kind,request_id,created_at desc);
alter table private.spike_financial_request_events enable row level security;
revoke all on private.spike_financial_request_events from public,anon,authenticated;
create or replace function public.spike_admin_review_financial_request(p_kind text,p_request_id uuid,p_decision text,p_admin_note text default null,p_payment_reference text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,private,auth as $function$
declare v_uid uuid := (select auth.uid()); v_rows integer; v_user_id uuid; v_status text;
begin
 if not private.is_admin() then raise exception 'owner_only' using errcode='42501'; end if;
 if p_request_id is null or p_kind not in ('withdrawal','identity') then raise exception 'invalid_request' using errcode='22023'; end if;
 if p_kind='withdrawal' then
  if p_decision not in ('approved','processing','paid','rejected') then raise exception 'invalid_withdrawal_decision' using errcode='22023'; end if;
  select user_id,status into v_user_id,v_status from private.spike_withdrawal_requests where id=p_request_id and status in ('pending_review','approved','processing') for update;
  if v_user_id is null then return false; end if;
  if p_decision='approved' and v_status<>'pending_review' then raise exception 'withdrawal_must_be_pending_to_approve' using errcode='22023'; end if;
  if p_decision='processing' and v_status<>'approved' then raise exception 'withdrawal_must_be_approved_before_processing' using errcode='22023'; end if;
  if p_decision='paid' then
   if v_status<>'processing' then raise exception 'withdrawal_must_be_processing_before_paid' using errcode='22023'; end if;
   if nullif(trim(coalesce(p_payment_reference,'')),'') is null then raise exception 'confirmed_payment_reference_required' using errcode='22023'; end if;
   update private.spike_creator_earnings e set status='paid' from private.spike_withdrawal_earning_allocations a where a.withdrawal_request_id=p_request_id and e.id=a.creator_earning_id and e.status='reserved';
   get diagnostics v_rows=row_count; if v_rows=0 then raise exception 'reserved_creator_earnings_not_found' using errcode='23514'; end if;
  elsif p_decision='rejected' then
   update private.spike_creator_earnings e set status='available' from private.spike_withdrawal_earning_allocations a where a.withdrawal_request_id=p_request_id and e.id=a.creator_earning_id and e.status='reserved';
  end if;
  update private.spike_withdrawal_requests set status=p_decision,admin_note=left(p_admin_note,1000),payment_reference=case when p_payment_reference is null then payment_reference else left(p_payment_reference,200) end,reviewed_by=v_uid,reviewed_at=now(),updated_at=now() where id=p_request_id;
  get diagnostics v_rows=row_count;
  if v_rows=1 then insert into private.spike_financial_request_events(request_kind,request_id,actor_id,decision,admin_note,payment_reference) values('withdrawal',p_request_id,v_uid,p_decision,left(p_admin_note,1000),left(p_payment_reference,200)); end if;
  return v_rows=1;
 else
  if p_decision not in ('approved','rejected','needs_resubmission') then raise exception 'invalid_identity_decision' using errcode='22023'; end if;
  update private.spike_identity_verification_requests set status=p_decision,admin_note=left(p_admin_note,1000),reviewed_by=v_uid,reviewed_at=now(),updated_at=now() where id=p_request_id and status='pending_review';
  get diagnostics v_rows=row_count;
  if v_rows=1 then insert into private.spike_financial_request_events(request_kind,request_id,actor_id,decision,admin_note) values('identity',p_request_id,v_uid,p_decision,left(p_admin_note,1000)); end if;
  -- Identity approval does not activate the separately paid SPIKE Verified badge.
  return v_rows=1;
 end if;
end $function$;
revoke all on function public.spike_admin_review_financial_request(text,uuid,text,text,text) from public,anon;
grant execute on function public.spike_admin_review_financial_request(text,uuid,text,text,text) to authenticated;
commit;
