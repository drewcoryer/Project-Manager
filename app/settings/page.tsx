"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Calendar, MessageSquare, Plus, Check,
  X, RefreshCw, ExternalLink, Wifi, WifiOff
} from "lucide-react";
import Link from "next/link";

type Workspace = {
  id: string;
  type: "google_calendar" | "slack";
  name: string;
  client_key: string | null;
  workspace_id: string | null;
  is_connected: boolean;
  last_synced_at: string | null;
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
  checks: Record<string, HealthCheck>;
};

type Client = {
  key: string;
  name: string;
  short_name: string;
  color: string;
  slack_channel_ids: string[] | null;
};

const CLIENTS: Record<string, { name: string; color: string }> = {
  charm: { name: "Charm/SK", color: "#b45309" },
  coderpad: { name: "CoderPad", color: "#2563eb" },
  haus: { name: "Haus", color: "#7c3aed" },
  kopp: { name: "Kopp", color: "#059669" },
};

export default function SettingsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [channelDrafts, setChannelDrafts] = useState<Record<string, string>>({});
  const [savingClientKey, setSavingClientKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [granolaImporting, setGranolaImporting] = useState(false);
  const [health, setHealth] = useState<IntegrationHealth | null>(null);

  useEffect(() => {
    loadWorkspaces();
    loadClients();
    loadHealth();
    // Check URL params for connection status
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setMessage(`Connected ${params.get("name") || "workspace"} successfully`);
      setTimeout(() => setMessage(null), 4000);
    }
    if (params.get("error")) {
      setMessage(`Connection failed: ${params.get("error")}`);
    }
  }, []);

  async function loadWorkspaces() {
    const res = await fetch("/api/workspaces");
    if (res.ok) {
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
    }
    setLoading(false);
  }

  async function loadClients() {
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      const nextClients = data.clients || [];
      setClients(nextClients);
      setChannelDrafts(Object.fromEntries(
        nextClients.map((client: Client) => [client.key, (client.slack_channel_ids || []).join(", ")])
      ));
    }
  }

  async function loadHealth() {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      setHealth(data);
    }
  }

  async function disconnectWorkspace(id: string) {
    await fetch("/api/workspaces", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadWorkspaces();
  }

  function connectGoogle(name: string, clientKey: string) {
    window.location.href = `/api/auth/callback/google?action=connect&name=${encodeURIComponent(name)}&client_key=${clientKey}`;
  }

  function connectSlack(name: string, clientKey: string) {
    window.location.href = `/api/auth/callback/slack?action=connect&name=${encodeURIComponent(name)}&client_key=${clientKey}`;
  }

  async function importGranolaActions() {
    setGranolaImporting(true);
    setMessage(null);

    const res = await fetch("/api/granola/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const savedTo = data.persisted === "queue_items" ? "queue DB" : "DB";
      const warning = data.warning ? ` ${data.warning}` : "";
      setMessage(`Synced ${data.synced || 0} Granola actions to ${savedTo}. Added ${data.imported || 0} queue items (${data.skipped || 0} already existed).${warning}`);
      await loadHealth();
    } else {
      const step = data.step ? `${data.step}: ` : "";
      const detail = data.detail && data.detail !== data.error ? ` (${data.detail})` : "";
      const migration = data.migration ? ` Run ${data.migration} in the Supabase project Vercel uses.` : "";
      const message = `${step}${data.error || "Granola sync failed"}${detail}${migration}`;
      setMessage(`Sync failed: ${message}`);
      await loadHealth();
    }

    setGranolaImporting(false);
  }

  async function saveClientSlackChannels(clientKey: string) {
    setSavingClientKey(clientKey);
    setMessage(null);

    const channelIds = (channelDrafts[clientKey] || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: clientKey, slack_channel_ids: channelIds }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setClients(prev => prev.map(client => client.key === clientKey ? data.client : client));
      setMessage(`Saved Slack channel for ${data.client?.short_name || clientKey}.`);
    } else {
      setMessage(`Save failed: ${data.error || "Could not update Slack channel"}`);
    }

    setSavingClientKey(null);
  }

  const calendarWorkspaces = workspaces.filter(w => w.type === "google_calendar");
  const slackWorkspaces = workspaces.filter(w => w.type === "slack");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Connect your workspaces to power the cockpit</p>
        </div>
      </div>

      {/* Success/error message */}
      {message && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm flex items-center gap-2 ${
          message.includes("failed") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
        }`}>
          {message.includes("failed") ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {message}
        </div>
      )}

      {health && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Wifi className="w-4 h-4" /> Integration Health</span>
              <Badge variant={health.ok ? "success" : "warning"}>
                {health.projectRef ? `Supabase ${health.projectRef}` : "Supabase unknown"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(health.checks).map(([key, check]) => (
                <div key={key} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{check.label}</div>
                    {check.detail && <div className="mt-0.5 text-[11px] text-muted-foreground break-words">{check.detail}</div>}
                  </div>
                  <Badge variant={check.ok ? "success" : "warning"} className="shrink-0">
                    {check.ok ? (typeof check.count === "number" ? String(check.count) : "OK") : "Issue"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Calendar Workspaces */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Google Calendar Workspaces
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Connect each Google Workspace calendar. You'll sign into each Google account separately.
          </p>
          <div className="space-y-2">
            {calendarWorkspaces.map(ws => (
              <div key={ws.id} className="flex items-center gap-3 px-3 py-3 rounded-lg border bg-background">
                {ws.is_connected ? (
                  <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 text-zinc-300 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ws.name}</span>
                    {ws.client_key && CLIENTS[ws.client_key] && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: CLIENTS[ws.client_key].color + "15", color: CLIENTS[ws.client_key].color }}>
                        {CLIENTS[ws.client_key].name}
                      </span>
                    )}
                  </div>
                  {ws.is_connected && ws.workspace_id && (
                    <span className="text-[11px] text-muted-foreground">{ws.workspace_id}</span>
                  )}
                  {ws.is_connected && ws.last_synced_at && (
                    <span className="text-[11px] text-muted-foreground ml-2">
                      Synced {new Date(ws.last_synced_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {ws.is_connected ? (
                  <Button variant="ghost" size="sm" onClick={() => disconnectWorkspace(ws.id)} className="text-xs text-muted-foreground">
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => connectGoogle(ws.name, ws.client_key || "")} className="text-xs gap-1">
                    <Plus className="w-3 h-3" /> Connect
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Separator className="my-4" />
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1"
            onClick={() => connectGoogle("New Workspace", "")}>
            <Plus className="w-3 h-3" /> Add another calendar
          </Button>
        </CardContent>
      </Card>

      {/* Slack Workspaces */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Slack Workspaces
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your owned workspaces. You can also try connecting client workspaces where you're a member -
            it works if their admin settings allow third-party apps.
          </p>
          <div className="space-y-2">
            {slackWorkspaces.map(ws => (
              <div key={ws.id} className="flex items-center gap-3 px-3 py-3 rounded-lg border bg-background">
                {ws.is_connected ? (
                  <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 text-zinc-300 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ws.name}</span>
                    {ws.client_key && CLIENTS[ws.client_key] && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: CLIENTS[ws.client_key].color + "15", color: CLIENTS[ws.client_key].color }}>
                        {CLIENTS[ws.client_key].name}
                      </span>
                    )}
                  </div>
                  {ws.is_connected && (
                    <span className="text-[11px] text-muted-foreground">
                      Connected {ws.last_synced_at ? new Date(ws.last_synced_at).toLocaleDateString() : ""}
                    </span>
                  )}
                </div>
                {ws.is_connected ? (
                  <Button variant="ghost" size="sm" onClick={() => disconnectWorkspace(ws.id)} className="text-xs text-muted-foreground">
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => connectSlack(ws.name, ws.client_key || "")} className="text-xs gap-1">
                    <Plus className="w-3 h-3" /> Connect
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Separator className="my-4" />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1"
              onClick={() => connectSlack("New Workspace", "")}>
              <Plus className="w-3 h-3" /> Add workspace
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Client Slack Channels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {clients.map(client => (
              <div key={client.key} className="flex flex-col gap-2 rounded-lg border bg-background px-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-36">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: client.color }} />
                    <span className="truncate text-sm font-medium">{client.short_name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{client.key}</div>
                </div>
                <input
                  value={channelDrafts[client.key] || ""}
                  onChange={event => setChannelDrafts(prev => ({ ...prev, [client.key]: event.target.value }))}
                  placeholder="C0123456789"
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void saveClientSlackChannels(client.key)}
                  disabled={savingClientKey === client.key}
                  className="gap-1"
                >
                  <Check className="w-3 h-3" />
                  Save
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> API Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Granola</div>
                <div className="text-[11px] text-muted-foreground">Meeting notes</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={process.env.NEXT_PUBLIC_GRANOLA_CONNECTED === "true" ? "success" : "ghost"}>
                  {process.env.NEXT_PUBLIC_GRANOLA_CONNECTED === "true" ? "Connected" : "Set in .env"}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => void importGranolaActions()} disabled={granolaImporting} className="gap-1">
                  <RefreshCw className={`w-3 h-3 ${granolaImporting ? "animate-spin" : ""}`} />
                  Sync
                </Button>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">Attio</div>
                <div className="text-[11px] text-muted-foreground">CRM pipeline (future)</div>
              </div>
              <Badge variant="ghost">Set in .env</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Setup checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { label: "Run Supabase migration", done: workspaces.length > 0 },
              { label: "Connect at least one Google Calendar", done: calendarWorkspaces.some(w => w.is_connected) },
              { label: "Connect at least one Slack workspace", done: slackWorkspaces.some(w => w.is_connected) },
              { label: "Add Granola API key to .env", done: false },
              { label: "Add queue items", done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {item.done ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-zinc-200" />
                )}
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
