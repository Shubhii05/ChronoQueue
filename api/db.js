const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on("connect", () => console.log("✅ Connected to Postgres"));
pool.on("error", (err) => console.error("❌ Postgres Error:", err));

module.exports = pool;