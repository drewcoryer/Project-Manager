import { createHash, randomUUID } from "crypto";
import { google } from "googleapis";
import { WebClient } from "@slack/web-api";
import { isSupabaseSchemaError, publicErrorDetail } from "@/lib/granola-db";
import { supabase } from "@/lib/supabase";

export const TRIAGE_MIGRATION = "supabase/005_raw_events_triage.sql";

type SourceType = "granola" | "gmail" | "calendar" | "slack" | "manual";

type WorkspaceRow = {
  id: string;
  type: "google_calendar" | "gmail" | "slack";
  name: string;
  client_key: string | null;
  workspace_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  is_connected: boolean;
};

export type RawEventInput = {
  source: SourceType;
  workspace_id?: string | null;
  source_item_id: string;
  source_thread_id?: string | null;
  client_key?: string | null;
  title?: string | null;
  body: string;
  actor?: string | null;
  occurred_at?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
};

type RawEventRow = RawEventInput & {
  id: string;
  metadata: Record<string, unknown>;
};

type CandidateExtraction = {
  should_create_task: boolean;
  title: string;
  description: string | null;
  client_key: string | null;
  priority: "p0" | "p1" | "p2";
  due_date: string | null;
  confidence: number;
  evidence: string | null;
  reason: string | null;
};

type TaskCandidateRow = {
  id: string;
  title: string;
  description: string | null;
  client_key: string | null;
  priority: "p0" | "p1" | "p2";
  due_date: string | null;
  confidence: number;
  evidence: string | null;
  reason: string | null;
  source: SourceType;
  source_url: string | null;
  raw_event_id: string | null;
  metadata: Record<string, unknown>;
};

export type TriageRunResult = {
  ok: true;
  collected: number;
  processed: number;
  candidates: number;
  ignored: number;
  failed: number;
  warning?: string | null;
};

export class TriageStepError extends Error {
  step: string;
  cause: unknown;

  constructor(step: string, cause: unknown) {
    super(publicErrorDetail(cause));
    this.name = "TriageStepError";
    this.step = step;
    this.cause = cause;
  }
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function truncate(value: string, max = 5000) {
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizePriority(value: unknown): "p0" | "p1" | "p2" {
  return value === "p0" || value === "p1" || value === "p2" ? value : "p2";
}

function normalizeConfidence(value: unknown) {
  const confidence = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function gmailBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return base64UrlDecode(payload.body.data);
  if (payload.body?.data && !payload.parts?.length) return base64UrlDecode(payload.body.data);
  for (const part of payload.parts || []) {
    const body = gmailBody(part);
    if (body) return body;
  }
  return "";
}

async function refreshGoogleToken(ws: WorkspaceRow): Promise<string | null> {
  if (!ws.access_token) return null;
  if (!ws.refresh_token) return ws.access_token;

  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ access_token: ws.access_token, refresh_token: ws.refresh_token });
    const { credentials } = await auth.refreshAccessToken();
    const token = credentials.access_token || ws.access_token;

    if (token !== ws.access_token) {
      await supabase
        .from("workspaces")
        .update({ access_token: token, last_synced_at: new Date().toISOString() })
        .eq("id", ws.id);
    }

    return token;
  } catch {
    return ws.access_token;
  }
}

async function connectedWorkspaces(type: WorkspaceRow["type"]) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("type", type)
    .eq("is_connected", true)
    .not("access_token", "is", null);

  if (error) throw new TriageStepError(`${type}_workspaces`, error);
  return (data || []) as WorkspaceRow[];
}

