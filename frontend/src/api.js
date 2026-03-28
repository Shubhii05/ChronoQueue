import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000"
});

export const uploadVideo = (file) => {
  const formData = new FormData();
  formData.append("video", file);

  return API.post("/jobs/upload", formData); // ✅ correct route
};

export const getJob = (id) => {
  return API.get(`/jobs/${id}`); // ✅ correct route
};