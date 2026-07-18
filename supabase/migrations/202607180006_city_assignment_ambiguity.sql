-- Official municipal boundaries can overlap in shared water. Never award those
-- rare ambiguous areas to an arbitrary city: leave their H3 cells unassigned.
create or replace function public.assign_h3_cells_to_active_city_catalog(p_h3_indexes text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_catalog_id uuid;
begin
  select id into active_catalog_id from public.city_boundary_catalogs where is_active limit 1;
  if active_catalog_id is null or coalesce(array_length(p_h3_indexes, 1), 0) = 0 then return; end if;

  delete from public.h3_cell_city_assignments
  where catalog_id = active_catalog_id and h3_index = any(p_h3_indexes);

  insert into public.h3_cell_city_assignments (catalog_id, h3_index, city_id, assignment_status)
  select active_catalog_id, cell.h3_index, matched_city.id,
    case when matched_city.id is null then 'unassigned' else 'assigned' end
  from public.h3_cells cell
  left join lateral (
    select city.id
    from public.cities city
    where city.catalog_id = active_catalog_id
      and city.is_supported
      and extensions.st_covers(city.geometry, cell.centroid)
      and not exists (
        select 1 from public.cities competing_city
        where competing_city.catalog_id = active_catalog_id
          and competing_city.is_supported
          and competing_city.id <> city.id
          and extensions.st_covers(competing_city.geometry, cell.centroid)
      )
  ) matched_city on true
  where cell.h3_index = any(p_h3_indexes);
end;
$$;

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
  if target_catalog_id is null then raise exception 'No city boundary catalog found'; end if;

  delete from public.h3_cell_city_assignments where catalog_id = target_catalog_id;
  insert into public.h3_cell_city_assignments (catalog_id, h3_index, city_id, assignment_status)
  select target_catalog_id, cell.h3_index, matched_city.id,
    case when matched_city.id is null then 'unassigned' else 'assigned' end
  from public.h3_cells cell
  left join lateral (
    select city.id
    from public.cities city
    where city.catalog_id = target_catalog_id
      and city.is_supported
      and extensions.st_covers(city.geometry, cell.centroid)
      and not exists (
        select 1 from public.cities competing_city
        where competing_city.catalog_id = target_catalog_id
          and competing_city.is_supported
          and competing_city.id <> city.id
          and extensions.st_covers(competing_city.geometry, cell.centroid)
      )
  ) matched_city on true;
  get diagnostics assigned_count = row_count;
  return assigned_count;
end;
$$;

-- One vetted cross-border shared-water overlap exists in the 2025 launch data.
-- It remains visible to the generic validator as an approved exception, while
-- the functions above ensure it can never result in a city assignment.
create table public.city_boundary_overlap_exceptions (
  catalog_id uuid not null references public.city_boundary_catalogs (id) on delete cascade,
  first_city_id uuid not null references public.cities (id) on delete cascade,
  second_city_id uuid not null references public.cities (id) on delete cascade,
  reason text not null,
  primary key (catalog_id, first_city_id, second_city_id),
  check (first_city_id < second_city_id)
);

alter table public.city_boundary_overlap_exceptions enable row level security;

insert into public.city_boundary_overlap_exceptions (catalog_id, first_city_id, second_city_id, reason)
select catalog.id,
  case when detroit.id < windsor.id then detroit.id else windsor.id end,
  case when detroit.id < windsor.id then windsor.id else detroit.id end,
  'Official Detroit–Windsor shared-water overlap; ambiguous centroids remain unassigned.'
from public.city_boundary_catalogs catalog
join public.cities detroit on detroit.catalog_id = catalog.id and detroit.country_code = 'US' and detroit.source_id = '2622000'
join public.cities windsor on windsor.catalog_id = catalog.id and windsor.country_code = 'CA' and windsor.source_id = '3537039'
where catalog.version = 'north-america-municipal-2025-v1'
on conflict do nothing;

create or replace function public.city_boundary_overlap_issues(p_catalog_id uuid)
returns table (first_city_id uuid, first_city_name text, second_city_id uuid, second_city_name text)
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
  left join public.city_boundary_overlap_exceptions exception
    on exception.catalog_id = first_city.catalog_id
   and exception.first_city_id = first_city.id
   and exception.second_city_id = second_city.id
  where first_city.catalog_id = p_catalog_id
    and exception.catalog_id is null;
$$;

revoke all on function public.city_boundary_overlap_issues(uuid) from public;
grant execute on function public.city_boundary_overlap_issues(uuid) to service_role;

select public.refresh_h3_cell_city_assignments();