async function collectCalendarEvents(): Promise<RawEventInput[]> {
  const workspaces = await connectedWorkspaces("google_calendar");
  const events: RawEventInput[] = [];
  const timeMin = new Date();
  timeMin.setUTCDate(timeMin.getUTCDate() - 1);
  const timeMax = new Date();
  timeMax.setUTCDate(timeMax.getUTCDate() + 7);

  for (const ws of workspaces) {
    try {
      const token = await refreshGoogleToken(ws);
      if (!token) continue;

      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      auth.setCredentials({ access_token: token });
      const calendar = google.calendar({ version: "v3", auth });
      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      for (const item of res.data.items || []) {
        if (!item.id || !item.start?.dateTime) continue;
        if (item.summary?.includes("(Clone)")) continue;
        const attendees = (item.attendees || []).map(a => a.email || a.displayName).filter(Boolean);
        const body = [
          `Calendar: ${ws.name}`,
          `Title: ${item.summary || "Untitled"}`,
          item.description ? `Description: ${item.description}` : null,
          attendees.length ? `Attendees: ${attendees.join(", ")}` : null,
          item.location ? `Location: ${item.location}` : null,
        ].filter(Boolean).join("\n");

        events.push({
          source: "calendar",
          workspace_id: ws.id,
          source_item_id: `${ws.id}:${item.id}`,
          client_key: ws.client_key,
          title: item.summary || "Calendar event",
          body: truncate(body),
          actor: ws.workspace_id || ws.name,
          occurred_at: item.start.dateTime,
          url: item.htmlLink || null,
          metadata: {
            workspace_name: ws.name,
            calendar_email: ws.workspace_id,
            event_id: item.id,
            start: item.start.dateTime,
            end: item.end?.dateTime || null,
            attendees,
          },
        });
      }
    } catch (err) {
      console.warn(`Calendar triage collection failed for ${ws.name}:`, publicErrorDetail(err));
    }
  }

  return events;
}

async function collectGmailEvents(): Promise<RawEventInput[]> {
  const workspaces = await connectedWorkspaces("gmail");
  const events: RawEventInput[] = [];

  for (const ws of workspaces) {
    try {
      const token = await refreshGoogleToken(ws);
      if (!token) continue;

      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      auth.setCredentials({ access_token: token });
      const gmail = google.gmail({ version: "v1", auth });
      const listed = await gmail.users.messages.list({
        userId: "me",
        q: "newer_than:2d -category:promotions -category:social",
        maxResults: 25,
      });

      for (const message of listed.data.messages || []) {
        if (!message.id) continue;
        const full = await gmail.users.messages.get({ userId: "me", id: message.id, format: "full" });
        const headers = full.data.payload?.headers || [];
        const header = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
        const subject = header("Subject") || "No subject";
        const from = header("From") || "Unknown sender";
        const date = header("Date");
        const body = gmailBody(full.data.payload);

        events.push({
          source: "gmail",
          workspace_id: ws.id,
          source_item_id: `${ws.id}:${message.id}`,
          source_thread_id: full.data.threadId || null,
          client_key: ws.client_key,
          title: subject,
          body: truncate([`From: ${from}`, `Subject: ${subject}`, "", body || full.data.snippet || ""].join("\n")),
          actor: from,
          occurred_at: date ? new Date(date).toISOString() : new Date(Number(full.data.internalDate || Date.now())).toISOString(),
          url: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
          metadata: {
            workspace_name: ws.name,
            account_email: ws.workspace_id,
            message_id: message.id,
            thread_id: full.data.threadId,
            snippet: full.data.snippet,
          },
        });
      }
    } catch (err) {
      console.warn(`Gmail triage collection failed for ${ws.name}:`, publicErrorDetail(err));
    }
  }

  return events;
}

async function collectSlackEvents(): Promise<RawEventInput[]> {
  const workspaces = await connectedWorkspaces("slack");
  const events: RawEventInput[] = [];

  for (const ws of workspaces) {
    try {
      if (!ws.access_token) continue;
      const client = new WebClient(ws.access_token);
      const search = await client.search.messages({
        query: "to:me",
        sort: "timestamp",
        sort_dir: "desc",
        count: 20,
      });

      for (const match of search.messages?.matches || []) {
        const slackMatch = match as typeof match & { thread_ts?: string; user?: string };
        const channelId = match.channel?.id || "";
        const ts = match.ts || `${Date.now()}`;
        events.push({
          source: "slack",
          workspace_id: ws.id,
          source_item_id: `${ws.id}:${channelId}:${ts}`,
          source_thread_id: slackMatch.thread_ts || null,
          client_key: ws.client_key,
          title: `Slack mention in #${match.channel?.name || "DM"}`,
          body: truncate(match.text || ""),
          actor: match.username || slackMatch.user || "unknown",
          occurred_at: new Date(Number(ts.split(".")[0]) * 1000).toISOString(),
          url: match.permalink || null,
          metadata: {
            workspace_name: ws.name,
            team_id: ws.workspace_id,
            channel_id: channelId,
            channel_name: match.channel?.name || null,
            ts,
          },
        });
      }
    } catch (err) {
      console.warn(`Slack triage collection failed for ${ws.name}:`, publicErrorDetail(err));
    }
  }

  return events;
}

