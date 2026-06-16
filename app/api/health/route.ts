import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkGranolaConnection } from "@/lib/granola";
import { publicErrorDetail } from "@/lib/granola-db";
import { getSupabaseServiceKeyRole, isPublicSupabaseServerKey, supabase } from "@/lib/supabase";

type HealthCheck = {
  ok: boolean;
  label: string;
  count?: number | null;
  detail?: string;
};

function supabaseProjectRef() {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host || null;
  } catch {
    return null;
  }
}

async function tableCheck(table: string, label: string): Promise<HealthCheck> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, label, detail: "Supabase env missing" };
  }

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    return { ok: false, label, count: null, detail: publicErrorDetail(error) };
  }

  return { ok: true, label, count };
}

async function granolaCheck(): Promise<HealthCheck> {
  if (!process.env.GRANOLA_API_KEY) {
    return { ok: false, label: "Granola API", detail: "GRANOLA_API_KEY missing" };
  }

  try {
    const result = await checkGranolaConnection();
    return { ok: true, label: "Granola API", count: result.notes };
  } catch (err) {
    return { ok: false, label: "Granola API", detail: publicErrorDetail(err) };
  }
}

function serverKeyCheck(): HealthCheck {
  const role = getSupabaseServiceKeyRole();

  if (role === "missing") {
    return { ok: false, label: "Supabase server key", detail: "SUPABASE_SERVICE_ROLE_KEY missing" };
  }

  if (isPublicSupabaseServerKey()) {
    return {
      ok: false,
      label: "Supabase server key",
      detail: `SUPABASE_SERVICE_ROLE_KEY is ${role}. Use the service_role key for server writes.`,
    };
  }

  return { ok: true, label: "Supabase server key", detail: role };
}

function cronSecretCheck(): HealthCheck {
  return process.env.CRON_SECRET
    ? { ok: true, label: "Cron secret", detail: "configured" }
    : { ok: false, label: "Cron secret", detail: "CRON_SECRET missing" };
}

function slackPostingCheck(): HealthCheck {
  if (!process.env.SLACK_PING_TOKEN) {
    return { ok: false, label: "Slack posting", detail: "SLACK_PING_TOKEN missing" };
  }

  if (!process.env.SLACK_PING_CHANNEL_ID) {
    return { ok: false, label: "Slack posting", detail: "Fallback SLACK_PING_CHANNEL_ID missing" };
  }

  return { ok: true, label: "Slack posting", detail: "configured" };
}

function openAiCheck(): HealthCheck {
  return process.env.OPENAI_API_KEY
    ? { ok: true, label: "OpenAI fallback", detail: process.env.OPENAI_MODEL || "default model" }
    : { ok: true, label: "OpenAI fallback", detail: "optional; rules-only until OPENAI_API_KEY is set" };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serverKey = serverKeyCheck();
  const [queue, clients, granolaActions, rawEvents, taskCandidates, granola] = await Promise.all([
    tableCheck("queue_items", "Queue table"),
    tableCheck("clients", "Clients table"),
    tableCheck("granola_action_items", "Granola actions table"),
    tableCheck("raw_events", "Raw source inbox"),
    tableCheck("task_candidates", "AI task candidates"),
    granolaCheck(),
  ]);
  const cron = cronSecretCheck();
  const slackPosting = slackPostingCheck();
  const openAi = openAiCheck();

  const required = [serverKey, queue, granola];

  return NextResponse.json({
    ok: required.every(check => check.ok),
    projectRef: supabaseProjectRef(),
    checks: {
      serverKey,
      queue,
      clients,
      granolaActions,
      rawEvents,
      taskCandidates,
      granola,
      cron,
      slackPosting,
      openAi,
    },
  });
}
