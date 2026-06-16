import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { publicErrorDetail } from "@/lib/granola-db";
import {
  dismissPendingTaskCandidates,
  dismissTaskCandidates,
  listTaskCandidates,
  migrationForTriageError,
  promoteTaskCandidate,
  runTriage,
} from "@/lib/triage";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = req.nextUrl.searchParams.get("status") || "pending";
    const candidates = await listTaskCandidates(status);
    return NextResponse.json({ candidates });
  } catch (err) {
    const migration = migrationForTriageError(err);
    return NextResponse.json(
      { error: publicErrorDetail(err), migration },
      { status: 500 }
    );
  }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runTriage();
    return NextResponse.json(result);
  } catch (err) {
    const migration = migrationForTriageError(err);
    return NextResponse.json(
      { error: publicErrorDetail(err), migration },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as { action?: string; id?: string; ids?: string[]; source?: string };
    if (body.action === "promote") {
      if (!body.id) return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });
      const item = await promoteTaskCandidate(body.id);
      return NextResponse.json({ ok: true, item });
    }

    if (body.action === "dismiss") {
      const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
      const dismissed = await dismissTaskCandidates(ids);
      return NextResponse.json({ ok: true, dismissed });
    }

    if (body.action === "dismiss_all_pending") {
      const dismissed = await dismissPendingTaskCandidates(typeof body.source === "string" ? body.source : null);
      return NextResponse.json({ ok: true, dismissed });
    }

    return NextResponse.json({ error: "Unsupported triage action" }, { status: 400 });
  } catch (err) {
    const migration = migrationForTriageError(err);
    return NextResponse.json(
      { error: publicErrorDetail(err), migration },
      { status: 500 }
    );
  }
}
