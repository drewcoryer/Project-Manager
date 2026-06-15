-- Durable Granola action storage and queue linking.
-- Run this once in the Supabase project that Vercel points at.

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

alter table queue_items
  add column if not exists granola_action_id text;

create unique index if not exists queue_items_granola_action_id_key
  on queue_items(granola_action_id);

create index if not exists granola_action_items_client_key_idx
  on granola_action_items(client_key);

create index if not exists granola_action_items_meeting_date_idx
  on granola_action_items(meeting_date desc);

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

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists granola_action_items_updated on granola_action_items;
create trigger granola_action_items_updated before update on granola_action_items
  for each row execute function update_updated_at();
