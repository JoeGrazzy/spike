-- Remove the stray outer ORDER BY from the JSON aggregate, retaining the aggregate's own ordering.
do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 d:=replace(d,'order by a.at desc','');
 d:=replace(d,'limit 100','');
 d:=replace(d,'limit 200','');
 execute d;
end;
$block$;
