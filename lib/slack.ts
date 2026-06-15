import { WebClient } from "@slack/web-api";
import { supabase } from "./supabase";

export type SlackMessage = {
  workspace: string;
  channel: string;
  channelName: string;
  text: string;
  user: string;
  ts: string;
  permalink: string | null;
};

export type SlackSummary = {
  workspace: string;
  unreadMentions: number;
  needsReply: SlackMessage[];
  recentByClient: Record<string, SlackMessage[]>;
};

async function getSlackClient(workspaceId: string): Promise<WebClient | null> {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("*")
    .eq("type", "slack")
    .eq("workspace_id", workspaceId)
    .eq("is_connected", true)
    .single();

  if (!ws?.access_token) return null;
  return new WebClient(ws.access_token);
}

export async function getSlackSummaries(): Promise<SlackSummary[]> {
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("*")
    .eq("type", "slack")
    .eq("is_connected", true);

  if (!workspaces?.length) return [];

  const summaries: SlackSummary[] = [];

  for (const ws of workspaces) {
    try {
      const client = new WebClient(ws.access_token);

      // Get channels with unread messages
      const convos = await client.conversations.list({
        types: "public_channel,private_channel,mpim,im",
        exclude_archived: true,
        limit: 100,
      });

      const needsReply: SlackMessage[] = [];
      let unreadMentions = 0;

      // Search for unread mentions
      const searchRes = await client.search.messages({
        query: "to:me",
        sort: "timestamp",
        sort_dir: "desc",
        count: 10,
      });

      const matches = searchRes.messages?.matches || [];
      for (const m of matches) {
        needsReply.push({
          workspace: ws.name,
          channel: m.channel?.id || "",
          channelName: m.channel?.name || "DM",
          text: (m.text || "").slice(0, 200),
          user: m.username || "unknown",
          ts: m.ts || "",
          permalink: m.permalink || null,
        });
      }

      unreadMentions = matches.length;

      summaries.push({
        workspace: ws.name,
        unreadMentions,
        needsReply: needsReply.slice(0, 5),
        recentByClient: {},
      });
    } catch (err) {
      console.error(`Slack fetch failed for ${ws.name}:`, err);
      summaries.push({
        workspace: ws.name,
        unreadMentions: 0,
        needsReply: [],
        recentByClient: {},
      });
    }
  }

  return summaries;
}

// Pull recent messages from specific channels (for client deep-dive)
export async function getChannelRecent(
  workspaceId: string,
  channelIds: string[],
  limit = 3
): Promise<SlackMessage[]> {
  const client = await getSlackClient(workspaceId);
  if (!client) return [];

  const messages: SlackMessage[] = [];

  for (const channelId of channelIds) {
    try {
      const res = await client.conversations.history({
        channel: channelId,
        limit,
      });

      const info = await client.conversations.info({ channel: channelId });

      for (const m of res.messages || []) {
        messages.push({
          workspace: "",
          channel: channelId,
          channelName: (info.channel as { name?: string })?.name || channelId,
          text: (m.text || "").slice(0, 200),
          user: m.user || "unknown",
          ts: m.ts || "",
          permalink: null,
        });
      }
    } catch (err) {
      console.error(`Channel history failed for ${channelId}:`, err);
    }
  }

  return messages;
}
