import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActionItems } from "@/lib/granola";
import {
  CLIENT_SEEDS,
  GRANOLA_ACTIONS_MIGRATION,
  SUPABASE_INITIAL_MIGRATION,
  isSupabaseSchemaError,
  publicErrorDetail,
  toGranolaActionRow,
  toLegacyQueueRow,
  toQueueRow,
} from "@/lib/granola-db";
import { supabase } from "@/lib/supabase";
import type { GranolaActionItem } from "@/lib/granola";

type QueueLinkRow = {
  id: string;
  granola_action_id: string | null;
};

type LegacyQueueRow = {
  id: string;
  notes: string | null;
  granola_action_id: string | null;
};

type ImportStep =
  | "env"
  | "clients"
  | "granola"
  | "granola_action_items"
  | "legacy_queue_links"
  | "queue_read"
  | "queue_insert"
  | "queue_link_read"
  | "granola_action_links";

class ImportStepError extends Error {
  step: ImportStep;
  cause: unknown;

  constructor(step: ImportStep, cause: unknown) {
    super(publicErrorDetail(cause));
    this.name = "ImportStepError";
    this.step = step;
    this.cause = cause;
  }
}

function envError(message: string) {
  return NextResponse.json({ error: message, code: "missing_env", step: "env" }, { status: 500 });
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

function migrationForStep(step: ImportStep) {
  return step.startsWith("queue_") ? SUPABASE_INITIAL_MIGRATION : GRANOLA_ACTIONS_MIGRATION;
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
    .limit(500);

  if (error) throw new ImportStepError("legacy_queue_links", error);

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
  if (updateError) throw new ImportStepError("legacy_queue_links", updateError);

  return legacyLinks.length;
}

function actionIdFromNotes(notes: string | null | undefined) {
  return notes?.match(/^Action ID:\s*(.+)$/m)?.[1] || null;
}

async function syncQueueOnly(actions: GranolaActionItem[], detail?: string) {
  const { data: existingRows, error: existingError } = await supabase
    .from("queue_items")
    .select("notes")
    .limit(1000);

  if (existingError) throw new ImportStepError("queue_read", existingError);

  const existingActionIds = new Set(
    (existingRows || [])
      .map(row => actionIdFromNotes(row.notes))
      .filter(Boolean)
  );

  const rows = actions
    .filter(item => !existingActionIds.has(item.id))
    .map((item, index) => toLegacyQueueRow(item, index));

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("queue_items").insert(rows);
    if (insertError) throw new ImportStepError("queue_insert", insertError);
  }

  return {
    ok: true,
    scanned: actions.length,
    synced: actions.length,
    imported: rows.length,
    skipped: actions.length - rows.length,
    linked: 0,
    persisted: "queue_items",
    code: "queue_only_granola_sync",
    warning: "Granola actions were saved to queue_items. Run the migration for the dedicated granola_action_items table.",
    detail,
  };
}

async function syncNormalizedActions(actions: GranolaActionItem[], importedAt: string) {
  const actionRows = actions.map(item => toGranolaActionRow(item, importedAt));
  const { error: actionError } = await supabase
    .from("granola_action_items")
    .upsert(actionRows, { onConflict: "id" });

  if (actionError) throw new ImportStepError("granola_action_items", actionError);

  const actionIds = actions.map(item => item.id);
  const legacyLinked = await linkLegacyQueueItems(actionIds);
  const queueRows = actions.map((item, index) => toQueueRow(item, index));
  const { data: insertedQueueRows, error: queueError } = await supabase
    .from("queue_items")
    .upsert(queueRows, { onConflict: "granola_action_id", ignoreDuplicates: true })
    .select("id, granola_action_id");

  if (queueError) throw new ImportStepError("queue_insert", queueError);

  const { data: queueLinks, error: queueLinkError } = await supabase
    .from("queue_items")
    .select("id, granola_action_id")
    .in("granola_action_id", actionIds);

  if (queueLinkError) throw new ImportStepError("queue_link_read", queueLinkError);

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

  if (linkError) throw new ImportStepError("granola_action_links", linkError);

  const imported = insertedQueueRows?.length || 0;

  return {
    ok: true,
    scanned: actions.length,
    synced: actionRows.length,
    imported,
    linked: legacyLinked,
    skipped: actions.length - imported,
    source: "granola",
    persisted: "granola_action_items",
  };
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
    const clientWarning = clientError ? publicErrorDetail(clientError) : null;
    if (clientError && !isSupabaseSchemaError(clientError)) {
      console.warn("Granola import client seed skipped:", clientWarning);
    }

    let actions: GranolaActionItem[];
    try {
      actions = await getActionItems(days);
    } catch (granolaError) {
      throw new ImportStepError("granola", granolaError);
    }

    if (actions.length === 0) {
      return NextResponse.json({
        ok: true,
        scanned: 0,
        synced: 0,
        imported: 0,
        skipped: 0,
        days,
        clientWarning,
      });
    }

    try {
      return NextResponse.json({ ...(await syncNormalizedActions(actions, importedAt)), days, clientWarning });
    } catch (syncError) {
      if (!isSupabaseSchemaError(syncError)) throw syncError;
      return NextResponse.json({
        ...(await syncQueueOnly(actions, syncError instanceof Error ? syncError.message : undefined)),
        days,
        migration: GRANOLA_ACTIONS_MIGRATION,
        clientWarning,
      });
    }
  } catch (err) {
    console.error("Granola import error:", err);
    if (err instanceof ImportStepError) {
      return NextResponse.json(
        {
          error: err.message,
          code: isSupabaseSchemaError(err.cause) ? "missing_or_incompatible_supabase_schema" : "granola_import_failed",
          step: err.step,
          detail: publicErrorDetail(err.cause),
          migration: isSupabaseSchemaError(err.cause) ? migrationForStep(err.step) : undefined,
        },
        { status: 500 }
      );
    }

    if (isSupabaseSchemaError(err)) {
      return schemaError(err instanceof Error ? err.message : undefined);
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to import Granola actions",
        step: err instanceof ImportStepError ? err.step : "unknown",
        detail: publicErrorDetail(err instanceof ImportStepError ? err.cause : err),
      },
      { status: 500 }
    );
  }
}
