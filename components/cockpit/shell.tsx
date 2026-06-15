"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  CalendarDays, Layers, ListChecks, ArrowLeft,
  Circle, ChevronRight, MessageSquare, ExternalLink,
  Clock, Users, Zap, TrendingUp, Settings
} from "lucide-react";
import Link from "next/link";

// ---- Types ----
type CalendarEvent = {
  id: string; title: string; start: string; end: string;
  workspace: string; clientKey: string | null;
  type: "meeting" | "personal" | "production"; meetLink: string | null;
};

type QueueItem = {
  id: string; title: string; client_key: string | null;
  status: "ready" | "in-progress" | "blocked" | "done";
  priority: "p0" | "p1" | "p2"; due_date: string | null;
};

type ClientConfig = {
  key: string; name: string; short_name: string;
  color: string; bg: string; mrr: number; status: string; health: string;
};

type GranolaMeeting = {
  id: string; title: string; date: string;
  summary: string | null; clientKey: string | null;
};

type SlackSummary = {
  workspace: string; unreadMentions: number;
  needsReply: { text: string; channelName: string; user: string; permalink: string | null }[];
};

// ---- Fallback data ----
const CLIENTS: Record<string, ClientConfig> = {
  charm: { key: "charm", name: "Charm / SKMR & Stable Kernel", short_name: "Charm/SK", color: "#b45309", bg: "#fffbeb", mrr: 4500, status: "active", health: "green" },
  haus: { key: "haus", name: "Haus Analytics", short_name: "Haus", color: "#7c3aed", bg: "#f5f3ff", mrr: 3500, status: "active", health: "green" },
  coderpad: { key: "coderpad", name: "Astra GTM / CoderPad", short_name: "CoderPad", color: "#2563eb", bg: "#eff6ff", mrr: 3000, status: "active", health: "green" },
  kopp: { key: "kopp", name: "Kopp Consulting", short_name: "Kopp", color: "#059669", bg: "#ecfdf5", mrr: 800, status: "active", health: "green" },
};

const MOCK_EVENTS: CalendarEvent[] = [
  { id: "1", title: "Dogs / Gym / Protein", start: "2026-06-01T07:00:00", end: "2026-06-01T09:00:00", workspace: "personal", clientKey: null, type: "personal", meetLink: null },
  { id: "2", title: "Weekly Kick-Off: Team Sync", start: "2026-06-01T09:00:00", end: "2026-06-01T09:50:00", workspace: "gtm.garden", clientKey: null, type: "meeting", meetLink: null },
  { id: "3", title: "Drew <> Chris Allen | Sync", start: "2026-06-01T10:00:00", end: "2026-06-01T10:45:00", workspace: "gtm.garden", clientKey: null, type: "meeting", meetLink: null },
  { id: "4", title: "CoderPad Internal", start: "2026-06-01T11:00:00", end: "2026-06-01T11:30:00", workspace: "astra", clientKey: "coderpad", type: "meeting", meetLink: null },
  { id: "5", title: "Production Block", start: "2026-06-01T13:00:00", end: "2026-06-01T16:00:00", workspace: "personal", clientKey: null, type: "production", meetLink: null },
  { id: "6", title: "Touch Grass + Walk Dogs", start: "2026-06-01T16:00:00", end: "2026-06-01T17:00:00", workspace: "personal", clientKey: null, type: "personal", meetLink: null },
];

const MOCK_QUEUE: QueueItem[] = [
  { id: "1", title: "Re-engagement sequence v3 - AI interview hook", client_key: "coderpad", status: "in-progress", priority: "p0", due_date: "Jun 2" },
  { id: "2", title: "Competitive displacement emails (HackerRank)", client_key: "coderpad", status: "in-progress", priority: "p0", due_date: "Jun 3" },
  { id: "3", title: "Campaign framework - boring brand industrials", client_key: "charm", status: "ready", priority: "p1", due_date: "Jun 4" },
  { id: "4", title: "SKMR campaign specs (4 remaining)", client_key: "charm", status: "ready", priority: "p1", due_date: "Jun 5" },
  { id: "5", title: "Social engager capture system tuning", client_key: "haus", status: "in-progress", priority: "p1", due_date: "Jun 4" },
  { id: "6", title: "Reply eval pipeline tuning", client_key: "coderpad", status: "in-progress", priority: "p1", due_date: "Jun 4" },
  { id: "7", title: "Outbound strategy expansion", client_key: "kopp", status: "ready", priority: "p2", due_date: "Jun 6" },
  { id: "8", title: "Attio 10-object model buildout", client_key: null, status: "ready", priority: "p2", due_date: "Jun 7" },
];

