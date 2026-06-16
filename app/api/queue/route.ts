import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  deleteQueueItems,
  getQueueItems,
  QUEUE_PRIORITIES,
  QUEUE_STATUSES,
  upsertQueueItem,
  updateQueueItemFields,
  updateQueueItemsStatus,
  updateQueueItemStatus,
  type QueueItemFieldUpdates,
  type QueuePriority,
  type QueueStatus,
} from "@/lib/supabase";

function parseQueueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(id => typeof id === "string" ? id.trim() : "").filter(Boolean)));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientKey = req.nextUrl.searchParams.get("client") || undefined;
  const includeClosed = req.nextUrl.searchParams.get("includeClosed") === "true";

  try {
    const items = await getQueueItems(clientKey, { includeClosed });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("Queue API error:", err);
    return NextResponse.json({ error: "Failed to fetch queue" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const item = await upsertQueueItem(body);
    return NextResponse.json({ item });
  } catch (err) {
    console.error("Queue create error:", err);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as Record<string, unknown>;
    let status: QueueStatus | undefined;
    if ("status" in body) {
      if (!QUEUE_STATUSES.includes(body.status as QueueStatus)) {
        return NextResponse.json({ error: "Invalid queue status" }, { status: 400 });
      }
      status = body.status as QueueStatus;
    }

    const ids = parseQueueIds(body.ids);
    if ("ids" in body) {
      if (ids.length === 0) return NextResponse.json({ error: "No queue item ids provided" }, { status: 400 });
      if (body.action === "delete") {
        const deleted = await deleteQueueItems(ids);
        return NextResponse.json({ ok: true, deleted });
      }
      if (!status) return NextResponse.json({ error: "Bulk queue updates require a status" }, { status: 400 });
      const updated = await updateQueueItemsStatus(ids, status);
      return NextResponse.json({ ok: true, updated });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing queue item id" }, { status: 400 });

    const updates: QueueItemFieldUpdates = {};
    if ("title" in body) {
      if (typeof body.title !== "string") {
        return NextResponse.json({ error: "Task title must be text" }, { status: 400 });
      }
      const title = body.title.trim();
      if (!title) return NextResponse.json({ error: "Task title is required" }, { status: 400 });
      updates.title = title;
    }

    if ("due_date" in body) {
      if (body.due_date !== null && typeof body.due_date !== "string") {
        return NextResponse.json({ error: "Due date must be a date or empty" }, { status: 400 });
      }
      const dueDate = typeof body.due_date === "string" ? body.due_date.trim() : null;
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return NextResponse.json({ error: "Due date must be YYYY-MM-DD" }, { status: 400 });
      }
      updates.due_date = dueDate || null;
    }

    if ("priority" in body) {
      if (!QUEUE_PRIORITIES.includes(body.priority as QueuePriority)) {
        return NextResponse.json({ error: "Invalid queue priority" }, { status: 400 });
      }
      updates.priority = body.priority as QueuePriority;
    }

    if ("client_key" in body) {
      if (body.client_key !== null && typeof body.client_key !== "string") {
        return NextResponse.json({ error: "Client key must be text or empty" }, { status: 400 });
      }
      const clientKey = typeof body.client_key === "string" ? body.client_key.trim() : null;
      updates.client_key = clientKey || null;
    }

    if (!status && Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No queue changes provided" }, { status: 400 });
    }

    if (status) await updateQueueItemStatus(id, status);
    const item = Object.keys(updates).length > 0 ? await updateQueueItemFields(id, updates) : null;
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("Queue update error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const ids = parseQueueIds(body.ids);
    if (ids.length === 0) return NextResponse.json({ error: "No queue item ids provided" }, { status: 400 });

    const deleted = await deleteQueueItems(ids);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("Queue delete error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete items" }, { status: 500 });
  }
}
