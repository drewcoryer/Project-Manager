import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClients } from "@/lib/supabase";

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
