const express = require("express");         //require---> to import modules in node.js 
                                            //express---> a web framework for Node.js used to build APIs and servers.
const cors = require("cors");               //cross-origin resource sharing

const app = express();                      //express is a function that creates express application
const jobsRoute = require("./routes/jobs");

app.use(cors());
app.use(express.json());                    //converting it into js notation

app.use("/jobs", jobsRoute);                //(path,router)

app.get("/health", (req, res) => {                                  //api endpoint
    res.json({ status: "Server is running" });
});

app.listen(5000, () => {                                         //to run the server
    console.log("API server running on port 5000");
});