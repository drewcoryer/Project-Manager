import { randomUUID } from "crypto";
import { extractActionsFromNote, getNote, listNoteSummaries, type GranolaActionItem } from "@/lib/granola";
import {
  CLIENT_SEEDS,
  GRANOLA_REALTIME_MIGRATION,
  isSupabaseSchemaError,
  mapGranolaClientKey,
  publicErrorDetail,
  toGranolaActionRow,
  toQueueRow,
} from "@/lib/granola-db";
import {
  getSupabaseServiceKeyRole,
  isPublicSupabaseServerKey,
  supabase,
  type Client,
} from "@/lib/supabase";
import { sendSlackPing } from "@/lib/slack";

const WATERMARK_KEY = "granola:last_successful_updated_after";
const LOCK_NAME = "granola-cron";

type QueueLinkRow = {
  id: string;
  granola_action_id: string | null;
};

type LegacyQueueRow = {
  id: string;
  notes: string | null;
  granola_action_id: string | null;
};

type PendingQueueRow = {
  id: string;
  title: string;
  client_key: string | null;
  link: string | null;
  due_date: string | null;
  notes: string | null;
  granola_action_id: string | null;
};

type GranolaActionLinkRow = {
  id: string;
  note_id: string;
  note_title: string | null;
  note_url: string | null;
  client_label: string | null;
  meeting_date: string | null;
};

type SyncMode = "manual" | "cron";

export type GranolaSyncResult = {
  ok: true;
  mode: SyncMode;
  scanned: number;
  synced: number;
  imported: number;
  skipped: number;
  linked: number;
  persisted: "granola_action_items";
  days?: number;
  watermark?: string | null;
  nextWatermark?: string | null;
  extractionWarnings: number;
  slack?: SlackNotifyResult;
  clientWarning?: string | null;
};

export type SlackNotifyResult = {
  attempted: number;
  sent: number;
  failed: number;
  fallback: number;
};

export class GranolaSyncStepError extends Error {
  step: string;
  cause: unknown;

  constructor(step: string, cause: unknown) {
    super(publicErrorDetail(cause));
    this.name = "GranolaSyncStepError";
    this.step = step;
    this.cause = cause;
  }
}

export function missingGranolaSyncEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the same Supabase project.";
  }

  if (isPublicSupabaseServerKey()) {
    const role = getSupabaseServiceKeyRole();
    return `SUPABASE_SERVICE_ROLE_KEY is a ${role} key. Replace it in Vercel with the Supabase service_role key so server writes can bypass RLS.`;
  }

  if (!process.env.GRANOLA_API_KEY) {
    return "Set GRANOLA_API_KEY before syncing Granola actions.";
  }

  return null;
}

export function isRlsError(err: unknown) {
  return /42501|row-level security/i.test(publicErrorDetail(err));
}

function actionIdFromNotes(notes: string | null | undefined) {
  return notes?.match(/^Action ID:\s*(.+)$/m)?.[1] || null;
}

function overlapWatermark(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCMinutes(date.getUTCMinutes() - 2);
  return date.toISOString();
}

async function seedClients() {
  const { error } = await supabase.from("clients").upsert(CLIENT_SEEDS, { onConflict: "key" });
  if (error && !isSupabaseSchemaError(error)) throw new GranolaSyncStepError("clients", error);
  return error ? publicErrorDetail(error) : null;
}

async function readWatermark() {
  const { data, error } = await supabase
    .from("cache")
    .select("value")
    .eq("key", WATERMARK_KEY)
    .maybeSingle();

  if (error) throw new GranolaSyncStepError("watermark_read", error);
  return typeof data?.value === "string" ? data.value : null;
}

async function writeWatermark(value: string) {
  const { error } = await supabase
    .from("cache")
    .upsert({ key: WATERMARK_KEY, value }, { onConflict: "key" });

  if (error) throw new GranolaSyncStepError("watermark_write", error);
}

