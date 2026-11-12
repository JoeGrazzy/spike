create or replace function public.rooms_recommended(p_limit integer default 6)
returns table (
  id uuid, owner_id uuid, name text, description text, emoji text, category text, tags text[],
  avatar_url text, cover_url text, rules text, active boolean, featured boolean,
  created_at timestamptz, updated_at timestamptz, member_count bigint,
  recent_message_count bigint, score numeric, reason text
)
language sql
stable
security definer
set search_path = public
as $function$
with base as (
  select r.*,
    (select count(*) from public.room_members m where m.room_id=r.id and m.active=true) as member_count,
    (select count(*) from public.room_messages rm where rm.room_id=r.id and rm.created_at >= now()-interval '7 days') as recent_message_count,
    (select count(*) from public.room_messages rm where rm.room_id=r.id and rm.created_at >= now()-interval '24 hours') as today_message_count
  from public.rooms r
  where r.active=true
),
scored as (
  select b.*,
    round((
      least(35, ln(1+b.member_count)*9)
      + least(40, ln(1+b.recent_message_count)*10)
      + least(15, ln(1+b.today_message_count)*7)
      + case when b.featured then 10 else 0 end
    )::numeric,1) as rank_score
  from base b
)
select s.id,s.owner_id,s.name,s.description,s.emoji,s.category,s.tags,s.avatar_url,s.cover_url,s.rules,
       s.active,s.featured,s.created_at,s.updated_at,s.member_count,s.recent_message_count,s.rank_score,
       case
         when s.today_message_count >= 10 then 'Active now'
         when s.recent_message_count >= 10 then 'Popular this week'
         when s.member_count >= 10 then 'Growing community'
         else 'Worth discovering'
       end
from scored s
order by s.rank_score desc, s.updated_at desc
limit greatest(1,least(coalesce(p_limit,6),20));
$function$;
