import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import type { Dependency } from "@/data/projects";

interface DependenciesListProps {
  dependencies: Dependency[];
}

export function DependenciesList({ dependencies }: DependenciesListProps) {
  const pendingCount = dependencies.filter((d) => !d.completed).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Dependencies</h3>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-amber-600">
            <AlertCircle className="w-4 h-4" />
            {pendingCount} pending
          </span>
        )}
      </div>

      <ul className="space-y-3">
        {dependencies.map((dep) => (
          <li key={dep.id} className="flex items-start gap-3">
            {dep.completed ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700">{dep.title}</p>
              <p className="text-xs text-slate-500">Due: {dep.deadline}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