const MOCK_GRANOLA: Record<string, GranolaMeeting> = {
  coderpad: { id: "1", title: "CoderPad Campaign Review", date: "May 31", summary: "Reviewed re-engagement campaign metrics. Open rates at 34% on v2. Discussed pivoting hook from product changes to AI-era interview gaps. Next: finalize v3 copy, build HackerRank displacement track.", clientKey: "coderpad" },
  charm: { id: "2", title: "SKMR Campaign Framework", date: "May 30", summary: "SKMR campaign framework presented - 4 campaign specs delivered, 17 additional ideas shared. Chris Booth wants to prioritize boring brand industrial verticals first. Next: refine first 2 specs for launch.", clientKey: "charm" },
  haus: { id: "3", title: "Haus Engager Pipeline", date: "May 28", summary: "LinkedIn + X engager capture pipeline running. Reviewed Phantombuster flows into Salesforce. Discussed expanding to additional social channels. Next: tune enrichment waterfall accuracy.", clientKey: "haus" },
  kopp: { id: "4", title: "Kopp Pipeline Review", date: "May 27", summary: "Pipeline review and outbound strategy check-in. Current verticals performing steady. Discussed expanding into 2-3 adjacent segments.", clientKey: "kopp" },
};

// ---- Helpers ----
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function eventMinutes(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// ---- Sub-components ----
function ClientPill({ clientKey }: { clientKey: string | null }) {
  if (!clientKey || !CLIENTS[clientKey]) return null;
  const c = CLIENTS[clientKey];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md"
      style={{ background: c.bg, color: c.color }}>
      <Circle className="w-1.5 h-1.5 fill-current" />
      {c.short_name}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const v = { p0: "destructive" as const, p1: "warning" as const, p2: "ghost" as const };
  return <Badge variant={v[priority as keyof typeof v] || "ghost"} className="font-mono text-[10px] uppercase">{priority}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const v = { "in-progress": "info" as const, ready: "success" as const, blocked: "destructive" as const, done: "ghost" as const };
  const l = { "in-progress": "In progress", ready: "Ready", blocked: "Blocked", done: "Done" };
  return <Badge variant={v[status as keyof typeof v] || "ghost"}>{l[status as keyof typeof l] || status}</Badge>;
}

function HealthIndicator({ health }: { health: string }) {
  const colors = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", gray: "bg-muted-foreground/40" };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[health as keyof typeof colors] || colors.gray}`} />;
}

function MetricCard({ value, label, icon: Icon }: { value: string | number; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-background">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ---- Main ----
export function CockpitShell() {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState("all");

  // Use mock data for now - swap to API fetches
  const [events] = useState<CalendarEvent[]>(MOCK_EVENTS);
  const [queue] = useState<QueueItem[]>(MOCK_QUEUE);
  const [granola] = useState(MOCK_GRANOLA);
  const [slack] = useState<SlackSummary[]>([
    { workspace: "GTM Garden", unreadMentions: 2, needsReply: [
      { text: "Hey Drew - can you review the Haus enrichment waterfall?", channelName: "haus-ops", user: "Chris Allen", permalink: null },
    ]},
    { workspace: "GTM Consulting", unreadMentions: 0, needsReply: [] },
  ]);

  const totalMRR = Object.values(CLIENTS).reduce((s, c) => s + c.mrr, 0);
  const totalMentions = slack.reduce((s, ws) => s + ws.unreadMentions, 0);
  const filteredQueue = queueFilter === "all" ? queue : queue.filter(q => q.client_key === queueFilter || (queueFilter === "internal" && !q.client_key));

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const currentEvent = events.find(e => { const s = eventMinutes(e.start), en = eventMinutes(e.end); return nowMin >= s && nowMin < en; });
  const nextEvent = events.find(e => eventMinutes(e.start) > nowMin);

  // Client deep-dive
  if (selectedClient) {
    const c = CLIENTS[selectedClient];
    if (!c) return null;
    const notes = granola[selectedClient];
    const clientQueue = queue.filter(q => q.client_key === selectedClient);

    return (
      <TooltipProvider>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)} className="mb-4 -ml-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          <Card className="border-l-[3px]" style={{ borderLeftColor: c.color }}>
            <CardContent className="pt-5">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{c.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{c.key} workspace</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <HealthIndicator health={c.health} />
                    <span className="text-sm text-muted-foreground capitalize">{c.status}</span>
                  </div>
                  <div className="text-2xl font-semibold tracking-tight mt-1">
                    ${c.mrr.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{Math.round((c.mrr / totalMRR) * 100)}% of book</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {notes && (
            <Card className="mt-3">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Last meeting notes</CardTitle>
                  <span className="text-[11px] text-muted-foreground">via Granola - {notes.date}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-foreground/80">{notes.summary}</p>
              </CardContent>
            </Card>
          )}

          {clientQueue.length > 0 && (
            <Card className="mt-3">
              <CardHeader><CardTitle>Active deliverables</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {clientQueue.map((q, i) => (
                    <div key={q.id}>
                      <div className="flex items-center gap-2.5 py-2.5">
                        <PriorityBadge priority={q.priority} />
                        <span className="flex-1 text-sm">{q.title}</span>
                        {q.due_date && <span className="text-[11px] text-muted-foreground whitespace-nowrap">Due {q.due_date}</span>}
                        <StatusBadge status={q.status} />
                      </div>
                      {i < clientQueue.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">gtm.garden</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-muted-foreground">
                {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              {totalMentions > 0 && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {totalMentions}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" asChild className="text-muted-foreground">
            <Link href="/settings"><Settings className="w-4 h-4" /></Link>
          </Button>
        </div>

        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily" className="gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Today
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Portfolio
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Queue
            </TabsTrigger>
          </TabsList>

          {/* ===== DAILY ===== */}
          <TabsContent value="daily" className="space-y-3">
            {/* Now / Next */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-l-[3px] border-l-emerald-500">
                <CardHeader><CardTitle className="text-[10px]">Now</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-[15px] font-medium">{currentEvent?.title || "Between meetings"}</div>
                  {currentEvent?.clientKey && <div className="mt-1.5"><ClientPill clientKey={currentEvent.clientKey} /></div>}
                  {!currentEvent && <p className="text-xs text-muted-foreground mt-1">Free until {nextEvent ? formatTime(nextEvent.start) : "end of day"}</p>}
                </CardContent>
              </Card>
              <Card className="border-l-[3px] border-l-blue-500">
                <CardHeader><CardTitle className="text-[10px]">Next up</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-[15px] font-medium">{nextEvent?.title || "Done for the day"}</div>
                  {nextEvent && <p className="text-xs text-muted-foreground mt-1">{formatTime(nextEvent.start)}</p>}
                </CardContent>
              </Card>
            </div>

            {/* Slack needs-reply */}
            {slack.some(s => s.needsReply.length > 0) && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Needs your reply</CardTitle></CardHeader>
                <CardContent>
                  {slack.flatMap(s => s.needsReply.map((m, i) => (
                    <div key={`${s.workspace}-${i}`} className="flex items-center gap-2.5 py-2 first:pt-0">
                      <Badge variant="ghost" className="text-[10px] shrink-0">{s.workspace}</Badge>
                      <span className="text-xs text-muted-foreground shrink-0">#{m.channelName}</span>
                      <span className="flex-1 text-sm truncate">{m.text}</span>
                      {m.permalink && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" asChild>
                          <a href={m.permalink} target="_blank" rel="noopener"><ExternalLink className="w-3 h-3" /></a>
                        </Button>
                      )}
                    </div>
                  )))}
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-0.5">
                  {events.map(e => {
                    const start = eventMinutes(e.start), end = eventMinutes(e.end);
                    const isCurrent = nowMin >= start && nowMin < end;
                    const isPast = nowMin >= end;
                    return (
                      <div key={e.id}
                        onClick={() => e.clientKey && setSelectedClient(e.clientKey)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                          ${isCurrent ? "bg-emerald-50 border border-emerald-200" : "hover:bg-muted/50"}
                          ${isPast ? "opacity-35" : ""}
                          ${e.clientKey ? "cursor-pointer" : ""}
                        `}>
                        <span className="text-xs text-muted-foreground font-mono w-14 text-right tabular-nums">{formatTime(e.start)}</span>
                        <span className={`flex-1 text-sm ${isCurrent ? "font-semibold" : ""}`}>{e.title}</span>
                        <ClientPill clientKey={e.clientKey} />
                        {e.type === "personal" && <Badge variant="ghost" className="text-[10px]">personal</Badge>}
                        {e.type === "production" && <Badge variant="success" className="text-[10px] gap-1"><Zap className="w-3 h-3" />build</Badge>}
                        {e.clientKey && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* P0 priorities */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Production priorities</CardTitle>
                  <span className="text-[11px] text-muted-foreground">1:00p - 4:00p</span>
                </div>
              </CardHeader>
              <CardContent>
                {queue.filter(q => q.priority === "p0").map((q, i, arr) => (
                  <div key={q.id}>
                    <div className="flex items-center gap-2.5 py-2.5">
                      <PriorityBadge priority={q.priority} />
                      <span className="flex-1 text-sm">{q.title}</span>
                      <ClientPill clientKey={q.client_key} />
                      <StatusBadge status={q.status} />
                    </div>
                    {i < arr.length - 1 && <Separator />}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== PORTFOLIO ===== */}
          <TabsContent value="portfolio" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard value="4" label="Active clients" icon={Users} />
              <MetricCard value={`$${totalMRR.toLocaleString()}`} label="Monthly revenue" icon={TrendingUp} />
              <MetricCard value={queue.filter(q => q.status !== "done").length} label="Open deliverables" icon={ListChecks} />
            </div>

            {/* Revenue bars */}
            <Card>
              <CardHeader><CardTitle>Revenue by client</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.values(CLIENTS).sort((a, b) => b.mrr - a.mrr).map(c => (
                    <div key={c.key} onClick={() => setSelectedClient(c.key)} className="cursor-pointer group">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium group-hover:text-foreground/80 transition-colors">{c.short_name}</span>
                        <span className="text-sm font-semibold tabular-nums">
                          ${c.mrr.toLocaleString()}
                          <span className="text-[11px] font-normal text-muted-foreground">/mo</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round((c.mrr / totalMRR) * 100)}%`, background: c.color }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{Math.round((c.mrr / totalMRR) * 100)}% of revenue</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Client cards */}
            <div className="space-y-2">
              {Object.values(CLIENTS).sort((a, b) => b.mrr - a.mrr).map(c => (
                <Card key={c.key}
                  onClick={() => setSelectedClient(c.key)}
                  className="cursor-pointer hover:shadow-md transition-shadow border-l-[3px]"
                  style={{ borderLeftColor: c.color }}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <HealthIndicator health={c.health} />
                          <span className="text-[15px] font-semibold">{c.name}</span>
                        </div>
                        <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                          <span>Last: {granola[c.key]?.date || "N/A"}</span>
                          <span>{queue.filter(q => q.client_key === c.key && q.status !== "done").length} deliverables</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold tabular-nums">${c.mrr.toLocaleString()}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Concentration note */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">Revenue note:</span> Charm/SK is 38% of revenue. No single client above 40% - healthy for now, worth watching.
            </div>
          </TabsContent>

          {/* ===== QUEUE ===== */}
          <TabsContent value="queue" className="space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {[{ id: "all", label: "All" }, ...Object.values(CLIENTS).map(c => ({ id: c.key, label: c.short_name })), { id: "internal", label: "Internal" }].map(f => (
                <Button key={f.id} variant={queueFilter === f.id ? "default" : "outline"} size="sm"
                  onClick={() => setQueueFilter(f.id)}
                  className="text-xs h-7">
                  {f.label}
                </Button>
              ))}
            </div>

            <Card>
              <CardContent className="pt-4">
                {filteredQueue.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No items match this filter</p>}
                <div className="space-y-0">
                  {filteredQueue.map((q, i) => (
                    <div key={q.id}>
                      <div className="flex items-center gap-2.5 py-2.5">
                        <PriorityBadge priority={q.priority} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{q.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <ClientPill clientKey={q.client_key} />
                            {!q.client_key && <Badge variant="ghost" className="text-[10px]">Internal</Badge>}
                            {q.due_date && <><span className="text-muted-foreground/30">|</span> Due {q.due_date}</>}
                          </div>
                        </div>
                        <StatusBadge status={q.status} />
                      </div>
                      {i < filteredQueue.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
