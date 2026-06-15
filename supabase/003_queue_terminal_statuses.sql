-- Allow closed queue items to stay on the Kanban board as terminal columns.
-- Run this in the Supabase project that Vercel points at.

alter table queue_items
  drop constraint if exists queue_items_status_check;

alter table queue_items
  add constraint queue_items_status_check
  check (status in ('ready', 'in-progress', 'blocked', 'done', 'archived', 'cancelled'));
