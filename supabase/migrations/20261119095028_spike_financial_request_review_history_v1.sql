create or replace function public.spike_admin_list_financial_requests(p_kind text default 'all',p_status text default 'pending_review')
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,auth as $function$
begin
 if not private.is_admin() then raise exception 'owner_only' using errcode='42501'; end if;
 if p_kind not in ('all','withdrawals','identity') then raise exception 'invalid_request_kind' using errcode='22023'; end if;
 return jsonb_build_object(
 'withdrawals',case when p_kind in ('all','withdrawals') then coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'user_id',w.user_id,'amount_ngn',w.amount_ngn,'payout_details',w.payout_details,'status',w.status,'user_note',w.user_note,'admin_note',w.admin_note,'payment_reference',w.payment_reference,'created_at',w.created_at,'review_events',coalesce((select jsonb_agg(jsonb_build_object('decision',ev.decision,'admin_note',ev.admin_note,'payment_reference',ev.payment_reference,'actor_id',ev.actor_id,'created_at',ev.created_at) order by ev.created_at asc) from private.spike_financial_request_events ev where ev.request_kind='withdrawal' and ev.request_id=w.id),'[]'::jsonb)) order by w.created_at asc) from private.spike_withdrawal_requests w where p_status='all' or w.status=p_status),'[]'::jsonb) else '[]'::jsonb end,
 'identity_verification',case when p_kind in ('all','identity') then coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'user_id',v.user_id,'document_type',v.document_type,'document_storage_path',v.document_storage_path,'applicant_note',v.applicant_note,'status',v.status,'admin_note',v.admin_note,'created_at',v.created_at,'review_events',coalesce((select jsonb_agg(jsonb_build_object('decision',ev.decision,'admin_note',ev.admin_note,'actor_id',ev.actor_id,'created_at',ev.created_at) order by ev.created_at asc) from private.spike_financial_request_events ev where ev.request_kind='identity' and ev.request_id=v.id),'[]'::jsonb)) order by v.created_at asc) from private.spike_identity_verification_requests v where p_status='all' or v.status=p_status),'[]'::jsonb) else '[]'::jsonb end
 );
end $function$;
revoke all on function public.spike_admin_list_financial_requests(text,text) from public,anon;
grant execute on function public.spike_admin_list_financial_requests(text,text) to authenticated;
