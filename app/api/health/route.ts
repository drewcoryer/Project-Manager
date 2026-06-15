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

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serverKey = serverKeyCheck();
  const [queue, clients, granolaActions, granola] = await Promise.all([
    tableCheck("queue_items", "Queue table"),
    tableCheck("clients", "Clients table"),
    tableCheck("granola_action_items", "Granola actions table"),
    granolaCheck(),
  ]);

  const required = [serverKey, queue, granola];

  return NextResponse.json({
    ok: required.every(check => check.ok),
    projectRef: supabaseProjectRef(),
    checks: {
      serverKey,
      queue,
      clients,
      granolaActions,
      granola,
    },
  });
}
