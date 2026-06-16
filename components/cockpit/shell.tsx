"use client";

import { useCallback, useEffect, useState, type ComponentType, type DragEvent, type MouseEvent } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Ban,
  BellRing,
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  GripVertical,
  Layers,
  Link2,
  ListChecks,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Square,
  Table2,
  TrendingUp,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  workspace: string;
  clientKey: string | null;
  type: "meeting" | "personal" | "production";
  meetLink: string | null;
};

type QueueStatus = "ready" | "in-progress" | "blocked" | "done" | "archived" | "cancelled";
type QueuePriority = "p0" | "p1" | "p2";
type QueueSource = "manual" | "granola" | "slack" | "calendar" | "gmail";

type QueueItem = {
  id: string;
  title: string;
  client_key: string | null;
  status: QueueStatus;
  priority: QueuePriority;
  source?: QueueSource;
  link?: string | null;
  due_date: string | null;
  remind_at?: string | null;
  last_pinged_at?: string | null;
  notes?: string | null;
  sort_order?: number;
};

type QueueItemEdit = Partial<Pick<QueueItem, "title" | "due_date" | "priority" | "client_key">>;

type ClientConfig = {
  key: string;
  name: string;
  short_name: string;
  color: string;
  bg: string;
  mrr: number;
  status: string;
  health: string;
};

type GranolaMeeting = {
  id: string;
  title: string;
  date: string;
  summary: string | null;
  clientKey: string | null;
  url?: string | null;
};

type SlackSummary = {
  workspace: string;
  unreadMentions: number;
  needsReply: { text: string; channelName: string; user: string; permalink: string | null }[];
};

type TaskCandidate = {
  id: string;
  title: string;
  description: string | null;
  client_key: string | null;
  priority: QueuePriority;
  due_date: string | null;
  confidence: number;
  evidence: string | null;
  reason: string | null;
  source: QueueSource;
  source_url: string | null;
};

type HealthCheck = {
  ok: boolean;
  label: string;
  count?: number | null;
  detail?: string;
};

type IntegrationHealth = {
  ok: boolean;
  projectRef: string | null;
  checks: {
    serverKey: HealthCheck;
    queue: HealthCheck;
    clients: HealthCheck;
    granolaActions: HealthCheck;
    rawEvents?: HealthCheck;
    taskCandidates?: HealthCheck;
    granola: HealthCheck;
  };
};

type DataMode = "loading" | "live" | "demo" | "error";
type QueueView = "board" | "sheet";

const DEFAULT_CLIENTS: Record<string, ClientConfig> = {
  charm: { key: "charm", name: "Charm / SKMR & Stable Kernel", short_name: "Charm/SK", color: "#b45309", bg: "#fffbeb", mrr: 4500, status: "active", health: "green" },
  haus: { key: "haus", name: "Haus Analytics", short_name: "Haus", color: "#7c3aed", bg: "#f5f3ff", mrr: 3500, status: "active", health: "green" },
  coderpad: { key: "coderpad", name: "Astra GTM / CoderPad", short_name: "CoderPad", color: "#2563eb", bg: "#eff6ff", mrr: 3000, status: "active", health: "green" },
  kopp: { key: "kopp", name: "Kopp Consulting", short_name: "Kopp", color: "#059669", bg: "#ecfdf5", mrr: 800, status: "active", health: "green" },
};

const FALLBACK_GRANOLA: Record<string, GranolaMeeting> = {
  coderpad: { id: "1", title: "CoderPad Campaign Review", date: "May 31", summary: "Reviewed re-engagement campaign metrics. Open rates at 34% on v2. Next: finalize v3 copy, build HackerRank displacement track.", clientKey: "coderpad" },
  charm: { id: "2", title: "SKMR Campaign Framework", date: "May 30", summary: "SKMR campaign framework presented. Prioritize boring brand industrial verticals first. Next: refine first 2 specs for launch.", clientKey: "charm" },
  haus: { id: "3", title: "Haus Engager Pipeline", date: "May 28", summary: "LinkedIn and X engager capture pipeline running. Next: tune enrichment waterfall accuracy.", clientKey: "haus" },
  kopp: { id: "4", title: "Kopp Pipeline Review", date: "May 27", summary: "Pipeline review and outbound strategy check-in. Current verticals performing steady. Next: expand into adjacent segments.", clientKey: "kopp" },
};

const DEMO_SLACK: SlackSummary[] = [
  {
    workspace: "GTM Garden",
    unreadMentions: 2,
    needsReply: [
      { text: "Hey Drew - can you review the Haus enrichment waterfall?", channelName: "haus-ops", user: "Chris Allen", permalink: null },
    ],
  },
];

const STATUS_FLOW: QueueStatus[] = ["ready", "in-progress", "blocked", "done"];
const CLOSED_QUEUE_STATUSES: QueueStatus[] = ["done", "archived", "cancelled"];
const STATUS_COLUMNS: { key: QueueStatus; label: string; dot: string; terminal?: boolean }[] = [
  { key: "ready", label: "Ready", dot: "bg-zinc-400" },
  { key: "in-progress", label: "In progress", dot: "bg-blue-500" },
  { key: "blocked", label: "Blocked", dot: "bg-red-500" },
  { key: "done", label: "Done", dot: "bg-emerald-500" },
  { key: "archived", label: "Archived", dot: "bg-slate-500", terminal: true },
  { key: "cancelled", label: "Cancelled", dot: "bg-orange-500", terminal: true },
];

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayOffset(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}

