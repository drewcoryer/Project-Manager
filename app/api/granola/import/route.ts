import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActionItems } from "@/lib/granola";
import { supabase } from "@/lib/supabase";

const CLIENT_SEEDS = [
  { key: "charm", name: "Charm / SKMR & Stable Kernel", short_name: "Charm/SK", color: "#b45309", mrr: 4500, status: "active", health: "green" },
  { key: "haus", name: "Haus Analytics", short_name: "Haus", color: "#7c3aed", mrr: 3500, status: "active", health: "green" },
  { key: "coderpad", name: "Astra GTM / CoderPad", short_name: "CoderPad", color: "#2563eb", mrr: 3000, status: "active", health: "green" },
  { key: "kopp", name: "Kopp Consulting", short_name: "Kopp", color: "#059669", mrr: 800, status: "active", health: "green" },
];

function mapClientKey(clientKey: string) {
  const subprojectMap: Record<string, string> = {
    focal: "charm",
    skmr: "charm",
    "stable-kernel": "charm",
  };

  return subprojectMap[clientKey] || clientKey;
}

function priorityFor(clientKey: string) {
  return clientKey === "coderpad" ? "p1" : "p2";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(Number(body.days) || 7, 30));

    await supabase.from("clients").upsert(CLIENT_SEEDS, { onConflict: "key" });

    const [actions, existingResult] = await Promise.all([
      getActionItems(days),
      supabase.from("queue_items").select("notes"),
    ]);

    if (existingResult.error) throw existingResult.error;

    const existingActionIds = new Set(
      (existingResult.data || [])
        .map(row => row.notes?.match(/^Action ID:\s*(.+)$/m)?.[1])
        .filter(Boolean)
    );

    const rows = actions
      .filter(item => !existingActionIds.has(item.id))
      .map((item, index) => ({
        title: item.text,
        client_key: mapClientKey(item.clientKey),
        status: "ready",
        priority: priorityFor(item.clientKey),
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
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("queue_items").insert(rows);
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      scanned: actions.length,
      imported: rows.length,
      skipped: actions.length - rows.length,
      days,
    });
  } catch (err) {
    console.error("Granola import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import Granola actions" },
      { status: 500 }
    );
  }
}
