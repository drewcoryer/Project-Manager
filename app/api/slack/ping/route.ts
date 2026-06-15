import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getQueueItems, markQueueItemsPinged } from "@/lib/supabase";
import { getSlackSummaries, sendSlackPing } from "@/lib/slack";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isDueSoon(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  const soon = new Date(today);
  soon.setDate(today.getDate() + 1);
  return dueDate <= dayKey(soon);
}

async function buildAttentionDigest() {
  const [queue, slack] = await Promise.all([
    getQueueItems(),
    getSlackSummaries().catch(() => []),
  ]);

  const replyItems = slack.flatMap(summary =>
    summary.needsReply.map(message => ({
      workspace: summary.workspace,
      channel: message.channelName,
      text: message.text,
      permalink: message.permalink,
    }))
  );

  const queueItems = queue
    .filter(item => item.status === "blocked" || item.priority === "p0" || isDueSoon(item.due_date) || !!item.remind_at)
    .slice(0, 8);

  const lines = [
    "*GTM cockpit check-in*",
    `${queueItems.length} queue items need attention. ${replyItems.length} Slack replies are waiting.`,
  ];

  if (queueItems.length > 0) {
    lines.push("", "*Queue*");
    for (const item of queueItems) {
      const client = item.client_key ? ` [${item.client_key}]` : "";
      const due = item.due_date ? ` due ${item.due_date}` : "";
      const link = item.link ? ` ${item.link}` : "";
      lines.push(`- ${item.priority.toUpperCase()} ${item.title}${client}${due}${link}`);
    }
  }

  if (replyItems.length > 0) {
    lines.push("", "*Slack*");
    for (const item of replyItems.slice(0, 6)) {
      const link = item.permalink ? ` ${item.permalink}` : "";
      lines.push(`- ${item.workspace} #${item.channel}: ${item.text}${link}`);
    }
  }

  if (queueItems.length === 0 && replyItems.length === 0) {
    lines.push("", "Nothing urgent right now.");
  }

  return {
    text: lines.join("\n"),
    queueIds: queueItems.map(item => item.id),
    attentionCount: queueItems.length + replyItems.length,
  };
}

function isAuthorizedCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const digest = await buildAttentionDigest();
    if (digest.attentionCount === 0) {
      return NextResponse.json({ ok: true, sent: false, attentionCount: 0 });
    }

    const result = await sendSlackPing(digest.text);
    await markQueueItemsPinged(digest.queueIds);
    return NextResponse.json({ ok: true, sent: true, attentionCount: digest.attentionCount, result });
  } catch (err) {
    console.error("Slack ping cron error:", err);
    return NextResponse.json({ error: "Failed to send ping" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const digest = body.message
      ? { text: String(body.message), queueIds: [] as string[], attentionCount: 1 }
      : await buildAttentionDigest();

    const result = await sendSlackPing(digest.text, body.channelId);
    await markQueueItemsPinged(digest.queueIds);

    return NextResponse.json({
      ok: true,
      sent: true,
      attentionCount: digest.attentionCount,
      result,
    });
  } catch (err) {
    console.error("Slack ping error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send ping" }, { status: 500 });
  }
}