function atToday(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function makeMockEvents(): CalendarEvent[] {
  return [
    { id: "1", title: "Dogs / Gym / Protein", start: atToday(7), end: atToday(9), workspace: "personal", clientKey: null, type: "personal", meetLink: null },
    { id: "2", title: "Weekly Kick-Off: Team Sync", start: atToday(9), end: atToday(9, 50), workspace: "gtm.garden", clientKey: null, type: "meeting", meetLink: null },
    { id: "3", title: "Drew <> Chris Allen | Sync", start: atToday(10), end: atToday(10, 45), workspace: "gtm.garden", clientKey: null, type: "meeting", meetLink: null },
    { id: "4", title: "CoderPad Internal", start: atToday(11), end: atToday(11, 30), workspace: "astra", clientKey: "coderpad", type: "meeting", meetLink: null },
    { id: "5", title: "Production Block", start: atToday(13), end: atToday(16), workspace: "personal", clientKey: null, type: "production", meetLink: null },
    { id: "6", title: "Touch Grass + Walk Dogs", start: atToday(16), end: atToday(17), workspace: "personal", clientKey: null, type: "personal", meetLink: null },
  ];
}

function makeMockQueue(): QueueItem[] {
  return [
    { id: "1", title: "Re-engagement sequence v3 - AI interview hook", client_key: "coderpad", status: "in-progress", priority: "p0", source: "granola", due_date: dayOffset(0), link: "https://granola.ai" },
    { id: "2", title: "Competitive displacement emails - HackerRank", client_key: "coderpad", status: "blocked", priority: "p0", source: "slack", due_date: dayOffset(1), link: "https://app.slack.com/client" },
    { id: "3", title: "Campaign framework - boring brand industrials", client_key: "charm", status: "ready", priority: "p1", source: "manual", due_date: dayOffset(2), link: null },
    { id: "4", title: "SKMR campaign specs - 4 remaining", client_key: "charm", status: "ready", priority: "p1", source: "manual", due_date: dayOffset(3), link: null },
    { id: "5", title: "Social engager capture system tuning", client_key: "haus", status: "in-progress", priority: "p1", source: "manual", due_date: dayOffset(1), link: null },
    { id: "6", title: "Reply eval pipeline tuning", client_key: "coderpad", status: "in-progress", priority: "p1", source: "manual", due_date: dayOffset(2), link: null },
    { id: "7", title: "Outbound strategy expansion", client_key: "kopp", status: "ready", priority: "p2", source: "manual", due_date: dayOffset(4), link: null },
    { id: "8", title: "Attio 10-object model buildout", client_key: null, status: "ready", priority: "p2", source: "manual", due_date: dayOffset(5), link: null },
  ];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function eventMinutes(iso: string) {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function formatDueDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueDayKey(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return dayKey(parsed);
}

function dateInputValue(value: string | null) {
  return dueDayKey(value) || "";
}

function getDueTone(value: string | null) {
  const key = dueDayKey(value);
  if (!key) return null;

  const today = dayKey(new Date());
  const tomorrow = dayOffset(1);
  if (key < today) return "overdue";
  if (key === today) return "today";
  if (key === tomorrow) return "soon";
  return null;
}

function needsAttention(item: QueueItem) {
  return item.status === "blocked" || item.priority === "p0" || !!getDueTone(item.due_date) || !!item.remind_at;
}

function softBg(color: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}14` : "#f4f4f5";
}

function clientRecord(clients: Omit<ClientConfig, "bg">[] | ClientConfig[]) {
  return clients.reduce<Record<string, ClientConfig>>((acc, client) => {
    acc[client.key] = {
      ...client,
      bg: "bg" in client ? client.bg : softBg(client.color),
    };
    return acc;
  }, {});
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

function ClientPill({ clientKey, clients }: { clientKey: string | null; clients: Record<string, ClientConfig> }) {
  if (!clientKey || !clients[clientKey]) return null;
  const client = clients[clientKey];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ background: client.bg, color: client.color }}
    >
      <Circle className="h-1.5 w-1.5 fill-current" />
      {client.short_name}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: QueuePriority }) {
  const variant = { p0: "destructive" as const, p1: "warning" as const, p2: "ghost" as const };
  return <Badge variant={variant[priority]} className="font-mono text-[10px] uppercase">{priority}</Badge>;
}

function healthProblem(health: IntegrationHealth | null) {
  if (!health) return null;
  const required = [health.checks.serverKey, health.checks.queue, health.checks.granola];
  const failing = required.find(check => !check.ok);
  if (failing) return `${failing.label}: ${failing.detail || "not connected"}`;
  if (!health.checks.clients.ok) return `${health.checks.clients.label}: ${health.checks.clients.detail || "not available"}`;
  if (!health.checks.granolaActions.ok) return `${health.checks.granolaActions.label}: optional migration not applied`;
  if (health.checks.rawEvents && !health.checks.rawEvents.ok) return `${health.checks.rawEvents.label}: run supabase/005_raw_events_triage.sql`;
  if (health.checks.taskCandidates && !health.checks.taskCandidates.ok) return `${health.checks.taskCandidates.label}: run supabase/005_raw_events_triage.sql`;
  return null;
}

function StatusBadge({ status }: { status: QueueStatus }) {
  const variant = {
    "in-progress": "info" as const,
    ready: "success" as const,
    blocked: "destructive" as const,
    done: "ghost" as const,
    archived: "outline" as const,
    cancelled: "warning" as const,
  };
  const label = { "in-progress": "In progress", ready: "Ready", blocked: "Blocked", done: "Done", archived: "Archived", cancelled: "Cancelled" };
  return <Badge variant={variant[status]}>{label[status]}</Badge>;
}

function HealthIndicator({ health }: { health: string }) {
  const colors = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", gray: "bg-muted-foreground/40" };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[health as keyof typeof colors] || colors.gray}`} />;
}

function MetricCard({ value, label, icon: Icon }: { value: string | number; label: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function getQueueSource(item: QueueItem) {
  if (item.source) return item.source;
  const match = item.notes?.match(/^Source:\s*(.+)$/m);
  return match?.[1]?.toLowerCase() || "manual";
}

function getQueueLink(item: QueueItem) {
  if (item.link) return item.link;
  const match = item.notes?.match(/^Note:\s*(https?:\/\/\S+)/m);
  return match?.[1] || null;
}

function noteField(notes: string | null | undefined, label: string) {
  const match = notes?.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match?.[1] || null;
}

function taskContext(item: QueueItem) {
  const context = item.notes?.match(/^Context:\n([\s\S]*?)(?:\nAction ID:|$)/m)?.[1]?.trim();
  if (context) return context;

  const fields = [
    noteField(item.notes, "Meeting"),
    noteField(item.notes, "Meeting date"),
    noteField(item.notes, "Granola client"),
    noteField(item.notes, "Extraction warning"),
  ].filter(Boolean);

  return fields.join(" - ") || item.notes || "";
}

function taskOwner(item: QueueItem) {
  return noteField(item.notes, "Owner");
}

function taskMeeting(item: QueueItem) {
  return noteField(item.notes, "Meeting");
}

function taskActionId(item: QueueItem) {
  return noteField(item.notes, "Action ID");
}

function SourceBadge({ item }: { item: QueueItem }) {
  return <Badge variant="ghost" className="text-[10px] capitalize">{getQueueSource(item)}</Badge>;
}

function QueueActions({
  item,
  onMove,
}: {
  item: QueueItem;
  onMove: (id: string, status: QueueStatus) => void;
}) {
  const statusIndex = STATUS_FLOW.indexOf(item.status);
  const previous = STATUS_FLOW[statusIndex - 1];
  const next = STATUS_FLOW[statusIndex + 1];
  const sourceLink = getQueueLink(item);
  const move = (event: MouseEvent<HTMLButtonElement>, status: QueueStatus) => {
    event.stopPropagation();
    onMove(item.id, status);
  };

  return (
    <div className="flex items-center gap-1" onClick={event => event.stopPropagation()}>
      {sourceLink && (
        <Button variant="ghost" size="icon" asChild title="Open source link">
          <a href={sourceLink} target="_blank" rel="noopener" onClick={event => event.stopPropagation()}>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        disabled={!previous}
        onClick={event => previous && move(event, previous)}
        title="Move back"
        aria-label="Move back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!next}
        onClick={event => next && move(event, next)}
        title="Move forward"
        aria-label="Move forward"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={item.status === "archived"}
        onClick={event => move(event, "archived")}
        title="Archive"
        aria-label="Archive"
      >
        <Archive className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={item.status === "cancelled"}
        onClick={event => move(event, "cancelled")}
        title="Cancel"
        aria-label="Cancel"
      >
        <Ban className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function QueueCard({
  item,
  clients,
  onMove,
  selected = false,
  selectable = false,
  onSelect,
  draggable = false,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  item: QueueItem;
  clients: Record<string, ClientConfig>;
  onMove: (id: string, status: QueueStatus) => void;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: (id: string) => void;
  draggable?: boolean;
  onDragStart?: (item: QueueItem, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onOpen?: (item: QueueItem) => void;
}) {
  const due = formatDueDate(item.due_date);
  const tone = getDueTone(item.due_date);
  const context = taskContext(item);

  return (
    <div
      data-testid="queue-card"
      data-item-id={item.id}
      draggable={draggable}
      onDragStart={event => onDragStart?.(item, event)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen?.(item)}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      className={`rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-foreground/20 ${selected ? "border-primary/50 ring-2 ring-primary/10" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : onOpen ? "cursor-pointer" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {selectable && (
            <button
              type="button"
              aria-label={selected ? "Unselect task" : "Select task"}
              onClick={event => {
                event.stopPropagation();
                onSelect?.(item.id);
              }}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {selected ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </button>
          )}
          {draggable && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />}
          <PriorityBadge priority={item.priority} />
        </div>
        <SourceBadge item={item} />
      </div>
      <div className="text-sm font-medium leading-snug">{item.title}</div>
      {context && (
        <div className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
          {context}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <ClientPill clientKey={item.client_key} clients={clients} />
        {!item.client_key && <Badge variant="ghost" className="text-[10px]">Internal</Badge>}
        {due && (
          <Badge variant={tone === "overdue" || tone === "today" ? "destructive" : tone === "soon" ? "warning" : "ghost"} className="text-[10px]">
            Due {due}
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <StatusBadge status={item.status} />
        <QueueActions item={item} onMove={onMove} />
      </div>
    </div>
  );
}

function TaskDetailPanel({
  item,
  clients,
  onClose,
  onMove,
  onSave,
}: {
  item: QueueItem;
  clients: Record<string, ClientConfig>;
  onClose: () => void;
  onMove: (id: string, status: QueueStatus) => void;
  onSave: (id: string, updates: QueueItemEdit) => Promise<void> | void;
}) {
  const sourceLink = getQueueLink(item);
  const context = taskContext(item);
  const meeting = taskMeeting(item);
  const owner = taskOwner(item);
  const actionId = taskActionId(item);
  const meetingDate = noteField(item.notes, "Meeting date");
  const extraction = noteField(item.notes, "Extraction");
  const extractionWarning = noteField(item.notes, "Extraction warning");
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDueDate, setDraftDueDate] = useState(dateInputValue(item.due_date));
  const [draftPriority, setDraftPriority] = useState<QueuePriority>(item.priority);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraftTitle(item.title);
    setDraftDueDate(dateInputValue(item.due_date));
    setDraftPriority(item.priority);
    setSaveError(null);
  }, [item.id, item.title, item.due_date, item.priority]);

  const trimmedTitle = draftTitle.trim();
  const currentDueDate = dateInputValue(item.due_date) || null;
  const nextDueDate = draftDueDate || null;
  const hasChanges = trimmedTitle !== item.title || nextDueDate !== currentDueDate || draftPriority !== item.priority;

  function resetDraft() {
    setDraftTitle(item.title);
    setDraftDueDate(dateInputValue(item.due_date));
    setDraftPriority(item.priority);
    setSaveError(null);
  }

  async function saveChanges() {
    if (!trimmedTitle) {
      setSaveError("Task title is required.");
      return;
    }
    if (!hasChanges || isSaving) return;

    const updates: QueueItemEdit = {};
    if (trimmedTitle !== item.title) updates.title = trimmedTitle;
    if (nextDueDate !== currentDueDate) updates.due_date = nextDueDate;
    if (draftPriority !== item.priority) updates.priority = draftPriority;

    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(item.id, updates);
    } catch {
      setSaveError("Could not save this task. Try again in a second.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l bg-background shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b bg-background px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={item.status} />
                <PriorityBadge priority={item.priority} />
                <SourceBadge item={item} />
                <ClientPill clientKey={item.client_key} clients={clients} />
              </div>
              <h2 className="text-lg font-semibold leading-tight tracking-tight">{item.title}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close task">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {item.status !== "in-progress" && !CLOSED_QUEUE_STATUSES.includes(item.status) && (
              <Button variant="outline" size="sm" onClick={() => onMove(item.id, "in-progress")}>
                Start
              </Button>
            )}
            {item.status !== "done" && (
              <Button variant="outline" size="sm" onClick={() => onMove(item.id, "done")}>
                Mark done
              </Button>
            )}
            {item.status !== "cancelled" && (
              <Button variant="outline" size="sm" onClick={() => onMove(item.id, "cancelled")} className="gap-1 text-orange-700">
                <Ban className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
            {item.status !== "archived" && (
              <Button variant="outline" size="sm" onClick={() => onMove(item.id, "archived")} className="gap-1">
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            )}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" htmlFor={`task-title-${item.id}`}>
              Task
            </label>
            <textarea
              id={`task-title-${item.id}`}
              value={draftTitle}
              onChange={event => setDraftTitle(event.target.value)}
              className="mt-1 min-h-[78px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-snug shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" htmlFor={`task-due-${item.id}`}>
                  Due date
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id={`task-due-${item.id}`}
                    type="date"
                    value={draftDueDate}
                    onChange={event => setDraftDueDate(event.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  {draftDueDate && (
                    <Button variant="ghost" size="sm" onClick={() => setDraftDueDate("")}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Priority</div>
                <div className="mt-1 flex rounded-md border bg-background p-1">
                  {(["p0", "p1", "p2"] as QueuePriority[]).map(priority => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => setDraftPriority(priority)}
                      className={`h-7 flex-1 rounded px-2 text-xs font-mono uppercase transition ${
                        draftPriority === priority
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {saveError ? <div className="text-xs text-destructive">{saveError}</div> : <div className="text-xs text-muted-foreground">{hasChanges ? "Unsaved changes" : "Saved"}</div>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetDraft} disabled={!hasChanges || isSaving}>
                  Reset
                </Button>
                <Button size="sm" onClick={() => void saveChanges()} disabled={!hasChanges || isSaving || !trimmedTitle} className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Client</div>
              <div className="mt-1">{item.client_key ? clients[item.client_key]?.name || item.client_key : "Internal"}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Due date</div>
              <div className="mt-1">{formatDueDate(item.due_date) || "No due date"}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Owner</div>
              <div className="mt-1">{owner || "Unassigned"}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Meeting</div>
              <div className="mt-1">{meeting || "No meeting context"}</div>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Task context
            </div>
            <div className="whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed text-foreground/85">
              {context || "No context captured yet. Future Granola imports will store a task-level context excerpt here."}
            </div>
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {meetingDate && <div><span className="font-medium text-foreground/70">Meeting date:</span> {meetingDate}</div>}
            {extraction && <div><span className="font-medium text-foreground/70">Extraction:</span> {extraction}</div>}
            {actionId && <div className="break-all"><span className="font-medium text-foreground/70">Action ID:</span> {actionId}</div>}
            {sourceLink && (
              <div className="break-all">
                <span className="font-medium text-foreground/70">Source:</span> {sourceLink}
              </div>
            )}
          </div>

          {extractionWarning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {extractionWarning}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueSheetView({
  items,
  clients,
  onMove,
  onOpen,
  selectedIds,
  onToggleSelection,
  onSetSelection,
}: {
  items: QueueItem[];
  clients: Record<string, ClientConfig>;
  onMove: (id: string, status: QueueStatus) => void;
  onOpen: (item: QueueItem) => void;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onSetSelection: (ids: string[], selected: boolean) => void;
}) {
  const sorted = [...items].sort((a, b) => {
    const priority = { p0: 0, p1: 1, p2: 2 }[a.priority] - { p0: 0, p1: 1, p2: 2 }[b.priority];
    if (priority !== 0) return priority;
    return (dueDayKey(a.due_date) || "9999-12-31").localeCompare(dueDayKey(b.due_date) || "9999-12-31");
  });
  const selectedIdSet = new Set(selectedIds);
  const sortedIds = sorted.map(item => item.id);
  const selectedVisibleCount = sortedIds.filter(id => selectedIdSet.has(id)).length;
  const allVisibleSelected = sortedIds.length > 0 && selectedVisibleCount === sortedIds.length;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-10 border-b px-3 py-2 font-semibold">
              <button
                type="button"
                aria-label={allVisibleSelected ? "Unselect visible tasks" : "Select visible tasks"}
                onClick={() => onSetSelection(sortedIds, !allVisibleSelected)}
                className="rounded p-0.5 transition hover:bg-muted"
                disabled={sortedIds.length === 0}
              >
                {allVisibleSelected ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              </button>
            </th>
            <th className="border-b px-3 py-2 font-semibold">Task</th>
            <th className="border-b px-3 py-2 font-semibold">Client</th>
            <th className="border-b px-3 py-2 font-semibold">Priority</th>
            <th className="border-b px-3 py-2 font-semibold">Status</th>
            <th className="border-b px-3 py-2 font-semibold">Due</th>
            <th className="border-b px-3 py-2 font-semibold">Owner</th>
            <th className="border-b px-3 py-2 font-semibold">Context</th>
            <th className="border-b px-3 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(item => {
            const context = taskContext(item);
            const selected = selectedIdSet.has(item.id);
            return (
              <tr
                key={item.id}
                onClick={() => onOpen(item)}
                className={`cursor-pointer border-b transition-colors hover:bg-muted/40 ${selected ? "bg-primary/[0.03]" : ""}`}
              >
                <td className="px-3 py-2 align-top" onClick={event => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={selected ? "Unselect task" : "Select task"}
                    onClick={() => onToggleSelection(item.id)}
                    className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    {selected ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  </button>
                </td>
                <td className="max-w-[260px] px-3 py-2 align-top">
                  <div className="font-medium leading-snug">{item.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground capitalize">{getQueueSource(item)}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  <ClientPill clientKey={item.client_key} clients={clients} />
                  {!item.client_key && <Badge variant="ghost" className="text-[10px]">Internal</Badge>}
                </td>
                <td className="px-3 py-2 align-top"><PriorityBadge priority={item.priority} /></td>
                <td className="px-3 py-2 align-top"><StatusBadge status={item.status} /></td>
                <td className="px-3 py-2 align-top text-xs">{formatDueDate(item.due_date) || "-"}</td>
                <td className="px-3 py-2 align-top text-xs">{taskOwner(item) || "-"}</td>
                <td className="max-w-[360px] px-3 py-2 align-top text-xs leading-snug text-muted-foreground">
                  <div className="line-clamp-3 whitespace-pre-wrap">{context || "-"}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  <QueueActions item={item} onMove={onMove} />
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">No queue items in this view</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BulkQueueBar({
  selectedCount,
  visibleCount,
  busyAction,
  onSelectVisible,
  onClear,
  onCancel,
  onArchive,
  onDelete,
}: {
  selectedCount: number;
  visibleCount: number;
  busyAction: "idle" | "cancel" | "archive" | "delete";
  onSelectVisible: () => void;
  onClear: () => void;
  onCancel: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const isBusy = busyAction !== "idle";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${selectedCount > 0 ? "border-primary/30 bg-primary/[0.03]" : "bg-muted/20"}`}>
      <div className="text-sm font-medium">
        {selectedCount > 0 ? `${selectedCount} selected` : `${visibleCount} visible`}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onSelectVisible} disabled={visibleCount === 0 || isBusy} className="gap-1">
          <CheckSquare2 className="h-3.5 w-3.5" />
          Select visible
        </Button>
        {selectedCount > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isBusy} className="gap-1 text-orange-700">
              <Ban className="h-3.5 w-3.5" />
              {busyAction === "cancel" ? "Cancelling..." : "Cancel"}
            </Button>
            <Button variant="outline" size="sm" onClick={onArchive} disabled={isBusy} className="gap-1">
              <Archive className="h-3.5 w-3.5" />
              {busyAction === "archive" ? "Archiving..." : "Archive"}
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} disabled={isBusy} className="gap-1 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              {busyAction === "delete" ? "Deleting..." : "Delete"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={isBusy}>
              Clear
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function TriageCandidateInbox({
  candidates,
  clients,
  running,
  busyId,
  onRun,
  onPromote,
  onDismiss,
}: {
  candidates: TaskCandidate[];
  clients: Record<string, ClientConfig>;
  running: boolean;
  busyId: string | null;
  onRun: () => void;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const visible = candidates.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> AI triage
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={candidates.length > 0 ? "warning" : "ghost"}>{candidates.length} pending</Badge>
            <Button variant="outline" size="sm" onClick={onRun} disabled={running} className="gap-1">
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              Run
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
            No pending candidates
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(candidate => {
              const due = formatDueDate(candidate.due_date);
              const busy = busyId === candidate.id;

              return (
                <div key={candidate.id} className="rounded-lg border bg-background px-3 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={candidate.priority} />
                    <Badge variant="ghost" className="text-[10px] capitalize">{candidate.source}</Badge>
                    <Badge variant="outline" className="text-[10px]">{Math.round(candidate.confidence * 100)}%</Badge>
                    <ClientPill clientKey={candidate.client_key} clients={clients} />
                    {!candidate.client_key && <Badge variant="ghost" className="text-[10px]">Internal</Badge>}
                    {due && <Badge variant="ghost" className="text-[10px]">Due {due}</Badge>}
                  </div>
                  <div className="text-sm font-medium leading-snug">{candidate.title}</div>
                  {(candidate.description || candidate.evidence || candidate.reason) && (
                    <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-snug text-muted-foreground">
                      {candidate.description || candidate.evidence || candidate.reason}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {candidate.source_url ? (
                      <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs">
                        <a href={candidate.source_url} target="_blank" rel="noopener">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Source
                        </a>
                      </Button>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => onDismiss(candidate.id)} disabled={busy} className="h-7 gap-1 text-xs">
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                      </Button>
                      <Button size="sm" onClick={() => onPromote(candidate.id)} disabled={busy} className="h-7 gap-1 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {candidates.length > visible.length && (
              <div className="px-1 text-xs text-muted-foreground">
                {candidates.length - visible.length} more pending
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CockpitShell() {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState("all");
  const [queueView, setQueueView] = useState<QueueView>("board");
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [triageCandidates, setTriageCandidates] = useState<TaskCandidate[]>([]);
  const [clients, setClients] = useState<Record<string, ClientConfig>>(DEFAULT_CLIENTS);
  const [granola, setGranola] = useState<Record<string, GranolaMeeting>>(FALLBACK_GRANOLA);
  const [slack, setSlack] = useState<SlackSummary[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [dataMode, setDataMode] = useState<DataMode>("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [pingState, setPingState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [granolaImporting, setGranolaImporting] = useState(false);
  const [draggingQueueId, setDraggingQueueId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<"idle" | "cancel" | "archive" | "delete">("idle");
  const [triageRunning, setTriageRunning] = useState(false);
  const [triageBusyId, setTriageBusyId] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);

    const today = dayKey(new Date());
    const [calendarResult, queueResult, slackResult, clientsResult, healthResult, triageResult] = await Promise.allSettled([
      fetchJson<{ events: CalendarEvent[] }>(`/api/calendar?date=${today}`),
      fetchJson<{ items: QueueItem[] }>("/api/queue?includeClosed=true"),
      fetchJson<{ summaries: SlackSummary[] }>("/api/slack"),
      fetchJson<{ clients: Omit<ClientConfig, "bg">[] }>("/api/clients"),
      fetchJson<IntegrationHealth>("/api/health"),
      fetchJson<{ candidates: TaskCandidate[] }>("/api/triage?status=pending"),
    ]);

    let liveCount = 0;

    const calendarEvents = calendarResult.status === "fulfilled" ? calendarResult.value.events : null;
    const queueItems = queueResult.status === "fulfilled" ? queueResult.value.items : null;
    const slackSummaries = slackResult.status === "fulfilled" ? slackResult.value.summaries : null;
    const clientItems = clientsResult.status === "fulfilled" ? clientsResult.value.clients : null;
    const healthStatus = healthResult.status === "fulfilled" ? healthResult.value : null;
    const pendingCandidates = triageResult.status === "fulfilled" ? triageResult.value.candidates : null;

    if (calendarEvents) {
      setEvents(calendarEvents);
      liveCount += 1;
    }

    if (queueItems) {
      setQueue(queueItems);
      liveCount += 1;
    }

    if (slackSummaries) {
      setSlack(slackSummaries);
      liveCount += 1;
    }

    if (clientItems) {
      setClients(clientRecord(clientItems));
      liveCount += 1;
    }

    if (pendingCandidates) {
      setTriageCandidates(pendingCandidates);
      liveCount += 1;
    }

    setHealth(healthStatus);
    setLastUpdated(new Date());
    setDataMode(liveCount > 0 ? "live" : "demo");
    if (!silent) {
      if (liveCount === 0) {
        setEvents(makeMockEvents());
        setQueue(makeMockQueue());
        setSlack(DEMO_SLACK);
        setClients(DEFAULT_CLIENTS);
        setSyncMessage("Demo mode - connect auth and integrations for live data.");
      } else {
        const queueLabel = queueItems ? `${queueItems.length} queue` : "queue unavailable";
        const clientLabel = clientItems ? `${clientItems.length} clients` : "clients unavailable";
        const healthLabel = healthStatus?.projectRef ? `Supabase ${healthStatus.projectRef}` : "Supabase unknown";
        const issue = healthProblem(healthStatus);
        setSyncMessage(issue ? `${healthLabel}: ${issue}` : `Live: ${queueLabel}, ${clientLabel}`);
      }
    }
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadData();
    const refreshTimer = window.setInterval(() => void loadData(true), 60_000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 30_000);

    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [loadData]);

  useEffect(() => {
    if (!selectedClient || dataMode !== "live") return;

    let ignore = false;
    fetchJson<{ note: { id: string; title: string; date: string; summary: string | null; url?: string | null } | null }>(`/api/granola?type=notes&client=${selectedClient}`)
      .then(data => {
        if (ignore || !data.note) return;
        const note = data.note;
        setGranola(prev => ({
          ...prev,
          [selectedClient]: {
            id: note.id,
            title: note.title,
            date: note.date,
            summary: note.summary,
            url: note.url,
            clientKey: selectedClient,
          },
        }));
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [selectedClient, dataMode]);

  useEffect(() => {
    const liveIds = new Set(queue.map(item => item.id));
    setSelectedQueueIds(ids => {
      const next = ids.filter(id => liveIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [queue]);

  async function moveQueueItem(id: string, status: QueueStatus) {
    const previous = queue;
    setQueue(items => items.map(item => item.id === id ? { ...item, status } : item));

    if (dataMode !== "live") {
      setSyncMessage("Demo queue updated locally.");
      return;
    }

    try {
      const res = await fetch("/api/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Queue update failed");
      setSyncMessage(CLOSED_QUEUE_STATUSES.includes(status) ? `Moved to ${status}.` : "Queue updated.");
    } catch {
      setQueue(previous);
      setSyncMessage("Could not update the live queue.");
    }
  }

  async function saveQueueItem(id: string, updates: QueueItemEdit) {
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    ) as QueueItemEdit;
    if (Object.keys(cleanUpdates).length === 0) return;

    const previous = queue;
    setQueue(items => items.map(item => item.id === id ? { ...item, ...cleanUpdates } : item));

    if (dataMode !== "live") {
      setSyncMessage("Demo task updated locally.");
      return;
    }

    try {
      const res = await fetch("/api/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...cleanUpdates }),
      });
      if (!res.ok) throw new Error("Task update failed");
      const data = await res.json() as { item?: QueueItem | null };
      const savedItem = data.item;
      if (savedItem) {
        setQueue(items => items.map(item => item.id === id ? savedItem : item));
      }
      setSyncMessage("Task updated.");
    } catch (err) {
      setQueue(previous);
      setSyncMessage("Could not update the live task.");
      throw err;
    }
  }

  function toggleQueueSelection(id: string) {
    setSelectedQueueIds(ids => ids.includes(id) ? ids.filter(selectedId => selectedId !== id) : [...ids, id]);
  }

  function setQueueSelection(ids: string[], selected: boolean) {
    const cleanIds = Array.from(new Set(ids.filter(Boolean)));
    setSelectedQueueIds(current => {
      if (selected) return Array.from(new Set([...current, ...cleanIds]));
      return current.filter(id => !cleanIds.includes(id));
    });
  }

  function clearQueueSelection() {
    setSelectedQueueIds([]);
  }

  async function bulkMoveQueueItems(status: Extract<QueueStatus, "archived" | "cancelled">) {
    const ids = selectedQueueIds.filter(id => queue.some(item => item.id === id));
    if (ids.length === 0) return;

    const action = status === "cancelled" ? "cancel" : "archive";
    const previous = queue;
    const previousSelection = selectedQueueIds;
    const idSet = new Set(ids);

    setBulkAction(action);
    setQueue(items => items.map(item => idSet.has(item.id) ? { ...item, status } : item));
    setSelectedQueueIds([]);

    if (dataMode !== "live") {
      setSyncMessage(`Demo: ${ids.length} tasks moved to ${status}.`);
      setBulkAction("idle");
      return;
    }

    try {
      const res = await fetch("/api/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      if (!res.ok) throw new Error("Bulk queue update failed");
      setSyncMessage(`${ids.length} tasks moved to ${status}.`);
    } catch {
      setQueue(previous);
      setSelectedQueueIds(previousSelection);
      setSyncMessage("Could not update selected tasks.");
    } finally {
      setBulkAction("idle");
    }
  }

  async function bulkDeleteQueueItems() {
    const ids = selectedQueueIds.filter(id => queue.some(item => item.id === id));
    if (ids.length === 0) return;
    const confirmed = window.confirm(`Delete ${ids.length} selected task${ids.length === 1 ? "" : "s"} from the cockpit?`);
    if (!confirmed) return;

    const previous = queue;
    const previousSelection = selectedQueueIds;
    const previousSelectedQueueId = selectedQueueId;
    const idSet = new Set(ids);

    setBulkAction("delete");
    setQueue(items => items.filter(item => !idSet.has(item.id)));
    setSelectedQueueIds([]);
    if (selectedQueueId && idSet.has(selectedQueueId)) setSelectedQueueId(null);

    if (dataMode !== "live") {
      setSyncMessage(`Demo: deleted ${ids.length} tasks.`);
      setBulkAction("idle");
      return;
    }

    try {
      const res = await fetch("/api/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Bulk queue delete failed");
      setSyncMessage(`Deleted ${ids.length} tasks.`);
    } catch {
      setQueue(previous);
      setSelectedQueueIds(previousSelection);
      setSelectedQueueId(previousSelectedQueueId);
      setSyncMessage("Could not delete selected tasks.");
    } finally {
      setBulkAction("idle");
    }
  }

  function openQueueItem(item: QueueItem) {
    setSelectedQueueId(item.id);
  }

  async function sendSlackPing() {
    setPingState("sending");
    try {
      const res = await fetch("/api/slack/ping", { method: "POST" });
      if (!res.ok) throw new Error("Slack ping failed");
      setPingState("sent");
      setSyncMessage("Slack ping sent.");
      window.setTimeout(() => setPingState("idle"), 3000);
    } catch {
      setPingState("error");
      setSyncMessage("Slack ping needs SLACK_PING_CHANNEL_ID and a connected Slack token.");
      window.setTimeout(() => setPingState("idle"), 5000);
    }
  }

  async function importGranolaActions() {
    setGranolaImporting(true);
    setSyncMessage("Syncing Granola actions to Supabase...");

    try {
      const res = await fetch("/api/granola/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const step = data.step ? `${data.step}: ` : "";
        const detail = data.detail && data.detail !== data.error ? ` (${data.detail})` : "";
        const migration = data.migration ? ` Run ${data.migration} in the Supabase project Vercel uses.` : "";
        const message = `${step}${data.error || "Granola sync failed"}${detail}${migration}`;
        throw new Error(message);
      }

      const savedTo = data.persisted === "queue_items" ? "queue DB" : "DB";
      const warning = data.warning ? ` ${data.warning}` : "";
      setSyncMessage(`Synced ${data.synced || 0} Granola actions to ${savedTo}. Added ${data.imported || 0} queue items; ${data.skipped || 0} already existed.${warning}`);
      await loadData(true);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Granola sync failed.");
    } finally {
      setGranolaImporting(false);
    }
  }

  async function runTriageNow() {
    setTriageRunning(true);
    setSyncMessage("Running AI triage...");

    try {
      const res = await fetch("/api/triage", { method: "POST" });
      const data = await res.json().catch(() => ({})) as {
        collected?: number;
        processed?: number;
        candidates?: number;
        warning?: string | null;
        error?: string;
        migration?: string;
      };
      if (!res.ok) {
        const migration = data.migration ? ` Run ${data.migration}.` : "";
        throw new Error(`${data.error || "AI triage failed."}${migration}`);
      }

      setSyncMessage(`AI triage: ${data.collected || 0} raw, ${data.processed || 0} processed, ${data.candidates || 0} candidates.${data.warning ? ` ${data.warning}` : ""}`);
      await loadData(true);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "AI triage failed.");
    } finally {
      setTriageRunning(false);
    }
  }

  async function promoteTriageCandidate(id: string) {
    setTriageBusyId(id);

    try {
      const res = await fetch("/api/triage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", id }),
      });
      const data = await res.json().catch(() => ({})) as { item?: QueueItem; error?: string; migration?: string };
      if (!res.ok) {
        const migration = data.migration ? ` Run ${data.migration}.` : "";
        throw new Error(`${data.error || "Could not approve candidate."}${migration}`);
      }

      if (data.item) {
        setQueue(items => [data.item as QueueItem, ...items.filter(item => item.id !== data.item?.id)]);
      }
      setTriageCandidates(candidates => candidates.filter(candidate => candidate.id !== id));
      setSyncMessage("Candidate approved into queue.");
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Could not approve candidate.");
    } finally {
      setTriageBusyId(null);
    }
  }

  async function dismissTriageCandidate(id: string) {
    setTriageBusyId(id);

    try {
      const res = await fetch("/api/triage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", id }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; migration?: string };
      if (!res.ok) {
        const migration = data.migration ? ` Run ${data.migration}.` : "";
        throw new Error(`${data.error || "Could not dismiss candidate."}${migration}`);
      }

      setTriageCandidates(candidates => candidates.filter(candidate => candidate.id !== id));
      setSyncMessage("Candidate dismissed.");
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Could not dismiss candidate.");
    } finally {
      setTriageBusyId(null);
    }
  }

  const totalMRR = Object.values(clients).reduce((sum, client) => sum + client.mrr, 0);
  const totalMentions = slack.reduce((sum, ws) => sum + ws.unreadMentions, 0);
  const replyItems = slack.flatMap(summary => summary.needsReply.map(message => ({ ...message, workspace: summary.workspace })));
  const filteredQueue = queueFilter === "all"
    ? queue
    : queue.filter(item => item.client_key === queueFilter || (queueFilter === "internal" && !item.client_key));
  const filteredQueueIds = filteredQueue.map(item => item.id);
  const selectedQueueIdSet = new Set(selectedQueueIds);
  const openQueue = queue.filter(item => !CLOSED_QUEUE_STATUSES.includes(item.status));
  const attentionQueue = queue.filter(item => !CLOSED_QUEUE_STATUSES.includes(item.status) && needsAttention(item)).slice(0, 5);
  const inboxQueue = openQueue
    .filter(item => !attentionQueue.some(attentionItem => attentionItem.id === item.id))
    .sort((a, b) => ({ p0: 0, p1: 1, p2: 2 }[a.priority] - { p0: 0, p1: 1, p2: 2 }[b.priority]))
    .slice(0, 8);
  const attentionCount = attentionQueue.length + replyItems.length;
  const healthIssue = healthProblem(health);
  const selectedQueueItem = selectedQueueId ? queue.find(item => item.id === selectedQueueId) || null : null;

  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const currentEvent = events.find(event => {
    const start = eventMinutes(event.start);
    const end = eventMinutes(event.end);
    return nowMin >= start && nowMin < end;
  });
  const nextEvent = events.find(event => eventMinutes(event.start) > nowMin);

  const dataBadge = dataMode === "live"
    ? <Badge variant="success" className="gap-1"><Radio className="h-3 w-3" /> Live</Badge>
    : dataMode === "loading"
      ? <Badge variant="ghost">Loading</Badge>
      : <Badge variant="warning">Demo</Badge>;

  function handleQueueDragStart(item: QueueItem, event: DragEvent<HTMLDivElement>) {
    setDraggingQueueId(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.setData("application/x-queue-item", item.id);
  }

  function handleQueueDrop(status: QueueStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-queue-item") || event.dataTransfer.getData("text/plain") || draggingQueueId;
    setDraggingQueueId(null);
    if (!id) return;

    const item = queue.find(queueItem => queueItem.id === id);
    if (!item || item.status === status) return;
    void moveQueueItem(id, status);
  }

  if (selectedClient) {
    const client = clients[selectedClient];
    if (!client) return null;
    const notes = granola[selectedClient];
    const clientQueue = queue.filter(item => item.client_key === selectedClient && !CLOSED_QUEUE_STATUSES.includes(item.status));

    return (
      <TooltipProvider>
        <div className="mx-auto max-w-3xl px-4 py-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)} className="-ml-2 mb-4 text-muted-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>

          <Card className="border-l-[3px]" style={{ borderLeftColor: client.color }}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{client.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{client.key} workspace</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <HealthIndicator health={client.health} />
                    <span className="text-sm capitalize text-muted-foreground">{client.status}</span>
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">
                    ${client.mrr.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{totalMRR ? Math.round((client.mrr / totalMRR) * 100) : 0}% of book</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {notes && (
            <Card className="mt-3">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Last meeting notes</CardTitle>
                  {notes.url && (
                    <Button variant="ghost" size="icon" asChild title="Open notes">
                      <a href={notes.url} target="_blank" rel="noopener"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-[11px] text-muted-foreground">{notes.title} - {formatDueDate(notes.date) || notes.date}</div>
                <p className="text-sm leading-relaxed text-foreground/80">{notes.summary}</p>
              </CardContent>
            </Card>
          )}

          <Card className="mt-3">
            <CardHeader><CardTitle>Active deliverables</CardTitle></CardHeader>
            <CardContent>
              {clientQueue.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">No open deliverables</p>}
              <div className="space-y-2">
                {clientQueue.map(item => (
                  <QueueCard key={item.id} item={item} clients={clients} onMove={moveQueueItem} onOpen={openQueueItem} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        {selectedQueueItem && (
          <TaskDetailPanel
            item={selectedQueueItem}
            clients={clients}
            onClose={() => setSelectedQueueId(null)}
            onMove={moveQueueItem}
            onSave={saveQueueItem}
          />
        )}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">gtm.garden</h1>
              {dataBadge}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{clock.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
              {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}</span>}
              {syncMessage && <span className="text-foreground/70">{syncMessage}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isRefreshing} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="default" size="sm" onClick={() => void sendSlackPing()} disabled={pingState === "sending"} className="gap-1.5">
              {pingState === "sent" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              Ping Slack
            </Button>
            <Button variant="ghost" size="icon" asChild className="text-muted-foreground" title="Settings">
              <Link href="/settings"><Settings className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Today
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Portfolio
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Queue
              {triageCandidates.length > 0 && <Badge variant="warning" className="ml-1 h-4 px-1 text-[10px]">{triageCandidates.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-3">
            <Card className={attentionCount > 0 ? "border-amber-200" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-1.5">
                    {attentionCount > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    Attention
                  </CardTitle>
                  <Badge variant={attentionCount > 0 ? "warning" : "success"}>{attentionCount} items</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {attentionCount === 0 && <p className="text-sm text-muted-foreground">Nothing urgent right now.</p>}
                <div className="space-y-0">
                  {replyItems.slice(0, 4).map((message, index) => (
                    <div key={`${message.workspace}-${message.channelName}-${index}`}>
                      <div className="flex items-center gap-2.5 py-2">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <Badge variant="ghost" className="shrink-0 text-[10px]">{message.workspace}</Badge>
                        <span className="shrink-0 text-xs text-muted-foreground">#{message.channelName}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{message.text}</span>
                        {message.permalink && (
                          <Button variant="ghost" size="icon" asChild title="Open Slack message">
                            <a href={message.permalink} target="_blank" rel="noopener"><ExternalLink className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                      </div>
                      {(index < replyItems.length - 1 || attentionQueue.length > 0) && <Separator />}
                    </div>
                  ))}
                  {attentionQueue.map((item, index) => (
                    <div key={item.id}>
                      <div className="flex items-center gap-2.5 py-2">
                        <BellRing className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <PriorityBadge priority={item.priority} />
                        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                        <ClientPill clientKey={item.client_key} clients={clients} />
                        <QueueActions item={item} onMove={moveQueueItem} />
                      </div>
                      {index < attentionQueue.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Work inbox</CardTitle>
                  <Badge variant={openQueue.length > 0 ? "info" : "ghost"}>{openQueue.length} open</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {dataMode === "loading" && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Loading live queue...
                  </div>
                )}
                {dataMode === "live" && openQueue.length === 0 && (
                  <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {healthIssue
                        ? `Live check: ${healthIssue}`
                        : "This Supabase has no queue items yet. Sync Granola actions into this live database."}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => void importGranolaActions()} disabled={granolaImporting} className="shrink-0 gap-1 bg-white">
                      <RefreshCw className={`h-3 w-3 ${granolaImporting ? "animate-spin" : ""}`} />
                      Sync Granola
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  {(attentionQueue.length > 0 ? attentionQueue : inboxQueue).map(item => (
                    <QueueCard key={item.id} item={item} clients={clients} onMove={moveQueueItem} onOpen={openQueueItem} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-l-[3px] border-l-emerald-500">
                <CardHeader><CardTitle className="text-[10px]">Now</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-[15px] font-medium">{currentEvent?.title || "Between meetings"}</div>
                  {currentEvent?.clientKey && <div className="mt-1.5"><ClientPill clientKey={currentEvent.clientKey} clients={clients} /></div>}
                  {!currentEvent && <p className="mt-1 text-xs text-muted-foreground">Free until {nextEvent ? formatTime(nextEvent.start) : "end of day"}</p>}
                </CardContent>
              </Card>
              <Card className="border-l-[3px] border-l-blue-500">
                <CardHeader><CardTitle className="text-[10px]">Next up</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-[15px] font-medium">{nextEvent?.title || "Done for the day"}</div>
                  {nextEvent && <p className="mt-1 text-xs text-muted-foreground">{formatTime(nextEvent.start)} in {nextEvent.workspace}</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-0.5">
                  {events.map(event => {
                    const start = eventMinutes(event.start);
                    const end = eventMinutes(event.end);
                    const isCurrent = nowMin >= start && nowMin < end;
                    const isPast = nowMin >= end;
                    return (
                      <div
                        key={event.id}
                        onClick={() => event.clientKey && setSelectedClient(event.clientKey)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${isCurrent ? "border border-emerald-200 bg-emerald-50" : "hover:bg-muted/50"} ${isPast ? "opacity-35" : ""} ${event.clientKey ? "cursor-pointer" : ""}`}
                      >
                        <span className="w-14 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatTime(event.start)}</span>
                        <span className={`min-w-0 flex-1 truncate text-sm ${isCurrent ? "font-semibold" : ""}`}>{event.title}</span>
                        <ClientPill clientKey={event.clientKey} clients={clients} />
                        {event.type === "personal" && <Badge variant="ghost" className="text-[10px]">personal</Badge>}
                        {event.type === "production" && <Badge variant="success" className="gap-1 text-[10px]"><Zap className="h-3 w-3" />build</Badge>}
                        {event.meetLink && (
                          <Button variant="ghost" size="icon" asChild title="Open meeting">
                            <a href={event.meetLink} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}><ExternalLink className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                        {event.clientKey && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Production priorities</CardTitle>
                  <span className="text-[11px] text-muted-foreground">P0 and due-now</span>
                </div>
              </CardHeader>
              <CardContent>
                {attentionQueue.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">No urgent production items</p>}
                <div className="space-y-2">
                  {attentionQueue.map(item => (
                    <QueueCard key={item.id} item={item} clients={clients} onMove={moveQueueItem} onOpen={openQueueItem} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard value={Object.keys(clients).length} label="Active clients" icon={Users} />
              <MetricCard value={`$${totalMRR.toLocaleString()}`} label="Monthly revenue" icon={TrendingUp} />
              <MetricCard value={openQueue.length} label="Open deliverables" icon={ListChecks} />
            </div>

            <Card>
              <CardHeader><CardTitle>Revenue by client</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.values(clients).sort((a, b) => b.mrr - a.mrr).map(client => (
                    <div key={client.key} onClick={() => setSelectedClient(client.key)} className="cursor-pointer group">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium transition-colors group-hover:text-foreground/80">{client.short_name}</span>
                        <span className="text-sm font-semibold tabular-nums">
                          ${client.mrr.toLocaleString()}
                          <span className="text-[11px] font-normal text-muted-foreground">/mo</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${totalMRR ? Math.round((client.mrr / totalMRR) * 100) : 0}%`, background: client.color }} />
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{totalMRR ? Math.round((client.mrr / totalMRR) * 100) : 0}% of revenue</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {Object.values(clients).sort((a, b) => b.mrr - a.mrr).map(client => (
                <Card
                  key={client.key}
                  onClick={() => setSelectedClient(client.key)}
                  className="cursor-pointer border-l-[3px] transition-shadow hover:shadow-md"
                  style={{ borderLeftColor: client.color }}
                >
                  <CardContent className="pb-4 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <HealthIndicator health={client.health} />
                          <span className="text-[15px] font-semibold">{client.name}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Last: {formatDueDate(granola[client.key]?.date || null) || "N/A"}</span>
                          <span>{queue.filter(item => item.client_key === client.key && !CLOSED_QUEUE_STATUSES.includes(item.status)).length} deliverables</span>
                          <span>{queue.filter(item => item.client_key === client.key && needsAttention(item)).length} attention</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold tabular-nums">${client.mrr.toLocaleString()}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="queue" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {[{ id: "all", label: "All" }, ...Object.values(clients).map(client => ({ id: client.key, label: client.short_name })), { id: "internal", label: "Internal" }].map(filter => (
                  <Button
                    key={filter.id}
                    variant={queueFilter === filter.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQueueFilter(filter.id)}
                    className="h-7 text-xs"
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-1 rounded-md border bg-background p-0.5">
                <Button
                  variant={queueView === "board" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setQueueView("board")}
                  className="h-7 gap-1 text-xs"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Board
                </Button>
                <Button
                  variant={queueView === "sheet" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setQueueView("sheet")}
                  className="h-7 gap-1 text-xs"
                >
                  <Table2 className="h-3.5 w-3.5" />
                  Sheet
                </Button>
              </div>
            </div>

            <TriageCandidateInbox
              candidates={triageCandidates}
              clients={clients}
              running={triageRunning}
              busyId={triageBusyId}
              onRun={() => void runTriageNow()}
              onPromote={id => void promoteTriageCandidate(id)}
              onDismiss={id => void dismissTriageCandidate(id)}
            />

            <BulkQueueBar
              selectedCount={selectedQueueIds.length}
              visibleCount={filteredQueue.length}
              busyAction={bulkAction}
              onSelectVisible={() => setQueueSelection(filteredQueueIds, true)}
              onClear={clearQueueSelection}
              onCancel={() => void bulkMoveQueueItems("cancelled")}
              onArchive={() => void bulkMoveQueueItems("archived")}
              onDelete={() => void bulkDeleteQueueItems()}
            />

            {queueView === "sheet" ? (
              <QueueSheetView
                items={filteredQueue}
                clients={clients}
                onMove={moveQueueItem}
                onOpen={openQueueItem}
                selectedIds={selectedQueueIds}
                onToggleSelection={toggleQueueSelection}
                onSetSelection={setQueueSelection}
              />
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-[1180px] grid-cols-6 gap-3">
                  {STATUS_COLUMNS.map(column => {
                    const columnItems = filteredQueue
                      .filter(item => item.status === column.key)
                      .sort((a, b) => ({ p0: 0, p1: 1, p2: 2 }[a.priority] - { p0: 0, p1: 1, p2: 2 }[b.priority]));

                    return (
                      <div
                        key={column.key}
                        onDragOver={event => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={event => handleQueueDrop(column.key, event)}
                        className={`rounded-lg border bg-muted/30 transition-colors ${draggingQueueId ? "border-primary/30 bg-primary/[0.03]" : ""}`}
                      >
                        <div className="flex items-center justify-between border-b bg-background px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</span>
                          </div>
                          <Badge variant={column.terminal ? "outline" : "ghost"} className="text-[10px] tabular-nums">{columnItems.length}</Badge>
                        </div>
                        <div className="min-h-[220px] space-y-2 p-2">
                          {columnItems.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted-foreground">Empty</div>}
                          {columnItems.map(item => (
                            <QueueCard
                              key={item.id}
                              item={item}
                              clients={clients}
                              onMove={moveQueueItem}
                              selected={selectedQueueIdSet.has(item.id)}
                              selectable
                              onSelect={toggleQueueSelection}
                              onOpen={openQueueItem}
                              draggable
                              onDragStart={handleQueueDragStart}
                              onDragEnd={() => setDraggingQueueId(null)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredQueue.some(item => getQueueLink(item)) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />
                {filteredQueue.filter(item => getQueueLink(item)).length} linked source items
              </div>
            )}
          </TabsContent>
        </Tabs>
        {selectedQueueItem && (
          <TaskDetailPanel
            item={selectedQueueItem}
            clients={clients}
            onClose={() => setSelectedQueueId(null)}
            onMove={moveQueueItem}
            onSave={saveQueueItem}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
