import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getJob } from "./api";
import { fetchJobs, fetchWorkers } from "./dashboardApi";
import { formatWorkerLabel } from "./formatters";
import { StatCard, StatusBadge, Surface } from "./ui";

export default function DashboardPage() {
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [jobsResponse, workersResponse] = await Promise.all([
          fetchJobs(),
          fetchWorkers().catch(() => ({ data: [] })),
        ]);

        if (cancelled) return;

        const latestJobs = jobsResponse.data || [];
        const latestWorkers = workersResponse.data || [];
        setJobs(latestJobs);
        setWorkers(latestWorkers);
        setError("");

        const detailResponses = await Promise.all(
          latestJobs.slice(0, 6).map((job) => getJob(job.id).catch(() => null))
        );

        if (cancelled) return;

        const flattenedActivities = detailResponses
          .flatMap((response) => response?.data?.events || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 14);

        setActivities(flattenedActivities);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || "Unable to load platform data");
      }
    };

    load();
    const interval = setInterval(load, 3500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const processing = jobs.filter((job) => job.status === "started").length;
    const completed = jobs.filter((job) => job.status === "completed").length;
    const deadLetter = jobs.filter((job) => job.status === "failed").length;

    return { totalJobs, processing, completed, deadLetter };
  }, [jobs]);

  const workerNameById = useMemo(() => {
    return new Map(
      workers.map((worker, index) => [worker.id, formatWorkerLabel(worker, index)])
    );
  }, [workers]);

  return (
    <div className="space-y-0">
      <Surface className="overflow-hidden rounded-[20px]">
        <div className="border-b border-[#20263a] lg:flex">
          <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Jobs" value={stats.totalJobs} />
            <StatCard label="Processing" value={stats.processing} valueClassName="text-[#ffb020]" />
            <StatCard label="Completed" value={stats.completed} valueClassName="text-[#18d18b]" />
            <StatCard label="Dead Letter" value={stats.deadLetter} valueClassName="text-[#ff5257]" />
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.2fr_0.8fr]">
          <section className="border-r border-[#20263a]">
            <div className="flex items-center justify-between border-b border-[#20263a] px-7 py-5">
              <h3 className="text-[20px] font-medium text-slate-200">Recent jobs</h3>
              <span className="text-[14px] text-slate-500">last 100</span>
            </div>

            <div className="hidden grid-cols-[1.45fr_0.85fr_0.85fr] border-b border-[#20263a] px-7 py-4 text-[12px] uppercase tracking-[0.24em] text-slate-500 md:grid">
              <span>Job ID</span>
              <span>Status</span>
              <span>Worker</span>
            </div>

            <div>
              {jobs.slice(0, 7).map((job) => (
                <Link
                  key={job.id}
                  to={`/job/${job.id}`}
                  className="grid gap-3 border-b border-[#1b2233] px-7 py-4 transition hover:bg-[#131925] md:grid-cols-[1.45fr_0.85fr_0.85fr] md:items-center"
                >
                  <div>
                    <p className="break-all text-[19px] font-medium tracking-[-0.02em] text-slate-200">
                      {job.id}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.28em] text-slate-600">
                      {job.type ? job.type.replaceAll("_", " ") : "video task"}
                    </p>
                  </div>
                  <div>
                    <StatusBadge status={job.status === "started" ? "processing" : job.status} />
                  </div>
                  <div className="break-all text-[15px] text-slate-500">
                    {workerNameById.get(job.worker_id) || job.worker_id || "-"}
                  </div>
                </Link>
              ))}
              {!jobs.length ? <div className="px-8 py-10 text-slate-500">No jobs yet.</div> : null}
            </div>
          </section>

          <section>
            <div className="border-b border-[#20263a] px-7 py-5">
              <h3 className="text-[20px] font-medium text-slate-200">Live activity</h3>
            </div>

            <div className="max-h-[700px] overflow-auto px-6 py-4">
              <div className="space-y-5">
                {activities.length ? (
                  activities.map((activity, index) => (
                    <div key={`${activity.job_id}-${activity.created_at}-${index}`} className="text-[14px] leading-8">
                      <span className="mr-3 text-slate-600">{formatCompactTime(activity.created_at)}</span>
                      <span className="mr-2 text-[#4d8dff]">
                        {workerNameById.get(activity.worker_id) || "system"}
                      </span>
                      <span className={activityColor(activity.event, activity.message)}>
                        {formatActivityText(activity.event, activity.message, activity.job_id)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">No live activity yet.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </Surface>

      {error ? <div className="mt-6 text-sm text-[#ff7b7f]">{error}</div> : null}
    </div>
  );
}

function formatCompactTime(value) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function activityColor(event, message) {
  const normalized = `${event} ${message}`.toLowerCase();
  if (normalized.includes("complete")) return "text-[#18d18b]";
  if (normalized.includes("retry")) return "text-[#ffb020]";
  if (normalized.includes("fail")) return "text-[#ff5257]";
  return "text-slate-500";
}

function formatActivityText(event, message, jobId) {
  const shortJobId = jobId ? String(jobId).slice(0, 6) : "job";
  const normalizedEvent = String(event || "").toLowerCase();
  const normalizedMessage = String(message || "").toLowerCase();

  if (normalizedEvent.includes("retry")) {
    return `retry ${message || shortJobId}`;
  }
  if (normalizedEvent.includes("complete")) {
    return `completed ${shortJobId}`;
  }
  if (normalizedEvent.includes("start")) {
    return `picked ${shortJobId}`;
  }
  if (normalizedMessage.includes("queued")) {
    return `queued new job ${shortJobId}`;
  }
  return `${event || "event"} ${shortJobId}`;
}
