import axios from "axios";
import { apiBaseUrl } from "./backend";

// Base URL for backend
export const baseURL = apiBaseUrl;

// Axios instance
export const httpClient = axios.create({
  baseURL: baseURL,
  timeout: 10000, // 10 seconds timeout

  headers: {
    "Content-Type": "application/json",
  },
});

// Optional: request interceptor (future auth token support)
httpClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Optional: response interceptor
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isCanceled =
      error.code === "ERR_CANCELED" ||
      error.code === "ECONNABORTED" ||
      error.name === "CanceledError";

    if (!isCanceled) {
      console.error("API Error:", error);
    }

    return Promise.reject(error);
  }
);
