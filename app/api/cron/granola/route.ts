import { NextRequest, NextResponse } from "next/server";
import {
  GranolaSyncStepError,
  claimGranolaCronLock,
  migrationForGranolaSyncError,
  missingGranolaSyncEnv,
  releaseGranolaCronLock,
  syncGranolaTodos,
} from "@/lib/granola-sync";
import { publicErrorDetail } from "@/lib/granola-db";

function isAuthorizedCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = missingGranolaSyncEnv();
  if (missing) return NextResponse.json({ error: missing, code: "missing_env", step: "env" }, { status: 500 });

  let lockOwner: string | null = null;
  try {
    lockOwner = await claimGranolaCronLock();
    if (!lockOwner) {
      return NextResponse.json({ ok: true, skipped: "locked" });
    }

    const result = await syncGranolaTodos({ mode: "cron", notifySlack: true });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Granola cron error:", err);
    const migration = migrationForGranolaSyncError(err);
    const step = err instanceof GranolaSyncStepError ? err.step : "unknown";
    const cause = err instanceof GranolaSyncStepError ? err.cause : err;

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to run Granola cron",
        code: migration ? "missing_or_incompatible_supabase_schema" : "granola_cron_failed",
        step,
        detail: publicErrorDetail(cause),
        migration,
      },
      { status: 500 }
    );
  } finally {
    if (lockOwner) await releaseGranolaCronLock(lockOwner);
  }
}
