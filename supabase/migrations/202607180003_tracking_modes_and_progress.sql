-- Distinguish automatic foreground discovery from intentional background Walks.
alter table public.walk_sessions
  add column if not exists tracking_mode text not null default 'background_walk'
  check (tracking_mode in ('foreground_explore', 'background_walk'));

create or replace function public.start_tracking_session(
  p_user_id uuid,
  p_tracking_mode text
)
returns public.walk_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_grid_id uuid;
  session public.walk_sessions;
begin
  if p_tracking_mode not in ('foreground_explore', 'background_walk') then
    raise exception 'Invalid tracking mode';
  end if;

  insert into public.profiles (id) values (p_user_id) on conflict do nothing;

  select id into current_grid_id
  from public.grid_versions
  where retired_at is null and h3_resolution = 12
  order by activated_at desc
  limit 1;

  if current_grid_id is null then
    raise exception 'No active resolution-12 grid version';
  end if;

  insert into public.walk_sessions (user_id, grid_version_id, tracking_mode)
  values (p_user_id, current_grid_id, p_tracking_mode)
  returning * into session;
  return session;
end;
$$;

-- Preserve the original RPC for older Worker versions during rollout.
create or replace function public.start_walk_session(p_user_id uuid)
returns public.walk_sessions
language sql
security definer
set search_path = public
as $$
  select * from public.start_tracking_session(p_user_id, 'background_walk');
$$;

create or replace function public.user_progress_summary(p_user_id uuid)
returns table (
  total_tiles bigint,
  tiles_today bigint,
  current_streak integer
)
language sql
security definer
set search_path = public
stable
as $$
  with unlock_days as (
    select distinct first_unlocked_at::date as day
    from public.user_h3_cells
    where user_id = p_user_id
  ), streak_days as (
    with recursive chain(day) as (
      select current_date where exists (select 1 from unlock_days where day = current_date)
      union all
      select chain.day - 1
      from chain
      where exists (select 1 from unlock_days where day = chain.day - 1)
    )
    select count(*)::integer as count from chain
  )
  select
    (select count(*) from public.user_h3_cells where user_id = p_user_id),
    (select count(*) from public.user_h3_cells where user_id = p_user_id and first_unlocked_at::date = current_date),
    (select count from streak_days);
$$;

create or replace function public.recent_tracking_sessions(
  p_user_id uuid,
  p_limit integer default 8
)
returns table (
  id uuid,
  tracking_mode text,
  started_at timestamptz,
  ended_at timestamptz,
  awarded_cell_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select id, tracking_mode, started_at, ended_at, awarded_cell_count
  from public.walk_sessions
  where user_id = p_user_id
  order by started_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

revoke all on function public.start_tracking_session(uuid, text) from public;
revoke all on function public.user_progress_summary(uuid) from public;
revoke all on function public.recent_tracking_sessions(uuid, integer) from public;
grant execute on function public.start_tracking_session(uuid, text) to service_role;
grant execute on function public.user_progress_summary(uuid) to service_role;
grant execute on function public.recent_tracking_sessions(uuid, integer) to service_role;
