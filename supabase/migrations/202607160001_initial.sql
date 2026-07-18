-- Canonical v1 grid: H3 resolution 12. H3 calculations run in the Worker;
-- PostGIS is used only for geometry storage and viewport queries.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table public.grid_versions (
  id uuid primary key default gen_random_uuid(),
  h3_resolution smallint not null check (h3_resolution between 0 and 15),
  quality_policy_version smallint not null check (quality_policy_version > 0),
  activated_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (h3_resolution, quality_policy_version, activated_at)
);

insert into public.grid_versions (h3_resolution, quality_policy_version)
values (12, 1);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.walk_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  grid_version_id uuid not null references public.grid_versions (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  awarded_cell_count integer not null default 0 check (awarded_cell_count >= 0),
  check (ended_at is null or ended_at >= started_at)
);

create index walk_sessions_user_started_idx on public.walk_sessions (user_id, started_at desc);

-- A cell's geometry belongs here once, regardless of how many users unlock it.
create table public.h3_cells (
  h3_index text primary key check (h3_index ~ '^[0-9a-f]+$'),
  h3_resolution smallint not null check (h3_resolution between 0 and 15),
  boundary extensions.geometry(Polygon, 4326) not null,
  centroid extensions.geometry(Point, 4326) not null,
  created_at timestamptz not null default now(),
  check (extensions.st_isvalid(boundary)),
  check (extensions.st_srid(boundary) = 4326),
  check (extensions.st_srid(centroid) = 4326)
);

create index h3_cells_boundary_gist_idx on public.h3_cells using gist (boundary);

-- Immutable membership rows: do not update them when a user revisits a cell.
create table public.user_h3_cells (
  user_id uuid not null references public.profiles (id) on delete cascade,
  grid_version_id uuid not null references public.grid_versions (id),
  h3_index text not null references public.h3_cells (h3_index) on delete restrict,
  first_unlocked_at timestamptz not null default now(),
  first_walk_session_id uuid not null references public.walk_sessions (id) on delete restrict,
  primary key (user_id, grid_version_id, h3_index)
);

create index user_h3_cells_grid_h3_idx on public.user_h3_cells (grid_version_id, h3_index);

alter table public.profiles enable row level security;
alter table public.walk_sessions enable row level security;
alter table public.h3_cells enable row level security;
alter table public.user_h3_cells enable row level security;

create policy "Users read their profile" on public.profiles for select using (id = auth.uid());
create policy "Users read their sessions" on public.walk_sessions for select using (user_id = auth.uid());
create policy "Users read their cells" on public.user_h3_cells for select using (user_id = auth.uid());
create policy "Users read shared cell geometry" on public.h3_cells for select using (
  exists (
    select 1 from public.user_h3_cells memberships
    where memberships.h3_index = h3_cells.h3_index and memberships.user_id = auth.uid()
  )
);

-- Called only by the Worker service role after it verifies the user's JWT.
create or replace function public.start_walk_session(p_user_id uuid)
returns public.walk_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_grid_id uuid;
  session public.walk_sessions;
begin
  insert into public.profiles (id) values (p_user_id) on conflict do nothing;

  select id into current_grid_id
  from public.grid_versions
  where retired_at is null and h3_resolution = 12
  order by activated_at desc
  limit 1;

  if current_grid_id is null then
    raise exception 'No active resolution-12 grid version';
  end if;

  insert into public.walk_sessions (user_id, grid_version_id)
  values (p_user_id, current_grid_id)
  returning * into session;
  return session;
end;
$$;

create or replace function public.award_h3_cells(
  p_user_id uuid,
  p_session_id uuid,
  p_cells jsonb
)
returns table (h3_index text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  session_grid_id uuid;
begin
  select grid_version_id into session_grid_id
  from public.walk_sessions
  where id = p_session_id and user_id = p_user_id and ended_at is null;

  if session_grid_id is null then
    raise exception 'Active walk session not found';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_cells) cell
    where coalesce(cell->>'h3Index', '') !~ '^[0-9a-f]+$'
  ) then
    raise exception 'Invalid H3 index';
  end if;

  insert into public.h3_cells (h3_index, h3_resolution, boundary, centroid)
  select
    cell->>'h3Index',
    12,
    st_setsrid(st_geomfromgeojson(cell->'boundary'), 4326)::extensions.geometry(Polygon, 4326),
    st_setsrid(st_geomfromgeojson(cell->'centroid'), 4326)::extensions.geometry(Point, 4326)
  from jsonb_array_elements(p_cells) cell
  on conflict (h3_index) do nothing;

  return query
  with inserted as (
    insert into public.user_h3_cells (user_id, grid_version_id, h3_index, first_walk_session_id)
    select p_user_id, session_grid_id, cell->>'h3Index', p_session_id
    from jsonb_array_elements(p_cells) cell
    on conflict do nothing
    returning public.user_h3_cells.h3_index
  ), counted as (
    update public.walk_sessions
    set awarded_cell_count = awarded_cell_count + (select count(*) from inserted)
    where id = p_session_id
  )
  select inserted.h3_index from inserted;
end;
$$;

create or replace function public.end_walk_session(p_user_id uuid, p_session_id uuid)
returns public.walk_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session public.walk_sessions;
begin
  update public.walk_sessions
  set ended_at = coalesce(ended_at, now())
  where id = p_session_id and user_id = p_user_id
  returning * into session;

  if session.id is null then
    raise exception 'Walk session not found';
  end if;
  return session;
end;
$$;

create or replace function public.visible_user_h3_cells(
  p_user_id uuid,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision
)
returns table (h3_index text)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select membership.h3_index
  from public.user_h3_cells membership
  join public.h3_cells cell on cell.h3_index = membership.h3_index
  where membership.user_id = p_user_id
    and cell.boundary && st_makeenvelope(p_west, p_south, p_east, p_north, 4326);
$$;

revoke all on function public.start_walk_session(uuid) from public;
revoke all on function public.award_h3_cells(uuid, uuid, jsonb) from public;
revoke all on function public.end_walk_session(uuid, uuid) from public;
revoke all on function public.visible_user_h3_cells(uuid, double precision, double precision, double precision, double precision) from public;
grant execute on function public.start_walk_session(uuid) to service_role;
grant execute on function public.award_h3_cells(uuid, uuid, jsonb) to service_role;
grant execute on function public.end_walk_session(uuid, uuid) to service_role;
grant execute on function public.visible_user_h3_cells(uuid, double precision, double precision, double precision, double precision) to service_role;
