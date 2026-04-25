import axios from "axios";

const dashboardClient = axios.create({
  baseURL: "http://localhost:5000",
});

export const fetchJobs = (params = {}) => dashboardClient.get("/jobs", { params });

export const fetchWorkers = () => dashboardClient.get("/jobs/workers/status");
