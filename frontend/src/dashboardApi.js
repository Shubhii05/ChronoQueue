import axios from "axios";

const dashboardClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

export const fetchJobs = (params = {}) =>
  dashboardClient.get("/jobs", { params });

export const fetchWorkers = () =>
  dashboardClient.get("/jobs/workers/status");