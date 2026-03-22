const { Pool } = require("pg");

const pool = new Pool({
    user:     "admin",
    host:     "postgres",
    database: "taskqueue",
    password: "password",
    port:     5432,
});

pool.on("connect", () => console.log("✅ Connected to Postgres"));
pool.on("error",   (err) => console.error("❌ Postgres Error:", err));

module.exports = pool;