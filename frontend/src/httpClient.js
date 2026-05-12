import axios from "axios";

const LOCAL_API_BASE_URL = "http://localhost:5000";
const PRODUCTION_API_BASE_URL = "https://chronoqueue-api.onrender.com";

function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) return configuredBaseUrl;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return LOCAL_API_BASE_URL;
    }
  }

  return PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: "application/json",
  },
});
