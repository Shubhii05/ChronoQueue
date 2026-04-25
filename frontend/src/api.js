import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000",
});

export const getJobIdFromResponse = (data) => {
  return data?.id || data?.job_id || data?.job?.id || null;
};

export const uploadVideo = (file) => {
  const formData = new FormData();
  formData.append("video", file);

  return API.post("/jobs/upload", formData);
};

export const getVideos = () => {
  return API.get("/jobs/videos");
};

export const getJob = (id) => {
  return API.get(`/jobs/${id}`);
};
