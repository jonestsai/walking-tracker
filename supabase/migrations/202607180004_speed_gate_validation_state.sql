-- The Worker keeps only the one fix needed to validate the next upload. This
-- state is removed when the Walk ends; it is not a route-history table.
create table public.walk_session_validation_state (
  session_id uuid primary key references public.walk_sessions (id) on delete cascade,
  latitude double precision,
  longitude double precision,
  horizontal_accuracy double precision,
  recorded_at timestamptz,
  unlocking_status text not null default 'unlocking'
    check (unlocking_status in ('unlocking', 'paused_for_speed')),
  last_speed_kph double precision,
  updated_at timestamptz not null default now(),
  check (
    (latitude is null and longitude is null and horizontal_accuracy is null and recorded_at is null)
    or (latitude is not null and longitude is not null and horizontal_accuracy is not null and recorded_at is not null)
  )
);

alter table public.walk_session_validation_state enable row level security;

create or replace function public.walk_session_validation_state(
  p_user_id uuid,
  p_session_id uuid
)
returns table (
  latitude double precision,
  longitude double precision,
  horizontal_accuracy double precision,
  recorded_at timestamptz,
  unlocking_status text,
  last_speed_kph double precision
)
language sql
security definer
set search_path = public
stable
as $$
  select state.latitude, state.longitude, state.horizontal_accuracy, state.recorded_at,
    state.unlocking_status, state.last_speed_kph
  from public.walk_session_validation_state state
  join public.walk_sessions session on session.id = state.session_id
  where state.session_id = p_session_id
    and session.user_id = p_user_id
    and session.ended_at is null;
$$;

create or replace function public.save_walk_session_validation_state(
  p_user_id uuid,
  p_session_id uuid,
  p_last_fix jsonb,
  p_unlocking_status text,
  p_last_speed_kph double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_unlocking_status not in ('unlocking', 'paused_for_speed') then
    raise exception 'Invalid unlocking status';
  end if;

  if not exists (
    select 1 from public.walk_sessions
    where id = p_session_id and user_id = p_user_id and ended_at is null
  ) then
    raise exception 'Active walk session not found';
  end if;

  insert into public.walk_session_validation_state (
    session_id, latitude, longitude, horizontal_accuracy, recorded_at,
    unlocking_status, last_speed_kph, updated_at
  ) values (
    p_session_id,
    case when p_last_fix is null then null else (p_last_fix->>'latitude')::double precision end,
    case when p_last_fix is null then null else (p_last_fix->>'longitude')::double precision end,
    case when p_last_fix is null then null else (p_last_fix->>'horizontalAccuracy')::double precision end,
    case when p_last_fix is null then null else (p_last_fix->>'timestamp')::timestamptz end,
    p_unlocking_status,
    p_last_speed_kph,
    now()
  )
  on conflict (session_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    horizontal_accuracy = excluded.horizontal_accuracy,
    recorded_at = excluded.recorded_at,
    unlocking_status = excluded.unlocking_status,
    last_speed_kph = excluded.last_speed_kph,
    updated_at = excluded.updated_at;
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

  delete from public.walk_session_validation_state where session_id = p_session_id;
  return session;
end;
$$;

revoke all on function public.walk_session_validation_state(uuid, uuid) from public;
revoke all on function public.save_walk_session_validation_state(uuid, uuid, jsonb, text, double precision) from public;
grant execute on function public.walk_session_validation_state(uuid, uuid) to service_role;
grant execute on function public.save_walk_session_validation_state(uuid, uuid, jsonb, text, double precision) to service_role;
