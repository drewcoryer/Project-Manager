"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileText, Hash, Table2, Mail, Video } from "lucide-react";

export type ResourceLink = {
  id: string;
  label: string;
  url: string;
  type: "doc" | "sheet" | "slack" | "clay" | "email" | "video" | "other";
  pinned: boolean;
};

const TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  doc: { icon: FileText, color: "text-blue-500" },
  sheet: { icon: Table2, color: "text-emerald-500" },
  slack: { icon: Hash, color: "text-purple-500" },
  clay: { icon: Table2, color: "text-amber-500" },
  email: { icon: Mail, color: "text-red-500" },
  video: { icon: Video, color: "text-pink-500" },
  other: { icon: ExternalLink, color: "text-zinc-500" },
};

interface ClientResourcesProps {
  links: ResourceLink[];
}

export function ClientResources({ links }: ClientResourcesProps) {
  if (links.length === 0) return null;

  const pinned = links.filter(l => l.pinned);
  const rest = links.filter(l => !l.pinned);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" /> Resources & Links
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Pinned links - larger, more prominent */}
        {pinned.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {pinned.map(link => {
              const config = TYPE_CONFIG[link.type] || TYPE_CONFIG.other;
              const Icon = config.icon;
              return (
                <a key={link.id} href={link.url} target="_blank" rel="noopener"
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all bg-white">
                  <Icon className={`w-4 h-4 shrink-0 ${config.color}`} />
                  <span className="text-sm font-medium text-zinc-800 truncate">{link.label}</span>
                </a>
              );
            })}
          </div>
        )}

        {/* Other links - compact list */}
        {rest.length > 0 && (
          <div className="space-y-1">
            {rest.map(link => {
              const config = TYPE_CONFIG[link.type] || TYPE_CONFIG.other;
              const Icon = config.icon;
              return (
                <a key={link.id} href={link.url} target="_blank" rel="noopener"
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 transition-colors">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />
                  <span className="text-[13px] text-zinc-700 truncate flex-1">{link.label}</span>
                  <ExternalLink className="w-3 h-3 text-zinc-300" />
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
