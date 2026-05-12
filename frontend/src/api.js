import { httpClient } from "./httpClient";

export const getJobIdFromResponse = (data) => {
  return data?.id || data?.job_id || data?.job?.id || null;
};

export const uploadVideo = (file) => {
  const formData = new FormData();
  formData.append("video", file);

  return httpClient.post("/jobs/upload", formData);
};

export const getVideos = () => {
  return httpClient.get("/jobs/videos");
};

export const getJob = (id) => {
  return httpClient.get(`/jobs/${id}`);
};
