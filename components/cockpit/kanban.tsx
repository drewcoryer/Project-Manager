"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, ChevronLeft, Circle, ExternalLink,
  GripVertical, Plus
} from "lucide-react";

export type KanbanItem = {
  id: string;
  title: string;
  clientKey: string | null;
  clientLabel: string;
  status: "ready" | "in-progress" | "blocked" | "done";
  priority: "p0" | "p1" | "p2";
  source: "granola" | "manual" | "slack" | "calendar" | "gmail";
  dueDate: string | null;
  link: string | null;
};

type ClientConfig = {
  short_name: string;
  color: string;
  bg: string;
};

const COLUMNS: { key: KanbanItem["status"]; label: string; color: string; dotColor: string }[] = [
  { key: "ready", label: "Ready", color: "border-t-zinc-300", dotColor: "bg-zinc-400" },
  { key: "in-progress", label: "In Progress", color: "border-t-blue-400", dotColor: "bg-blue-500" },
  { key: "blocked", label: "Blocked", color: "border-t-red-400", dotColor: "bg-red-500" },
  { key: "done", label: "Done", color: "border-t-emerald-400", dotColor: "bg-emerald-500" },
];

const PRIORITY_STYLES: Record<string, string> = {
  p0: "bg-red-50 text-red-700 border-red-200",
  p1: "bg-amber-50 text-amber-700 border-amber-200",
  p2: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const SOURCE_ICON: Record<string, string> = {
  granola: "📝",
  slack: "💬",
  calendar: "📅",
  gmail: "✉️",
  manual: "✏️",
};

interface KanbanBoardProps {
  items: KanbanItem[];
  clients: Record<string, ClientConfig>;
  onMoveItem: (id: string, newStatus: KanbanItem["status"]) => void;
  onAddItem?: () => void;
  filterClient: string;
}

export function KanbanBoard({ items, clients, onMoveItem, onAddItem, filterClient }: KanbanBoardProps) {
  const [expandedDone, setExpandedDone] = useState(false);

  const filtered = filterClient === "all"
    ? items
    : items.filter(i => i.clientKey === filterClient || (filterClient === "internal" && !i.clientKey));

  const statusOrder: KanbanItem["status"][] = ["ready", "in-progress", "blocked", "done"];

  function moveRight(item: KanbanItem) {
    const idx = statusOrder.indexOf(item.status);
    if (idx < statusOrder.length - 1) onMoveItem(item.id, statusOrder[idx + 1]);
  }

  function moveLeft(item: KanbanItem) {
    const idx = statusOrder.indexOf(item.status);
    if (idx > 0) onMoveItem(item.id, statusOrder[idx - 1]);
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {COLUMNS.map(col => {
        const colItems = filtered
          .filter(i => i.status === col.key)
          .sort((a, b) => {
            const pOrder = { p0: 0, p1: 1, p2: 2 };
            return (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2);
          });

        const showItems = col.key === "done" && !expandedDone
          ? colItems.slice(0, 3)
          : colItems;

        return (
          <div key={col.key} className="flex flex-col">
            {/* Column header */}
            <div className={`rounded-t-lg border-t-[3px] ${col.color} bg-white border border-zinc-200 border-t-0 px-3 py-2 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">{col.label}</span>
              </div>
              <Badge variant="ghost" className="text-[10px] tabular-nums">{colItems.length}</Badge>
            </div>

            {/* Column body */}
            <div className="flex-1 bg-zinc-50/50 border border-t-0 border-zinc-200 rounded-b-lg p-2 space-y-2 min-h-[200px]">
              {showItems.map(item => {
                const client = item.clientKey ? clients[item.clientKey] : null;
                return (
                  <div key={item.id}
                    className="bg-white rounded-lg border border-zinc-200 p-3 shadow-sm hover:shadow-md transition-shadow group">
                    {/* Priority + source */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[item.priority]}`}>
                        {item.priority}
                      </span>
                      <span className="text-[10px]" title={`Source: ${item.source}`}>
                        {SOURCE_ICON[item.source]}
                      </span>
                    </div>

                    {/* Title */}
                    <p className="text-[13px] font-medium text-zinc-800 leading-snug mb-2">{item.title}</p>

                    {/* Client pill */}
                    {client && (
                      <div className="flex items-center gap-1 mb-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: client.bg, color: client.color }}>
                          <Circle className="w-1.5 h-1.5 fill-current" />
                          {client.short_name}
                        </span>
                        {item.dueDate && (
                          <span className="text-[10px] text-zinc-400 ml-auto">Due {item.dueDate}</span>
                        )}
                      </div>
                    )}

                    {/* Link */}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener"
                        className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 mb-2 truncate">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.link.replace(/https?:\/\//, '').slice(0, 40)}</span>
                      </a>
                    )}

                    {/* Move controls */}
                    <div className="flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-zinc-400"
                        disabled={col.key === "ready"}
                        onClick={() => moveLeft(item)}>
                        <ChevronLeft className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-zinc-400"
                        disabled={col.key === "done"}
                        onClick={() => moveRight(item)}>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Expand done */}
              {col.key === "done" && colItems.length > 3 && !expandedDone && (
                <Button variant="ghost" size="sm" className="w-full text-[11px] text-zinc-400"
                  onClick={() => setExpandedDone(true)}>
                  Show {colItems.length - 3} more
                </Button>
              )}

              {/* Add item (ready column only) */}
              {col.key === "ready" && onAddItem && (
                <Button variant="ghost" size="sm" className="w-full text-[11px] text-zinc-400 border border-dashed border-zinc-200"
                  onClick={onAddItem}>
                  <Plus className="w-3 h-3 mr-1" /> Add item
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
