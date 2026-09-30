-- Distributed fixed-window rate limiting for the Next API routes. The service
-- role calls `roomboard_rate_limit_hit` once per request; the function
-- atomically upserts the bucket and returns the count so the caller can
-- compare it against its limit.
--
-- First tracked migration: the rest of the schema was applied manually from
-- supabase/roomboard-schema.sql before migrations existed. Every statement
-- here is idempotent (if not exists / or replace), so pushing it onto a
-- project that already ran the manual schema is a no-op safety net.
create table if not exists public.roomboard_rate_limits (
  bucket text primary key,
  count integer not null,
  reset_at timestamptz not null
);

alter table public.roomboard_rate_limits enable row level security;

-- No RLS policies: only the service role touches this table.

create or replace function public.roomboard_rate_limit_hit(
  p_bucket text,
  p_window_ms bigint
)
returns table (count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.roomboard_rate_limits as rl (bucket, count, reset_at)
  values (p_bucket, 1, now() + (p_window_ms || ' milliseconds')::interval)
  on conflict (bucket) do update
    set count = case
      when rl.reset_at <= now() then 1
      else rl.count + 1
    end,
    reset_at = case
      when rl.reset_at <= now() then now() + (p_window_ms || ' milliseconds')::interval
      else rl.reset_at
    end
  returning rl.count, rl.reset_at;
end;
$$;

create or replace function public.roomboard_rate_limit_prune()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.roomboard_rate_limits where reset_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
