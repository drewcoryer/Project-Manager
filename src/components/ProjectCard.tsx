import Link from "next/link";
import { Calendar, ChevronRight, Users } from "lucide-react";
import type { Project } from "@/data/projects";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const allTasks = project.timeline.flatMap((day) => day.tasks);
  const completedTasks = allTasks.filter((t) => t.status === "completed").length;

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="block bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            {project.title}
          </h3>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="w-4 h-4" />
            <span>{project.client}</span>
          </div>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <p className="text-sm text-slate-600 mb-4 line-clamp-2">
        {project.executiveSummary}
      </p>

      <div className="mb-4">
        <ProgressBar completed={completedTasks} total={allTasks.length} />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="w-4 h-4" />
          <span>Due: {project.deliveryDate}</span>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400" />
      </div>
    </Link>
  );
}
