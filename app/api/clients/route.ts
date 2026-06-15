import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClients, updateClientSlackChannels } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const clients = await getClients();
    return NextResponse.json({ clients });
  } catch (err) {
    console.error("Clients API error:", err);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const channelIds = Array.isArray(body.slack_channel_ids)
      ? body.slack_channel_ids.map((id: unknown) => String(id))
      : typeof body.slack_channel_id === "string" ? [body.slack_channel_id] : [];

    if (!key) return NextResponse.json({ error: "Missing client key" }, { status: 400 });

    const client = await updateClientSlackChannels(key, channelIds);
    return NextResponse.json({ client });
  } catch (err) {
    console.error("Clients update error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update client" },
      { status: 500 }
    );
  }
}