export async function claimGranolaCronLock(ttlSeconds = 240) {
  const owner = process.env.VERCEL_DEPLOYMENT_ID || randomUUID();
  const { data, error } = await supabase.rpc("claim_integration_lock", {
    p_name: LOCK_NAME,
    p_owner: owner,
    p_ttl_seconds: ttlSeconds,
  });

  if (error) throw new GranolaSyncStepError("claim_lock", error);
  return data ? owner : null;
}

export async function releaseGranolaCronLock(owner: string) {
  const { error } = await supabase.rpc("release_integration_lock", { p_name: LOCK_NAME, p_owner: owner });
  if (error) console.warn("Granola cron lock release failed:", publicErrorDetail(error));
}

async function linkLegacyQueueItems(actionIds: string[]) {
  if (actionIds.length === 0) return 0;

  const actionIdSet = new Set(actionIds);
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, notes, granola_action_id")
    .is("granola_action_id", null)
    .limit(500);

  if (error) throw new GranolaSyncStepError("legacy_queue_links", error);

  const legacyLinks = ((data || []) as LegacyQueueRow[])
    .map(row => ({
      id: row.id,
      actionId: actionIdFromNotes(row.notes),
    }))
    .filter((row): row is { id: string; actionId: string } => Boolean(row.actionId && actionIdSet.has(row.actionId)));

  const updates = await Promise.all(
    legacyLinks.map(row =>
      supabase
        .from("queue_items")
        .update({ granola_action_id: row.actionId, source: "granola", slack_notification_status: "suppressed" })
        .eq("id", row.id)
        .is("granola_action_id", null)
    )
  );

  const updateError = updates.find(result => result.error)?.error;
  if (updateError) throw new GranolaSyncStepError("legacy_queue_links", updateError);

  return legacyLinks.length;
}

async function syncNormalizedActions(actions: GranolaActionItem[], importedAt: string, mode: SyncMode) {
  if (actions.length === 0) {
    return { imported: 0, linked: 0, skipped: 0 };
  }

  const actionIds = actions.map(item => item.id);
  const { data: existingQueue, error: existingQueueError } = await supabase
    .from("queue_items")
    .select("granola_action_id")
    .in("granola_action_id", actionIds);

  if (existingQueueError) throw new GranolaSyncStepError("queue_existing_read", existingQueueError);

  const existingQueueActionIds = new Set(
    ((existingQueue || []) as { granola_action_id: string | null }[])
      .map(row => row.granola_action_id)
      .filter(Boolean)
  );

  const actionRows = actions.map(item => toGranolaActionRow(item, importedAt));
  const { error: actionError } = await supabase
    .from("granola_action_items")
    .upsert(actionRows, { onConflict: "id" });

  if (actionError) throw new GranolaSyncStepError("granola_action_items", actionError);

  const legacyLinked = await linkLegacyQueueItems(actionIds);
  const queueRows = actions.map((item, index) => toQueueRow(item, index));
  const { error: queueError } = await supabase
    .from("queue_items")
    .upsert(queueRows, { onConflict: "granola_action_id", ignoreDuplicates: true });

  if (queueError) throw new GranolaSyncStepError("queue_insert", queueError);

  const { data: queueLinks, error: queueLinkError } = await supabase
    .from("queue_items")
    .select("id, granola_action_id")
    .in("granola_action_id", actionIds);

  if (queueLinkError) throw new GranolaSyncStepError("queue_link_read", queueLinkError);

  const queueIdByActionId = new Map(
    ((queueLinks || []) as QueueLinkRow[])
      .filter(row => row.granola_action_id)
      .map(row => [row.granola_action_id as string, row.id])
  );

  const newQueueIds = actions
    .filter(item => !existingQueueActionIds.has(item.id))
    .map(item => queueIdByActionId.get(item.id))
    .filter((id): id is string => Boolean(id));

  const linkedActionRows = actionRows.map(row => ({
    ...row,
    queue_item_id: queueIdByActionId.get(row.id) || null,
  }));

  const { error: linkError } = await supabase
    .from("granola_action_items")
    .upsert(linkedActionRows, { onConflict: "id" });

  if (linkError) throw new GranolaSyncStepError("granola_action_links", linkError);

  if (mode === "manual" && newQueueIds.length > 0) {
    const { error: suppressError } = await supabase
      .from("queue_items")
      .update({ slack_notification_status: "suppressed" })
      .in("id", newQueueIds);

    if (suppressError) throw new GranolaSyncStepError("manual_slack_suppress", suppressError);
  }

  return {
    imported: newQueueIds.length,
    linked: legacyLinked,
    skipped: actions.length - newQueueIds.length,
  };
}

