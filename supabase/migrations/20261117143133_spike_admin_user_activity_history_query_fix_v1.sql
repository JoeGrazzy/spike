-- Fix the initial user activity aggregate's outer ORDER BY and preserve the complete tracked history.
do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 d:=replace(d,'order by a.at desc limit 200','');
 d:=replace(d,'limit 100','');
 d:=replace(d,'limit 200','');
 execute d;
end;
$block$;
