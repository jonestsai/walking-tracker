-- City attribution is deliberately separate from an unlock. H3 cells are stable,
-- while the supported-city roster and legal boundaries can change over time.
create table public.city_boundary_catalogs (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  source_description text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create unique index city_boundary_catalogs_one_active_idx
  on public.city_boundary_catalogs ((is_active)) where is_active;

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.city_boundary_catalogs (id) on delete cascade,
  country_code char(2) not null check (country_code in ('US', 'CA')),
  subdivision_code text not null,
  source_id text not null,
  name text not null,
  geometry extensions.geometry(MultiPolygon, 4326) not null,
  is_supported boolean not null default true,
  created_at timestamptz not null default now(),
  unique (catalog_id, country_code, source_id),
  check (extensions.st_isvalid(geometry)),
  check (extensions.st_srid(geometry) = 4326)
);

create index cities_supported_geometry_gist_idx
  on public.cities using gist (geometry) where is_supported;

-- Boundary loaders use this narrow RPC after extracting the chosen official
-- feature. It keeps the catalog import idempotent and rejects invalid geometry.
create or replace function public.upsert_supported_city_boundary(
  p_catalog_version text,
  p_country_code char(2),
  p_subdivision_code text,
  p_source_id text,
  p_name text,
  p_geometry jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_catalog_id uuid;
  city_geometry extensions.geometry(MultiPolygon, 4326);
  result_city_id uuid;
begin
  select id into target_catalog_id
  from public.city_boundary_catalogs
  where version = p_catalog_version;
  if target_catalog_id is null then
    raise exception 'Unknown city boundary catalog: %', p_catalog_version;
  end if;

  city_geometry := extensions.st_multi(
    extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry), 4326))
  )::extensions.geometry(MultiPolygon, 4326);
  if extensions.st_isempty(city_geometry) or not extensions.st_isvalid(city_geometry) then
    raise exception 'City geometry must be a valid, non-empty polygon';
  end if;

  insert into public.cities (catalog_id, country_code, subdivision_code, source_id, name, geometry, is_supported)
  values (target_catalog_id, p_country_code, p_subdivision_code, p_source_id, p_name, city_geometry, true)
  on conflict (catalog_id, country_code, source_id) do update
  set subdivision_code = excluded.subdivision_code,
      name = excluded.name,
      geometry = excluded.geometry,
      is_supported = true
  returning id into result_city_id;
  return result_city_id;
end;
$$;

-- One row is materialized for every observed H3 cell in every catalog, including
-- an explicit unassigned result. That lets us distinguish "not checked" from
-- "outside the supported roster" and makes imports/backfills idempotent.
create table public.h3_cell_city_assignments (
  catalog_id uuid not null references public.city_boundary_catalogs (id) on delete cascade,
  h3_index text not null references public.h3_cells (h3_index) on delete cascade,
  city_id uuid references public.cities (id) on delete restrict,
  assignment_status text not null check (assignment_status in ('assigned', 'unassigned')),
  assigned_at timestamptz not null default now(),
  primary key (catalog_id, h3_index),
  check (
    (assignment_status = 'assigned' and city_id is not null)
    or (assignment_status = 'unassigned' and city_id is null)
  )
);

create index h3_cell_city_assignments_city_idx
  on public.h3_cell_city_assignments (catalog_id, city_id) where city_id is not null;

alter table public.city_boundary_catalogs enable row level security;
alter table public.cities enable row level security;
alter table public.h3_cell_city_assignments enable row level security;

-- The first catalog exists before its boundary import so new tiles receive an
-- explicit unassigned result until the loader populates its supported cities.
insert into public.city_boundary_catalogs (version, source_description, is_active, activated_at)
values (
  'north-america-municipal-2025-v1',
  'US Census TIGER/Line 2025 incorporated places and Statistics Canada 2025 Census Subdivisions',
  true,
  now()
);

