import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

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
  status: "ready" | "in-progress" | "blocked" | "done";
  priority: "p0" | "p1" | "p2";
  source: "manual" | "granola" | "slack" | "calendar";
  link: string | null;
  due_date: string | null;
  remind_at: string | null;
  last_pinged_at: string | null;
  notes: string | null;
  sort_order: number;
};

function requireSupabaseConfig() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
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

export async function getQueueItems(clientKey?: string): Promise<QueueItem[]> {
  requireSupabaseConfig();
  let query = supabase
    .from("queue_items")
    .select("*")
    .neq("status", "done")
    .order("priority")
    .order("sort_order");
  if (clientKey) query = query.eq("client_key", clientKey);
  const { data, error } = await query;
  if (error) throw error;
  return data;
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

export async function updateQueueItemStatus(id: string, status: QueueItem["status"]) {
  requireSupabaseConfig();
  const updates: Record<string, unknown> = { status };
  if (status === "done") updates.completed_at = new Date().toISOString();
  const { error } = await supabase.from("queue_items").update(updates).eq("id", id);
  if (error) throw error;
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
