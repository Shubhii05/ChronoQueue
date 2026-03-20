-- 🔥 Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================
-- 👷 WORKERS TABLE
-- =========================
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) NOT NULL,                -- worker-1
    status VARCHAR(20) DEFAULT 'idle',
    last_heartbeat TIMESTAMP,
    jobs_processed INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- 📦 JOB STATUS ENUM
-- =========================
CREATE TYPE job_status AS ENUM (
    'queued',
    'started',
    'completed',
    'failed',
    'retrying',
    'dead'
);

-- =========================
-- 📄 JOBS TABLE
-- =========================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 🔑 Idempotency
    idempotency_key VARCHAR(255) UNIQUE,

    -- 📌 Core job data
    type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    priority INT DEFAULT 5,

    -- 📊 Status tracking
    status job_status DEFAULT 'queued',

    -- 👷 Worker reference
    worker_id UUID REFERENCES workers(id),

    -- 🔁 Retry system
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    error_message TEXT,

    -- ⏱ Scheduling
    scheduled_at TIMESTAMP DEFAULT NOW(),

    -- 🔒 Locking (prevent duplicate execution)
    locked_at TIMESTAMP,
    lock_expires_at TIMESTAMP,

    -- ☠️ Dead Letter Queue flag
    is_dead_letter BOOLEAN DEFAULT FALSE,

    -- 📅 Lifecycle timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    last_attempt_at TIMESTAMP
);

-- =========================
-- 🧾 JOB EVENTS (LOGGING)
-- =========================
CREATE TABLE job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id),
    worker_id UUID REFERENCES workers(id),
    event VARCHAR(50) NOT NULL,
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- ⚡ INDEXES (PERFORMANCE)
-- =========================
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled_at ON jobs(scheduled_at);
CREATE INDEX idx_jobs_worker_id ON jobs(worker_id);
CREATE INDEX idx_job_events_job_id ON job_events(job_id);