async function upsertRawEvents(events: RawEventInput[]) {
  if (events.length === 0) return 0;
  const rows = events.map(event => ({
    ...event,
    occurred_at: event.occurred_at || new Date().toISOString(),
    metadata: event.metadata || {},
    content_hash: hashText([event.title || "", event.body || ""].join("\n")),
  }));

  const { error } = await supabase
    .from("raw_events")
    .upsert(rows, { onConflict: "source,source_item_id", ignoreDuplicates: true });

  if (error) throw new TriageStepError("raw_events_upsert", error);
  return rows.length;
}

async function pendingRawEvents(limit: number) {
  const { data, error } = await supabase
    .from("raw_events")
    .select("*")
    .eq("triage_status", "pending")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new TriageStepError("raw_events_pending", error);
  return (data || []) as RawEventRow[];
}

async function markRawEvent(id: string, triageStatus: "processed" | "ignored" | "failed", error?: unknown) {
  const { error: updateError } = await supabase
    .from("raw_events")
    .update({
      triage_status: triageStatus,
      triage_error: error ? publicErrorDetail(error).slice(0, 500) : null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) throw new TriageStepError("raw_event_mark", updateError);
}

function candidatePrompt(event: RawEventRow) {
  return [
    "You are triaging Drew's personal work inbox.",
    "Extract only real tasks Drew should consider doing.",
    "Do not create tasks for FYI, newsletters, automated reminders, vague ideas, or normal meeting attendance.",
    "Return no task unless the source has a concrete ask, commitment, follow-up, blocker, deadline, or reply needed.",
    "",
    `Source: ${event.source}`,
    `Client key hint: ${event.client_key || "unknown"}`,
    `Actor: ${event.actor || "unknown"}`,
    `When: ${event.occurred_at}`,
    `Title: ${event.title || "Untitled"}`,
    event.url ? `URL: ${event.url}` : null,
    "",
    event.body,
  ].filter(Boolean).join("\n");
}

async function extractCandidate(event: RawEventRow): Promise<CandidateExtraction[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return JSON only with a tasks array. Each task must include should_create_task, title, description, client_key, priority p0/p1/p2, due_date YYYY-MM-DD or null, confidence 0-1, evidence, and reason.",
        },
        { role: "user", content: candidatePrompt(event) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI triage failed with ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  const parsed = raw ? JSON.parse(raw) : {};
  const tasks: Record<string, unknown>[] = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const minConfidence = Number(process.env.TRIAGE_MIN_CONFIDENCE || 0.55);

  return tasks
    .map((task: Record<string, unknown>) => ({
      should_create_task: task.should_create_task !== false,
      title: String(task.title || "").trim(),
      description: typeof task.description === "string" ? task.description.trim() : null,
      client_key: typeof task.client_key === "string" && task.client_key.trim() ? task.client_key.trim() : event.client_key || null,
      priority: normalizePriority(task.priority),
      due_date: normalizeDate(task.due_date),
      confidence: normalizeConfidence(task.confidence),
      evidence: typeof task.evidence === "string" ? task.evidence.trim() : null,
      reason: typeof task.reason === "string" ? task.reason.trim() : null,
    }))
    .filter(task => task.should_create_task && task.title.length > 4 && task.confidence >= minConfidence);
}

async function upsertCandidates(event: RawEventRow, candidates: CandidateExtraction[]) {
  if (candidates.length === 0) return 0;
  const rows = candidates.map(candidate => ({
    candidate_key: `${event.id}:${hashText(`${candidate.title}|${candidate.due_date || ""}`).slice(0, 18)}`,
    raw_event_id: event.id,
    source: event.source,
    title: candidate.title,
    description: candidate.description,
    client_key: candidate.client_key,
    priority: candidate.priority,
    due_date: candidate.due_date,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
    reason: candidate.reason,
    source_url: event.url || null,
    metadata: {
      raw_event_title: event.title,
      raw_event_actor: event.actor,
      raw_event_occurred_at: event.occurred_at,
      raw_event_metadata: event.metadata || {},
    },
  }));

  const { error } = await supabase
    .from("task_candidates")
    .upsert(rows, { onConflict: "candidate_key", ignoreDuplicates: true });

  if (error) throw new TriageStepError("task_candidates_upsert", error);
  return rows.length;
}

export async function collectRawEvents() {
  const [calendar, gmail, slack] = await Promise.all([
    collectCalendarEvents(),
    collectGmailEvents(),
    collectSlackEvents(),
  ]);
  return [...calendar, ...gmail, ...slack];
}

export async function runTriage(): Promise<TriageRunResult> {
  const events = await collectRawEvents();
  const collected = await upsertRawEvents(events);
  const warning = process.env.OPENAI_API_KEY ? null : "OPENAI_API_KEY missing; raw events collected but LLM triage skipped.";

  if (!process.env.OPENAI_API_KEY) {
    return { ok: true, collected, processed: 0, candidates: 0, ignored: 0, failed: 0, warning };
  }

  const limit = Math.max(1, Math.min(Number(process.env.TRIAGE_BATCH_SIZE || 12), 30));
  const pending = await pendingRawEvents(limit);
  let candidates = 0;
  let ignored = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      const extracted = await extractCandidate(event);
      if (extracted.length === 0) {
        ignored++;
        await markRawEvent(event.id, "ignored");
        continue;
      }

      candidates += await upsertCandidates(event, extracted);
      await markRawEvent(event.id, "processed");
    } catch (err) {
      failed++;
      await markRawEvent(event.id, "failed", err);
    }
  }

  return { ok: true, collected, processed: pending.length, candidates, ignored, failed, warning };
}

