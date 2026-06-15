import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSlackSummaries } from "@/lib/slack";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summaries = await getSlackSummaries();
    return NextResponse.json({ summaries });
  } catch (err) {
    console.error("Slack API error:", err);
    return NextResponse.json({ error: "Failed to fetch Slack" }, { status: 500 });
  }
}
