import { createHash } from "crypto";

const GRANOLA_BASE = "https://public-api.granola.ai/v1";

export type GranolaNoteSummary = {
  id: string;
  object?: "note";
  title: string | null;
  owner?: { name: string | null; email: string };
  created_at: string;
  updated_at: string;
};

export type GranolaNote = GranolaNoteSummary & {
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

export type GranolaExtractionMethod = "rules" | "openai" | "none";

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
  sourceNoteUpdatedAt: string;
  extractionMethod: GranolaExtractionMethod;
  extractionWarning?: string | null;
  dueDate?: string | null;
  owner?: string | null;
  priority?: "p0" | "p1" | "p2";
};

export type GranolaActionExtraction = {
  items: GranolaActionItem[];
  method: GranolaExtractionMethod;
  warning?: string | null;
};

type ExtractedTask = {
  text: string;
  dueDate?: string | null;
  owner?: string | null;
  priority?: "p0" | "p1" | "p2";
};

const CLIENT_MAP: [RegExp, string][] = [
  [/focal|athens|naples|raj\b/i, "focal"],
  [/skmr|market\s*research|mary\b/i, "skmr"],
  [/stable\s*kernel|charm|hirecharm/i, "stable-kernel"],
  [/coderpad|astra\s*gtm|trellis|emailbison|sohan\b|reese\b|catherine\b/i, "coderpad"],
  [/haus|ash\b.*analytics/i, "haus"],
  [/kopp/i, "kopp"],
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

export function granolaClientLabel(clientKey: string) {
  return CLIENT_LABELS[clientKey] || clientKey;
}

export function inferGranolaClient(title: string, attendees: string[], summary: string): string {
  const haystack = [title, ...attendees, summary].join(" ");
  for (const [pattern, key] of CLIENT_MAP) {
    if (pattern.test(haystack)) return key;
  }
  return "internal";
}

async function granolaFetch(path: string): Promise<Response> {
  const key = process.env.GRANOLA_API_KEY;
  if (!key) throw new Error("GRANOLA_API_KEY not set");

  return fetch(`${GRANOLA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
}

export async function listNoteSummaries(filters: {
  createdAfter?: string;
  updatedAfter?: string;
  days?: number;
  pageLimit?: number;
} = {}): Promise<GranolaNoteSummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - (filters.days || 14));

  const notes: GranolaNoteSummary[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const pageLimit = filters.pageLimit || 10;

  do {
    const params = new URLSearchParams({ page_size: "30" });
    if (filters.createdAfter) params.set("created_after", filters.createdAfter);
    else if (!filters.updatedAfter) params.set("created_after", since.toISOString());
    if (filters.updatedAfter) params.set("updated_after", filters.updatedAfter);
    if (cursor) params.set("cursor", cursor);

    const res = await granolaFetch(`/notes?${params}`);
    if (!res.ok) {
      throw new Error(`Granola list failed with ${res.status}`);
    }

    const data = await res.json();
    notes.push(...(data.notes || []));
    cursor = data.hasMore ? data.cursor : null;
    pages++;
  } while (cursor && pages < pageLimit);

  return notes;
}

export async function listNotes(days = 14): Promise<GranolaNoteSummary[]> {
  return listNoteSummaries({ days, pageLimit: 5 });
}

export async function getNote(noteId: string): Promise<GranolaNote | null> {
  const res = await granolaFetch(`/notes/${noteId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function checkGranolaConnection() {
  const res = await granolaFetch("/notes?page_size=1");
  if (!res.ok) throw new Error(`Granola returned ${res.status}`);

  const data = await res.json();
  return { notes: Array.isArray(data.notes) ? data.notes.length : 0 };
}

function normalizeActionText(text: string) {
  return text
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^[-*+\d.)\s]+/, "")
    .replace(/^\[[ xX]]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stableActionId(noteId: string, text: string) {
  const normalized = normalizeActionText(text).toLowerCase();
  const hash = createHash("sha256").update(`${noteId}:${normalized}`).digest("hex").slice(0, 16);
  return `granola-${noteId}-${hash}`;
}

function isActionHeading(line: string) {
  return /^(#{1,6}\s*)?(action items?|next steps?|follow[- ]?ups?|to[- ]?dos?|tasks?|owners?|commitments?)\b/i.test(line);
}

function looksActionable(text: string) {
  return /\b(to|will|should|need|needs|must|follow|send|build|create|review|set up|confirm|draft|prepare|share|update|schedule|connect|finalize|research|run|add|get|check|sync|own|deliver|finish|fix|write|publish|launch|decide|circle back)\b/i.test(text);
}

function extractDueDate(text: string, meetingDate: string) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const meeting = new Date(`${meetingDate}T00:00:00Z`);
    const year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : meeting.getUTCFullYear();
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const base = new Date(`${meetingDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  if (/\btomorrow\b/i.test(text)) base.setUTCDate(base.getUTCDate() + 1);
  else if (/\bnext week\b/i.test(text)) base.setUTCDate(base.getUTCDate() + 7);
  else if (/\b(today|eod)\b/i.test(text)) base.setUTCDate(base.getUTCDate());
  else return null;

  return base.toISOString().slice(0, 10);
}

function extractOwner(text: string) {
  const match = text.match(/\b(?:owner|assigned to|assignee):\s*([^.,;]+)/i) || text.match(/^([^:]{2,40}):\s+\S/);
  return match?.[1]?.trim() || null;
}

function ruleExtractActionTexts(markdown: string) {
  const items: string[] = [];
  const lines = markdown.split("\n");
  let inActionSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^#{1,6}\s+/.test(trimmed)) {
      inActionSection = isActionHeading(trimmed.replace(/^#{1,6}\s+/, ""));
      continue;
    }

    if (isActionHeading(trimmed)) {
      inActionSection = true;
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/);
    const checkbox = trimmed.match(/^\[[ xX]\]\s*(.+)$/);
    const candidate = normalizeActionText((bullet || checkbox)?.[1] || "");
    if (candidate.length > 4 && (inActionSection || looksActionable(candidate))) {
      items.push(candidate);
    }
  }

  return Array.from(new Set(items.map(normalizeActionText).filter(Boolean)));
}

async function openAiExtractActionTexts(
  note: GranolaNote,
  clientKey: string
): Promise<{ items: ExtractedTask[]; warning: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      items: [] as ExtractedTask[],
      warning: "OPENAI_API_KEY missing; rule extraction found no confident tasks.",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const input = [
    `Meeting title: ${note.title || "Untitled"}`,
    `Meeting date: ${note.calendar_event?.scheduled_start_time || note.created_at}`,
    `Inferred client key: ${clientKey}`,
    "",
    note.summary_markdown || note.summary_text || "",
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Extract only concrete follow-up tasks from meeting notes. Return JSON with a tasks array. Each task has text, optional owner, optional dueDate as YYYY-MM-DD, and priority p0/p1/p2. Do not invent tasks.",
          },
          { role: "user", content: input },
        ],
      }),
    });

    if (!res.ok) {
      return { items: [], warning: `OpenAI extraction failed with ${res.status}.` };
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : {};
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    return {
      items: tasks
        .map((task: { text?: unknown; dueDate?: unknown; owner?: unknown; priority?: unknown }) => ({
          text: normalizeActionText(String(task.text || "")),
          dueDate: typeof task.dueDate === "string" ? task.dueDate : null,
          owner: typeof task.owner === "string" ? task.owner : null,
          priority: task.priority === "p0" || task.priority === "p1" || task.priority === "p2" ? task.priority : undefined,
        }))
        .filter((task: { text: string }) => task.text.length > 4),
      warning: null,
    };
  } catch (err) {
    return {
      items: [],
      warning: err instanceof Error ? `OpenAI extraction failed: ${err.message}` : "OpenAI extraction failed.",
    };
  }
}

export async function extractActionsFromNote(note: GranolaNote): Promise<GranolaActionExtraction> {
  const markdown = note.summary_markdown || "";
  const attendeeNames = (note.attendees || []).map(a => a.name || a.email);
  const clientKey = inferGranolaClient(note.title || "", attendeeNames, markdown || note.summary_text || "");
  const clientLabel = granolaClientLabel(clientKey);
  const meetingDate = note.calendar_event?.scheduled_start_time?.split("T")[0] || note.created_at.split("T")[0];

  let method: GranolaExtractionMethod = "rules";
  let warning: string | null = null;
  let extracted = ruleExtractActionTexts(markdown).map(text => ({
    text,
    dueDate: extractDueDate(text, meetingDate),
    owner: extractOwner(text),
    priority: undefined as "p0" | "p1" | "p2" | undefined,
  }));

  if (extracted.length === 0) {
    const openAiResult = await openAiExtractActionTexts(note, clientKey);
    method = openAiResult.items.length > 0 ? "openai" : "none";
    warning = openAiResult.warning || null;
    extracted = openAiResult.items.map(item => ({
      text: item.text,
      dueDate: item.dueDate || extractDueDate(item.text, meetingDate),
      owner: item.owner || extractOwner(item.text),
      priority: item.priority,
    }));
  }

  const seen = new Set<string>();
  const items = extracted
    .map(item => ({ ...item, text: normalizeActionText(item.text) }))
    .filter(item => {
      const key = item.text.toLowerCase();
      if (!item.text || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(item => ({
      id: stableActionId(note.id, item.text),
      text: item.text,
      clientKey,
      clientLabel,
      source: "granola" as const,
      noteId: note.id,
      noteTitle: note.title || "Untitled",
      noteUrl: note.web_url,
      meetingDate,
      sourceNoteUpdatedAt: note.updated_at,
      extractionMethod: method,
      extractionWarning: warning,
      dueDate: item.dueDate || null,
      owner: item.owner || null,
      priority: item.priority,
    }));

  return { items, method, warning };
}

export async function getActionItems(days = 14): Promise<GranolaActionItem[]> {
  const notes = await listNotes(days);
  const items: GranolaActionItem[] = [];

  for (const note of notes) {
    const full = await getNote(note.id);
    if (!full?.summary_markdown && !full?.summary_text) continue;
    const extraction = await extractActionsFromNote(full);
    items.push(...extraction.items);
  }

  return items;
}

export async function getLastClientNote(clientKey: string): Promise<GranolaNote | null> {
  const notes = await listNotes(30);

  for (const note of notes) {
    const full = await getNote(note.id);
    if (!full?.summary_markdown) continue;

    const attendeeNames = (full.attendees || []).map(a => a.name || a.email);
    const inferred = inferGranolaClient(full.title || "", attendeeNames, full.summary_markdown);

    if (inferred === clientKey) return full;
  }

  return null;
}
