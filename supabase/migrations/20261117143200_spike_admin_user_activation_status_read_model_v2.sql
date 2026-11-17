-- Follow-up attempt to derive the explicit suspension state from the latest administrator activation audit record.
do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 if position('account_suspended' in d)=0 then
  d:=replace(d,
   '  return coalesce(v_result,',
   '  v_result:=jsonb_set(v_result,''{account_suspended}'',to_jsonb(coalesce((select (a.details->''after''->>''activated'')::boolean=false from public.admin_audit a where a.target_user_id=p_user_id and a.action=''user_activation'' order by a.created_at desc,a.id desc limit 1),false)),true);'||chr(10)||'  return coalesce(v_result,');
 end if;
 execute d;
end;
$block$;