async function pendingGranolaQueueItems() {
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, title, client_key, link, due_date, notes, granola_action_id")
    .eq("source", "granola")
    .is("slack_notified_at", null)
    .in("slack_notification_status", ["pending", "failed"])
    .not("granola_action_id", "is", null)
    .limit(50);

  if (error) throw new GranolaSyncStepError("slack_pending_read", error);
  return (data || []) as PendingQueueRow[];
}

function groupKey(row: PendingQueueRow, action: GranolaActionLinkRow | undefined) {
  return `${row.client_key || "internal"}::${action?.note_id || row.granola_action_id || row.id}`;
}

function buildSlackMessage(params: {
  clientName: string;
  action: GranolaActionLinkRow | undefined;
  items: PendingQueueRow[];
  usedFallback: boolean;
}) {
  const { clientName, action, items, usedFallback } = params;
  const lines = [`*New Granola to-dos for ${clientName}*`];
  if (action?.note_title) {
    const note = action.note_url ? `<${action.note_url}|${action.note_title}>` : action.note_title;
    const meetingDate = action.meeting_date ? ` (${action.meeting_date})` : "";
    lines.push(`From ${note}${meetingDate}`);
  }
  if (usedFallback) {
    lines.push("_No client channel is mapped yet, so this used the fallback Slack channel._");
  }
  lines.push("");
  for (const item of items.slice(0, 12)) {
    const due = item.due_date ? ` - due ${item.due_date}` : "";
    const link = item.link ? ` <${item.link}|Granola>` : "";
    lines.push(`- ${item.title}${due}${link}`);
  }
  if (items.length > 12) lines.push(`- ...and ${items.length - 12} more`);
  return lines.join("\n");
}

async function markSlackFailed(ids: string[], error: unknown) {
  if (ids.length === 0) return;
  await supabase
    .from("queue_items")
    .update({
      slack_notification_status: "failed",
      slack_notification_error: publicErrorDetail(error).slice(0, 500),
    })
    .in("id", ids);
}

