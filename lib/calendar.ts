import { google } from "googleapis";
import { supabase } from "./supabase";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  workspace: string;
  clientKey: string | null;
  type: "meeting" | "personal" | "production";
  attendees: string[];
  meetLink: string | null;
};

const CLIENT_PATTERNS: Record<string, RegExp> = {
  coderpad: /coderpad|astra(?:\s*gtm)?|abm\s*(?:rollout|meeting)/i,
  charm: /charm|skmr|stable\s*kernel|sales\s*touch/i,
  haus: /haus/i,
  kopp: /kopp/i,
};
const PERSONAL = /walk.*dog|gym|protein|touch\s*grass|lunch|buffer/i;
const PRODUCTION = /production|deep\s*work|build\s*time|focus/i;

function inferClient(title: string): string | null {
  for (const [key, pat] of Object.entries(CLIENT_PATTERNS)) {
    if (pat.test(title)) return key;
  }
  return null;
}

function inferType(title: string): CalendarEvent["type"] {
  if (PERSONAL.test(title)) return "personal";
  if (PRODUCTION.test(title)) return "production";
  return "meeting";
}

async function refreshTokenIfNeeded(ws: {
  id: string; access_token: string; refresh_token: string | null;
}): Promise<string> {
  if (!ws.refresh_token) return ws.access_token;

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({
      access_token: ws.access_token,
      refresh_token: ws.refresh_token,
    });

    const { credentials } = await auth.refreshAccessToken();

    if (credentials.access_token && credentials.access_token !== ws.access_token) {
      await supabase.from("workspaces").update({
        access_token: credentials.access_token,
        last_synced_at: new Date().toISOString(),
      }).eq("id", ws.id);
    }

    return credentials.access_token || ws.access_token;
  } catch {
    return ws.access_token;
  }
}

export async function getCalendarEvents(date: string): Promise<CalendarEvent[]> {
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("*")
    .eq("type", "google_calendar")
    .eq("is_connected", true);

  if (!workspaces?.length) return [];

  const events: CalendarEvent[] = [];
  const dayStart = new Date(date + "T00:00:00");
  const dayEnd = new Date(date + "T23:59:59");

  for (const ws of workspaces) {
    try {
      const token = await refreshTokenIfNeeded(ws);

      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials({ access_token: token });

      const calendar = google.calendar({ version: "v3", auth });
      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      for (const item of res.data.items || []) {
        if (!item.start?.dateTime) continue;
        // Filter out OneCal clone events
        if (item.summary?.includes("(Clone)")) continue;

        events.push({
          id: item.id!,
          title: item.summary || "Untitled",
          start: item.start.dateTime,
          end: item.end?.dateTime || item.start.dateTime,
          workspace: ws.name,
          clientKey: ws.client_key || inferClient(item.summary || ""),
          type: inferType(item.summary || ""),
          attendees: (item.attendees || []).map(a => a.email!).filter(Boolean),
          meetLink: item.conferenceData?.entryPoints?.[0]?.uri || null,
        });
      }
    } catch (err) {
      console.error(`Calendar error [${ws.name}]:`, err);
    }
  }

  // Sort and deduplicate
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const seen = new Set<string>();
  return events.filter(e => {
    const k = `${e.title}|${e.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
