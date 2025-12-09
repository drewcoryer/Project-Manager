import { ClipboardCheck } from "lucide-react";
import type { AcceptanceCriteria } from "@/data/projects";

interface AcceptanceCriteriaListProps {
  criteria: AcceptanceCriteria[];
}

export function AcceptanceCriteriaList({
  criteria,
}: AcceptanceCriteriaListProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-4">Acceptance Criteria</h3>
      <p className="text-sm text-slate-500 mb-4">
        Per SOW, acceptance requires:
      </p>

      <ul className="space-y-3">
        {criteria.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <ClipboardCheck className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-slate-700">{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
