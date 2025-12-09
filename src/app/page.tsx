import { currentUser } from "@clerk/nextjs/server";
import { Header } from "@/components/Header";
import { ProjectCard } from "@/components/ProjectCard";
import { projects } from "@/data/projects";
import { Briefcase } from "lucide-react";

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-slate-600 mt-1">
            Here&apos;s an overview of your active projects
          </p>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {projects.filter((p) => p.status === "active").length}
                </p>
                <p className="text-sm text-slate-500">Active Projects</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {projects
                    .flatMap((p) => p.timeline)
                    .flatMap((d) => d.tasks)
                    .filter((t) => t.status === "in_progress").length}
                </p>
                <p className="text-sm text-slate-500">In Progress</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {projects
                    .flatMap((p) => p.timeline)
                    .flatMap((d) => d.tasks)
                    .filter((t) => t.status === "completed").length}
                </p>
                <p className="text-sm text-slate-500">Completed Tasks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Projects grid */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Your Projects
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
