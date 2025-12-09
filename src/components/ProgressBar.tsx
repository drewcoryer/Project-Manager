import { clsx } from "clsx";

interface ProgressBarProps {
  completed: number;
  total: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ProgressBar({
  completed,
  total,
  showLabel = true,
  size = "md",
}: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div
        className={clsx(
          "w-full bg-slate-200 rounded-full overflow-hidden",
          size === "sm" ? "h-1.5" : "h-2.5"
        )}
      >
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-500",
            percentage === 100
              ? "bg-green-500"
              : percentage > 0
                ? "bg-blue-500"
                : "bg-slate-300"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-slate-500 mt-1">
          {completed} of {total} tasks completed ({percentage}%)
        </p>
      )}
    </div>
  );
}
