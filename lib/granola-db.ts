import type { GranolaActionItem } from "@/lib/granola";

export const GRANOLA_ACTIONS_MIGRATION = "supabase/002_granola_actions.sql";

export const CLIENT_SEEDS = [
  { key: "charm", name: "Charm / SKMR & Stable Kernel", short_name: "Charm/SK", color: "#b45309", mrr: 4500, status: "active", health: "green" },
  { key: "haus", name: "Haus Analytics", short_name: "Haus", color: "#7c3aed", mrr: 3500, status: "active", health: "green" },
  { key: "coderpad", name: "Astra GTM / CoderPad", short_name: "CoderPad", color: "#2563eb", mrr: 3000, status: "active", health: "green" },
  { key: "kopp", name: "Kopp Consulting", short_name: "Kopp", color: "#059669", mrr: 800, status: "active", health: "green" },
];

export type GranolaActionRow = {
  id: string;
  action_text: string;
  granola_client_key: string | null;
  client_key: string | null;
  client_label: string | null;
  note_id: string;
  note_title: string | null;
  note_url: string | null;
  meeting_date: string | null;
  queue_item_id?: string | null;
  raw: GranolaActionItem;
  last_seen_at: string;
  imported_at: string;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function mapGranolaClientKey(clientKey: string) {
  const subprojectMap: Record<string, string> = {
    focal: "charm",
    skmr: "charm",
    "stable-kernel": "charm",
  };

  return subprojectMap[clientKey] || clientKey;
}

export function priorityForGranolaClient(clientKey: string) {
  return clientKey === "coderpad" ? "p1" : "p2";
}

export function toGranolaActionRow(item: GranolaActionItem, importedAt: string): GranolaActionRow {
  return {
    id: item.id,
    action_text: item.text,
    granola_client_key: item.clientKey,
    client_key: mapGranolaClientKey(item.clientKey),
    client_label: item.clientLabel,
    note_id: item.noteId,
    note_title: item.noteTitle || null,
    note_url: item.noteUrl || null,
    meeting_date: item.meetingDate || null,
    raw: item,
    last_seen_at: importedAt,
    imported_at: importedAt,
  };
}

export function toQueueRow(item: GranolaActionItem, index: number) {
  return {
    title: item.text,
    client_key: mapGranolaClientKey(item.clientKey),
    status: "ready",
    priority: priorityForGranolaClient(item.clientKey),
    source: "granola",
    link: item.noteUrl || null,
    due_date: null,
    notes: [
      "Source: Granola",
      `Granola client: ${item.clientLabel}`,
      `Meeting: ${item.noteTitle}`,
      `Meeting date: ${item.meetingDate}`,
      `Note: ${item.noteUrl}`,
      `Action ID: ${item.id}`,
    ].join("\n"),
    sort_order: index,
    granola_action_id: item.id,
  };
}

export function fromGranolaActionRow(row: GranolaActionRow): GranolaActionItem {
  return {
    id: row.id,
    text: row.action_text,
    clientKey: row.granola_client_key || row.client_key || "internal",
    clientLabel: row.client_label || row.client_key || "Internal",
    source: "granola",
    noteId: row.note_id,
    noteTitle: row.note_title || "Untitled",
    noteUrl: row.note_url || "",
    meetingDate: row.meeting_date || "",
  };
}

export function isSupabaseSchemaError(err: unknown) {
  const error = err as SupabaseLikeError;
  const text = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /(PGRST204|PGRST205|42P01|42703|granola_action_items|granola_action_id|schema cache|Could not find)/i.test(text);
}
