import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

export const QUEUE_STATUSES = ["ready", "in-progress", "blocked", "done", "archived", "cancelled"] as const;
export type QueueStatus = typeof QUEUE_STATUSES[number];
export const QUEUE_PRIORITIES = ["p0", "p1", "p2"] as const;
export type QueuePriority = typeof QUEUE_PRIORITIES[number];
export const CLOSED_QUEUE_STATUSES: QueueStatus[] = ["done", "archived", "cancelled"];
const TERMINAL_STATUS_RE = /^Queue terminal status:\s*(archived|cancelled)$/m;

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseServiceKey || "missing-service-role-key"
);

export function getSupabaseServiceKeyRole() {
  if (!supabaseServiceKey) return "missing";
  if (supabaseServiceKey.startsWith("sb_publishable_")) return "publishable";
  if (supabaseServiceKey.startsWith("sb_secret_")) return "secret";

  const [, payload] = supabaseServiceKey.split(".");
  if (!payload) return "unknown";

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return typeof decoded.role === "string" ? decoded.role : "unknown";
  } catch {
    return "unknown";
  }
}

export function isPublicSupabaseServerKey() {
  const role = getSupabaseServiceKeyRole();
  return role === "anon" || role === "authenticated" || role === "publishable";
}

export type Client = {
  key: string;
  name: string;
  short_name: string;
  color: string;
  mrr: number;
  status: string;
  health: string;
  slack_channel_ids: string[] | null;
  notes: string | null;
};

export type QueueItem = {
  id: string;
  title: string;
  client_key: string | null;
  status: QueueStatus;
  priority: QueuePriority;
  source: "manual" | "granola" | "slack" | "calendar";
  link: string | null;
  due_date: string | null;
  remind_at: string | null;
  last_pinged_at: string | null;
  slack_notified_at?: string | null;
  slack_channel_id?: string | null;
  slack_message_ts?: string | null;
  slack_notification_status?: "pending" | "sent" | "suppressed" | "failed";
  slack_notification_error?: string | null;
  notes: string | null;
  sort_order: number;
};

export type QueueItemFieldUpdates = Partial<Pick<QueueItem, "title" | "client_key" | "priority" | "due_date">>;

function requireSupabaseConfig() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

function terminalStatusFromNotes(notes: string | null) {
  const match = notes?.match(TERMINAL_STATUS_RE)?.[1];
  return match === "archived" || match === "cancelled" ? match : null;
}

function stripTerminalStatus(notes: string | null) {
  if (!notes) return notes;
  const stripped = notes
    .replace(TERMINAL_STATUS_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripped || null;
}

function notesWithTerminalStatus(notes: string | null, status: Extract<QueueStatus, "archived" | "cancelled">) {
  const base = stripTerminalStatus(notes);
  return [base, `Queue terminal status: ${status}`].filter(Boolean).join("\n");
}

function normalizeQueueItem(row: QueueItem): QueueItem {
  if (row.status === "done") {
    const terminalStatus = terminalStatusFromNotes(row.notes);
    if (terminalStatus) return { ...row, status: terminalStatus };
  }

  return row;
}

function isStatusConstraintError(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [err.code, err.message, err.details, err.hint].filter(Boolean).join(" ");
  return /(23514|queue_items_status_check|violates check constraint|status)/i.test(text);
}

export async function getClients(): Promise<Client[]> {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("status", "active")
    .order("mrr", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateClientSlackChannels(clientKey: string, channelIds: string[]): Promise<Client> {
  requireSupabaseConfig();
  const cleaned = Array.from(new Set(channelIds.map(id => id.trim()).filter(Boolean)));
  const { data, error } = await supabase
    .from("clients")
    .update({ slack_channel_ids: cleaned.length > 0 ? cleaned : null })
    .eq("key", clientKey)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getQueueItems(clientKey?: string, options: { includeClosed?: boolean } = {}): Promise<QueueItem[]> {
  requireSupabaseConfig();
  let query = supabase
    .from("queue_items")
    .select("*")
    .order("priority")
    .order("sort_order");
  if (!options.includeClosed) {
    for (const status of CLOSED_QUEUE_STATUSES) {
      query = query.neq("status", status);
    }
  }
  if (clientKey) query = query.eq("client_key", clientKey);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(normalizeQueueItem);
}

export async function upsertQueueItem(item: Partial<QueueItem> & { title: string }) {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("queue_items")
    .upsert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQueueItemStatus(id: string, status: QueueStatus) {
  requireSupabaseConfig();

  const { data: current, error: readError } = await supabase
    .from("queue_items")
    .select("notes")
    .eq("id", id)
    .single();
  if (readError) throw readError;

  const notes = status === "archived" || status === "cancelled"
    ? notesWithTerminalStatus(current.notes, status)
    : stripTerminalStatus(current.notes);
  const completedAt = CLOSED_QUEUE_STATUSES.includes(status) ? new Date().toISOString() : null;
  const updates: Record<string, unknown> = { status, notes, completed_at: completedAt };

  const { error } = await supabase.from("queue_items").update(updates).eq("id", id);
  if (error && (status === "archived" || status === "cancelled") && isStatusConstraintError(error)) {
    const { error: fallbackError } = await supabase
      .from("queue_items")
      .update({ status: "done", notes, completed_at: completedAt })
      .eq("id", id);
    if (fallbackError) throw fallbackError;
    return;
  }

  if (error) throw error;
}

export async function updateQueueItemsStatus(ids: string[], status: QueueStatus) {
  requireSupabaseConfig();
  const cleanIds = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) return 0;

  if (status === "archived" || status === "cancelled") {
    await Promise.all(cleanIds.map(id => updateQueueItemStatus(id, status)));
    return cleanIds.length;
  }

  const completedAt = CLOSED_QUEUE_STATUSES.includes(status) ? new Date().toISOString() : null;
  const { count, error } = await supabase
    .from("queue_items")
    .update({ status, completed_at: completedAt }, { count: "exact" })
    .in("id", cleanIds);

  if (error) throw error;
  return count ?? cleanIds.length;
}

export async function updateQueueItemFields(id: string, updates: QueueItemFieldUpdates) {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("queue_items")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeQueueItem(data);
}

export async function deleteQueueItems(ids: string[]) {
  requireSupabaseConfig();
  const cleanIds = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) return 0;

  const { error: priorityError } = await supabase
    .from("daily_priorities")
    .delete()
    .in("queue_item_id", cleanIds);
  if (priorityError) throw priorityError;

  const { count, error } = await supabase
    .from("queue_items")
    .delete({ count: "exact" })
    .in("id", cleanIds);

  if (error) throw error;
  return count ?? cleanIds.length;
}

export async function markQueueItemsPinged(ids: string[]) {
  if (ids.length === 0) return;
  requireSupabaseConfig();

  const { error } = await supabase
    .from("queue_items")
    .update({ last_pinged_at: new Date().toISOString() })
    .in("id", ids);

  if (error) throw error;
}
