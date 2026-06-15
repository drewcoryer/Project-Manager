import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLastClientNote } from "@/lib/granola";
import {
  fromGranolaActionRow,
  GRANOLA_ACTIONS_MIGRATION,
  isSupabaseSchemaError,
  type GranolaActionRow,
} from "@/lib/granola-db";
import { supabase } from "@/lib/supabase";

type QueueGranolaRow = {
  id: string;
  title: string;
  client_key: string | null;
  notes: string | null;
};

function noteField(notes: string | null, label: string) {
  const match = notes?.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match?.[1] || null;
}

async function readActionsFromQueue(clientKey: string | null) {
  let query = supabase
    .from("queue_items")
    .select("id, title, client_key, notes")
    .neq("status", "done")
    .limit(200);

  if (clientKey) query = query.eq("client_key", clientKey);

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as QueueGranolaRow[]).map(row => ({
    id: noteField(row.notes, "Action ID") || row.id,
    text: row.title,
    clientKey: row.client_key || "internal",
    clientLabel: noteField(row.notes, "Granola client") || row.client_key || "Internal",
    source: "granola" as const,
    noteId: "",
    noteTitle: noteField(row.notes, "Meeting") || "Untitled",
    noteUrl: noteField(row.notes, "Note") || "",
    meetingDate: noteField(row.notes, "Meeting date") || "",
  })).filter(item => Boolean(item.id.startsWith("granola-") || item.noteUrl));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "actions";
  const clientKey = req.nextUrl.searchParams.get("client");

  try {
    if (type === "actions") {
      let query = supabase
        .from("granola_action_items")
        .select("id, action_text, granola_client_key, client_key, client_label, note_id, note_title, note_url, meeting_date, queue_item_id, raw, last_seen_at, imported_at")
        .order("meeting_date", { ascending: false })
        .order("imported_at", { ascending: false })
        .limit(200);

      if (clientKey) query = query.eq("client_key", clientKey);

      const { data, error } = await query;
      if (error) {
        if (isSupabaseSchemaError(error)) {
          const items = await readActionsFromQueue(clientKey);
          return NextResponse.json({
            items,
            cached: false,
            source: "queue_items",
            code: "queue_only_granola_actions",
            migration: GRANOLA_ACTIONS_MIGRATION,
          });
        }

        throw error;
      }

      const items = ((data || []) as GranolaActionRow[]).map(fromGranolaActionRow);
      return NextResponse.json({ items, cached: false, source: "db" });
    }

    if (type === "notes" && clientKey) {
      const note = await getLastClientNote(clientKey);
      return NextResponse.json({
        note: note ? {
          id: note.id,
          title: note.title,
          date: note.created_at,
          url: note.web_url,
          summary: note.summary_markdown || note.summary_text,
          attendees: note.attendees?.map(a => a.name || a.email),
        } : null,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("Granola API error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
