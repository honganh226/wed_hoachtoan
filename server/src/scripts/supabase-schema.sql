-- Execute once in a private Supabase project; keys stay in Render Environment.
create table if not exists public.hoachtoan_state (
  id text primary key,
  revision bigint not null,
  payload text not null,
  write_id text,
  payload_hash text,
  updated_at timestamptz not null default now()
);
alter table public.hoachtoan_state add column if not exists write_id text;
alter table public.hoachtoan_state add column if not exists payload_hash text;
alter table public.hoachtoan_state enable row level security;
-- No public/anonymous policies. Only the backend service role can access snapshots.
revoke all on public.hoachtoan_state from anon, authenticated;
grant all on public.hoachtoan_state to service_role;
