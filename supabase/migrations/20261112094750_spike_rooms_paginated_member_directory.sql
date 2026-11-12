-- Privacy-safe paginated active Room member directory.
create or replace function public.room_public_members_page(
  p_room_id uuid,p_limit integer default 100,p_offset integer default 0
) returns table(user_id uuid,role text,joined_at timestamptz)
language sql stable set search_path = pg_catalog, public as $function$
  select m.user_id,m.role,m.joined_at
  from public.room_members m
  where m.room_id=p_room_id and m.active=true
    and exists(select 1 from public.room_members self where self.room_id=p_room_id and self.user_id=(select auth.uid()) and self.active=true)
    and exists(select 1 from public.rooms r where r.id=p_room_id and r.active=true)
  order by case when m.role='owner' then 0 when m.role='admin' then 1 when m.role='moderator' then 2 else 3 end,m.joined_at asc
  limit greatest(1,least(coalesce(p_limit,100),100)) offset greatest(0,coalesce(p_offset,0));
$function$;
revoke all on function public.room_public_members_page(uuid,integer,integer) from public;
grant execute on function public.room_public_members_page(uuid,integer,integer) to authenticated;
comment on function public.room_public_members_page(uuid,integer,integer) is 'Privacy-safe paginated active Room member directory for current members.';
