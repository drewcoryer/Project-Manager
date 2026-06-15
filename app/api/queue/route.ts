import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getQueueItems, upsertQueueItem, updateQueueItemStatus } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientKey = req.nextUrl.searchParams.get("client") || undefined;

  try {
    const items = await getQueueItems(clientKey);
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
    const { id, status } = await req.json();
    await updateQueueItemStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Queue update error:", err);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}
