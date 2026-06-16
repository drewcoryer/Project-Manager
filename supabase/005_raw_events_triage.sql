-- Personal source inbox + LLM triage layer.
-- Raw source records are durable; task candidates are model output for review.

alter table workspaces
  drop constraint if exists workspaces_type_check;

alter table workspaces
  add constraint workspaces_type_check
  check (type in ('google_calendar', 'gmail', 'slack'));

alter table queue_items
  drop constraint if exists queue_items_source_check;

alter table queue_items
  add constraint queue_items_source_check
  check (source in ('manual', 'granola', 'slack', 'calendar', 'gmail'));

create table if not exists raw_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('granola', 'gmail', 'calendar', 'slack', 'manual')),
  workspace_id uuid references workspaces(id) on delete set null,
  source_item_id text not null,
  source_thread_id text,
  client_key text,
  title text,
  body text not null default '',
  actor text,
  occurred_at timestamptz not null default now(),
  url text,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text,
  triage_status text not null default 'pending' check (triage_status in ('pending', 'processed', 'ignored', 'failed')),
  triage_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, source_item_id)
);

create table if not exists task_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  raw_event_id uuid references raw_events(id) on delete cascade,
  source text not null check (source in ('granola', 'gmail', 'calendar', 'slack', 'manual')),
  title text not null,
  description text,
  client_key text,
  priority text not null default 'p2' check (priority in ('p0', 'p1', 'p2')),
  due_date date,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence text,
  reason text,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'promoted', 'dismissed', 'ignored', 'failed')),
  queue_item_id uuid references queue_items(id) on delete set null,
  triaged_at timestamptz not null default now(),
  promoted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raw_events_triage_status_idx
  on raw_events(triage_status, occurred_at desc);

create index if not exists raw_events_source_idx
  on raw_events(source, source_item_id);

create index if not exists task_candidates_status_idx
  on task_candidates(status, confidence desc, created_at desc);

create index if not exists task_candidates_raw_event_idx
  on task_candidates(raw_event_id);

insert into workspaces (type, name, client_key, is_connected)
select 'gmail', 'Gmail - Personal', null, false
where not exists (
  select 1 from workspaces where type = 'gmail' and name = 'Gmail - Personal'
);

insert into workspaces (type, name, client_key, is_connected)
select 'gmail', 'Gmail - GTM Consulting', null, false
where not exists (
  select 1 from workspaces where type = 'gmail' and name = 'Gmail - GTM Consulting'
);

drop trigger if exists raw_events_updated on raw_events;
create trigger raw_events_updated before update on raw_events
  for each row execute function update_updated_at();

drop trigger if exists task_candidates_updated on task_candidates;
create trigger task_candidates_updated before update on task_candidates
  for each row execute function update_updated_at();
