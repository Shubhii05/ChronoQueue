import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchJobs } from "./dashboardApi";
import { formatDateTime } from "./formatters";
import { SectionHeading, StatusBadge, Surface } from "./ui";

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetchJobs();
        if (!cancelled) {
          setJobs(response.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || "Unable to load jobs");
          setJobs([]);
        }
      }
    };

    load();
    const interval = setInterval(load, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Job status"
        title="Recent jobs"
        subtitle="Open any job to inspect retries, timing, and worker activity."
      />

      <Surface className="overflow-hidden rounded-[24px]">
        <div className="grid border-b border-[#20263a] px-7 py-4 text-[12px] uppercase tracking-[0.24em] text-slate-500 md:grid-cols-[1.3fr_0.7fr_0.9fr_0.9fr]">
          <span>Job ID</span>
          <span>Status</span>
          <span>Worker</span>
          <span>Created</span>
        </div>

        <div>
          {jobs.length ? (
            jobs.map((job) => (
              <Link
                key={job.id}
                to={`/job/${job.id}`}
                className="grid gap-3 border-b border-[#1b2233] px-7 py-5 transition hover:bg-[#131925] md:grid-cols-[1.3fr_0.7fr_0.9fr_0.9fr] md:items-center"
              >
                <div>
                  <p className="break-all text-[17px] text-slate-200">{job.id}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-slate-600">
                    {job.type ? job.type.replaceAll("_", " ") : "video task"}
                  </p>
                </div>
                <StatusBadge status={job.status === "started" ? "processing" : job.status} />
                <span className="break-all text-[14px] text-slate-500">{job.worker_id || "-"}</span>
                <span className="text-[14px] text-slate-500">{formatDateTime(job.created_at)}</span>
              </Link>
            ))
          ) : (
            <div className="px-7 py-10 text-slate-500">{error || "No jobs found."}</div>
          )}
        </div>
      </Surface>

      {error && jobs.length ? <div className="text-sm text-[#ff7b7f]">{error}</div> : null}
    </div>
  );
}