create or replace function public.assign_h3_cells_to_active_city_catalog(p_h3_indexes text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_catalog_id uuid;
begin
  select id into active_catalog_id
  from public.city_boundary_catalogs
  where is_active
  limit 1;

  if active_catalog_id is null or coalesce(array_length(p_h3_indexes, 1), 0) = 0 then
    return;
  end if;

  delete from public.h3_cell_city_assignments
  where catalog_id = active_catalog_id and h3_index = any(p_h3_indexes);

  insert into public.h3_cell_city_assignments (catalog_id, h3_index, city_id, assignment_status)
  select
    active_catalog_id,
    cell.h3_index,
    matched_city.id,
    case when matched_city.id is null then 'unassigned' else 'assigned' end
  from public.h3_cells cell
  left join lateral (
    select city.id
    from public.cities city
    where city.catalog_id = active_catalog_id
      and city.is_supported
      and extensions.st_covers(city.geometry, cell.centroid)
    order by city.id
    limit 1
  ) matched_city on true
  where cell.h3_index = any(p_h3_indexes);
end;
$$;

-- Call after loading or updating a catalog. Passing no argument refreshes the
-- active catalog; a catalog id supports validating a new catalog before launch.
create or replace function public.refresh_h3_cell_city_assignments(p_catalog_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_catalog_id uuid;
  assigned_count bigint;
begin
  if p_catalog_id is null then
    select id into target_catalog_id from public.city_boundary_catalogs where is_active limit 1;
  else
    select id into target_catalog_id from public.city_boundary_catalogs where id = p_catalog_id;
  end if;

  if target_catalog_id is null then
    raise exception 'No city boundary catalog found';
  end if;

  delete from public.h3_cell_city_assignments where catalog_id = target_catalog_id;

  insert into public.h3_cell_city_assignments (catalog_id, h3_index, city_id, assignment_status)
  select
    target_catalog_id,
    cell.h3_index,
    matched_city.id,
    case when matched_city.id is null then 'unassigned' else 'assigned' end
  from public.h3_cells cell
  left join lateral (
    select city.id
    from public.cities city
    where city.catalog_id = target_catalog_id
      and city.is_supported
      and extensions.st_covers(city.geometry, cell.centroid)
    order by city.id
    limit 1
  ) matched_city on true;

  get diagnostics assigned_count = row_count;
  return assigned_count;
end;
$$;

-- Run this before activating a newly loaded catalog. Touching boundaries are
-- expected; only area overlap makes a centroid assignment ambiguous.
create or replace function public.city_boundary_overlap_issues(p_catalog_id uuid)
returns table (
  first_city_id uuid,
  first_city_name text,
  second_city_id uuid,
  second_city_name text
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select first_city.id, first_city.name, second_city.id, second_city.name
  from public.cities first_city
  join public.cities second_city
    on second_city.catalog_id = first_city.catalog_id
   and second_city.id > first_city.id
   and second_city.is_supported
   and first_city.is_supported
   and extensions.st_intersects(first_city.geometry, second_city.geometry)
   and not extensions.st_touches(first_city.geometry, second_city.geometry)
  where first_city.catalog_id = p_catalog_id;
$$;

-- Attribute existing cells immediately. Run the same function again after the
-- roster/boundaries are imported to turn applicable unassigned cells into cities.
select public.refresh_h3_cell_city_assignments();

create or replace function public.user_city_progress(p_user_id uuid)
returns table (
  city_id uuid,
  city_name text,
  country_code char(2),
  subdivision_code text,
  tile_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    city.id,
    city.name,
    city.country_code,
    city.subdivision_code,
    count(*)::bigint as tile_count
  from public.user_h3_cells membership
  join public.city_boundary_catalogs catalog on catalog.is_active
  join public.h3_cell_city_assignments assignment
    on assignment.catalog_id = catalog.id and assignment.h3_index = membership.h3_index
  join public.cities city on city.id = assignment.city_id
  where membership.user_id = p_user_id
    and assignment.assignment_status = 'assigned'
  group by city.id, city.name, city.country_code, city.subdivision_code
  order by tile_count desc, city.name asc;
$$;

-- Extend the existing award RPC so every canonical cell is assigned (or marked
-- unassigned) once its geometry is known.
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
  cell_indexes text[];
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
  on conflict on constraint h3_cells_pkey do nothing;

  select array_agg(distinct cell->>'h3Index') into cell_indexes
  from jsonb_array_elements(p_cells) cell;
  perform public.assign_h3_cells_to_active_city_catalog(cell_indexes);

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

revoke all on function public.assign_h3_cells_to_active_city_catalog(text[]) from public;
revoke all on function public.refresh_h3_cell_city_assignments(uuid) from public;
revoke all on function public.user_city_progress(uuid) from public;
revoke all on function public.upsert_supported_city_boundary(text, char(2), text, text, text, jsonb) from public;
revoke all on function public.city_boundary_overlap_issues(uuid) from public;
grant execute on function public.assign_h3_cells_to_active_city_catalog(text[]) to service_role;
grant execute on function public.refresh_h3_cell_city_assignments(uuid) to service_role;
grant execute on function public.user_city_progress(uuid) to service_role;
grant execute on function public.upsert_supported_city_boundary(text, char(2), text, text, text, jsonb) to service_role;
grant execute on function public.city_boundary_overlap_issues(uuid) to service_role;
