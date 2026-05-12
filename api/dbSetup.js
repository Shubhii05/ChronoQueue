const db = require("./db");

const schemaStatements = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
  `CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    status TEXT DEFAULT 'alive',
    last_heartbeat TIMESTAMP,
    jobs_processed INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    priority INT DEFAULT 5,
    status TEXT DEFAULT 'queued',
    worker_id UUID REFERENCES workers(id),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    error_message TEXT,
    scheduled_at TIMESTAMP DEFAULT NOW(),
    locked_at TIMESTAMP,
    lock_expires_at TIMESTAMP,
    is_dead_letter BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    last_attempt_at TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS job_events (
    id SERIAL PRIMARY KEY,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    event TEXT,
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id UUID PRIMARY KEY,
    original_job_id UUID,
    payload TEXT,
    error_message TEXT,
    failed_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID UNIQUE REFERENCES jobs(id) ON DELETE SET NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT,
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    status TEXT DEFAULT 'queued',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`,
  `ALTER TABLE workers ADD COLUMN IF NOT EXISTS name TEXT`,
  `ALTER TABLE workers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'alive'`,
  `ALTER TABLE workers ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP`,
  `ALTER TABLE workers ADD COLUMN IF NOT EXISTS jobs_processed INT DEFAULT 0`,
  `ALTER TABLE workers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS type TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payload TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority INT DEFAULT 5`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued'`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id)`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error_message TEXT`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_dead_letter BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency ON jobs(idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_retry ON jobs(retry_count)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs(worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type)`,
  `CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status)`,
  `CREATE INDEX IF NOT EXISTS idx_videos_job ON videos(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC)`
];

async function ensureDatabase() {
  const client = await db.connect();

  try {
    for (const statement of schemaStatements) {
      await client.query(statement);
    }
    console.log("Database schema is ready");
  } finally {
    client.release();
  }
}

module.exports = { ensureDatabase };
