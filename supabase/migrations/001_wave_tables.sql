-- WAVE tables: scoped by device_id (browser-generated UUID, passed via X-Wave-Device-Id).
-- Run this in the Supabase SQL editor (or via Supabase CLI) before using the app.

create table if not exists public.wave_sessions (
  id uuid primary key,
  device_id text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  intensity_start integer not null,
  intensity_end integer,
  trigger text not null,
  med_status text not null,
  med_type text not null,
  body_location text,
  completed boolean not null default false,
  journal_note text,
  next_step_choice text,
  inserted_at timestamptz not null default now()
);

create index if not exists wave_sessions_device_started_idx
  on public.wave_sessions (device_id, started_at desc);

create table if not exists public.wave_med_profiles (
  device_id text primary key,
  med_type text not null,
  usual_dose_time text not null,
  on_vivitrol_week integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.wave_user_prefs (
  device_id text primary key,
  prefs jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: only the service/secret role (used by Next.js API) bypasses RLS.
alter table public.wave_sessions enable row level security;
alter table public.wave_med_profiles enable row level security;
alter table public.wave_user_prefs enable row level security;
