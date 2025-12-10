"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { DayPlan, Task, TaskStatus } from "@/data/projects";
import { clsx } from "clsx";

interface TimelineDayProps {
  dayPlan: DayPlan;
  isLast?: boolean;
}

function TaskItem({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) {
  const statusIcons = {
    pending: <Circle className="w-5 h-5 text-slate-300" />,
    in_progress: <Clock className="w-5 h-5 text-blue-500" />,
    completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  };

  return (
    <li
      className="flex items-start gap-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors"
      onClick={onToggle}
    >
      <span className="mt-0.5 flex-shrink-0">{statusIcons[task.status]}</span>
      <span
        className={clsx(
          "text-sm",
          task.status === "completed"
            ? "text-slate-500 line-through"
            : "text-slate-700"
        )}
      >
        {task.title}
      </span>
    </li>
  );
}

export function TimelineDay({ dayPlan, isLast }: TimelineDayProps) {
  const [tasks, setTasks] = useState<Task[]>(dayPlan.tasks);

  const toggleTask = (taskId: string) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) => {
        if (task.id === taskId) {
          const newStatus: TaskStatus =
            task.status === "completed" ? "pending" : "completed";
          return { ...task, status: newStatus };
        }
        return task;
      })
    );
  };

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const allCompleted = completedCount === tasks.length;
  const hasProgress = completedCount > 0;

  return (
    <div className="relative flex gap-6">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200" />
      )}

      {/* Day indicator */}
      <div
        className={clsx(
          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold",
          allCompleted
            ? "bg-green-100 text-green-700"
            : hasProgress
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-600"
        )}
      >
        D{dayPlan.day}
      </div>

      {/* Day content */}
      <div className="flex-1 pb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900">
                Day {dayPlan.day}: {dayPlan.title}
              </h3>
              <p className="text-sm text-slate-500">{dayPlan.date}</p>
            </div>
            <span className="text-sm text-slate-500">
              {completedCount}/{tasks.length} tasks
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
