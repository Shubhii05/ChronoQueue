const os = require("os");

const db = require("./db");
const redis = require("./redisClient");

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_MS || 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWorkerName() {
  if (process.env.WORKER_NAME) return process.env.WORKER_NAME;
  return "chronoqueue-worker-1";
}

function getSimulatedProcessingMs(type) {
  switch (type) {
    case "video_processing":
      return 3000;
    case "payment":
      return 500;
    case "email":
      return 100;
    case "notification":
      return 50;
    case "report":
      return 5000;
    default:
      return 1000;
  }
}

function getRetryDelaySeconds(attempt) {
  const baseDelay = Math.min(2 ** attempt * 2, 30);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.max(1, Math.floor(baseDelay * jitter));
}

async function updateVideoStatus(jobId, status) {
  await db.query(
    `UPDATE videos
     SET status = $2, updated_at = NOW()
     WHERE job_id = $1`,
    [jobId, status]
  );
}

async function registerWorker(workerName) {
  const result = await db.query(
    `INSERT INTO workers (name, status, last_heartbeat)
     VALUES ($1, 'alive', NOW())
     RETURNING id`,
    [workerName]
  );

  return result.rows[0].id;
}

async function heartbeat(workerId) {
  await db.query(
    `UPDATE workers
     SET status = 'alive', last_heartbeat = NOW()
     WHERE id = $1`,
    [workerId]
  );
}

async function popNextJobId() {
  const reply = await redis.sendCommand(["ZPOPMIN", "job_queue", "1"]);

  if (!Array.isArray(reply) || reply.length < 2) return null;
  return reply[0];
}

async function markJobStarted(workerId, jobId) {
  const result = await db.query(
    `UPDATE jobs
     SET status = 'started',
         worker_id = $1,
         started_at = NOW(),
         last_attempt_at = NOW(),
         error_message = NULL
     WHERE id = $2
       AND status IN ('queued', 'retrying')
     RETURNING id, type, retry_count, max_retries`,
    [workerId, jobId]
  );

  if (result.rows.length === 0) return null;

  await db.query(
    "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'STARTED', $2)",
    [jobId, `Started by embedded API worker ${workerId}`]
  );

  return result.rows[0];
}

async function markJobCompleted(workerId, jobId) {
  await db.query(
    `UPDATE jobs
     SET status = 'completed',
         completed_at = NOW()
     WHERE id = $1`,
    [jobId]
  );

  await db.query(
    `UPDATE workers
     SET jobs_processed = jobs_processed + 1,
         last_heartbeat = NOW()
     WHERE id = $1`,
    [workerId]
  );

  await db.query(
    "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'COMPLETED', 'Job completed successfully')",
    [jobId]
  );

  await updateVideoStatus(jobId, "completed");
}

async function retryJob(job, error) {
  const nextRetryCount = Number(job.retry_count || 0) + 1;
  const maxRetries = Number(job.max_retries || 0);

  if (nextRetryCount >= maxRetries) {
    await db.query(
      `UPDATE jobs
       SET status = 'dead',
           is_dead_letter = TRUE,
           retry_count = $2,
           error_message = $3
       WHERE id = $1`,
      [job.id, nextRetryCount, error.message]
    );

    await db.query(
      `INSERT INTO dead_letter_jobs (id, original_job_id, payload, error_message)
       SELECT id, id, payload, $2
       FROM jobs
       WHERE id = $1
       ON CONFLICT (id) DO UPDATE
       SET error_message = EXCLUDED.error_message,
           failed_at = NOW()`,
      [job.id, error.message]
    );

    await db.query(
      "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'DEAD', $2)",
      [job.id, `Moved to dead letter queue: ${error.message}`]
    );

    await updateVideoStatus(job.id, "failed");
    return;
  }

  const delaySeconds = getRetryDelaySeconds(nextRetryCount);
  const nextScore = Math.floor(Date.now() / 1000) + delaySeconds;

  await db.query(
    `UPDATE jobs
     SET status = 'retrying',
         retry_count = $2,
         error_message = $3,
         scheduled_at = NOW() + ($4 || ' seconds')::interval
     WHERE id = $1`,
    [job.id, nextRetryCount, error.message, delaySeconds]
  );

  await db.query(
    "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'RETRY', $2)",
    [job.id, `Retry ${nextRetryCount}/${maxRetries} in ${delaySeconds}s: ${error.message}`]
  );

  await redis.zAdd("job_queue", [{ score: nextScore, value: job.id }]);
  await updateVideoStatus(job.id, "queued");
}

async function processJob(workerId, job) {
  await sleep(getSimulatedProcessingMs(job.type));
  await markJobCompleted(workerId, job.id);
  console.log(`Processed job ${job.id} (${job.type})`);
}

function startWorkerLoop() {
  const workerName = getWorkerName();
  let workerId = null;
  let stopped = false;
  let running = false;

  const stop = async () => {
    stopped = true;

    if (workerId) {
      try {
        await db.query(
          `UPDATE workers
           SET status = 'dead', last_heartbeat = NOW()
           WHERE id = $1`,
          [workerId]
        );
      } catch (err) {
        console.error("Worker shutdown error:", err.message);
      }
    }
  };

  const loop = async () => {
    if (stopped || running || !workerId) return;
    running = true;

    try {
      const jobId = await popNextJobId();
      if (!jobId) return;

      const job = await markJobStarted(workerId, jobId);
      if (!job) return;

      try {
        await processJob(workerId, job);
      } catch (err) {
        await retryJob(job, err);
      }
    } catch (err) {
      console.error("Embedded worker loop error:", err.message);
    } finally {
      running = false;
    }
  };

  (async () => {
    try {
      workerId = await registerWorker(workerName);
      console.log(`Embedded worker started as ${workerName} (${workerId})`);
      await heartbeat(workerId);
      setInterval(() => heartbeat(workerId).catch((err) => {
        console.error("Worker heartbeat error:", err.message);
      }), HEARTBEAT_INTERVAL_MS);
      setInterval(() => loop().catch((err) => {
        console.error("Worker interval error:", err.message);
      }), POLL_INTERVAL_MS);
    } catch (err) {
      console.error("Failed to start embedded worker:", err.message);
    }
  })();

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

module.exports = {
  startWorkerLoop
};
