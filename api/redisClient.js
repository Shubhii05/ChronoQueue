// redisClient.js

const { createClient } = require("redis");

const client = createClient({
    url: "redis://redis:6379"   // docker service name
});

client.on("error", (err) => {
    console.error("❌ Redis Error:", err);
});

client.on("connect", () => {
    console.log("✅ Connected to Redis");
});

(async () => {
    await client.connect();
})();

module.exports = client;