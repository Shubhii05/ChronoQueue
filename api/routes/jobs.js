const express = require("express");
const router  = express.Router();
const db      = require("../db");
const redis   = require("../redisClient");
const multer  = require("multer");
const crypto  = require("crypto");

// 📁 File upload config (local storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: Number(process.env.MAX_UPLOAD_BYTES || 500 * 1024 * 1024)
    }
});
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "videos";

function requireSupabaseConfig() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        const missing = [
            !SUPABASE_URL ? "SUPABASE_URL" : null,
            !SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null
        ].filter(Boolean).join(", ");

        const error = new Error(`Missing Supabase config: ${missing}`);
        error.statusCode = 500;
        throw error;
    }
}

function safeFileName(name) {
    return String(name || "video")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 120);
}

function encodeStoragePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

async function uploadToSupabase(file) {
    requireSupabaseConfig();

    const today = new Date().toISOString().slice(0, 10);
    const storagePath = `uploads/${today}/${crypto.randomUUID()}-${safeFileName(file.originalname)}`;
    const encodedPath = encodeStoragePath(storagePath);
    const encodedBucket = encodeURIComponent(SUPABASE_BUCKET);

    const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${encodedBucket}/${encodedPath}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": file.mimetype || "application/octet-stream",
                "x-upsert": "false"
            },
            body: file.buffer
        }
    );

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Supabase upload failed (${response.status}): ${body}`);
    }

    return {
        bucket: SUPABASE_BUCKET,
        path: storagePath,
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${encodedBucket}/${encodedPath}`
    };
}

/**
 * 🔥 1. VIDEO UPLOAD ENDPOINT (NEW)
 * Clean UX wrapper for frontend
 */
router.post("/upload", upload.single("video"), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const storedFile = await uploadToSupabase(file);
        const payload = {
            source: "supabase",
            bucket: storedFile.bucket,
            storage_path: storedFile.path,
            public_url: storedFile.publicUrl,
            original_name: file.originalname,
            mime_type: file.mimetype,
            size_bytes: file.size
        };

        const client = await db.connect();
        let job;

        try {
            await client.query("BEGIN");

            const result = await client.query(
                `INSERT INTO jobs (type, payload, priority, idempotency_key, max_retries)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [
                    "video_processing",
                    JSON.stringify(payload),
                    5,
                    crypto.randomUUID(),
                    3
                ]
            );

            job = result.rows[0];

            await client.query(
                `INSERT INTO videos (
                    job_id,
                    original_name,
                    mime_type,
                    size_bytes,
                    storage_bucket,
                    storage_path,
                    public_url,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    job.id,
                    file.originalname,
                    file.mimetype,
                    file.size,
                    storedFile.bucket,
                    storedFile.path,
                    storedFile.publicUrl,
                    "queued"
                ]
            );

            await client.query(
                "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'CREATED', $2)",
                [job.id, `Video uploaded to Supabase bucket ${storedFile.bucket}`]
            );

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

        // Push to Redis queue
        const base  = (11 - 5) * 1000;
        const now   = Math.floor(Date.now() / 1000);
        const score = base + now;

        await redis.zAdd("job_queue", [{ score, value: job.id }]);

        return res.status(202).json({
            message: "Video uploaded & job created",
            id: job.id,
            job_id: job.id,
            status: "queued",
            video: {
                original_name: file.originalname,
                size_bytes: file.size,
                storage_bucket: storedFile.bucket,
                storage_path: storedFile.path,
                public_url: storedFile.publicUrl
            }
        });

    } catch (err) {
        console.error("Upload error:", err);
        return res.status(err.statusCode || 500).json({ error: err.message || "Upload failed" });
    }
});

router.get("/videos", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                v.id,
                v.job_id,
                v.original_name,
                v.mime_type,
                v.size_bytes,
                v.storage_bucket,
                v.storage_path,
                v.public_url,
                COALESCE(j.status, v.status) AS status,
                j.created_at AS job_created_at,
                j.started_at,
                j.completed_at,
                j.error_message,
                v.created_at
            FROM videos v
            LEFT JOIN jobs j ON j.id = v.job_id
            ORDER BY v.created_at DESC
            LIMIT 100
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("Videos fetch error:", err);
        res.status(500).json({ error: "Failed to fetch videos" });
    }
});


/**
 * 🧠 2. GENERIC JOB CREATION (EXISTING)
 */
