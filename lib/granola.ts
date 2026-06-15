const GRANOLA_BASE = "https://public-api.granola.ai/v1";

// ---- Types ----
export type GranolaNote = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  web_url: string;
  summary_text: string;
  summary_markdown: string | null;
  attendees: { name: string | null; email: string }[];
  calendar_event: {
    event_title: string | null;
    scheduled_start_time: string | null;
  } | null;
  folder_membership: { id: string; name: string }[];
};

export type GranolaActionItem = {
  id: string;
  text: string;
  clientKey: string;
  clientLabel: string;
  source: "granola";
  noteId: string;
  noteTitle: string;
  noteUrl: string;
  meetingDate: string;
};

// ---- Client inference ----
const CLIENT_MAP: [RegExp, string][] = [
  // Charm sub-projects (order matters - specific before general)
  [/focal|athens|naples|raj\b/i, "focal"],
  [/skmr|market\s*research|mary\b/i, "skmr"],
  [/stable\s*kernel|charm|hirecharm/i, "stable-kernel"],

  // CoderPad
  [/coderpad|astra\s*gtm|trellis|emailbison|sohan\b|reese\b|catherine\b/i, "coderpad"],

  // Direct clients
  [/haus|ash\b.*analytics/i, "haus"],
  [/kopp/i, "kopp"],

  // Project-based
  [/franchise|glasshouse|anthony\b/i, "franchise-gtm"],
  [/elijah|puzzle|salman\b/i, "elijah"],
  [/standify|hank\b/i, "standify"],
  [/shaun\b/i, "shaun"],
  [/hoa|pinery/i, "hoa"],
];

const CLIENT_LABELS: Record<string, string> = {
  "stable-kernel": "Stable Kernel",
  skmr: "SKMR",
  focal: "Focal",
  coderpad: "CoderPad",
  haus: "Haus",
  kopp: "Kopp",
  "franchise-gtm": "Franchise GTM",
  elijah: "Elijah",
  standify: "Standify",
  shaun: "Shaun",
  hoa: "HOA",
  internal: "Internal",
};

function inferClient(title: string, attendees: string[], summary: string): string {
  // Check title first, then attendees, then summary body
  const haystack = [title, ...attendees, summary].join(" ");
  for (const [pattern, key] of CLIENT_MAP) {
    if (pattern.test(haystack)) return key;
  }
  return "internal";
}

// ---- API calls ----
async function granolaFetch(path: string): Promise<Response> {
  const key = process.env.GRANOLA_API_KEY;
  if (!key) throw new Error("GRANOLA_API_KEY not set");

  return fetch(`${GRANOLA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
}

export async function listNotes(days = 14): Promise<GranolaNote[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const notes: GranolaNote[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      created_after: since.toISOString().split("T")[0],
      page_size: "30",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await granolaFetch(`/notes?${params}`);
    if (!res.ok) {
      console.error("Granola list failed:", res.status);
      break;
    }

    const data = await res.json();
    notes.push(...(data.notes || []));
    cursor = data.hasMore ? data.cursor : null;
    pages++;
  } while (cursor && pages < 5);

  return notes;
}

export async function getNote(noteId: string): Promise<GranolaNote | null> {
  const res = await granolaFetch(`/notes/${noteId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function checkGranolaConnection() {
  const res = await granolaFetch("/notes?page_size=1");
  if (!res.ok) {
    throw new Error(`Granola returned ${res.status}`);
  }

  const data = await res.json();
  return { notes: Array.isArray(data.notes) ? data.notes.length : 0 };
}

// ---- Action item extraction ----
// Parses bullet points from summary_markdown that look like action items
function extractActionItems(markdown: string): string[] {
  const items: string[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points that contain action-like language
    if ((trimmed.startsWith("- ") || trimmed.startsWith("* ")) && trimmed.length > 10) {
      const text = trimmed.replace(/^[-*]\s+/, "").replace(/\[.*?\]\(.*?\)/g, "").trim();
      // Filter for action-like items (contain verbs, assignments, deadlines)
      if (/\b(to|will|should|need|must|follow|send|build|create|review|set up|confirm|draft|prepare|share|update|schedule|connect|finalize|research|run|add|get|check|sync)\b/i.test(text)) {
        items.push(text);
      }
    }
  }

  return items;
}

// ---- Main function: get all action items across recent meetings ----
export async function getActionItems(days = 14): Promise<GranolaActionItem[]> {
  const notes = await listNotes(days);
  const items: GranolaActionItem[] = [];
  let counter = 0;

  for (const note of notes) {
    // Need full note with summary
    const full = await getNote(note.id);
    if (!full?.summary_markdown) continue;

    const attendeeNames = (full.attendees || []).map(a => a.name || a.email);
    const clientKey = inferClient(
      full.title || "",
      attendeeNames,
      full.summary_markdown
    );

    const actionTexts = extractActionItems(full.summary_markdown);

    for (const text of actionTexts) {
      counter++;
      items.push({
        id: `granola-${note.id}-${counter}`,
        text,
        clientKey,
        clientLabel: CLIENT_LABELS[clientKey] || clientKey,
        source: "granola",
        noteId: note.id,
        noteTitle: full.title || "Untitled",
        noteUrl: full.web_url,
        meetingDate: full.calendar_event?.scheduled_start_time?.split("T")[0]
          || full.created_at.split("T")[0],
      });
    }
  }

  return items;
}

// Get the most recent note for a specific client
export async function getLastClientNote(clientKey: string): Promise<GranolaNote | null> {
  const notes = await listNotes(30);

  for (const note of notes) {
    const full = await getNote(note.id);
    if (!full?.summary_markdown) continue;

    const attendeeNames = (full.attendees || []).map(a => a.name || a.email);
    const inferred = inferClient(full.title || "", attendeeNames, full.summary_markdown);

    if (inferred === clientKey) return full;
  }

  return null;
}
