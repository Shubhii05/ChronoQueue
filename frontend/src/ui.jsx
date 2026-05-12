import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { fetchWorkers } from "./dashboardApi";
import { formatWorkerLabel, isManagedWorker } from "./formatters";

const MotionSection = motion.section;
const MotionButton = motion.button;
const MotionSpan = motion.span;
const MotionDiv = motion.div;

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", shortLabel: "Home", dotClass: "bg-[#3B82F6]" },
  { to: "/upload", label: "Upload", shortLabel: "Upload", dotClass: "bg-[#64748B]", hideOnMobile: true },
  { to: "/videos", label: "My Videos", shortLabel: "Videos", dotClass: "bg-[#14B8A6]" },
  {
    to: "/jobs",
    label: "Job Status",
    shortLabel: "Jobs",
    dotClass: "bg-[#F59E0B]",
    jobsSection: true,
  },
  { to: "/dead-letter", label: "Dead Letter", shortLabel: "Dead", dotClass: "bg-[#EF4444]" },
];

function isNavActive(pathname, item) {
  if (item.jobsSection) {
    return pathname === "/jobs" || pathname.startsWith("/job/");
  }
  if (item.to === "/") return pathname === "/";
  return pathname === item.to;
}

export function AppShell({ children }) {
  const location = useLocation();
  const [workers, setWorkers] = useState([]);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const timer = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWorkers = async () => {
      try {
        const response = await fetchWorkers();
        if (!cancelled) setWorkers(response.data);
      } catch {
        if (!cancelled) setWorkers([]);
      }
    };

    loadWorkers();
    const interval = setInterval(loadWorkers, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const pageTitle =
    location.pathname === "/upload"
      ? "Upload video"
      : location.pathname === "/videos"
        ? "My Videos"
      : location.pathname === "/jobs"
        ? "Job Status"
        : location.pathname === "/dead-letter"
          ? "Dead Letter"
      : location.pathname.startsWith("/job/")
        ? "Job Status"
        : "Dashboard";
  const visibleWorkers = Array.from(
    new Map(
      workers
        .filter((worker) => isManagedWorker(worker))
        .sort(
          (left, right) =>
            Number(right.status === "alive") - Number(left.status === "alive") ||
            new Date(right.last_heartbeat || 0).getTime() -
            new Date(left.last_heartbeat || 0).getTime()
        )
        .map((worker, index) => [formatWorkerLabel(worker, index), worker])
    ).values()
  ).slice(0, 4);

  return (
    <div className="min-h-screen bg-[#090b11] p-0 text-slate-100 lg:p-3">
      <div className="mx-auto flex min-h-screen max-w-[1620px] overflow-hidden rounded-none border border-[#20263a] bg-[#0f1219] lg:min-h-[calc(100vh-1.5rem)] lg:rounded-[24px]">
        <aside className="hidden w-[250px] shrink-0 border-r border-[#20263a] lg:flex lg:flex-col">
          <div className="border-b border-[#20263a] px-7 py-8">
            <h1 className="font-['Space_Grotesk'] text-[1.75rem] font-semibold tracking-[-0.05em] text-white">
              ChronoQueue
            </h1>
            <p className="mt-1 text-[14px] text-slate-500">distributed task queue</p>
          </div>

          <div className="flex flex-1 flex-col justify-between px-0 py-0">
            <div className="px-0 py-4">
              {NAV_ITEMS.map((item) => (
                <SidebarEntry key={item.to} item={item} />
              ))}
            </div>

            <div className="border-t border-[#20263a] px-7 py-6">
              <p className="mb-5 text-xs uppercase tracking-[0.3em] text-slate-500">Workers</p>
              <div className="space-y-4">
                {visibleWorkers.map((worker, index) => (
                  <div key={`${worker.id}-${index}`} className="flex items-center justify-between text-[14px] text-slate-400">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full ${
                          worker.status === "alive" ? "bg-[#18d18b]" : "bg-[#ff5257]"
                        }`}
                      />
                      <span>{formatWorkerLabel(worker, index)}</span>
                    </div>
                    <span className="text-slate-500">{worker.jobs_processed ?? 0}</span>
                  </div>
                ))}
                {!visibleWorkers.length ? <p className="text-sm text-slate-600">No worker history yet.</p> : null}
              </div>
            </div>

            <div className="border-t border-[#20263a] px-7 py-6 text-sm text-slate-600">
              <p>postgres Â· redis</p>
              <p className="mt-1">{workers.filter((worker) => worker.status === "alive" && isManagedWorker(worker)).length} alive</p>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col lg:min-h-[calc(100vh-1.5rem)]">
          <header className="flex min-h-[80px] items-center justify-between border-b border-[#20263a] px-6 lg:px-7">
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.04em] text-white">{pageTitle}</h2>
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-2 rounded-full border border-[#0b654a] bg-[#062d22] px-4 py-2 text-[14px] text-[#18d18b]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#18d18b]" />
                Live
              </div>
              <div className="hidden text-[14px] text-slate-500 sm:block">{clock}</div>
            </div>
          </header>

          <main className="flex-1 p-5 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:p-6 lg:pb-6">
            {children}
          </main>
        </div>
      </div>
      {/* Outside overflow-hidden so mobile browsers don't clip position:fixed */}
      <MobileBottomNav />
    </div>
  );
}

function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-[200] border-t border-[#20263a] bg-[#0f1219]/98 pb-[env(safe-area-inset-bottom,0px)] pt-1 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-[#0f1219]/90 lg:hidden"
    >
      <div className="mx-auto flex max-w-[1620px] justify-between gap-0.5 px-1">
        {NAV_ITEMS.filter((item) => !item.hideOnMobile).map((item) => {
          const active = isNavActive(pathname, item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2.5 transition active:opacity-90"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full transition ${item.dotClass} ${
                  active ? "opacity-100 ring-2 ring-white/25" : "opacity-35"
                }`}
              />
              <span
                className={`max-w-full truncate px-0.5 text-center text-[10px] font-medium leading-tight tracking-tight sm:text-[11px] ${
                  active ? "text-slate-100" : "text-slate-500"
                }`}
              >
                {item.shortLabel}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function SidebarEntry({ item }) {
  const { pathname } = useLocation();
  const active = isNavActive(pathname, item);

  return (
    <NavLink to={item.to} end={item.to === "/"} className="block">
      <div
        className={`flex items-center gap-4 px-7 py-5 text-[17px] transition ${
          active
            ? "bg-[#1a2031] text-slate-100 shadow-[inset_3px_0_0_0_#4d8dff]"
            : "text-slate-500 hover:bg-[#151a26] hover:text-slate-300"
        }`}
      >
        <span className={`h-3 w-3 rounded-full ${item.dotClass}`} />
        <span>{item.label}</span>
      </div>
    </NavLink>
  );
}

export function Surface({ className = "", children, ...props }) {
  return (
    <MotionSection
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`border border-[#20263a] bg-[#11141c] ${className}`.trim()}
      {...props}
    >
      {children}
    </MotionSection>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="mb-3 text-xs uppercase tracking-[0.34em] text-slate-500">{eyebrow}</p> : null}
        <h2 className="font-['Space_Grotesk'] text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-4 max-w-2xl text-base leading-8 text-slate-400">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Button({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary: "bg-[#151925] text-white hover:bg-[#1a2031]",
    ghost: "border border-[#3a4258] bg-transparent text-slate-100 hover:bg-[#171b27]",
  };

  return (
    <MotionButton
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      className={`inline-flex items-center justify-center rounded-[18px] px-5 py-3 text-[13px] font-medium transition ${variants[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </MotionButton>
  );
}

const STATUS_STYLES = {
  queued: "text-[#70789c] bg-[#232844] border-[#232844]",
  started: "text-[#ffb020] bg-[#2b1d06] border-[#6b3b00]",
  processing: "text-[#ffb020] bg-[#2b1d06] border-[#6b3b00]",
  completed: "text-[#18d18b] bg-[#0a2c1d] border-[#0f5c3a]",
  failed: "text-[#ff5257] bg-[#2b0a10] border-[#5b1019]",
  alive: "text-[#18d18b] bg-[#0a2c1d] border-[#0f5c3a]",
  dead: "text-[#ff5257] bg-[#2b0a10] border-[#5b1019]",
};

export function StatusBadge({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[14px] font-medium capitalize ${STATUS_STYLES[normalized] || "border-[#2b3246] bg-[#171b27] text-slate-300"}`}>
      <MotionSpan
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        className="h-2 w-2 rounded-full bg-current"
      />
      {normalized}
    </span>
  );
}

export function StatCard({ label, value, valueClassName = "text-white" }) {
  return (
    <MotionDiv
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-r border-[#20263a] px-5 py-5 even:border-r-0 xl:border-b-0 xl:border-r xl:px-7 xl:py-6 xl:last:border-r-0"
    >
      <p className="text-[13px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <div className={`mt-4 text-[36px] font-medium leading-none tracking-[-0.06em] sm:text-[44px] ${valueClassName}`.trim()}>
        <AnimatedNumber value={value} />
      </div>
    </MotionDiv>
  );
}

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  const previousValueRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const from = previousValueRef.current;
    const duration = 650;

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      previousValueRef.current = value;
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span>{display}</span>;
}

export function ProgressBar({ value }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#1d2334]">
      <MotionDiv
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="h-full rounded-full bg-[#4d8dff]"
      />
    </div>
  );
}

export function EventIcon({ event }) {
  const normalized = String(event || "").toLowerCase();

  if (normalized.includes("complete")) {
    return <span className="mt-1 h-3 w-3 rounded-full bg-[#18d18b]" />;
  }

  if (normalized.includes("start") || normalized.includes("process")) {
    return <span className="mt-1 h-3 w-3 rounded-full bg-[#4d8dff]" />;
  }

  if (normalized.includes("retry")) {
    return <span className="mt-1 h-3 w-3 rounded-full bg-[#ffb020]" />;
  }

  return <span className="mt-1 h-3 w-3 rounded-full bg-[#70789c]" />;
}

function formatClock(date) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
