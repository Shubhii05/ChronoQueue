import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getVideos } from "./api";
import { formatBytes, formatDateTime } from "./formatters";
import { SectionHeading, StatusBadge, Surface } from "./ui";

export default function MyVideosPage() {
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await getVideos();
        if (cancelled) return;
        setVideos(response.data || []);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || "Unable to load videos");
        setVideos([]);
      }
    };

    load();
    const interval = setInterval(load, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selectedVideo = useMemo(() => {
    return videos.find((video) => video.id === selectedId) || videos[0] || null;
  }, [selectedId, videos]);

  const totals = useMemo(() => {
    const completed = videos.filter((video) => video.status === "completed").length;
    const processing = videos.filter((video) => ["started", "processing", "queued", "retrying"].includes(video.status)).length;
    const storage = videos.reduce((sum, video) => sum + Number(video.size_bytes || 0), 0);
    return { completed, processing, storage };
  }, [videos]);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Library"
        title="My videos"
        subtitle="Every upload stored in Supabase, linked back to the queue job that owns its processing state."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Surface className="overflow-hidden rounded-[24px]">
          <div className="grid grid-cols-3 border-b border-[#20263a]">
            <Metric label="Uploaded" value={videos.length} />
            <Metric label="Processing" value={totals.processing} tone="text-[#ffb020]" />
            <Metric label="Storage" value={formatBytes(totals.storage)} tone="text-[#4d8dff]" />
          </div>

          <div className="divide-y divide-[#1b2233]">
            {videos.length ? (
              videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => setSelectedId(video.id)}
                  className={`grid w-full gap-4 px-6 py-5 text-left transition hover:bg-[#131925] md:grid-cols-[92px_1fr_auto] md:items-center ${
                    selectedVideo?.id === video.id ? "bg-[#151b29]" : ""
                  }`}
                >
                  <VideoThumb video={video} />
                  <div className="min-w-0">
                    <p className="truncate text-[18px] font-medium text-slate-100">{video.original_name}</p>
                    <p className="mt-2 truncate text-[13px] text-slate-500">{video.storage_path}</p>
                    <p className="mt-3 text-[13px] text-slate-600">
                      {formatBytes(video.size_bytes)} / {formatDateTime(video.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={video.status === "started" ? "processing" : video.status} />
                </button>
              ))
            ) : (
              <div className="px-7 py-12 text-slate-500">{error || "No videos uploaded yet."}</div>
            )}
          </div>
        </Surface>

        <Surface className="rounded-[24px] p-6">
          {selectedVideo ? (
            <div className="space-y-6">
              <div className="overflow-hidden rounded-[22px] border border-[#20263a] bg-black">
                {selectedVideo.public_url ? (
                  <video
                    key={selectedVideo.public_url}
                    className="aspect-video w-full bg-black object-contain"
                    src={selectedVideo.public_url}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-[#0b0f18] text-slate-600">
                    Preview unavailable
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Selected asset</p>
                <h3 className="mt-3 break-words font-['Space_Grotesk'] text-3xl font-semibold tracking-[-0.05em] text-white">
                  {selectedVideo.original_name}
                </h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Detail label="Bucket" value={selectedVideo.storage_bucket} />
                <Detail label="File size" value={formatBytes(selectedVideo.size_bytes)} />
                <Detail label="Created" value={formatDateTime(selectedVideo.created_at)} />
                <Detail label="Completed" value={formatDateTime(selectedVideo.completed_at)} />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  to={`/job/${selectedVideo.job_id}`}
                  className="inline-flex items-center justify-center rounded-[18px] border border-[#3a4258] px-5 py-3 text-[14px] font-medium text-slate-100 transition hover:bg-[#171b27]"
                >
                  Open job
                </Link>
                {selectedVideo.public_url ? (
                  <a
                    href={selectedVideo.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-[18px] bg-[#151925] px-5 py-3 text-[14px] font-medium text-white transition hover:bg-[#1a2031]"
                  >
                    Open source file
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-slate-600">
              Upload a video to populate the library.
            </div>
          )}
        </Surface>
      </div>

      {error && videos.length ? <div className="text-sm text-[#ff7b7f]">{error}</div> : null}
    </div>
  );
}

function Metric({ label, value, tone = "text-white" }) {
  return (
    <div className="border-r border-[#20263a] px-6 py-5 last:border-r-0">
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-medium tracking-[-0.05em] ${tone}`}>{value}</p>
    </div>
  );
}

function VideoThumb({ video }) {
  if (video.public_url) {
    return (
      <video
        className="h-[58px] w-[92px] rounded-[14px] border border-[#20263a] bg-black object-cover"
        src={video.public_url}
        muted
        preload="metadata"
      />
    );
  }

  return (
    <div className="flex h-[58px] w-[92px] items-center justify-center rounded-[14px] border border-[#20263a] bg-[#0b0f18] text-slate-600">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
        <path d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v12.5A2.75 2.75 0 0 1 16.25 21h-8.5A2.75 2.75 0 0 1 5 18.25V5.75Zm4.2 3.37v5.76c0 .62.68 1 1.2.66l4.36-2.88a.79.79 0 0 0 0-1.32L10.4 8.46a.79.79 0 0 0-1.2.66Z" />
      </svg>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="rounded-[18px] border border-[#20263a] bg-[#0f131d] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-600">{label}</p>
      <p className="mt-3 break-words text-[15px] text-slate-300">{value || "Pending"}</p>
    </div>
  );
}
