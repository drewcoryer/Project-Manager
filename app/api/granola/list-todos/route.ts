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

function isAuthorizedAction(req: NextRequest) {
  const secret = process.env.GRANOLA_ACTION_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAction(req)) {
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
    return NextResponse.json({ ...result, action: "list-todos" });
  } catch (err) {
    console.error("Granola list-todos action error:", err);
    const migration = migrationForGranolaSyncError(err);
    const step = err instanceof GranolaSyncStepError ? err.step : "unknown";
    const cause = err instanceof GranolaSyncStepError ? err.cause : err;

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list Granola todos",
        code: migration ? "missing_or_incompatible_supabase_schema" : "granola_list_todos_failed",
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
