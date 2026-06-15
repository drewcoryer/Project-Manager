-- Production queue items
create table if not exists queue_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_key text,
  status text not null default 'ready' check (status in ('ready', 'in-progress', 'blocked', 'done', 'archived', 'cancelled')),
  priority text not null default 'p2' check (priority in ('p0', 'p1', 'p2')),
  source text not null default 'manual' check (source in ('manual', 'granola', 'slack', 'calendar')),
  link text,
  due_date date,
  remind_at timestamptz,
  last_pinged_at timestamptz,
  notes text,
  sort_order int not null default 0,
  granola_action_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table queue_items
  add column if not exists granola_action_id text;

-- Durable Granola actions, synced explicitly and linked into the queue
create table if not exists granola_action_items (
  id text primary key,
  action_text text not null,
  granola_client_key text,
  client_key text,
  client_label text,
  note_id text not null,
  note_title text,
  note_url text,
  meeting_date date,
  queue_item_id uuid references queue_items(id) on delete set null,
  status text not null default 'ready' check (status in ('ready', 'queued', 'done', 'archived')),
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists queue_items_granola_action_id_key
  on queue_items(granola_action_id);

do $$
begin
  alter table queue_items
    add constraint queue_items_granola_action_id_fkey
    foreign key (granola_action_id)
    references granola_action_items(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists granola_action_items_client_key_idx
  on granola_action_items(client_key);

create index if not exists granola_action_items_meeting_date_idx
  on granola_action_items(meeting_date desc);

-- Workspace connections
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('google_calendar', 'slack')),
  name text not null,
  client_key text,
  workspace_id text,
  access_token text,
  refresh_token text,
  is_connected boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique(type, workspace_id)
);

-- Client config
create table if not exists clients (
  key text primary key,
  name text not null,
  short_name text not null,
  color text not null,
  mrr int not null default 0,
  status text not null default 'active',
  health text not null default 'green' check (health in ('green', 'yellow', 'red', 'gray')),
  slack_channel_ids text[],
  notes text,
  updated_at timestamptz not null default now()
);

-- Daily priorities
create table if not exists daily_priorities (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  queue_item_id uuid references queue_items(id),
  sort_order int not null default 0,
  completed boolean not null default false,
  unique(date, queue_item_id)
);

-- Lightweight API cache for expensive external pulls
create table if not exists cache (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Seed clients
insert into clients (key, name, short_name, color, mrr, status) values
  ('charm', 'Charm / SKMR & Stable Kernel', 'Charm/SK', '#b45309', 4500, 'active'),
  ('haus', 'Haus Analytics', 'Haus', '#7c3aed', 3500, 'active'),
  ('coderpad', 'Astra GTM / CoderPad', 'CoderPad', '#2563eb', 3000, 'active'),
  ('kopp', 'Kopp Consulting', 'Kopp', '#059669', 800, 'active')
on conflict (key) do nothing;

-- Seed workspace placeholders (tokens filled via OAuth)
insert into workspaces (type, name, client_key, is_connected) values
  ('google_calendar', 'GTM Consulting', null, false),
  ('google_calendar', 'GTM Garden', null, false),
  ('google_calendar', 'Astra GTM', 'coderpad', false),
  ('google_calendar', 'Charm', 'charm', false),
  ('google_calendar', 'Haus', 'haus', false),
  ('slack', 'GTM Garden', null, false),
  ('slack', 'GTM Consulting', null, false)
on conflict do nothing;

-- Auto-update triggers
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists queue_items_updated on queue_items;
create trigger queue_items_updated before update on queue_items
  for each row execute function update_updated_at();
drop trigger if exists clients_updated on clients;
create trigger clients_updated before update on clients
  for each row execute function update_updated_at();
drop trigger if exists granola_action_items_updated on granola_action_items;
create trigger granola_action_items_updated before update on granola_action_items
  for each row execute function update_updated_at();
