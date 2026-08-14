-- edittruyenqt: Base44 -> Supabase schema
-- Documentation of the intended schema, mirroring the old base44/entities/*.jsonc
-- files. Run this once in Supabase Dashboard -> SQL Editor to apply it —
-- editing this file alone does not push anything to the live project.

create extension if not exists pgcrypto;

-- ── updated_date trigger helper ────────────────────────────────────────────
create or replace function public.set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- ── projects ────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  source_language text default 'Trung',
  cover_emoji text default '📚',
  custom_field_definitions jsonb not null default '[]',
  batch_rules jsonb not null default '[]',
  pronoun_rules jsonb not null default '[]',
  contextual_pronoun_rules jsonb not null default '[]',
  visible_columns jsonb not null default '["raw","qt","edited"]',
  -- text, not a uuid FK: the app writes "" (not null) to mean "no preset
  -- selected" (Workspace.jsx's handleSelectPreset/handleDeletePreset), which
  -- a uuid column would reject.
  active_preset_id text default '',
  style_toggles jsonb not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "own rows" on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_projects_updated_date
  before update on public.projects
  for each row execute function public.set_updated_date();

-- ── chapters ────────────────────────────────────────────────────────────
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  -- double precision, not integer: chapter reordering writes fractional
  -- midpoint values (e.g. (prevOrder + nextOrder) / 2) so a drag only ever
  -- costs one row write instead of renumbering every chapter.
  chapter_order double precision not null default 0,
  raw_original text default '',
  qt_raw text default '',
  edited text default '',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.chapters enable row level security;

create policy "own rows" on public.chapters
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_chapters_updated_date
  before update on public.chapters
  for each row execute function public.set_updated_date();

create index idx_chapters_project_order on public.chapters(project_id, chapter_order);

-- ── glossary_terms ──────────────────────────────────────────────────────
create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_term text not null,
  translation text not null,
  category text default 'Khác',
  notes text default '',
  custom_fields jsonb not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.glossary_terms enable row level security;

create policy "own rows" on public.glossary_terms
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_glossary_terms_updated_date
  before update on public.glossary_terms
  for each row execute function public.set_updated_date();

create index idx_glossary_terms_project_id on public.glossary_terms(project_id);

-- ── prompt_presets ──────────────────────────────────────────────────────
create table public.prompt_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  genres jsonb not null default '[]',
  setting_era text default '',
  character_notes jsonb not null default '[]',
  prompt_instructions text not null,
  forbidden_words jsonb not null default '[]',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.prompt_presets enable row level security;

create policy "own rows" on public.prompt_presets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_prompt_presets_updated_date
  before update on public.prompt_presets
  for each row execute function public.set_updated_date();

-- ── roleplay studio (AI-generated branching game authoring data) ──────────
-- Added after the 2026-08-14 "no Supabase, portable" upgrade turned out to
-- be the wrong tradeoff for the AUTHORING side: an in-progress generation
-- (or a finished draft the author hasn't exported yet) needs to survive a
-- browser clear / device switch / new tab, so it belongs server-side like
-- everything else in this app. The player-facing save/resume progress
-- (src/lib/roleplay/progress.js, separate localStorage keys) is unaffected
-- by this — that one's the READER's own play-through state on their own
-- device, which is exactly the "no account needed" case the portable design
-- was actually meant for, so it stays local by design.
-- Table order matters here: roleplay_generation_runs FK-references both of
-- the other two tables, so it has to be created last.
create table if not exists public.roleplay_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_ids jsonb not null default '[]',
  source_hash text not null,
  lore_rules_hash text not null,
  analyzer_version text not null default 'context-v1',
  status text not null default 'ready',
  analysis jsonb not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.roleplay_analyses enable row level security;

drop policy if exists "own rows" on public.roleplay_analyses;
create policy "own rows" on public.roleplay_analyses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_roleplay_analyses_updated_date on public.roleplay_analyses;
create trigger trg_roleplay_analyses_updated_date
  before update on public.roleplay_analyses
  for each row execute function public.set_updated_date();

-- Matches RoleplayAnalysis.findCached's lookup exactly (project + content
-- hash + rules hash + analyzer version) — this is a cache-hit check on
-- every generation run, worth indexing.
create index if not exists idx_roleplay_analyses_lookup on public.roleplay_analyses(project_id, source_hash, lore_rules_hash, analyzer_version);

create table if not exists public.roleplay_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  analysis_id uuid references public.roleplay_analyses(id) on delete set null,
  title text not null default '',
  status text not null default 'draft',
  source_chapter_ids jsonb not null default '[]',
  source_hash text default '',
  pack jsonb not null default '{}',
  validation_report jsonb not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.roleplay_scenarios enable row level security;

drop policy if exists "own rows" on public.roleplay_scenarios;
create policy "own rows" on public.roleplay_scenarios
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_roleplay_scenarios_updated_date on public.roleplay_scenarios;
create trigger trg_roleplay_scenarios_updated_date
  before update on public.roleplay_scenarios
  for each row execute function public.set_updated_date();

create index if not exists idx_roleplay_scenarios_project_id on public.roleplay_scenarios(project_id);

-- step_state is deliberately NOT used to log each step's full AI output —
-- src/lib/roleplay/generator.js tracks progress via an in-memory callback
-- only (this table is never read back anywhere in the app, only
-- created/updated/deleted), so persisting the running generation's full
-- content here would just be a second, write-only copy of everything that
-- ends up in roleplay_scenarios.pack. The row itself is deleted once the
-- scenario saves successfully; a failed row is kept (small) for debugging.
create table if not exists public.roleplay_generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'running',
  current_step text default '',
  step_state jsonb not null default '{}',
  provider text default '',
  model text default '',
  prompt_versions jsonb not null default '{}',
  analysis_id uuid references public.roleplay_analyses(id) on delete set null,
  scenario_id uuid references public.roleplay_scenarios(id) on delete set null,
  error jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.roleplay_generation_runs enable row level security;

drop policy if exists "own rows" on public.roleplay_generation_runs;
create policy "own rows" on public.roleplay_generation_runs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_roleplay_generation_runs_updated_date on public.roleplay_generation_runs;
create trigger trg_roleplay_generation_runs_updated_date
  before update on public.roleplay_generation_runs
  for each row execute function public.set_updated_date();

create index if not exists idx_roleplay_generation_runs_project_id on public.roleplay_generation_runs(project_id);

-- ── temporary Wattpad transfer packages ───────────────────────────────
-- Server-only table: no public RLS policy. A transfer can be redeemed once;
-- the API deletes its row immediately after a successful redemption.
create table if not exists public.wattpad_transfers (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.wattpad_transfers enable row level security;
create index if not exists idx_wattpad_transfers_expires_at on public.wattpad_transfers(expires_at);
