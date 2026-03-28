const express = require("express");
const cors    = require("cors");
const cron    = require("node-cron");

const app       = express();
const jobsRoute = require("./routes/jobs");
const db        = require("./db");
const redis     = require("./redisClient");

app.use(cors());
app.use(express.json());
app.use("/jobs", jobsRoute);

app.get("/health", (req, res) => res.json({ status: "Server is running" }));

cron.schedule("*/30 * * * * *", async () => {
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

        if (deadWorkers.rows.length > 0) {
            console.log(`Reaped ${deadWorkers.rows.length} workers, requeued ${orphaned.rows.length} jobs`);
        }
    } catch (err) {
        console.error("Reaper error:", err.message);
    }
});

app.listen(5000, () => console.log("🚀 API server running on port 5000"));