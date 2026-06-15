import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActionItems } from "@/lib/granola";
import {
  CLIENT_SEEDS,
  GRANOLA_ACTIONS_MIGRATION,
  isSupabaseSchemaError,
  toGranolaActionRow,
  toQueueRow,
} from "@/lib/granola-db";
import { supabase } from "@/lib/supabase";

type QueueLinkRow = {
  id: string;
  granola_action_id: string | null;
};

type LegacyQueueRow = {
  id: string;
  notes: string | null;
  granola_action_id: string | null;
};

function envError(message: string) {
  return NextResponse.json({ error: message, code: "missing_env" }, { status: 500 });
}

function schemaError(detail?: string) {
  return NextResponse.json(
    {
      error: "Granola actions need the Supabase migration before import can persist.",
      code: "missing_supabase_schema",
      detail,
      migration: GRANOLA_ACTIONS_MIGRATION,
    },
    { status: 500 }
  );
}

function missingEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the same Supabase project.";
  }

  if (!process.env.GRANOLA_API_KEY) {
    return "Set GRANOLA_API_KEY before syncing Granola actions.";
  }

  return null;
}

async function linkLegacyQueueItems(actionIds: string[]) {
  const actionIdSet = new Set(actionIds);
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, notes, granola_action_id")
    .is("granola_action_id", null)
    .not("notes", "is", null)
    .limit(500);

  if (error) throw error;

  const legacyLinks = ((data || []) as LegacyQueueRow[])
    .map(row => ({
      id: row.id,
      actionId: row.notes?.match(/^Action ID:\s*(.+)$/m)?.[1],
    }))
    .filter((row): row is { id: string; actionId: string } => Boolean(row.actionId && actionIdSet.has(row.actionId)));

  const updates = await Promise.all(
    legacyLinks.map(row =>
      supabase
        .from("queue_items")
        .update({ granola_action_id: row.actionId, source: "granola" })
        .eq("id", row.id)
        .is("granola_action_id", null)
    )
  );

  const updateError = updates.find(result => result.error)?.error;
  if (updateError) throw updateError;

  return legacyLinks.length;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const missing = missingEnv();
  if (missing) return envError(missing);

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(Number(body.days) || 14, 30));
    const importedAt = new Date().toISOString();

    const { error: clientError } = await supabase.from("clients").upsert(CLIENT_SEEDS, { onConflict: "key" });
    if (clientError) {
      if (isSupabaseSchemaError(clientError)) return schemaError(clientError.message);
      throw clientError;
    }

    const actions = await getActionItems(days);

    if (actions.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, synced: 0, imported: 0, skipped: 0, days });
    }

    const actionRows = actions.map(item => toGranolaActionRow(item, importedAt));
    const { error: actionError } = await supabase
      .from("granola_action_items")
      .upsert(actionRows, { onConflict: "id" });

    if (actionError) {
      if (isSupabaseSchemaError(actionError)) return schemaError(actionError.message);
      throw actionError;
    }

    const actionIds = actions.map(item => item.id);
    const legacyLinked = await linkLegacyQueueItems(actionIds);
    const queueRows = actions.map((item, index) => toQueueRow(item, index));
    const { data: insertedQueueRows, error: queueError } = await supabase
      .from("queue_items")
      .upsert(queueRows, { onConflict: "granola_action_id", ignoreDuplicates: true })
      .select("id, granola_action_id");

    if (queueError) {
      if (isSupabaseSchemaError(queueError)) return schemaError(queueError.message);
      throw queueError;
    }

    const { data: queueLinks, error: queueLinkError } = await supabase
      .from("queue_items")
      .select("id, granola_action_id")
      .in("granola_action_id", actionIds);

    if (queueLinkError) {
      if (isSupabaseSchemaError(queueLinkError)) return schemaError(queueLinkError.message);
      throw queueLinkError;
    }

    const queueIdByActionId = new Map(
      ((queueLinks || []) as QueueLinkRow[])
        .filter(row => row.granola_action_id)
        .map(row => [row.granola_action_id as string, row.id])
    );

    const linkedActionRows = actionRows.map(row => ({
      ...row,
      queue_item_id: queueIdByActionId.get(row.id) || null,
    }));

    const { error: linkError } = await supabase
      .from("granola_action_items")
      .upsert(linkedActionRows, { onConflict: "id" });

    if (linkError) {
      if (isSupabaseSchemaError(linkError)) return schemaError(linkError.message);
      throw linkError;
    }

    const imported = insertedQueueRows?.length || 0;

    return NextResponse.json({
      ok: true,
      scanned: actions.length,
      synced: actionRows.length,
      imported,
      linked: legacyLinked,
      skipped: actions.length - imported,
      days,
      source: "granola",
      persisted: "granola_action_items",
    });
  } catch (err) {
    console.error("Granola import error:", err);
    if (isSupabaseSchemaError(err)) {
      return schemaError(err instanceof Error ? err.message : undefined);
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import Granola actions" },
      { status: 500 }
    );
  }
}
