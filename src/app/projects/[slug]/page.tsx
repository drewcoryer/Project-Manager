import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { TimelineDay } from "@/components/TimelineDay";
import { DependenciesList } from "@/components/DependenciesList";
import { DeliverablesList } from "@/components/DeliverablesList";
import { AcceptanceCriteriaList } from "@/components/AcceptanceCriteriaList";
import { getProjectBySlug } from "@/data/projects";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  const allTasks = project.timeline.flatMap((day) => day.tasks);
  const completedTasks = allTasks.filter((t) => t.status === "completed").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* Project header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  {project.title}
                </h1>
                <StatusBadge status={project.status} />
              </div>
              <p className="text-slate-600">Client: {project.client}</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Delivery: {project.deliveryDate}</span>
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Executive Summary
            </h2>
            <p className="text-slate-600">{project.executiveSummary}</p>
          </div>

          {/* Overall Progress */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
              Overall Progress
            </h2>
            <ProgressBar completed={completedTasks} total={allTasks.length} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Timeline */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              3-Day Sprint Timeline
            </h2>
            <div className="space-y-0">
              {project.timeline.map((dayPlan, index) => (
                <TimelineDay
                  key={dayPlan.day}
                  dayPlan={dayPlan}
                  isLast={index === project.timeline.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Right column - Sidebar */}
          <div className="space-y-6">
            <DependenciesList dependencies={project.dependencies} />
            <DeliverablesList deliverables={project.deliverables} />
            <AcceptanceCriteriaList criteria={project.acceptanceCriteria} />

            {/* Prepared By */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Prepared By</h3>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {project.preparedBy.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {project.preparedBy.title}
                  </p>
                  <p className="text-sm text-slate-500">
                    {project.preparedBy.company}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {project.preparedBy.date}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
