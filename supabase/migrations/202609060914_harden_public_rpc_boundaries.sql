-- SPIKE security/performance hardening applied to production.
-- Event ticket pricing is server-derived; event requests are membership-bound;
-- event claims use event_id; share increments are fixed to one per call.

create or replace function public.increment_post_share_count(p_post_id text, p_count integer default 1)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.app_documents; v_data jsonb; v_count integer; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_count is distinct from 1 then raise exception 'Share count increment must be exactly 1'; end if;
  select * into v_row from public.app_documents where path='posts/'||p_post_id and collection_name='posts' for update;
  if not found or coalesce((v_row.data->>'deleted')::boolean,false) then raise exception 'Post not found'; end if;
  v_data:=coalesce(v_row.data,'{}'::jsonb);
  v_count:=least(2147483647,coalesce(nullif(v_data->>'shareCount','')::integer,nullif(v_data->>'shares','')::integer,0)+1);
  v_data:=jsonb_set(v_data,'{shareCount}',to_jsonb(v_count),true);
  update public.app_documents set data=v_data,updated_at=now() where path=v_row.path;
  return jsonb_build_object('shareCount',v_count,'data',v_data);
end; $$;
revoke execute on function public.increment_post_share_count(text,integer) from public, anon;
grant execute on function public.increment_post_share_count(text,integer) to authenticated;

create or replace function public.room_create_event_purchase_request(p_event_id uuid, p_payment_method text default 'whatsapp')
returns public.room_purchase_requests language plpgsql security definer set search_path = public as $$
declare v_user uuid:=auth.uid(); v_event public.room_events; v_out public.room_purchase_requests;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_payment_method not in ('whatsapp','bank_transfer','crypto','ussd') then raise exception 'Unsupported payment method'; end if;
  select * into v_event from public.room_events where id=p_event_id and starts_at>now();
  if not found then raise exception 'Event not found or already started'; end if;
  if not public.is_room_member(v_event.room_id) then raise exception 'Room membership required'; end if;
  if v_event.ticket_price_minor < 0 then raise exception 'Invalid event price'; end if;
  insert into public.room_purchase_requests(user_id,room_id,item_type,item_id,item_name,coin_amount,fiat_amount_minor,currency,payment_method,event_id,status)
  values(v_user,v_event.room_id,'event_ticket',v_event.id,v_event.title,0,v_event.ticket_price_minor,v_event.ticket_currency,p_payment_method,v_event.id,'pending')
  returning * into v_out; return v_out;
end; $$;
revoke execute on function public.room_create_event_purchase_request(uuid,text) from public, anon;
grant execute on function public.room_create_event_purchase_request(uuid,text) to authenticated;

create or replace function public.room_claim_event_ticket(p_request_id uuid)
returns public.room_event_tickets language plpgsql security definer set search_path = public as $$
declare v_req public.room_purchase_requests; v_event public.room_events; v_ticket public.room_event_tickets;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_req from public.room_purchase_requests where id=p_request_id and user_id=auth.uid() and status='approved' and item_type='event_ticket';
  if not found then raise exception 'Approved event purchase not found'; end if;
  if v_req.event_id is not null then select * into v_event from public.room_events where id=v_req.event_id and room_id=v_req.room_id;
  else select * into v_event from public.room_events where room_id=v_req.room_id and title=v_req.item_name order by created_at desc limit 1; end if;
  if not found then raise exception 'Event no longer available'; end if;
  insert into public.room_event_tickets(event_id,user_id,purchase_request_id) values(v_event.id,auth.uid(),v_req.id)
  on conflict(event_id,user_id) do update set purchase_request_id=excluded.purchase_request_id returning * into v_ticket;
  return v_ticket;
end; $$;
revoke execute on function public.room_claim_event_ticket(uuid) from public, anon;
grant execute on function public.room_claim_event_ticket(uuid) to authenticated;

create index if not exists idx_room_events_room_starts_at on public.room_events(room_id,starts_at);
create index if not exists idx_room_purchase_requests_user_status on public.room_purchase_requests(user_id,status);
create index if not exists idx_room_purchase_requests_event_id on public.room_purchase_requests(event_id);
create index if not exists idx_gamification_weekly_completions_challenge_id on public.gamification_weekly_completions(challenge_id);
