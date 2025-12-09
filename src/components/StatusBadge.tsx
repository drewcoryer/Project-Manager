import { clsx } from "clsx";
import type { TaskStatus } from "@/data/projects";

interface StatusBadgeProps {
  status: TaskStatus | "active" | "completed" | "on_hold";
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const baseClasses =
    "inline-flex items-center font-medium rounded-full capitalize";

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  };

  const statusClasses = {
    pending: "bg-slate-100 text-slate-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    active: "bg-blue-100 text-blue-700",
    on_hold: "bg-amber-100 text-amber-700",
  };

  const statusLabels = {
    pending: "Pending",
    in_progress: "In Progress",
    completed: "Completed",
    active: "Active",
    on_hold: "On Hold",
  };

  return (
    <span
      className={clsx(baseClasses, sizeClasses[size], statusClasses[status])}
    >
      {statusLabels[status]}
    </span>
  );
}
