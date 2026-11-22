create or replace function public.spike_submit_identity_verification(p_document_type text,p_document_storage_path text,p_applicant_note text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private,auth,storage as $function$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
 if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_document_type not in ('national_id','drivers_license','voters_card','passport') or p_document_storage_path is null or length(p_document_storage_path) not between 5 and 500 then raise exception 'valid_document_metadata_required' using errcode='22023'; end if;
 if (storage.foldername(p_document_storage_path))[1]<>v_uid::text then raise exception 'identity_document_must_be_owned_by_user' using errcode='42501'; end if;
 if exists(select 1 from private.spike_identity_verification_requests where user_id=v_uid and status='approved') then raise exception 'identity_already_verified' using errcode='22023'; end if;
 if exists(select 1 from private.spike_identity_verification_requests where user_id=v_uid and status='pending_review') then raise exception 'verification_request_already_pending' using errcode='23505'; end if;
 insert into private.spike_identity_verification_requests(user_id,document_type,document_storage_path,applicant_note) values(v_uid,p_document_type,p_document_storage_path,left(p_applicant_note,500)) returning id into v_id;
 return v_id;
end $function$;
revoke all on function public.spike_submit_identity_verification(text,text,text) from public,anon;
grant execute on function public.spike_submit_identity_verification(text,text,text) to authenticated;
