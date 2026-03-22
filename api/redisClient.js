const { createClient } = require("redis");

const client = createClient({
    url: "redis://redis:6379",
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 200, 3000)
    }
});

client.on("error",        (err) => console.error("❌ Redis Error:", err.message));
client.on("connect",      ()    => console.log("✅ Connected to Redis"));
client.on("reconnecting", ()    => console.log("🔄 Redis reconnecting..."));

(async () => { await client.connect(); })();

module.exports = client;