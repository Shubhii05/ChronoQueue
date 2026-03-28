const { createClient } = require("redis");

const client = createClient({      //client can iteract with server
    url: "redis://redis:6379",
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 200, 3000)
    }
});

client.on("error",        (err) => console.error("❌ Redis Error:", err.message));
client.on("connect",      ()    => console.log("✅ Connected to Redis"));
client.on("reconnecting", ()    => console.log("🔄 Redis reconnecting..."));

(async () => { await client.connect(); })();//async lets you write asynchronous code, and await pauses execution until a task (like DB connection) finishes.

module.exports = client;