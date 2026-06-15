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
          return NextResponse.json(
            {
              error: "Granola actions are not in this Supabase project yet. Run the migration, then sync Granola.",
              code: "missing_supabase_schema",
              migration: GRANOLA_ACTIONS_MIGRATION,
              items: [],
            },
            { status: 500 }
          );
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