export async function notifyPendingGranolaTodos(): Promise<SlackNotifyResult> {
  const pending = await pendingGranolaQueueItems();
  if (pending.length === 0) return { attempted: 0, sent: 0, failed: 0, fallback: 0 };

  const actionIds = pending.map(row => row.granola_action_id).filter((id): id is string => Boolean(id));
  const { data: actions, error: actionsError } = await supabase
    .from("granola_action_items")
    .select("id, note_id, note_title, note_url, client_label, meeting_date")
    .in("id", actionIds);

  if (actionsError) throw new GranolaSyncStepError("slack_action_read", actionsError);

  const actionById = new Map(((actions || []) as GranolaActionLinkRow[]).map(row => [row.id, row]));
  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("key, name, short_name, color, mrr, status, health, slack_channel_ids, notes")
    .eq("status", "active");

  if (clientsError) throw new GranolaSyncStepError("slack_client_read", clientsError);

  const clientByKey = new Map(((clients || []) as Client[]).map(client => [client.key, client]));
  const groups = new Map<string, PendingQueueRow[]>();
  for (const item of pending) {
    const action = item.granola_action_id ? actionById.get(item.granola_action_id) : undefined;
    const key = groupKey(item, action);
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  const result: SlackNotifyResult = { attempted: pending.length, sent: 0, failed: 0, fallback: 0 };

  for (const items of groups.values()) {
    const first = items[0];
    const action = first.granola_action_id ? actionById.get(first.granola_action_id) : undefined;
    const client = first.client_key ? clientByKey.get(first.client_key) : null;
    const channel = client?.slack_channel_ids?.[0] || process.env.SLACK_PING_CHANNEL_ID || null;
    const ids = items.map(item => item.id);

    if (!channel) {
      await markSlackFailed(ids, new Error("No client Slack channel or SLACK_PING_CHANNEL_ID configured."));
      result.failed += items.length;
      continue;
    }

    const usedFallback = !client?.slack_channel_ids?.[0];
    const clientName = client?.short_name || action?.client_label || first.client_key || "Internal";
    const text = buildSlackMessage({ clientName, action, items, usedFallback });

    try {
      const sent = await sendSlackPing(text, channel);
      const { error: markError } = await supabase
        .from("queue_items")
        .update({
          slack_notified_at: new Date().toISOString(),
          slack_channel_id: channel,
          slack_message_ts: sent.ts || null,
          slack_notification_status: "sent",
          slack_notification_error: usedFallback ? "No client Slack channel mapped; posted to fallback channel." : null,
        })
        .in("id", ids);

      if (markError) throw markError;
      result.sent += items.length;
      if (usedFallback) result.fallback += items.length;
    } catch (err) {
      await markSlackFailed(ids, err);
      result.failed += items.length;
    }
  }

  return result;
}

export async function syncGranolaTodos(options: {
  mode: SyncMode;
  days?: number;
  notifySlack?: boolean;
}): Promise<GranolaSyncResult> {
  const runStartedAt = new Date().toISOString();
  const importedAt = new Date().toISOString();
  const clientWarning = await seedClients();

  let watermark: string | null = null;
  let notes;

  if (options.mode === "cron") {
    watermark = await readWatermark();
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() - 1);
    notes = await listNoteSummaries({
      updatedAfter: watermark ? overlapWatermark(watermark) : fallback.toISOString(),
      pageLimit: 10,
    });
  } else {
    const days = Math.max(1, Math.min(Number(options.days) || 14, 30));
    notes = await listNoteSummaries({ days, pageLimit: 10 });
  }

  const actions: GranolaActionItem[] = [];
  let extractionWarnings = 0;

  for (const summary of notes) {
    const full = await getNote(summary.id);
    if (!full?.summary_markdown && !full?.summary_text) continue;
    const extraction = await extractActionsFromNote(full);
    if (extraction.warning) extractionWarnings++;
    actions.push(...extraction.items);
  }

  const sync = await syncNormalizedActions(actions, importedAt, options.mode);
  const slack = options.notifySlack ? await notifyPendingGranolaTodos() : undefined;

  if (options.mode === "cron") {
    await writeWatermark(runStartedAt);
  }

  return {
    ok: true,
    mode: options.mode,
    scanned: notes.length,
    synced: actions.length,
    imported: sync.imported,
    skipped: sync.skipped,
    linked: sync.linked,
    persisted: "granola_action_items",
    days: options.mode === "manual" ? Math.max(1, Math.min(Number(options.days) || 14, 30)) : undefined,
    watermark,
    nextWatermark: options.mode === "cron" ? runStartedAt : null,
    extractionWarnings,
    slack,
    clientWarning,
  };
}

export function migrationForGranolaSyncError(err: unknown) {
  if (err instanceof GranolaSyncStepError && isSupabaseSchemaError(err.cause)) {
    return GRANOLA_REALTIME_MIGRATION;
  }
  if (isSupabaseSchemaError(err)) return GRANOLA_REALTIME_MIGRATION;
  return undefined;
}
