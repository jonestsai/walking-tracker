-- `returns table (h3_index text)` creates a PL/pgSQL output variable named
-- h3_index. Qualifying the h3_cells primary-key conflict target by constraint
-- name avoids an ambiguity between that variable and the table column.
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
  on conflict on constraint h3_cells_pkey do nothing;

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
