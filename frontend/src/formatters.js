export function formatDateTime(value) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatRelativeTime(value) {
  if (!value) return "No heartbeat yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day ago`;
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / Math.pow(1024, index);

  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatWorkerLabel(worker, index = 0) {
  const name = String(worker?.name || "").trim();
  const id = String(worker?.id || "").trim();

  if (!name) return `ChronoQueue Worker ${index + 1}`;

  const workerAliases = {
    alpha: "Alpha",
    beta: "Beta",
    gamma: "Gamma",
    "chronoqueue-worker-1": "Alpha",
  }

  if (workerAliases[name]) return workerAliases[name];

  if (name.startsWith("chronoqueue-worker-")) {
    const trailingNumber = name.match(/(\d+)$/)?.[1];
    return trailingNumber
      ? `ChronoQueue Worker ${trailingNumber}`
      : "ChronoQueue Worker";
  }

  if (name.startsWith("api-worker-")) {
    return "ChronoQueue Worker (Legacy)";
  }

  if (name.includes("srv-") || name.includes("hibernate-")) {
    return "ChronoQueue Worker (Legacy)";
  }

  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isManagedWorker(worker) {
  const name = String(worker?.name || "").trim().toLowerCase();
  return name === "alpha" || name === "beta" || name === "gamma";
}