export async function listTaskCandidates(status = "pending") {
  const { data, error } = await supabase
    .from("task_candidates")
    .select("*")
    .eq("status", status)
    .order("confidence", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new TriageStepError("task_candidates_list", error);
  return (data || []) as TaskCandidateRow[];
}

function queueSource(source: SourceType) {
  return source === "calendar" || source === "slack" || source === "gmail" || source === "granola" ? source : "manual";
}

export async function promoteTaskCandidate(id: string) {
  const { data: candidate, error } = await supabase
    .from("task_candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new TriageStepError("task_candidate_read", error);
  const row = candidate as TaskCandidateRow;
  const notes = [
    row.description,
    row.evidence ? `Evidence:\n${row.evidence}` : null,
    row.reason ? `Reason:\n${row.reason}` : null,
    row.source_url ? `Source:\n${row.source_url}` : null,
    `Candidate ID: ${row.id}`,
    row.raw_event_id ? `Raw event ID: ${row.raw_event_id}` : null,
  ].filter(Boolean).join("\n\n");

  const { data: queueItem, error: insertError } = await supabase
    .from("queue_items")
    .insert({
      title: row.title,
      client_key: row.client_key,
      status: "ready",
      priority: row.priority,
      source: queueSource(row.source),
      link: row.source_url,
      due_date: row.due_date,
      notes,
      sort_order: 0,
    })
    .select("*")
    .single();

  if (insertError) throw new TriageStepError("queue_promote", insertError);

  const { error: updateError } = await supabase
    .from("task_candidates")
    .update({
      status: "promoted",
      queue_item_id: queueItem.id,
      promoted_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) throw new TriageStepError("task_candidate_promote", updateError);
  return queueItem;
}

export async function dismissTaskCandidates(ids: string[]) {
  const cleanIds = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("task_candidates")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() }, { count: "exact" })
    .in("id", cleanIds);

  if (error) throw new TriageStepError("task_candidate_dismiss", error);
  return count ?? cleanIds.length;
}

export function migrationForTriageError(err: unknown) {
  if (err instanceof TriageStepError && isSupabaseSchemaError(err.cause)) return TRIAGE_MIGRATION;
  if (isSupabaseSchemaError(err)) return TRIAGE_MIGRATION;
  return undefined;
}

export function cronOwner() {
  return process.env.VERCEL_DEPLOYMENT_ID || randomUUID();
}
