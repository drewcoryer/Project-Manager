import { Package } from "lucide-react";
import type { Deliverable } from "@/data/projects";

interface DeliverablesListProps {
  deliverables: Deliverable[];
}

export function DeliverablesList({ deliverables }: DeliverablesListProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-4">Primary Deliverables</h3>

      <ul className="space-y-4">
        {deliverables.map((deliverable) => (
          <li key={deliverable.id} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                {deliverable.title}
              </p>
              <p className="text-sm text-slate-500">{deliverable.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
