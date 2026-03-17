const express = require("express");
const router = express.Router();
const redis = require("../redisClient");
const { v4: uuidv4 } = require("uuid");

router.post("/", async (req, res) => {

  const jobId = uuidv4();
  const { type, payload, priority } = req.body;

  const job = {
    id: jobId,
    type,
    payload
  };

  await redis.zAdd("job_queue", [
    { score: priority || 5, value: JSON.stringify(job) }
  ]);

  res.json({
    message: "Job queued",
    jobId: jobId
  });

});

module.exports = router;