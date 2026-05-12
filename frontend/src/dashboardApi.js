import { httpClient } from "./httpClient";

export const fetchJobs = (params = {}) =>
  httpClient.get("/jobs", { params });

export const fetchWorkers = () =>
  httpClient.get("/jobs/workers/status");
