-- SPIKE Impact campaign layer.
-- Additive only: existing mission tables/functions remain untouched.
-- Publishing is server-enforced: only profiles.verified users may create campaigns.

create table if not exists public.spike_impact_campaigns (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'community',
  title text not null,
  story text not null,
  help_type text not null default 'other',
  goal_amount numeric(12,2),
  goal_quantity integer,
  location_text text,
  image_url text,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spike_impact_campaigns_title_len check (char_length(trim(title)) between 8 and 140),
  constraint spike_impact_campaigns_story_len check (char_length(trim(story)) between 30 and 5000),
  constraint spike_impact_campaigns_help_type check (help_type in ('money','items','services','volunteers','other')),
  constraint spike_impact_campaigns_status check (status in ('published','closed','hidden')),
  constraint spike_impact_campaigns_goal check (
    (goal_amount is null or goal_amount > 0) and
    (goal_quantity is null or goal_quantity > 0) and
    (goal_amount is not null or goal_quantity is not null)
  )
);

create index if not exists spike_impact_campaigns_published_idx
  on public.spike_impact_campaigns(status, created_at desc);
create index if not exists spike_impact_campaigns_creator_idx
  on public.spike_impact_campaigns(creator_id, created_at desc);

revoke all on table public.spike_impact_campaigns from public, anon, authenticated;
grant select on table public.spike_impact_campaigns to authenticated;

create or replace function public.spike_impact_campaigns_list()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  out jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
  into out
  from (
    select c.id,c.creator_id,c.category,c.title,c.story,c.help_type,c.goal_amount,
           c.goal_quantity,c.location_text,c.image_url,c.status,c.created_at,
           p.display_name creator_name,p.username creator_username,p.avatar_url creator_avatar,
           p.verified creator_verified,
           (c.creator_id=uid) is_owner
    from public.spike_impact_campaigns c
    join public.profiles p on p.id=c.creator_id
    where c.status='published'
    limit 100
  ) x;

  return out;
end $$;

create or replace function public.spike_impact_campaign_create(
  p_category text,
  p_title text,
  p_story text,
  p_help_type text,
  p_goal_amount numeric default null,
  p_goal_quantity integer default null,
  p_location_text text default null,
  p_image_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  verified_user boolean;
begin
  if uid is null then raise exception 'Please sign in to publish an Impact campaign'; end if;
  select coalesce(verified,false) into verified_user from public.profiles where id=uid;
  if not coalesce(verified_user,false) then
    raise exception 'Only SPIKE Verified Badge users can publish Impact campaigns';
  end if;

  if char_length(trim(coalesce(p_title,''))) not between 8 and 140 then
    raise exception 'Give the campaign a clear title (8–140 characters)';
  end if;
  if char_length(trim(coalesce(p_story,''))) not between 30 and 5000 then
    raise exception 'Tell people clearly what help is needed (30–5000 characters)';
  end if;
  if p_help_type not in ('money','items','services','volunteers','other') then
    raise exception 'Choose a valid way people can help';
  end if;
  if coalesce(p_goal_amount,0) <= 0 and coalesce(p_goal_quantity,0) <= 0 then
    raise exception 'Add a target amount or quantity so people know what is needed';
  end if;

  insert into public.spike_impact_campaigns(
    creator_id,category,title,story,help_type,goal_amount,goal_quantity,location_text,image_url
  ) values (
    uid,coalesce(nullif(trim(p_category),''),'community'),trim(p_title),trim(p_story),p_help_type,
    case when p_goal_amount > 0 then round(p_goal_amount,2) else null end,
    case when p_goal_quantity > 0 then least(p_goal_quantity,1000000) else null end,
    nullif(trim(coalesce(p_location_text,'')),''),
    nullif(trim(coalesce(p_image_url,'')),'')
  ) returning id into cid;

  return jsonb_build_object('ok',true,'campaign_id',cid);
end $$;

revoke all on function public.spike_impact_campaigns_list() from public,anon;
grant execute on function public.spike_impact_campaigns_list() to authenticated;
revoke all on function public.spike_impact_campaign_create(text,text,text,text,numeric,integer,text,text) from public,anon;
grant execute on function public.spike_impact_campaign_create(text,text,text,text,numeric,integer,text,text) to authenticated;
