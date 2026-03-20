// routes/jobs.js

const express = require("express");
const router = express.Router();

const db = require("../db");
const redis = require("../redisClient");

// 🧱 CREATE JOB (PHASE 1 CORRECT VERSION)
router.post("/", async (req, res) => {
    try {
        const { type, payload, idempotency_key, priority = 5 } = req.body;

        if (!type || !payload || !idempotency_key) {
            return res.status(400).json({
                error: "type, payload, idempotency_key are required"
            });
        }

        // 🔑 1. IDEMPOTENCY CHECK it ignores duplicate
        const existing = await db.query(
            "SELECT * FROM jobs WHERE idempotency_key = $1",
            [idempotency_key]
        );

        if (existing.rows.length > 0) {
            return res.json({
                message: "Job already exists (idempotent)",
                job: existing.rows[0]
            });
        }

        // 📄 2. INSERT JOB
        const result = await db.query(
            `INSERT INTO jobs (type, payload, priority, idempotency_key)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [type, payload, priority, idempotency_key]
        );

        const job = result.rows[0];

        // 🔁 3. PUSH TO REDIS (IMPORTANT)
        const score = Math.floor(Date.now() / 1000);  // current time

        await redis.zAdd("job_queue", [
            {
                score: score,
                value: job.id   // 🔥 ONLY job_id goes to Redis
            }
        ]);

        // 🧾 4. LOG EVENT
        await db.query(
            `INSERT INTO job_events (job_id, event, message)
             VALUES ($1, 'CREATED', 'Job created and queued')`,
            [job.id]
        );

        return res.json({
            message: "Job created successfully",
            job
        });

    } catch (err) {
        console.error("❌ Job creation error:", err);
        return res.status(500).json({
            error: "Internal server error"
        });
    }
});


// 📊 GET ALL JOBS
router.get("/", async (req, res) => {
    try {
        const jobs = await db.query("SELECT * FROM jobs ORDER BY created_at DESC");
        res.json(jobs.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});


// 🔍 GET JOB BY ID
router.get("/:id", async (req, res) => {
    try {
        const job = await db.query(
            "SELECT * FROM jobs WHERE id = $1",
            [req.params.id]
        );

        if (job.rows.length === 0) {
            return res.status(404).json({ error: "Job not found" });
        }

        res.json(job.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching job" });
    }
});


module.exports = router;