const express = require("express");
const router  = express.Router();
const db      = require("../db");
const redis   = require("../redisClient");

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

        const existing = await db.query(
            "SELECT * FROM jobs WHERE idempotency_key = $1",
            [idempotency_key]
        );
        if (existing.rows.length > 0) {
            return res.status(200).json({ message: "Job already exists (idempotent)", job: existing.rows[0] });
        }

        const result = await db.query(
            `INSERT INTO jobs (type, payload, priority, idempotency_key, max_retries)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [type, JSON.stringify(payload), priority, idempotency_key, max_retries]
        );
        const job = result.rows[0];

        const base  = (11 - priority) * 1000;
        const now   = Math.floor(Date.now() / 1000);
        const score = base + now + delay_seconds;

        await redis.zAdd("job_queue", [{ score, value: job.id }]);

        await db.query(
            "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'CREATED', $2)",
            [job.id, `Queued as ${type} with priority ${priority}`]
        );

        return res.status(202).json({
            message:        "Job accepted",
            job_id:         job.id,
            status:         "queued",
            priority_score: score
        });

    } catch (err) {
        console.error("Job creation error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

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

router.get("/:id", async (req, res) => {
    try {
        const job = await db.query("SELECT * FROM jobs WHERE id=$1", [req.params.id]);
        if (job.rows.length === 0) return res.status(404).json({ error: "Job not found" });

        const events = await db.query(
            "SELECT * FROM job_events WHERE job_id=$1 ORDER BY created_at ASC",
            [req.params.id]
        );

        res.json({ ...job.rows[0], events: events.rows });
    } catch (err) {
        res.status(500).json({ error: "Error fetching job" });
    }
});

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
            await db.query("UPDATE jobs SET status='queued', worker_id=NULL WHERE id=$1", [row.id]);
            await db.query(
                "INSERT INTO job_events (job_id, event, message) VALUES ($1, 'REQUEUED', 'Requeued after worker death')",
                [row.id]
            );
            await redis.zAdd("job_queue", [{ score: Math.floor(Date.now() / 1000), value: row.id }]);
        }

        res.json({ dead_workers: deadWorkers.rows.map(r => r.id), requeued_jobs: orphaned.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;