router.post("/", async (req, res) => {
    try {
        const {
            type,
            payload,
            idempotency_key,
            priority      = 5,
            max_retries   = 3,
            delay_seconds = 0
        } = req.body;

        if (!type || !payload || !idempotency_key) {
            return res.status(400).json({ error: "type, payload, idempotency_key are required" });
        }

        if (priority < 1 || priority > 10) {
            return res.status(400).json({ error: "priority must be 1-10" });
        }

        // Idempotency check
        const existing = await db.query(
            "SELECT * FROM jobs WHERE idempotency_key = $1",
            [idempotency_key]
        );

        if (existing.rows.length > 0) {
            return res.status(200).json({
                message: "Job already exists (idempotent)",
                job: existing.rows[0]
            });
        }

        // Insert job
        const result = await db.query(
            `INSERT INTO jobs (type, payload, priority, idempotency_key, max_retries)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [type, JSON.stringify(payload), priority, idempotency_key, max_retries]
        );

        const job = result.rows[0];

        // Priority score logic
        const base  = (11 - priority) * 1000;
        const now   = Math.floor(Date.now() / 1000);
        const score = base + now + delay_seconds;

        await redis.zAdd("job_queue", [{ score, value: job.id }]);

        // Event log
        await db.query(
            "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'CREATED', $2)",
            [job.id, `Queued as ${type} with priority ${priority}`]
        );

        return res.status(202).json({
            message:        "Job accepted",
            id:             job.id,
            job_id:         job.id,
            status:         "queued",
            priority_score: score
        });

    } catch (err) {
        console.error("Job creation error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});


/**
 * 📊 3. GET ALL JOBS
 */
router.get("/", async (req, res) => {
    try {
        const { status, type } = req.query;
        let query  = "SELECT * FROM jobs";
        const params = [];

        if (status && type) {
            query += " WHERE status=$1 AND type=$2";
            params.push(status, type);
        } else if (status) {
            query += " WHERE status=$1";
            params.push(status);
        } else if (type) {
            query += " WHERE type=$1";
            params.push(type);
        }

        query += " ORDER BY created_at DESC LIMIT 100";

        const jobs = await db.query(query, params);
        res.json(jobs.rows);

    } catch (err) {
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});


/**
 * 🧠 4. WORKER STATUS
 */
router.get("/workers/status", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                id,
                name,
                status,
                jobs_processed,
                last_heartbeat,
                EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::int AS seconds_since_heartbeat
            FROM workers
            ORDER BY last_heartbeat DESC
        `);

        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: "Failed to fetch workers" });
    }
});


/**
 * 🔍 5. GET JOB BY ID + EVENTS
 */
router.get("/:id", async (req, res) => {
    try {
        if (!UUID_PATTERN.test(req.params.id)) {
            return res.status(400).json({ error: "Invalid job ID" });
        }

        const job = await db.query(
            "SELECT * FROM jobs WHERE id=$1",
            [req.params.id]
        );

        if (job.rows.length === 0) {
            return res.status(404).json({ error: "Job not found" });
        }

        const events = await db.query(
            "SELECT * FROM job_events WHERE job_id=$1 ORDER BY created_at ASC",
            [req.params.id]
        );

        res.json({
            ...job.rows[0],
            events: events.rows
        });

    } catch (err) {
        res.status(500).json({ error: "Error fetching job" });
    }
});


/**
 * ☠️ 6. REAPER (DEAD WORKER RECOVERY)
 */
router.post("/reap", async (req, res) => {
    try {
        const deadWorkers = await db.query(`
            UPDATE workers SET status='dead'
            WHERE last_heartbeat < NOW() - INTERVAL '15 seconds'
            AND status = 'alive'
            RETURNING id
        `);

        const orphaned = await db.query(`
            SELECT j.id FROM jobs j
            JOIN workers w ON j.worker_id = w.id
            WHERE j.status = 'started' AND w.status = 'dead'
        `);

        for (const row of orphaned.rows) {
            await db.query(
                "UPDATE jobs SET status='queued', worker_id=NULL WHERE id=$1",
                [row.id]
            );

            await db.query(
                "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'REQUEUED', 'Requeued after worker death')",
                [row.id]
            );

            await redis.zAdd("job_queue", [
                { score: Math.floor(Date.now() / 1000), value: row.id }
            ]);
        }

        res.json({
            dead_workers: deadWorkers.rows.map(r => r.id),
            requeued_jobs: orphaned.rows.length
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
