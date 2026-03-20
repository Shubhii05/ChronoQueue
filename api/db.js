const { Pool } = require("pg");  
// import Pool class from 'pg' (node-postgres library) allows to reuse connections

const pool = new Pool({
    user: "admin",        // postgres username
    host: "postgres",     // docker service name (not localhost!)
    database: "taskqueue",// database name
    password: "password", // postgres password
    port: 5432,           // default postgres port
});

// fires when a new connection is made
pool.on("connect", () => {
    console.log("✅ Connected to Postgres");
});

// fires if connection drops or errors
pool.on("error", (err) => {
    console.error("❌ Postgres Error:", err);
});

module.exports = pool;  
// export so other files can use it