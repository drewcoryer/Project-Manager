import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  GranolaSyncStepError,
  isRlsError,
  migrationForGranolaSyncError,
  missingGranolaSyncEnv,
  syncGranolaTodos,
} from "@/lib/granola-sync";
import { publicErrorDetail } from "@/lib/granola-db";

function envError(message: string) {
  return NextResponse.json({ error: message, code: "missing_env", step: "env" }, { status: 500 });
}

function messageForError(err: unknown) {
  if (err instanceof GranolaSyncStepError && isRlsError(err.cause)) {
    return "Supabase blocked the queue write with RLS. Set SUPABASE_SERVICE_ROLE_KEY in Vercel to the service_role key for this Supabase project.";
  }

  return err instanceof Error ? err.message : "Failed to import Granola actions";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const missing = missingGranolaSyncEnv();
  if (missing) return envError(missing);

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(Number(body.days) || 14, 30));
    const result = await syncGranolaTodos({ mode: "manual", days, notifySlack: false });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Granola import error:", err);
    const migration = migrationForGranolaSyncError(err);
    const step = err instanceof GranolaSyncStepError ? err.step : "unknown";
    const cause = err instanceof GranolaSyncStepError ? err.cause : err;

    return NextResponse.json(
      {
        error: messageForError(err),
        code: isRlsError(cause)
          ? "supabase_service_role_required"
          : migration ? "missing_or_incompatible_supabase_schema" : "granola_import_failed",
        step,
        detail: publicErrorDetail(cause),
        migration,
      },
      { status: 500 }
    );
  }
}
