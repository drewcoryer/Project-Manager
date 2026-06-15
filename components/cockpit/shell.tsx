"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Layers,
  Link2,
  ListChecks,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Settings,
  TrendingUp,
  Users,
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

type QueueStatus = "ready" | "in-progress" | "blocked" | "done";
type QueuePriority = "p0" | "p1" | "p2";
type QueueSource = "manual" | "granola" | "slack" | "calendar";

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

type DataMode = "loading" | "live" | "demo" | "error";

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

const STATUS_FLOW: QueueStatus[] = ["ready", "in-progress", "blocked", "done"];
const STATUS_COLUMNS: { key: QueueStatus; label: string; dot: string }[] = [
  { key: "ready", label: "Ready", dot: "bg-zinc-400" },
  { key: "in-progress", label: "In progress", dot: "bg-blue-500" },
  { key: "blocked", label: "Blocked", dot: "bg-red-500" },
  { key: "done", label: "Done", dot: "bg-emerald-500" },
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

function StatusBadge({ status }: { status: QueueStatus }) {
  const variant = { "in-progress": "info" as const, ready: "success" as const, blocked: "destructive" as const, done: "ghost" as const };
  const label = { "in-progress": "In progress", ready: "Ready", blocked: "Blocked", done: "Done" };
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

function SourceBadge({ source }: { source: QueueSource | undefined }) {
  const label = source || "manual";
  return <Badge variant="ghost" className="text-[10px] capitalize">{label}</Badge>;
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

  return (
    <div className="flex items-center gap-1">
      {item.link && (
      <Button variant="ghost" size="icon" asChild title="Open source link">
        <a href={item.link} target="_blank" rel="noopener">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        disabled={!previous}
        onClick={() => previous && onMove(item.id, previous)}
        title="Move back"
        aria-label="Move back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!next}
        onClick={() => next && onMove(item.id, next)}
        title="Move forward"
        aria-label="Move forward"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function QueueCard({
  item,
  clients,
  onMove,
}: {
  item: QueueItem;
  clients: Record<string, ClientConfig>;
  onMove: (id: string, status: QueueStatus) => void;
}) {
  const due = formatDueDate(item.due_date);
  const tone = getDueTone(item.due_date);
  const title = item.link ? (
    <a href={item.link} target="_blank" rel="noopener" className="hover:text-foreground/70">
      {item.title}
    </a>
  ) : item.title;

  return (
    <div data-testid="queue-card" data-item-id={item.id} className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <PriorityBadge priority={item.priority} />
        <SourceBadge source={item.source} />
      </div>
      <div className="text-sm font-medium leading-snug">{title}</div>
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

export function CockpitShell() {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState("all");
  const [events, setEvents] = useState<CalendarEvent[]>(() => makeMockEvents());
  const [queue, setQueue] = useState<QueueItem[]>(() => makeMockQueue());
  const [clients, setClients] = useState<Record<string, ClientConfig>>(DEFAULT_CLIENTS);
  const [granola, setGranola] = useState<Record<string, GranolaMeeting>>(FALLBACK_GRANOLA);
  const [slack, setSlack] = useState<SlackSummary[]>([
    {
      workspace: "GTM Garden",
      unreadMentions: 2,
      needsReply: [
        { text: "Hey Drew - can you review the Haus enrichment waterfall?", channelName: "haus-ops", user: "Chris Allen", permalink: null },
      ],
    },
  ]);
  const [clock, setClock] = useState(() => new Date());
  const [dataMode, setDataMode] = useState<DataMode>("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pingState, setPingState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);

    const today = dayKey(new Date());
    const [calendarResult, queueResult, slackResult, clientsResult] = await Promise.allSettled([
      fetchJson<{ events: CalendarEvent[] }>(`/api/calendar?date=${today}`),
      fetchJson<{ items: QueueItem[] }>("/api/queue"),
      fetchJson<{ summaries: SlackSummary[] }>("/api/slack"),
      fetchJson<{ clients: Omit<ClientConfig, "bg">[] }>("/api/clients"),
    ]);

    let liveCount = 0;

    if (calendarResult.status === "fulfilled") {
      setEvents(calendarResult.value.events);
      liveCount += 1;
    }

    if (queueResult.status === "fulfilled") {
      setQueue(queueResult.value.items);
      liveCount += 1;
    }

    if (slackResult.status === "fulfilled") {
      setSlack(slackResult.value.summaries);
      liveCount += 1;
    }

    if (clientsResult.status === "fulfilled") {
      setClients(clientRecord(clientsResult.value.clients));
      liveCount += 1;
    }

    setLastUpdated(new Date());
    setDataMode(liveCount > 0 ? "live" : "demo");
    if (!silent) setSyncMessage(liveCount > 0 ? null : "Demo mode - connect auth and integrations for live data.");
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
      setSyncMessage(status === "done" ? "Marked done." : "Queue updated.");
    } catch {
      setQueue(previous);
      setSyncMessage("Could not update the live queue.");
    }
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

  const totalMRR = Object.values(clients).reduce((sum, client) => sum + client.mrr, 0);
  const totalMentions = slack.reduce((sum, ws) => sum + ws.unreadMentions, 0);
  const replyItems = slack.flatMap(summary => summary.needsReply.map(message => ({ ...message, workspace: summary.workspace })));
  const filteredQueue = queueFilter === "all"
    ? queue
    : queue.filter(item => item.client_key === queueFilter || (queueFilter === "internal" && !item.client_key));
  const openQueue = queue.filter(item => item.status !== "done");
  const attentionQueue = queue.filter(item => item.status !== "done" && needsAttention(item)).slice(0, 5);
  const attentionCount = attentionQueue.length + replyItems.length;

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

  if (selectedClient) {
    const client = clients[selectedClient];
    if (!client) return null;
    const notes = granola[selectedClient];
    const clientQueue = queue.filter(item => item.client_key === selectedClient && item.status !== "done");

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
                  <QueueCard key={item.id} item={item} clients={clients} onMove={moveQueueItem} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
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
                    <QueueCard key={item.id} item={item} clients={clients} onMove={moveQueueItem} />
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
                          <span>{queue.filter(item => item.client_key === client.key && item.status !== "done").length} deliverables</span>
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

            <div className="grid gap-3 lg:grid-cols-4">
              {STATUS_COLUMNS.map(column => {
                const columnItems = filteredQueue
                  .filter(item => item.status === column.key)
                  .sort((a, b) => ({ p0: 0, p1: 1, p2: 2 }[a.priority] - { p0: 0, p1: 1, p2: 2 }[b.priority]));

                return (
                  <div key={column.key} className="rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between border-b bg-background px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</span>
                      </div>
                      <Badge variant="ghost" className="text-[10px] tabular-nums">{columnItems.length}</Badge>
                    </div>
                    <div className="min-h-[180px] space-y-2 p-2">
                      {columnItems.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted-foreground">Empty</div>}
                      {columnItems.map(item => (
                        <QueueCard key={item.id} item={item} clients={clients} onMove={moveQueueItem} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredQueue.some(item => item.link) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />
                {filteredQueue.filter(item => item.link).length} linked source items
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
