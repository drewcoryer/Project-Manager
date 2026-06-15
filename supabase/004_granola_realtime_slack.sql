-- Realtime Granola sync, Slack notification state, and cron locking

alter table queue_items
  add column if not exists slack_notified_at timestamptz,
  add column if not exists slack_channel_id text,
  add column if not exists slack_message_ts text,
  add column if not exists slack_notification_status text not null default 'pending',
  add column if not exists slack_notification_error text;

do $$
begin
  alter table queue_items
    add constraint queue_items_slack_notification_status_check
    check (slack_notification_status in ('pending', 'sent', 'suppressed', 'failed'));
exception
  when duplicate_object then null;
end $$;

-- Existing imported Granola rows predate this notification workflow; keep cron from
-- announcing old manual backfills.
update queue_items
set slack_notification_status = 'suppressed'
where source = 'granola'
  and slack_notified_at is null
  and slack_notification_status = 'pending';

alter table granola_action_items
  add column if not exists source_note_updated_at timestamptz,
  add column if not exists extraction_method text,
  add column if not exists extraction_warning text;

do $$
begin
  alter table granola_action_items
    add constraint granola_action_items_extraction_method_check
    check (extraction_method is null or extraction_method in ('rules', 'openai', 'none'));
exception
  when duplicate_object then null;
end $$;

create index if not exists granola_action_items_source_note_updated_at_idx
  on granola_action_items(source_note_updated_at desc);

create index if not exists queue_items_slack_notification_status_idx
  on queue_items(slack_notification_status)
  where source = 'granola' and slack_notified_at is null;

create table if not exists integration_locks (
  name text primary key,
  locked_until timestamptz,
  locked_at timestamptz not null default now(),
  locked_by text,
  updated_at timestamptz not null default now()
);

create or replace function claim_integration_lock(
  p_name text,
  p_ttl_seconds int default 300,
  p_owner text default null
)
returns boolean
language plpgsql
as $$
declare
  did_claim boolean;
begin
  insert into integration_locks (name, locked_until, locked_at, locked_by, updated_at)
  values (p_name, now() + make_interval(secs => p_ttl_seconds), now(), p_owner, now())
  on conflict (name) do update
    set locked_until = excluded.locked_until,
        locked_at = excluded.locked_at,
        locked_by = excluded.locked_by,
        updated_at = now()
    where integration_locks.locked_until is null
       or integration_locks.locked_until < now()
  returning true into did_claim;

  return coalesce(did_claim, false);
end;
$$;

create or replace function release_integration_lock(p_name text, p_owner text default null)
returns void
language plpgsql
as $$
begin
  update integration_locks
  set locked_until = now(),
      updated_at = now()
  where name = p_name
    and (p_owner is null or locked_by = p_owner);
end;
$$;
