CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE workers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT,
    status          TEXT DEFAULT 'alive',
    last_heartbeat  TIMESTAMP,
    jobs_processed  INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE,
    type            TEXT NOT NULL,
    payload         TEXT NOT NULL,
    priority        INT DEFAULT 5,
    status          TEXT DEFAULT 'queued',
    worker_id       UUID REFERENCES workers(id),
    retry_count     INT DEFAULT 0,
    max_retries     INT DEFAULT 3,
    error_message   TEXT,
    scheduled_at    TIMESTAMP DEFAULT NOW(),
    locked_at       TIMESTAMP,
    lock_expires_at TIMESTAMP,
    is_dead_letter  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW(),
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    last_attempt_at TIMESTAMP
);

CREATE TABLE job_events (
    id         SERIAL PRIMARY KEY,
    job_id     UUID REFERENCES jobs(id) ON DELETE CASCADE,
    event      TEXT,
    message    TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dead_letter_jobs (
    id              UUID PRIMARY KEY,
    original_job_id UUID,
    payload         TEXT,
    error_message   TEXT,
    failed_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jobs_status       ON jobs(status);
CREATE INDEX idx_jobs_scheduled_at ON jobs(scheduled_at);
CREATE INDEX idx_jobs_retry        ON jobs(retry_count);
CREATE INDEX idx_jobs_idempotency  ON jobs(idempotency_key);
CREATE INDEX idx_jobs_worker       ON jobs(worker_id);
CREATE INDEX idx_jobs_type         ON jobs(type);
CREATE INDEX idx_workers_status    ON workers(status);