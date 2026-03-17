const { createClient } = require("redis");       //{ destructuring }

const client = createClient({                    //creating redis client
  url: "redis://localhost:6379"
});

client.on("error", (err) => {
  console.log("Redis Error", err);
});

(async () => {                                  //supports await
  await client.connect();                       //connecting to redis
  console.log("Connected to Redis");
})();

module.exports = client;