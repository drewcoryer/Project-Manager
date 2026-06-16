import { NextRequest, NextResponse } from "next/server";
import { publicErrorDetail } from "@/lib/granola-db";
import { migrationForTriageError, runTriage } from "@/lib/triage";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runTriage();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Triage cron error:", err);
    const migration = migrationForTriageError(err);
    return NextResponse.json(
      {
        ok: false,
        error: publicErrorDetail(err),
        code: migration ? "missing_or_incompatible_supabase_schema" : "triage_cron_failed",
        migration,
      },
      { status: 500 }
    );
  }
}
