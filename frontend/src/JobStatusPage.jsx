import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "react-router-dom";
import { getJob } from "./api";
import { formatDateTime } from "./formatters";
import {
  EventIcon,
  ProgressBar,
  SectionHeading,
  StatusBadge,
  Surface,
} from "./ui";

const MotionDiv = motion.div;
const MotionArticle = motion.article;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_PROGRESS = {
  queued: 24,
  started: 68,
  processing: 68,
  completed: 100,
  failed: 100,
};

export default function JobStatusPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const hasValidJobId = Boolean(id) && UUID_PATTERN.test(id);

  useEffect(() => {
    if (!hasValidJobId) return;

    let cancelled = false;

    const load = async () => {
      try {
        setError("");
        const response = await getJob(id);
        if (cancelled) return;
        setJob(response.data);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || "Failed to fetch job");
      }
    };

    load();
    const interval = setInterval(load, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasValidJobId, id]);

  const progressValue = STATUS_PROGRESS[job?.status] ?? 10;
  const retries = useMemo(
    () =>
      job?.events?.filter((event) =>
        String(event.event || "").toLowerCase().includes("retry")
      ).length ?? 0,
    [job]
  );
  const payload = useMemo(() => parsePayload(job?.payload), [job?.payload]);

  if (!id) return <p className="error-banner">Missing job ID.</p>;
  if (!hasValidJobId) return <p className="error-banner">Invalid job ID.</p>;
  if (error && !job) return <p className="rounded-[22px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>;
  if (!job) return <p className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">Loading job telemetry...</p>;

  return (
    <div className="space-y-8 pb-8">
      <SectionHeading
        eyebrow="Live execution"
        title={job.id}
        subtitle="Realtime job state, retries, and timeline updates from the distributed queue."
      />

      <Surface className="p-7 sm:p-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Job identifier</p>
            <h2 className="mt-4 break-all font-['Space_Grotesk'] text-[1.65rem] font-semibold tracking-[-0.06em] text-white sm:text-[2rem]">
              {job.id}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-[15px]">
              Payload file:{" "}
              <strong className="font-medium text-slate-200">
                {payload?.original_name || payload?.storage_path || payload?.file_path || "Uploaded video payload"}
              </strong>
            </p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="mt-10 space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Realtime queue state</span>
            <span>{progressValue}%</span>
          </div>
          <ProgressBar value={progressValue} />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Created", formatDateTime(job.created_at)],
            ["Retries", retries],
            ["Current status", String(job.status || "unknown").toUpperCase()],
          ].map(([label, value], index) => (
            <MotionDiv
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className="rounded-[24px] border border-white/8 bg-white/[0.02] px-5 py-4"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
              <p className="mt-4 text-base text-white">{value}</p>
            </MotionDiv>
          ))}
        </div>
      </Surface>

      <Surface className="p-6 sm:p-7">
        <div className="mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Execution timeline</p>
            <h3 className="mt-3 text-xl font-medium text-white">Meaningful state transitions</h3>
          </div>
        </div>

        <div className="space-y-4">
          {job.events?.length ? (
            job.events.map((event, index) => (
              <MotionArticle
                key={`${event.created_at}-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className="flex flex-col gap-4 rounded-[24px] border border-white/8 bg-white/[0.02] px-5 py-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex items-start gap-4">
                  <EventIcon event={event.event} />
                  <div>
                    <h3 className="text-base text-white">{event.event}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-500">{event.message}</p>
                  </div>
                </div>
                <time className="text-sm text-slate-500">{formatDateTime(event.created_at)}</time>
              </MotionArticle>
            ))
          ) : (
            <p className="rounded-[22px] border border-dashed border-white/10 px-5 py-8 text-sm text-slate-500">
              No timeline events yet.
            </p>
          )}
        </div>
      </Surface>

      {error ? (
        <div className="rounded-[22px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return { file_path: value };
  }
}
