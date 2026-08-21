-- Flowlytics / Design Test Hub - Supabase schema + RLS
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)

-- ============ TABLES ============

create table if not exists studies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  instructions text,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flows (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies(id) on delete cascade,
  name text,
  description text,
  figma_url text,
  -- Multiple prototype versions per flow: [{ "label": "v1", "url": "..." }, ...].
  -- figma_url is kept (unused going forward) for backward compatibility with
  -- rows created before this existed.
  figma_links jsonb not null default '[]'::jsonb,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  question_text text not null,
  question_type text not null,
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists test_sessions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies(id) on delete cascade,
  tester_name text,
  tester_email text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  current_flow int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions(id) on delete cascade,
  study_id uuid not null references studies(id) on delete cascade,
  flow_id uuid not null references flows(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  answer_text text,
  answer_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create table if not exists flow_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions(id) on delete cascade,
  flow_id uuid not null references flows(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz default now(),
  status text not null default 'completed',
  unique (session_id, flow_id)
);

create index if not exists idx_flows_study on flows(study_id);
create index if not exists idx_questions_flow on questions(flow_id);
create index if not exists idx_sessions_study on test_sessions(study_id);
create index if not exists idx_answers_session on answers(session_id);
create index if not exists idx_answers_flow on answers(flow_id);
create index if not exists idx_submissions_session on flow_submissions(session_id);

-- ============ ROW LEVEL SECURITY ============
-- "authenticated" = logged-in admin (via Supabase Auth). "anon" = public tester traffic
-- using the publishable anon key with no login.

alter table studies enable row level security;
alter table flows enable row level security;
alter table questions enable row level security;
alter table test_sessions enable row level security;
alter table answers enable row level security;
alter table flow_submissions enable row level security;

-- Admins: full access to everything (this is a single-admin-team internal tool,
-- so any authenticated user is treated as an admin - no per-user ownership checks)
create policy "admin_all_studies" on studies for all to authenticated using (true) with check (true);
create policy "admin_all_flows" on flows for all to authenticated using (true) with check (true);
create policy "admin_all_questions" on questions for all to authenticated using (true) with check (true);
-- "for all" (not just select) so an admin can delete a tester's session
-- (and, via ON DELETE CASCADE, their answers + flow_submissions) from the
-- results dashboard.
create policy "admin_all_sessions" on test_sessions for all to authenticated using (true) with check (true);
create policy "admin_all_answers" on answers for all to authenticated using (true) with check (true);
create policy "admin_all_submissions" on flow_submissions for all to authenticated using (true) with check (true);

-- Public tester traffic (anon key, no login): can only see published studies,
-- and can create/update their own session + answers on those studies.
create policy "public_read_published_studies" on studies for select to anon
  using (status = 'published');

create policy "public_read_flows" on flows for select to anon
  using (exists (select 1 from studies s where s.id = flows.study_id and s.status = 'published'));

create policy "public_read_questions" on questions for select to anon
  using (exists (
    select 1 from studies s join flows f on f.study_id = s.id
    where f.id = questions.flow_id and s.status = 'published'
  ));

create policy "public_insert_sessions" on test_sessions for insert to anon
  with check (exists (select 1 from studies s where s.id = test_sessions.study_id and s.status = 'published'));
create policy "public_read_sessions" on test_sessions for select to anon using (true);
create policy "public_update_sessions" on test_sessions for update to anon using (true) with check (true);

create policy "public_insert_answers" on answers for insert to anon
  with check (exists (select 1 from studies s where s.id = answers.study_id and s.status = 'published'));
create policy "public_read_answers" on answers for select to anon using (true);
create policy "public_update_answers" on answers for update to anon using (true) with check (true);

create policy "public_insert_submissions" on flow_submissions for insert to anon with check (true);
create policy "public_read_submissions" on flow_submissions for select to anon using (true);
