import { useEffect, useMemo, useState } from "react";
import { uploadVideo, getJobIdFromResponse } from "./api";
import { fetchJobs } from "./dashboardApi";
import { useNavigate } from "react-router-dom";
import { Button, StatusBadge, Surface } from "./ui";

export default function UploadStudio() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      try {
        const response = await fetchJobs();
        if (!cancelled) setRecentJobs(response.data.slice(0, 3));
      } catch {
        if (!cancelled) setRecentJobs([]);
      }
    };

    loadJobs();
    const interval = setInterval(loadJobs, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const queueHint = useMemo(
    () =>
      file
        ? "Standard processing with automatic retries handled by the system."
        : "Upload a file to add it to the queue.",
    [file]
  );

  const handleUpload = async () => {
    if (!file || isUploading) return;

    try {
      setIsUploading(true);
      setError("");
      const response = await uploadVideo(file);
      const jobId = getJobIdFromResponse(response.data);
      if (!jobId) throw new Error("Upload succeeded but no job ID was returned");
      navigate(`/job/${jobId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_0.92fr]">
      <div className="space-y-8">
        <Surface className="rounded-[24px] p-10">
          <h3 className="text-[18px] uppercase tracking-[0.22em] text-slate-500">Video File</h3>

          <label className="mt-10 block cursor-pointer rounded-[24px] border border-dashed border-[#2b3246] bg-[#0d1017] p-10 text-center transition hover:border-[#4d8dff] hover:shadow-[0_0_30px_rgba(77,141,255,0.12)]">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setError("");
              }}
            />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#1a2031] text-[#4d8dff]">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V5" />
                <path d="m7 10 5-5 5 5" />
                <path d="M5 19a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3" />
              </svg>
            </div>
            <p className="mt-8 text-[18px] text-slate-400">Drop video here or click to browse</p>
            <p className="mt-4 text-[15px] text-slate-600">mp4 - mov - avi - mkv - webm</p>
            <p className="mt-1 text-[15px] text-slate-600">max 20MB</p>
          </label>

          {file ? (
            <div className="mt-6 flex items-center justify-between rounded-[18px] bg-[#151925] px-5 py-4 text-[15px] text-slate-300">
              <div>
                <p>{file.name}</p>
                <p className="mt-1 text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB selected</p>
              </div>
              <StatusBadge status={isUploading ? "processing" : "queued"} />
            </div>
          ) : null}
        </Surface>

        <Surface className="rounded-[24px] p-10">
          <h3 className="text-[18px] uppercase tracking-[0.22em] text-slate-500">Recent Uploads</h3>

          <div className="mt-8 space-y-6">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between border-b border-[#1d2334] pb-6 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-[18px] text-slate-400">{job.type ? job.type.replaceAll("_", " ") : "video task"}</p>
                  <p className="mt-2 text-[14px] text-slate-600">{job.id.slice(0, 12)}</p>
                </div>
                <StatusBadge status={job.status === "started" ? "processing" : job.status} />
              </div>
            ))}
            {!recentJobs.length ? <p className="text-slate-600">No recent uploads.</p> : null}
          </div>
        </Surface>
      </div>

      <Surface className="rounded-[24px] p-10">
        <h3 className="text-[18px] uppercase tracking-[0.22em] text-slate-500">Queue Summary</h3>

        <div className="mt-10 space-y-8 text-slate-400">
          <div>
            <p className="mb-4 text-[16px]">Processing mode</p>
            <div className="rounded-[14px] border border-[#2b3246] bg-[#10141d] px-5 py-4 text-[18px] text-slate-200">
              Standard queue
            </div>
          </div>

          <ConfigField
            label="Retries"
            value="Automatic"
            helpText="The system handles retries and dead-lettering internally."
          />

          <div>
            <p className="mb-4 text-[16px]">What happens next</p>
            <div className="rounded-[14px] border border-[#2b3246] bg-[#10141d] px-5 py-5">
              <p className="text-[16px] text-slate-300">{queueHint}</p>
              <p className="mt-3 text-[14px] leading-7 text-slate-500">
                Once submitted, workers pick the job, process it, and update status in realtime on the dashboard.
              </p>
            </div>
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="mt-8 w-full rounded-[18px] border border-[#3a4258] bg-transparent px-6 py-4 text-[18px] text-white hover:bg-[#171b27] disabled:opacity-50"
            variant="ghost"
          >
            {isUploading ? "Submitting..." : "Submit job"}
          </Button>

          {error ? <div className="rounded-[18px] border border-[#5b1019] bg-[#2b0a10] px-4 py-3 text-sm text-[#ff9094]">{error}</div> : null}
        </div>
      </Surface>
    </div>
  );
}

function ConfigField({ label, value, helpText }) {
  return (
    <div>
      <p className="mb-4 text-[16px]">{label}</p>
      <div className="rounded-[14px] border border-[#2b3246] bg-[#10141d] px-5 py-4">
        <p className="text-[18px] text-slate-300">{value}</p>
        {helpText ? <p className="mt-2 text-[14px] leading-7 text-slate-500">{helpText}</p> : null}
      </div>
    </div>
  );
}
