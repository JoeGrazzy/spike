create table if not exists public.post_locations (
  post_id uuid primary key references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);
create index if not exists post_locations_author_idx on public.post_locations(author_id);
alter table public.post_locations enable row level security;
drop policy if exists "Public can read locations for public published posts" on public.post_locations;
create policy "Public can read locations for public published posts"
on public.post_locations for select to authenticated
using (exists (select 1 from public.posts p where p.id = post_locations.post_id and p.author_id = post_locations.author_id and p.visibility = 'public' and p.status = 'published'));
drop policy if exists "Authors can tag their own posts with location" on public.post_locations;
create policy "Authors can tag their own posts with location"
on public.post_locations for insert to authenticated
with check (author_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_locations.post_id and p.author_id = (select auth.uid()) and p.visibility = 'public' and p.status = 'published'));
drop policy if exists "Authors can remove their own post locations" on public.post_locations;
create policy "Authors can remove their own post locations"
on public.post_locations for delete to authenticated
using (author_id = (select auth.uid()));
grant select, insert, delete on public.post_locations to authenticated;

create or replace function public.spike_nearby_posts(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 25000,
  p_limit integer default 50
)
returns table (
  id uuid, author_id uuid, body text, visibility text, comments_enabled boolean,
  status text, created_at timestamptz, distance_meters double precision
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with origin as (select radians(p_latitude) as lat, radians(p_longitude) as lon)
  select p.id, p.author_id, p.body, p.visibility, p.comments_enabled, p.status, p.created_at,
    6371000 * 2 * asin(sqrt(least(1::double precision, greatest(0::double precision,
      power(sin((radians(l.latitude) - o.lat) / 2), 2) +
      cos(o.lat) * cos(radians(l.latitude)) * power(sin((radians(l.longitude) - o.lon) / 2), 2)
    )))) as distance_meters
  from public.post_locations l
  join public.posts p on p.id = l.post_id
  cross join origin o
  where p_latitude between -90 and 90 and p_longitude between -180 and 180
    and p.visibility = 'public' and p.status = 'published'
    and 6371000 * 2 * asin(sqrt(least(1::double precision, greatest(0::double precision,
      power(sin((radians(l.latitude) - o.lat) / 2), 2) +
      cos(o.lat) * cos(radians(l.latitude)) * power(sin((radians(l.longitude) - o.lon) / 2), 2)
    )))) <= greatest(100, least(coalesce(p_radius_meters, 25000), 50000))
  order by distance_meters asc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.spike_nearby_posts(double precision,double precision,integer,integer) from public, anon;
grant execute on function public.spike_nearby_posts(double precision,double precision,integer,integer) to authenticated;
