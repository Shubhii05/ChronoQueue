CREATE TABLE IF NOT EXISTS videos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID UNIQUE REFERENCES jobs(id) ON DELETE SET NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      BIGINT,
    storage_bucket  TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    public_url      TEXT,
    status          TEXT DEFAULT 'queued',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_job     ON videos(job_id);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
