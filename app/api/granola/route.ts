import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActionItems, getLastClientNote } from "@/lib/granola";
import { supabase } from "@/lib/supabase";

const CACHE_KEY = "granola_action_items";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "actions";
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  const clientKey = req.nextUrl.searchParams.get("client");

  try {
    if (type === "actions") {
      // Check cache
      if (!refresh) {
        const { data: cached } = await supabase
          .from("cache")
          .select("value, updated_at")
          .eq("key", CACHE_KEY)
          .single();

        if (cached) {
          const age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < CACHE_TTL_MS) {
            const items = JSON.parse(cached.value);
            const filtered = clientKey
              ? items.filter((i: { clientKey: string }) => i.clientKey === clientKey)
              : items;
            return NextResponse.json({ items: filtered, cached: true });
          }
        }
      }

      // Fetch fresh from Granola REST API
      const items = await getActionItems(14);

      // Cache
      await supabase.from("cache").upsert({
        key: CACHE_KEY,
        value: JSON.stringify(items),
        updated_at: new Date().toISOString(),
      });

      const filtered = clientKey
        ? items.filter(i => i.clientKey === clientKey)
        : items;

      return NextResponse.json({ items: filtered, cached: false });
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
