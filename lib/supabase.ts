import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  due_date: string | null;
  notes: string | null;
  sort_order: number;
};

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("status", "active")
    .order("mrr", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getQueueItems(clientKey?: string): Promise<QueueItem[]> {
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
  const { data, error } = await supabase
    .from("queue_items")
    .upsert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQueueItemStatus(id: string, status: QueueItem["status"]) {
  const updates: Record<string, unknown> = { status };
  if (status === "done") updates.completed_at = new Date().toISOString();
  const { error } = await supabase.from("queue_items").update(updates).eq("id", id);
  if (error) throw error;
}
