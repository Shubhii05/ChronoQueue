// index.js

const express = require("express");         // import express
const cors = require("cors");

const app = express();
const jobsRoute = require("./routes/jobs");

app.use(cors());
app.use(express.json());                    // parse JSON body

app.use("/jobs", jobsRoute);

// health check
app.get("/health", (req, res) => {
    res.json({ status: "Server is running" });
});

app.listen(5000, () => {
    console.log("🚀 API server running on port 5000");
});